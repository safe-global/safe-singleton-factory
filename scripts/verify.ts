import { promises as filesystem } from 'fs'
import * as path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { runScript } from './utils';

dotenv.config()

const CODEHASH = "0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989"

async function verifyDeploymentCode() {
	const rpcUrl = process.env.RPC
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const { chainId } = await provider.getNetwork()
	console.log({ chainId })
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")
	const { address } = JSON.parse(await filesystem.readFile(filePath, { encoding: 'utf8' }))
	console.log({ address })
	const code = await provider.getCode(address)
	const codehash = ethers.utils.keccak256(code)
	console.log({ codehash, code })
	if (codehash !== CODEHASH) {
		throw new Error("unexpected code at Safe singleton factory address")
	}
	console.log("OK.")
}

runScript(verifyDeploymentCode)
