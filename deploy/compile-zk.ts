import { utils, Wallet, Provider, EIP712Signer, types } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import dotenv from "dotenv";
import { writeArtifact } from "../scripts/artifact";
import { getSigner } from "../scripts/signer";

dotenv.config();

export default async function signDeployFactoryContractTX(
	hre: HardhatRuntimeEnvironment,
) {
	const { RPC, ZK_PAYMASTER_ADDRESS } = process.env;

	if (!RPC) {
		throw new Error("Missing RPC environment variable");
	}
	const provider = new Provider(RPC);
	const signer = getSigner();

	const fromAddress = await signer.getAddress();

	// The `Deployer` API _needs_ a `zksync-web3::Wallet` instance, even if we don't actually use it
	// for anything other than reading an artifact JSON blob. Create a random one so we can use the
	// API, since our actual signer created by `getSigner` is not sufficient.
	const deployer = new Deployer(hre, Wallet.createRandom());
	const factoryArtifact = await deployer.loadArtifact("SafeSingeltonFactory");

	const salt = ethers.constants.HashZero;
	const bytecodeHash = utils.hashBytecode(factoryArtifact.bytecode);
	// The singleton factory does not have any constructor
	const constructor = "0x";
	// We use create2 here as the address of this will be ZKsync specific in any case. This way it also provides additional security.
	const iface = new ethers.utils.Interface([
		"function create2(bytes32 salt, bytes32 bytecodeHash, bytes constructor)",
	]);
	const data = iface.encodeFunctionData("create2", [
		salt,
		bytecodeHash,
		constructor,
	]);

	const { chainId } = await provider.getNetwork();
	const nonce = await provider.getTransactionCount(fromAddress);

	const customData = {
		factoryDeps: [factoryArtifact.bytecode],
		gasPerPubdata: ethers.BigNumber.from(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT),
	} as types.Eip712Meta;

	if (ZK_PAYMASTER_ADDRESS) {
		customData.paymasterParams = utils.getPaymasterParams(
			ZK_PAYMASTER_ADDRESS,
			{
				type: "General",
				innerInput: new Uint8Array(),
			},
		);
	}

	const tempTx = {
		from: fromAddress,
		to: utils.CONTRACT_DEPLOYER_ADDRESS,
		chainId: chainId,
		nonce: nonce,
		type: 113,
		customData,
		value: ethers.utils.parseEther("0"),
		data: data,
	};
	const gasLimit = await provider.estimateGas(tempTx);
	const gasPrice = await provider.getGasPrice();

	const factoryTx = {
		...tempTx,
		gasLimit: gasLimit.mul(2),
		gasPrice: gasPrice.mul(2),
	};

	const signature = await new EIP712Signer(signer, chainId).sign(factoryTx);
	factoryTx.customData = {
		...factoryTx.customData,
		customSignature: signature,
	};
	const rawTx = utils.serialize(factoryTx);
	const contractAddress = utils.create2Address(
		fromAddress,
		bytecodeHash,
		salt,
		constructor,
	);

	await writeArtifact(`${chainId}`, {
		gasPrice: factoryTx.gasPrice.toNumber(),
		gasLimit: factoryTx.gasLimit.toNumber(),
		signerAddress: factoryTx.from,
		transaction: rawTx,
		address: contractAddress,
	});
}
