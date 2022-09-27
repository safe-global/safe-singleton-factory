import { ethers } from 'ethers'
import dotenv from "dotenv";
import { compileContracts, runScript } from './utils';

dotenv.config()

async function estimateDeploymentTransaction() {
	const rpcUrl = process.env.RPC
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const chainId = (await provider.getNetwork()).chainId
	console.log({chainId})
	const compilerOutput = await compileContracts()
	const contract = compilerOutput.contracts['deterministic-deployment-proxy.yul']['Proxy']
	const data = "0x" + contract.evm.bytecode.object
	const estimate = await provider.estimateGas({ data })
	console.log({estimate: estimate.toString() })
	const gasPrice = await provider.getGasPrice()
	console.log({gasPriceGwei: ethers.utils.formatUnits(gasPrice, "gwei"), gasPrice: gasPrice.toString() })
}

runScript(estimateDeploymentTransaction)
