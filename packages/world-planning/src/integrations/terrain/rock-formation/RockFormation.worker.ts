import { simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateRockFormation } from "./Generate.ts";
import { rockGrassBuffers } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import type { RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
import { unionRockFormations } from "./Union.ts";
import { loadSolidAPI } from "@galacean/engine-terrain/rock-formation/generator/solid-api.js";
type Input = { job: RockFormationJob; settings: RockFormationSettings };
self.onmessage = async ({ data }: MessageEvent<Input & { id: number; members?: Input[] }>) => {
  try {
    const results = data.members
      ? unionRockFormations(
          data.members.map(({ job, settings }) => generateRockFormation(job, settings)),
          await loadSolidAPI()
        )
      : [generateRockFormation(data.job, data.settings)];
    const buffers = results.flatMap((result) => [
      result.mesh.positions.buffer,
      result.mesh.normals!.buffer,
      result.mesh.indices.buffer,
      ...(result.mesh.cornerNormals ? [result.mesh.cornerNormals.buffer] : []),
      ...rockGrassBuffers(result.grass)
    ]) as ArrayBuffer[];
    self.postMessage({ id: data.id, results }, { transfer: buffers });
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
