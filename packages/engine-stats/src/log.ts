import { Logger } from "@oasis-engine/core";

export function log(...args: any) {
  Logger.info("🚀 [o3-engine-stats]", ...args);
}

export function errorLog(...args: any) {
  Logger.error("🚀 [o3-engine-stats]", ...args);
}
