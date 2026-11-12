import { afterEach, expect, it, vi } from "vitest";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { rockFormationJobs } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import {
  cachedPlanningHeightmap,
  planningGroundSurface,
  planningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { createSpatialWorldBase } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";

afterEach(() => vi.unstubAllGlobals());

it.each([31681, 31682])(
  "starts rock jobs before raster compilation with identical ground placement (seed %s)",
  async (seed) => {
    const plan = createSpatialWorldBase({
      version: 2,
      edits: {},
      parameters: {
        ...SEMANTIC_DEFAULTS,
        seed,
        landMode: "continuous",
        reliefNearAmplitudeM: 9,
        reliefAmplitudeM: 35,
        reliefFarAmplitudeM: 110,
        reliefScaleM: 256
      }
    });
    plan.rocks.push({
      id: "formation",
      groupId: "mountain",
      center: { x: 400, z: 500 },
      width: 30,
      height: 20,
      depth: 10,
      yaw: 0.3,
      role: "wall",
      outline: [],
      obb: [],
      boxes: [
        {
          id: "grounded",
          label: "grounded",
          collision: true,
          occlusion: true,
          center: { x: 401.23, z: 502.87 },
          sizeX: 12,
          sizeY: 20,
          sizeZ: 10,
          yaw: 0.3
        },
        {
          id: "edge",
          label: "edge",
          collision: true,
          occlusion: true,
          center: { x: 1024, z: 0 },
          sizeX: 12,
          sizeY: 20,
          sizeZ: 10,
          yaw: -0.4
        },
        {
          id: "authored",
          label: "authored",
          collision: true,
          occlusion: true,
          center: { x: 404, z: 505 },
          elevation: 0,
          sizeX: 12,
          sizeY: 20,
          sizeZ: 10,
          yaw: 0
        }
      ]
    });
    const jobs: RockFormationJob[] = [];
    class Worker {
      onmessage?: (event: { data: unknown }) => void;
      constructor() {
        queueMicrotask(() => this.onmessage?.({ data: { ready: true } }));
      }
      postMessage({ id, job }: { id: number; job: RockFormationJob }) {
        jobs.push(structuredClone(job));
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              id,
              results: [
                {
                  id: job.id,
                  origin: job.origin,
                  owners: [],
                  mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) },
                  stats: { bodies: 1, generationMs: 0 }
                }
              ]
            }
          })
        );
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", Worker);
    const client = new RockFormationClient();
    try {
      expect(cachedPlanningHeightmap(plan)).toBeUndefined();
      await client.prepare(
        plan,
        readRockFormationSettings({ entities: {} } as PlanningDocument),
        new AbortController().signal
      );
      // Preparing every rock must not move the million-sample raster onto the main thread.
      expect(cachedPlanningHeightmap(plan)).toBeUndefined();
      expect(planningGroundSurface(plan).work.backgroundSamples).toBeLessThanOrEqual(12);
      expect(jobs).toHaveLength(3);
      expect(jobs[2].origin[1]).toBe(0);
      expect(jobs).toEqual(rockFormationJobs(plan, planningHeightmap(plan)));
    } finally {
      client.dispose();
    }
  },
  30000
);
