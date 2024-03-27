import { ethers } from "ethers"
import * as path from "path"
import { promises as filesystem } from "fs"
import { CompilerOutputContract } from "solc"
import {compileContracts, hexPrefix} from "./utils"

const signer = "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37"

export interface DeploymentEstimation {
  chainId: bigint
  gasLimit: ethers.BigNumberish
  gasPrice: ethers.BigNumberish
}

export async function ensureDirectoryExists(absoluteDirectoryPath: string) {
  try {
    await filesystem.mkdir(absoluteDirectoryPath)
  } catch (error) {
    if (error != null && typeof error === "object" && "code" in error && error.code === "EEXIST")
      return
    throw error
  }
}

async function writeBytecode(bytecode: string) {
  const filePath = path.join(__dirname, "..", "artifacts", `bytecode.txt`)
  await filesystem.writeFile(filePath, bytecode, { encoding: "utf8", flag: "w" })
}

async function writeFactoryDeployerTransaction(deploymentBytecode: string,
  chainId: bigint,
  overwrites?: { gasPrice?: ethers.BigNumberish; gasLimit?: ethers.BigNumberish; nonce?: number }
) {
  const nonce = overwrites?.nonce || 0
  const gasPrice = overwrites?.gasPrice != undefined ? overwrites.gasPrice : 100 * 10 ** 9
  // actual gas costs last measure: 59159; we don't want to run too close though because gas costs can change in forks and we want our address to be retained
  const gasLimit = overwrites?.gasLimit || 100000
  const value = 0

  if (!process.env.MNEMONIC) throw Error("MNEMONIC is required")
  const signer = ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC!!)
  const signedEncodedTransaction = await signer.signTransaction({
    nonce,
    gasPrice,
    gasLimit,
    value,
    data: deploymentBytecode,
    chainId,
  })
  const signerAddress = await signer.getAddress()
  const contractAddress = ethers.getCreateAddress({ from: signerAddress, nonce })

  const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")
  const fileContents = `{
	"gasPrice": ${gasPrice},
	"gasLimit": ${gasLimit},
	"signerAddress": "${signerAddress}",
	"transaction": "${signedEncodedTransaction}",
	"address": "${contractAddress}"
}
`
  await filesystem.writeFile(filePath, fileContents, { encoding: "utf8", flag: "w" })
}

export async function estimateDeploymentTransaction(rpcUrl: string): Promise<DeploymentEstimation> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const chainId = (await provider.getNetwork()).chainId
  console.log({ chainId })
  const compilerOutput = await compileContracts()
  const contract = compilerOutput.contracts["deterministic-deployment-proxy.yul"]["Proxy"]
  const data = "0x" + contract.evm.bytecode.object
  const gasLimit = await provider.estimateGas({ data, from: signer })
  console.log({ estimate: gasLimit.toString() })
  const { gasPrice } = await provider.getFeeData()

  if (!gasPrice) throw Error("Couldn't fetch the gas price")

  console.log({
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    gasPrice: gasPrice.toString(),
  })
  console.log({ requiredFunds: ethers.formatUnits(gasPrice * gasLimit, "ether") })
  return { chainId, gasLimit, gasPrice }
}

export async function createDeploymentTransaction(
  chainId: bigint,
  options?: { gasPrice?: ethers.BigNumberish; gasLimit?: ethers.BigNumberish; nonce?: number }
) {
  const compilerOutput = await compileContracts()
  const contract = compilerOutput.contracts["deterministic-deployment-proxy.yul"]["Proxy"]
  await ensureDirectoryExists(path.join(__dirname, "..", "artifacts"))
  await ensureDirectoryExists(path.join(__dirname, "..", "artifacts", `${chainId}`))
  const hexPrefixedBytecode = hexPrefix(contract.evm.bytecode.object)
  await writeBytecode(hexPrefixedBytecode)
  await writeFactoryDeployerTransaction(hexPrefixedBytecode, chainId, options)
}
