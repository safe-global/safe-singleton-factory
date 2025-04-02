import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'
import dotenv from "dotenv";
import { ScriptError, runScript } from './utils';

dotenv.config()

const ADDRESS = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7"
const SIGNER = "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37"
const CODEHASH = "0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989"

async function verifyNewChainRequest() {
	const rpcUrl = process.env.RPC
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const { chainId } = await provider.getNetwork()
	console.log({ chainId })
	const filePath = path.join(__dirname, "..", "artifacts", `${chainId}`, "deployment.json")
	const deployed = fs.existsSync(filePath)
	if (deployed) {
		throw new ScriptError(`The factory is already deployed.`, 100)
	}
	const nonce = await provider.getTransactionCount(SIGNER)
	const code = await provider.getCode(ADDRESS)
	const codehash = ethers.utils.keccak256(code)
	console.log({ nonce, codehash, code })
	if (ethers.utils.hexDataLength(code) > 0) {
		if (codehash !== CODEHASH) {
			throw new ScriptError("Factory is deployed **with different bytecode**.", 101)
		}
		if (nonce === 0) {
			throw new ScriptError(`Factory is pre-deployed on the chain.`, 102)
		} else {
			throw new ScriptError(`Factory has been deployed but not added to the repository.`, 103)
		}
	} else if (nonce > 0) {
		throw new ScriptError("Factory deployer account nonce burned.", 104)
	}
	const chainlist = `https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-${chainId}.json`
	const { ok: onChainlist } = await fetch(chainlist)
	console.log({ chainlist, onChainlist })
	if (!onChainlist) {
		throw new ScriptError(`Chain ${chainId} is not listed in the chainlist.`, 104)
	}
	console.log("OK.")
}

runScript(verifyNewChainRequest)
