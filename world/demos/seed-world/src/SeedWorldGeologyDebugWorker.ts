/// <reference lib="webworker" />

import {
  compileSeedWorldGeologyHeightfield,
  compileSeedWorldGeologyLayout,
  compileSeedWorldGeologyLayoutGeometry,
  type SeedWorldGeologyHeightfield,
  type SeedWorldGeologyLayout
} from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import type { SeedWorldGeologyHillEdit, SeedWorldGeologyParameters } from "@galacean/engine-terrain/world/SeedWorldGeologySeedCodec";

/** One debug-only request for the shared deterministic geology compiler. */
export interface SeedWorldGeologyDebugWorkerRequest {
  /** Monotonic identity used to discard superseded slider states. */
  readonly requestId: number;
  /** Interactive terrain-only update or complete downstream layout publication. */
  readonly mode: "interactive" | "complete";
  /** Unsigned GEOLOGY code. */
  readonly geologySeed: number;
  /** Complete data-driven global geology parameters. */
  readonly parameters: SeedWorldGeologyParameters;
  /** Optional deterministic single-hill authoring extensions. */
  readonly hillEdits: readonly SeedWorldGeologyHillEdit[];
}

/** One debug-only response containing the exact shared layout and preview field. */
export interface SeedWorldGeologyDebugWorkerResponse {
  /** Request identity supplied by the caller. */
  readonly requestId: number;
  /** Compile depth requested by the acceptance panel. */
  readonly mode: "interactive" | "complete";
  /** Exact shared layout consumed by both 2D and 3D. */
  readonly layout: SeedWorldGeologyLayout;
  /** Compact physical preview field used only by the acceptance canvas. */
  readonly field: SeedWorldGeologyHeightfield;
  /** Worker-side mathematical compile duration. */
  readonly compileMilliseconds: number;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<SeedWorldGeologyDebugWorkerRequest>) => {
  const startedAt = performance.now();
  const compile =
    event.data.mode === "interactive" ? compileSeedWorldGeologyLayoutGeometry : compileSeedWorldGeologyLayout;
  const layout = compile({
    geologySeed: event.data.geologySeed,
    parameters: event.data.parameters,
    hillEdits: event.data.hillEdits
  });
  const field = compileSeedWorldGeologyHeightfield(layout, 33);
  workerScope.postMessage({
    requestId: event.data.requestId,
    mode: event.data.mode,
    layout,
    field,
    compileMilliseconds: performance.now() - startedAt
  } satisfies SeedWorldGeologyDebugWorkerResponse);
});
