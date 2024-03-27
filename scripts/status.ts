import { promises as filesystem } from 'fs'
import * as path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { runScript } from './utils';

dotenv.config()

async function checkDeploymentStatus() {
	const rpcUrl = process.env.RPC
	const provider = new ethers.JsonRpcProvider(rpcUrl)
	const chainId = (await provider.getNetwork()).chainId
	console.log({chainId})
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")
	const deployment = JSON.parse((await filesystem.readFile(filePath)).toString())
	const address = deployment.address
	console.log({address})
	const code = await provider.getCode(address)
	console.log({code})
}

runScript(checkDeploymentStatus)
