interface TaskItem<T, U> {
  message: T;
  transfer?: Array<Transferable>;
  resolve: (item: U | PromiseLike<U>) => void;
  reject: (reason?: any) => void;
}

/**
 * @internal
 * WorkerPool, T is is post message type, U is return type.
 */
export class WorkerPool<T = any, U = any> {
  private _taskQueue: TaskItem<T, U>[] = [];
  private _resolveMap: Array<{ resolve: (item: U | PromiseLike<U>) => void; reject: (reason?: any) => void }> = [];
  private _workerStatus: number = 0;
  private _workers: Array<Worker>;

  /**
   * Constructor of WorkerPool.
   * @param limitedCount - worker limit count
   * @param _workerCreator - creator of worker
   */
  constructor(public readonly limitedCount = 4, private readonly _workerCreator: () => Worker | Promise<Worker>) {
    this._workers = new Array<Worker>(limitedCount);
  }

  prepareWorker() {
    const count = this.limitedCount;
    const promises = new Array<Promise<Worker>>(count);
    for (let i = 0; i < count; i++) {
      promises.push(this._initWorker(i));
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
    return Promise.resolve(this._workerCreator()).then((worker) => {
      worker.addEventListener("message", this._onMessage.bind(this, workerId));
      worker.addEventListener("error", this._onError.bind(this, workerId));
      this._workers[workerId] = worker;
      return worker;
    });
  }

  private _getIdleWorkerId() {
    for (let i = 0, count = this.limitedCount; i < count; i++) {
      if (!(this._workerStatus & (1 << i))) return i;
    }
    return -1;
  }

  private _onError(workerId, e: ErrorEvent) {
    this._resolveMap[workerId].reject(e);
    this._nextTask(workerId);
  }

  private _onMessage(workerId: number, msg: U) {
    this._resolveMap[workerId].resolve(msg);
    this._nextTask(workerId);
  }

  private _nextTask(workerId: number) {
    if (this._taskQueue.length) {
      const { resolve, message, reject } = this._taskQueue.shift() as TaskItem<T, U>;
      this._resolveMap[workerId] = { resolve, reject };
      this._workers[workerId].postMessage(message);
    } else {
      this._workerStatus ^= 1 << workerId;
    }
  }
}
