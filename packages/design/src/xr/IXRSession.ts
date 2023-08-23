export interface IXRSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  addTracking(): void;
  delTracking(): void;
  getTracking(): void;
}
