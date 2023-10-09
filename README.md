# Safe Singleton Factory

Singleton factory used by Safe related contracts based on https://github.com/Arachnid/deterministic-deployment-proxy

The original library used a presigned transaction without a chain id to allow deployment on different chains. Some chains do not allow such transactions to be submitted (e.g. Celo and Avalanche) therefore this repository will provide the same factory that can be deployed via a presigned transaction that includes the chain id. The key that is used to sign is controlled by the Safe team.

# User documentation

## How to get the singleton deployed to your network

As the singleton is EIP155 protected, we need to sign the singleton for your network. But some requisites must be met before we do that, the most important one is having funds on the deployer so we can deploy the contract.

- Make sure your network is on https://chainlist.org/ . We will not accept networks not present there.
- Install dependencies running `yarn`.
- Estimate the contract deployment: `RPC='http://my-rpc-address' yarn estimate`.
- Send `requiredFunds` to the deployer address `0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37`.
- Open a PR and we will deploy the singleton contract.

## Expected Addresses

For all networks the same deployer key is used. The address for this key is `0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37`.

This results in the address for the factory to be `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` for all bytecode compatible EVM networks.

For zkSync based networks the same deployer is used and expected factory address is `0xaECDbB0a3B1C6D1Fe1755866e330D82eC81fD4FD`.

Note: For zkSync the factory is deployed using the `create2` method of the system deployer using the zero hash (`0x0000000000000000000000000000000000000000000000000000000000000000`).

# Safe developers documentation

## Adding new networks

To generate the deployment data for a new network the following steps are necessary:

- Set `RPC` in the `.env` file for the new network.
- Set `MNEMONIC` in the `.env` file.
- Estimate transaction params via `yarn estimate`
- Run `yarn compile <chain_id> [--gasPrice <overwrite_gas_price>] [--gasLimit <overwrite_gas_limit>]`

To do `estimate` and `compile` steps together:

- Run `yarn estimate-compile ["$RPC"]`

To submit a transaction after the deployment data is created:

- Run `yarn submit`

## For zkSync

- Set `MNEMONIC` or `PK` in the `.env` file
- Run `yarn compile:zk`
