import { Engine, ModelMesh, PolygonShape, PrimitiveMesh, PrimitiveMeshCapMode } from "../../../packages/core/types";
import type {
  CapsuleMeshOptions,
  CircleMeshOptions,
  ConeMeshOptions,
  CuboidMeshOptions,
  CylinderMeshOptions,
  LatheMeshOptions,
  LinearExtrusionMeshOptions,
  PathExtrusionMeshOptions,
  PlaneMeshOptions,
  PolygonMeshOptions,
  PrimitiveMeshOptions,
  RegularPolyhedronMeshOptions,
  RingMeshOptions,
  RoundedCuboidMeshOptions,
  SphereMeshOptions,
  TorusKnotMeshOptions,
  TorusMeshOptions,
  TruncatedConeMeshOptions,
  TubeMeshOptions
} from "../../../packages/galacean/types";
import { Vector2, Vector3 } from "../../../packages/math/types";

declare const engine: Engine;

const contour: readonly Vector2[] = [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)];
const hole: readonly Vector2[] = [
  new Vector2(-0.5, -0.5),
  new Vector2(-0.5, 0.5),
  new Vector2(0.5, 0.5),
  new Vector2(0.5, -0.5)
];
const polygon: PolygonShape = { points: contour, holes: [hole] };
const polygons: readonly PolygonShape[] = [polygon, { points: contour }];
const profile: readonly Vector2[] = [new Vector2(0.25, -1), new Vector2(1, 0), new Vector2(0.5, 1)];
const path: readonly Vector3[] = [new Vector3(0, 0, 0), new Vector3(0, 1, 1), new Vector3(1, 2, 2)];

