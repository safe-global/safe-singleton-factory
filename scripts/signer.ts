import { LedgerSigner } from "@ethersproject/hardware-wallets";
import { ethers, TypedDataDomain, TypedDataField } from "ethers";

// Unfortunately, we are stuck on an older version of Ethers, with older Ledger integration, and we
// need to monkey-patch a few things so that things work as expected with Ethers.js, in particular:
// - Implement ERC-712 signing, note that the older `@ledgerhq/hw-app-eth` version we use _only_
//   has support for `signEIP712HashedMessage` (so "blind-signing" mode); this is used by the
//   legacy ZKsync support (contract creation transactions signatures are for ERC-712 messages).
// - Fix the `v` value that comes from the Ledger device; it is only 1 byte long, so it truncates
//   the full EIP-155 `v` value for larger chain IDs (where `chainId * 2 + 36` is larger than 255).
class LedgerTypedDataSigner extends LedgerSigner {
	constructor() {
		super();
	}

	async _signTypedData(
		domain: TypedDataDomain,
		types: Record<string, TypedDataField[]>,
		message: Record<string, any>,
	): Promise<string> {
		const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
		const messageHash = ethers.utils._TypedDataEncoder
			.from(types)
			.hash(message);
		const { r, s, v } = await this._retry((eth) =>
			eth.signEIP712HashedMessage(this.path, domainSeparator, messageHash),
		);
		return ethers.utils.joinSignature({ r: `0x${r}`, s: `0x${s}`, v });
	}

	async signTransaction(
		transaction: ethers.providers.TransactionRequest,
	): Promise<string> {
		const tx = await ethers.utils.resolveProperties(transaction);
		const baseTx: ethers.utils.UnsignedTransaction = {
			chainId: tx.chainId || undefined,
			data: tx.data || undefined,
			gasLimit: tx.gasLimit || undefined,
			gasPrice: tx.gasPrice || undefined,
			nonce: tx.nonce ? ethers.BigNumber.from(tx.nonce).toNumber() : undefined,
			to: tx.to || undefined,
			value: tx.value || undefined,
		};
		const unsignedTx = ethers.utils.serializeTransaction(baseTx).substring(2);
		const { r, s, v } = await this._retry((eth) =>
			eth.signTransaction(this.path, unsignedTx),
		);
		let correctedV;
		if (tx.chainId) {
			// `v` is `(chainId * 2 + 35 + yParity) % 256`, so regardless of the value of `chainId`,
			// `chainId * 2 + 35` will always be odd, and therefore, `yParity` will be the opposite
			// of the least significant bit. Note that the Ledger API returns the `v` as a
			// hexadecimal-encoded string, so make sure to parse it or you get unexpected behaviour
			// with the bitwise operations.
			const yParity = (parseInt(v, 16) & 1) ^ 1;
			correctedV = ethers.BigNumber.from(tx.chainId)
				.mul(2)
				.add(35)
				.add(yParity)
				.toNumber();
		} else {
			correctedV = v;
		}
		return ethers.utils.serializeTransaction(baseTx, {
			r: `0x${r}`,
			s: `0x${s}`,
			v: correctedV,
		});
	}
}

export function getSigner() {
	const mnemonic = process.env.MNEMONIC;
	if (mnemonic) {
		console.warn("Using $MNEMONIC is considered insecure, and is deprecated.");
		return ethers.Wallet.fromMnemonic(mnemonic);
	}

	return new LedgerTypedDataSigner();
}
