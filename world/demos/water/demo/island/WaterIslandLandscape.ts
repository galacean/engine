import { createWaterIslandLandscapeLayout } from "./WaterIslandLandscapeLayout.ts";
import {
  MeshRenderer,
  ModelMesh,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  type Engine,
  type Entity
} from "@galacean/engine";
import { WaterLandscapeAssets, type LakeLandscapeInstance } from "../shared/WaterLandscapeAssets.ts";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "@galacean/engine-water/water/index";
import { destroyWaterOwnedMesh } from "@galacean/engine-water/water/runtime/resources/index";
import { sampleIslandWater } from "./WaterIslandTerrain.ts";
import groundShader from "./WaterIslandGround.shader?raw";

export async function createWaterIslandLandscape(
  engine: Engine,
  parent: Entity,
  assets: WaterLandscapeAssets,
  terrain: WaterTerrainSnapshot,
  seed: number,
  signal: AbortSignal,
  waterLevel = 0
) {
  const root = parent.createChild("island-landscape");
  root.isActive = false;
  const meshes: ModelMesh[] = [],
    instances: LakeLandscapeInstance[] = [];
  let field: Texture2D;
  const material = assets.terrainMaterial.clone();

  const createGroundField = (level: number) => {
    const nextField = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, false, false);
    try {
      const pixels = new Uint8Array(512 * 512 * 4);
      for (let z = 0; z < 512; z++)
        for (let x = 0; x < 512; x++) {
          const worldX = x - 255.5,
            worldZ = z - 255.5,
            water = sampleIslandWater(worldX, worldZ, level),
            bed = sampleWaterTerrainHeight(terrain, worldX, worldZ)!;
          pixels[(z * 512 + x) * 4] = Math.round(Math.max(0, Math.min(1, (bed - water.height) / 16 + 0.5)) * 255);
          pixels[(z * 512 + x) * 4 + 3] = 255;
        }
      nextField.setPixelBuffer(pixels);
      nextField.filterMode = TextureFilterMode.Bilinear;
      nextField.wrapModeU = nextField.wrapModeV = TextureWrapMode.Clamp;
      return nextField;
    } catch (error) {
      nextField.destroy(true);
      throw error;
    }
  };

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    root.destroy();
    instances.forEach((instance) => instance.releaseAfterEntityDestroy());
    meshes.forEach(destroyWaterOwnedMesh);
    material.destroy(true);
    field?.destroy(true);
  };
  try {
    material.name = "Island ground";
    material.shader = Shader.find("Demo/WaterIslandGround") ?? Shader.create(groundShader);
    material.shaderData.setFloat("material_IslandNoiseSeed", seed % 65536);
    field = createGroundField(waterLevel);
    material.shaderData.setTexture("material_IslandGroundField", field);
    const height = (x: number, z: number) =>
      sampleWaterTerrainHeight(terrain, Math.max(-256, Math.min(256, x)), Math.max(-256, Math.min(256, z)))!;
    for (let tz = 0; tz < 512; tz += 64) {
      if (signal.aborted) throw new DOMException("Island preparation cancelled", "AbortError");
      for (let tx = 0; tx < 512; tx += 64) {
        const positions: Vector3[] = [],
          normals: Vector3[] = [],
          uvs: Vector2[] = [],
          indices: number[] = [];
        let min = Infinity,
          max = -Infinity;
        for (let z = 0; z <= 64; z++)
          for (let x = 0; x <= 64; x++) {
            const wx = tx + x - 256,
              wz = tz + z - 256,
              h = height(wx, wz);
            min = Math.min(min, h);
            max = Math.max(max, h);
            positions.push(new Vector3(wx, h, wz));
            normals.push(
              new Vector3(
                height(wx - 1, wz) - height(wx + 1, wz),
                2,
                height(wx, wz - 1) - height(wx, wz + 1)
              ).normalize()
            );
            uvs.push(new Vector2(wx * 0.17, wz * 0.17));
            if (x < 64 && z < 64) {
              const a = z * 65 + x;
              indices.push(a, a + 65, a + 1, a + 1, a + 65, a + 66);
            }
          }
        const mesh = new ModelMesh(engine);
        meshes.push(mesh);
        mesh.name = `island-ground-${tx}-${tz}`;
        mesh.setPositions(positions);
        mesh.setNormals(normals);
        mesh.setUVs(uvs);
        mesh.setIndices(new Uint16Array(indices));
        mesh.calculateTangents();
        mesh.addSubMesh(0, indices.length);
        mesh.bounds.min.set(tx - 256, min, tz - 256);
        mesh.bounds.max.set(tx - 192, max, tz - 192);
        mesh.uploadData(true);
        const renderer = root.createChild(mesh.name).addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = true;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const placements = createWaterIslandLandscapeLayout(terrain, seed);
    for (const placement of placements) instances.push(assets.instantiateLandscape(root, placement));
    return {
      root,
      destroy,
      placements,
      meshCount: meshes.length,
      triangleCount: 512 * 512 * 2,
      prepareWaterLevel: (level: number) => {
        const previous = field,
          next = createGroundField(level);
        let committed = false,
          settled = false;
        return {
          commit: () => {
            material.shaderData.setTexture("material_IslandGroundField", next);
            field = next;
            committed = true;
          },
          finalize: () => {
            if (!settled) {
              settled = true;
              previous.destroy(true);
            }
          },
          rollback: () => {
            if (settled) return;
            settled = true;
            if (committed) {
              material.shaderData.setTexture("material_IslandGroundField", previous);
              field = previous;
            }
            next.destroy(true);
          }
        };
      }
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
