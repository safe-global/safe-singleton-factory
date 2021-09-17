# Safe Singleton Factory

Singleton factory used by Safe related contracts based on https://github.com/Arachnid/deterministic-deployment-proxy

The original library used a presigned transaction without a chain id to allow deployment on different chains. Some chains do not allow such transactions to be submitted (e.g. Celo and Avalance) therefore this repository will provide the same factory that can be deployed via a presigned transaction that includes the chain id. The key that is used to sign is controlled by the Safe team.

# Adding new networks

To add support for new networks the same key used for the existing networks should be used to generate a presigned transaction for a new network. To request support for a new network please open a [new issue](https://github.com/gnosis/safe-singleton-factory/issues/new/choose).

To generate the deployment data for a new network the following steps are necessary:

- Set `MNEMONIC` in the `.env` file
- Run `yarn compile <chain_id>`

