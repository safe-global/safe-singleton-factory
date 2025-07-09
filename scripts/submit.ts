import { promises as filesystem } from "fs";
import * as path from "path";
import { ethers, BytesLike } from "ethers";
import dotenv from "dotenv";
import { runScript } from "./utils";

dotenv.config();

const rpcUrl = process.env.RPC;
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

async function simulateTransaction(transaction: BytesLike) {
	const call = ethers.utils.parseTransaction(transaction);
	const nonce = await provider.getTransactionCount(call.from as string);
	console.log({ nonce });
	if (call.nonce !== nonce) {
		throw new Error("nonce must be 0");
	}
	for (const property of ["hash", "type", "v", "r", "s"] as const) {
		delete call[property];
	}
	console.log({ call });
	const deployedBytecode = await provider.call(call as any);
	const codeHash = ethers.utils.keccak256(
		ethers.utils.arrayify(deployedBytecode),
	);
	console.log({ deployedBytecode, codeHash });
	if (
		codeHash !=
		"0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989"
	) {
		throw new Error("deployed bytecode mismatch");
	}
}

async function submitDeploymentTransaction() {
	const { chainId } = await provider.getNetwork();
	console.log({ chainId });
	const filePath = path.join(
		__dirname,
		"..",
		"artifacts",
		`${chainId}`,
		"deployment.json",
	);
	const { transaction } = JSON.parse(
		await filesystem.readFile(filePath, { encoding: "utf8" }),
	);
	try {
		await simulateTransaction(transaction);
	} catch (error) {
		if (
			error.code === "UNSUPPORTED_OPERATION" &&
			error.transactionType === 113
		) {
			console.warn(
				"WARN: simulation not supported on legacy ZKsync, skipping...",
			);
		} else {
			throw error;
		}
	}
	const transactionHash = await provider.send("eth_sendRawTransaction", [
		transaction,
	]);
	console.log({ transactionHash });
	const transactionReceipt = await provider.waitForTransaction(
		transactionHash,
		1,
		60000,
	);
	console.log({ transactionReceipt });
	if (transactionReceipt.status !== 1) {
		throw new Error("deployment transaction reverted");
	}
}

runScript(submitDeploymentTransaction);
