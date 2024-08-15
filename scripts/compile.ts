
import dotenv from "dotenv";
import yargs from 'yargs/yargs';
import { runScript } from './utils';
import { createDeploymentTransaction } from "./common";

dotenv.config()

async function runCreateDeploymentTransaction() {
	const chainId: number = parseInt(process.argv[2])
	const options = yargs(process.argv.slice(3)).options({
		"gasPrice": { type: "number" },
		"gasLimit": { type: "number" },
		"nonce": { type: "number" }
	}).argv
	await createDeploymentTransaction(chainId, options)
}

runScript(runCreateDeploymentTransaction)
