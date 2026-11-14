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
  subdivisions: 4,
  horizontalRange: new Vector2(350, 370),
  verticalRange: new Vector2(30, 150),
  keepData: true
} satisfies SphereMeshOptions;
const cuboidOptions = {
  widthSegments: 2,
  heightSegments: 3,
  depthSegments: 4,
  separateMaterials: true,
  keepData: true
} satisfies CuboidMeshOptions;
const planeOptions = { horizontalSegments: 4, verticalSegments: 2, keepData: true } satisfies PlaneMeshOptions;
const cylinderOptions = {
  radialSegments: 32,
  heightSegments: 4,
  caps: PrimitiveMeshCapMode.Bottom,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies CylinderMeshOptions;
const truncatedConeOptions = {
  radialSegments: 32,
  heightSegments: 4,
  caps: PrimitiveMeshCapMode.None,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies TruncatedConeMeshOptions;
const coneOptions = {
  radialSegments: 32,
  heightSegments: 4,
  cap: false,
  angleRange: new Vector2(0, 270),
  separateMaterials: true,
  keepData: true
} satisfies ConeMeshOptions;
const capsuleOptions = {
  radialSegments: 12,
  capSegments: 6,
  heightSegments: 3,
  keepData: true
} satisfies CapsuleMeshOptions;
const torusOptions = {
  tubularSegments: 64,
  radialSegments: 16,
  angleRange: new Vector2(0, 270),
  tubeRange: new Vector2(0, 180),
  keepData: true
} satisfies TorusMeshOptions;
const circleOptions = { segments: 32, angleRange: new Vector2(0, 180), keepData: true } satisfies CircleMeshOptions;
const ringOptions = {
  radialSegments: 32,
  widthSegments: 4,
  angleRange: new Vector2(0, 270),
  keepData: true
} satisfies RingMeshOptions;
const regularPolyhedronOptions = { segments: 2, keepData: true } satisfies RegularPolyhedronMeshOptions;
const latheOptions = { segments: 32, angleRange: new Vector2(0, 270), keepData: true } satisfies LatheMeshOptions;
const tubeOptions = { tubularSegments: 64, radialSegments: 8, closed: true, keepData: true } satisfies TubeMeshOptions;
const polygonOptions = { separateMaterials: true, keepData: true } satisfies PolygonMeshOptions;
const linearExtrusionOptions = {
  steps: 4,
  bevelSize: 0.1,
  bevelThickness: 0.2,
  bevelOffset: 0.1,
  bevelSegments: 3,
  separateMaterials: true,
  keepData: true
} satisfies LinearExtrusionMeshOptions;
const torusKnotOptions = { tubularSegments: 64, radialSegments: 12, keepData: true } satisfies TorusKnotMeshOptions;
const roundedCuboidOptions = {
  segments: 4,
  separateMaterials: true,
  keepData: true
} satisfies RoundedCuboidMeshOptions;
const pathExtrusionOptions = {
  steps: 32,
  closed: true,
  separateMaterials: true,
  keepData: true
} satisfies PathExtrusionMeshOptions;
const extrusionOptions: LinearExtrusionMeshOptions | PathExtrusionMeshOptions = pathExtrusionOptions;

// Every factory lists its required inputs and a configuration containing all optional fields
const meshes: ModelMesh[] = [
  PrimitiveMesh.createSphere(engine, 0.5),
  PrimitiveMesh.createSphere(engine, 1, sphereOptions),
  PrimitiveMesh.createCuboid(engine, 1, 1, 1),
  PrimitiveMesh.createCuboid(engine, 2, 3, 4, cuboidOptions),
  PrimitiveMesh.createPlane(engine, 1, 1),
  PrimitiveMesh.createPlane(engine, 10, 5, planeOptions),
  PrimitiveMesh.createCylinder(engine, 0.5, 2),
  PrimitiveMesh.createCylinder(engine, 1, 2, cylinderOptions),
  PrimitiveMesh.createTruncatedCone(engine, 0.25, 0.5, 2),
  PrimitiveMesh.createTruncatedCone(engine, 0.5, 1, 2, truncatedConeOptions),
  PrimitiveMesh.createCone(engine, 0.5, 2),
  PrimitiveMesh.createCone(engine, 1, 2, coneOptions),
  PrimitiveMesh.createCapsule(engine, 0.5, 2),
  PrimitiveMesh.createCapsule(engine, 0.5, 2, capsuleOptions),
  PrimitiveMesh.createTorus(engine, 0.5, 0.1),
  PrimitiveMesh.createTorus(engine, 1, 0.2, torusOptions),
  PrimitiveMesh.createCircle(engine, 0.5),
  PrimitiveMesh.createCircle(engine, 1, circleOptions),
  PrimitiveMesh.createRing(engine, 0.5, 0.25),
  PrimitiveMesh.createRing(engine, 1, 0.5, ringOptions),
  PrimitiveMesh.createTetrahedron(engine, 0.5),
  PrimitiveMesh.createTetrahedron(engine, 1, regularPolyhedronOptions),
  PrimitiveMesh.createOctahedron(engine, 0.5),
  PrimitiveMesh.createOctahedron(engine, 1, regularPolyhedronOptions),
  PrimitiveMesh.createIcosahedron(engine, 0.5),
  PrimitiveMesh.createIcosahedron(engine, 1, regularPolyhedronOptions),
  PrimitiveMesh.createDodecahedron(engine, 0.5),
  PrimitiveMesh.createDodecahedron(engine, 1, regularPolyhedronOptions),
  PrimitiveMesh.createLathe(engine, profile),
  PrimitiveMesh.createLathe(engine, profile, latheOptions),
  PrimitiveMesh.createTube(engine, path, 0.5),
  PrimitiveMesh.createTube(engine, path, 0.1, tubeOptions),
  PrimitiveMesh.createPolygon(engine, contour),
  PrimitiveMesh.createPolygon(engine, contour, polygonOptions),
  PrimitiveMesh.createExtrusion(engine, contour, 1),
  PrimitiveMesh.createExtrusion(engine, contour, 2, linearExtrusionOptions),
  PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 2, 3),
  PrimitiveMesh.createTorusKnot(engine, 1, 0.2, 2, 3, torusKnotOptions),
  PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0.1),
  PrimitiveMesh.createRoundedCuboid(engine, 2, 3, 4, 0.2, roundedCuboidOptions),
  PrimitiveMesh.createPolygon(engine, polygon),
  PrimitiveMesh.createPolygon(engine, polygon, polygonOptions),
  PrimitiveMesh.createExtrusion(engine, polygon, 2),
  PrimitiveMesh.createExtrusion(engine, polygon, 2, linearExtrusionOptions),
  PrimitiveMesh.createPolygon(engine, polygons),
  PrimitiveMesh.createPolygon(engine, polygons, polygonOptions),
  PrimitiveMesh.createExtrusion(engine, polygons, 2),
  PrimitiveMesh.createExtrusion(engine, polygons, 2, linearExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, contour, path),
  PrimitiveMesh.createExtrusion(engine, contour, path, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygon, path),
  PrimitiveMesh.createExtrusion(engine, polygon, path, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygons, path),
  PrimitiveMesh.createExtrusion(engine, polygons, path, pathExtrusionOptions),
  PrimitiveMesh.createExtrusion(engine, polygons, path, extrusionOptions),
  PrimitiveMesh.createSphere(engine, 1, commonOptions),
  PrimitiveMesh.createSphere(engine, 1, { subdivisions: 4 }),
  PrimitiveMesh.createCylinder(engine, 0.5, 2, { caps: PrimitiveMeshCapMode.Both }),
  PrimitiveMesh.createCylinder(engine, 0.5, 2, { caps: PrimitiveMeshCapMode.Top })
];
void meshes;

