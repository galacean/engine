/**
 * Engine event type.
 */
export const EngineEventType = {
  /** Dispatched when the engine starts running. */
  Run: "run",
  /** Dispatched when the engine shuts down. */
  Shutdown: "shutdown",
  /** Dispatched when the graphic device is lost. */
  DeviceLost: "devicelost",
  /** Dispatched when the graphic device is restored. */
  DeviceRestored: "devicerestored"
} as const;

export type EngineEventType = (typeof EngineEventType)[keyof typeof EngineEventType];
