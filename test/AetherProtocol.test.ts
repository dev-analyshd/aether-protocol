import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("AETHER Protocol", function () {
  let oracle: any;
  let bdc: any;
  let settlement: any;
  let owner: Signer;
  let entityA: Signer;
  let entityB: Signer;
  let protocolFeeReceiver: Signer;

  const entityAId = ethers.keccak256(ethers.toUtf8Bytes("entityA"));
  const entityBId = ethers.keccak256(ethers.toUtf8Bytes("entityB"));

  beforeEach(async function () {
    [owner, entityA, entityB, protocolFeeReceiver] = await ethers.getSigners();

    const AetherOracle = await ethers.getContractFactory("AetherOracle");
    oracle = await AetherOracle.deploy();
    await oracle.waitForDeployment();

    const AetherBDC = await ethers.getContractFactory("AetherBDC");
    bdc = await AetherBDC.deploy(await oracle.getAddress());
    await bdc.waitForDeployment();

    const AetherSettlement = await ethers.getContractFactory("AetherSettlement");
    settlement = await AetherSettlement.deploy(
      await oracle.getAddress(),
      await bdc.getAddress(),
      await protocolFeeReceiver.getAddress()
    );
    await settlement.waitForDeployment();

    // Wire BDC → Settlement
    await bdc.setSettlementContract(await settlement.getAddress());
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function setupCoherence() {
    await oracle.setCoherence(entityAId, 800, 550, true);
    await oracle.setCoherence(entityBId, 750, 550, true);
  }

  async function proposePMO() {
    await setupCoherence();
    const tx = await settlement.proposePMO(
      entityAId,
      entityBId,
      ethers.parseEther("1"),
      ethers.parseEther("2"),
      ethers.parseEther("3500")
    );
    const receipt = await tx.wait();
    const event = receipt?.logs.find(
      (log: any) => log.fragment?.name === "PMOProposed"
    );
    return event?.args?.pmoId as string;
  }

  async function commitBoth(pmoId: string) {
    const nonceA = ethers.randomBytes(32);
    const intentA = ethers.randomBytes(32);
    const hashA = ethers.keccak256(ethers.concat([intentA, nonceA]));

    const nonceB = ethers.randomBytes(32);
    const intentB = ethers.randomBytes(32);
    const hashB = ethers.keccak256(ethers.concat([intentB, nonceB]));

    await settlement.connect(entityA).commit(pmoId, entityAId, hashA, {
      value: ethers.parseEther("1"),
    });
    await settlement.connect(entityB).commit(pmoId, entityBId, hashB, {
      value: ethers.parseEther("2"),
    });

    return { intentA, intentB, nonceA, nonceB };
  }

  // ─── Tests ────────────────────────────────────────────────────────────────

  describe("AetherOracle", function () {
    it("should set and verify coherence", async function () {
      await oracle.setCoherence(entityAId, 800, 550, true);
      const [safe, score, threshold] = await oracle.verifyExecution(entityAId);
      expect(safe).to.equal(true);
      expect(score).to.equal(800);
      expect(threshold).to.equal(550);
    });

    it("should flag manipulation pairs", async function () {
      await oracle.setManipulationPair(entityAId, entityBId, true);
      expect(await oracle.isManipulationPair(entityAId, entityBId)).to.equal(true);
      expect(await oracle.isManipulationPair(entityBId, entityAId)).to.equal(true);
    });

    it("should default to safe for unset entities", async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      const [safe] = await oracle.verifyExecution(unknownId);
      expect(safe).to.equal(true);
    });
  });

  describe("PMO Lifecycle", function () {
    it("should create a PMO proposal", async function () {
      const pmoId = await proposePMO();
      expect(pmoId).to.be.a("string");
      expect(pmoId).to.not.equal("0x" + "0".repeat(64));

      const pmo = await settlement.getPMO(pmoId);
      expect(pmo.state).to.equal(0); // PROPOSED
    });

    it("should reject PMO with same entity", async function () {
      await setupCoherence();
      await expect(
        settlement.proposePMO(
          entityAId,
          entityAId,
          ethers.parseEther("1"),
          ethers.parseEther("1"),
          ethers.parseEther("3500")
        )
      ).to.be.revertedWith("Settlement: same entity");
    });

    it("should reject PMO with manipulation fingerprint", async function () {
      await setupCoherence();
      await oracle.setManipulationPair(entityAId, entityBId, true);
      await expect(
        settlement.proposePMO(
          entityAId,
          entityBId,
          ethers.parseEther("1"),
          ethers.parseEther("3500"),
          ethers.parseEther("3500")
        )
      ).to.be.revertedWith("Aether: manipulation detected");
    });

    it("should transition to COMMITTED after both commit", async function () {
      const pmoId = await proposePMO();
      await commitBoth(pmoId);

      const pmo = await settlement.getPMO(pmoId);
      expect(pmo.state).to.equal(1); // COMMITTED
    });

    it("should reject double-commit by same entity", async function () {
      const pmoId = await proposePMO();
      const nonceA = ethers.randomBytes(32);
      const intentA = ethers.randomBytes(32);
      const hashA = ethers.keccak256(ethers.concat([intentA, nonceA]));

      await settlement.connect(entityA).commit(pmoId, entityAId, hashA, {
        value: ethers.parseEther("1"),
      });

      await expect(
        settlement.connect(entityA).commit(pmoId, entityAId, hashA, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Settlement: A already committed");
    });

    it("should reveal and advance to REVEALED state", async function () {
      const pmoId = await proposePMO();
      const { intentA, intentB, nonceA, nonceB } = await commitBoth(pmoId);

      await settlement.reveal(pmoId, intentA, intentB, nonceA, nonceB);

      const pmo = await settlement.getPMO(pmoId);
      expect(pmo.state).to.equal(2); // REVEALED
    });

    it("should reject reveal with wrong nonce", async function () {
      const pmoId = await proposePMO();
      const { intentA, intentB, nonceA } = await commitBoth(pmoId);
      const wrongNonceB = ethers.randomBytes(32);

      await expect(
        settlement.reveal(pmoId, intentA, intentB, nonceA, wrongNonceB)
      ).to.be.revertedWith("Settlement: bad reveal B");
    });

    it("should settle and reach COMPLETE state", async function () {
      const pmoId = await proposePMO();
      const { intentA, intentB, nonceA, nonceB } = await commitBoth(pmoId);

      await settlement.reveal(pmoId, intentA, intentB, nonceA, nonceB);
      await settlement.settle(pmoId);

      const pmo = await settlement.getPMO(pmoId);
      expect(pmo.state).to.equal(4); // COMPLETE
    });

    it("should update protocol stats after settlement", async function () {
      const pmoId = await proposePMO();
      const { intentA, intentB, nonceA, nonceB } = await commitBoth(pmoId);
      await settlement.reveal(pmoId, intentA, intentB, nonceA, nonceB);
      await settlement.settle(pmoId);

      const [volume] = await settlement.getProtocolStats();
      expect(volume).to.be.gt(0n);
    });

    it("should build Akashic depth after settlement", async function () {
      const pmoId = await proposePMO();
      const { intentA, intentB, nonceA, nonceB } = await commitBoth(pmoId);
      await settlement.reveal(pmoId, intentA, intentB, nonceA, nonceB);
      await settlement.settle(pmoId);

      const depthA = await bdc.getAkashicDepth(entityAId);
      const depthB = await bdc.getAkashicDepth(entityBId);
      expect(depthA).to.be.gt(0n);
      expect(depthB).to.be.gt(0n);
    });
  });

  describe("BDC Credit", function () {
    it("should return zero credit for shallow history", async function () {
      const limit = await bdc.computeCreditLimit(entityAId);
      expect(limit).to.equal(0n);
    });

    it("should accrue credit after sufficient trades", async function () {
      for (let i = 0; i < 10; i++) {
        await bdc.recordTrade(entityAId, ethers.parseEther("100"));
      }
      const limit = await bdc.computeCreditLimit(entityAId);
      expect(limit).to.be.gt(0n);
    });

    it("should originate a loan against credit", async function () {
      for (let i = 0; i < 10; i++) {
        await bdc.recordTrade(entityAId, ethers.parseEther("100"));
      }
      await oracle.setCoherence(entityAId, 800, 550, true);

      const limit = await bdc.computeCreditLimit(entityAId);
      const loanAmount = limit / 2n;

      const tx = await bdc.originateLoan(entityAId, loanAmount, 10000, {
        value: loanAmount,
      });
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
    });

    it("should reject loan exceeding credit limit", async function () {
      await oracle.setCoherence(entityAId, 800, 550, true);
      await expect(
        bdc.originateLoan(entityAId, ethers.parseEther("1000"), 10000, {
          value: ethers.parseEther("1000"),
        })
      ).to.be.revertedWith("BDC: exceeds credit limit");
    });
  });
});
