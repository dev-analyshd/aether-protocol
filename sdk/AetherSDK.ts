/**
 * AETHER Protocol SDK
 * TypeScript interface for interacting with AETHER contracts on BOT Chain
 */

import { ethers } from "ethers";

export interface PMORecord {
  pmoId: string;
  entityA: string;
  entityB: string;
  walletA: string;
  walletB: string;
  commitmentHashA: string;
  commitmentHashB: string;
  amountA: bigint;
  amountB: bigint;
  referencePrice: bigint;
  priceGuarantee: bigint;
  validUntilBlock: bigint;
  state: number;
  committedA: boolean;
  committedB: boolean;
}

export interface BIDResult {
  entityId: string;
  bidScore: number;
  confidence: number;
  direction: string;
  likelyAsset: string;
  predictedWindow: number;
}

export interface ComplementMatch {
  entityId: string;
  chainId: number;
  vmType: string;
  complementScore: number;
  estimatedAsset: string;
  ccpEstimate: number;
}

export interface ProtocolStats {
  volume: bigint;
  ccp: bigint;
  fees: bigint;
  totalPMOs: bigint;
  settledCount: bigint;
}

const SETTLEMENT_ABI = [
  "function proposePMO(bytes32 entityA, bytes32 entityB, uint256 amountA, uint256 amountB, uint256 referencePrice) external returns (bytes32)",
  "function commit(bytes32 pmoId, bytes32 entityId, bytes32 commitmentHash) external payable",
  "function reveal(bytes32 pmoId, bytes32 fullIntentA, bytes32 fullIntentB, bytes32 nonceA, bytes32 nonceB) external",
  "function settle(bytes32 pmoId) external",
  "function revertExpiredPMO(bytes32 pmoId) external",
  "function getPMO(bytes32 pmoId) external view returns (tuple(bytes32 pmoId, bytes32 entityA, bytes32 entityB, address walletA, address walletB, bytes32 commitmentHashA, bytes32 commitmentHashB, uint256 amountA, uint256 amountB, uint256 referencePrice, uint256 priceGuarantee, uint256 validUntilBlock, uint8 state, bool committedA, bool committedB))",
  "function getProtocolStats() external view returns (uint256 volume, uint256 ccp, uint256 fees)",
  "function getFullStats() external view returns (uint256 volume, uint256 ccp, uint256 fees, uint256 totalPMOCount, uint256 settledCount)",
  "event PMOProposed(bytes32 indexed pmoId, bytes32 indexed entityA, bytes32 indexed entityB, uint256 referencePrice, uint256 priceGuarantee)",
  "event PMOCommitted(bytes32 indexed pmoId, bytes32 indexed entityId)",
  "event PMORevealed(bytes32 indexed pmoId)",
  "event PMOSettled(bytes32 indexed pmoId, uint256 amountA, uint256 amountB, uint256 ccpEach, uint256 protocolFee)",
  "event PMOReverted(bytes32 indexed pmoId, string reason)",
];

const BDC_ABI = [
  "function computeCreditLimit(bytes32 entityId) external view returns (uint256)",
  "function originateLoan(bytes32 entityId, uint256 amount, uint256 durationBlocks) external payable returns (bytes32)",
  "function repayLoan(bytes32 entityId, uint256 loanIndex) external payable",
  "function getAkashicDepth(bytes32 entityId) external view returns (uint256)",
  "function getActiveLoans(bytes32 entityId) external view returns (tuple(bytes32 loanId, bytes32 entityId, uint256 amount, uint256 interestRateBps, uint256 dueBlock, bool repaid)[])",
  "function getRecord(bytes32 entityId) external view returns (tuple(uint256 depth, uint256 totalVolume, uint256 tradeCount, uint256 lastTradeBlock))",
  "event LoanOriginated(bytes32 indexed loanId, bytes32 indexed entityId, uint256 amount, uint256 interestRateBps, uint256 dueBlock)",
];

const ORACLE_ABI = [
  "function verifyExecution(bytes32 entityId) external view returns (bool safe, uint256 score, uint256 threshold)",
  "function getCoherence(bytes32 entityId) external view returns (uint256 score, uint256 threshold, bool isSafe, uint256 updatedAt)",
  "function isManipulationPair(bytes32 entityA, bytes32 entityB) external view returns (bool)",
];

export class AetherSDK {
  private provider: ethers.Provider;
  private signer: ethers.Signer | null;
  public settlementContract: ethers.Contract;
  public bdcContract: ethers.Contract;
  public oracleContract: ethers.Contract;

