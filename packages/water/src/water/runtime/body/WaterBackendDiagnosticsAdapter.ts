/** Explicit demo/acceptance diagnostics facade. It never publishes the owned runtime controller. */
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";

const READ_KEYS = Object.freeze([
  "activeData",
  "activeReaches",
  "activeSurfaceOpticsReadback",
  "config",
  "debugMode",
  "debugView",
  "depthResponseDebugView",
  "depthResponseTermMode",
  "featureAvailability",
  "foamEnabled",
  "junctionVisibility",
  "lodDebugEnabled",
  "macroDisplacementEnabled",
  "metrics",
  "microSurfaceEnabled",
  "opticalProfile",
  "refractionEnabled",
  "reachSummary",
  "dropCount",
  "shoreFoamEnabled",
  "surfaceAppearanceBinding",
  "surfaceDebugMode",
  "surfaceOpticsBinding",
  "surfaceTimeOverride",
  "tuning"
] as const);

const COMMAND_KEYS = Object.freeze([
  "setDebugMode",
  "setDebugView",
  "setDepthResponseDebugView",
  "setDepthResponseTermMode",
  "setLodDebug",
  "setSurfaceDebugMode",
  "setSurfaceTimeOverride",
  "setTuning"
] as const);

function createOwnedReadback(value: unknown, ancestors = new WeakSet<object>()): unknown {
  try {
    return createImmutableWaterSnapshot(value);
  } catch {
    if (typeof value !== "object" || value === null || ancestors.has(value)) return undefined;
    if (Array.isArray(value)) {
      ancestors.add(value);
      try {
        return Object.freeze(value.map((entry) => createOwnedReadback(entry, ancestors)));
      } finally {
        ancestors.delete(value);
      }
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return undefined;
    ancestors.add(value);
    try {
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!property || !("value" in property) || typeof property.value === "function") continue;
        snapshot[key] = createOwnedReadback(property.value, ancestors);
      }
      return Object.freeze(snapshot);
    } finally {
      ancestors.delete(value);
    }
  }
}

// Only this factory can establish provenance; public properties cannot bypass projection.
const adapters = new WeakSet<object>();

export function createWaterBackendDiagnosticsAdapter(controller: object): unknown {
  if (adapters.has(controller)) return controller;
  const view = Object.create(null) as Record<PropertyKey, unknown>;
  for (const key of READ_KEYS) {
    Object.defineProperty(view, key, {
      enumerable: true,
      get: () => createOwnedReadback(Reflect.get(controller, key, controller))
    });
  }
  for (const key of COMMAND_KEYS) {
    const command = Reflect.get(controller, key, controller);
    if (typeof command !== "function") continue;
    Object.defineProperty(view, key, {
      value: (...args: unknown[]) => Reflect.apply(command, controller, args)
    });
  }
  adapters.add(view);
  return Object.freeze(view);
}
