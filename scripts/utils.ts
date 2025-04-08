import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compileStandardWrapper } from 'solc'

export async function compileContracts(): Promise<CompilerOutput> {
	const solidityFilePath = path.join(__dirname, '..', 'source', 'deterministic-deployment-proxy.yul')
	const soliditySourceCode = await filesystem.readFile(solidityFilePath, 'utf8')
	const compilerInput: CompilerInput = {
		language: "Yul",
		settings: {
			optimizer: {
				enabled: true,
				details: {
					yul: true,
				},
			},
			outputSelection: {
				"*": {
					"*": [ "abi", "evm.bytecode.object", "evm.gasEstimates" ]
				},
			},
		},
		sources: {
			'deterministic-deployment-proxy.yul': {
				content: soliditySourceCode,
			},
		},
	}
	const compilerInputJson = JSON.stringify(compilerInput)
	const compilerOutputJson = compileStandardWrapper(compilerInputJson)
	const compilerOutput = JSON.parse(compilerOutputJson) as CompilerOutput
	const errors = compilerOutput.errors
	if (errors) {
		let concatenatedErrors = "";

		for (let error of errors) {
			if (/Yul is still experimental/.test(error.message)) continue
			concatenatedErrors += error.formattedMessage + "\n";
		}

		if (concatenatedErrors.length > 0) {
			throw new Error("The following errors/warnings were returned by solc:\n\n" + concatenatedErrors);
		}
	}

	return compilerOutput
}

export class NewChainError extends Error {
	public comment: string;
	private constructor(message: string, comment: string) {
		super(message);
		this.name = "NewChainError";
		this.comment = comment;
	}
	
	static rpcNotFound() {
		return new NewChainError("RPC URL not found", `**⛔️ Error:**<br>RPC URL not found in the issue body.`);
	}

	static factoryAlreadyDeployed() {
		return new NewChainError("Factory already deployed", `**⛔️ Error:**<br>The factory is already deployed.`);
	}

	static chainNotListed(chainId: string) {
		return new NewChainError("Chain not listed", `**⛔️ Error:**<br>Chain ${chainId} is not listed in the chainlist. For more information on how to add a chain, please refer to the [chainlist repository](https://github.com/ethereum-lists/chains).<br>`)
	}

	static factoryDifferentBytecode() {
		return new NewChainError("Factory different bytecode", `**⛔️ Error:**<br>Factory is deployed with different bytecode.`);
	}

	static factoryPreDeployed() {
		return new NewChainError("Factory pre-deployed", `**⛔️ Error:**<br>Factory is pre-deployed on the chain.`);
	}

	static factoryNotAddedToRepo() {
		return new NewChainError("Factory not added to repo", `**⛔️ Error:**<br>Factory has been deployed but not added to the repository.`);
	}

	static factoryDeployerAccountNonceBurned() {
		return new NewChainError("Factory deployer account nonce burned", `**⛔️ Error:**<br>Factory deployer account nonce burned.`);
	}

	static gasPriceNotRetrieved() {
		return new NewChainError("Gas price not retrieved", `**⛔️ Error:**<br>Gas price couldn't be retrieved. Please make sure that the RPC URL is valid and reachable.`);
	}

	static gasLimitNotEstimated() {
		return new NewChainError("Gas limit not estimated", `**⛔️ Error:**<br>Gas limit couldn't be estimated. Please make sure that the RPC URL is valid and reachable.`);
	}

	static gasLimitEstimationFailed() {
		return new NewChainError("Gas limit estimation failed", `**⛔️ Error:**<br>Gas limit estimation failed. Please make sure that the RPC URL is valid and reachable.`);
	}

	static deploymentSimulationFailed() {
		return new NewChainError("Deployment simulation failed", `**⛔️ Error:**<br>Deployment simulation failed. Please make sure that the RPC URL is valid and reachable.`);
	}

	static factoryDeploymentSimulationDifferentBytecode() {
		return new NewChainError("Factory deployment simulation different bytecode", `**⛔️ Error:**<br>Factory deployment simulation returned different bytecode.`);
	}

	static prefundNeeded(amount: string, signer: string) {
	  return new NewChainError("Prefund needed", `**💸 Pre-fund needed:**<br/>We need a pre-fund to deploy the factory. Please send ${amount} wei to ${signer} and check the checkbox in the issue.`);
	}
}

export function runScript(script: () => Promise<any>) {
	script()
		.then(() => process.exit(0))
		.catch(error => {
			if (error instanceof NewChainError) {
				console.error(error.comment)
			} else {
				console.error("An error occurred:", error)
			}
			process.exit(1)
		})
}

export function arrayFromHexString(value: string): Uint8Array {
	const normalized = (value.length % 2) ? `0${value}` : value
	const bytes: number[] = []
	for (let i = 0; i < normalized.length; i += 2) {
		bytes.push(Number.parseInt(`${normalized[i]}${normalized[i+1]}`, 16))
	}
	return new Uint8Array(bytes)
}

export async function ensureDirectoryExists(absoluteDirectoryPath: string) {
	try {
		await filesystem.mkdir(absoluteDirectoryPath)
	} catch (error) {
		if (error.code === 'EEXIST') return
		throw error
	}
}
