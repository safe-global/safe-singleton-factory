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
