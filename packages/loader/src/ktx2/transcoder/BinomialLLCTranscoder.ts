import { KTX2TargetFormat } from "../KTX2TargetFormat";
import { AbstractTranscoder, TranscodeResult } from "./AbstractTranscoder";
import { TranscodeWorkerCode, init, transcode, _init } from "./BinomialLLCWorkerCode";

/** @internal */
export class BinomialLLCTranscoder extends AbstractTranscoder {
  constructor(workerLimitCount: number) {
    super(workerLimitCount);
  }

  _initTranscodeWorkerPool() {
    return Promise.all([
      fetch("https://mdn.alipayobjects.com/rms/afts/file/A*nG8SR6vCgXgAAAAAAAAAAAAAARQnAQ/basis_transcoder.js").then(
        (res) => res.text()
      ),
      fetch("https://mdn.alipayobjects.com/rms/afts/file/A*qEUfQ7317KsAAAAAAAAAAAAAARQnAQ/basis_transcoder.wasm").then(
        (res) => res.arrayBuffer()
      )
    ]).then(([jsCode, wasmBuffer]) => {
      if (this.workerLimitCount === 0) {
        return new Promise<any>((resolve, reject) => {
          const scriptDom = document.createElement("script");
          scriptDom.src = URL.createObjectURL(new Blob([jsCode], { type: "application/javascript" }));
          document.body.appendChild(scriptDom);
          scriptDom.onload = () => {
            init(wasmBuffer).then(() => {
              resolve(null);
            });
          };
          scriptDom.onerror = () => {
            reject();
          };
        });
      } else {
        const funcCode = TranscodeWorkerCode.toString();
        const transcodeString = funcCode.substring(funcCode.indexOf("{"), funcCode.lastIndexOf("}") + 1);

        const workerCode = `
        ${jsCode}
        var init = (${_init.toString()})();
        ${transcode.toString()}
        ${transcodeString}
        `;

        const workerURL = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));

        return this._createTranscodePool(workerURL, wasmBuffer);
      }
    });
  }

  transcode(buffer: ArrayBuffer, format: KTX2TargetFormat): Promise<TranscodeResult> {
    if (this.workerLimitCount === 0) {
      return init().then((KTX2File) => transcode(buffer, format, KTX2File));
    } else {
      return this._transcodeWorkerPool.postMessage({
        buffer,
        format,
        type: "transcode"
      });
    }
  }
}
