/**
 * @internal
 * WorkerPool, T is is post message type, U is return type.
 */
export class WorkerPool<T = any, U = any> {
  private _taskQueue: TaskItem<T, U>[] = [];
  private _workerStatus: number = 0;
  private _workerItems: (WorkerItem<U> | undefined)[];
  private _initPromises: (Promise<Worker> | undefined)[];
  private _idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _idleTimeoutMs: number;
  private _destroyed = false;

  /**
   * Constructor of WorkerPool.
   * @param limitedCount - worker limit count
   * @param _workerCreator - creator of worker
   * @param idleTimeoutMs - idle timeout before terminating unused workers
   */
  constructor(
    public readonly limitedCount = 4,
    private readonly _workerCreator: () => Worker | Promise<Worker>,
    idleTimeoutMs = 10000
  ) {
    this._workerItems = new Array<WorkerItem<U> | undefined>(limitedCount);
    this._initPromises = new Array<Promise<Worker> | undefined>(limitedCount);
    this._idleTimeoutMs = idleTimeoutMs;
  }

  prepareWorker() {
    if (this._destroyed) return Promise.reject(new Error("WorkerPool destroyed"));
    this._cancelIdleTerminate();
    const count = this.limitedCount;
    const promises: Promise<Worker>[] = [];
    for (let i = 0; i < count; i++) {
      promises.push(this._workerItems[i] ? Promise.resolve(this._workerItems[i]!.worker) : this._initWorker(i));
    }
    return Promise.all(promises).then((workers) => {
      if (!this._destroyed && this._workerStatus === 0 && this._taskQueue.length === 0) {
        this._scheduleIdleTerminate();
      }
      return workers;
    });
  }

  /**
   * Post message to worker.
   * @param message - Message which posted to worker
   * @returns Return a promise of message
   */
  postMessage(message: T): Promise<U> {
    if (this._destroyed) return Promise.reject(new Error("WorkerPool destroyed"));
    this._cancelIdleTerminate();
    return new Promise((resolve, reject) => {
      const workerId = this._getIdleWorkerId();
      if (workerId !== -1) {
        this._workerStatus |= 1 << workerId;
        const workerItems = this._workerItems;
        Promise.resolve(workerItems[workerId] ?? this._initWorker(workerId))
          .then(() => {
            if (this._destroyed) {
              throw new Error("WorkerPool destroyed");
            }
            const workerItem = workerItems[workerId]!;
            workerItem.resolve = resolve;
            workerItem.reject = reject;
            workerItem.worker.postMessage(message);
          })
          .catch((error) => {
            this._workerStatus &= ~(1 << workerId);
            if (!this._destroyed && this._workerStatus === 0 && this._taskQueue.length === 0) {
              this._scheduleIdleTerminate();
            }
            reject(error);
          });
      } else {
        this._taskQueue.push({ resolve, reject, message });
      }
    });
  }

  /**
   * Destroy the worker pool.
   */
  destroy(): void {
    this._destroyed = true;
    this._cancelIdleTerminate();
    const workerItems = this._workerItems;
    for (let i = 0, n = workerItems.length; i < n; i++) {
      const workerItem = workerItems[i];
      if (!workerItem) continue;
      workerItem.worker.terminate();
      workerItem.reject = null;
      workerItem.resolve = null;
      workerItems[i] = undefined;
    }
    workerItems.length = 0;
    this._initPromises.length = 0;
    this._taskQueue.length = 0;
    this._workerStatus = 0;
  }

  private _cancelIdleTerminate(): void {
    if (this._idleTimer !== undefined) {
      clearTimeout(this._idleTimer);
      this._idleTimer = undefined;
    }
  }

  private _scheduleIdleTerminate(): void {
    if (this._destroyed || this._idleTimeoutMs <= 0) return;
    this._cancelIdleTerminate();
    this._idleTimer = setTimeout(() => {
      this._idleTimer = undefined;
      if (this._destroyed || this._workerStatus !== 0 || this._taskQueue.length !== 0) return;
      const workerItems = this._workerItems;
      for (let i = 0, n = workerItems.length; i < n; i++) {
        const workerItem = workerItems[i];
        if (!workerItem) continue;
        workerItem.worker.terminate();
        workerItem.reject = null;
        workerItem.resolve = null;
        workerItems[i] = undefined;
        this._initPromises[i] = undefined;
      }
    }, this._idleTimeoutMs);
  }

  private _initWorker(workerId: number): Promise<Worker> {
    if (this._initPromises[workerId]) return this._initPromises[workerId]!;
    const promise = Promise.resolve(this._workerCreator()).then(
      (worker) => {
        if (this._initPromises[workerId] === promise) this._initPromises[workerId] = undefined;
        if (this._destroyed) {
          worker.terminate();
          throw new Error("WorkerPool destroyed");
        }
        worker.addEventListener("message", this._onMessage.bind(this, workerId));
        this._workerItems[workerId] = { worker, resolve: null, reject: null };
        return worker;
      },
      (error) => {
        if (this._initPromises[workerId] === promise) this._initPromises[workerId] = undefined;
        throw error;
      }
    );
    this._initPromises[workerId] = promise;
    return promise;
  }

  private _getIdleWorkerId() {
    for (let i = 0, count = this.limitedCount; i < count; i++) {
      if (!(this._workerStatus & (1 << i))) return i;
    }
    return -1;
  }

  private _onMessage(workerId: number, msg: MessageEvent<U>) {
    // onerror of web worker can't catch error in promise
    const workerItem = this._workerItems[workerId];
    if (!workerItem) return;
    const error = (msg.data as ErrorMessageData).error;
    if (error) {
      workerItem.reject!(error);
    } else {
      workerItem.resolve!(msg.data);
    }
    this._nextTask(workerId);
  }

  private _nextTask(workerId: number) {
    if (this._taskQueue.length) {
      const taskItem = this._taskQueue.shift() as TaskItem<T, U>;
      const workerItem = this._workerItems[workerId]!;
      workerItem.resolve = taskItem.resolve;
      workerItem.reject = taskItem.reject;
      workerItem.worker.postMessage(taskItem.message);
    } else {
      this._workerStatus ^= 1 << workerId;
      if (this._workerStatus === 0) {
        this._scheduleIdleTerminate();
      }
    }
  }
}

interface ErrorMessageData {
  error: unknown;
}

interface WorkerItem<U> {
  worker: Worker;
  resolve: ((item: U | PromiseLike<U>) => void) | null;
  reject: ((reason?: any) => void) | null;
}

interface TaskItem<T, U> {
  message: T;
  transfer?: Array<Transferable>;
  resolve: (item: U | PromiseLike<U>) => void;
  reject: (reason?: any) => void;
}
