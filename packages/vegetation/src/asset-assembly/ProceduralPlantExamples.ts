import {
  type PlantPart,
  type PlantShape,
  type PlantSurfaceSection,
  type ProceduralPlantStructure
} from "./ProceduralPlantGeometry";

/** Authoring examples for the geometry lab, not reconstructions or production species replacements. */
export type PlantExampleKind = "tree" | "shrub" | "grass" | "flower";
const baseSection: PlantSurfaceSection = {
  at: 0,
  center: [0, 0, 0],
  leftWidth: 0,
  rightWidth: 0,
  leftFold: 0,
  rightFold: 0,
  leftCurl: 0,
  rightCurl: 0,
  twist: 0
};
const leaf: PlantShape = {
  kind: "surface",
  shading: "smooth",
  sections: [
    { ...baseSection, leftWidth: 0.025, rightWidth: 0.025 },
    {
      ...baseSection,
      at: 0.4,
      center: [0, 0.35, 0.04],
      leftWidth: 0.18,
      rightWidth: 0.22,
      leftFold: 0.25,
      rightFold: 0.25
    },
    { ...baseSection, at: 1, center: [0, 0.8, 0.18] }
  ]
};
const blade: PlantShape = {
  kind: "surface",
  shading: "smooth",
  sections: [
    { ...baseSection, leftWidth: 0.045, rightWidth: 0.045, leftFold: 0.45, rightFold: 0.45 },
    {
      ...baseSection,
      at: 0.45,
      center: [0, 0.55, 0.12],
      leftWidth: 0.04,
      rightWidth: 0.04,
      leftFold: 0.3,
      rightFold: 0.3
    },
    { ...baseSection, at: 1, center: [0, 0.85, 0.6] }
  ]
};
const petal: PlantShape = {
  kind: "surface",
  shading: "smooth",
  sections: [
    { ...baseSection, leftWidth: 0.025, rightWidth: 0.025 },
    {
      ...baseSection,
      at: 0.55,
      center: [0, 0.25, 0.03],
      leftWidth: 0.14,
      rightWidth: 0.14,
      leftCurl: 0.3,
      rightCurl: 0.3
    },
    { ...baseSection, at: 0.85, center: [0, 0.38, 0.1], leftWidth: 0.1, rightWidth: 0.1 },
    { ...baseSection, at: 1, center: [0, 0.42, 0.14] }
  ]
};
const stem: PlantShape = {
  kind: "tube",
  capStart: true,
  capEnd: true,
  sections: [
    { at: 0, center: [0, 0, 0], radius: 0.065 },
    { at: 0.5, center: [0.06, 0.8, 0], radius: 0.04 },
    { at: 1, center: [0.18, 1.6, 0], radius: 0.012 }
  ]
};
const flowerStem: PlantShape = {
  kind: "tube",
  capStart: true,
  capEnd: true,
  sections: [
    { at: 0, center: [0, 0, 0], radius: 0.018 },
    { at: 1, center: [0, 1, 0], radius: 0.012 }
  ]
};
const flowerCenter: PlantShape = {
  kind: "tube",
  capStart: false,
  capEnd: false,
  sections: [
    { at: 0, center: [0, -0.035, 0], radius: 0 },
    { at: 0.5, center: [0, 0, 0], radius: 0.09 },
    { at: 1, center: [0, 0.065, 0], radius: 0 }
  ]
};

function part(id: string, shapeId: string, materialId: string, changes: Partial<PlantPart> = {}): PlantPart {
  return {
    id,
    shapeId,
    materialId,
    parentId: null,
    attachment: 0,
    offset: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    scale: 1,
    ...changes
  };
}

/** Deterministic authoring recipe. Its output is the final serializable runtime structure. */
export function createPlantGeometryExample(kind: PlantExampleKind): ProceduralPlantStructure {
  const parts: PlantPart[] = [];
  const shapes: Record<string, PlantShape> = {};
  if (kind === "tree" || kind === "shrub") {
    Object.assign(shapes, { stem, leaf });
    // These are example recipe choices, not category rules in the geometry compiler.
    const roots = kind === "shrub" ? 5 : 1;
    for (let root = 0; root < roots; root++) {
      const angle = (root * 2 * Math.PI) / roots;
      const id = `stem-${root}`;
      parts.push(
        part(id, "stem", "bark", {
          scale: kind === "tree" ? 1.8 : 0.8,
          orientation: [Math.sin(angle) * Math.sin(0.3), 0, Math.cos(angle) * Math.sin(0.3), Math.cos(0.3)]
        })
      );
      for (let branch = 0; branch < 5; branch++) {
        const azimuth = branch * Math.PI * (3 - Math.sqrt(5));
        const branchId = `${id}/branch-${branch}`;
        parts.push(
          part(branchId, "stem", "bark", {
            parentId: id,
            attachment: 0.25 + branch * 0.14,
            scale: 0.45,
            orientation: [Math.sin(azimuth) * Math.sin(0.55), 0, Math.cos(azimuth) * Math.sin(0.55), Math.cos(0.55)]
          })
        );
        for (let node = 0; node < 6; node++) {
          const angle = node * Math.PI * (3 - Math.sqrt(5));
          parts.push(
            part(`${branchId}/leaf-${node}`, "leaf", "foliage", {
              parentId: branchId,
              attachment: (node + 1) / 6,
              scale: 1,
              orientation: [Math.sin(angle) * Math.sin(0.7), 0, Math.cos(angle) * Math.sin(0.7), Math.cos(0.7)]
            })
          );
        }
      }
    }
  } else if (kind === "grass") {
    shapes.blade = blade;
    for (let i = 0; i < 17; i++) {
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      const radius = 0.12 * Math.sqrt(i / 17);
      parts.push(
        part(`blade-${i}`, "blade", "foliage", {
          offset: [radius * Math.cos(angle), 0, radius * Math.sin(angle)],
          orientation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
          scale: 0.7 + 0.3 * (1 - i / 17)
        })
      );
    }
  } else if (kind === "flower") {
    Object.assign(shapes, { stem: flowerStem, leaf, petal, center: flowerCenter });
    parts.push(part("stem", "stem", "foliage"));
    parts.push(part("center", "center", "pollen", { parentId: "stem", attachment: 1 }));
    for (let i = 0; i < 8; i++) {
      const angle = (i * 2 * Math.PI) / 8;
      // Rotate local up into the horizontal radial direction and local front toward world up.
      const s = Math.sin(angle / 2),
        c = Math.cos(angle / 2),
        h = Math.SQRT1_2;
      parts.push(
        part(`petal-${i}`, "petal", "petal", {
          parentId: "stem",
          attachment: 1,
          orientation: [-h * c, h * s, h * s, h * c]
        })
      );
    }
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      parts.push(
        part(`leaf-${i}`, "leaf", "foliage", {
          parentId: "stem",
          attachment: 0.2 + i * 0.2,
          scale: 0.5,
          orientation: [Math.sin(angle) * Math.sin(0.6), 0, Math.cos(angle) * Math.sin(0.6), Math.cos(0.6)]
        })
      );
    }
  } else {
    throw new Error(`Unknown plant example: ${String(kind)}`);
  }
  return {
    version: 1,
    shapes,
    parts,
    lods: [
      { partIds: parts.map((p) => p.id), resolution: { subdivisionsPerSpan: 4, widthSegments: 4, radialSegments: 12 } },
      { partIds: parts.map((p) => p.id), resolution: { subdivisionsPerSpan: 1, widthSegments: 2, radialSegments: 6 } }
    ]
  };
}
