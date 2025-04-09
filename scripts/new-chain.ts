import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { NewChainError, runScript } from './utils';
import { ADDRESS, CODEHASH, FACTORY_BYTECODE, SIGNER } from './constants';

dotenv.config()

async function newChainWrapper() {
	const summary: Record<string, unknown> = {};
	summary.labelOperation = "--remove-label"
	try {
		await verifyNewChainRequest(summary)
	} catch (error) {
		summary.response = error
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
	// Extract the RPC URL (first URL) from the issue body as a string
	const rpcUrl = process.env.RPC
	if (!rpcUrl) {
		throw NewChainError.rpcNotFound()
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
		throw NewChainError.factoryAlreadyDeployed()
	}

	// Check if the chain is listed in the chainlist
	// If the chain is listed, we can proceed with the deployment
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	summary.chainlist = chainlist
	summary.onChainlist = onChainlist
	if (!onChainlist) {
		throw NewChainError.chainNotListed(chainId.toString())
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
			throw NewChainError.factoryDifferentBytecode()
		}

		if (nonce === 0) {
			throw NewChainError.factoryPreDeployed()
		} else {
			throw NewChainError.factoryNotAddedToRepo()
		}
		// TODO: Create a PR to add the artifact to the repository
	} else if (nonce > 0) {
		throw NewChainError.factoryDeployerAccountNonceBurned()
	} else {
		// Get the gas price and gas limit
		const gasPrice = await provider.getGasPrice()
		if(!gasPrice) {
			throw NewChainError.gasPriceNotRetrieved()
		}
		let gasLimit;
		try {
			gasLimit = await provider.estimateGas({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
			if(!gasLimit) {
				throw NewChainError.gasLimitNotEstimated()
			}
		} catch (error) {
			throw NewChainError.gasLimitEstimationFailed()
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
			throw NewChainError.deploymentSimulationFailed()
		}
		summary.simulation = simulation
		const simulationCodehash = ethers.utils.keccak256(simulation)
		summary.simulationCodehash = simulationCodehash
		// Check if the simulation codehash matches the expected codehash
		if (simulationCodehash !== CODEHASH) {
			throw NewChainError.factoryDeploymentSimulationDifferentBytecode()
		}

		// Check if the deployer account has enough balance
		const balance = await provider.getBalance(SIGNER)
		summary.balance = ethers.utils.formatEther(balance)
		if (balance.lt(gasEstimate)) {
			throw NewChainError.prefundNeeded(gasEstimate.toString(), SIGNER)
		}
	}
	summary.response = `**✅ Success:**<br>The issue description is valid:<br>- The RPC URL is valid<br>- The chain is in the chainlist<br>- The deployer address is pre-funded<br>:sparkles: The team will be in touch with you soon :sparkles:`
	summary.labelOperation = "--add-label"
}

runScript(newChainWrapper)
