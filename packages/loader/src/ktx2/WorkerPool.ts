// @ts-nocheck
interface TaskItem<T, U> {
  message: T;
  transfer?: Array<Transferable>;
  resolve: (item: U | PromiseLike<U>) => void;
  reject: (reason?: any) => void;
}

/**
 * @internal
 * WorkerPool, T is return type, U is post message type.
 */
export class WorkerPool<T = any, U = any> {
  private _taskQueue: TaskItem<T, U>[] = [];
  private _resolveMap: Array<{ resolve: (item: U | PromiseLike<U>) => void; reject: (reason?: any) => void }> = [];
  private _workerStatus: number = 0;
  private _workers: Array<Worker>;
  private _preparedResolve: any[] = [];

  /**
   * Constructor of WorkerPool.
   * @param limitedCount - worker limit count
   * @param _workerCreator - creator of worker
   */
  constructor(public readonly limitedCount = 4, private readonly _workerCreator: () => Worker) {
    this._workers = new Array<Worker>(limitedCount);
  }

  prepareWorker() {
    const count = this.limitedCount;
    const promises = new Array(count);
    for (let i = 0; i < count; i++) {
      this._initWorker(i);
      promises.push(new Promise((resolve, reject) => (this._preparedResolve[i] = { resolve, reject })));
    }
    return Promise.all(promises);
  }

  /**
   * Post message to worker.
   * @param message - message which posted to worker
   * @param transfer - message transfer
   * @returns return a promise of message
   */
  postMessage(message: T): Promise<U> {
    return new Promise((resolve, reject) => {
      const workerId = this._getIdleWorkerId();
      if (workerId !== -1) {
        !this._workers[workerId] && this._initWorker(workerId);
        this._workerStatus |= 1 << workerId;
        this._resolveMap[workerId] = { resolve, reject };
        this._workers[workerId].postMessage(message);
      } else {
        this._taskQueue.push({ resolve, reject, message });
      }
    });
  }

  /**
   * Destroy the worker pool.
   */
  destroy() {
    for (let i = 0, count = this._workers.length; i < count; i++) {
      this._workers[i].terminate();
    }
    this._resolveMap.length = 0;
    this._workers.length = 0;
    this._taskQueue.length = 0;
    this._workerStatus = 0;
  }

  private _initWorker(workerId: number) {
    const worker = this._workerCreator();
    worker.addEventListener("message", this._onMessage.bind(this, workerId));
    this._workers[workerId] = worker;
    return worker;
  }

  private _getIdleWorkerId() {
    for (let i = 0, count = this.limitedCount; i < count; i++) {
      if (!(this._workerStatus & (1 << i))) return i;
    }
    return -1;
  }

  private _onMessage(workerId: number, msg: U) {
    if (msg.data === "init-completed") {
      this._preparedResolve[workerId].resolve(workerId);
    } else if (msg.data.type === "init-error") {
      this._preparedResolve[workerId].reject(msg.data);
    } else {
      const item = this._resolveMap[workerId];
      if (item) {
        if (msg.data.type === "error") item.reject(new Error(msg.error));
        else item.resolve(msg);
      }
      if (this._taskQueue.length) {
        const { resolve, message, reject } = this._taskQueue.shift() as TaskItem<T, U>;
        this._resolveMap[workerId] = { resolve, reject };
        this._workers[workerId].postMessage(message);
      } else {
        this._workerStatus ^= 1 << workerId;
      }
    }
  }
}
