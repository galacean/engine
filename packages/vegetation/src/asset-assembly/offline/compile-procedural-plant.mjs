// Offline harness: evaluate exactly the runtime compiler, exchanging geometry only over stdin/stdout.
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../../..");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const structure = JSON.parse(input);
const vite = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  logLevel: "silent"
});
try {
  const { buildProceduralPlantGeometry } = await vite.ssrLoadModule(
    "../ProceduralPlantGeometry.ts"
  );
  const lods = structure.lods.map((_, lod) =>
    buildProceduralPlantGeometry(structure, lod).map(({ partId, materialId, mesh }) => ({
      partId,
      materialId,
      positions: mesh.positions,
      normals: mesh.normals,
      indices: Array.from(mesh.indices),
      uvs: mesh.uvs
    }))
  );
  process.stdout.write(JSON.stringify(lods));
} finally {
  await vite.close();
}
