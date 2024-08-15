# Safe Singleton Factory

Singleton factory used by Safe-related contracts based on https://github.com/Arachnid/deterministic-deployment-proxy

The original library used a pre-signed transaction without a chain ID to allow deployment on different chains. Some chains do not allow such transactions to be submitted (e.g. Celo and Avalanche); therefore, this repository will provide the same factory that can be deployed via a pre-signed transaction that includes the chain ID. The key that is used to sign is controlled by the Safe team.

# User documentation

## Explanation (from Arachnid's repo)

This repository contains a simple contract that can deploy other contracts with a deterministic address on any chain using CREATE2. The CREATE2 call will deploy a contract (like CREATE opcode), but instead of the address being `keccak256(rlp([deployer_address, nonce]))` it instead uses the hash of the contract's bytecode and a salt. This means that a given deployer address will deploy the same code to the same address no matter when or where they issue the deployment. The deployer is deployed with a one-time-use account, so its address will always be the same no matter what chain the deployer is on. This means the only variables in determining your contract's address are its bytecode hash and the provided salt.

Between the use of CREATE2 opcode and the one-time-use account for the deployer, we can ensure that a given contract will exist at the exact same address on every chain, but without using the exact gas pricing or limits every time.

## Encoding the deployment transaction

The data should be the 32 byte 'salt' followed by the init code.

## How to use for your projects

While the Safe singleton factory contract was deployed to help ensure that various Safe contracts have consistent addresses across many networks, it can be used in any project as an alternative to the [Arachnid `CREATE2` deployer contract](https://github.com/Arachnid/deterministic-deployment-proxy).

### Usage with Foundry

[`wilsoncusack/safe-singleton-deployer-sol`](https://github.com/wilsoncusack/safe-singleton-deployer-sol) is a library that facilitates the use of the Safe singleton factory contract for [Foundry](https://github.com/foundry-rs/foundry) projects. See the project for more detailed documentation.

## How to get the singleton deployed to your network

As the singleton is deployed with an EIP155 transaction, we must sign the deployment transaction for your network. But some prerequisites must be met before that, and the most important one is having funds on the deployer so we can deploy the contract.

1. Make sure your network is on https://chainlist.org/ . We will not accept networks not present there.
2. Create an issue following the request for a new network template.
3. Once the issue is created, the issue will be automatically validated, and a bot will post a comment with the address of the deployer and the amount of funds needed to deploy the contract.
4. After you have sent the funds to the deployer, mark the checkbox on the issue, and the Safe team will sign the transaction and deploy the contract.

The Safe team will aim to respond to new network requests within two weeks.

## Expected Addresses

For all networks, the same deployer key is used. The address for this key is `0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37`.

This results in the address for the factory being `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` for all bytecode-compatible EVM networks.

For zkSync-based networks, the same deployer is used, and the expected factory address is `0xaECDbB0a3B1C6D1Fe1755866e330D82eC81fD4FD`, and the factory is deployed using the `create2` method of the system deployer using the zero hash (`0x0000000000000000000000000000000000000000000000000000000000000000`).

## NPM Package release cycle

The Safe team will aim to release a new version of the package every two weeks.

Please note that the package is not required for the factory to work. The package is only a convenience for developers to use the factory.
Most libraries that support deterministic deployments accept the factory address as a parameter, so you can use the factory without the package.
For example, see the [documentation](https://github.com/wighawag/hardhat-deploy/blob/42964ca4f74a3f3c57cf694e9713b335f8ba7b2c/README.md#4-deterministicdeployment-ability-to-specify-a-deployment-factory) for the `deterministicDeployment` option in the `hardhat-deploy` plugin.

# Safe developers documentation

## Adding new networks

### Using the `github-deploy` Tool

This repository contains a bash script [`bin/github-deploy.sh`](./bin/github-deploy.sh) for automatically deploying the Safe singleton factory for a given GitHub issue `$NUMBER`:

- Install [`gh` GitHub CLI tool](https://cli.github.com/)
- Install [`op` 1Password CLI tool](https://1password.com/downloads/command-line/)
- Run `bash bin/github-deploy.sh $NUMBER`

**Note that this utility does not currently support zkSync-based network deployments**.

### Manual Process

Optionally, deployment may be done by manual configuration and execution of NPM scripts. To generate the deployment data for a new network, the following steps are necessary:

- Set `RPC` in the `.env` file for the new network.
- Set `MNEMONIC` in the `.env` file.
- Estimate transaction params via `yarn estimate`
- Run `yarn compile <chain_id> [--gasPrice <overwrite_gas_price>] [--gasLimit <overwrite_gas_limit>]`

To do the `estimate` and `compile` steps together:

- Run `yarn estimate-compile ["$RPC"]`

To submit a transaction after the deployment data is created:

- Run `yarn submit`

#### For zkSync-based networks

Use the same steps as above, but instead compile with:

- Run `yarn compile:zk`

## Verifying Networks

### Using the `github-review` Tool

This repository contains a bash script [`bin/github-review.sh`](./bin/github-review.sh) for automatically verifying Safe singleton factory deployments to new networks and approving PRs by `$NUMBER`:

- Install [`gh` GitHub CLI tool](https://cli.github.com/)
- Run `bash bin/github-review.sh $NUMBER`

**Note that this utility does not currently support zkSync-based network deployments**.

### Manual Process

Optionally, the deployment may verified manually with the `verify` NPM script:

- Set `RPC` in the `.env` file for the network.
- Run `yarn verify`
