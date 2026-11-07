import { buildRock } from "./generator/rock-body.js";
import { simplifyRock, simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
self.onmessage = ({ data: { id, rockId, parameters, reduction } }) => {
  try {
    const mesh = simplifyRock(buildRock(parameters), reduction);
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
