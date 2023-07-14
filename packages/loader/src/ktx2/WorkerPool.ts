/**
 * @internal
 * WorkerPool, T is is post message type, U is return type.
 */
export class WorkerPool<T = any, U = any> {
  private _taskQueue: TaskItem<T, U>[] = [];
  private _workerStatus: number = 0;
  private _workerItems: Array<WorkerItem<U>>;

  /**
   * Constructor of WorkerPool.
   * @param limitedCount - worker limit count
   * @param _workerCreator - creator of worker
   */
  constructor(public readonly limitedCount = 4, private readonly _workerCreator: () => Worker | Promise<Worker>) {
    this._workerItems = new Array<WorkerItem<U>>(limitedCount);
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
   * @returns return a promise of message
   */
  postMessage(message: T): Promise<U> {
    return new Promise((resolve, reject) => {
      const workerId = this._getIdleWorkerId();
      if (workerId !== -1) {
        !this._workerItems[workerId] && this._initWorker(workerId);
        this._workerStatus |= 1 << workerId;
        this._workerItems[workerId].resolve = resolve;
        this._workerItems[workerId].reject = reject;
        this._workerItems[workerId].worker.postMessage(message);
      } else {
        this._taskQueue.push({ resolve, reject, message });
      }
    });
  }

  /**
   * Destroy the worker pool.
   */
  destroy() {
    for (let i = 0, count = this._workerItems.length; i < count; i++) {
      this._workerItems[i].worker.terminate();
      this._workerItems[i].reject = null;
      this._workerItems[i].resolve = null;
    }
    this._workerItems.length = 0;
    this._taskQueue.length = 0;
    this._workerStatus = 0;
  }

  private _initWorker(workerId: number) {
    return Promise.resolve(this._workerCreator()).then((worker) => {
      worker.addEventListener("message", this._onMessage.bind(this, workerId));
      worker.addEventListener("error", this._onError.bind(this, workerId));
      this._workerItems[workerId] = { worker, resolve: null, reject: null };
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
    this._workerItems[workerId].reject(e);
    this._nextTask(workerId);
  }

  private _onMessage(workerId: number, msg: U) {
    this._workerItems[workerId].resolve(msg);
    this._nextTask(workerId);
  }

  private _nextTask(workerId: number) {
    if (this._taskQueue.length) {
      const { resolve, message, reject } = this._taskQueue.shift() as TaskItem<T, U>;
      this._workerItems[workerId].resolve = resolve;
      this._workerItems[workerId].reject = reject;
      this._workerItems[workerId].worker.postMessage(message);
    } else {
      this._workerStatus ^= 1 << workerId;
    }
  }
}

interface WorkerItem<U> {
  worker: Worker;
  resolve: (item: U | PromiseLike<U>) => void;
  reject: (reason?: any) => void;
}

interface TaskItem<T, U> {
  message: T;
  transfer?: Array<Transferable>;
  resolve: (item: U | PromiseLike<U>) => void;
  reject: (reason?: any) => void;
}
