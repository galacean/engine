import { setImmediate as yieldToRunner } from "node:timers/promises";
import { afterEach } from "vitest";
import { prepareSeedWorldHeightBrushLibrary } from "@galacean/engine-terrain/world/SeedWorldHeightBrush";
import { seedWorldHeightBrushAssetUrl } from "../../demos/seed-world/src/SeedWorldHeightBrushAssetUrl.ts";

await prepareSeedWorldHeightBrushLibrary(seedWorldHeightBrushAssetUrl());

// Synchronous planning cases can otherwise starve the worker's IPC acknowledgements
// across successive tests. Let the runner process I/O between cases without changing budgets.
afterEach(() => yieldToRunner());
