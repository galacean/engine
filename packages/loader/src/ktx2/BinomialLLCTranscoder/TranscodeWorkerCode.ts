type MessageType = "init" | "transcode";

export interface IBaseMessage {
  type: MessageType;
}

export interface IInitMessage extends IBaseMessage {
  type: "init";
  transcoderWasm: ArrayBuffer;
}

export interface ITranscodeMessage extends IBaseMessage {
  type: "transcode";
  format: number;
  buffer: ArrayBuffer;
}

export type IMessage = IInitMessage | ITranscodeMessage;

export type TranscodeResult = {
  width: number;
  height: number;
  hasAlpha: boolean;
  format: number;
  faces: Array<{ data: Uint8Array; width: number; height: number }>[];
  faceCount: number;
};

export type TranscodeResponse = {
  id: number;
  type: "transcoded";
} & TranscodeResult;

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
    PVRTC1_4_RGB = 8,
    PVRTC1_4_RGBA = 9,
    RGBA8 = 13
  }

  enum TargetFormat {
    ASTC,
    BC7,
    DXT,
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

  self.onmessage = function onmessage(event: MessageEvent<IMessage>) {
    const message = event.data;

    switch (message.type) {
      case "init":
        init(message.transcoderWasm).then(() => self.postMessage("init-completed"));
        break;
      case "transcode":
        transcodePromise.then((KTX2File) => {
          try {
            const result = transcode(message.buffer, message.format, KTX2File);
            // @ts-ignore
            result.type = "transcoded";
            self.postMessage(result);
          } catch (error) {
            self.postMessage({
              type: "error",
              error: error.message
            });
          }
        });
        break;
    }
  };

  function getTranscodeFormatFromTarget(target: TargetFormat, hasAlpha: boolean) {
    if (target === TargetFormat.DXT) {
      if (hasAlpha) {
        return BasisFormat.BC3;
      } else {
        return BasisFormat.BC1;
      }
    }
    if (target === TargetFormat.ETC) {
      if (hasAlpha) {
        return BasisFormat.ETC2;
      } else {
        return BasisFormat.ETC1;
      }
    }
    if (target === TargetFormat.PVRTC) {
      if (hasAlpha) {
        return BasisFormat.PVRTC1_4_RGBA;
      } else {
        return BasisFormat.PVRTC1_4_RGB;
      }
    }
    if (target === TargetFormat.RGBA8) {
      return BasisFormat.RGBA8;
    }
  }

  function init(wasmBinary: ArrayBuffer) {
    transcodePromise = new Promise((resolve) => {
      const BasisModule = {
        wasmBinary,
        onRuntimeInitialized: () => {
          resolve(BasisModule);
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
