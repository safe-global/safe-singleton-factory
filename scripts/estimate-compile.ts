import dotenv from "dotenv";
import { DeploymentEstimation, createDeploymentTransaction, estimateDeploymentTransaction } from './common';
import { runScript } from './utils';

dotenv.config()

async function runEstimateAndCompile() {
	const rpcUrl = process.argv[2] || process.env.RPC
	if (rpcUrl === undefined) throw "RPC environment variable must be defined"
    const deploymentEstimation: DeploymentEstimation = await estimateDeploymentTransaction(rpcUrl)
    const options = {
        gasPrice: deploymentEstimation.gasPrice,
        gasLimit: BigInt(deploymentEstimation.gasLimit) * 14n / 10n,
        nonce: 0
    }
    await createDeploymentTransaction(deploymentEstimation.chainId, options)
}

runScript(runEstimateAndCompile)
