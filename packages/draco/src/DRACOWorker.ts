import { Logger } from "@oasis-engine/core";

export class DRACOWorker {
  // worker 实例
  private _worker: Worker;
  // 记录每一个 task 的 byteLength
  private _costs: { [taskId: number]: number } = {};
  // 当前政治处理的所有 task 的 byteLength 的和，排序用
  private _currentLoad: number = 0;
  private _callbacks: { [taskId: number]: IResolveReject } = {};
  get currentLoad(): number {
    return this._currentLoad;
  }

  constructor(workerSourceURL: string, decoderWASMBinary?: ArrayBuffer) {
    this._worker = new Worker(workerSourceURL);
    this._worker.onmessage = (e) => {
      const message = e.data;
      switch (message.type) {
        case "decode":
          this._callbacks[message.id].resolve(message.geometry);
          break;

        case "error":
          this._callbacks[message.id].reject(message);
          break;
        default:
          Logger.error('DRACOWorker: Unexpected message, "' + message.type + '"');
      }
    };
    if (decoderWASMBinary) {
      this._worker.postMessage({ type: "init", decoderConfig: { wasmBinary: decoderWASMBinary } });
    } else {
      this._worker.postMessage({ type: "init", decoderConfig: {} });
    }
  }

  setCosts(taskId: number, cost: number) {
    this._costs[taskId] = cost;
  }

  addCurrentLoad(cost: number) {
    this._currentLoad += cost;
  }

  setCallback(taskId: number, resolve: (any) => void, reject: (any) => void) {
    this._callbacks[taskId] = { resolve, reject };
  }

  decode(taskId: number, taskConfig: ITaskConfig, buffer: ArrayBuffer) {
    this._worker.postMessage({ type: "decode", id: taskId, taskConfig, buffer }, [buffer]);
  }

  releaseTask(taskId: number) {
    this._currentLoad -= this._costs[taskId];
    delete this._callbacks[taskId];
    delete this._costs[taskId];
  }
}

interface IResolveReject {
  resolve: (any) => void;
  reject: (any) => void;
}

export interface ITaskConfig {
  attributeIDs: { [attribute: string]: number };
  attributeTypes: { [attribute: string]: string };
  useUniqueIDs: boolean;
  indexType: string;
}
