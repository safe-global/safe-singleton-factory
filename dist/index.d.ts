export interface SingletonFactoryInfo {
    gasPrice: number;
    gasLimit: number;
    signerAddress: string;
    transaction: string;
    address: string;
}
export declare const getDeployment: (chainId: number) => SingletonFactoryInfo | undefined;
//# sourceMappingURL=index.d.ts.map