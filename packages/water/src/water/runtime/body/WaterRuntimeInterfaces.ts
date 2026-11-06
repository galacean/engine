import { guardWaterNearShoreTask } from "../spatial/WaterNearShoreQuery";
/** Narrow, generation-bound Query/Surface/Spatial/Interaction runtime ports. */
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";
import type { WaterLocalFieldProvider } from "../interaction/WaterLocalFieldProvider";
import type { WaterSurfaceInteractionSink } from "../interaction/WaterSurfaceInteractionSink";
import type {
  BatchWaterSurfaceProvider,
  DetailedWaterSurfaceProvider,
  WaterSurfaceProvider
} from "../query/WaterSurfaceProvider";
import type { WaterSpatialFieldProvider } from "../spatial/WaterSpatialFieldProvider";
import type { WaterVolumeProvider } from "./WaterVolumeProvider";
import type { WaterBodyRuntime } from "./WaterBodyRuntime";

export type WaterRuntimeInterfaces = Readonly<
  Pick<
    WaterBodyRuntime,
    | "surface"
    | "surfaceFeatures"
    | "spatialField"
    | "localField"
    | "volume"
    | "simulation"
    | "interactionSink"
    | "bounds"
    | "exclusionBounds"
    | "metrics"
  >
>;

function createNullPort(): Record<PropertyKey, unknown> {
  return Object.create(null) as Record<PropertyKey, unknown>;
}

/**
 * Publishes only declared interface methods. Concrete Provider owners, Backend
 * mutation methods, and lifecycle methods never cross this boundary.
 */
