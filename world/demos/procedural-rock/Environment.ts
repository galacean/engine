import { AssetType, Camera, Engine, Entity, Material, PrefabResource } from "@galacean/engine";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import {
  resolveTerrainProjectPrefabGeometry,
  type TerrainProjectResolvedRenderer
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { createTreeAssemblyGrasslandsLighting } from "@galacean/engine-world-planning/integrations/vegetation/TreeAssemblyGrasslandsLighting";
import { applySeedWorldTerrainAppearance } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { createSeedWorldSharedSurfaceTexture } from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import {
  SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
  type SeedWorldGrassColorFieldBinding
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import { Loader } from "@galacean/engine";
import { TerrainPrototypeMetadata } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
Loader.registerClass("/Script/TerrainPrototypeMetadata.ts", TerrainPrototypeMetadata);

/** The laboratory's production terrain, shared colour field and grass bindings. */
export interface CliffEnvironment {
  terrain: TerrainClipmap;
  field: SeedWorldGrassColorFieldBinding;
  grass: readonly TerrainProjectResolvedRenderer[];
  dispose(): void;
}

/** Installs Seed's surface resources, a flat native Clipmap and paused noon lighting.
 * @param engine Owning engine.
 * @param root Scene root.
 * @param camera Camera receiving the production post profile.
 * @returns Owned terrain and borrowed authored grass primitives.
 */
export async function createCliffEnvironment(engine: Engine, root: Entity, camera: Camera): Promise<CliffEnvironment> {
  const daylight = createTreeAssemblyGrasslandsLighting(root.scene!, root, camera);
  daylight.lighting.setTuning({ playing: false, timeHours: 12 });
  await registerTerrainProjectResources(
    engine,
    new URL("../../../packages/terrain/src/data/seed-world/project.json", import.meta.url)
  );
  const catalogUrl = new URL(
    "../../../packages/terrain/src/data/seed-world/public/production-catalog.json",
    import.meta.url
  );
  const response = await fetch(catalogUrl);
  if (!response.ok) throw Error(`Seed catalog: ${response.status}`);
  const catalog = await response.json();
  engine.resourceManager.registerVirtualResources(
    catalog.generatedResources.map((r: { path: string }) => ({ ...r, path: new URL(r.path, catalogUrl).href }))
  );
  const [source, prefab, texture] = await Promise.all([
    engine.resourceManager.load<Material>({ type: AssetType.Material, url: "Material/Terrain/seed-world.mat" }),
    engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url: catalog.grass.prefabUrl }),
    createSeedWorldSharedSurfaceTexture(engine)
  ]);
  const field: SeedWorldGrassColorFieldBinding = {
    texture,
    tuning: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
    vistaFromDetail: true
  };
  const material = source.clone();
  applySeedWorldTerrainAppearance(material, field);
  const heights = new Uint16Array(129 * 129);
  const terrain = new TerrainClipmap(
    engine,
    root.createChild("Flat Seed terrain"),
    camera,
    {
      vertexSpacing: 4,
      minHeight: 0,
      maxHeight: 0,
      sources: [
        {
          id: "cliff-ground",
          worldPosition: [-256, 0, -256],
          worldSize: [512, 1, 512],
          heightSampleSize: [129, 129],
          heightDecodeOffset: 0,
          heightDecodeScale: 1,
          heightSamples: heights
        }
      ]
    },
    material,
    16,
    3,
    [
      {
        id: "cliff-ground",
        layers: [
          {
            id: "meadow",
            appearance: "grass",
            tileSize: [2, 2],
            tileOffset: [0, 0],
            normalScale: 0,
            diffuseRemapMin: [1, 1, 1, 1],
            diffuseRemapMax: [1, 1, 1, 1],
            maskRemapMin: [0, 0, 0, 0],
            maskRemapMax: [1, 1, 1, 1],
            metallic: 0,
            smoothness: 0,
            specular: [0, 0, 0, 0],
            snowResponse: 0.72
          }
        ],
        alphamaps: [
          {
            sampleSize: [2, 2],
            layers: ["meadow", null, null, null],
            weights: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0])
          }
        ]
      }
    ]
  );
  const geometry = resolveTerrainProjectPrefabGeometry(prefab, "Seed grass");
  if (!geometry) throw Error("Seed grass has no renderer metadata");
  const grass = geometry.kind === "renderers" ? geometry.renderers : geometry.lodGroup.lods[0].renderers;
  return {
    terrain,
    field,
    grass,
    dispose() {
      terrain.destroy();
      material.destroy();
      texture.destroy();
    }
  };
}
