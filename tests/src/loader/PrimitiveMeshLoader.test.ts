import {
  AssetPromise,
  AssetType,
  ModelMesh,
  PrimitiveMesh,
  PrimitiveMeshAsset,
  PrimitiveMeshCapMode,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => engine.destroy());

const profile = [
  { x: 0.25, y: -1 },
  { x: 1, y: 0 },
  { x: 0.5, y: 1 }
];
const profileVectors = profile.map(({ x, y }) => new Vector2(x, y));
const path = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 2 },
  { x: 1, y: 1, z: 3 }
];
const pathVectors = path.map(({ x, y, z }) => new Vector3(x, y, z));
const shapes = [
  {
    points: [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 }
    ],
    holes: [
      [
        { x: -1, y: -1 },
        { x: -1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 }
      ]
    ]
  },
  {
    points: [
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 3, y: 1 }
    ]
  }
];
const shapeVectors = shapes.map(({ points, holes }) => ({
  points: points.map(({ x, y }) => new Vector2(x, y)),
  holes: holes?.map((hole) => hole.map(({ x, y }) => new Vector2(x, y)))
}));
const options = { keepCPUData: true };
const groupedOptions = { keepCPUData: true, separateMaterialSlots: true };

describe("PrimitiveMeshLoader", () => {
  const defaults = {
    sphere: { data: { type: "sphere", sphereRadius: 0.5 }, create: () => PrimitiveMesh.createSphere(engine, 0.5) },
    cuboid: {
      data: { type: "cuboid", cuboidWidth: 1, cuboidHeight: 1, cuboidDepth: 1 },
      create: () => PrimitiveMesh.createCuboid(engine, 1, 1, 1)
    },
    plane: {
      data: { type: "plane", planeWidth: 1, planeDepth: 1 },
      create: () => PrimitiveMesh.createPlane(engine, 1, 1)
    },
    cylinder: {
      data: { type: "cylinder", cylinderRadius: 0.5, cylinderHeight: 2 },
      create: () => PrimitiveMesh.createCylinder(engine, 0.5, 2)
    },
    truncatedCone: {
      data: {
        type: "truncatedCone",
        truncatedConeTopRadius: 0.25,
        truncatedConeBottomRadius: 0.5,
        truncatedConeHeight: 2
      },
      create: () => PrimitiveMesh.createTruncatedCone(engine, 0.25, 0.5, 2)
    },
    cone: {
      data: { type: "cone", coneRadius: 0.5, coneHeight: 2 },
      create: () => PrimitiveMesh.createCone(engine, 0.5, 2)
    },
    capsule: {
      data: { type: "capsule", capsuleRadius: 0.5, capsuleCylinderHeight: 2 },
      create: () => PrimitiveMesh.createCapsule(engine, 0.5, 2)
    },
    torus: {
      data: { type: "torus", torusRadius: 0.5, torusTubeRadius: 0.1 },
      create: () => PrimitiveMesh.createTorus(engine, 0.5, 0.1)
    },
    circle: { data: { type: "circle", circleRadius: 0.5 }, create: () => PrimitiveMesh.createCircle(engine, 0.5) },
    ring: {
      data: { type: "ring", ringOuterRadius: 0.5, ringInnerRadius: 0.25 },
      create: () => PrimitiveMesh.createRing(engine, 0.5, 0.25)
    },
    tetrahedron: {
      data: { type: "tetrahedron", tetrahedronRadius: 0.5 },
      create: () => PrimitiveMesh.createTetrahedron(engine, 0.5)
    },
    octahedron: {
      data: { type: "octahedron", octahedronRadius: 0.5 },
      create: () => PrimitiveMesh.createOctahedron(engine, 0.5)
    },
    icosahedron: {
      data: { type: "icosahedron", icosahedronRadius: 0.5 },
      create: () => PrimitiveMesh.createIcosahedron(engine, 0.5)
    },
    dodecahedron: {
      data: { type: "dodecahedron", dodecahedronRadius: 0.5 },
      create: () => PrimitiveMesh.createDodecahedron(engine, 0.5)
    },
    lathe: {
      data: { type: "lathe", latheProfile: profile },
      create: () => PrimitiveMesh.createLathe(engine, profileVectors)
    },
    tube: {
      data: { type: "tube", tubeRadius: 0.5, tubePath: path },
      create: () => PrimitiveMesh.createTube(engine, pathVectors, 0.5)
    },
    polygon: {
      data: { type: "polygon", polygonShapes: shapes },
      create: () => PrimitiveMesh.createPolygon(engine, shapeVectors)
    },
    extrusion: {
      data: { type: "extrusion", extrusionDepth: 1, extrusionShapes: shapes },
      create: () => PrimitiveMesh.createExtrusion(engine, shapeVectors, 1)
    },
    torusKnot: {
      data: {
        type: "torusKnot",
        torusKnotRadius: 0.5,
        torusKnotTubeRadius: 0.1,
        torusKnotAxisTurns: 2,
        torusKnotCrossSectionTurns: 3
      },
      create: () => PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 2, 3)
    },
    roundedCuboid: {
      data: {
        type: "roundedCuboid",
        roundedCuboidWidth: 1,
        roundedCuboidHeight: 1,
        roundedCuboidDepth: 1,
        roundedCuboidCornerRadius: 0.1
      },
      create: () => PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0.1)
    }
  } satisfies Record<PrimitiveMeshAsset["type"], { data: PrimitiveMeshAsset; create: () => ModelMesh }>;

  const configured: { name: string; data: PrimitiveMeshAsset; create: () => ModelMesh }[] = [
    {
      name: "sphere ranges and subdivision level",
      data: {
        type: "sphere",
        sphereRadius: 2,
        sphereOptions: {
          ...options,
          horizontalAngleRange: { x: 20, y: 260 },
          verticalAngleRange: { x: 30, y: 150 },
          subdivisionLevel: 3
        }
      },
      create: () =>
        PrimitiveMesh.createSphere(engine, 2, {
          ...options,
          horizontalAngleRange: new Vector2(20, 260),
          verticalAngleRange: new Vector2(30, 150),
          subdivisionLevel: 3
        })
    },
    {
      name: "sphere",
      data: { type: "sphere", sphereRadius: 1.5, sphereOptions: { ...options, subdivisionLevel: 2 } },
      create: () => PrimitiveMesh.createSphere(engine, 1.5, { ...options, subdivisionLevel: 2 })
    },
    {
      name: "sphere angular ranges",
      data: {
        type: "sphere",
        sphereRadius: 2,
        sphereOptions: {
          ...options,
          horizontalAngleRange: { x: 350, y: 370 },
          verticalAngleRange: { x: 30, y: 150 },
          subdivisionLevel: 3
        }
      },
      create: () =>
        PrimitiveMesh.createSphere(engine, 2, {
          ...options,
          horizontalAngleRange: new Vector2(350, 370),
          verticalAngleRange: new Vector2(30, 150),
          subdivisionLevel: 3
        })
    },
    {
      name: "cuboid dimensions and segment counts",
      data: {
        type: "cuboid",
        cuboidWidth: 2,
        cuboidHeight: 3,
        cuboidDepth: 4,
        cuboidOptions: { ...groupedOptions, widthSegments: 2, heightSegments: 3, depthSegments: 4 }
      },
      create: () =>
        PrimitiveMesh.createCuboid(engine, 2, 3, 4, {
          ...groupedOptions,
          widthSegments: 2,
          heightSegments: 3,
          depthSegments: 4
        })
    },
    {
      name: "plane dimensions and segment counts",
      data: {
        type: "plane",
        planeWidth: 3,
        planeDepth: 5,
        planeOptions: { ...options, widthSegments: 2, depthSegments: 4 }
      },
      create: () => PrimitiveMesh.createPlane(engine, 3, 5, { ...options, widthSegments: 2, depthSegments: 4 })
    },
    {
      name: "cylinder caps and range",
      data: {
        type: "cylinder",
        cylinderRadius: 0.75,
        cylinderHeight: 3,
        cylinderOptions: {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Bottom,
          angleRange: { x: 20, y: 270 },
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createCylinder(engine, 0.75, 3, {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Bottom,
          angleRange: new Vector2(20, 270),
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "truncated cone end radii",
      data: {
        type: "truncatedCone",
        truncatedConeTopRadius: 0.25,
        truncatedConeBottomRadius: 1,
        truncatedConeHeight: 3,
        truncatedConeOptions: {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Top,
          angleRange: { x: 30, y: 250 },
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createTruncatedCone(engine, 0.25, 1, 3, {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Top,
          angleRange: new Vector2(30, 250),
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "cone cap and range",
      data: {
        type: "cone",
        coneRadius: 0.75,
        coneHeight: 3,
        coneOptions: {
          ...groupedOptions,
          cap: false,
          angleRange: { x: 20, y: 270 },
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createCone(engine, 0.75, 3, {
          ...groupedOptions,
          cap: false,
          angleRange: new Vector2(20, 270),
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "capsule independent segment counts",
      data: {
        type: "capsule",
        capsuleRadius: 0.75,
        capsuleCylinderHeight: 3,
        capsuleOptions: { ...options, radialSegments: 12, capSegments: 5, heightSegments: 2 }
      },
      create: () =>
        PrimitiveMesh.createCapsule(engine, 0.75, 3, {
          ...options,
          radialSegments: 12,
          capSegments: 5,
          heightSegments: 2
        })
    },
    {
      name: "torus major and tube ranges",
      data: {
        type: "torus",
        torusRadius: 2,
        torusTubeRadius: 0.25,
        torusOptions: {
          ...options,
          tubeAngleRange: { x: 45, y: 300 },
          ringAngleRange: { x: 20, y: 200 },
          ringSegments: 12,
          radialSegments: 8
        }
      },
      create: () =>
        PrimitiveMesh.createTorus(engine, 2, 0.25, {
          ...options,
          tubeAngleRange: new Vector2(45, 300),
          ringAngleRange: new Vector2(20, 200),
          ringSegments: 12,
          radialSegments: 8
        })
    },
    {
      name: "circle sector",
      data: {
        type: "circle",
        circleRadius: 2,
        circleOptions: { ...options, angleRange: { x: 30, y: 240 }, segments: 12 }
      },
      create: () =>
        PrimitiveMesh.createCircle(engine, 2, { ...options, angleRange: new Vector2(30, 240), segments: 12 })
    },
    {
      name: "ring sector",
      data: {
        type: "ring",
        ringOuterRadius: 2,
        ringInnerRadius: 0.5,
        ringOptions: { ...options, angleRange: { x: 40, y: 240 }, ringSegments: 12, widthSegments: 3 }
      },
      create: () =>
        PrimitiveMesh.createRing(engine, 2, 0.5, {
          ...options,
          angleRange: new Vector2(40, 240),
          ringSegments: 12,
          widthSegments: 3
        })
    },
    {
      name: "ring radius defaults",
      data: { type: "ring", ringOuterRadius: 2, ringInnerRadius: 1, ringOptions: { ...options } },
      create: () => PrimitiveMesh.createRing(engine, 2, 1, { ...options })
    },
    {
      name: "tetrahedron subdivision",
      data: { type: "tetrahedron", tetrahedronRadius: 2, tetrahedronOptions: { ...options, edgeSegments: 3 } },
      create: () => PrimitiveMesh.createTetrahedron(engine, 2, { ...options, edgeSegments: 3 })
    },
    {
      name: "octahedron subdivision",
      data: { type: "octahedron", octahedronRadius: 1.5, octahedronOptions: { ...options, edgeSegments: 2 } },
      create: () => PrimitiveMesh.createOctahedron(engine, 1.5, { ...options, edgeSegments: 2 })
    },
    {
      name: "icosahedron subdivision",
      data: { type: "icosahedron", icosahedronRadius: 2, icosahedronOptions: { ...options, edgeSegments: 3 } },
      create: () => PrimitiveMesh.createIcosahedron(engine, 2, { ...options, edgeSegments: 3 })
    },
    {
      name: "dodecahedron subdivision",
      data: { type: "dodecahedron", dodecahedronRadius: 1.5, dodecahedronOptions: { ...options, edgeSegments: 2 } },
      create: () => PrimitiveMesh.createDodecahedron(engine, 1.5, { ...options, edgeSegments: 2 })
    },
    {
      name: "lathe profile and range",
      data: {
        type: "lathe",
        latheProfile: profile,
        latheOptions: { ...options, angleRange: { x: 30, y: 270 }, segments: 16 }
      },
      create: () =>
        PrimitiveMesh.createLathe(engine, profileVectors, {
          ...options,
          angleRange: new Vector2(30, 270),
          segments: 16
        })
    },
    {
      name: "closed tube path",
      data: {
        type: "tube",
        tubeRadius: 0.2,
        tubePath: path,
        tubeOptions: { ...options, closedPath: true, pathSegments: 16, radialSegments: 6 }
      },
      create: () =>
        PrimitiveMesh.createTube(engine, pathVectors, 0.2, {
          ...options,
          closedPath: true,
          pathSegments: 16,
          radialSegments: 6
        })
    },
    {
      name: "multiple polygons with holes",
      data: { type: "polygon", polygonShapes: shapes, polygonOptions: groupedOptions },
      create: () => PrimitiveMesh.createPolygon(engine, shapeVectors, { ...groupedOptions })
    },
    {
      name: "beveled extrusion",
      data: {
        type: "extrusion",
        extrusionDepth: 2,
        extrusionShapes: shapes,
        extrusionOptions: {
          ...groupedOptions,
          bevelWidth: 0.1,
          bevelDepth: 0.2,
          contourOffset: 0.2,
          bevelSegments: 2,
          depthSegments: 3
        }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, 2, {
          ...groupedOptions,
          bevelWidth: 0.1,
          bevelDepth: 0.2,
          contourOffset: 0.2,
          bevelSegments: 2,
          depthSegments: 3
        })
    },
    {
      name: "inset extrusion without bevels",
      data: {
        type: "extrusion",
        extrusionDepth: 2,
        extrusionShapes: shapes,
        extrusionOptions: { ...options, contourOffset: -0.1 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, 2, { ...options, contourOffset: -0.1, depthSegments: 1 })
    },
    {
      name: "extrusion along a path",
      data: {
        type: "extrusion",
        extrusionPath: path,
        extrusionShapes: shapes,
        extrusionOptions: { ...groupedOptions, pathSegments: 6 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, pathVectors, { ...groupedOptions, pathSegments: 6 })
    },
    {
      name: "closed extrusion path",
      data: {
        type: "extrusion",
        extrusionPath: path,
        extrusionShapes: shapes,
        extrusionOptions: { ...groupedOptions, closedPath: true, pathSegments: 12 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, pathVectors, {
          ...groupedOptions,
          closedPath: true,
          pathSegments: 12
        })
    },
    {
      name: "linear extrusion ignores path-only settings",
      data: {
        type: "extrusion",
        extrusionDepth: 2,
        extrusionShapes: shapes,
        extrusionOptions: { ...groupedOptions, depthSegments: 2, closedPath: true }
      },
      create: () => PrimitiveMesh.createExtrusion(engine, shapeVectors, 2, { ...groupedOptions, depthSegments: 2 })
    },
    {
      name: "path extrusion ignores linear-only settings",
      data: {
        type: "extrusion",
        extrusionPath: path,
        extrusionShapes: shapes,
        extrusionOptions: {
          ...groupedOptions,
          pathSegments: 6,
          bevelWidth: 0.25,
          bevelDepth: 0.4,
          contourOffset: 0.5,
          bevelSegments: 8
        }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, pathVectors, { ...groupedOptions, pathSegments: 6 })
    },
    {
      name: "torus knot winding",
      data: {
        type: "torusKnot",
        torusKnotRadius: 2,
        torusKnotTubeRadius: 0.2,
        torusKnotAxisTurns: 3,
        torusKnotCrossSectionTurns: 4,
        torusKnotOptions: { ...options, pathSegments: 48, radialSegments: 6 }
      },
      create: () =>
        PrimitiveMesh.createTorusKnot(engine, 2, 0.2, 3, 4, { ...options, pathSegments: 48, radialSegments: 6 })
    },
    {
      name: "negative torus knot windings",
      data: {
        type: "torusKnot",
        torusKnotRadius: 2,
        torusKnotTubeRadius: 0.2,
        torusKnotAxisTurns: -2,
        torusKnotCrossSectionTurns: -3,
        torusKnotOptions: { ...options, pathSegments: 48, radialSegments: 8 }
      },
      create: () =>
        PrimitiveMesh.createTorusKnot(engine, 2, 0.2, -2, -3, { ...options, pathSegments: 48, radialSegments: 8 })
    },
    {
      name: "rounded cuboid",
      data: {
        type: "roundedCuboid",
        roundedCuboidWidth: 2,
        roundedCuboidHeight: 3,
        roundedCuboidDepth: 4,
        roundedCuboidCornerRadius: 0.2,
        roundedCuboidOptions: { ...groupedOptions, roundingSegments: 3 }
      },
      create: () => PrimitiveMesh.createRoundedCuboid(engine, 2, 3, 4, 0.2, { ...groupedOptions, roundingSegments: 3 })
    },
    {
      name: "cuboid inherited defaults",
      data: { type: "cuboid", cuboidWidth: 2, cuboidHeight: 2, cuboidDepth: 2, cuboidOptions: { widthSegments: 3 } },
      create: () => PrimitiveMesh.createCuboid(engine, 2, 2, 2, { widthSegments: 3 })
    },
    {
      name: "plane inherited defaults",
      data: { type: "plane", planeWidth: 2, planeDepth: 2, planeOptions: { widthSegments: 4 } },
      create: () => PrimitiveMesh.createPlane(engine, 2, 2, { widthSegments: 4 })
    },
    {
      name: "capsule inherited cap segments",
      data: { type: "capsule", capsuleRadius: 0.5, capsuleCylinderHeight: 2, capsuleOptions: { radialSegments: 10 } },
      create: () => PrimitiveMesh.createCapsule(engine, 0.5, 2, { radialSegments: 10 })
    }
  ];

  const cases = [
    ...Object.entries(defaults).map(([name, value]) => ({ name: `default ${name}`, ...value })),
    ...configured
  ];

  it.each(cases)("loads $name from JSON with the same result as the creation API", async ({ name, data, create }) => {
    const serialized = JSON.stringify(data);
    const parsed = JSON.parse(serialized);
    const request = vi.spyOn(engine.resourceManager, "_request").mockReturnValue(AssetPromise.resolve(parsed) as any);
    const expected = create();
    let mesh: ModelMesh | undefined;
    try {
      mesh = await engine.resourceManager.load<ModelMesh>({ url: `${name}.mesh`, type: AssetType.PrimitiveMesh });
      expect(mesh.vertexCount).toBe(expected.vertexCount);
      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const expectedBuffer = expected.vertexBufferBindings[0]!.buffer;
      const vertices = new Uint8Array(buffer.byteLength);
      const expectedVertices = new Uint8Array(expectedBuffer.byteLength);
      buffer.getData(vertices);
      expectedBuffer.getData(expectedVertices);
      expect(vertices).toEqual(expectedVertices);
      expect(buffer.readable).toBe(expectedBuffer.readable);
      expect(mesh.bounds.min.toJSON()).toEqual(expected.bounds.min.toJSON());
      expect(mesh.bounds.max.toJSON()).toEqual(expected.bounds.max.toJSON());
      expect(mesh.subMeshes.map(({ start, count, topology }) => ({ start, count, topology }))).toEqual(
        expected.subMeshes.map(({ start, count, topology }) => ({ start, count, topology }))
      );
      expect(mesh.accessible).toBe(expected.accessible);
      if (mesh.accessible) {
        expect(mesh.getIndices()).toEqual(expected.getIndices());
      }
      expect(JSON.stringify(parsed)).toBe(serialized);
    } finally {
      request.mockRestore();
      mesh?.destroy();
      expected.destroy();
    }
  });

  it("converts serialized ranges to Vector2 without modifying the asset", async () => {
    const data: PrimitiveMeshAsset = {
      type: "sphere",
      sphereRadius: 0.5,
      sphereOptions: { horizontalAngleRange: { x: 350, y: 370 }, verticalAngleRange: { x: 30, y: 150 } }
    };
    const serialized = JSON.stringify(data);
    const request = vi.spyOn(engine.resourceManager, "_request").mockReturnValue(AssetPromise.resolve(data) as any);
    const create = vi.spyOn(PrimitiveMesh, "createSphere");
    let mesh: ModelMesh | undefined;
    try {
      mesh = await engine.resourceManager.load<ModelMesh>({ url: "vector-ranges.mesh", type: AssetType.PrimitiveMesh });
      const ranges = create.mock.calls[0][2]!;
      expect(ranges.horizontalAngleRange).toBeInstanceOf(Vector2);
      expect(ranges.verticalAngleRange).toBeInstanceOf(Vector2);
      expect(ranges.horizontalAngleRange!.toJSON()).toEqual({ x: 350, y: 370 });
      expect(ranges.verticalAngleRange!.toJSON()).toEqual({ x: 30, y: 150 });
      expect(JSON.stringify(data)).toBe(serialized);
    } finally {
      create.mockRestore();
      request.mockRestore();
      mesh?.destroy();
    }
  });

  it.each([
    { caps: PrimitiveMeshCapMode.Both, value: "both", top: true, bottom: true },
    { caps: PrimitiveMeshCapMode.Top, value: "top", top: true, bottom: false },
    { caps: PrimitiveMeshCapMode.Bottom, value: "bottom", top: false, bottom: true },
    { caps: PrimitiveMeshCapMode.None, value: "none", top: false, bottom: false }
  ])(
    "loads the $value cap mode from serialized cylinder and truncated cone assets",
    async ({ caps, value, top, bottom }) => {
      const request = vi.spyOn(engine.resourceManager, "_request");
      try {
        for (const type of ["cylinder", "truncatedCone"] as const) {
          const optionsKey = `${type}Options`;
          const shape =
            type === "cylinder"
              ? { type, cylinderRadius: 0.5, cylinderHeight: 2 }
              : { type, truncatedConeTopRadius: 0.25, truncatedConeBottomRadius: 0.5, truncatedConeHeight: 2 };
          const data = JSON.parse(
            JSON.stringify({ ...shape, [optionsKey]: { caps, keepCPUData: true, separateMaterialSlots: true } })
          );
          expect(data[optionsKey].caps).toBe(value);
          request.mockReturnValue(AssetPromise.resolve(data) as any);
          const mesh = await engine.resourceManager.load<ModelMesh>({
            url: `${type}-${value}.mesh`,
            type: AssetType.PrimitiveMesh
          });
          try {
            const normals = mesh.getNormals()!;
            expect(normals.some((normal) => normal.y === 1)).toBe(top);
            expect(normals.some((normal) => normal.y === -1)).toBe(bottom);
            expect(mesh.subMeshes).toHaveLength(1 + Number(top) + Number(bottom));
          } finally {
            mesh.destroy();
          }
        }
      } finally {
        request.mockRestore();
      }
    }
  );

  it("rejects an unknown primitive mesh type", async () => {
    const request = vi
      .spyOn(engine.resourceManager, "_request")
      .mockReturnValue(AssetPromise.resolve({ type: "unknown" }) as any);
    try {
      await expect(
        engine.resourceManager.load<ModelMesh>({ url: "unknown.mesh", type: AssetType.PrimitiveMesh })
      ).rejects.toThrow("Unknown primitive mesh type: unknown");
    } finally {
      request.mockRestore();
    }
  });
});
