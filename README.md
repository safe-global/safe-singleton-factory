# Safe Singleton Factory

Singleton factory used by Safe related contracts based on https://github.com/Arachnid/deterministic-deployment-proxy

The original library used a presigned transaction without a chain id to allow deployment on different chains. Some chains do not allow such transactions to be submitted (e.g. Celo and Avalance) therefore this repository will provide the same factory that can be deployed via a presigned transaction that includes the chain id. The key that is used to sign is controlled by the Safe team.
