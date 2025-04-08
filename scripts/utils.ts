import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compileStandardWrapper } from 'solc'
import { SIGNER } from './constants'

export enum ScriptErrorCode {
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

export class ScriptError extends Error {
	constructor(message: string, public exitCode: number = 1) {
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
