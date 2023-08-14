import { IBinomialMessage, TranscodeResult } from "./AbstractTranscoder";

/** @internal */
export function TranscodeWorkerCode() {
  let transcodePromise: Promise<any>;

  enum BasisFormat {
    ETC1 = 0,
    ETC2 = 1,
    BC1 = 2,
    BC3 = 3,
    BC4 = 4,
    BC5 = 5,
    BC7 = 7,
    PVRTC1_4_RGB = 8,
    PVRTC1_4_RGBA = 9,
    ASTC_4x4 = 10,
    RGBA8 = 13
  }

  enum TargetFormat {
    ASTC,
    BC7,
    BC1_BC3,
    PVRTC,
    ETC,
    R8,
    RG8,
    RGBA8
  }

  function concat(arrays: Uint8Array[]) {
    if (arrays.length === 1) return arrays[0];
    let totalByteLength = 0;

    for (let i = 0; i < arrays.length; i++) {
      totalByteLength += arrays[i].byteLength;
    }

    const result = new Uint8Array(totalByteLength);

    let byteOffset = 0;

    for (let i = 0; i < arrays.length; i++) {
      result.set(arrays[i], byteOffset);
      byteOffset += arrays[i].byteLength;
    }

    return result;
  }

  self.onmessage = function onmessage(event: MessageEvent<IBinomialMessage>) {
    const message = event.data;

    switch (message.type) {
      case "init":
        init(message.transcoderWasm)
          .then(() => self.postMessage("init-completed"))
          .catch((e) => self.postMessage({ error: e }));
        break;
      case "transcode":
        transcodePromise
          .then((KTX2File) => {
            const result = transcode(message.buffer, message.format, KTX2File);
            // @ts-ignore
            result.type = "transcoded";
            self.postMessage(result);
          })
          .catch((e) => self.postMessage({ error: e }));
        break;
    }
  };

  function getTranscodeFormatFromTarget(target: TargetFormat, hasAlpha: boolean) {
    switch (target) {
      case TargetFormat.BC1_BC3:
        return hasAlpha ? BasisFormat.BC3 : BasisFormat.BC1;
      case TargetFormat.ETC:
        return hasAlpha ? BasisFormat.ETC2 : BasisFormat.ETC1;
      case TargetFormat.PVRTC:
        return hasAlpha ? BasisFormat.PVRTC1_4_RGBA : BasisFormat.PVRTC1_4_RGB;
      case TargetFormat.RGBA8:
        return BasisFormat.RGBA8;
      case TargetFormat.ASTC:
        return BasisFormat.ASTC_4x4;
      case TargetFormat.BC7:
        return BasisFormat.BC7;
    }
  }

  function init(wasmBinary: ArrayBuffer) {
    transcodePromise = new Promise((resolve, reject) => {
      const BasisModule = {
        wasmBinary,
        onRuntimeInitialized: () => {
          resolve(BasisModule);
        },
        onAbort: (e) => {
          reject(e);
        }
      };
      self["BASIS"](BasisModule);
    }).then((BasisModule: any) => {
      BasisModule.initializeBasis();
      return BasisModule.KTX2File;
    });
    return transcodePromise;
  }

  function transcode(buffer: ArrayBuffer, targetFormat: TargetFormat, KTX2File: any): TranscodeResult {
    const ktx2File = new KTX2File(new Uint8Array(buffer));

    function cleanup() {
      ktx2File.close();
      ktx2File.delete();
    }

    if (!ktx2File.isValid()) {
      cleanup();
      throw new Error("Invalid or unsupported .ktx2 file");
    }

    const width = ktx2File.getWidth();
    const height = ktx2File.getHeight();
    const layerCount = ktx2File.getLayers() || 1;
    const levelCount = ktx2File.getLevels();
    const hasAlpha = ktx2File.getHasAlpha();
    const faceCount = ktx2File.getFaces();
    const format = getTranscodeFormatFromTarget(targetFormat, hasAlpha);
    const faces = new Array(faceCount);

    for (let face = 0; face < faceCount; face++) {
      const mipmaps = new Array(levelCount);
      for (let mip = 0; mip < levelCount; mip++) {
        const layerMips: Uint8Array[] = new Array(layerCount);
        let mipWidth, mipHeight;

        for (let layer = 0; layer < layerCount; layer++) {
          const levelInfo = ktx2File.getImageLevelInfo(mip, layer, face);
          mipWidth = levelInfo.origWidth;
          mipHeight = levelInfo.origHeight;
          const dst = new Uint8Array(ktx2File.getImageTranscodedSizeInBytes(mip, layer, 0, format));

          const status = ktx2File.transcodeImage(dst, mip, layer, face, format, 0, -1, -1);

          if (!status) {
            cleanup();
            throw new Error("transcodeImage failed.");
          }
          layerMips[layer] = dst;
        }

        mipmaps[mip] = {
          data: concat(layerMips),
          width: mipWidth,
          height: mipHeight
        };
      }
      faces[face] = mipmaps;
    }

    cleanup();

    return {
      faces,
      width,
      height,
      hasAlpha,
      faceCount: faceCount,
      format: format!
    };
  }
}
