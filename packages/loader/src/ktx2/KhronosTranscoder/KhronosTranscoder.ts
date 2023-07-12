import { KTX2Container, SupercompressionScheme } from "../KTX2Container";
import { KTX2TargetFormat } from "../KTX2TargetFormat";
import { WorkerPool } from "../WorkerPool";
import {
  EncodedData,
  IInitMessage,
  IMessage,
  ITranscodeMessage,
  TranscodeResult,
  TranscodeWorkerCode
} from "./TranscoderWorkerCode";

/** @internal */
export class KhronosTranscoder {
  public static transcoderMap = {
    // TODO: support bc7
    [KTX2TargetFormat.ASTC]:
      "https://mdn.alipayobjects.com/rms/afts/file/A*0jiKRK6D1-kAAAAAAAAAAAAAARQnAQ/uastc_astc.wasm"
  };

  private _transcodeWorkerPool: WorkerPool<IMessage, TranscodeResult>;
  private _initPromise: Promise<any>;

  constructor(public readonly workerLimitCount: number, public readonly type: KTX2TargetFormat) {
    if (!KhronosTranscoder.transcoderMap[type]) {
      throw `khronos decoder does not support type: ${type}`;
    }
  }

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = fetch(KhronosTranscoder.transcoderMap[this.type])
      .then((res) => res.arrayBuffer())
      .then((wasmBuffer) => {
        const funcCode = TranscodeWorkerCode.toString();
        const transcodeString = funcCode.substring(funcCode.indexOf("{") + 1, funcCode.lastIndexOf("}"));

        const workerCode = `${transcodeString}`;

        const workerURL = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));

        this._transcodeWorkerPool = new WorkerPool(this.workerLimitCount, () => {
          const worker = new Worker(workerURL);
          const msg: IInitMessage = {
            type: "init",
            transcoderWasm: wasmBuffer
          };
          worker.postMessage(msg);
          return worker;
        });

        return this._transcodeWorkerPool.prepareWorker();
      });
    return this._initPromise;
  }

  transcode(ktx2Container: KTX2Container): Promise<TranscodeResult> {
    const needZstd = ktx2Container.supercompressionScheme === SupercompressionScheme.Zstd;

    const levelCount = ktx2Container.levels.length;
    const faceCount = ktx2Container.faceCount;

    const decodedData: any = {
      width: ktx2Container.pixelWidth,
      height: ktx2Container.pixelHeight,
      mipmaps: null
    };

    const postMessageData: ITranscodeMessage = {
      type: "transcode",
      format: 0,
      needZstd,
      data: new Array<EncodedData[]>(faceCount)
    };

    const messageData = postMessageData.data;

    for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
      const mipmapData = new Array(levelCount);
      for (let mipmapIndex = 0; mipmapIndex < levelCount; mipmapIndex++) {
        const level = ktx2Container.levels[mipmapIndex];
        const levelWidth = Math.floor(ktx2Container.pixelWidth / (1 << mipmapIndex)) || 1;
        const levelHeight = Math.floor(ktx2Container.pixelHeight / (1 << mipmapIndex)) || 1;
        const originBuffer = level.levelData.buffer;
        const originOffset = level.levelData.byteOffset;
        const originByteLength = level.levelData.byteLength;

        mipmapData[mipmapIndex] = {
          buffer: new Uint8Array(originBuffer, originOffset, originByteLength),
          levelWidth,
          levelHeight,
          uncompressedByteLength: level.uncompressedByteLength
        };
      }
      messageData[faceIndex] = mipmapData;
    }

    return this._transcodeWorkerPool.postMessage(postMessageData).then((message) => {
      decodedData.faces = message.data;
      decodedData.hasAlpha = true;
      return decodedData;
    });
  }

  destroy() {
    this._transcodeWorkerPool.destroy();
  }
}
