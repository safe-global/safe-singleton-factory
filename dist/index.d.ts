export interface SingletonFactoryInfo {
    gasPrice: number;
    gasLimit: number;
    signerAddress: string;
    transaction: string;
    address: string;
}
export declare const getSingletonFactoryInfo: (chainId: number) => SingletonFactoryInfo | undefined;
//# sourceMappingURL=index.d.ts.map