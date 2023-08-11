export interface IXRSession {
  // 生命周期
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  // 追踪
  addTracking(): void;
  delTracking(): void;
  getTracking(): void;
  // 事件
  on(eventName: string, fn: (...args: any[]) => any): void;
  off(eventName: string, fn: (...args: any[]) => any): void;
}
