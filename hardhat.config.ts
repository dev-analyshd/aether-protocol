import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x93fd4461112f6e7a0cb14f6a71d8953f1351d76c71ee4026710ecb5399469a9d";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // BOT Chain Testnet (Bohr)
    bohr_testnet: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
      timeout: 120000,
    },
    // Local Hardhat
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      bohr_testnet: "no-api-key-needed",
    },
    customChains: [
      {
        network: "bohr_testnet",
        chainId: 968,
        urls: {
          apiURL: "https://scan.bohr.life/api",
          browserURL: "https://scan.bohr.life",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests:   "./test",
    cache:   "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
