import { secp256k1 } from "@noble/curves/secp256k1";
import { getAddress, hashMessage, hexToBytes, isHex, keccak256, toBytes } from "viem";
import { createSiweMessage } from "viem/siwe";

export const normalizeEvmAddress = (address: string) => getAddress(address.trim());

export const createWalletVerificationMessage = (args: {
  address: string;
  chainId: number;
  domain: string;
  nonce: string;
  uri: string;
  issuedAt: Date;
  expirationTime: Date;
}) =>
  createSiweMessage({
    address: normalizeEvmAddress(args.address),
    chainId: args.chainId,
    domain: args.domain,
    nonce: args.nonce,
    uri: args.uri,
    version: "1",
    statement: "Verify this wallet for Oboe payments, refunds, and signed agent proofs.",
    issuedAt: args.issuedAt,
    expirationTime: args.expirationTime,
  });

export const walletMessageDigest = (message: string) => keccak256(toBytes(message));

export const verifyWalletSignature = async (args: {
  address: string;
  message: string;
  signature: string;
}) => {
  if (!isHex(args.signature)) {
    return false;
  }
  try {
    const bytes = hexToBytes(args.signature);
    if (bytes.length !== 65) return false;
    const recovery = bytes[64] >= 27 ? bytes[64] - 27 : bytes[64];
    if (recovery !== 0 && recovery !== 1) return false;
    const publicKey = secp256k1.Signature
      .fromCompact(bytes.slice(0, 64))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(hashMessage(args.message)))
      .toRawBytes(false);
    const recovered = getAddress(`0x${keccak256(publicKey.slice(1)).slice(-40)}`);
    return recovered === normalizeEvmAddress(args.address);
  } catch {
    return false;
  }
};
