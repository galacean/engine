import { decodeCellularModule, type CellularModule } from "@galacean/engine-terrain/rock-formation/CellularModule";
import { generateRockFormation } from "./Generate.ts";
import type { RockFormationSettings } from "./Settings.ts";
import type { RockFormationJob } from "@galacean/engine-terrain/rock-formation/types";
import { rockGrassBuffers } from "@galacean/engine-terrain/rock-formation/GrassSurface";

let moduleTask: Promise<CellularModule> | undefined;
function loadModule() {
  return (moduleTask ??= fetch(
    new URL("../../../../../terrain/src/rock-formation/assets/asymmetric.glb", import.meta.url)
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`Rock vertex network HTTP ${response.status}`);
      return decodeCellularModule(await response.arrayBuffer());
    })
    .catch((error) => {
      moduleTask = undefined;
      throw error;
    }));
}
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; job: RockFormationJob; settings: RockFormationSettings }>) => {
  queue = queue.then(async () => {
    try {
      const result = generateRockFormation(data.job, data.settings, await loadModule());
      const buffers = [
        result.mesh.positions.buffer,
        result.mesh.indices.buffer,
        result.mesh.normals!.buffer,
        result.mesh.restPositions!.buffer
      ] as ArrayBuffer[];
      if (result.painted)
        for (const value of Object.values(result.painted))
          if (value instanceof Float32Array) buffers.push(value.buffer as ArrayBuffer);
      if (result.triangleSurfaces) buffers.push(result.triangleSurfaces.buffer as ArrayBuffer);
      buffers.push(...rockGrassBuffers(result.grass));
      self.postMessage({ id: data.id, result }, { transfer: buffers });
    } catch (error) {
      self.postMessage({ id: data.id, error: String(error) });
    }
  });
};
