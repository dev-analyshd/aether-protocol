#!/usr/bin/env python3
"""
AETHER Protocol API Server
Exposes BID, CME, and PMO engines over HTTP for the frontend and relayer.
"""

import json
import os
import sys
import time
import hashlib
import random
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engines.bid_engine.bid_engine import BIDEngine, BehavioralFeatures, TradeDirection
from engines.pmo_system.pmo_lifecycle import PMOSystem

bid_engine = BIDEngine()
pmo_system = PMOSystem()

PORT = int(os.environ.get("API_PORT", 8000))

# Seed 20 demo entities for the frontend
DEMO_ENTITIES = {}
for i, (name, intent, depth) in enumerate([
    ("alice",   "buy",  300), ("bob",    "sell", 250), ("charlie", "swap", 150),
    ("diana",   "buy",  400), ("eve",    "sell", 180), ("frank",   "swap", 90),
    ("grace",   "buy",  500), ("henry",  "sell", 220), ("iris",    "swap", 110),
    ("jack",    "buy",  350), ("kara",   "sell", 280), ("leo",     "swap", 200),
    ("maya",    "buy",  420), ("noah",   "sell", 160), ("olivia",  "swap", 75),
    ("peter",   "buy",  380), ("quinn",  "sell", 310), ("rose",    "swap", 130),
    ("sam",     "buy",  290), ("tia",    "sell", 240),
]):
    features = bid_engine.generate_synthetic_entity(name, intent)
    result   = bid_engine.detect_intent(name, features, akashic_depth=depth)
    DEMO_ENTITIES[name] = {"bid": result, "features": features, "depth": depth}


class AetherHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress default logging

    def send_json(self, data, status=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        qs     = parse_qs(parsed.query)

        if path == "/health":
            self.send_json({
                "status": "healthy",
                "engines": {"bid": "active", "cme": "active", "bdc": "active"},
                "timestamp": int(time.time()),
            })

        elif path == "/stats":
            self.send_json({
                "total_entities_indexed": len(DEMO_ENTITIES),
                "avg_complement_score":   0.78,
                "total_pmos_proposed":    len(pmo_system.pmos),
                "total_pmos_settled":     pmo_system.stats().get("complete", 0),
                "chain": {"id": 968, "name": "BOT Chain Testnet (Bohr)", "rpc": "https://rpc.bohr.life"},
            })

        elif path == "/entities":
            entities = []
            for name, data in DEMO_ENTITIES.items():
                bid = data["bid"]
                entities.append({
                    "entity_id": name,
                    "bid_score":   round(bid.bid_score, 3),
                    "confidence":  round(bid.confidence, 3),
                    "direction":   bid.direction.value,
                    "likely_asset": bid.likely_asset,
                    "phase":       bid.biological_phase,
                    "will_trade":  bid.confidence > 0.65,
                    "depth":       data["depth"],
                })
            self.send_json({"entities": entities})

        elif path.startswith("/bid/"):
            entity_id = path.split("/bid/")[1]
            if entity_id in DEMO_ENTITIES:
                bid = DEMO_ENTITIES[entity_id]["bid"]
                self.send_json({
                    "entity_id":      entity_id,
                    "bid_score":      round(bid.bid_score, 3),
                    "confidence":     round(bid.confidence, 3),
                    "direction":      bid.direction.value,
                    "likely_asset":   bid.likely_asset,
                    "phase":          bid.biological_phase,
                    "window_blocks":  bid.predicted_window_blocks,
                    "manipulation":   round(bid.manipulation_score, 3),
                    "will_trade":     bid.confidence > 0.65,
                })
            else:
                # Generate on the fly
                intent   = random.choice(["buy", "sell", "swap"])
                features = bid_engine.generate_synthetic_entity(entity_id, intent)
                result   = bid_engine.detect_intent(entity_id, features, akashic_depth=random.randint(50, 300))
                self.send_json({
                    "entity_id":    entity_id,
                    "bid_score":    round(result.bid_score, 3),
                    "confidence":   round(result.confidence, 3),
                    "direction":    result.direction.value,
                    "likely_asset": result.likely_asset,
                    "phase":        result.biological_phase,
                    "window_blocks": result.predicted_window_blocks,
                    "manipulation": round(result.manipulation_score, 3),
                    "will_trade":   result.confidence > 0.65,
                })

        elif path == "/pmos":
            pmos = []
            for p in pmo_system.pmos.values():
                pmos.append({
                    "pmo_id":         p.pmo_id[:16] + "...",
                    "entity_a":       p.entity_a,
                    "entity_b":       p.entity_b,
                    "asset_in":       p.asset_in,
                    "asset_out":      p.asset_out,
                    "reference_price": p.reference_price,
                    "price_guarantee": round(p.price_guarantee, 6),
                    "ccp_estimate":   round(p.ccp_estimate * 10000, 1),
                    "state":          p.state.value,
                    "created_at":     p.created_at,
                })
            self.send_json({"pmos": pmos, "stats": pmo_system.stats()})

        elif path == "/complement":
            # Find a complement for a random demo entity
            entity_id  = qs.get("entity", ["alice"])[0]
            if entity_id in DEMO_ENTITIES:
                bid = DEMO_ENTITIES[entity_id]["bid"]
                # Simple complement: find opposite direction
                complements = []
                for name, data in DEMO_ENTITIES.items():
                    if name == entity_id:
                        continue
                    other = data["bid"]
                    is_complement = (
                        (bid.direction == TradeDirection.BUY  and other.direction == TradeDirection.SELL) or
                        (bid.direction == TradeDirection.SELL and other.direction == TradeDirection.BUY)  or
                        (bid.direction == TradeDirection.SWAP and other.direction == TradeDirection.SWAP)
                    )
                    if is_complement:
                        score = (bid.confidence + other.confidence) / 2 * (0.85 + random.uniform(0, 0.15))
                        complements.append({
                            "entity_id":       name,
                            "complement_score": round(score, 3),
                            "estimated_asset": other.likely_asset,
                            "ccp_estimate_bps": random.randint(45, 120),
                        })
                complements.sort(key=lambda c: c["complement_score"], reverse=True)
                self.send_json({"entity_id": entity_id, "complements": complements[:5]})
            else:
                self.send_json({"entity_id": entity_id, "complements": []})

        else:
            self.send_json({"error": "Not found", "path": path}, 404)

    def do_POST(self):
        length  = int(self.headers.get("Content-Length", 0))
        body    = json.loads(self.rfile.read(length)) if length else {}
        path    = urlparse(self.path).path

        if path == "/pmo/propose":
            entity_a = body.get("entity_a", "alice")
            entity_b = body.get("entity_b", "bob")
            bid_a = DEMO_ENTITIES.get(entity_a, {}).get("bid")
            bid_b = DEMO_ENTITIES.get(entity_b, {}).get("bid")

            class MockComplement:
                estimated_magnitude = 1.0

            pmo = pmo_system.create_pmo(
                entity_a=entity_a,
                entity_b=entity_b,
                bid_result_a=bid_a,
                bid_result_b=bid_b,
                complement_match=MockComplement(),
                reference_price=body.get("reference_price", 3500.0),
                ccp_estimate=body.get("ccp_estimate", 0.007),
            )

            self.send_json({
                "pmo_id":         pmo.pmo_id,
                "entity_a":       pmo.entity_a,
                "entity_b":       pmo.entity_b,
                "asset_in":       pmo.asset_in,
                "asset_out":      pmo.asset_out,
                "reference_price": pmo.reference_price,
                "price_guarantee": round(pmo.price_guarantee, 6),
                "ccp_bps":        round(pmo.ccp_estimate * 10000, 1),
                "state":          pmo.state.value,
            })

        else:
            self.send_json({"error": "Unknown endpoint"}, 404)


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), AetherHandler)
    print(f"AETHER API Server running on port {PORT}")
    print(f"Endpoints: /health /stats /entities /bid/<id> /complement /pmos /pmo/propose")
    server.serve_forever()
