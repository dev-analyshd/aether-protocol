#!/usr/bin/env python3
"""
AETHER PMO System — Pre-Manifest Order Lifecycle
Manages PMO: Detection → Proposal → Commitment → Settlement.
"""

import hashlib
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class PMOState(Enum):
    PROPOSED  = "PROPOSED"
    COMMITTED = "COMMITTED"
    REVEALED  = "REVEALED"
    SETTLING  = "SETTLING"
    COMPLETE  = "COMPLETE"
    REVERTED  = "REVERTED"


@dataclass
class PMOProposal:
    pmo_id: str
    entity_a: str
    entity_b: str
    asset_in: str
    asset_out: str
    magnitude_min: float
    magnitude_max: float
    reference_price: float
    price_guarantee: float
    ccp_estimate: float
    valid_blocks: int
    privacy_mode: str
    state: PMOState
    created_at: int
    commitment_a: Optional[str] = None
    commitment_b: Optional[str] = None
    revealed_at: Optional[int] = None
    settled_at: Optional[int] = None


class PMOSystem:
    """
    Manages Pre-Manifest Order lifecycle.
    
    Phase 1: DETECTION  — automated (BID + CME engines)
    Phase 2: PROPOSAL   — user sees PMO offer
    Phase 3: COMMITMENT — ZK hash submitted
    Phase 4: ATOMIC REVEAL
    Phase 5: SETTLEMENT — coherence-gated
    Phase 6: RECORDING  — Akashic depth update
    """

    VALID_BLOCKS_DEFAULT = 100
    CCP_TRADER_SHARE     = 0.70   # 70% of savings go to traders

    def __init__(self):
        self.pmos:        Dict[str, PMOProposal] = {}
        self.commitments: Dict[str, Dict]        = {}
        self.settlements: Dict[str, Dict]        = {}

    def create_pmo(
        self,
        entity_a: str,
        entity_b: str,
        bid_result_a,
        bid_result_b,
        complement_match,
        reference_price: float,
        ccp_estimate: float,
    ) -> PMOProposal:
        """Create a PMO proposal from BID+CME match results."""
        pmo_id = hashlib.sha256(
            f"{entity_a}{entity_b}{reference_price}{time.time()}".encode()
        ).hexdigest()

        asset_in  = getattr(bid_result_a, "likely_asset", "ETH")
        asset_out = getattr(bid_result_b, "likely_asset", "USDC")
        magnitude = getattr(complement_match, "estimated_magnitude", 1.0)

        price_guarantee = reference_price * (1 + ccp_estimate * self.CCP_TRADER_SHARE)

        proposal = PMOProposal(
            pmo_id          = pmo_id,
            entity_a        = entity_a,
            entity_b        = entity_b,
            asset_in        = asset_in,
            asset_out       = asset_out,
            magnitude_min   = magnitude * 0.85,
            magnitude_max   = magnitude * 1.15,
            reference_price = reference_price,
            price_guarantee = price_guarantee,
            ccp_estimate    = ccp_estimate,
            valid_blocks    = self.VALID_BLOCKS_DEFAULT,
            privacy_mode    = "ZK_COMMITMENT",
            state           = PMOState.PROPOSED,
            created_at      = int(time.time()),
        )

        self.pmos[pmo_id] = proposal
        return proposal

    def commit(self, pmo_id: str, entity_id: str, commitment_hash: str) -> PMOState:
        """Record ZK commitment hash for an entity."""
        if pmo_id not in self.commitments:
            self.commitments[pmo_id] = {}

        self.commitments[pmo_id][entity_id] = commitment_hash

        pmo = self.pmos[pmo_id]
        if entity_id == pmo.entity_a:
            pmo.commitment_a = commitment_hash
        elif entity_id == pmo.entity_b:
            pmo.commitment_b = commitment_hash

        if pmo.commitment_a and pmo.commitment_b:
            pmo.state = PMOState.COMMITTED

        return pmo.state

    def reveal(
        self,
        pmo_id: str,
        full_intent_a: str,
        full_intent_b: str,
        nonce_a: str,
        nonce_b: str,
    ) -> None:
        """Atomic reveal of both intents — verifies commitments."""
        if pmo_id not in self.pmos:
            raise ValueError(f"PMO {pmo_id} not found")

        pmo = self.pmos[pmo_id]
        if pmo.state != PMOState.COMMITTED:
            raise ValueError(f"PMO must be COMMITTED, got {pmo.state.value}")

        # Verify commitment hashes
        expected_a = hashlib.sha256((full_intent_a + nonce_a).encode()).hexdigest()
        expected_b = hashlib.sha256((full_intent_b + nonce_b).encode()).hexdigest()

        if pmo.commitment_a and expected_a != pmo.commitment_a:
            raise ValueError("Commitment A mismatch — possible manipulation")
        if pmo.commitment_b and expected_b != pmo.commitment_b:
            raise ValueError("Commitment B mismatch — possible manipulation")

        pmo.state       = PMOState.REVEALED
        pmo.revealed_at = int(time.time())

    def settle(self, pmo_id: str) -> Dict:
        """Mark PMO as settled and compute distribution."""
        if pmo_id not in self.pmos:
            raise ValueError(f"PMO {pmo_id} not found")

        pmo = self.pmos[pmo_id]
        if pmo.state != PMOState.REVEALED:
            raise ValueError(f"PMO must be REVEALED, got {pmo.state.value}")

        pmo.state      = PMOState.COMPLETE
        pmo.settled_at = int(time.time())

        ccp_each = pmo.ccp_estimate * pmo.reference_price * self.CCP_TRADER_SHARE / 2

        result = {
            "pmo_id":     pmo_id,
            "entity_a":   pmo.entity_a,
            "entity_b":   pmo.entity_b,
            "ccp_each":   ccp_each,
            "settled_at": pmo.settled_at,
            "savings":    {
                "mev_avoided":      pmo.reference_price * 0.0025,
                "slippage_avoided": pmo.reference_price * 0.0015,
                "bridge_avoided":   0,
                "total_ccp_pool":   ccp_each * 2 / self.CCP_TRADER_SHARE,
            },
        }

        self.settlements[pmo_id] = result
        return result

    def revert(self, pmo_id: str, reason: str = "Expired") -> None:
        """Revert a PMO — escrow returned to depositors."""
        if pmo_id not in self.pmos:
            raise ValueError(f"PMO {pmo_id} not found")
        self.pmos[pmo_id].state = PMOState.REVERTED

    def get_pmo(self, pmo_id: str) -> Optional[PMOProposal]:
        return self.pmos.get(pmo_id)

    def list_active(self) -> List[PMOProposal]:
        return [
            p for p in self.pmos.values()
            if p.state in (PMOState.PROPOSED, PMOState.COMMITTED, PMOState.REVEALED)
        ]

    def stats(self) -> Dict:
        all_pmos = list(self.pmos.values())
        return {
            "total":     len(all_pmos),
            "proposed":  sum(1 for p in all_pmos if p.state == PMOState.PROPOSED),
            "committed": sum(1 for p in all_pmos if p.state == PMOState.COMMITTED),
            "revealed":  sum(1 for p in all_pmos if p.state == PMOState.REVEALED),
            "complete":  sum(1 for p in all_pmos if p.state == PMOState.COMPLETE),
            "reverted":  sum(1 for p in all_pmos if p.state == PMOState.REVERTED),
        }