  /** BOT Chain testnet config */
  static readonly BOHR_TESTNET = {
    chainId: 968,
    rpcUrl: "https://rpc.bohr.life",
    explorerUrl: "https://scan.bohr.life",
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  };

  constructor(
    provider: ethers.Provider,
    addresses: { settlement: string; bdc: string; oracle: string },
    signer?: ethers.Signer
  ) {
    this.provider = provider;
    this.signer = signer || null;
    const runner = signer || provider;

    this.settlementContract = new ethers.Contract(addresses.settlement, SETTLEMENT_ABI, runner);
    this.bdcContract        = new ethers.Contract(addresses.bdc,        BDC_ABI,        runner);
    this.oracleContract     = new ethers.Contract(addresses.oracle,     ORACLE_ABI,     runner);
  }

  /** Create SDK instance from browser wallet (MetaMask / BO Wallet) */
  static async fromBrowser(
    addresses: { settlement: string; bdc: string; oracle: string }
  ): Promise<AetherSDK> {
    if (!window.ethereum) throw new Error("No browser wallet found");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return new AetherSDK(provider, addresses, signer);
  }

  /** Create SDK instance from private key (server/script usage) */
  static fromPrivateKey(
    privateKey: string,
    addresses: { settlement: string; bdc: string; oracle: string },
    rpcUrl = AetherSDK.BOHR_TESTNET.rpcUrl
  ): AetherSDK {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer   = new ethers.Wallet(privateKey, provider);
    return new AetherSDK(provider, addresses, signer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PMO Operations
  // ─────────────────────────────────────────────────────────────────────────

  async proposePMO(
    entityA: string,
    entityB: string,
    amountA: bigint,
    amountB: bigint,
    referencePrice: bigint
  ): Promise<string> {
    const tx = await this.settlementContract.proposePMO(
      entityA, entityB, amountA, amountB, referencePrice
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => log.fragment?.name === "PMOProposed");
    return event?.args?.pmoId || "";
  }

  async commit(
    pmoId: string,
    entityId: string,
    fullIntent: string,
    nonce: string,
    value: bigint
  ): Promise<void> {
    const commitmentHash = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [fullIntent, nonce])
    );
    const tx = await this.settlementContract.commit(pmoId, entityId, commitmentHash, { value });
    await tx.wait();
  }

  async reveal(
    pmoId: string,
    fullIntentA: string,
    fullIntentB: string,
    nonceA: string,
    nonceB: string
  ): Promise<void> {
    const tx = await this.settlementContract.reveal(
      pmoId, fullIntentA, fullIntentB, nonceA, nonceB
    );
    await tx.wait();
  }

  async settle(pmoId: string): Promise<void> {
    const tx = await this.settlementContract.settle(pmoId);
    await tx.wait();
  }

  async getPMO(pmoId: string): Promise<PMORecord> {
    return await this.settlementContract.getPMO(pmoId);
  }

  async getProtocolStats(): Promise<ProtocolStats> {
    const [volume, ccp, fees, totalPMOs, settledCount] =
      await this.settlementContract.getFullStats();
    return { volume, ccp, fees, totalPMOs, settledCount };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BDC Operations
  // ─────────────────────────────────────────────────────────────────────────

  async getCreditLimit(entityId: string): Promise<bigint> {
    return await this.bdcContract.computeCreditLimit(entityId);
  }

  async getAkashicDepth(entityId: string): Promise<bigint> {
    return await this.bdcContract.getAkashicDepth(entityId);
  }

  async originateLoan(
    entityId: string,
    amount: bigint,
    durationBlocks: bigint
  ): Promise<string> {
    const tx = await this.bdcContract.originateLoan(entityId, amount, durationBlocks, {
      value: amount,
    });
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => log.fragment?.name === "LoanOriginated");
    return event?.args?.loanId || "";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Oracle Operations
  // ─────────────────────────────────────────────────────────────────────────

  async verifyCoherence(entityId: string): Promise<{ safe: boolean; score: bigint; threshold: bigint }> {
    const [safe, score, threshold] = await this.oracleContract.verifyExecution(entityId);
    return { safe, score, threshold };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────

  static getEntityId(address: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
  }

  static generateNonce(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  static formatBOT(wei: bigint): string {
    return ethers.formatEther(wei) + " BOT";
  }
}
