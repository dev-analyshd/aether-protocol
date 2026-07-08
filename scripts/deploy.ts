import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("═══════════════════════════════════════════════════════");
  console.log("  AETHER Protocol — Contract Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network  : ${network.name}`);
  console.log(`  Chain ID : ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} BOT`);
  console.log("───────────────────────────────────────────────────────");

  if (balance === 0n) {
    console.error("ERROR: Deployer has zero balance. Get testnet BOT from faucet.");
    process.exit(1);
  }

  // ── 1. Deploy AetherOracle ─────────────────────────────────────────────
  console.log("\n[1/3] Deploying AetherOracle...");
  const AetherOracle = await ethers.getContractFactory("AetherOracle");
  const oracle = await AetherOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log(`      ✓ AetherOracle  → ${oracleAddr}`);

  // ── 2. Deploy AetherBDC ───────────────────────────────────────────────
  console.log("\n[2/3] Deploying AetherBDC...");
  const AetherBDC = await ethers.getContractFactory("AetherBDC");
  const bdc = await AetherBDC.deploy(oracleAddr);
  await bdc.waitForDeployment();
  const bdcAddr = await bdc.getAddress();
  console.log(`      ✓ AetherBDC     → ${bdcAddr}`);

  // ── 3. Deploy AetherSettlement ────────────────────────────────────────
  console.log("\n[3/3] Deploying AetherSettlement...");
  const AetherSettlement = await ethers.getContractFactory("AetherSettlement");
  const settlement = await AetherSettlement.deploy(
    oracleAddr,
    bdcAddr,
    deployer.address // protocol fee receiver
  );
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log(`      ✓ AetherSettlement → ${settlementAddr}`);

  // ── 4. Wire up contracts ──────────────────────────────────────────────
  console.log("\n[4/4] Wiring contracts...");
  const bdcContract = await ethers.getContractAt("AetherBDC", bdcAddr);
  const setTx = await bdcContract.setSettlementContract(settlementAddr);
  await setTx.wait();
  console.log("      ✓ BDC settlement contract set");

  // ── 5. Seed testnet demo data ─────────────────────────────────────────
  console.log("\n[5/5] Seeding demo coherence data...");
  const oracleContract = await ethers.getContractAt("AetherOracle", oracleAddr);

  const testEntities = [
    ethers.keccak256(ethers.toUtf8Bytes("trader_alice")),
    ethers.keccak256(ethers.toUtf8Bytes("trader_bob")),
    ethers.keccak256(ethers.toUtf8Bytes("trader_charlie")),
    ethers.keccak256(ethers.toUtf8Bytes("trader_diana")),
  ];

  for (const entity of testEntities) {
    const score = 700 + Math.floor(Math.random() * 200);
    await (await oracleContract.setCoherence(entity, score, 550, true)).wait();
  }
  console.log(`      ✓ Seeded coherence for ${testEntities.length} test entities`);

  // ── Save deployment addresses ─────────────────────────────────────────
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deploymentData = {
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      AetherOracle: {
        address: oracleAddr,
        deploymentBlock: await ethers.provider.getBlockNumber(),
      },
      AetherBDC: {
        address: bdcAddr,
        deploymentBlock: await ethers.provider.getBlockNumber(),
      },
      AetherSettlement: {
        address: settlementAddr,
        deploymentBlock: await ethers.provider.getBlockNumber(),
      },
    },
    testEntities: {
      alice:   ethers.keccak256(ethers.toUtf8Bytes("trader_alice")),
      bob:     ethers.keccak256(ethers.toUtf8Bytes("trader_bob")),
      charlie: ethers.keccak256(ethers.toUtf8Bytes("trader_charlie")),
      diana:   ethers.keccak256(ethers.toUtf8Bytes("trader_diana")),
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${network.name}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  AetherOracle     : ${oracleAddr}`);
  console.log(`  AetherBDC        : ${bdcAddr}`);
  console.log(`  AetherSettlement : ${settlementAddr}`);
  console.log(`\n  Explorer: https://scan.bohr.life/address/${settlementAddr}`);
  console.log(`  Saved to : deployments/${filename}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
