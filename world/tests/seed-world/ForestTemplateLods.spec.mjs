import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodePlantParameters } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import bushStructureJson from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-sm_birchbush_03-structure.json";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import {
  compileDesertShrubLods,
  DESERT_SHRUB_LOD_DISTANCES_M
} from "@galacean/engine-world-planning/spatial/runtime/TemplateProceduralPlants";
import { parseGlb } from "../../../packages/vegetation/src/wind-vegetation/offline/generate-ground-vegetation-wind-weights.mjs";

const assets = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/world-planning/src/assets");
const forest = WORLD_TEMPLATE_ART["emerald-forest"].models;

function loadModel(url) {
  return parseGlb(readFileSync(resolve(assets, basename(new URL(url, "file:///").pathname)))).json;
}

function geometry(gltf, scene, tangentSlots) {
  const slots = new Set();
  let triangles = 0;
  function visit(index) {
    const node = gltf.nodes[index];
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const material = gltf.materials[primitive.material].name;
        const attributes = Object.keys(primitive.attributes).filter(
          (key) => key !== "TANGENT" || tangentSlots.has(material)
        );
        slots.add([material, ...attributes.sort()].join("/"));
        triangles += gltf.accessors[primitive.indices].count / 3;
      }
    }
    node.children?.forEach(visit);
  }
  scene.nodes.forEach(visit);
  return { slots, triangles };
}

describe("emerald forest model LODs", () => {
  it.each(["forest-giant-oak.glb", "forest-luminous-mushroom.glb"])(
    "%s has two smaller scenes compatible with the textured source",
    (file) => {
      const instances = forest.filter((node) => node.assetUrl?.endsWith(file));
      expect(instances.length).toBeGreaterThan(0);
      const descriptor = instances[0].assetLod;
      for (const node of instances) expect(node.assetLod).toEqual(descriptor);
      const [near, middle] = descriptor.screenRelativeHeights;
      expect(near).toBeGreaterThan(middle);
      expect(middle).toBeGreaterThan(0);
      const source = loadModel(instances[0].assetUrl);
      // Template foliage uses vertex normals. Surface normal maps use the source tangent frame.
      const tangentSlots = new Set(
        source.materials
          .filter((material) => material.normalTexture && !instances[0].assetLeafMaterials?.includes(material.name))
          .map((material) => material.name)
      );
      const sourceGeometry = geometry(source, source.scenes[source.scene ?? 0], tangentSlots);
      const lods = loadModel(descriptor.url);
      expect(lods.scenes).toHaveLength(2);
      expect(lods.textures ?? []).toHaveLength(0);
      let previous = sourceGeometry.triangles;
      for (const scene of lods.scenes) {
        const { slots, triangles } = geometry(lods, scene, tangentSlots);
        expect(slots).toEqual(sourceGeometry.slots);
        expect(triangles).toBeGreaterThan(0);
        expect(triangles).toBeLessThan(previous);
        previous = triangles;
      }
    }
  );

  it("excludes only the three skyline oaks from shadow casting", () => {
    expect(
      forest
        .filter((node) => node.castShadows === false)
        .map((node) => node.id)
        .sort()
    ).toEqual(["giant-oak-distant-center", "giant-oak-east-distance", "giant-oak-west-distance"]);
  });
});

describe("titan-wasteland giant tree and desert-shrub LODs", () => {
  it("equips oasis-scarlet-tree with the compatible forest-giant-oak-lods asset", () => {
    const scarlet = WORLD_TEMPLATE_ART["titan-wasteland"].models.find((node) => node.id === "oasis-scarlet-tree");
    expect(scarlet).toBeDefined();
    expect(scarlet.assetLod).toBeDefined();
    const [near, middle] = scarlet.assetLod.screenRelativeHeights;
    expect(near).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(0);

    const source = loadModel(scarlet.assetUrl);
    const tangentSlots = new Set(
      source.materials
        .filter((material) => material.normalTexture && !scarlet.assetLeafMaterials?.includes(material.name))
        .map((material) => material.name)
    );
    const sourceGeometry = geometry(source, source.scenes[source.scene ?? 0], tangentSlots);
    const lods = loadModel(scarlet.assetLod.url);
    expect(lods.scenes).toHaveLength(2);
    let previous = sourceGeometry.triangles;
    for (const scene of lods.scenes) {
      const { slots, triangles } = geometry(lods, scene, tangentSlots);
      expect(slots).toEqual(sourceGeometry.slots);
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThan(previous);
      previous = triangles;
    }
  });

  it("compiles strictly decreasing desert-shrub LOD0..LOD3 meshes anchored to LOD0 height", () => {
    const bushAsset = decodePlantParameters(bushStructureJson);
    const lods = compileDesertShrubLods(bushAsset);
    expect(lods).toHaveLength(4);
    expect(DESERT_SHRUB_LOD_DISTANCES_M).toHaveLength(3);

    let previousTriangles = Infinity;
    for (const lod of lods) {
      const materialIds = lod.geometry.map((part) => part.materialId).sort();
      expect(materialIds).toEqual(["bark", "foliage"]);
      expect(lod.floor).toBe(lods[0].floor);
      expect(lod.sourceHeight).toBe(lods[0].sourceHeight);
      expect(lod.windHeight).toBe(lods[0].windHeight);
      const triangles = lod.geometry.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0);
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThan(previousTriangles);
      previousTriangles = triangles;
    }
  });
});
