import createOfficialBrotliDecoderModule from "./generated/decoder-only.mjs";

const UINT32_MAX = 0xffffffff;

interface OfficialBrotliDecoderModule {
  readonly HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _terrain_brotli_decompress(
    input: number,
    inputSize: number,
    output: number,
    outputCapacity: number,
    outputSize: number
  ): number;
}

/** Bounded official Brotli v1.2.0 decoder used by Demo-private resource loaders. */
export interface OfficialBrotliDecoder {
  /**
   * Restores one complete Brotli stream.
   * @param bytes Encoded Brotli stream.
   * @param expectedSize Exact decoded byte count declared by the Project resource.
   * @returns Decoded bytes.
   * @throws If allocation fails, the stream is invalid, or the decoded size differs.
   */
  decompress(bytes: Uint8Array, expectedSize: number): Uint8Array;
}

let decoderTask: Promise<OfficialBrotliDecoder> | undefined;

/**
 * Loads the decoder-only official Brotli WASM once for all Demo asset requests.
 * @param wasmBinary Optional build-time WASM bytes for environments without browser URL loading.
 * @returns Shared synchronous decoder after WASM initialization.
 */
export function loadOfficialBrotliDecoder(wasmBinary?: Uint8Array): Promise<OfficialBrotliDecoder> {
  return (decoderTask ??= createOfficialBrotliDecoderModule(wasmBinary ? { wasmBinary } : undefined).then(
    (module) => new WasmBrotliDecoder(module as OfficialBrotliDecoderModule)
  ));
}

class WasmBrotliDecoder implements OfficialBrotliDecoder {
  private readonly _module: OfficialBrotliDecoderModule;

  constructor(module: OfficialBrotliDecoderModule) {
    this._module = module;
  }

  decompress(bytes: Uint8Array, expectedSize: number): Uint8Array {
    requireUint32Size(bytes.byteLength, "Brotli input");
    requireUint32Size(expectedSize, "Brotli expected output");
    const input = this._allocate(bytes.byteLength, "Brotli input");
    const output = this._allocate(expectedSize, "Brotli output");
    const outputSize = this._allocate(Uint32Array.BYTES_PER_ELEMENT, "Brotli output length");
    try {
      this._module.HEAPU8.set(bytes, input);
      if (this._module._terrain_brotli_decompress(input, bytes.byteLength, output, expectedSize, outputSize) !== 1) {
        throw new Error("Official Brotli decoder rejected the payload");
      }
      const decodedSize = readUint32(this._module.HEAPU8, outputSize);
      if (decodedSize !== expectedSize) {
        throw new Error(`Official Brotli decoder produced ${decodedSize} bytes; expected ${expectedSize}`);
      }
      return this._module.HEAPU8.slice(output, output + decodedSize);
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

function requireUint32Size(size: number, label: string): void {
  if (!Number.isInteger(size) || size < 0 || size > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit byte length`);
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, Uint32Array.BYTES_PER_ELEMENT).getUint32(0, true);
}
