/**
 * seed-bdc.ts
 * Seeds Akashic depth by calling recordTrade() for each test entity.
 * Run: npx hardhat run scripts/seed-bdc.ts --network bohr_testnet
 */
import { ethers } from "hardhat";

const AetherBDCABI = [
  "function recordTrade(bytes32 entityId, uint256 amount) external",
  "function getAkashicDepth(bytes32 entityId) external view returns (uint256)",
  "function computeCreditLimit(bytes32 entityId) external view returns (uint256)",
];

const TEST_ENTITIES: Record<string, { id: string; trades: number }> = {
  Alice:   { id: ethers.keccak256(ethers.toUtf8Bytes("trader_alice")),   trades: 80 },
  Bob:     { id: ethers.keccak256(ethers.toUtf8Bytes("trader_bob")),     trades: 35 },
  Charlie: { id: ethers.keccak256(ethers.toUtf8Bytes("trader_charlie")), trades: 15 },
  Diana:   { id: ethers.keccak256(ethers.toUtf8Bytes("trader_diana")),   trades: 60 },
};

const BDC_ADDRESS = "0x6EAB7862385329BdaaD32f2b9587a66E768018Ba";
const TRADE_AMOUNT = ethers.parseEther("0.5"); // 0.5 BOT per trade (volume tracking)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeder:", deployer.address);

  const bdc = new ethers.Contract(BDC_ADDRESS, AetherBDCABI, deployer);

  let nonce = await ethers.provider.getTransactionCount(deployer.address);
  console.log("Starting nonce:", nonce);

  // Queue all transactions concurrently using manual nonces
  const allTxPromises: Promise<any>[] = [];

  for (const [name, { id, trades }] of Object.entries(TEST_ENTITIES)) {
    console.log(`\nQueueing ${trades} trades for ${name}...`);
    for (let i = 0; i < trades; i++) {
      const tx = bdc.recordTrade(id, TRADE_AMOUNT, { nonce: nonce++ });
      allTxPromises.push(tx);
    }
  }

  console.log(`\nBroadcasting ${allTxPromises.length} transactions...`);
  const txs = await Promise.all(allTxPromises);
  console.log("All transactions broadcast. Waiting for last batch...");

  // Wait only for the final tx of each entity
  const lastPerEntity = [79, 79 + 35, 79 + 35 + 15, 79 + 35 + 15 + 60].map(
    (i) => txs[i]
  );
  await Promise.all(lastPerEntity.map((tx) => tx.wait()));

  console.log("\n═══════════════ AKASHIC DEPTH RESULTS ═══════════════");
  for (const [name, { id }] of Object.entries(TEST_ENTITIES)) {
    const depth = await bdc.getAkashicDepth(id);
    const limit = await bdc.computeCreditLimit(id);
    console.log(
      `  ${name.padEnd(8)} depth=${depth.toString().padStart(3)} ` +
      `creditLimit=${ethers.formatEther(limit)} BOT`
    );
  }
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
