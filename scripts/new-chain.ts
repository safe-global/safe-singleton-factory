import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { ScriptError, runScript } from './utils';
import { ADDRESS, CODEHASH, FACTORY_BYTECODE, SIGNER } from './constants';

dotenv.config()

enum ScriptErrorCode {
	UNKNOWN_ERROR = 100,
	RPC_URL_NOT_FOUND,
	FACTORY_ALREADY_DEPLOYED,
	CHAIN_NOT_LISTED,
	FACTORY_DIFFERENT_BYTECODE,
	FACTORY_PRE_DEPLOYED,
	FACTORY_NOT_ADDED_TO_REPO,
	FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED,
	GAS_PRICE_NOT_RETRIEVED,
	GAS_LIMIT_NOT_ESTIMATED,
	GAS_LIMIT_ESTIMATION_FAILED,
	DEPLOYMENT_SIMULATION_FAILED,
	FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE,
	PREFUND_NEEDED
}

async function newChainWrapper() {
	const summary: Record<string, unknown> = {};
	summary.success = false
	summary.labelOperation = "--remove-label"
	try {
		await verifyNewChainRequest(summary)
	} finally {
		const summaryFile = process.env.SUMMARY_FILE
		if (summaryFile) {
			fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2))
		} else {
			console.log(summary)
		}
	}
}

async function verifyNewChainRequest(summary: Record<string, unknown>) {
	const issueBody = process.env.ISSUE_BODY
	// Extract the RPC URL (first URL) from the issue body as a string
	const rpcUrl = issueBody?.match(/https?:\/\/[^\s]+/g)?.[0]
	if (!rpcUrl) {
		summary.error = getNewChainErrorMessage(ScriptErrorCode.RPC_URL_NOT_FOUND)
		throwNewChainError(ScriptErrorCode.RPC_URL_NOT_FOUND, summary.ERROR as string)
	}

	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const { chainId } = await provider.getNetwork()
	summary.chainId = chainId
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")

	// Check if the factory is already deployed
	// If the file exists, it means the factory is already deployed
	// If the file does not exist, it means the factory is not deployed or not added to the repository
	// and we can proceed with the deployment
	const deployed = fs.existsSync(filePath)
	if (deployed) {
		summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_ALREADY_DEPLOYED)
		throwNewChainError(ScriptErrorCode.FACTORY_ALREADY_DEPLOYED, summary.ERROR as string)
	}

	// Check if the chain is listed in the chainlist
	// If the chain is listed, we can proceed with the deployment
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	summary.chainlist = chainlist
	summary.onChainlist = onChainlist
	if (!onChainlist) {
		summary.ERROR = getNewChainErrorMessage(ScriptErrorCode.CHAIN_NOT_LISTED, [chainId.toString()])
		throwNewChainError(ScriptErrorCode.CHAIN_NOT_LISTED, summary.ERROR as string)
	}

	const nonce = await provider.getTransactionCount(SIGNER)
	const code = await provider.getCode(ADDRESS)
	const codehash = ethers.utils.keccak256(code)
	summary.nonce = nonce
	summary.codehash = codehash
	summary.code = code
	// Check if any code is deployed at the address
	if (ethers.utils.hexDataLength(code) > 0) {
		// Check if the codehash matches the expected codehash
		if (codehash !== CODEHASH) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE)
			throwNewChainError(ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE, summary.ERROR as string)
		}

		if (nonce === 0) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_PRE_DEPLOYED)
			throwNewChainError(ScriptErrorCode.FACTORY_PRE_DEPLOYED, summary.ERROR as string)
		} else {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO)
			throwNewChainError(ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO, summary.ERROR as string)
		}
		// TODO: Create a PR to add the artifact to the repository
	} else if (nonce > 0) {
		summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED)
		throwNewChainError(ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED, summary.ERROR as string)
	} else {
		// Get the gas price and gas limit
		const gasPrice = await provider.getGasPrice()
		if(!gasPrice) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED)
			throwNewChainError(ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED, summary.ERROR as string)
		}
		let gasLimit;
		try {
			gasLimit = await provider.estimateGas({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
			if(!gasLimit) {
				summary.error = getNewChainErrorMessage(ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED)
				throwNewChainError(ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED, summary.ERROR as string)
			}
		} catch (error) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED)
			throwNewChainError(ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED, summary.ERROR as string)
		}

		const gasEstimate = gasPrice.mul(gasLimit!).mul(15).div(10) // 15% buffer
		summary.gasPrice = gasPrice.toString()
		summary.gasLimit = gasLimit?.toString()
		summary.gasEstimate = gasEstimate.toString()

		// Get the deployed bytecode simulation
		let simulation: string = '';
		try {
			simulation = await provider.call({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
		} catch (error) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED)
			throwNewChainError(ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED, summary.ERROR as string)
		}
		summary.simulation = simulation
		const simulationCodehash = ethers.utils.keccak256(simulation)
		summary.simulationCodehash = simulationCodehash
		// Check if the simulation codehash matches the expected codehash
		if (simulationCodehash !== CODEHASH) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE)
			throwNewChainError(ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE, summary.ERROR as string)
		}

		// Check if the deployer account has enough balance
		const balance = await provider.getBalance(SIGNER)
		summary.balance = ethers.utils.formatEther(balance)
		if (balance.lt(gasEstimate)) {
			summary.error = getNewChainErrorMessage(ScriptErrorCode.PREFUND_NEEDED, [gasEstimate.toString()])
			throwNewChainError(ScriptErrorCode.PREFUND_NEEDED, summary.ERROR as string)
		}
	}
	summary.success = true
	summary.response = `**✅ Success:**<br>The issue description is valid:<br>- The RPC URL is valid<br>- The chain is in the chainlist<br>- The deployer address is pre-funded<br>:sparkles: The team will be in touch with you soon :sparkles:`
	summary.labelOperation = "--add-label"
}