// @ts-expect-error Sphere requires every core shape input
PrimitiveMesh.createSphere(engine);
// @ts-expect-error Cuboid requires every core shape input
PrimitiveMesh.createCuboid(engine, 1, 1);
// @ts-expect-error Plane requires every core shape input
PrimitiveMesh.createPlane(engine, 1);
// @ts-expect-error Cylinder requires every core shape input
PrimitiveMesh.createCylinder(engine, 0.5);
// @ts-expect-error TruncatedCone requires every core shape input
PrimitiveMesh.createTruncatedCone(engine, 0.25, 0.5);
// @ts-expect-error Cone requires every core shape input
PrimitiveMesh.createCone(engine, 0.5);
// @ts-expect-error Capsule requires every core shape input
PrimitiveMesh.createCapsule(engine, 0.5);
// @ts-expect-error Torus requires every core shape input
PrimitiveMesh.createTorus(engine, 0.5);
// @ts-expect-error Circle requires every core shape input
PrimitiveMesh.createCircle(engine);
// @ts-expect-error Ring requires every core shape input
PrimitiveMesh.createRing(engine, 0.5);
// @ts-expect-error Tetrahedron requires every core shape input
PrimitiveMesh.createTetrahedron(engine);
// @ts-expect-error Octahedron requires every core shape input
PrimitiveMesh.createOctahedron(engine);
// @ts-expect-error Icosahedron requires every core shape input
PrimitiveMesh.createIcosahedron(engine);
// @ts-expect-error Dodecahedron requires every core shape input
PrimitiveMesh.createDodecahedron(engine);
// @ts-expect-error Lathe requires every core shape input
PrimitiveMesh.createLathe(engine);
// @ts-expect-error Tube requires every core shape input
PrimitiveMesh.createTube(engine, path);
// @ts-expect-error Polygon requires every core shape input
PrimitiveMesh.createPolygon(engine);
// @ts-expect-error Extrusion requires every core shape input
PrimitiveMesh.createExtrusion(engine, contour);
// @ts-expect-error TorusKnot requires every core shape input
PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 2);
// @ts-expect-error RoundedCuboid requires every core shape input
PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1);

// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createSphere(engine, 0.5, { radius: 1 });
// @ts-expect-error width is a required input rather than an option
PrimitiveMesh.createCuboid(engine, 1, 1, 1, { width: 1 });
// @ts-expect-error width is a required input rather than an option
PrimitiveMesh.createPlane(engine, 1, 1, { width: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createCylinder(engine, 0.5, 2, { radius: 1 });
// @ts-expect-error topRadius is a required input rather than an option
PrimitiveMesh.createTruncatedCone(engine, 0.25, 0.5, 2, { topRadius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createCone(engine, 0.5, 2, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createCapsule(engine, 0.5, 2, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createTorus(engine, 0.5, 0.1, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createCircle(engine, 0.5, { radius: 1 });
// @ts-expect-error outerRadius is a required input rather than an option
PrimitiveMesh.createRing(engine, 0.5, 0.25, { outerRadius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createTetrahedron(engine, 0.5, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createOctahedron(engine, 0.5, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createIcosahedron(engine, 0.5, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createDodecahedron(engine, 0.5, { radius: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createTube(engine, path, 0.5, { radius: 1 });
// @ts-expect-error depth is a required input rather than an option
PrimitiveMesh.createExtrusion(engine, contour, 1, { depth: 1 });
// @ts-expect-error radius is a required input rather than an option
PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 2, 3, { radius: 1 });
// @ts-expect-error width is a required input rather than an option
PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0.1, { width: 1 });

// @ts-expect-error Sphere radius is a number
PrimitiveMesh.createSphere(engine, {});
// @ts-expect-error Spheres do not define material groups
PrimitiveMesh.createSphere(engine, 1, { separateMaterials: true });
// @ts-expect-error Planes do not define material groups
PrimitiveMesh.createPlane(engine, 1, 1, { separateMaterials: true });
// @ts-expect-error Tori do not define material groups
PrimitiveMesh.createTorus(engine, 1, 0.2, { separateMaterials: true });
// @ts-expect-error Tubes do not define material groups
PrimitiveMesh.createTube(engine, path, 0.1, { separateMaterials: true });
// @ts-expect-error Spheres have one canonical creation method
PrimitiveMesh.createSubdivisionSphere(engine);
// @ts-expect-error Arbitrary polyhedra are not a scene-building primitive
PrimitiveMesh.createPolyhedron(engine, [], []);
// @ts-expect-error Spheres use one subdivision level rather than independent segment counts
PrimitiveMesh.createSphere(engine, 1, { horizontalSegments: 32 });
// @ts-expect-error Angular ranges use Vector2 rather than arrays
PrimitiveMesh.createCircle(engine, 1, { angleRange: [0, 180] });
// @ts-expect-error Runtime ranges require Vector2 instances
PrimitiveMesh.createSphere(engine, 1, { horizontalRange: { x: 0, y: 180 } });
// @ts-expect-error A cylinder cap selection must describe a supported combination
PrimitiveMesh.createCylinder(engine, 0.5, 2, { caps: "left" });
// @ts-expect-error Cap modes use the exported enum rather than raw strings
PrimitiveMesh.createCylinder(engine, 0.5, 2, { caps: "top" });
// @ts-expect-error Truncated cones use the same cap-mode enum
PrimitiveMesh.createTruncatedCone(engine, 0.25, 0.5, 2, { caps: "none" });

// Fields from the inactive mode follow normal structural compatibility
PrimitiveMesh.createExtrusion(engine, polygon, path, { bevelSize: 0.1 });
PrimitiveMesh.createExtrusion(engine, polygon, path, { bevelOffset: 0.1 });
PrimitiveMesh.createExtrusion(engine, polygon, 2, { closed: true });
// @ts-expect-error Bevel offsets use numeric local units
PrimitiveMesh.createExtrusion(engine, polygon, 2, { bevelOffset: "0.1" });
// @ts-expect-error Explicit linear settings do not declare path closure
const invalidLinearOptions: LinearExtrusionMeshOptions = { closed: true };
// @ts-expect-error Explicit path settings do not declare bevels
const invalidPathOptions: PathExtrusionMeshOptions = { bevelSize: 0.1 };

const samplePath = (t: number, out: Vector3): void => {
  out.set(t, t * t, 0);
};
// @ts-expect-error Tube paths accept point arrays
PrimitiveMesh.createTube(engine, samplePath, 0.1);
// @ts-expect-error Extrusion paths accept point arrays
PrimitiveMesh.createExtrusion(engine, polygon, samplePath);

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
PrimitiveMesh.createTube(engine, serializedPath, 0.1);
// @ts-expect-error Path extrusion points use Vector3 instances
PrimitiveMesh.createExtrusion(engine, polygon, serializedPath);
