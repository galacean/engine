import { KTX2TargetFormat } from "../KTX2TargetFormat";
import { TranscodeResult } from "../TranscodeResult";
import { WorkerPool } from "../WorkerPool";
import { IInitMessage, TranscodeWorkerCode } from "./TranscodeWorkerCode";

/** @internal */
export class BinomialLLCTranscoder {
  public static MessageId = 0;

  private _transcodeWorkerPool: WorkerPool;

  private _initPromise: Promise<any>;

  constructor(public readonly workerLimit: number) {}

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = Promise.all([
      fetch("https://mdn.alipayobjects.com/rms/afts/file/A*nG8SR6vCgXgAAAAAAAAAAAAAARQnAQ/basis_transcoder.js").then(
        (res) => res.text()
      ),
      fetch("https://mdn.alipayobjects.com/rms/afts/file/A*qEUfQ7317KsAAAAAAAAAAAAAARQnAQ/basis_transcoder.wasm").then(
        (res) => res.arrayBuffer()
      )
    ]).then(([jsCode, wasmBuffer]) => {
      const funcCode = TranscodeWorkerCode.toString();
      const transcodeString = funcCode.substring(funcCode.indexOf("{"), funcCode.lastIndexOf("}") + 1);

      const workerCode = `
      ${jsCode}
      ${transcodeString}
      `;

      const workerURL = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));

      this._transcodeWorkerPool = new WorkerPool(this.workerLimit, () => {
        const worker = new Worker(workerURL);
        const msg: IInitMessage = {
          type: "init",
          transcoderWasm: wasmBuffer
        };
        worker.postMessage(msg);
        return worker;
      });
      return this._transcodeWorkerPool.prepareWorker();
      // return Promise.resolve();
    });
    return this._initPromise;
  }

  transcode(
    buffer: ArrayBuffer,
    format: KTX2TargetFormat
  ): Promise<TranscodeResult> {
    return this._transcodeWorkerPool
      .postMessage({
        buffer,
        format,
        type: "transcode"
      })
      .then((ev) => ev.data);
  }

  destroy() {
    this._transcodeWorkerPool.destroy();
  }
}
