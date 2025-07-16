import { HardhatUserConfig } from "hardhat/config";

import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";

const config: HardhatUserConfig = {
	paths: {
		artifacts: "build/artifacts",
		cache: "build/cache",
		sources: "contracts-zk",
	},
	zksolc: {
		version: "1.3.8",
		compilerSource: "binary",
		settings: {
			isSystem: true,
		},
	},
	defaultNetwork: "zkSyncTestnet",
	networks: {
		hardhat: {
			zksync: true,
		},
	},
	solidity: {
		version: "0.8.16",
	},
};

export default config;
