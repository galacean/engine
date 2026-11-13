import { bytesToHex, sha256Hex } from "../compiler/shared/CanonicalWaterBinaryWriterV1";

export { sha256Hex as digestSha256HexPortable } from "../compiler/shared/CanonicalWaterBinaryWriterV1";

/**
 * Computes a lowercase SHA-256 digest in secure and ordinary HTTP browser contexts.
 * @param bytes - Exact asset bytes to hash.
 * @returns The 64-character lowercase hexadecimal digest.
 */
export async function digestSha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
  }
  return sha256Hex(new Uint8Array(bytes));
}
