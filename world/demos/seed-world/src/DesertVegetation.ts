import { BoundingBox, Color, MeshRenderer, RenderFace, Script, Vector3, type Entity } from "@galacean/engine";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial.ts";
import { createPlantGeometryExample } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantExamples.ts";
import type {
  PlantPart,
  PlantShape,
  PlantPoint,
  ProceduralPlantStructure
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantGeometry.ts";
import { createProceduralPlantMeshes } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMeshes.ts";
import {
  createTreeAssemblyInstanceStorage,
  createTreeAssemblyInstancedMesh,
  uploadTreeAssemblyInstances
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh.ts";

import { sampleSeedWorldPopulation } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { settlementRandom } from "@galacean/engine-world-planning/semantic-study/SettlementGeometry";
import type { PlanningSeedWorldData } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedWorldData";
import { territoryLookup } from "@galacean/engine-world-planning/spatial/ecology/PoiTerritories";
import type { PlanningSpawnView } from "./planning/spatial/runtime/PlanningSpawnView";

type Placement = [x: number, y: number, z: number, height: number, yaw: number, level: number];
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
// Each column is a whole-plant colorway, in linear albedo.
type PlantColorways = readonly [PlantPoint, PlantPoint, PlantPoint];
const palette = {
  "flower-yellow": {
    foliage: [
      [0.21, 0.25, 0.055],
      [0.27, 0.35, 0.085],
      [0.15, 0.23, 0.077]
    ],
    petal: [
      [0.93, 0.39, 0.045],
      [0.98, 0.72, 0.13],
      [1.0, 0.92, 0.44]
    ],
    pollen: [
      [0.7, 0.34, 0.025],
      [0.83, 0.57, 0.07],
      [0.89, 0.67, 0.13]
    ]
  },
  "flower-purple": {
    foliage: [
      [0.15, 0.22, 0.072],
      [0.24, 0.31, 0.1],
      [0.28, 0.34, 0.12]
    ],
    petal: [
      [0.33, 0.105, 0.68],
      [0.73, 0.16, 0.43],
      [0.87, 0.43, 0.76]
    ],
    pollen: [
      [0.68, 0.45, 0.055],
      [0.84, 0.59, 0.09],
      [0.93, 0.72, 0.19]
    ]
  },
  shrub: {
    bark: [
      [0.24, 0.18, 0.09],
      [0.33, 0.24, 0.12],
      [0.35, 0.3, 0.2]
    ],
    foliage: [
      [0.19, 0.26, 0.055],
      [0.36, 0.34, 0.082],
      [0.29, 0.37, 0.23]
    ],
    petal: [
      [0.72, 0.65, 0.13],
      [0.91, 0.53, 0.06],
      [0.93, 0.86, 0.37]
    ]
  },
  joshua: {
    bark: [
      [0.25, 0.17, 0.1],
      [0.43, 0.32, 0.2],
      [0.48, 0.45, 0.38]
    ],
    foliage: [
      [0.15, 0.24, 0.055],
      [0.31, 0.35, 0.095],
      [0.22, 0.35, 0.21]
    ]
  },
  cactus: {
    foliage: [
      [0.095, 0.19, 0.042],
      [0.28, 0.4, 0.082],
      [0.17, 0.34, 0.23]
    ]
  },
  "small-cactus": {
    foliage: [
      [0.12, 0.24, 0.058],
      [0.35, 0.46, 0.12],
      [0.2, 0.38, 0.26]
    ]
  }
} satisfies Record<string, Record<string, PlantColorways>>;
type Species = keyof typeof palette;

function recipe(species: Species, level: number): ProceduralPlantStructure {
  if (species.startsWith("flower-")) {
    const flower = createPlantGeometryExample("flower");
    return {
      ...flower,
      lods: [
        {
          partIds: flower.parts.map(({ id }) => id),
          resolution: { subdivisionsPerSpan: 1, widthSegments: 1, radialSegments: [6, 4, 3][level] }
        }
      ]
    };
  }
  const partsOut: PlantPart[] = [];
  const tube = (sections: [number, PlantPoint, number][]): PlantShape => ({
    kind: "tube",
    capStart: true,
    capEnd: true,
    sections: sections.map(([at, center, radius]) => ({ at, center, radius }))
  });
  const add = (id: string, shapeId: string, materialId: string, changes: Partial<PlantPart> = {}) =>
    partsOut.push({
      id,
      shapeId,
      materialId,
      parentId: null,
      attachment: 0,
      offset: [0, 0, 0],
      orientation: [0, 0, 0, 1],
      scale: 1,
      ...changes
    });
  const upright = (angle: number, tilt: number): PlantPart["orientation"] => [
    Math.sin(angle) * Math.sin(tilt / 2),
    0,
    Math.cos(angle) * Math.sin(tilt / 2),
    Math.cos(tilt / 2)
  ];
  const blade = createPlantGeometryExample("grass").shapes.blade;
  const shapes: Record<string, PlantShape> = { blade };
  if (species.includes("cactus")) {
    shapes.column = tube([
      [0, [0, 0, 0], 0.09],
      [0.25, [0, 0.25, 0], 0.095],
      [0.88, [0, 0.88, 0], 0.09],
      [0.97, [0, 0.97, 0], 0.065],
      [1, [0, 1, 0], 0.012]
    ]);
    shapes.arm = tube([
      [0, [0, 0, 0], 0.063],
      [0.28, [0.17, 0.045, 0], 0.065],
      [0.84, [0.23, 0.37, 0], 0.058],
      [0.97, [0.23, 0.46, 0], 0.04],
      [1, [0.23, 0.48, 0], 0.008]
    ]);
    add("column", "column", "foliage");
    const arms = species === "small-cactus" ? 4 : level === 2 ? 2 : 3;
    for (let i = 0; i < arms; i++) {
      const yaw = i * goldenAngle;
      add("arm-" + i, "arm", "foliage", {
        parentId: "column",
        attachment: 0.27 + i * 0.105,
        scale: 0.83 - i * 0.09,
        orientation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
      });
    }
  } else if (species === "joshua") {
    shapes.trunk = tube([
      [0, [0, 0, 0], 0.05],
      [0.5, [0.02, 0.4, 0], 0.041],
      [1, [0.1, 0.76, 0], 0.025]
    ]);
    shapes.branch = tube([
      [0, [0, 0, 0], 0.035],
      [0.55, [0.04, 0.18, 0], 0.026],
      [1, [0.07, 0.34, 0], 0.018]
    ]);
    add("trunk", "trunk", "bark");
    const heads = level === 0 ? 3 : 2;
    for (let h = 0; h < heads; h++) {
      const branch = "branch-" + h;
      if (h)
        add(branch, "branch", "bark", {
          parentId: "trunk",
          attachment: 0.48 + 0.16 * h,
          orientation: upright(h * goldenAngle, 0.85)
        });
      const leaves = [10, 6, 4][level];
      for (let i = 0; i < leaves; i++) {
        const angle = i * goldenAngle + h;
        add("leaf-" + h + "-" + i, "blade", "foliage", {
          parentId: h ? branch : "trunk",
          attachment: 1,
          scale: 0.31 + (i % 5) * 0.025,
          orientation: upright(angle, 0.18 + (i % 6) * 0.16)
        });
      }
    }
  } else {
    shapes.twig = tube([
      [0, [0, 0, 0], 0.032],
      [0.56, [0.07, 0.3, 0], 0.02],
      [1, [0.1, 0.6, 0], 0.005]
    ]);
    shapes.bloom = tube([
      [0, [0, 0, 0], 0.028],
      [0.42, [0, 0.025, 0], 0.054],
      [1, [0, 0.065, 0], 0.011]
    ]);
    for (let i = 0; i < [7, 5, 3][level]; i++) {
      const angle = i * goldenAngle;
      const twig = "twig-" + i;
      add(twig, "twig", "bark", { scale: 0.7 + (i % 4) * 0.12, orientation: upright(angle, 0.25 + (i % 5) * 0.19) });
      for (let j = 0; j < 2; j++)
        add(twig + "-leaf-" + j, "blade", "foliage", {
          parentId: twig,
          attachment: 0.49 + 0.14 * j,
          scale: 0.3,
          orientation: upright(angle + j * goldenAngle, 0.95)
        });
      add(twig + "-bloom", "bloom", "petal", { parentId: twig, attachment: 1 });
    }
  }
  return {
    version: 1,
    shapes,
    parts: partsOut,
    lods: [
      {
        partIds: partsOut.map((p) => p.id),
        resolution: {
          subdivisionsPerSpan: 1,
          widthSegments: 1,
          radialSegments: [6, 4, 3][level]
        }
      }
    ]
  };
}

const speciesTuning = {
  "flower-yellow": { spacing: 1.3, height: [0.42, 0.81], near: 0.77, regional: 0.005, far: 0.001 },
  "flower-purple": { spacing: 1.45, height: [0.57, 0.83], near: 0.38, regional: 0.003, far: 0.001 },
  shrub: { spacing: 1.55, height: [0.64, 1.25], near: 0.88, regional: 0.038, far: 0.0025 },
  "small-cactus": { spacing: 5.5, height: [0.52, 0.95], near: 0.48, regional: 0.046, far: 0.022 },
  cactus: { spacing: 20, height: [1.9, 3.4], near: 0.16, regional: 0.032, far: 0.014 },
  joshua: { spacing: 15, height: [1.55, 3.3], near: 0.26, regional: 0.06, far: 0.032 }
} as const;

class DesertVegetationResources extends Script {
  readonly release: Array<() => void> = [];
  override onDestroy(): void {
    for (const destroy of this.release.reverse()) destroy();
  }
}

const smooth = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

export function mountDesertVegetation(
  parent: Entity,
  plan: IslandPlan,
  data: PlanningSeedWorldData,
  view: Pick<PlanningSpawnView, "eye" | "target">
) {
  const owner = parent.createChild("Mojave procedural vegetation");
  const resources = owner.addComponent(DesertVegetationResources);
  const { eye, target } = view;
  const forwardLength = Math.hypot(target.x - eye.x, target.z - eye.z);
  const fx = (target.x - eye.x) / forwardLength,
    fz = (target.z - eye.z) / forwardLength;
  const { seed, width, depth } = plan.parameters;
  const territory = territoryLookup(plan);
  const spacing = plan.poiDistribution?.spacingM ?? 210;
  const denseRadius = spacing * 2;
  const binSize = 40;
  type Obstacle = { x: number; z: number; halfWidth: number; halfDepth: number; c: number; s: number; rock: boolean };
  const bins = new Map<string, Obstacle[]>();
  for (const item of [...plan.rocks, ...(plan.landscapes ?? [])]) {
    const { x, z } = item.center;
    const reach = Math.hypot(item.width, item.depth) / 2 + 10;
    const obstacle = {
      x,
      z,
      halfWidth: item.width / 2,
      halfDepth: item.depth / 2,
      c: Math.cos(item.yaw),
      s: Math.sin(item.yaw),
      rock: !("kind" in item) || item.kind === "rock"
    };
    for (let ix = Math.floor((x - reach) / binSize); ix <= Math.floor((x + reach) / binSize); ix++) {
      for (let iz = Math.floor((z - reach) / binSize); iz <= Math.floor((z + reach) / binSize); iz++) {
        const key = ix + ":" + iz;
        const bin = bins.get(key);
        if (bin) bin.push(obstacle);
        else bins.set(key, [obstacle]);
      }
    }
  }
  const rockGap = (x: number, z: number) => {
    let gap = Infinity;
    for (const item of bins.get(Math.floor(x / binSize) + ":" + Math.floor(z / binSize)) ?? []) {
      const dx = x - item.x,
        dz = z - item.z;
      const a = Math.abs(dx * item.c + dz * item.s) - item.halfWidth;
      const b = Math.abs(-dx * item.s + dz * item.c) - item.halfDepth;
      if (a <= 0 && b <= 0) return -1;
      if (item.rock) gap = Math.min(gap, Math.hypot(Math.max(a, 0), Math.max(b, 0)));
    }
    return gap;
  };
  const cactusHabitat = (along: number, across: number) =>
    smooth(16, 22, along) * (1 - smooth(27, 36, along)) * (1 - smooth(2, 9, Math.abs(across)));
  // Choose a single viable stand from seeded candidates in the open middle ground.
  let cactusStand: { x: number; z: number; score: number } | undefined;
  for (let i = 0; i < 36; i++) {
    const along = 17 + settlementRandom(seed, `cactus-stand:${i}:depth`) * 18;
    const across = (settlementRandom(seed, `cactus-stand:${i}:side`) - 0.5) * 18;
    const x = eye.x + fx * along - fz * across,
      z = eye.z + fz * along + fx * across;
    const ground = sampleSeedWorldPopulation(data.plan, data.fields, x, z);
    if (!ground || ground.water || ground.slope > 0.3 || rockGap(x, z) < 1.8 || !territory({ x, z }).length) continue;
    const score = cactusHabitat(along, across) - ground.slope + settlementRandom(seed, `cactus-stand:${i}:rank`) * 0.12;
    if (!cactusStand || score > cactusStand.score) cactusStand = { x, z, score };
  }
  const placements = new Map<Species, Placement[]>();
  for (const species of Object.keys(speciesTuning) as Species[]) {
    const { spacing: step, height, near, regional, far } = speciesTuning[species];
    const plants: Placement[] = [];
    const place = (x: number, z: number, height: number, yaw: number) => {
      const ground = sampleSeedWorldPopulation(data.plan, data.fields, x, z);
      if (!ground || ground.water || ground.slope > 0.45 || ground.roadDistanceMetres < 1.2) return;
      const distance = Math.hypot(x - eye.x, z - eye.z);
      plants.push([x, ground.height, z, height, yaw, distance < 24 ? 0 : distance < 60 ? 1 : 2]);
    };
    for (let iz = 0; iz * step < depth; iz++) {
      for (let ix = 0; ix * step < width; ix++) {
        const key = `desert-poi:${species}:${ix}:${iz}`;
        const random = (channel: string) => settlementRandom(seed, key + ":" + channel);
        const admission = random("density");
        if (admission >= near) continue;
        const x = (ix + random("x")) * step,
          z = (iz + random("z")) * step;
        const distance = Math.hypot(x - eye.x, z - eye.z);
        if (x >= width || z >= depth || distance < 2 || (species === "cactus" && distance < 36)) continue;
        const enrichment = 1 - smooth(denseRadius - spacing * 0.45, denseRadius + spacing * 0.25, distance);
        const foreground = 1 - smooth(30, 78, distance);
        const probability = far + (regional - far) * enrichment + (near - regional) * foreground;
        if (admission >= probability) continue;
        const gap = rockGap(x, z);
        if (gap < 0.48) continue;
        const patch = (1 + Math.sin(x * 0.44 + z * 0.32 + (seed % 31)) * Math.sin(z * 0.52 - x * 0.37)) / 2;
        const foot = smooth(0.6, 1.4, gap) * (1 - smooth(4, 10, gap));
        let habitat = 1;
        if (species === "shrub") habitat = Math.max(foot, smooth(0.46, 0.87, patch) * 0.55);
        if (species === "small-cactus") habitat = 0.3 + 0.7 * smooth(0.35, 0.85, patch);
        if (species === "flower-yellow") habitat = 0.15 + 0.85 * smooth(0.36, 0.76, patch);
        if (species === "flower-purple") habitat = smooth(0.57, 0.93, patch) * (1 - smooth(16, 33, distance));
        if (random("habitat") >= habitat || !territory({ x, z }).length) continue;
        place(x, z, height[0] + (height[1] - height[0]) * random("height"), random("yaw") * 2 * Math.PI);
      }
    }
    if (species === "cactus" && cactusStand) {
      const { x, z } = cactusStand;
      const yaw = settlementRandom(seed, "cactus-stand:yaw") * 2 * Math.PI;
      place(x, z, 4.4, yaw);
      for (const side of [-1, 1]) {
        const px = x - fz * side * 2,
          pz = z + fx * side * 2;
        if (rockGap(px, pz) >= 0.48) place(px, pz, 2.25, yaw + side);
      }
    }
    if (plants.length) placements.set(species, plants);
  }
  renderProceduralVegetation(owner, resources, placements, seed);
}

function renderProceduralVegetation(
  owner: Entity,
  resources: DesertVegetationResources,
  placements: ReadonlyMap<Species, Placement[]>,
  seed: number
): void {
  for (const [species, plants] of placements) {
    const materials = Object.fromEntries(
      Object.keys(palette[species]).map((slot) => {
        const material = createSurfaceMaterial(owner.engine, { baseColor: new Color(1, 1, 1, 1) });
        material.renderFace = RenderFace.Double;
        resources.release.push(() => material.destroy());
        return [slot, material];
      })
    );
    const reference = createProceduralPlantMeshes(owner.engine, recipe(species, 0), 0, true);
    resources.release.push(() => reference.destroy());
    const floor = Math.min(...reference.parts.map(({ mesh }) => mesh.bounds.min.y));
    const height = Math.max(...reference.parts.map(({ mesh }) => mesh.bounds.max.y)) - floor;
    for (let level = 0; level < 3; level++) {
      const points = plants.filter((point) => point[5] === level);
      if (!points.length) continue;
      const sources =
        level === 0 ? reference : createProceduralPlantMeshes(owner.engine, recipe(species, level), 0, true);
      if (sources !== reference) resources.release.push(() => sources.destroy());
      const bounds = new BoundingBox(
        new Vector3(Infinity, Infinity, Infinity),
        new Vector3(-Infinity, -Infinity, -Infinity)
      );
      const transforms = points.map(([x, y, z, targetHeight, yaw]) => {
        const scale = targetHeight / height;
        const base = y - floor * scale - Math.min(0.03, targetHeight * 0.07);
        const lo = bounds.min;
        const hi = bounds.max;
        lo.set(Math.min(lo.x, x - targetHeight), Math.min(lo.y, base - targetHeight), Math.min(lo.z, z - targetHeight));
        hi.set(
          Math.max(hi.x, x + targetHeight),
          Math.max(hi.y, base + targetHeight * 2),
          Math.max(hi.z, z + targetHeight)
        );
        return [x, base, z, 1, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2), scale, scale, scale, 1];
      });
      const colorways: Readonly<Record<string, PlantColorways>> = palette[species];
      const colorwayIndices = points.map(([x, , z]) =>
        Math.floor(settlementRandom(seed, `desert-color:${species}:${x}:${z}`) * 3)
      );
      for (const source of sources.parts) {
        const name = `${species}/${level}/${source.materialId}`;
        const colors = colorways[source.materialId];
        const storage = createTreeAssemblyInstanceStorage(owner.engine, points.length);
        resources.release.push(() => storage.instanceBuffer.destroy(true));
        transforms.forEach((transform, index) => {
          const offset = index * storage.recordFloats;
          const color = colors[colorwayIndices[index]];
          storage.staging.set(transform, offset);
          storage.staging.set([...color, 1], offset + 12);
        });
        const view = createTreeAssemblyInstancedMesh(owner.engine, source.mesh, points.length, bounds, name, storage);
        resources.release.push(() => view.mesh.destroy());
        uploadTreeAssemblyInstances(view, points.length);
        const renderer = owner.createChild(name).addComponent(MeshRenderer);
        renderer.mesh = view.mesh;
        renderer.setMaterial(materials[source.materialId]);
        renderer.castShadows = true;
        renderer.receiveShadows = true;
        renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
      }
    }
  }
}
