import { PrimitiveMesh } from "../../../packages/core/types";
import { PrimitiveMeshCapMode } from "../../../packages/galacean/types";
import type { PrimitiveMeshAsset } from "../../../packages/loader/types";
import type { PrimitiveMeshAsset as EnginePrimitiveMeshAsset } from "../../../packages/galacean/types";

type CreationType = {
  [Name in keyof typeof PrimitiveMesh]: Name extends `create${infer Shape}` ? Uncapitalize<Shape> : never;
}[keyof typeof PrimitiveMesh];
const everyFactoryHasAnAsset: Exclude<CreationType, PrimitiveMeshAsset["type"]> extends never ? true : never = true;
const everyAssetHasAFactory: Exclude<PrimitiveMeshAsset["type"], CreationType> extends never ? true : never = true;

const sphere: PrimitiveMeshAsset = {
  type: "sphere",
  sphereOptions: { verticalRange: { x: 0, y: 90 }, keepData: true, radius: 1, subdivisions: 3 }
};
const exportedFromEngine: EnginePrimitiveMeshAsset = sphere;
const sphereSection: PrimitiveMeshAsset = {
  type: "sphere",
  sphereOptions: { horizontalRange: { x: 350, y: 370 }, verticalRange: { x: 30, y: 150 }, radius: 1, subdivisions: 3 }
};
const ungroupedSphere: PrimitiveMeshAsset = {
  type: "sphere",
  sphereOptions: {
    // @ts-expect-error Sphere assets do not define material groups
    separateMaterials: true
  }
};
const path = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 2 }
] as const;
const shapes = [
  {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ]
  }
] as const;

const tube: PrimitiveMeshAsset = { type: "tube", tubePath: path, tubeOptions: { closed: true } };
const polygon: PrimitiveMeshAsset = { type: "polygon", polygonShapes: shapes };
const extrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  extrusionOptions: { bevelSize: 0.1, bevelOffset: 0.2, separateMaterials: true, depth: 2 }
};
const pathExtrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  extrusionOptions: { closed: true, path: path }
};
const torusKnot: PrimitiveMeshAsset = { type: "torusKnot", torusKnotOptions: { p: -2, q: -3 } };
const cylinder: PrimitiveMeshAsset = {
  type: "cylinder",
  cylinderOptions: { caps: PrimitiveMeshCapMode.Bottom }
};
const truncatedCone: PrimitiveMeshAsset = {
  type: "truncatedCone",
  truncatedConeOptions: { caps: PrimitiveMeshCapMode.Top }
};

// @ts-expect-error Primitive types must name a supported factory
const invalidType: PrimitiveMeshAsset = { type: "star" };
// @ts-expect-error A tube asset needs a serializable path
const missingPath: PrimitiveMeshAsset = { type: "tube" };
// @ts-expect-error Asset paths contain coordinates, not callbacks
const callbackPath: PrimitiveMeshAsset = { type: "tube", tubePath: (t: number) => t };
// @ts-expect-error A polygon asset needs its contours
const missingShapes: PrimitiveMeshAsset = { type: "polygon" };
const mixedExtrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  // @ts-expect-error An extrusion uses either a depth or a path
  extrusionOptions: { depth: 2, path: path }
};
const beveledPath: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  // @ts-expect-error Path extrusion does not support bevels
  extrusionOptions: { bevelSize: 1, path: path }
};
const offsetPath: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  // @ts-expect-error Path extrusion does not support contour offsets
  extrusionOptions: { bevelOffset: 0.1, path: path }
};
const closedDepth: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionShapes: shapes,
  // @ts-expect-error Only path extrusion can be closed
  extrusionOptions: { closed: true, depth: 2 }
};
// @ts-expect-error Shape options cannot be applied to another primitive
const wrongOptions: PrimitiveMeshAsset = { type: "sphere", sphereOptions: { caps: PrimitiveMeshCapMode.Both } };
// @ts-expect-error TypeScript assets use the cap-mode enum
const stringCap: PrimitiveMeshAsset = { type: "cylinder", cylinderOptions: { caps: "top" } };
// @ts-expect-error Serialized angular ranges use coordinate objects rather than arrays
const wrongRange: PrimitiveMeshAsset = { type: "circle", circleOptions: { angleRange: [0, 180] } };
// @ts-expect-error Spheres use one subdivision level rather than independent segment counts
const segmentedSphere: PrimitiveMeshAsset = { type: "sphere", sphereOptions: { horizontalSegments: 32 } };
// @ts-expect-error Spheres have one canonical asset type
const duplicateSphere: PrimitiveMeshAsset = { type: "subdivisionSphere" };
// @ts-expect-error End radii belong to truncatedCone
const endRadiiAsCylinder: PrimitiveMeshAsset = { type: "cylinder", cylinderOptions: { radiusTop: 1 } };

void [
  everyFactoryHasAnAsset,
  everyAssetHasAFactory,
  exportedFromEngine,
  sphereSection,
  ungroupedSphere,
  tube,
  polygon,
  extrusion,
  pathExtrusion,
  torusKnot,
  cylinder,
  truncatedCone,
  invalidType,
  missingPath,
  callbackPath,
  missingShapes,
  mixedExtrusion,
  beveledPath,
  offsetPath,
  closedDepth,
  wrongOptions,
  stringCap,
  wrongRange,
  segmentedSphere,
  duplicateSphere,
  endRadiiAsCylinder
];
