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
	} catch (error) {
		if (error instanceof ScriptError) {
			summary.error = error.message
		} else {
			summary.error = `**⛔️ Error:**<br>Unknown error: ${error}`
		}
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
		throw getNewChainError(ScriptErrorCode.RPC_URL_NOT_FOUND)
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
		throw getNewChainError(ScriptErrorCode.FACTORY_ALREADY_DEPLOYED)
	}

	// Check if the chain is listed in the chainlist
	// If the chain is listed, we can proceed with the deployment
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	summary.chainlist = chainlist
	summary.onChainlist = onChainlist
	if (!onChainlist) {
		throw getNewChainError(ScriptErrorCode.CHAIN_NOT_LISTED, [chainId.toString()])
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
			throw getNewChainError(ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE)
		}

		if (nonce === 0) {
			throw getNewChainError(ScriptErrorCode.FACTORY_PRE_DEPLOYED)
		} else {
			throw getNewChainError(ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO)
		}
		// TODO: Create a PR to add the artifact to the repository
	} else if (nonce > 0) {
		throw getNewChainError(ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED)
	} else {
		// Get the gas price and gas limit
		const gasPrice = await provider.getGasPrice()
		if(!gasPrice) {
			throw getNewChainError(ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED)
		}
		let gasLimit;
		try {
			gasLimit = await provider.estimateGas({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
			if(!gasLimit) {
				throw getNewChainError(ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED)
			}
		} catch (error) {
			throw getNewChainError(ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED)
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
			throw getNewChainError(ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED)
		}
		summary.simulation = simulation
		const simulationCodehash = ethers.utils.keccak256(simulation)
		summary.simulationCodehash = simulationCodehash
		// Check if the simulation codehash matches the expected codehash
		if (simulationCodehash !== CODEHASH) {
			throw getNewChainError(ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE)
		}

		// Check if the deployer account has enough balance
		const balance = await provider.getBalance(SIGNER)
		summary.balance = ethers.utils.formatEther(balance)
		if (balance.lt(gasEstimate)) {
			throw getNewChainError(ScriptErrorCode.PREFUND_NEEDED, [gasEstimate.toString()])
		}
	}
	summary.success = true
	summary.response = `**✅ Success:**<br>The issue description is valid:<br>- The RPC URL is valid<br>- The chain is in the chainlist<br>- The deployer address is pre-funded<br>:sparkles: The team will be in touch with you soon :sparkles:`
	summary.labelOperation = "--add-label"
}

function getNewChainError(errorCode: ScriptErrorCode, errorParameters?: string[]): ScriptError {
	let message: string
	switch (errorCode) {
		case ScriptErrorCode.RPC_URL_NOT_FOUND:
			message = `**⛔️ Error:**<br>RPC URL not found in the issue body.`
			break
		case ScriptErrorCode.FACTORY_ALREADY_DEPLOYED:
			message = `**⛔️ Error:**<br>The factory is already deployed.`
			break
		case ScriptErrorCode.CHAIN_NOT_LISTED:
			message = `**⛔️ Error:**<br>Chain ${errorParameters?.[0]} is not listed in the chainlist. For more information on how to add a chain, please refer to the [chainlist repository](https://github.com/ethereum-lists/chains).<br>`
			break
		case ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE:
			message = `**⛔️ Error:**<br>Factory is deployed with different bytecode.`
			break
		case ScriptErrorCode.FACTORY_PRE_DEPLOYED:
			message = `**⛔️ Error:**<br>Factory is pre-deployed on the chain.`
			break
		case ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO:
			message = `**⛔️ Error:**<br>Factory has been deployed but not added to the repository.`
			break
		case ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED:
			message = `**⛔️ Error:**<br>Factory deployer account nonce burned.`
			break
		case ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED:
			message = `**⛔️ Error:**<br>Gas price couldn't be retrieved. Please make sure that the RPC URL is valid and reachable.`
			break
		case ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED:
			message = `**⛔️ Error:**<br>Gas limit couldn't be estimated. Please make sure that the RPC URL is valid and reachable.`
			break
		case ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED:
			message = `**⛔️ Error:**<br>Gas limit estimation failed. Please make sure that the RPC URL is valid and reachable.`
			break
		case ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED:
			message = `**⛔️ Error:**<br>Deployment simulation failed. Please make sure that the RPC URL is valid and reachable.`
			break
		case ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE:
			message = `**⛔️ Error:**<br>Factory deployment simulation returned different bytecode.`
			break
		case ScriptErrorCode.PREFUND_NEEDED:
			message = `**💸 Pre-fund needed:**<br/>We need a pre-fund to deploy the factory. Please send ${errorParameters?.[0]} wei to ${SIGNER} and check the checkbox in the issue.`
			break
		default:
			message = `**⛔️ Error:**<br>Unknown error`
			errorCode = ScriptErrorCode.UNKNOWN_ERROR
	}
	return new ScriptError(message, errorCode)
}

runScript(newChainWrapper)
