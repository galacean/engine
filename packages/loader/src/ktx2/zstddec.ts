/* eslint-disable @typescript-eslint/naming-convention */
/**
 * From https://github.com/donmccurdy/zstddec by Don McCurdy
 */
interface DecoderExports {
  memory: Uint8Array;

  ZSTD_findDecompressedSize: (
    compressedPtr: number,
    compressedSize: number
  ) => number;
  ZSTD_decompress: (
    uncompressedPtr: number,
    uncompressedSize: number,
    compressedPtr: number,
    compressedSize: number
  ) => number;
  malloc: (ptr: number) => number;
  free: (ptr: number) => void;
}


/**
 * ZSTD (Zstandard) decoder.
 */
export class ZSTDDecoder {
  public static heap: Uint8Array;
  public static IMPORT_OBJECT = {
    env: {
      emscripten_notify_memory_growth: function (): void {
        ZSTDDecoder.heap = new Uint8Array(
          ZSTDDecoder.instance.exports.memory.buffer
        );
      },
    },
  };
  public static instance: { exports: DecoderExports };
  public static WasmModuleURL = "https://preview.babylonjs.com/zstddec.wasm";

  public _initPromise: Promise<any>;

  init(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = fetch(ZSTDDecoder.WasmModuleURL)
        .then((response) => {
          if (response.ok) {
            return response.arrayBuffer();
          }
          throw new Error(
            `Could not fetch the wasm component for the Zstandard decompression lib: ${response.status} - ${response.statusText}`
          );
        })
        .then((arrayBuffer) =>
          WebAssembly.instantiate(arrayBuffer, ZSTDDecoder.IMPORT_OBJECT)
        )
        .then(this._init);
    }
    return this._initPromise;
  }

  _init(result: WebAssembly.WebAssemblyInstantiatedSource): void {
    ZSTDDecoder.instance = result.instance as unknown as {
      exports: DecoderExports;
    };

    ZSTDDecoder.IMPORT_OBJECT.env.emscripten_notify_memory_growth(); // initialize heap.
  }

  decode(array: Uint8Array, uncompressedSize = 0): Uint8Array {
    if (!ZSTDDecoder.instance) {
      throw new Error(`ZSTDDecoder: Await .init() before decoding.`);
    }

    // Write compressed data into WASM memory.
    const compressedSize = array.byteLength;
    const compressedPtr = ZSTDDecoder.instance.exports.malloc(compressedSize);
    ZSTDDecoder.heap.set(array, compressedPtr);

    // Decompress into WASM memory.
    uncompressedSize =
      uncompressedSize ||
      Number(
        ZSTDDecoder.instance.exports.ZSTD_findDecompressedSize(
          compressedPtr,
          compressedSize
        )
      );
    const uncompressedPtr =
      ZSTDDecoder.instance.exports.malloc(uncompressedSize);
    const actualSize = ZSTDDecoder.instance.exports.ZSTD_decompress(
      uncompressedPtr,
      uncompressedSize,
      compressedPtr,
      compressedSize
    );

    // Read decompressed data and free WASM memory.
    const dec = ZSTDDecoder.heap.slice(
      uncompressedPtr,
      uncompressedPtr + actualSize
    );
    ZSTDDecoder.instance.exports.free(compressedPtr);
    ZSTDDecoder.instance.exports.free(uncompressedPtr);

    return dec;
  }
}

window['zstd'] = ZSTDDecoder

/**
 * BSD License
 *
 * For Zstandard software
 *
 * Copyright (c) 2016-present, Yann Collet, Facebook, Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 *  * Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 *  * Neither the name Facebook nor the names of its contributors may be used to
 *    endorse or promote products derived from this software without specific
 *    prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
