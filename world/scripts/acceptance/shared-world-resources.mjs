// Real project publications and native loaders in the built Flash App.
import assert from "node:assert/strict";

const texture = "Building/Units/Textures/default_normal.tex";
const model = "Acceptance/tree.gltf";
const buffer = "Acceptance/tree.bin";
const material = "Acceptance/Grass.mat";
const files = { texture, model, buffer, material, authoredModel: "Acceptance/authored.gltf" };

export const externalModel = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [{ uri: "tree.bin", byteLength: 36 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [7, 1, 0] }]
};

export async function editResources(page) {
  const revisions = await page.evaluate(
    async ({ texture, model, buffer, material, authoredModel, externalModel }) => {
      const project = window.seedWorldAI._options.nativeEditor.project;
      const manager = window.storageTestEngine.resourceManager;
      const canvas = document.createElement("canvas");
      canvas.width = 3;
      canvas.height = 2;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 3, 2);
      const png = await new Promise((resolve) => canvas.toBlob(resolve));
      const leaf = project.projectPackage.project.files.find((file) => file.virtualPath === texture);
      await project.publishAsset(leaf, new Uint8Array(await png.arrayBuffer()));
      const vertices = new Float32Array([0, 0, 0, 7, 0, 0, 0, 1, 0]);
      await project.publishAsset(
        { virtualPath: buffer, path: "runtime-test:vertices", type: "Buffer" },
        new Uint8Array(vertices.buffer)
      );
      await project.update((pack) => ({
        ...pack,
        project: {
          ...pack.project,
          files: [
            ...pack.project.files,
            {
              virtualPath: model,
              path: new URL("/fixture/tree.gltf", location.href).href,
              type: "GLTF",
              dependencies: [buffer],
              params: { keepMeshData: true }
            }
          ]
        }
      }));
      await project.publishAsset(
        {
          virtualPath: authoredModel,
          path: "runtime-test:model",
          type: "GLTF",
          params: { keepMeshData: true },
          dependencies: [buffer]
        },
        new TextEncoder().encode(JSON.stringify(externalModel))
      );
      const shader = (await manager.load("Material/Terrain/seed-world.mat")).shader.name;
      const result = [];
      for (const exposure of [0, 1, 2]) {
        await project.publishAsset(
          { virtualPath: material, type: "Material", path: "runtime-test:grass" },
          JSON.stringify({
            name: "storage-test",
            shader,
            shaderData: { material_Exposure: { type: "Float", value: exposure } },
            macros: []
          })
        );
        manager.registerVirtualResources(await project.resources());
        const mat = await manager.load(material);
        result.push([mat.instanceId, mat.shaderData.getFloat("material_Exposure")]);
        await project.flush();
      }
      return result;
    },
    { ...files, externalModel }
  );
  assert.deepEqual(
    revisions.map((r) => r[1]),
    [0, 1, 2]
  );
  assert.equal(new Set(revisions.map(([id]) => id)).size, 3);
}

export async function checkSharedResources(page, restoreGpu) {
  const result = await page.evaluate(
    async ({ files, restoreGpu }) => {
      const engine = window.storageTestEngine;
      const manager = engine.resourceManager;
      const [mat, tex, gltf, authored] = await Promise.all([
        manager.load(files.material),
        manager.load(files.texture),
        manager.load(files.model),
        manager.load(files.authoredModel)
      ]);
      const pixels = () => {
        const out = new Uint8Array(tex.width * tex.height * 4);
        tex.getPixelBuffer(out);
        return [...out.slice(0, 4)];
      };
      const before = pixels();
      if (restoreGpu) {
        const event = (name) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error("Timeout waiting for " + name)), 45000);
            engine.once(name, () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        const lost = event("devicelost");
        engine.forceLoseDevice();
        await lost;
        await new Promise((resolve) => setTimeout(resolve, 120));
        const restored = event("devicerestored");
        engine.forceRestoreDevice();
        await restored;
      }
      return {
        exposure: mat.shaderData.getFloat("material_Exposure"),
        size: [tex.width, tex.height],
        before,
        after: pixels(),
        vertices: [gltf, authored].map((asset) => asset.meshes[0][0].getPositions()[1].x)
      };
    },
    { files, restoreGpu }
  );
  assert.deepEqual(result, {
    exposure: 2,
    size: [3, 2],
    before: [255, 0, 0, 255],
    after: [255, 0, 0, 255],
    vertices: [7, 7]
  });
}
