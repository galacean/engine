import { parsePlantGrowthRecipe } from "../../src/farming/procedural/core/validation";
import type { GrowthCurve, PlantGrowthMetadata, PlantGrowthRecipe, PlantPoint } from "../../src/farming/procedural/core";

const curve = <T>(ages: readonly number[], values: readonly T[]): GrowthCurve<T> =>
  ages.map((age, i) => ({ age, value: values[i] }));
const pose = (offset: PlantPoint, azimuth = 0) => ({ offset, azimuth });
const constant = <T>(value: T): GrowthCurve<T> => [{ age: 0, value }];

/** Authored test content: four reference ages, basal leaves, no fruit or support. Not a measured crop asset. */
export function rosetteRecipe(): PlantGrowthRecipe {
  const ages = [0, 0.2, 0.8, 1];
  const surface = (size: number): PlantPoint[] =>
    Array.from({ length: 9 }, (_, i) => {
      const row = Math.floor(i / 3),
        col = i % 3;
      return [
        (row * size) / 2,
        Math.sin((row / 2) * Math.PI) * size * 0.2,
        (col - 1) * size * 0.4 * (row === 0 ? 0 : 1)
      ];
    });
  return parsePlantGrowthRecipe({
    schemaVersion: 1,
    revision: 1,
    leafTemplates: [],
    id: "test-rosette",
    anchors: [
      { id: "base", poses: constant(pose([0, 0, 0])) },
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `leaf-anchor-${i}`,
        parent: "base",
        poses: curve(
          ages,
          ages.map(() => pose([0, 0, 0], (i * Math.PI * 2) / 3))
        )
      }))
    ],
    surfaces: [
      {
        id: "leaf",
        columns: 3,
        rows: 3,
        lengthSample: 7,
        uvs: Array.from({ length: 9 }, (_, i) => [(i % 3) / 2, Math.floor(i / 3) / 2] as const)
      }
    ],
    stems: [],
    leaves: Array.from({ length: 3 }, (_, i) => ({
      id: `leaf-${i}`,
      anchor: `leaf-anchor-${i}`,
      surface: "leaf",
      poses: curve(ages, [0.08, 0.15, 0.6, 0.4].map(surface)),
      ...(i > 0 ? { scale: curve([0.15 + i * 0.1, 0.45 + i * 0.1, 0.8, 1], [0, 1, 1, 0.3]) } : {})
    })),
    volumes: [],
    supports: [],
    maturity: constant(0)
  });
}

/** Two reference ages; a true child branch and a volume attached directly to its tip. */
export function branchingRecipe(): PlantGrowthRecipe {
  return parsePlantGrowthRecipe({
    schemaVersion: 1,
    revision: 1,
    leafTemplates: [],
    id: "test-branching",
    surfaces: [],
    leaves: [],
    supports: [],
    maturity: curve([0, 1], [0, 1]),
    anchors: [
      { id: "branch-tip", parent: "fork", poses: curve([0, 1], [pose([0.1, 0.1, 0]), pose([0.5, 0.4, 0])]) },
      { id: "fork", parent: "base", poses: curve([0, 1], [pose([0, 0.1, 0]), pose([0, 1, 0], Math.PI / 2)]) },
      { id: "base", poses: constant(pose([0, 0, 0])) }
    ],
    stems: [
      {
        id: "trunk",
        path: ["base", "fork"],
        radii: curve(
          [0, 1],
          [
            [0.01, 0.008],
            [0.05, 0.03]
          ]
        ),
        sides: 8,
        uv: [0.2, 0.15]
      },
      {
        id: "branch",
        path: ["fork", "branch-tip"],
        radii: curve(
          [0, 1],
          [
            [0.008, 0.002],
            [0.03, 0.005]
          ]
        ),
        sides: 5,
        uv: [0.2, 0.15]
      }
    ],
    volumes: [
      {
        id: "flower",
        kind: "flower",
        anchor: "branch-tip",
        poses: curve(
          [0, 1],
          [
            { offset: [0, 0, 0], radii: [0.01, 0.01, 0.01] },
            { offset: [0, 0, 0], radii: [0.1, 0.2, 0.1] }
          ]
        ),
        scale: curve([0.4, 0.8], [0, 1]),
        uv: [0.8, 0.12],
        tint: false
      }
    ]
  });
}

export function fixtureMetadata(id: string): PlantGrowthMetadata {
  return {
    schemaVersion: 1,
    revision: 1,
    id,
    name: id,
    description: "Authored structural validation fixture",
    source: { author: "Project test fixture", license: "Test data", url: "https://example.com/plant-fixture" },
    material: { alphaCutoff: 0.5, doubleSided: true, roughness: 1, metallic: 0 },
    preview: {
      initialAge: 0.4,
      durationSeconds: 4,
      landmarks: [
        { age: 0, label: "芽" },
        { age: 0.2, label: "展开" },
        { age: 0.8, label: "成株" },
        { age: 1, label: "后期" }
      ],
      phases: [
        { age: 0, label: "生长" },
        { age: 0.8, label: "后期" }
      ],
      note: "结构测试数据，不是实测植物"
    }
  };
}
