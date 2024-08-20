import fs from "fs";
import path from "path";
import { utils, Wallet, Provider, EIP712Signer, types } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import dotenv from "dotenv";

dotenv.config();

export default async function signDeployFactoryContractTX(hre: HardhatRuntimeEnvironment) {
  const { RPC, MNEMONIC, PK, ZK_PAYMASTER_ADDRESS } = process.env;

  if (!RPC) {
    throw new Error("Missing RPC environment variable");
  }
  const provider = new Provider(RPC);
  let wallet: Wallet;
  if (PK) {
    wallet = new Wallet(PK).connect(provider);
  } else if (MNEMONIC) {
    wallet =  Wallet.fromMnemonic(MNEMONIC).connect(provider);
  } else {
    throw new Error("Either PK or MNEMONIC environment variable must be set");
  }

  const fromAddress = wallet.address;

  const deployer = new Deployer(hre, wallet);
  const factoryArtifact = await deployer.loadArtifact("SafeSingeltonFactory");

  const salt = ethers.constants.HashZero;
  const bytecodeHash = utils.hashBytecode(factoryArtifact.bytecode);
  // The singleton factory does not have any constructor
  const constructor = "0x";
  // We use create2 here as the address of this will be zkSync specific in any case. This way it also provides additional security.
  const iface = new ethers.utils.Interface([
    "function create2(bytes32 salt, bytes32 bytecodeHash, bytes constructor)"
  ]);
  const data = iface.encodeFunctionData("create2", [salt, bytecodeHash, constructor]);

  const chainId = (await provider.getNetwork()).chainId;
  const nonce = await provider.getTransactionCount(fromAddress);

  const customData = {
    factoryDeps: [factoryArtifact.bytecode],
    gasPerPubdata: ethers.BigNumber.from(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT),
  } as types.Eip712Meta;

  if (ZK_PAYMASTER_ADDRESS) {
    customData.paymasterParams = utils.getPaymasterParams(
      ZK_PAYMASTER_ADDRESS,
      {
        type: "General",
        innerInput: new Uint8Array(),
      }
    );
  }

  const tempTx = {
    from: fromAddress,
    to: utils.CONTRACT_DEPLOYER_ADDRESS,
    chainId: chainId,
    nonce: nonce,
    type: 113,
    customData,
    value: ethers.utils.parseEther("0"),
    data: data,
  };
  const gasLimit = await provider.estimateGas(tempTx);
  const gasPrice = await provider.getGasPrice();

  const factoryTx = {
    ...tempTx,
    gasLimit: gasLimit.mul(2),
    gasPrice: gasPrice.mul(2),
  }

  const signedTxHash = EIP712Signer.getSignedDigest(factoryTx);
  const signature = ethers.utils.arrayify(ethers.utils.joinSignature(wallet._signingKey().signDigest(signedTxHash)));
  factoryTx.customData = {
    ...factoryTx.customData,
    customSignature: signature,
  };
  const rawTx = utils.serialize(factoryTx);
  const contractAddress = utils.create2Address(fromAddress, bytecodeHash, salt, constructor);

  let dir = path.join(__dirname, "..", "artifacts");
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
  dir = path.join(__dirname, "..", "artifacts", `${chainId}`);
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
  fs.writeFileSync(path.join(dir, "deployment.json"), JSON.stringify({ 
    gasPrice: factoryTx.gasPrice.toNumber(), 
    gasLimit: factoryTx.gasLimit.toNumber(), 
    signerAddress: factoryTx.from, 
    transaction: rawTx, 
    address: contractAddress
  }, null, 4));
}
