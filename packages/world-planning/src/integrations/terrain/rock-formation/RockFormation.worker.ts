import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateRockFormation } from "./Generate.ts";
import { rockGrassBuffers } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import type { RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
self.onmessage = ({ data }: MessageEvent<{ id: number; job: RockFormationJob; settings: RockFormationSettings }>) => {
  try {
    const result = generateRockFormation(data.job, data.settings);
    const buffers = [
      result.mesh.positions.buffer,
      result.mesh.normals!.buffer,
      result.mesh.indices.buffer,
      ...rockGrassBuffers(result.grass)
    ] as ArrayBuffer[];
    self.postMessage({ id: data.id, result }, { transfer: buffers });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
// The shared simplifier finishes its WebAssembly initialization before accepting work.
simplifierReady
  .then(() => self.postMessage({ ready: true }))
  .catch((error) => {
    throw error;
  });
