import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Reads renderer assets for the stylized preset from an Engine asset directory. */
export async function readStylizedTerrainPreset(source) {
  async function readVegetationGeometry(name) {
    const atom = await readFile(join(source, `atoms/${name}.glb`));
    const jsonSize = atom.readUInt32LE(12);
    const gltf = JSON.parse(atom.toString("utf8", 20, 20 + jsonSize));
    const binaryStart = 28 + jsonSize;
    const primitive = gltf.meshes[gltf.nodes[0].mesh].primitives[0];
    function readAccessor(index, type, width, bytes, read) {
      const accessor = gltf.accessors[index];
      const view = gltf.bufferViews[accessor.bufferView];
      if (
        accessor.componentType !== type ||
        view.buffer !== 0 ||
        (view.byteStride ?? width * bytes) !== width * bytes
      ) {
        throw new Error(`Seed ${name} atom vertex encoding changed`);
      }
      const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      return Array.from({ length: accessor.count * width }, (_, i) => atom[read](offset + i * bytes));
    }
    const attributes = primitive.attributes;
    const heightBounds = gltf.accessors[attributes.POSITION];
    return {
      positions: readAccessor(attributes.POSITION, 5126, 3, 4, "readFloatLE"),
      normals: readAccessor(attributes.NORMAL, 5126, 3, 4, "readFloatLE"),
      uv: readAccessor(attributes.TEXCOORD_0, 5126, 2, 4, "readFloatLE"),
      tangents:
        attributes.TANGENT === undefined ? undefined : readAccessor(attributes.TANGENT, 5126, 4, 4, "readFloatLE"),
      colors:
        name === "grass"
          ? undefined
          : readAccessor(attributes.COLOR_0, 5123, 4, 2, "readUInt16LE").map((value) => value / 65535),
      indices: readAccessor(primitive.indices, 5123, 1, 2, "readUInt16LE"),
      height: heightBounds.max[1] - heightBounds.min[1]
    };
  }
  const geometry = await readVegetationGeometry("grass");
  const readMaterial = async (name) =>
    JSON.parse(await readFile(join(source, `Material/Vegetation/${name}.mat`), "utf8"));
  const grassMaterial = await readMaterial("grass");
  const flowers = Object.fromEntries(
    await Promise.all(
      ["flowers-1", "flowers-2"].map(async (name) => {
        const material = await readMaterial(name);
        for (const field of Object.values(material.shaderData)) {
          if (field.type === "Texture") {
            field.value =
              "data:image/ktx2;base64," + (await readFile(join(source, field.value.url))).toString("base64");
          }
        }
        return [name, { geometry: await readVegetationGeometry(name), material }];
      })
    )
  );
  return { geometry, grassMaterial, flowers };
}