const commonOptions = { keepData: true } satisfies PrimitiveMeshOptions;
const sphereOptions = {
  radius: 1,
  subdivisions: 4,
  horizontalRange: new Vector2(350, 370),
  verticalRange: new Vector2(30, 150),
  keepData: true
} satisfies SphereMeshOptions;
const cuboidOptions = {
  width: 2,
  height: 3,
  depth: 4,
  widthSegments: 2,
  heightSegments: 3,
  depthSegments: 4,
  separateMaterials: true,
  keepData: true
} satisfies CuboidMeshOptions;
const planeOptions = {
  width: 10,
  height: 5,
  horizontalSegments: 4,
  verticalSegments: 2,
  keepData: true
} satisfies PlaneMeshOptions;
const cylinderOptions = {
  radius: 1,
  height: 2,
  radialSegments: 32,
  heightSegments: 4,
  caps: PrimitiveMeshCapMode.Bottom,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies CylinderMeshOptions;
const truncatedConeOptions = {
  topRadius: 0.5,
  bottomRadius: 1,
  height: 2,
  radialSegments: 32,
  heightSegments: 4,
  caps: PrimitiveMeshCapMode.None,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies TruncatedConeMeshOptions;
const coneOptions = {
  radius: 1,
  height: 2,
  radialSegments: 32,
  heightSegments: 4,
  cap: false,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies ConeMeshOptions;
const capsuleOptions = {
  radius: 0.5,
  height: 2,
  radialSegments: 12,
  capSegments: 6,
  heightSegments: 3,
  keepData: true
} satisfies CapsuleMeshOptions;
const torusOptions = {
  radius: 1,
  tubeRadius: 0.2,
  tubularSegments: 64,
  radialSegments: 16,
  angleRange: new Vector2(0, 270),
  tubeRange: new Vector2(0, 180),
  keepData: true
} satisfies TorusMeshOptions;
const circleOptions = {
  radius: 1,
  segments: 32,
  angleRange: new Vector2(0, 180),
  keepData: true
} satisfies CircleMeshOptions;
const ringOptions = {
  outerRadius: 1,
  innerRadius: 0.5,
  radialSegments: 32,
  widthSegments: 4,
  angleRange: new Vector2(0, 270),
  keepData: true
} satisfies RingMeshOptions;
const regularPolyhedronOptions = { radius: 1, segments: 2, keepData: true } satisfies RegularPolyhedronMeshOptions;
const latheOptions = { segments: 32, angleRange: new Vector2(0, 270), keepData: true } satisfies LatheMeshOptions;
const tubeOptions = {
  radius: 0.1,
  tubularSegments: 64,
  radialSegments: 8,
  closed: true,
  keepData: true
} satisfies TubeMeshOptions;
const polygonOptions = { separateMaterials: true, keepData: true } satisfies PolygonMeshOptions;
const linearExtrusionOptions = {
  depth: 2,
  steps: 4,
  bevelSize: 0.1,
  bevelThickness: 0.2,
  bevelOffset: 0.1,
  bevelSegments: 3,
  separateMaterials: true,
  keepData: true
} satisfies LinearExtrusionMeshOptions;
const pathExtrusionOptions = {
  path,
  steps: 32,
  closed: true,
  separateMaterials: true,
  keepData: true
} satisfies PathExtrusionMeshOptions;
const extrusionOptions: LinearExtrusionMeshOptions | PathExtrusionMeshOptions = pathExtrusionOptions;
const torusKnotOptions = {
  radius: 1,
  tubeRadius: 0.2,
  p: 2,
  q: 3,
  tubularSegments: 64,
  radialSegments: 12,
  keepData: true
} satisfies TorusKnotMeshOptions;
const roundedCuboidOptions = {
  width: 2,
  height: 3,
  depth: 4,
  cornerRadius: 0.2,
  segments: 4,
  separateMaterials: true,
  keepData: true
} satisfies RoundedCuboidMeshOptions;

// Every factory lists its default call and a configuration containing all supported fields
const meshes: ModelMesh[] = [
  PrimitiveMesh.createSphere(engine),
  PrimitiveMesh.createSphere(engine, sphereOptions),
  PrimitiveMesh.createCuboid(engine),
  PrimitiveMesh.createCuboid(engine, cuboidOptions),
  PrimitiveMesh.createPlane(engine),
  PrimitiveMesh.createPlane(engine, planeOptions),
  PrimitiveMesh.createCylinder(engine),
  PrimitiveMesh.createCylinder(engine, cylinderOptions),
  PrimitiveMesh.createTruncatedCone(engine),
  PrimitiveMesh.createTruncatedCone(engine, truncatedConeOptions),
  PrimitiveMesh.createCone(engine),
  PrimitiveMesh.createCone(engine, coneOptions),
  PrimitiveMesh.createCapsule(engine),
  PrimitiveMesh.createCapsule(engine, capsuleOptions),
  PrimitiveMesh.createTorus(engine),
  PrimitiveMesh.createTorus(engine, torusOptions),
  PrimitiveMesh.createCircle(engine),
  PrimitiveMesh.createCircle(engine, circleOptions),
  PrimitiveMesh.createRing(engine),
  PrimitiveMesh.createRing(engine, ringOptions),
  PrimitiveMesh.createTetrahedron(engine),
  PrimitiveMesh.createTetrahedron(engine, regularPolyhedronOptions),
  PrimitiveMesh.createOctahedron(engine),
  PrimitiveMesh.createOctahedron(engine, regularPolyhedronOptions),
  PrimitiveMesh.createIcosahedron(engine),
  PrimitiveMesh.createIcosahedron(engine, regularPolyhedronOptions),
  PrimitiveMesh.createDodecahedron(engine),
  PrimitiveMesh.createDodecahedron(engine, regularPolyhedronOptions),
  PrimitiveMesh.createLathe(engine, profile),
  PrimitiveMesh.createLathe(engine, profile, latheOptions),
  PrimitiveMesh.createTube(engine, path),
  PrimitiveMesh.createTube(engine, path, tubeOptions),
  PrimitiveMesh.createPolygon(engine, contour),
  PrimitiveMesh.createPolygon(engine, contour, polygonOptions),
  PrimitiveMesh.createPolygon(engine, polygon),
  PrimitiveMesh.createPolygon(engine, polygon, polygonOptions),
  PrimitiveMesh.createPolygon(engine, polygons),
  PrimitiveMesh.createPolygon(engine, polygons, polygonOptions),
  PrimitiveMesh.createExtrusion(engine, contour),
  PrimitiveMesh.createExtrusion(engine, contour, linearExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygon),
  PrimitiveMesh.createExtrusion(engine, polygon, linearExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygons),
  PrimitiveMesh.createExtrusion(engine, polygons, linearExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, contour, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygon, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygons, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygons, extrusionOptions),
  PrimitiveMesh.createTorusKnot(engine),
  PrimitiveMesh.createTorusKnot(engine, torusKnotOptions),
  PrimitiveMesh.createRoundedCuboid(engine),
  PrimitiveMesh.createRoundedCuboid(engine, roundedCuboidOptions),

  // Partial configuration and common settings remain convenient
  PrimitiveMesh.createSphere(engine, commonOptions),
  PrimitiveMesh.createSphere(engine, { radius: 1 }),
  PrimitiveMesh.createSphere(engine, { subdivisions: 4 }),
  PrimitiveMesh.createRing(engine, { outerRadius: 1 }),
  PrimitiveMesh.createCuboid(engine, { width: 2 }),
  PrimitiveMesh.createCylinder(engine, { caps: PrimitiveMeshCapMode.Both }),
  PrimitiveMesh.createCylinder(engine, { caps: PrimitiveMeshCapMode.Top }),
  PrimitiveMesh.createExtrusion(engine, polygon, { path })
];
void meshes;

// @ts-expect-error Numeric positional overloads are not part of the API
PrimitiveMesh.createSphere(engine, 1);
// @ts-expect-error Sphere options are an object
PrimitiveMesh.createSphere(engine, false);
// @ts-expect-error Spheres do not define material groups
PrimitiveMesh.createSphere(engine, { separateMaterials: true });
// @ts-expect-error Planes do not define material groups
PrimitiveMesh.createPlane(engine, { separateMaterials: true });
// @ts-expect-error Tori do not define material groups
PrimitiveMesh.createTorus(engine, { separateMaterials: true });
// @ts-expect-error Tubes do not define material groups
PrimitiveMesh.createTube(engine, path, { separateMaterials: true });
// @ts-expect-error Spheres have one canonical creation method
PrimitiveMesh.createSubdivisionSphere(engine);
// @ts-expect-error Arbitrary polyhedra are not a scene-building primitive
PrimitiveMesh.createPolyhedron(engine, [], []);
// @ts-expect-error Spheres use one subdivision level rather than independent segment counts
PrimitiveMesh.createSphere(engine, { horizontalSegments: 32 });
// @ts-expect-error Angular ranges use Vector2 rather than arrays
PrimitiveMesh.createCircle(engine, { angleRange: [0, 180] });
// @ts-expect-error Runtime ranges require Vector2 instances
PrimitiveMesh.createSphere(engine, { horizontalRange: { x: 0, y: 180 } });
// @ts-expect-error A cylinder cap selection must describe a supported combination
PrimitiveMesh.createCylinder(engine, { caps: "left" });
// @ts-expect-error Cap modes use the exported enum rather than raw strings
PrimitiveMesh.createCylinder(engine, { caps: "top" });
// @ts-expect-error Truncated cones use the same cap-mode enum
PrimitiveMesh.createTruncatedCone(engine, { caps: "none" });
// Extra fields from the other mode follow normal structural compatibility
PrimitiveMesh.createExtrusion(engine, polygon, { path, bevelSize: 0.1 });
PrimitiveMesh.createExtrusion(engine, polygon, { path, bevelOffset: 0.1 });
PrimitiveMesh.createExtrusion(engine, polygon, { depth: 2, closed: true });
// @ts-expect-error Bevel offsets use numeric local units
PrimitiveMesh.createExtrusion(engine, polygon, { bevelOffset: "0.1" });

const mixedExtrusion = { path, depth: 2 };
PrimitiveMesh.createExtrusion(engine, polygon, mixedExtrusion);
const beveledPath = { path, bevelSize: 0.1 };
PrimitiveMesh.createExtrusion(engine, polygon, beveledPath);

// @ts-expect-error Explicit linear settings do not declare a path
const invalidLinearOptions: LinearExtrusionMeshOptions = { path };
// @ts-expect-error Explicit path settings do not declare bevels
const invalidPathOptions: PathExtrusionMeshOptions = { path, bevelSize: 0.1 };

const samplePath = (t: number, out: Vector3): void => {
  out.set(t, t * t, 0);
};
// @ts-expect-error Tube paths accept point arrays
PrimitiveMesh.createTube(engine, samplePath);
// @ts-expect-error Extrusion paths accept point arrays
PrimitiveMesh.createExtrusion(engine, polygon, { path: samplePath });
// @ts-expect-error A lathe requires a profile
PrimitiveMesh.createLathe(engine);
// @ts-expect-error A tube requires a path
PrimitiveMesh.createTube(engine);
// @ts-expect-error A polygon requires contours
PrimitiveMesh.createPolygon(engine);

const serializedContour = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 }
];
const serializedPath = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 }
];
// @ts-expect-error Lathe profiles use Vector2 instances
PrimitiveMesh.createLathe(engine, serializedContour);
// @ts-expect-error Polygon contours use Vector2 instances
PrimitiveMesh.createPolygon(engine, serializedContour);
// @ts-expect-error Polygon holes also use Vector2 instances
PrimitiveMesh.createPolygon(engine, { points: contour, holes: [serializedContour] });
// @ts-expect-error Path points use Vector3 instances
PrimitiveMesh.createTube(engine, serializedPath);
