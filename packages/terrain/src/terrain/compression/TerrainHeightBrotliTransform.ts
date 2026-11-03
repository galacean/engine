/** Canonical Height R16 bytes and layout used by the reversible delta transform. */
export interface TerrainHeightTransformInput {
  /** Height sample count on the local X axis. */
  readonly width: number;
  /** Height sample count on the local Z axis. */
  readonly height: number;
  /** Canonical little-endian unsigned 16-bit height samples. */
  readonly bytes: Uint8Array;
}

/**
 * Converts canonical Height R16 samples into a lossless delta and VarUint byte stream.
 * @param input Canonical Height R16 bytes and dimensions.
 * @returns Intermediate bytes suitable for official Brotli encoding.
 */
export function prepareTerrainHeightForBrotli(input: TerrainHeightTransformInput): Uint8Array {
  validateCanonicalInput(input);
  const samples = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const writer = new ByteWriter(input.bytes.byteLength);
  let previousRowFirst = 0;
  for (let y = 0; y < input.height; y++) {
    let previous = 0;
    for (let x = 0; x < input.width; x++) {
      const sample = samples.getUint16((y * input.width + x) * Uint16Array.BYTES_PER_ELEMENT, true);
      if (x === 0 && y === 0) writer.writeVarUint(sample);
      else writer.writeVarUint(zigZagEncode(sample - (x === 0 ? previousRowFirst : previous)));
      if (x === 0) previousRowFirst = sample;
      previous = sample;
    }
  }
  return writer.finish();
}

/**
 * Restores one Height R16 delta stream to its canonical little-endian byte sequence.
 * @param width Height sample count on the local X axis.
 * @param height Height sample count on the local Z axis.
 * @param prepared Decoded delta and VarUint byte stream.
 * @returns Canonical Height R16 bytes.
 */
export function restoreTerrainHeightFromBrotli(width: number, height: number, prepared: Uint8Array): Uint8Array {
  validateDimensions(width, height);
  const bytes = new Uint8Array(width * height * Uint16Array.BYTES_PER_ELEMENT);
  const samples = new DataView(bytes.buffer);
  const reader = new ByteReader(prepared);
  let previousRowFirst = 0;
  for (let y = 0; y < height; y++) {
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const sample =
        x === 0 && y === 0
          ? reader.readVarUint()
          : (x === 0 ? previousRowFirst : previous) + zigZagDecode(reader.readVarUint());
      if (sample < 0 || sample > 0xffff) throw new Error("Terrain Height delta escaped uint16 range");
      samples.setUint16((y * width + x) * Uint16Array.BYTES_PER_ELEMENT, sample, true);
      if (x === 0) previousRowFirst = sample;
      previous = sample;
    }
  }
  reader.assertComplete();
  return bytes;
}

function validateCanonicalInput(input: TerrainHeightTransformInput): void {
  validateDimensions(input.width, input.height);
  if (input.bytes.byteLength !== input.width * input.height * Uint16Array.BYTES_PER_ELEMENT) {
    throw new Error("Terrain Height payload byte length does not match its declared layout");
  }
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Terrain Height payload dimensions must be positive integers");
  }
}

function zigZagEncode(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}

function zigZagDecode(value: number): number {
  return value & 1 ? -(value + 1) / 2 : value / 2;
}

class ByteWriter {
  private _bytes: Uint8Array;
  private _length = 0;

  constructor(capacity: number) {
    this._bytes = new Uint8Array(Math.max(16, capacity));
  }

  writeVarUint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("Terrain Height VarUint is invalid");
    }
    while (value >= 0x80) {
      this._writeByte((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    this._writeByte(value);
  }

  finish(): Uint8Array {
    return this._bytes.slice(0, this._length);
  }

  private _writeByte(value: number): void {
    if (this._length === this._bytes.byteLength) {
      const expanded = new Uint8Array(this._bytes.byteLength * 2);
      expanded.set(this._bytes);
      this._bytes = expanded;
    }
    this._bytes[this._length++] = value;
  }
}

class ByteReader {
  private _offset = 0;
  private readonly _bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this._bytes = bytes;
  }

  readVarUint(): number {
    let value = 0;
    let factor = 1;
    for (let index = 0; index < 5; index++) {
      if (this._offset >= this._bytes.byteLength) throw new Error("Terrain Height VarUint is truncated");
      const byte = this._bytes[this._offset++];
      value += (byte & 0x7f) * factor;
      if ((byte & 0x80) === 0) return value;
      factor *= 128;
    }
    throw new Error("Terrain Height VarUint exceeds uint32");
  }

  assertComplete(): void {
    if (this._offset !== this._bytes.byteLength) throw new Error("Terrain Height payload contains trailing bytes");
  }
}
