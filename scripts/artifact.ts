import { promises as fs } from 'fs'
import path from 'path'

export type DeploymentArtifact = {
	gasPrice: number
	gasLimit: number
	signerAddress: string
	transaction: string
	address: string
}

const root = path.join(__dirname, '..', 'artifacts');

export async function writeArtifact(chainId: string, artifact: DeploymentArtifact) {
	const artifactDir = path.join(root, chainId)
	await fs.mkdir(artifactDir, { recursive: true })
	const artifactPath = path.join(artifactDir, 'deployment.json')
	const data = `${JSON.stringify(artifact, undefined, '\t')}\n`
	await fs.writeFile(artifactPath, data, 'utf-8')
}

export async function writeBytecode(bytecode: string) {
	await fs.mkdir(root, { recursive: true })
	const bytecodePath = path.join(root, 'bytecode.txt')
	await fs.writeFile(bytecodePath, `${bytecode}\n`, 'utf-8')
}
