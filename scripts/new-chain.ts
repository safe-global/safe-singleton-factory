import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { ScriptError, ScriptErrorCode, runScript } from './utils';
import { ADDRESS, CODEHASH, FACTORY_BYTECODE, SIGNER } from './constants';

dotenv.config()

async function verifyNewChainRequest() {
	const issueBody = process.env.ISSUE_BODY
	// Extract the RPC URL (first URL) from the issue body as a string
	const rpcUrl = issueBody?.match(/https?:\/\/[^\s]+/g)?.[0]
	if (!rpcUrl) {
		throw new ScriptError(ScriptErrorCode.RPC_URL_NOT_FOUND)
	}

	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const { chainId } = await provider.getNetwork()
	console.log({ chainId })
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")

	// Check if the factory is already deployed
	// If the file exists, it means the factory is already deployed
	// If the file does not exist, it means the factory is not deployed or not added to the repository
	// and we can proceed with the deployment
	const deployed = fs.existsSync(filePath)
	if (deployed) {
		throw new ScriptError(ScriptErrorCode.FACTORY_ALREADY_DEPLOYED)
	}

	// Check if the chain is listed in the chainlist
	// If the chain is listed, we can proceed with the deployment
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	console.log({ chainlist, onChainlist })
	if (!onChainlist) {
		throw new ScriptError(ScriptErrorCode.CHAIN_NOT_LISTED, [chainId.toString()])
	}

	const nonce = await provider.getTransactionCount(SIGNER)
	const code = await provider.getCode(ADDRESS)
	const codehash = ethers.utils.keccak256(code)
	console.log({ nonce, codehash, code })
	// Check if any code is deployed at the address
	if (ethers.utils.hexDataLength(code) > 0) {
		// Check if the codehash matches the expected codehash
		if (codehash !== CODEHASH) {
			throw new ScriptError(ScriptErrorCode.FACTORY_DIFFERENT_BYTECODE)
		}

		if (nonce === 0) {
			throw new ScriptError(ScriptErrorCode.FACTORY_PRE_DEPLOYED)
		} else {
			throw new ScriptError(ScriptErrorCode.FACTORY_NOT_ADDED_TO_REPO)
		}
		// TODO: Create a PR to add the artifact to the repository
	} else if (nonce > 0) {
		throw new ScriptError(ScriptErrorCode.FACTORY_DEPLOYER_ACCOUNT_NONCE_BURNED)
	} else {
		// Get the gas price and gas limit
		const gasPrice = await provider.getGasPrice()
		if(!gasPrice) {
			throw new ScriptError(ScriptErrorCode.GAS_PRICE_NOT_RETRIEVED)
		}
		let gasLimit;
		try {
			gasLimit = await provider.estimateGas({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
			if(!gasLimit) {
				throw new ScriptError(ScriptErrorCode.GAS_LIMIT_NOT_ESTIMATED)
			}
		} catch (error) {
			throw new ScriptError(ScriptErrorCode.GAS_LIMIT_ESTIMATION_FAILED);
		}

		const gasEstimate = gasPrice.mul(gasLimit).mul(15).div(10) // 15% buffer
		console.log({ gasPrice: gasPrice.toString(), gasLimit: gasLimit.toString(), gasEstimate: gasEstimate.toString() })

		// Get the deployed bytecode simulation
		let simulation: string;
		try {
			simulation = await provider.call({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
		} catch (error) {
			throw new ScriptError(ScriptErrorCode.DEPLOYMENT_SIMULATION_FAILED);
		}
		console.log({ simulation })
		const simulationCodehash = ethers.utils.keccak256(simulation)
		console.log({ simulationCodehash })
		// Check if the simulation codehash matches the expected codehash
		if (simulationCodehash !== CODEHASH) {
			throw new ScriptError(ScriptErrorCode.FACTORY_DEPLOYMENT_SIMULATION_DIFFERENT_BYTECODE)
		}

		// Check if the deployer account has enough balance
		const balance = await provider.getBalance(SIGNER)
		console.log({ balance: ethers.utils.formatEther(balance) })
		if (balance.lt(gasEstimate)) {
			throw new ScriptError(ScriptErrorCode.PREFUND_NEEDED, [gasEstimate.toString()])
		}
	}
	console.log("RESULT:OK")
}

runScript(verifyNewChainRequest)
