import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compileStandardWrapper, CompilerOutputContract } from 'solc'
import { ethers } from 'ethers'
import dotenv from "dotenv";

dotenv.config()

export async function ensureDirectoryExists(absoluteDirectoryPath: string) {
	try {
		await filesystem.mkdir(absoluteDirectoryPath)
	} catch (error) {
		if (error.code === 'EEXIST') return
		throw error
	}
}

async function compileContracts(): Promise<CompilerOutput> {
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

async function writeBytecode(bytecode: string) {
	const filePath = path.join(__dirname, '..', 'output', `bytecode.txt`)
	await filesystem.writeFile(filePath, bytecode, { encoding: 'utf8', flag: 'w' })
}

async function writeFactoryDeployerTransaction(contract: CompilerOutputContract, chainId: number, overwriteGasPrice?: number) {
	const deploymentBytecode = contract.evm.bytecode.object

	const nonce = 0
	const gasPrice = overwriteGasPrice || 100*10**9
	// actual gas costs last measure: 59159; we don't want to run too close though because gas costs can change in forks and we want our address to be retained
	const gasLimit = 100000
	const value = 0
	const data = arrayFromHexString(deploymentBytecode)

	if (!process.env.MNEMONIC) throw Error("MNEMONIC is required")
	const signer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC!!)
	const signedEncodedTransaction = await signer.signTransaction({
		nonce, gasPrice, gasLimit, value, data, chainId
	})
	const signerAddress = await signer.getAddress()
	const contractAddress = ethers.utils.getContractAddress({ from: signerAddress, nonce } )

	const filePath = path.join(__dirname, "artifacts", `${chainId}`, "deployment.json")
	const fileContents = `{
	"gasPrice": ${gasPrice},
	"gasLimit": ${gasLimit},
	"signerAddress": "${signerAddress}",
	"transaction": "${signedEncodedTransaction}",
	"address": "${contractAddress}"
}
`
	await filesystem.writeFile(filePath, fileContents, { encoding: 'utf8', flag: 'w' })
}

function arrayFromNumber(value: number): Uint8Array {
	return arrayFromHexString(value.toString(16))
}

function arrayFromHexString(value: string): Uint8Array {
	const normalized = (value.length % 2) ? `0${value}` : value
	const bytes = []
	for (let i = 0; i < normalized.length; i += 2) {
		bytes.push(Number.parseInt(`${normalized[i]}${normalized[i+1]}`, 16))
	}
	return new Uint8Array(bytes)
}

async function doStuff() {
	const gasPrice = process.argv[3] ? parseInt(process.argv[3]) : undefined
	const chainId: number = parseInt(process.argv[2])
	const compilerOutput = await compileContracts()
	const contract = compilerOutput.contracts['deterministic-deployment-proxy.yul']['Proxy']
	await ensureDirectoryExists(path.join(__dirname, '..', 'artifacts'))
	await ensureDirectoryExists(path.join(__dirname, '..', 'artifacts', `${chainId}`))
	await writeBytecode(contract.evm.bytecode.object)
	await writeFactoryDeployerTransaction(contract, chainId, gasPrice)
}

doStuff().then(() => {
	process.exit(0)
}).catch(error => {
	console.error(error)
	process.exit(1)
})
