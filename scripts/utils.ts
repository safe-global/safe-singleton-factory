import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compileStandardWrapper } from 'solc'
import { SIGNER } from './constants'

export enum ScriptErrorCode {
	RPC_URL_NOT_FOUND = 100,
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

function getScriptErrorMessage(errorCode: ScriptErrorCode, errorParameters?: string[]): string {
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

export class ScriptError extends Error {
	constructor(public exitCode: number = 1, errorParameters?: string[]) {
		const message = getScriptErrorMessage(exitCode, errorParameters)
		super(message)
		this.name = "ScriptError"
	}
}

export function runScript(script: () => Promise<any>) {
	script()
		.then(() => process.exit(0))
		.catch(error => {
			if (error instanceof ScriptError) {
				console.error(error.message)
				process.exit(error.exitCode)
			} else {
				console.error(error)
				process.exit(1)
			}
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
