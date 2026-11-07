import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock, simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { unionRocks, compoundGuides } from "./CompoundRock.js";
import initialize from "manifold-3d";
import wasm from "manifold-3d/manifold.wasm?url";
let booleanReady;
function loadBoolean() {
  return (booleanReady ??= initialize({ locateFile: () => wasm }).then((api) => {
    api.setup();
    return api;
  }));
}
self.onmessage = async ({ data: { id, rockId, parameters, reduction } }) => {
  try {
    const mesh = parameters.compound
      ? unionRocks(compoundGuides(parameters), reduction, await loadBoolean(), parameters.planeCut)
      : simplifyRock(buildRock(parameters), reduction);
    const transfer = [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer];
    if (mesh.surfaceRoles) transfer.push(mesh.surfaceRoles.buffer);
    self.postMessage({ id, rockId, mesh }, transfer);
  } catch (error) {
    self.postMessage({ id, rockId, error: error.message });
  }
};
simplifierReady
  .then(() => self.postMessage({ ready: true }))
  .catch((error) => {
    throw error;
  });
