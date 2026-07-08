#!/usr/bin/env python3
"""
AETHER CME — Complement Matching Engine
Finds behavioral complements: wallets whose entropy patterns are
thermodynamically opposite — they want what the other has.
"""

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from ..bid_engine.bid_engine import BIDResult, BehavioralFeatures, TradeDirection, VMType

# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class ComplementMatch:
    entity_id: str
    chain_id: int
    vm_type: VMType
    complement_score: float      # 0-1, higher = better complement
    estimated_asset: str
    estimated_magnitude: float   # estimated trade size (normalized)
    temporal_alignment: float    # how close in time both want to trade
    behavioral_health: float     # coherence score
    beo_independence: float      # 0 = same entity, 1 = fully independent
    ccp_estimate: float          # Complement Certainty Premium in basis points


# ─── CME Engine ───────────────────────────────────────────────────────────────

class CMEEngine:
    """
    Complement Matching Engine.
    
    CS(A,B) = geometric_mean(
        direction_complement(A,B),
        temporal_alignment(A,B),
        magnitude_compatible(A,B),
        behavioral_health_avg(A,B),
        beo_independence(A,B)
    )
    
    Minimum thresholds:
        direction_complement  > 0.85
        temporal_alignment    > 0.80
        magnitude_compatible  > 0.85
        beo_independence      > 0.70 (low correlation = independent)
    """

    DIRECTION_THRESHOLD   = 0.85
    TEMPORAL_THRESHOLD    = 0.80
    MAGNITUDE_THRESHOLD   = 0.85
    INDEPENDENCE_THRESHOLD = 0.70
    COHERENCE_THRESHOLD   = 0.55

    CCP_BASE_BPS = 50   # 0.5% base CCP

    def __init__(self):
        # entity_id → (BIDResult, BehavioralFeatures)
        self.entity_vectors: Dict[str, Tuple[BIDResult, BehavioralFeatures]] = {}
        self.entity_chains:  Dict[str, int]     = {}
        self.entity_vms:     Dict[str, VMType]  = {}

    def index_entity(
        self,
        bid_result: BIDResult,
        features: BehavioralFeatures,
        chain_id: int = 968,
        vm_type: VMType = VMType.EVM,
    ):
        """Add or update an entity in the complement search index."""
        self.entity_vectors[bid_result.entity_id] = (bid_result, features)
        self.entity_chains[bid_result.entity_id]  = chain_id
        self.entity_vms[bid_result.entity_id]     = vm_type

    def find_complement(
        self,
        bid_result: BIDResult,
        max_results: int = 10,
        min_score: float = 0.70,
    ) -> List[ComplementMatch]:
        """
        Find the best behavioral complements for a given BID result.
        
        Returns candidates sorted by complement score (descending).
        """
        candidates: List[ComplementMatch] = []

        query_vec = bid_result.feature_vector or [0.5] * 9

        for entity_id, (other_bid, other_features) in self.entity_vectors.items():
            if entity_id == bid_result.entity_id:
                continue

            match = self._evaluate_complement(
                bid_result, query_vec,
                other_bid, other_features.to_vector(),
                entity_id
            )
            if match and match.complement_score >= min_score:
                candidates.append(match)

        # Sort by complement score
        candidates.sort(key=lambda c: c.complement_score, reverse=True)
        return candidates[:max_results]

    def _evaluate_complement(
        self,
        query_bid: BIDResult,
        query_vec: List[float],
        candidate_bid: BIDResult,
        candidate_vec: List[float],
        candidate_id: str,
    ) -> Optional[ComplementMatch]:
        """Evaluate a single candidate as a complement."""

        # 1. Direction complement check
        dir_score = self._direction_complement_score(
            query_bid.direction, candidate_bid.direction
        )
        if dir_score < self.DIRECTION_THRESHOLD:
            return None

        # 2. Temporal alignment (both want to trade at similar time)
        temporal = self._temporal_alignment(query_bid, candidate_bid)
        if temporal < self.TEMPORAL_THRESHOLD:
            return None

        # 3. Magnitude compatibility (sizes within 15%)
        magnitude = self._magnitude_compatibility(query_bid, candidate_bid)
        if magnitude < self.MAGNITUDE_THRESHOLD:
            return None

        # 4. BEO independence check (not the same entity behind different wallets)
        independence = self._beo_independence(query_vec, candidate_vec)
        if independence < self.INDEPENDENCE_THRESHOLD:
            return None

        # 5. Behavioral health (coherence)
        health = (query_bid.confidence + candidate_bid.confidence) / 2
        if health < self.COHERENCE_THRESHOLD:
            return None

        # Complement score = geometric mean of all five
        complement_score = self._geometric_mean([
            dir_score,
            temporal,
            magnitude,
            health,
            independence,
        ])

        # CCP estimate (scales with how much MEV/slippage we're preventing)
        ccp_bps = self.CCP_BASE_BPS + int(complement_score * 100)

        return ComplementMatch(
            entity_id=candidate_id,
            chain_id=self.entity_chains.get(candidate_id, 968),
            vm_type=self.entity_vms.get(candidate_id, VMType.EVM),
            complement_score=complement_score,
            estimated_asset=candidate_bid.likely_asset,
            estimated_magnitude=magnitude,
            temporal_alignment=temporal,
            behavioral_health=health,
            beo_independence=independence,
            ccp_estimate=ccp_bps / 10000,
        )

    def _direction_complement_score(
        self, direction_a: TradeDirection, direction_b: TradeDirection
    ) -> float:
        """
        Perfect complement: A wants to BUY what B wants to SELL, or vice versa.
        SWAP ↔ SWAP also qualifies (opposite assets).
        """
        complement_pairs = {
            (TradeDirection.BUY,  TradeDirection.SELL): 1.0,
            (TradeDirection.SELL, TradeDirection.BUY):  1.0,
            (TradeDirection.SWAP, TradeDirection.SWAP): 0.90,
            (TradeDirection.BUY,  TradeDirection.SWAP): 0.87,
            (TradeDirection.SELL, TradeDirection.SWAP): 0.87,
        }
        return complement_pairs.get((direction_a, direction_b), 0.0)

    def _temporal_alignment(self, a: BIDResult, b: BIDResult) -> float:
        """How close are the predicted trading windows?"""
        window_overlap = 1.0 - abs(
            a.predicted_window_blocks - b.predicted_window_blocks
        ) / max(a.predicted_window_blocks, b.predicted_window_blocks, 1)
        return max(0.0, window_overlap)

    def _magnitude_compatibility(self, a: BIDResult, b: BIDResult) -> float:
        """How well do sizes match? (within 15% = perfect)"""
        # In production: use actual estimated amounts
        # For testnet: use confidence as a proxy for trade size
        size_a = a.confidence
        size_b = b.confidence
        if size_a == 0 or size_b == 0:
            return 0.5
        ratio = min(size_a, size_b) / max(size_a, size_b)
        return ratio  # 1.0 = perfect match, <0.85 = reject

    def _beo_independence(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        BEO Independence: 1 - cosine_similarity.
        High similarity → same entity behind both wallets (sybil attack).
        We want LOW similarity (< 0.30) → HIGH independence (> 0.70).
        """
        dot   = sum(a * b for a, b in zip(vec_a, vec_b))
        mag_a = math.sqrt(sum(a * a for a in vec_a)) or 1e-9
        mag_b = math.sqrt(sum(b * b for b in vec_b)) or 1e-9
        similarity = dot / (mag_a * mag_b)
        return 1.0 - similarity  # high value = independent entities

    def _geometric_mean(self, values: List[float]) -> float:
        product = 1.0
        for v in values:
            product *= max(v, 1e-9)
        return product ** (1 / len(values))


# ─── Standalone Test ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.path.insert(0, "../..")

    from bid_engine import BIDEngine

    print("═" * 60)
    print("  AETHER CME Engine — Complement Search Test")
    print("═" * 60)

    bid_engine = BIDEngine()
    cme_engine = CMEEngine()

    # Generate 20 synthetic entities and index them
    test_wallets = [
        ("buyer_1",   "buy",  180),
        ("buyer_2",   "buy",  220),
        ("seller_1",  "sell", 150),
        ("seller_2",  "sell", 300),
        ("swapper_1", "swap", 75),
        ("swapper_2", "swap", 95),
        ("buyer_3",   "buy",  400),
        ("seller_3",  "sell", 500),
    ]

    for entity_id, intent, depth in test_wallets:
        features = bid_engine.generate_synthetic_entity(entity_id, intent)
        bid_result = bid_engine.detect_intent(entity_id, features, akashic_depth=depth)
        cme_engine.index_entity(bid_result, features)

    # Find complements for a buyer
    query_features = bid_engine.generate_synthetic_entity("query_buyer", "buy")
    query_result   = bid_engine.detect_intent("query_buyer", query_features, akashic_depth=200)
    cme_engine.index_entity(query_result, query_features)

    print(f"\n  Query: query_buyer (direction={query_result.direction.value})")
    print(f"  Searching {len(cme_engine.entity_vectors) - 1} indexed entities...\n")

    matches = cme_engine.find_complement(query_result, max_results=5, min_score=0.60)

    if not matches:
        print("  No complements found above threshold.")
    else:
        for i, m in enumerate(matches):
            print(f"  [{i+1}] {m.entity_id}")
            print(f"       Score     : {m.complement_score:.3f}")
            print(f"       Asset     : {m.estimated_asset}")
            print(f"       CCP Est   : {m.ccp_estimate*10000:.0f} bps")
            print(f"       Health    : {m.behavioral_health:.3f}")
            print(f"       Indep     : {m.beo_independence:.3f}")
            print()

    print("═" * 60)
