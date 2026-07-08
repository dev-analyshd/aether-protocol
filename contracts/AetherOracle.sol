// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AetherOracle
 * @notice Provides coherence verification and manipulation detection for AETHER protocol.
 *         In production, this is fed by the off-chain BID engine via an authorized relayer.
 *         For testnet/demo, owner can set coherence values directly.
 */
contract AetherOracle {
    address public owner;
    address public relayer;

    struct CoherenceData {
        uint256 coherenceScore;   // 0–1000 scaled (700 = 0.70)
        uint256 threshold;        // minimum passing score (550 = 0.55)
        bool    isSafe;           // quick-check flag set by BID engine
        uint256 updatedAt;        // block number of last update
    }

    mapping(bytes32 => CoherenceData) public coherenceMap;
    mapping(bytes32 => mapping(bytes32 => bool)) public manipulationPairs;

    event CoherenceUpdated(bytes32 indexed entityId, uint256 score, bool isSafe);
    event ManipulationFlagged(bytes32 indexed entityA, bytes32 indexed entityB);

    modifier onlyOwnerOrRelayer() {
        require(msg.sender == owner || msg.sender == relayer, "Oracle: unauthorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        relayer = msg.sender;
    }

    function setRelayer(address _relayer) external {
        require(msg.sender == owner, "Oracle: not owner");
        relayer = _relayer;
    }

    /**
     * @notice Set coherence data for an entity (called by BID relayer or owner in tests)
     */
    function setCoherence(
        bytes32 entityId,
        uint256 score,
        uint256 threshold,
        bool isSafe
    ) external onlyOwnerOrRelayer {
        coherenceMap[entityId] = CoherenceData({
            coherenceScore: score,
            threshold: threshold,
            isSafe: isSafe,
            updatedAt: block.number
        });
        emit CoherenceUpdated(entityId, score, isSafe);
    }

    /**
     * @notice Flag a pair of entities as a manipulation fingerprint
     */
    function setManipulationPair(
        bytes32 entityA,
        bytes32 entityB,
        bool flagged
    ) external onlyOwnerOrRelayer {
        manipulationPairs[entityA][entityB] = flagged;
        manipulationPairs[entityB][entityA] = flagged;
        if (flagged) emit ManipulationFlagged(entityA, entityB);
    }

    /**
     * @notice Verify an entity is safe to participate in settlement
     * @return safe       Whether the entity passes coherence check
     * @return score      Current coherence score
     * @return threshold  Required threshold
     */
    function verifyExecution(bytes32 entityId)
        external
        view
        returns (bool safe, uint256 score, uint256 threshold)
    {
        CoherenceData memory d = coherenceMap[entityId];
        // If never set, default to safe with 0 score (permissive for testnet)
        if (d.updatedAt == 0) {
            return (true, 600, 550);
        }
        return (d.isSafe && d.coherenceScore >= d.threshold, d.coherenceScore, d.threshold);
    }

    /**
     * @notice Check if two entities have a manipulation fingerprint between them
     */
    function isManipulationPair(bytes32 entityA, bytes32 entityB)
        external
        view
        returns (bool)
    {
        return manipulationPairs[entityA][entityB];
    }

    /**
     * @notice Get raw coherence data for an entity
     */
    function getCoherence(bytes32 entityId)
        external
        view
        returns (uint256 score, uint256 threshold, bool isSafe, uint256 updatedAt)
    {
        CoherenceData memory d = coherenceMap[entityId];
        return (d.coherenceScore, d.threshold, d.isSafe, d.updatedAt);
    }
}
