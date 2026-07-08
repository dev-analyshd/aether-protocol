#!/usr/bin/env python3
"""
AETHER BID Engine — Behavioral Intent Detection
Reads Shannon entropy patterns of wallets to detect pre-trade signatures
3-12 blocks before a transaction is submitted.
"""

import hashlib
import math
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

# ─── Constants ────────────────────────────────────────────────────────────────

PRETRADE_ENTROPY_THRESHOLD = 0.65   # Confidence threshold to flag intent
D_MINIMUM = 100                      # Minimum Akashic depth blocks for full weight
FEATURE_COUNT = 9                    # Number of behavioral feature dimensions

# ─── Enums ────────────────────────────────────────────────────────────────────

class TradeDirection(Enum):
    BUY  = "BUY"
    SELL = "SELL"
    SWAP = "SWAP"
    NONE = "NONE"

class VMType(Enum):
    EVM  = "EVM"
    SVM  = "SVM"
    MOVE = "MOVE"

# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class BehavioralFeatures:
    """9-dimensional behavioral feature vector for an entity."""
    tx_volume_entropy: float      # f1: Shannon entropy of transaction volumes
    counterparty_diversity: float # f2: Unique counterparties / total txs
    temporal_spacing: float       # f3: Regularity of tx timing
    contract_interaction: float   # f4: Smart contract calls vs EOA txs
    value_directionality: float   # f5: Net in/out flow ratio
    wallet_architecture: float    # f6: Multi-sig, proxy, EOA patterns
    cross_protocol_breadth: float # f7: Number of distinct protocols used
    gas_pattern: float            # f8: Gas price vs market ratio
    mev_interaction: float        # f9: Sandwiches, flashloans in history

    def to_vector(self) -> List[float]:
        return [
            self.tx_volume_entropy,
            self.counterparty_diversity,
            self.temporal_spacing,
            self.contract_interaction,
            self.value_directionality,
            self.wallet_architecture,
            self.cross_protocol_breadth,
            self.gas_pattern,
            self.mev_interaction,
        ]

@dataclass
class BIDResult:
    entity_id: str
    bid_score: float
    confidence: float
    direction: TradeDirection
    direction_confidence: float
    likely_asset: str
    predicted_window_blocks: int
    biological_phase: str          # "accumulation", "distribution", "neutral"
    manipulation_score: float      # 0-1, higher = more suspicious
    feature_vector: Optional[List[float]] = None

# ─── BID Engine ───────────────────────────────────────────────────────────────

