import { readFileSync } from "node:fs";
import createOfficialBrotliEncoderModule from "./generated/encoder-only.mjs";

const UINT32_MAX = 0xffffffff;

interface OfficialBrotliEncoderModule {
  readonly HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _terrain_brotli_max_compressed_size(inputSize: number): number;
  _terrain_brotli_compress(
    input: number,
    inputSize: number,
    quality: number,
    lgwin: number,
    output: number,
    outputCapacity: number,
    outputSize: number
  ): number;
}

/** Official Brotli encoder settings exposed by the Demo asset pipeline. */
export interface OfficialBrotliEncoderOptions {
  /** Compression quality in the official Brotli range 0 through 11. */
  readonly quality?: number;
  /** Base-2 sliding-window size in the official Brotli range 10 through 24. */
  readonly lgwin?: number;
}

/** Official Brotli v1.2.0 encoder used only by build-time asset tools. */
export interface OfficialBrotliEncoder {
  /**
   * Encodes one complete byte sequence as a standard Brotli stream.
   * @param bytes Source bytes.
   * @param options Optional official Brotli quality and window settings.
   * @returns Standard Brotli stream suitable for a `.br` file.
   */
  compress(bytes: Uint8Array, options?: OfficialBrotliEncoderOptions): Uint8Array;
}

/**
 * Loads the encoder-only official Brotli WASM bundled with the Demo build tools.
 * @returns Build-time encoder.
 */
export async function loadOfficialBrotliEncoder(): Promise<OfficialBrotliEncoder> {
  const wasmBinary = new Uint8Array(readFileSync(new URL("./generated/encoder-only.wasm", import.meta.url)));
  const module = (await createOfficialBrotliEncoderModule({ wasmBinary })) as OfficialBrotliEncoderModule;
  return new WasmBrotliEncoder(module);
}

class WasmBrotliEncoder implements OfficialBrotliEncoder {
  private readonly _module: OfficialBrotliEncoderModule;

  constructor(module: OfficialBrotliEncoderModule) {
    this._module = module;
  }

  compress(bytes: Uint8Array, options: OfficialBrotliEncoderOptions = {}): Uint8Array {
    const quality = requireIntegerInRange(options.quality ?? 11, 0, 11, "Brotli quality");
    const lgwin = requireIntegerInRange(options.lgwin ?? 22, 10, 24, "Brotli lgwin");
    requireUint32Size(bytes.byteLength, "Brotli input");
    const capacity = this._module._terrain_brotli_max_compressed_size(bytes.byteLength);
    if (capacity === 0) throw new Error(`Official Brotli cannot encode ${bytes.byteLength} bytes`);
    const input = this._allocate(bytes.byteLength, "Brotli input");
    const output = this._allocate(capacity, "Brotli output");
    const outputSize = this._allocate(Uint32Array.BYTES_PER_ELEMENT, "Brotli output length");
    try {
      this._module.HEAPU8.set(bytes, input);
      if (
        this._module._terrain_brotli_compress(input, bytes.byteLength, quality, lgwin, output, capacity, outputSize) !==
        1
      ) {
        throw new Error("Official Brotli encoder failed");
      }
      return this._module.HEAPU8.slice(output, output + readUint32(this._module.HEAPU8, outputSize));
    } finally {
      this._module._free(outputSize);
      this._module._free(output);
      this._module._free(input);
    }
  }

  private _allocate(size: number, label: string): number {
    const pointer = this._module._malloc(Math.max(1, size));
    if (pointer === 0) throw new Error(`${label} allocation failed for ${size} bytes`);
    return pointer;
  }
}

function requireIntegerInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function requireUint32Size(size: number, label: string): void {
  if (!Number.isInteger(size) || size < 0 || size > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit byte length`);
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, Uint32Array.BYTES_PER_ELEMENT).getUint32(0, true);
}
