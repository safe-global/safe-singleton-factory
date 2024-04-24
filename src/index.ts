export interface SingletonFactoryInfo {
  gasPrice: number,
	gasLimit: number,
	signerAddress: string,
	transaction: string,
	address: string
}

export const getSingletonFactoryInfo = (chainId: number): SingletonFactoryInfo | undefined => {
  try {
    return require(`../artifacts/${chainId}/deployment.json`)
  } catch {
    return undefined
  }
}