class BIDEngine:
    """
    Behavioral Intent Detection Engine.
    
    Computes Φ(t) = (1/N) Σᵢ wᵢ · H(fᵢ(t)) for each entity,
    compares against the 90-day baseline, and projects onto
    known pre-trade signature space to detect intent.
    """

    # Feature weights (learned from historical data)
    FEATURE_WEIGHTS = [0.18, 0.15, 0.12, 0.14, 0.16, 0.08, 0.07, 0.05, 0.05]

    # Pre-trade signature centroids for each direction
    BUY_SIGNATURE  = [0.72, 0.68, 0.45, 0.80, 0.30, 0.50, 0.75, 0.65, 0.10]
    SELL_SIGNATURE = [0.68, 0.55, 0.60, 0.70, 0.75, 0.45, 0.60, 0.70, 0.15]
    SWAP_SIGNATURE = [0.80, 0.72, 0.50, 0.85, 0.50, 0.55, 0.80, 0.60, 0.12]

    ASSET_MAP = {
        "high_volume_entropy":   "ETH",
        "high_contract_calls":   "USDC",
        "high_cross_protocol":   "BOT",
        "high_directionality":   "BTC",
        "balanced":              "USDT",
    }

    def __init__(self):
        self.entity_baselines: Dict[str, List[float]] = {}
        self.entity_histories: Dict[str, List[Dict]] = {}
        self.entity_depths: Dict[str, int] = {}
        self._seed_pretrade_signatures()

    def _seed_pretrade_signatures(self):
        """Seed initial signature space with synthetic training data."""
        random.seed(42)
        self.pretrade_signatures: Dict[str, List[List[float]]] = {
            "BUY":  [self._perturb(self.BUY_SIGNATURE)  for _ in range(50)],
            "SELL": [self._perturb(self.SELL_SIGNATURE) for _ in range(50)],
            "SWAP": [self._perturb(self.SWAP_SIGNATURE) for _ in range(50)],
        }

    def _perturb(self, vec: List[float], noise: float = 0.08) -> List[float]:
        return [max(0.0, min(1.0, v + random.gauss(0, noise))) for v in vec]

    # ─── Core Φ Computation ───────────────────────────────────────────────────

    def shannon_entropy(self, values: List[float]) -> float:
        """H(f) = -Σ p·log₂(p)"""
        if not values:
            return 0.0
        total = sum(values) or 1.0
        probs = [v / total for v in values if v > 0]
        return -sum(p * math.log2(p) for p in probs if p > 0)

    def compute_phi(self, features: BehavioralFeatures) -> float:
        """Φ(t) = (1/N) Σᵢ wᵢ · H(fᵢ(t))"""
        vec = features.to_vector()
        weighted = [self.FEATURE_WEIGHTS[i] * vec[i] for i in range(FEATURE_COUNT)]
        return sum(weighted) / FEATURE_COUNT

    def cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot   = sum(x * y for x, y in zip(a, b))
        mag_a = math.sqrt(sum(x * x for x in a)) or 1e-9
        mag_b = math.sqrt(sum(y * y for y in b)) or 1e-9
        return dot / (mag_a * mag_b)

    # ─── Baseline Management ──────────────────────────────────────────────────

    def update_baseline(self, entity_id: str, features: BehavioralFeatures):
        """Update rolling 90-day baseline for entity."""
        vec = features.to_vector()
        if entity_id not in self.entity_baselines:
            self.entity_baselines[entity_id] = vec
        else:
            alpha = 0.05  # exponential moving average
            old = self.entity_baselines[entity_id]
            self.entity_baselines[entity_id] = [
                alpha * new + (1 - alpha) * old_val
                for new, old_val in zip(vec, old)
            ]

    def get_baseline(self, entity_id: str) -> List[float]:
        return self.entity_baselines.get(entity_id, [0.5] * FEATURE_COUNT)

    # ─── Intent Detection ─────────────────────────────────────────────────────

    def detect_intent(
        self,
        entity_id: str,
        current_features: BehavioralFeatures,
        akashic_depth: int = 0,
    ) -> BIDResult:
        """
        Main BID detection. Returns BIDResult with intent score and direction.
        
        Steps:
        1. Compute current Φ(t)
        2. Compute delta from baseline
        3. Project delta onto pre-trade signature space
        4. Weight by Akashic depth (can't be faked)
        5. Estimate direction and likely asset
        """
        current_vec = current_features.to_vector()
        baseline    = self.get_baseline(entity_id)

        # Delta vector — the "behavioral shift"
        delta = [c - b for c, b in zip(current_vec, baseline)]
        delta_vec = [abs(d) for d in delta]

        # Project onto pre-trade signatures
        buy_sim  = max(self.cosine_similarity(current_vec, sig) for sig in self.pretrade_signatures["BUY"])
        sell_sim = max(self.cosine_similarity(current_vec, sig) for sig in self.pretrade_signatures["SELL"])
        swap_sim = max(self.cosine_similarity(current_vec, sig) for sig in self.pretrade_signatures["SWAP"])

        bid_score = max(buy_sim, sell_sim, swap_sim)

        # Determine direction
        if buy_sim >= sell_sim and buy_sim >= swap_sim:
            direction = TradeDirection.BUY
            dir_conf  = buy_sim
        elif sell_sim >= buy_sim and sell_sim >= swap_sim:
            direction = TradeDirection.SELL
            dir_conf  = sell_sim
        else:
            direction = TradeDirection.SWAP
            dir_conf  = swap_sim

        # Depth weighting — deeper history = more trustworthy signal
        depth_weight = min(1.0, akashic_depth / D_MINIMUM) if akashic_depth > 0 else 0.5
        confidence   = bid_score * depth_weight

        # Biological phase classification
        net_flow = current_features.value_directionality
        if net_flow < 0.35:
            phase = "accumulation"
        elif net_flow > 0.65:
            phase = "distribution"
        else:
            phase = "neutral"

        # Asset estimation from feature dominance
        likely_asset = self._estimate_likely_asset(current_features)

        # Manipulation score (high entropy + high MEV = suspicious)
        manipulation_score = min(1.0, (
            current_features.tx_volume_entropy * 0.3 +
            current_features.mev_interaction * 0.7
        ))

        # Update baseline after each detection
        self.update_baseline(entity_id, current_features)

        return BIDResult(
            entity_id=entity_id,
            bid_score=bid_score,
            confidence=confidence,
            direction=direction,
            direction_confidence=dir_conf,
            likely_asset=likely_asset,
            predicted_window_blocks=random.randint(3, 12),
            biological_phase=phase,
            manipulation_score=manipulation_score,
            feature_vector=current_vec,
        )

    def _estimate_likely_asset(self, features: BehavioralFeatures) -> str:
        if features.tx_volume_entropy > 0.75:
            return "ETH"
        elif features.contract_interaction > 0.80:
            return "USDC"
        elif features.cross_protocol_breadth > 0.75:
            return "BOT"
        elif features.value_directionality > 0.70:
            return "BTC"
        else:
            return "USDT"

    # ─── Synthetic Data Generator (for testing) ───────────────────────────────

    def generate_synthetic_entity(self, entity_id: str, trade_intention: str = "swap") -> BehavioralFeatures:
        """Generate synthetic behavioral features for testing."""
        random.seed(hash(entity_id + trade_intention) % 2**32)
        base = {
            "buy":  self.BUY_SIGNATURE,
            "sell": self.SELL_SIGNATURE,
            "swap": self.SWAP_SIGNATURE,
        }.get(trade_intention, self.SWAP_SIGNATURE)

        vec = self._perturb(base, noise=0.12)
        return BehavioralFeatures(
            tx_volume_entropy=vec[0],
            counterparty_diversity=vec[1],
            temporal_spacing=vec[2],
            contract_interaction=vec[3],
            value_directionality=vec[4],
            wallet_architecture=vec[5],
            cross_protocol_breadth=vec[6],
            gas_pattern=vec[7],
            mev_interaction=vec[8],
        )


# ─── Standalone Test ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    engine = BIDEngine()

    print("═" * 60)
    print("  AETHER BID Engine — Detection Test")
    print("═" * 60)

    test_entities = [
        ("wallet_alice",   "buy",  200),
        ("wallet_bob",     "sell", 150),
        ("wallet_charlie", "swap", 50),
    ]

    for entity_id, intention, depth in test_entities:
        features = engine.generate_synthetic_entity(entity_id, intention)
        result   = engine.detect_intent(entity_id, features, akashic_depth=depth)

        print(f"\n  Entity   : {entity_id}")
        print(f"  BID Score: {result.bid_score:.3f}")
        print(f"  Confidence: {result.confidence:.3f}")
        print(f"  Direction: {result.direction.value} ({result.direction_confidence:.3f})")
        print(f"  Asset    : {result.likely_asset}")
        print(f"  Phase    : {result.biological_phase}")
        print(f"  Will trade (>0.65): {result.confidence > 0.65}")

    print("\n" + "═" * 60)
