import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { runScript } from './utils';
import { ADDRESS, CODEHASH, FACTORY_BYTECODE, SIGNER } from './constants';

dotenv.config()

async function newChainWrapper() {
	let summary: { commentOutput: string, labelOperation: string } = {
		commentOutput: "An unexpected error occurred",
		labelOperation: "--remove-label"
	};
	try {
		await verifyNewChainRequest()
		summary = {
			commentOutput: `**✅ Success:**<br>The issue description is valid:<br>- The RPC URL is valid<br>- The chain is in the chainlist<br>- The deployer address is pre-funded<br>:sparkles: The team will be in touch with you soon :sparkles:`,
			labelOperation: "--add-label"
		}
	} catch (error) {
		summary = {
			commentOutput: (error instanceof NewChainError)
				? error.comment
				: `**⛔️ Error:**<br>Unexpected error verifying new chain.<br>Error Details: ${error}`,
			labelOperation: "--remove-label"
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

async function verifyNewChainRequest() {
	// Extract the RPC URL (first URL) from the issue body as a string
	const rpcUrl = process.env.RPC
	if (!rpcUrl) {
		throw NewChainError.rpcNotFound()
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
		throw NewChainError.factoryAlreadyDeployed()
	}

	// Check if the chain is listed in the chainlist
	// If the chain is listed, we can proceed with the deployment
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	console.log({ chainlist, onChainlist })
	if (!onChainlist) {
		throw NewChainError.chainNotListed(chainId.toString())
	}

	const nonce = await provider.getTransactionCount(SIGNER)
	const code = await provider.getCode(ADDRESS)
	const codehash = ethers.utils.keccak256(code)
	console.log({ nonce, codehash, code })
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

		const gasEstimate = gasPrice.mul(gasLimit!).mul(15).div(10) // 50% buffer
		console.log({ gasPrice: gasPrice.toString(), gasLimit: gasLimit?.toString(), gasEstimate: gasEstimate.toString() })

		// Get the deployed bytecode simulation
		let simulation: string;
		try {
			simulation = await provider.call({
				from: SIGNER,
				data: FACTORY_BYTECODE,
			})
		} catch (error) {
			throw NewChainError.deploymentSimulationFailed()
		}
		console.log({ simulation })
		const simulationCodehash = ethers.utils.keccak256(simulation)
		console.log({ simulationCodehash })
		// Check if the simulation codehash matches the expected codehash
		if (simulationCodehash !== CODEHASH) {
			throw NewChainError.factoryDeploymentSimulationDifferentBytecode()
		}

		// Check if the deployer account has enough balance
		const balance = await provider.getBalance(SIGNER)
		console.log({ balance: ethers.utils.formatEther(balance) })
		if (balance.lt(gasEstimate)) {
			throw NewChainError.prefundNeeded(gasEstimate.toString(), SIGNER)
		}
	}
}

class NewChainError extends Error {
	public comment: string;
	private constructor(message: string, comment: string) {
		super(message);
		this.name = "NewChainError";
		this.comment = comment;
	}
	
	static rpcNotFound() {
		return new NewChainError(
			"RPC URL not found",
			`**⛔️ Error:**<br>RPC URL not found in the issue body.`
		);
	}

	static factoryAlreadyDeployed() {
		return new NewChainError(
			"Factory already deployed",
			`**⛔️ Error:**<br>The factory is already deployed.`
		);
	}

	static chainNotListed(chainId: string) {
		return new NewChainError(
			"Chain not listed",
			`**⛔️ Error:**<br>Chain ${chainId} is not listed in the chainlist. For more information on how to add a chain, please refer to the [chainlist repository](https://github.com/ethereum-lists/chains).`
		);
	}

	static factoryDifferentBytecode() {
		return new NewChainError(
			"Factory different bytecode",
			`**⛔️ Error:**<br>Factory is deployed with different bytecode.`
		);
	}

	static factoryPreDeployed() {
		return new NewChainError(
			"Factory pre-deployed",
			`**⛔️ Error:**<br>Factory is pre-deployed on the chain.`
		);
	}

	static factoryNotAddedToRepo() {
		return new NewChainError(
			"Factory not added to repo",
			`**⛔️ Error:**<br>Factory has been deployed but not added to the repository.`
		);
	}

	static factoryDeployerAccountNonceBurned() {
		return new NewChainError(
			"Factory deployer account nonce burned",
			`**⛔️ Error:**<br>Factory deployer account nonce burned.`
		);
	}

	static gasPriceNotRetrieved() {
		return new NewChainError(
			"Gas price not retrieved",
			`**⛔️ Error:**<br>Gas price couldn't be retrieved. Please make sure that the RPC URL is valid and reachable.`
		);
	}

	static gasLimitNotEstimated() {
		return new NewChainError(
			"Gas limit not estimated",
			`**⛔️ Error:**<br>Gas limit couldn't be estimated. Please make sure that the RPC URL is valid and reachable.`
		);
	}

	static gasLimitEstimationFailed() {
		return new NewChainError(
			"Gas limit estimation failed",
			`**⛔️ Error:**<br>Gas limit estimation failed. Please make sure that the RPC URL is valid and reachable.`
		);
	}

	static deploymentSimulationFailed() {
		return new NewChainError(
			"Deployment simulation failed",
			`**⛔️ Error:**<br>Deployment simulation failed. Please make sure that the RPC URL is valid and reachable.`
		);
	}

	static factoryDeploymentSimulationDifferentBytecode() {
		return new NewChainError(
			"Factory deployment simulation different bytecode",
			`**⛔️ Error:**<br>Factory deployment simulation returned different bytecode.`
		);
	}

	static prefundNeeded(amount: string, signer: string) {
		return new NewChainError(
			"Prefund needed",
			`**💸 Pre-fund needed:**<br/>We need a pre-fund to deploy the factory. Please send ${amount} wei to ${signer} and check the checkbox in the issue.`
		);
	}
}

runScript(newChainWrapper)
