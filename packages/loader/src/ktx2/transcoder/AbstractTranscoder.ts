import { WorkerPool } from "../WorkerPool";

export abstract class AbstractTranscoder {
  protected _transcodeWorkerPool: WorkerPool;
  protected _initPromise: Promise<any>;

  constructor(public readonly workerLimitCount: number) {}

  init() {
    if (!this._initPromise) {
      this._initPromise = this._initTranscodeWorkerPool();
    }
    return this._initPromise;
  }

  destroy() {
    this._transcodeWorkerPool.destroy();
  }

  protected abstract _initTranscodeWorkerPool(): Promise<any>;

  protected _createTranscodePool(workerURL: string, wasmBuffer: ArrayBuffer) {
    this._transcodeWorkerPool = new WorkerPool(this.workerLimitCount, () => {
      return new Promise<Worker>((resolve, reject) => {
        const worker = new Worker(workerURL);
        const msg: InitMessage = {
          type: "init",
          transcoderWasm: wasmBuffer
        };
        function onMessage(e: MessageEvent<{ error?: Error }>) {
          if (e.data.error) {
            reject(e.data.error);
          } else {
            console.log("worker created");
            resolve(worker);
          }
        }
        worker.addEventListener("message", onMessage);
        worker.postMessage(msg);
      });
    });
    return this._transcodeWorkerPool.prepareWorker();
  }
}

type MessageType = "init" | "transcode";

export interface BaseMessage {
  type: MessageType;
}

export interface InitMessage extends BaseMessage {
  type: "init";
  transcoderWasm: ArrayBuffer;
}

export interface BinomialTranscodeMessage extends BaseMessage {
  type: "transcode";
  format: number;
  buffer: ArrayBuffer;
}

export type IBinomialMessage = InitMessage | BinomialTranscodeMessage;

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

export interface EncodedData {
  buffer: Uint8Array;
  levelWidth: number;
  levelHeight: number;
  uncompressedByteLength: number;
}

export interface KhronosTranscoderMessage extends BaseMessage {
  type: "transcode";
  format: number;
  needZstd: boolean;
  data: EncodedData[][];
}

export type IKhronosMessageMessage = InitMessage | KhronosTranscoderMessage;