function throwNewChainError(errorCode: ScriptErrorCode, errorMessage: string): ScriptError {
	if (errorCode in ScriptErrorCode) {
		throw new ScriptError(errorMessage, errorCode)
	} else {
		throw new ScriptError(errorMessage, ScriptErrorCode.UNKNOWN_ERROR)
	}
}

function getNewChainErrorMessage(errorCode: ScriptErrorCode, errorParameters?: string[]): string {
	switch (errorCode) {
		case ScriptErrorCode.RPC_URL_NOT_FOUND:
			return `**⛔️ Error:**<br>RPC URL not found in the issue body.`
		case ScriptErrorCode.FACTORY_ALREADY_DEPLOYED:
			return `**⛔️ Error:**<br>The factory is already deployed.`
		case ScriptErrorCode.CHAIN_NOT_LISTED:
			return `**⛔️ Error:**<br>Chain ${errorParameters?.[0]} is not listed in the chainlist. For more information on how to add a chain, please refer to the [chainlist repository](https://github.com/ethereum-lists/chains).<br>`
		case ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE:
			return `**⛔️ Error:**<br>Factory is deployed with different bytecode.`
		case ScriptErrorCode.FACTORY_PRE_DEPLOYED:
			return `**⛔️ Error:**<br>Factory is pre-deployed on the chain.`
		case ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO:
			return `**⛔️ Error:**<br>Factory has been deployed but not added to the repository.`
		case ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED:
			return `**⛔️ Error:**<br>Factory deployer account nonce burned.`
		case ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED:
			return `**⛔️ Error:**<br>Gas price couldn't be retrieved. Please make sure that the RPC URL is valid and reachable.`
		case ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED:
			return `**⛔️ Error:**<br>Gas limit couldn't be estimated. Please make sure that the RPC URL is valid and reachable.`
		case ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED:
			return `**⛔️ Error:**<br>Gas limit estimation failed. Please make sure that the RPC URL is valid and reachable.`
		case ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED:
			return `**⛔️ Error:**<br>Deployment simulation failed. Please make sure that the RPC URL is valid and reachable.`
		case ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE:
			return `**⛔️ Error:**<br>Factory deployment simulation returned different bytecode.`
		case ScriptErrorCode.PREFUND_NEEDED:
			return `**💸 Pre-fund needed:**<br/>We need a pre-fund to deploy the factory. Please send ${errorParameters?.[0]} wei to ${SIGNER} and check the checkbox in the issue.`
		default:
			return `**⛔️ Error:**<br>Unknown error`
	}
}

runScript(newChainWrapper)
