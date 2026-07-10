import { getAddress, isHex, keccak256, toBytes, verifyMessage } from "viem";
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
  return await verifyMessage({
    address: normalizeEvmAddress(args.address),
    message: args.message,
    signature: args.signature,
  });
};
