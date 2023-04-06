import { Logger, request } from "@galacean/engine-core";

import { DRACOWorker, ITaskConfig } from "./DRACOWorker";

import workerString from "./worker/worker.js";

const LIB_PATH = "https://gw.alipayobjects.com/os/lib/alipay/draco-javascript/1.3.6/lib/";
const JS_FILE = "draco_decoder_gltf.js";

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

    return new Promise((resolve, reject) => {
      if (this.useJS) {
        request(`${LIB_PATH}${JS_FILE}`, { type: "text" })
          .then((jsSource) => {
            const body = [jsSource, workerString].join("\n");
            const workerSourceURL = URL.createObjectURL(new Blob([body]));
            resolve({ workerSourceURL, decoderWASMBinary: null });
          })
          .catch((reason) => {
            reject(reason);
          });
      } else {
        Promise.all([
          request(`${LIB_PATH}${WASM_WRAPPER_FILE}`, { type: "text" }),
          request(`${LIB_PATH}${WASM_FILE}`, { type: "arraybuffer" })
        ])
          .then((resources) => {
            const [wrapperSource, decoderWASMBinary] = resources;
            const body = [wrapperSource, workerString].join("\n");
            const workerSourceURL = URL.createObjectURL(new Blob([body]));
            resolve({ workerSourceURL, decoderWASMBinary });
          })
          .catch((reason) => {
            reject(reason);
          });
      }
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

    // Check for an existing task using this buffer. A transferred buffer cannot be transferred.
    // again from this thread.
    if (this.taskCache.has(buffer)) {
      const cachedTask = this.taskCache.get(buffer);
      if (cachedTask.key === taskKey) {
        return cachedTask.promise;
      } else if (buffer.byteLength === 0) {
        // After using transferable to transfer data, the data in the original environment will be cleared, so it is judged that byteLength is 0, which means it has been transferred.
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
