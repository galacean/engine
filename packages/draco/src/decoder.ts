import { Logger, request } from "@oasis-engine/core";

import { DRACOWorker, ITaskConfig } from "./DRACOWorker";

import workerString from "./worker/worker.js";

const LIB_PATH = "https://gw.alipayobjects.com/os/lib/alipay/draco-javascript/1.3.6/lib/";
const JS_FILE = "draco_decoder_gltf.js";
// basement cdn 不支持wasm后缀，暂时用r3bin后缀代替
const WASM_FILE = "draco_decoder_gltf.r3bin";
const WASM_WRAPPER_FILE = "draco_wasm_wrapper_gltf.js";

export class DRACODecoder {
  private pool: DRACOWorker[] = [];
  private workerLimit = Math.min(navigator.hardwareConcurrency || 4, 4);
  private useJS: boolean;
  private currentTaskId: number = 1;
  private taskCache = new WeakMap();
  private loadLibPromise: Promise<any>;

  constructor(config: IDecoderConfig = { type: "wasm", workerLimit: 4 }) {
    if (config.workerLimit > this.workerLimit) {
      Logger.warn("DRACOWorkerPool: Can not initialize worker pool with limit:" + config.workerLimit);
    } else {
      this.workerLimit = config.workerLimit ?? 4;
    }
    this.useJS = typeof WebAssembly !== "object" || config.type === "js";
    this.loadLibPromise = this.preloadLib();
  }

  private preloadLib(): Promise<any> {
    if (this.loadLibPromise) {
      return this.loadLibPromise;
    }
    const promiseQueue = [];
    if (this.useJS) {
      promiseQueue.push(request(`${LIB_PATH}${JS_FILE}`, { type: "text" }));
    } else {
      promiseQueue.push(request(`${LIB_PATH}${WASM_WRAPPER_FILE}`, { type: "text" }));
      promiseQueue.push(request(`${LIB_PATH}${WASM_FILE}`, { type: "arraybuffer" }));
    }
    return new Promise((resolve, reject) => {
      Promise.all(promiseQueue)
        .then((resources) => {
          const workerStrings = [resources[0], workerString];
          const body = workerStrings.join("\n");
          const workerSourceURL = URL.createObjectURL(new Blob([body]));
          let decoderWASMBinary = this.useJS ? null : resources[1];
          resolve({ workerSourceURL, decoderWASMBinary });
        })
        .catch((reason) => {
          reject(reason);
        });
    });
  }

  private getWorker(): Promise<DRACOWorker> {
    return this.preloadLib().then((worderResources) => {
      if (this.pool.length < this.workerLimit) {
        const dracoWorker = new DRACOWorker(worderResources.workerSourceURL, worderResources.decoderWASMBinary);
        this.pool.push(dracoWorker);
      } else {
        this.pool.sort(function (a, b) {
          return a.currentLoad > b.currentLoad ? -1 : 1;
        });
      }
      return this.pool[this.pool.length - 1];
    });
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
    let taskWorker;
    const task = new Promise((resolve, reject) => {
      this.getWorker()
        .then((worker) => {
          taskWorker = worker;
          worker.setCosts(taskId, cost);
          worker.addCurrentLoad(cost);

          worker.setCallback(taskId, resolve, reject);
          worker.decode(taskId, taskConfig, buffer);
        })
        .catch((e) => {
          reject(e);
        });
    });
    task.finally(() => {
      if (taskWorker && taskId) {
        taskWorker.releaseTask(taskId);
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
