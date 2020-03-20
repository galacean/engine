import { Logger } from "@alipay/o3-base";
import { decoderJSString, decoderWASMWrapperString, decoderWASMBase64 } from "@alipay/o3-draco-lib";

import { DRACOWorker, ITaskConfig } from "./DRACOWorker";

import workerString from "./worker/worker.js";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export class DRACODecoder {
  private pool: DRACOWorker[] = [];
  private workerLimit = Math.min(navigator.hardwareConcurrency || 4, 4);
  private workerSourceURL: string;
  private decoderWASMBinary: ArrayBuffer;
  private useJS: boolean;
  private currentTaskId: number = 1;
  private taskCache = new WeakMap();

  constructor(config: IDecoderConfig = { type: "wasm", workerLimit: 4 }) {
    if (config.workerLimit > this.workerLimit) {
      Logger.warn("DRACOWorkerPool: Can not initialize worker pool with limit:" + config.workerLimit);
    } else {
      this.workerLimit = config.workerLimit;
    }
    this.useJS = typeof WebAssembly !== "object" || config.type === "js";
    const workerStrings = [this.useJS ? decoderJSString : decoderWASMWrapperString, workerString];
    const body = workerStrings.join("\n");
    this.workerSourceURL = URL.createObjectURL(new Blob([body]));
    if (!this.useJS) {
      this.decoderWASMBinary = base64ToArrayBuffer(decoderWASMBase64);
    }
  }

  private getWorker(): DRACOWorker {
    if (this.pool.length < this.workerLimit) {
      const dracoWorker = new DRACOWorker(this.workerSourceURL, this.decoderWASMBinary);
      this.pool.push(dracoWorker);
    } else {
      this.pool.sort(function(a, b) {
        return a.currentLoad > b.currentLoad ? -1 : 1;
      });
    }
    return this.pool[this.pool.length - 1];
  }

  decode(buffer: ArrayBuffer, taskConfig: ITaskConfig): Promise<any> {
    const taskKey = JSON.stringify(taskConfig);

    // Check for an existing task using this buffer. A transferred buffer cannot be transferred
    // again from this thread.
    if (this.taskCache.has(buffer)) {
      const cachedTask = this.taskCache.get(buffer);
      if (cachedTask.key === taskKey) {
        return cachedTask.promise;
      } else if (buffer.byteLength === 0) {
        // 使用transferable传递数据后，原来环境中的数据会被清除，所以这里判断byteLength为0代表已经传输过
        // Technically, it would be possible to wait for the previous task to complete,
        // transfer the buffer back, and decode again with the second configuration. That
        // is complex, and I don't know of any reason to decode a Draco buffer twice in
        // different ways, so this is left unimplemented.
        throw new Error(
          "DRACODecoder: Unable to re-decode a buffer with different " +
            "settings. Buffer has already been transferred."
        );
      }
    }

    const taskId = this.currentTaskId++;
    const cost = buffer.byteLength;

    const worker = this.getWorker();
    worker.setCosts(taskId, cost);
    worker.addCurrentLoad(cost);
    const task = new Promise((resolve, reject) => {
      worker.setCallback(taskId, resolve, reject);
      worker.decode(taskId, taskConfig, buffer);
    });
    task.finally(() => {
      if (worker && taskId) {
        worker.releaseTask(taskId);
      }
    });

    this.taskCache.set(buffer, {
      key: taskKey,
      promise: task
    });
    return task;
  }
}

interface IDecoderConfig {
  type?: "js" | "wasm";
  workerLimit?: number;
}
