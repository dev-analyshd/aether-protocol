/**
 * seed-bdc-fast.mjs  — pure ESM, no hardhat overhead
 * Sends recordTrade() calls with manual nonce management in tight batches.
 * run: node scripts/seed-bdc-fast.mjs
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const RPC      = "https://rpc.bohr.life";
const PRIVKEY  = process.env.PRIVATE_KEY;
const BDC_ADDR = "0x6EAB7862385329BdaaD32f2b9587a66E768018Ba";

const ABI = [
  "function recordTrade(bytes32 entityId, uint256 amount) external",
  "function getAkashicDepth(bytes32 entityId) external view returns (uint256)",
  "function computeCreditLimit(bytes32 entityId) external view returns (uint256)",
];

const ENTITIES = {
  Alice:   { id: ethers.keccak256(ethers.toUtf8Bytes("trader_alice")),   trades: 40 },
  Bob:     { id: ethers.keccak256(ethers.toUtf8Bytes("trader_bob")),     trades: 20 },
  Charlie: { id: ethers.keccak256(ethers.toUtf8Bytes("trader_charlie")), trades: 12 },
  Diana:   { id: ethers.keccak256(ethers.toUtf8Bytes("trader_diana")),   trades: 30 },
};
const TRADE_AMOUNT = ethers.parseEther("0.5");
const BATCH_SIZE   = 5; // send 5 at a time, wait for them, then next batch

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PRIVKEY, provider);
  const bdc      = new ethers.Contract(BDC_ADDR, ABI, wallet);

  console.log("Wallet:", wallet.address);
  let nonce = await provider.getTransactionCount(wallet.address);
  console.log("Nonce:", nonce);

  const network = await provider.getNetwork();
  const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("1", "gwei");
  console.log("Chain:", network.chainId.toString(), "  gasPrice:", ethers.formatUnits(gasPrice, "gwei"), "gwei\n");

  const overrides = { gasPrice, gasLimit: 100_000n };

  for (const [name, { id, trades }] of Object.entries(ENTITIES)) {
    console.log(`→ ${name}: sending ${trades} recordTrade txs...`);
    let sent = 0;
    while (sent < trades) {
      const batchSize = Math.min(BATCH_SIZE, trades - sent);
      const batch = [];
      for (let i = 0; i < batchSize; i++) {
        batch.push(
          bdc.recordTrade(id, TRADE_AMOUNT, { nonce: nonce++, ...overrides })
        );
      }
      const txs = await Promise.all(batch);
      // Wait for the last tx in batch to confirm
      await txs[txs.length - 1].wait(1);
      sent += batchSize;
      process.stdout.write(`  ${sent}/${trades} done\r`);
    }
    console.log(`  ${trades}/${trades} done    `);

    const depth = await bdc.getAkashicDepth(id);
    const limit = await bdc.computeCreditLimit(id);
    console.log(`  depth=${depth}  creditLimit=${ethers.formatEther(limit)} BOT\n`);
  }

  console.log("═══════════════ FINAL SNAPSHOT ═══════════════");
  for (const [name, { id }] of Object.entries(ENTITIES)) {
    const depth = await bdc.getAkashicDepth(id);
    const limit = await bdc.computeCreditLimit(id);
    console.log(`  ${name.padEnd(8)} depth=${String(depth).padStart(3)}  limit=${ethers.formatEther(limit)} BOT`);
  }
  console.log("═══════════════════════════════════════════════");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
