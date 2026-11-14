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
  sphereRadius: 1,
  sphereOptions: { verticalRange: { x: 0, y: 90 }, keepData: true, subdivisions: 3 }
};
const exportedFromEngine: EnginePrimitiveMeshAsset = sphere;
const sphereSection: PrimitiveMeshAsset = {
  type: "sphere",
  sphereRadius: 1,
  sphereOptions: { horizontalRange: { x: 350, y: 370 }, verticalRange: { x: 30, y: 150 }, subdivisions: 3 }
};
const ungroupedSphere: PrimitiveMeshAsset = {
  type: "sphere",
  sphereRadius: 0.5,
  // @ts-expect-error Sphere assets do not define material groups
  sphereOptions: { separateMaterials: true }
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

const tube: PrimitiveMeshAsset = { type: "tube", tubeRadius: 0.5, tubePath: path, tubeOptions: { closed: true } };
const polygon: PrimitiveMeshAsset = { type: "polygon", polygonShapes: shapes };
const extrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionDepth: 2,
  extrusionShapes: shapes,
  extrusionOptions: { bevelSize: 0.1, bevelOffset: 0.2, separateMaterials: true }
};
const pathExtrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionPath: path,
  extrusionShapes: shapes,
  extrusionOptions: { closed: true }
};
const torusKnot: PrimitiveMeshAsset = {
  type: "torusKnot",
  torusKnotRadius: 0.5,
  torusKnotTubeRadius: 0.1,
  torusKnotP: -2,
  torusKnotQ: -3
};
const cylinder: PrimitiveMeshAsset = {
  type: "cylinder",
  cylinderRadius: 0.5,
  cylinderHeight: 2,
  cylinderOptions: { caps: PrimitiveMeshCapMode.Bottom }
};
const truncatedCone: PrimitiveMeshAsset = {
  type: "truncatedCone",
  truncatedConeTopRadius: 0.25,
  truncatedConeBottomRadius: 0.5,
  truncatedConeHeight: 2,
  truncatedConeOptions: { caps: PrimitiveMeshCapMode.Top }
};

// @ts-expect-error Primitive types must name a supported factory
const invalidType: PrimitiveMeshAsset = { type: "star" };
// @ts-expect-error A tube asset needs a serializable path
const missingPath: PrimitiveMeshAsset = { type: "tube", tubeRadius: 0.5 };
// @ts-expect-error Asset paths contain coordinates, not callbacks
const callbackPath: PrimitiveMeshAsset = { type: "tube", tubeRadius: 0.5, tubePath: (t: number) => t };
// @ts-expect-error A polygon asset needs its contours
const missingShapes: PrimitiveMeshAsset = { type: "polygon" };
const mixedExtrusion: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionDepth: 2,
  extrusionPath: path,
  extrusionShapes: shapes
};
const beveledPath: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionPath: path,
  extrusionShapes: shapes,
  extrusionOptions: { bevelSize: 1 }
};
const offsetPath: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionPath: path,
  extrusionShapes: shapes,
  extrusionOptions: { bevelOffset: 0.1 }
};
const closedDepth: PrimitiveMeshAsset = {
  type: "extrusion",
  extrusionDepth: 2,
  extrusionShapes: shapes,
  extrusionOptions: { closed: true }
};
const wrongOptions: PrimitiveMeshAsset = {
  type: "sphere",
  sphereRadius: 0.5,
  // @ts-expect-error Shape options cannot be applied to another primitive
  sphereOptions: { caps: PrimitiveMeshCapMode.Both }
};
const stringCap: PrimitiveMeshAsset = {
  type: "cylinder",
  cylinderRadius: 0.5,
  cylinderHeight: 2,
  // @ts-expect-error TypeScript assets use the cap-mode enum
  cylinderOptions: { caps: "top" }
};
// @ts-expect-error Serialized angular ranges use coordinate objects rather than arrays
const wrongRange: PrimitiveMeshAsset = { type: "circle", circleRadius: 0.5, circleOptions: { angleRange: [0, 180] } };
const segmentedSphere: PrimitiveMeshAsset = {
  type: "sphere",
  sphereRadius: 0.5,
  // @ts-expect-error Spheres use one subdivision level rather than independent segment counts
  sphereOptions: { horizontalSegments: 32 }
};
// @ts-expect-error Spheres have one canonical asset type
const duplicateSphere: PrimitiveMeshAsset = { type: "subdivisionSphere" };
const endRadiiAsCylinder: PrimitiveMeshAsset = {
  type: "cylinder",
  cylinderRadius: 0.5,
  cylinderHeight: 2,
  // @ts-expect-error End radii belong to truncatedCone
  cylinderOptions: { radiusTop: 1 }
};

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

// @ts-expect-error A sphere asset requires its radius
const missingRadius: PrimitiveMeshAsset = { type: "sphere" };
// @ts-expect-error A cuboid asset requires all dimensions
const missingDepth: PrimitiveMeshAsset = { type: "cuboid", cuboidWidth: 1, cuboidHeight: 1 };
// @ts-expect-error An extrusion asset requires a depth or path
const missingExtrusionInput: PrimitiveMeshAsset = { type: "extrusion", extrusionShapes: shapes };
// @ts-expect-error Dimensions no longer belong to optional settings
const radiusInOptions: PrimitiveMeshAsset = { type: "sphere", sphereRadius: 1, sphereOptions: { radius: 2 } };
void [missingRadius, missingDepth, missingExtrusionInput, radiusInOptions];