export function createWaterRuntimeInterfacesView(requireBody: () => WaterBodyRuntime): WaterRuntimeInterfaces {
  const initial = requireBody();
  const requireGeneration = (): WaterBodyRuntime => {
    const current = requireBody();
    if (current !== initial) {
      throw new Error(`Water RuntimeInterfaces for '${initial.id}' belong to a retired runtime generation.`);
    }
    return current;
  };

  const sourceSurface = initial.surface as
    | (WaterSurfaceProvider & Partial<DetailedWaterSurfaceProvider & BatchWaterSurfaceProvider>)
    | undefined;
  let surface: WaterSurfaceProvider | undefined;
  if (sourceSurface) {
    const requireSurface = (): WaterSurfaceProvider => {
      const current = requireGeneration().surface;
      if (!current) throw new Error("Active Water body no longer publishes a Surface query.");
      return current;
    };
    const surfaceView = createNullPort();
    surfaceView.sampleSurface = (...args: Parameters<WaterSurfaceProvider["sampleSurface"]>) =>
      requireSurface().sampleSurface(...args);
    if (typeof sourceSurface.sampleSurfaceDetailed === "function") {
      surfaceView.sampleSurfaceDetailed = (
        ...args: Parameters<DetailedWaterSurfaceProvider["sampleSurfaceDetailed"]>
      ) => {
        const current = requireSurface() as Partial<DetailedWaterSurfaceProvider>;
        if (!current.sampleSurfaceDetailed)
          throw new Error("Active Water surface no longer supports detailed queries.");
        return current.sampleSurfaceDetailed(...args);
      };
    }
    if (typeof sourceSurface.sampleSurfaceBatch === "function") {
      surfaceView.sampleSurfaceBatch = (...args: Parameters<BatchWaterSurfaceProvider["sampleSurfaceBatch"]>) => {
        const current = requireSurface() as Partial<BatchWaterSurfaceProvider>;
        if (!current.sampleSurfaceBatch) throw new Error("Active Water surface no longer supports batch queries.");
        return current.sampleSurfaceBatch(...args);
      };
    }
    surface = Object.freeze(surfaceView) as unknown as WaterSurfaceProvider;
  }

  let spatialField: WaterSpatialFieldProvider | undefined;
  if (initial.spatialField) {
    const port = createNullPort();
    Object.defineProperty(port, "metadata", {
      enumerable: true,
      get: () => {
        const current = requireGeneration().spatialField;
        if (!current) throw new Error("Active Water body no longer publishes a Spatial Field.");
        return createImmutableWaterSnapshot(current.metadata);
      }
    });
    port.sampleSpatialField = (...args: Parameters<WaterSpatialFieldProvider["sampleSpatialField"]>) => {
      const current = requireGeneration().spatialField;
      if (!current) throw new Error("Active Water body no longer publishes a Spatial Field.");
      return current.sampleSpatialField(...args);
    };
    if (initial.spatialField.nearShore) {
      const radiusM = initial.spatialField.nearShore.radiusM;
      port.nearShore = Object.freeze({
        radiusM,
        prepare: (now?: () => number, budgetMs?: number) => {
          const field = requireGeneration().spatialField;
          if (!field?.nearShore) throw new Error("Active Water body has no near-shore query.");
          return field.nearShore.prepare?.(now, budgetMs) ?? true;
        },
        ...(initial.spatialField.nearShore.createTask && {
          createTask: (
            ...args: Parameters<NonNullable<NonNullable<WaterSpatialFieldProvider["nearShore"]>["createTask"]>>
          ) => {
            const field = requireGeneration().spatialField;
            if (!field?.nearShore?.createTask)
              throw new Error("Active Water body has no cooperative near-shore query.");
            return guardWaterNearShoreTask(field.nearShore.createTask(...args), args[2], () => {
              requireGeneration();
              return true;
            });
          }
        }),
        sample: (...args: Parameters<NonNullable<WaterSpatialFieldProvider["nearShore"]>["sample"]>) => {
          const field = requireGeneration().spatialField;
          if (!field?.nearShore) throw new Error("Active Water body has no near-shore query.");
          return field.nearShore.sample(...args);
        }
      });
    }
    if (initial.spatialField.capture)
      port.capture = () => {
        const field = requireGeneration().spatialField;
        if (!field?.capture) throw new Error("Active Water body cannot capture static Spatial Field facts.");
        return field.capture();
      };
    if (initial.spatialField.maximumSurfaceHeightInBounds)
      port.maximumSurfaceHeightInBounds = (
        ...args: Parameters<NonNullable<WaterSpatialFieldProvider["maximumSurfaceHeightInBounds"]>>
      ) => {
        const field = requireGeneration().spatialField;
        if (!field?.maximumSurfaceHeightInBounds) throw new Error("Active Water body has no bounds query.");
        return field.maximumSurfaceHeightInBounds(...args);
      };
    spatialField = Object.freeze(port) as unknown as WaterSpatialFieldProvider;
  }

  let localField: WaterLocalFieldProvider | undefined;
  if (initial.localField) {
    const port = createNullPort();
    Object.defineProperty(port, "channels", {
      enumerable: true,
      get: () => {
        const current = requireGeneration().localField;
        if (!current) throw new Error("Active Water body no longer publishes a Local Field.");
        return current.channels;
      }
    });
    port.sampleLocalField = (...args: Parameters<WaterLocalFieldProvider["sampleLocalField"]>) => {
      const current = requireGeneration().localField;
      if (!current) throw new Error("Active Water body no longer publishes a Local Field.");
      return current.sampleLocalField(...args);
    };
    localField = Object.freeze(port) as unknown as WaterLocalFieldProvider;
  }

  let volume: WaterVolumeProvider | undefined;
  if (initial.volume) {
    const port = createNullPort();
    port.sampleVolume = (...args: Parameters<WaterVolumeProvider["sampleVolume"]>) => {
      const current = requireGeneration().volume;
      if (!current) throw new Error("Active Water body no longer publishes a Volume.");
      return current.sampleVolume(...args);
    };
    volume = Object.freeze(port) as unknown as WaterVolumeProvider;
  }

  let interactionSink: WaterSurfaceInteractionSink | undefined;
  if (initial.interactionSink) {
    const port = createNullPort();
    port.registerInteraction = (...args: Parameters<WaterSurfaceInteractionSink["registerInteraction"]>) => {
      const current = requireGeneration().interactionSink;
      if (!current) throw new Error("Active Water body no longer publishes an Interaction sink.");
      return current.registerInteraction(...args);
    };
    interactionSink = Object.freeze(port) as unknown as WaterSurfaceInteractionSink;
  }

  const view = createNullPort();
  Object.defineProperties(view, {
    surface: { enumerable: true, value: surface },
    surfaceFeatures: {
      enumerable: true,
      get: () => createImmutableWaterSnapshot(requireGeneration().surfaceFeatures)
    },
    spatialField: { enumerable: true, value: spatialField },
    localField: { enumerable: true, value: localField },
    volume: { enumerable: true, value: volume },
    simulation: {
      enumerable: true,
      get: () => {
        const current = requireGeneration().simulation;
        return current ? createImmutableWaterSnapshot(current) : undefined;
      }
    },
    interactionSink: { enumerable: true, value: interactionSink },
    bounds: {
      enumerable: true,
      get: () => createImmutableWaterSnapshot(requireGeneration().bounds)
    },
    exclusionBounds: {
      enumerable: true,
      get: () => createImmutableWaterSnapshot(requireGeneration().exclusionBounds)
    },
    metrics: {
      enumerable: true,
      get: () => createImmutableWaterSnapshot(requireGeneration().metrics)
    }
  });
  return Object.freeze(view) as WaterRuntimeInterfaces;
}
