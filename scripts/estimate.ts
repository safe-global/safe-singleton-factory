import dotenv from "dotenv";
import { runScript } from "./utils";
import { DeploymentEstimation, estimateDeploymentTransaction } from "./common";

dotenv.config();

async function runEstimateDeploymentTransaction(): Promise<DeploymentEstimation> {
	const rpcUrl = process.env.RPC;
	if (rpcUrl === undefined) throw "RPC environment variable must be defined";
	return estimateDeploymentTransaction(rpcUrl);
}

runScript(runEstimateDeploymentTransaction);
