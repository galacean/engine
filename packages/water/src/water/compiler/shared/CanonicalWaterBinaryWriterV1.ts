/**
 * Canonical, streaming binary encoding used by authoritative Water identities.
 *
 * This module deliberately knows nothing about Seed World, Hydrology, or a
 * Water backend. Callers own their record schemas and domain tags.
 */

export const CANONICAL_WATER_ENCODING_VERSION = 1 as const;
export const CANONICAL_WATER_HASH_ALGORITHM = "sha256" as const;
export const CANONICAL_WATER_MAXIMUM_SCRATCH_BYTES = 64 * 1024;

export interface CanonicalUint64Lanes {
  readonly low: number;
  readonly high: number;
}

export interface CanonicalWaterByteSink {
  update(bytes: Uint8Array): void;
}

const UTF8 = new TextEncoder();
const SHA256_BLOCK_BYTES = 64;
const SHA256_DIGEST_BYTES = 32;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

const SHA256_INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** Browser-safe incremental SHA-256 with fixed sub-kilobyte scratch. */
export class IncrementalSha256 implements CanonicalWaterByteSink {
  private readonly _hash = SHA256_INITIAL_HASH.slice();
  private readonly _block = new Uint8Array(SHA256_BLOCK_BYTES);
  private readonly _words = new Uint32Array(64);
  private _blockLength = 0;
  private _byteLength = 0;
  private _digest?: Uint8Array;

  update(bytes: Uint8Array): void {
    if (this._digest) throw new Error("SHA-256 has already been finalized.");
    if (!(bytes instanceof Uint8Array)) throw new TypeError("SHA-256 update requires Uint8Array bytes.");
    if (this._byteLength + bytes.byteLength > Math.floor(Number.MAX_SAFE_INTEGER / 8)) {
      throw new RangeError("SHA-256 input exceeds the supported safe byte length.");
    }
    this._byteLength += bytes.byteLength;
    let sourceOffset = 0;
    while (sourceOffset < bytes.byteLength) {
      const copyLength = Math.min(SHA256_BLOCK_BYTES - this._blockLength, bytes.byteLength - sourceOffset);
      this._block.set(bytes.subarray(sourceOffset, sourceOffset + copyLength), this._blockLength);
      this._blockLength += copyLength;
      sourceOffset += copyLength;
      if (this._blockLength === SHA256_BLOCK_BYTES) {
        this._compress(this._block);
        this._blockLength = 0;
      }
    }
  }

  digestBytes(): Uint8Array {
    if (!this._digest) this._digest = this._finalize();
    return this._digest.slice();
  }

  digestHex(): string {
    return bytesToHex(this.digestBytes());
  }

  private _finalize(): Uint8Array {
    const messageByteLength = this._byteLength;
    const paddingLength = this._blockLength < 56 ? 64 - this._blockLength : 128 - this._blockLength;
    const padding = new Uint8Array(paddingLength);
    padding[0] = 0x80;
    const bitLength = messageByteLength * 8;
    const paddingView = new DataView(padding.buffer);
    paddingView.setUint32(paddingLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
    paddingView.setUint32(paddingLength - 4, bitLength >>> 0, false);

    // Padding is processed without changing the logical message length.
    let sourceOffset = 0;
    while (sourceOffset < padding.byteLength) {
      const copyLength = Math.min(SHA256_BLOCK_BYTES - this._blockLength, padding.byteLength - sourceOffset);
      this._block.set(padding.subarray(sourceOffset, sourceOffset + copyLength), this._blockLength);
      this._blockLength += copyLength;
      sourceOffset += copyLength;
      if (this._blockLength === SHA256_BLOCK_BYTES) {
        this._compress(this._block);
        this._blockLength = 0;
      }
    }

    const digest = new Uint8Array(SHA256_DIGEST_BYTES);
    const view = new DataView(digest.buffer);
    for (let index = 0; index < this._hash.length; index++) view.setUint32(index * 4, this._hash[index]!, false);
    return digest;
  }

  private _compress(block: Uint8Array): void {
    const blockView = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let index = 0; index < 16; index++) this._words[index] = blockView.getUint32(index * 4, false);
    for (let index = 16; index < 64; index++) {
      const value15 = this._words[index - 15]!;
      const value2 = this._words[index - 2]!;
      const sigma0 = rotateRight(value15, 7) ^ rotateRight(value15, 18) ^ (value15 >>> 3);
      const sigma1 = rotateRight(value2, 17) ^ rotateRight(value2, 19) ^ (value2 >>> 10);
      this._words[index] = (this._words[index - 16]! + sigma0 + this._words[index - 7]! + sigma1) >>> 0;
    }

    let a = this._hash[0]!;
    let b = this._hash[1]!;
    let c = this._hash[2]!;
    let d = this._hash[3]!;
    let e = this._hash[4]!;
    let f = this._hash[5]!;
    let g = this._hash[6]!;
    let h = this._hash[7]!;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index]! + this._words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    this._hash[0] = (this._hash[0]! + a) >>> 0;
    this._hash[1] = (this._hash[1]! + b) >>> 0;
    this._hash[2] = (this._hash[2]! + c) >>> 0;
    this._hash[3] = (this._hash[3]! + d) >>> 0;
    this._hash[4] = (this._hash[4]! + e) >>> 0;
    this._hash[5] = (this._hash[5]! + f) >>> 0;
    this._hash[6] = (this._hash[6]! + g) >>> 0;
    this._hash[7] = (this._hash[7]! + h) >>> 0;
  }
}

