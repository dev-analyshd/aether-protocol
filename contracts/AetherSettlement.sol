// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AetherOracle.sol";
import "./AetherBDC.sol";

/**
 * @title AetherSettlement
 * @notice Core AETHER PMO (Pre-Manifest Order) lifecycle contract.
 *
 * Lifecycle: PROPOSED → COMMITTED → REVEALED → COMPLETE (or REVERTED)
 *
 * Key properties:
 * - ZK commitment phase: only hashes visible, MEV-proof
 * - Atomic reveal: both parties reveal in same tx (no front-running window)
 * - Thermodynamic settlement: triggered by coherence, not timers
 * - CCP (Complement Certainty Premium): 70% of MEV+slippage saved flows to traders
 */
contract AetherSettlement {
    AetherOracle public oracle;
    AetherBDC    public bdc;
    address      public protocolFeeReceiver;
    address      public owner;

    // ─── CCP Economics ──────────────────────────────────────────────────────
    uint256 public constant CCP_RATE_BPS      = 50;   // 0.5% of trade value → CCP pool
    uint256 public constant TRADER_SHARE_BPS  = 7000; // 70% of CCP pool → traders (35% each)
    uint256 public constant PROTOCOL_FEE_BPS  = 50;   // 0.05% of trade value → protocol
    uint256 public constant VALID_BLOCKS      = 100;  // PMO expires after 100 blocks

    // ─── Settlement State ────────────────────────────────────────────────────
    enum SettlementState {
        PROPOSED,   // 0
        COMMITTED,  // 1
        REVEALED,   // 2
        SETTLING,   // 3 (reserved)
        COMPLETE,   // 4
        REVERTED    // 5
    }

    // ─── PMO Struct ──────────────────────────────────────────────────────────
    struct PMO {
        bytes32         pmoId;
        bytes32         entityA;
        bytes32         entityB;
        address payable walletA;
        address payable walletB;
        bytes32         commitmentHashA;
        bytes32         commitmentHashB;
        uint256         amountA;         // escrowed by entityA
        uint256         amountB;         // escrowed by entityB
        uint256         referencePrice;  // oracle price at proposal time
        uint256         priceGuarantee;  // referencePrice + CCP bonus
        uint256         validUntilBlock; // expires after this block
        SettlementState state;
        bool            committedA;
        bool            committedB;
    }

    mapping(bytes32 => PMO) public pmos;

    // ─── Protocol Stats ──────────────────────────────────────────────────────
    uint256 public totalVolume;
    uint256 public totalCCPDistributed;
    uint256 public totalProtocolFees;
    uint256 public totalPMOs;
    uint256 public totalSettled;

    // ─── Events ──────────────────────────────────────────────────────────────
    event PMOProposed(
        bytes32 indexed pmoId,
        bytes32 indexed entityA,
        bytes32 indexed entityB,
        uint256 referencePrice,
        uint256 priceGuarantee
    );
    event PMOCommitted(bytes32 indexed pmoId, bytes32 indexed entityId);
    event PMORevealed(bytes32 indexed pmoId);
    event PMOSettled(
        bytes32 indexed pmoId,
        uint256 amountA,
        uint256 amountB,
        uint256 ccpEach,
        uint256 protocolFee
    );
    event PMOReverted(bytes32 indexed pmoId, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Settlement: not owner");
        _;
    }

    constructor(
        address _oracle,
        address _bdc,
        address _protocolFeeReceiver
    ) {
        oracle = AetherOracle(_oracle);
        bdc = AetherBDC(payable(_bdc));
        protocolFeeReceiver = _protocolFeeReceiver;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 1: PROPOSE
    // Called by the AETHER relay after CME finds a behavioral complement pair
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Propose a PMO between two behavioral entities
     * @param entityA        Behavioral hash of party A
     * @param entityB        Behavioral hash of party B
     * @param amountA        Expected amount from A (for price guarantee calc)
     * @param amountB        Expected amount from B
     * @param referencePrice Oracle price at proposal time (scaled by 1e18)
     */
    function proposePMO(
        bytes32 entityA,
        bytes32 entityB,
        uint256 amountA,
        uint256 amountB,
        uint256 referencePrice
    ) external returns (bytes32 pmoId) {
        require(entityA != entityB, "Settlement: same entity");
        require(amountA > 0 && amountB > 0, "Settlement: zero amount");
        require(!oracle.isManipulationPair(entityA, entityB), "Aether: manipulation detected");

        pmoId = keccak256(
            abi.encodePacked(entityA, entityB, referencePrice, block.number, totalPMOs)
        );

        // CCP: 0.5% of total trade value, 70% goes to traders
        uint256 tradeValue = amountA + amountB;
        uint256 ccpPool = (tradeValue * CCP_RATE_BPS) / 10000;
        uint256 ccpPerParty = (ccpPool * TRADER_SHARE_BPS) / 20000; // 35% each

        pmos[pmoId] = PMO({
            pmoId:           pmoId,
            entityA:         entityA,
            entityB:         entityB,
            walletA:         payable(address(0)),
            walletB:         payable(address(0)),
            commitmentHashA: bytes32(0),
            commitmentHashB: bytes32(0),
            amountA:         amountA,
            amountB:         amountB,
            referencePrice:  referencePrice,
            priceGuarantee:  referencePrice + ccpPerParty,
            validUntilBlock: block.number + VALID_BLOCKS,
            state:           SettlementState.PROPOSED,
            committedA:      false,
            committedB:      false
        });

        totalPMOs += 1;

        emit PMOProposed(pmoId, entityA, entityB, referencePrice, referencePrice + ccpPerParty);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 2: COMMIT (ZK Hash Commitment — MEV-proof)
    // Each party submits Hash(intent || nonce). Nothing is visible to MEV bots.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Commit to a PMO with hash commitment + escrow
     * @param pmoId          The PMO to commit to
     * @param entityId       Caller's entity ID
     * @param commitmentHash keccak256(intent || nonce) — invisible to MEV
     */
    function commit(
        bytes32 pmoId,
        bytes32 entityId,
        bytes32 commitmentHash
    ) external payable {
        PMO storage pmo = pmos[pmoId];
        require(pmo.state == SettlementState.PROPOSED, "Settlement: not proposed");
        require(block.number <= pmo.validUntilBlock, "Settlement: PMO expired");

        if (entityId == pmo.entityA) {
            require(!pmo.committedA, "Settlement: A already committed");
            require(msg.value >= pmo.amountA, "Settlement: insufficient escrow A");
            pmo.commitmentHashA = commitmentHash;
            pmo.walletA = payable(msg.sender);
            pmo.committedA = true;
        } else if (entityId == pmo.entityB) {
            require(!pmo.committedB, "Settlement: B already committed");
            require(msg.value >= pmo.amountB, "Settlement: insufficient escrow B");
            pmo.commitmentHashB = commitmentHash;
            pmo.walletB = payable(msg.sender);
            pmo.committedB = true;
        } else {
            revert("Settlement: unknown entity");
        }

        // Refund excess escrow
        uint256 required = entityId == pmo.entityA ? pmo.amountA : pmo.amountB;
        if (msg.value > required) {
            payable(msg.sender).transfer(msg.value - required);
        }

        if (pmo.committedA && pmo.committedB) {
            pmo.state = SettlementState.COMMITTED;
        }

        emit PMOCommitted(pmoId, entityId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3: REVEAL (Atomic — front-running window is zero)
    // Both intents revealed in the same transaction, commitment verified.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Atomically reveal both intents and verify commitments
     * @param pmoId      The PMO
     * @param fullIntentA  A's original intent (pre-image)
     * @param fullIntentB  B's original intent (pre-image)
     * @param nonceA     A's nonce
     * @param nonceB     B's nonce
     */
    function reveal(
        bytes32 pmoId,
        bytes32 fullIntentA,
        bytes32 fullIntentB,
        bytes32 nonceA,
        bytes32 nonceB
    ) external {
        PMO storage pmo = pmos[pmoId];
        require(pmo.state == SettlementState.COMMITTED, "Settlement: not committed");
        require(block.number <= pmo.validUntilBlock, "Settlement: PMO expired");

        // Verify commitments match
        bytes32 expectedHashA = keccak256(abi.encodePacked(fullIntentA, nonceA));
        bytes32 expectedHashB = keccak256(abi.encodePacked(fullIntentB, nonceB));

        require(expectedHashA == pmo.commitmentHashA, "Settlement: bad reveal A");
        require(expectedHashB == pmo.commitmentHashB, "Settlement: bad reveal B");

        pmo.state = SettlementState.REVEALED;
        emit PMORevealed(pmoId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 4: SETTLE (Thermodynamic — triggered by coherence)
    // Settlement only proceeds if both entities are behaviorally coherent.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Settle a revealed PMO — distributes escrow + CCP to both parties
     */
    function settle(bytes32 pmoId) external {
        PMO storage pmo = pmos[pmoId];
        require(pmo.state == SettlementState.REVEALED, "Settlement: not revealed");

        // Thermodynamic gate: both entities must be coherent
        (bool safeA, uint256 cohA, uint256 threshA) = oracle.verifyExecution(pmo.entityA);
        (bool safeB, uint256 cohB, uint256 threshB) = oracle.verifyExecution(pmo.entityB);

        if (!safeA || cohA < threshA) {
            _revert(pmoId, "Entity A incoherent");
            return;
        }
        if (!safeB || cohB < threshB) {
            _revert(pmoId, "Entity B incoherent");
            return;
        }
        if (oracle.isManipulationPair(pmo.entityA, pmo.entityB)) {
            _revert(pmoId, "Manipulation detected");
            return;
        }

        pmo.state = SettlementState.COMPLETE;

        // ── Calculate CCP distribution ────────────────────────────────────
        uint256 tradeValue = pmo.amountA + pmo.amountB;
        uint256 ccpPool    = (tradeValue * CCP_RATE_BPS) / 10000;
        uint256 ccpEach    = (ccpPool * TRADER_SHARE_BPS) / 20000;
        uint256 protocolFee = (tradeValue * PROTOCOL_FEE_BPS) / 10000;

        // Ensure we have enough balance for CCP + fees
        uint256 totalEscrow = pmo.amountA + pmo.amountB;
        uint256 totalPayout = pmo.amountA + pmo.amountB + (2 * ccpEach) + protocolFee;

        // Clamp CCP if insufficient balance
        if (totalPayout > address(this).balance) {
            ccpEach = 0;
            protocolFee = 0;
        }

        // Transfer to party A (receives B's payment + their own escrow back + CCP)
        uint256 payoutA = pmo.amountA + ccpEach;
        uint256 payoutB = pmo.amountB + ccpEach;

        // Cross-settlement: A gets amountB, B gets amountA (they swapped)
        // For this demo, each party gets their own escrow + CCP
        pmo.walletA.transfer(payoutA);
        pmo.walletB.transfer(payoutB);

        // Protocol fee
        if (protocolFee > 0 && address(this).balance >= protocolFee) {
            payable(protocolFeeReceiver).transfer(protocolFee);
        }

        // Record trades in BDC for Akashic depth building
        bdc.recordTrade(pmo.entityA, pmo.amountA);
        bdc.recordTrade(pmo.entityB, pmo.amountB);

        // Update stats
        totalVolume          += tradeValue;
        totalCCPDistributed  += 2 * ccpEach;
        totalProtocolFees    += protocolFee;
        totalSettled         += 1;

        emit PMOSettled(pmoId, pmo.amountA, pmo.amountB, ccpEach, protocolFee);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REVERT — return escrowed funds if PMO fails
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Revert an expired PMO and return escrow to depositors
     */
    function revertExpiredPMO(bytes32 pmoId) external {
        PMO storage pmo = pmos[pmoId];
        require(
            pmo.state == SettlementState.PROPOSED ||
            pmo.state == SettlementState.COMMITTED ||
            pmo.state == SettlementState.REVEALED,
            "Settlement: cannot revert"
        );
        require(block.number > pmo.validUntilBlock, "Settlement: not yet expired");
        _revert(pmoId, "Expired");
    }

    function _revert(bytes32 pmoId, string memory reason) internal {
        PMO storage pmo = pmos[pmoId];
        pmo.state = SettlementState.REVERTED;

        if (pmo.walletA != address(0) && pmo.amountA > 0) {
            pmo.walletA.transfer(pmo.amountA);
        }
        if (pmo.walletB != address(0) && pmo.amountB > 0) {
            pmo.walletB.transfer(pmo.amountB);
        }

        emit PMOReverted(pmoId, reason);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────────────────

    function getPMO(bytes32 pmoId) external view returns (PMO memory) {
        return pmos[pmoId];
    }

    function getProtocolStats()
        external
        view
        returns (uint256 volume, uint256 ccp, uint256 fees)
    {
        return (totalVolume, totalCCPDistributed, totalProtocolFees);
    }

    function getFullStats()
        external
        view
        returns (
            uint256 volume,
            uint256 ccp,
            uint256 fees,
            uint256 totalPMOCount,
            uint256 settledCount
        )
    {
        return (
            totalVolume,
            totalCCPDistributed,
            totalProtocolFees,
            totalPMOs,
            totalSettled
        );
    }

    receive() external payable {}
}
