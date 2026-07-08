// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AetherOracle.sol";

/**
 * @title AetherBDC
 * @notice Behavioral Depth Credit — on-chain behavioral history as credit score.
 *         No KYC, no collateral beyond on-chain behavior.
 *
 * Akashic Depth D(t) accumulates with each honest trade recorded by the settlement layer.
 * Credit limit scales with D(t) via tiered multipliers.
 */
contract AetherBDC {
    AetherOracle public oracle;
    address public owner;
    address public settlementContract;

    uint256 public constant D_MINIMUM = 10;         // minimum depth units for any credit
    uint256 public constant BASE_UNIT = 0.001 ether; // base credit per depth unit

    uint256 public constant INTEREST_RATE_BPS = 50; // 0.5% flat for testnet

    struct AkashicRecord {
        uint256 depth;           // Σ trades weighted by coherence
        uint256 totalVolume;     // cumulative trade volume (in wei)
        uint256 tradeCount;      // number of recorded trades
        uint256 lastTradeBlock;  // block of most recent trade
    }

    struct Loan {
        bytes32 loanId;
        bytes32 entityId;
        uint256 amount;
        uint256 interestRateBps;
        uint256 dueBlock;
        bool    repaid;
    }

    mapping(bytes32 => AkashicRecord) public records;
    mapping(bytes32 => Loan[]) public activeLoans;
    mapping(bytes32 => uint256) public totalLoaned;

    uint256 public totalProtocolLoans;

    event TradeRecorded(bytes32 indexed entityId, uint256 amount, uint256 newDepth);
    event LoanOriginated(
        bytes32 indexed loanId,
        bytes32 indexed entityId,
        uint256 amount,
        uint256 interestRateBps,
        uint256 dueBlock
    );
    event LoanRepaid(bytes32 indexed loanId, bytes32 indexed entityId, uint256 amount);

    modifier onlyOwnerOrSettlement() {
        require(
            msg.sender == owner || msg.sender == settlementContract,
            "BDC: unauthorized"
        );
        _;
    }

    constructor(address _oracle) {
        oracle = AetherOracle(_oracle);
        owner = msg.sender;
        settlementContract = msg.sender;
    }

    function setSettlementContract(address _settlement) external {
        require(msg.sender == owner, "BDC: not owner");
        settlementContract = _settlement;
    }

    /**
     * @notice Record a completed trade to build Akashic depth
     * @param entityId  Behavioral entity ID
     * @param amount    Trade size (in wei equivalent)
     */
    function recordTrade(bytes32 entityId, uint256 amount) external onlyOwnerOrSettlement {
        AkashicRecord storage rec = records[entityId];
        rec.depth += 1;
        rec.totalVolume += amount;
        rec.tradeCount += 1;
        rec.lastTradeBlock = block.number;
        emit TradeRecorded(entityId, amount, rec.depth);
    }

    /**
     * @notice Compute BDC credit limit based on Akashic depth
     */
    function computeCreditLimit(bytes32 entityId) public view returns (uint256) {
        uint256 depth = records[entityId].depth;
        if (depth < D_MINIMUM) return 0;

        uint256 multiplier;
        if (depth < 3 * D_MINIMUM) {
            multiplier = 2;      // Established
        } else if (depth < 10 * D_MINIMUM) {
            multiplier = 5;      // Mature
        } else if (depth < 50 * D_MINIMUM) {
            multiplier = 10;     // Veteran
        } else {
            multiplier = 20;     // Institutional
        }

        uint256 units = depth / D_MINIMUM;
        uint256 baseLimit = units * BASE_UNIT;
        uint256 limit = baseLimit * multiplier;

        // Subtract existing outstanding loans
        uint256 outstanding = totalLoaned[entityId];
        if (outstanding >= limit) return 0;
        return limit - outstanding;
    }

    /**
     * @notice Originate a BDC loan against behavioral depth credit
     * @param entityId       Entity borrowing
     * @param amount         Loan amount in wei
     * @param durationBlocks Loan duration in blocks
     */
    function originateLoan(
        bytes32 entityId,
        uint256 amount,
        uint256 durationBlocks
    ) external payable returns (bytes32 loanId) {
        require(msg.value == amount, "BDC: wrong collateral");

        uint256 limit = computeCreditLimit(entityId);
        require(amount <= limit, "BDC: exceeds credit limit");

        // Check coherence
        (bool safe,,) = oracle.verifyExecution(entityId);
        require(safe, "BDC: entity incoherent");

        loanId = keccak256(
            abi.encodePacked(entityId, amount, block.number, totalProtocolLoans)
        );

        Loan memory loan = Loan({
            loanId: loanId,
            entityId: entityId,
            amount: amount,
            interestRateBps: INTEREST_RATE_BPS,
            dueBlock: block.number + durationBlocks,
            repaid: false
        });

        activeLoans[entityId].push(loan);
        totalLoaned[entityId] += amount;
        totalProtocolLoans += 1;

        emit LoanOriginated(loanId, entityId, amount, INTEREST_RATE_BPS, loan.dueBlock);
    }

    /**
     * @notice Repay a loan
     */
    function repayLoan(bytes32 entityId, uint256 loanIndex) external payable {
        Loan storage loan = activeLoans[entityId][loanIndex];
        require(!loan.repaid, "BDC: already repaid");

        uint256 interest = (loan.amount * loan.interestRateBps) / 10000;
        uint256 totalDue = loan.amount + interest;
        require(msg.value >= totalDue, "BDC: insufficient repayment");

        loan.repaid = true;
        if (totalLoaned[entityId] >= loan.amount) {
            totalLoaned[entityId] -= loan.amount;
        }

        // Refund excess
        if (msg.value > totalDue) {
            payable(msg.sender).transfer(msg.value - totalDue);
        }

        emit LoanRepaid(loan.loanId, entityId, totalDue);
    }

    /**
     * @notice Get Akashic depth for an entity
     */
    function getAkashicDepth(bytes32 entityId) external view returns (uint256) {
        return records[entityId].depth;
    }

    /**
     * @notice Get all active loans for an entity
     */
    function getActiveLoans(bytes32 entityId) external view returns (Loan[] memory) {
        return activeLoans[entityId];
    }

    /**
     * @notice Get full AkashicRecord for an entity
     */
    function getRecord(bytes32 entityId) external view returns (AkashicRecord memory) {
        return records[entityId];
    }

    receive() external payable {}
}