/** Small-record byte collector used only where canonical bytes themselves are identity input. */
export class CanonicalWaterByteCollector implements CanonicalWaterByteSink {
  private readonly _chunks: Uint8Array[] = [];
  private _byteLength = 0;

  constructor(private readonly _maximumBytes = CANONICAL_WATER_MAXIMUM_SCRATCH_BYTES) {
    requireUint32(_maximumBytes, "Canonical byte collector maximum");
  }

  update(bytes: Uint8Array): void {
    if (this._byteLength + bytes.byteLength > this._maximumBytes) {
      throw new RangeError(`Canonical identity record exceeds ${this._maximumBytes} bytes.`);
    }
    this._chunks.push(bytes.slice());
    this._byteLength += bytes.byteLength;
  }

  bytes(): Uint8Array {
    const result = new Uint8Array(this._byteLength);
    let offset = 0;
    for (const chunk of this._chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

/** Schema-driven writer with explicit little-endian integer encoding and no object/float API. */
export class CanonicalWaterBinaryWriterV1 {
  private readonly _scratch = new Uint8Array(8);
  private readonly _view = new DataView(this._scratch.buffer);

  constructor(private readonly _sink: CanonicalWaterByteSink) {
    if (!_sink || typeof _sink.update !== "function") throw new TypeError("Canonical writer requires a byte sink.");
  }

  writeRecord(domain: string, schemaVersion: number): this {
    this.writeString(domain);
    return this.writeUint16(schemaVersion);
  }

  writeUint8(value: number): this {
    requireUint8(value, "Uint8");
    this._scratch[0] = value;
    return this._emit(1);
  }

  writeUint16(value: number): this {
    requireUint16(value, "Uint16");
    this._view.setUint16(0, value, true);
    return this._emit(2);
  }

  writeUint32(value: number): this {
    requireUint32(value, "Uint32");
    this._view.setUint32(0, value, true);
    return this._emit(4);
  }

  writeInt32(value: number): this {
    requireInt32(value, "Int32");
    this._view.setInt32(0, value, true);
    return this._emit(4);
  }

  writeUint64(value: CanonicalUint64Lanes): this {
    requireUint32(value.low, "Uint64 low lane");
    requireUint32(value.high, "Uint64 high lane");
    this._view.setUint32(0, value.low, true);
    this._view.setUint32(4, value.high, true);
    return this._emit(8);
  }

  writeBoolean(value: boolean): this {
    if (typeof value !== "boolean") throw new TypeError("Canonical Boolean must be true or false.");
    return this.writeUint8(value ? 1 : 0);
  }

  writeOptional<T>(value: T | undefined, write: (writer: this, value: T) => void): this {
    if (value === undefined) return this.writeUint8(0);
    this.writeUint8(1);
    write(this, value);
    return this;
  }

  writeBytes(bytes: Uint8Array): this {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Canonical Bytes must be a Uint8Array.");
    this.writeUint32(bytes.byteLength);
    this._sink.update(bytes);
    return this;
  }

  writeFixedBytes(bytes: Uint8Array, expectedLength: number): this {
    requireUint32(expectedLength, "Fixed byte length");
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expectedLength) {
      throw new RangeError(`Canonical fixed bytes must contain exactly ${expectedLength} bytes.`);
    }
    this._sink.update(bytes);
    return this;
  }

  writeString(value: string): this {
    if (typeof value !== "string") throw new TypeError("Canonical String must be a string.");
    return this.writeBytes(UTF8.encode(value.normalize("NFC")));
  }

  writeArray<T>(values: readonly T[], write: (writer: this, value: T, index: number) => void): this {
    this.writeUint32(values.length);
    for (let index = 0; index < values.length; index++) write(this, values[index]!, index);
    return this;
  }

  private _emit(length: number): this {
    this._sink.update(this._scratch.subarray(0, length));
    return this;
  }
}

export function createCanonicalWaterHashWriter(): {
  readonly writer: CanonicalWaterBinaryWriterV1;
  readonly hash: IncrementalSha256;
} {
  const hash = new IncrementalSha256();
  return Object.freeze({ writer: new CanonicalWaterBinaryWriterV1(hash), hash });
}

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const hash = new IncrementalSha256();
  hash.update(bytes);
  return hash.digestBytes();
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256Bytes(bytes));
}

export function isCanonicalSha256Hex(value: string): boolean {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

export function canonicalSha256HexToBytes(value: string): Uint8Array {
  if (!isCanonicalSha256Hex(value)) throw new TypeError("Expected a lowercase SHA-256 digest.");
  const bytes = new Uint8Array(SHA256_DIGEST_BYTES);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function compareCanonicalBytes(left: Uint8Array, right: Uint8Array): number {
  const sharedLength = Math.min(left.byteLength, right.byteLength);
  for (let index = 0; index < sharedLength; index++) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.byteLength - right.byteLength;
}

export function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const value of bytes) result += value.toString(16).padStart(2, "0");
  return result;
}

function requireUint8(value: number, label: string): void {
  requireIntegerRange(value, 0, 0xff, label);
}

function requireUint16(value: number, label: string): void {
  requireIntegerRange(value, 0, 0xffff, label);
}

function requireUint32(value: number, label: string): void {
  requireIntegerRange(value, 0, 0xffff_ffff, label);
}

function requireInt32(value: number, label: string): void {
  requireIntegerRange(value, -0x8000_0000, 0x7fff_ffff, label);
}

function requireIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer within [${minimum}, ${maximum}].`);
  }
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
