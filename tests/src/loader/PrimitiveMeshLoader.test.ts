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
const options = { keepData: true };
const groupedOptions = { keepData: true, separateMaterials: true };

describe("PrimitiveMeshLoader", () => {
  const defaults = {
    sphere: { data: { type: "sphere" }, create: () => PrimitiveMesh.createSphere(engine) },
    cuboid: { data: { type: "cuboid" }, create: () => PrimitiveMesh.createCuboid(engine) },
    plane: { data: { type: "plane" }, create: () => PrimitiveMesh.createPlane(engine) },
    cylinder: { data: { type: "cylinder" }, create: () => PrimitiveMesh.createCylinder(engine) },
    truncatedCone: { data: { type: "truncatedCone" }, create: () => PrimitiveMesh.createTruncatedCone(engine) },
    cone: { data: { type: "cone" }, create: () => PrimitiveMesh.createCone(engine) },
    capsule: { data: { type: "capsule" }, create: () => PrimitiveMesh.createCapsule(engine) },
    torus: { data: { type: "torus" }, create: () => PrimitiveMesh.createTorus(engine) },
    circle: { data: { type: "circle" }, create: () => PrimitiveMesh.createCircle(engine) },
    ring: { data: { type: "ring" }, create: () => PrimitiveMesh.createRing(engine) },
    tetrahedron: { data: { type: "tetrahedron" }, create: () => PrimitiveMesh.createTetrahedron(engine) },
    octahedron: { data: { type: "octahedron" }, create: () => PrimitiveMesh.createOctahedron(engine) },
    icosahedron: { data: { type: "icosahedron" }, create: () => PrimitiveMesh.createIcosahedron(engine) },
    dodecahedron: { data: { type: "dodecahedron" }, create: () => PrimitiveMesh.createDodecahedron(engine) },
    lathe: {
      data: { type: "lathe", latheProfile: profile },
      create: () => PrimitiveMesh.createLathe(engine, profileVectors)
    },
    tube: { data: { type: "tube", tubePath: path }, create: () => PrimitiveMesh.createTube(engine, pathVectors) },
    polygon: {
      data: { type: "polygon", polygonShapes: shapes },
      create: () => PrimitiveMesh.createPolygon(engine, shapeVectors)
    },
    extrusion: {
      data: { type: "extrusion", extrusionShapes: shapes },
      create: () => PrimitiveMesh.createExtrusion(engine, shapeVectors)
    },
    torusKnot: { data: { type: "torusKnot" }, create: () => PrimitiveMesh.createTorusKnot(engine) },
    roundedCuboid: { data: { type: "roundedCuboid" }, create: () => PrimitiveMesh.createRoundedCuboid(engine) }
  } satisfies Record<PrimitiveMeshAsset["type"], { data: PrimitiveMeshAsset; create: () => ModelMesh }>;

  const configured: { name: string; data: PrimitiveMeshAsset; create: () => ModelMesh }[] = [
    {
      name: "sphere ranges and subdivision level",
      data: {
        type: "sphere",
        sphereOptions: {
          ...options,
          horizontalRange: { x: 20, y: 260 },
          verticalRange: { x: 30, y: 150 },
          radius: 2,
          subdivisions: 3
        }
      },
      create: () =>
        PrimitiveMesh.createSphere(engine, {
          ...options,
          horizontalRange: new Vector2(20, 260),
          verticalRange: new Vector2(30, 150),
          radius: 2,
          subdivisions: 3
        })
    },
    {
      name: "sphere",
      data: { type: "sphere", sphereOptions: { ...options, radius: 1.5, subdivisions: 2 } },
      create: () => PrimitiveMesh.createSphere(engine, { ...options, radius: 1.5, subdivisions: 2 })
    },
    {
      name: "sphere angular ranges",
      data: {
        type: "sphere",
        sphereOptions: {
          ...options,
          horizontalRange: { x: 350, y: 370 },
          verticalRange: { x: 30, y: 150 },
          radius: 2,
          subdivisions: 3
        }
      },
      create: () =>
        PrimitiveMesh.createSphere(engine, {
          ...options,
          horizontalRange: new Vector2(350, 370),
          verticalRange: new Vector2(30, 150),
          radius: 2,
          subdivisions: 3
        })
    },
    {
      name: "cuboid dimensions and segment counts",
      data: {
        type: "cuboid",
        cuboidOptions: {
          ...groupedOptions,
          width: 2,
          height: 3,
          depth: 4,
          widthSegments: 2,
          heightSegments: 3,
          depthSegments: 4
        }
      },
      create: () =>
        PrimitiveMesh.createCuboid(engine, {
          ...groupedOptions,
          width: 2,
          height: 3,
          depth: 4,
          widthSegments: 2,
          heightSegments: 3,
          depthSegments: 4
        })
    },
    {
      name: "plane dimensions and segment counts",
      data: {
        type: "plane",
        planeOptions: { ...options, width: 3, height: 5, horizontalSegments: 2, verticalSegments: 4 }
      },
      create: () =>
        PrimitiveMesh.createPlane(engine, {
          ...options,
          width: 3,
          height: 5,
          horizontalSegments: 2,
          verticalSegments: 4
        })
    },
    {
      name: "cylinder caps and range",
      data: {
        type: "cylinder",
        cylinderOptions: {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Bottom,
          angleRange: { x: 20, y: 270 },
          radius: 0.75,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createCylinder(engine, {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Bottom,
          angleRange: new Vector2(20, 270),
          radius: 0.75,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "truncated cone end radii",
      data: {
        type: "truncatedCone",
        truncatedConeOptions: {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Top,
          angleRange: { x: 30, y: 250 },
          topRadius: 0.25,
          bottomRadius: 1,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createTruncatedCone(engine, {
          ...groupedOptions,
          caps: PrimitiveMeshCapMode.Top,
          angleRange: new Vector2(30, 250),
          topRadius: 0.25,
          bottomRadius: 1,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "cone cap and range",
      data: {
        type: "cone",
        coneOptions: {
          ...groupedOptions,
          cap: false,
          angleRange: { x: 20, y: 270 },
          radius: 0.75,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        }
      },
      create: () =>
        PrimitiveMesh.createCone(engine, {
          ...groupedOptions,
          cap: false,
          angleRange: new Vector2(20, 270),
          radius: 0.75,
          height: 3,
          radialSegments: 12,
          heightSegments: 2
        })
    },
    {
      name: "capsule independent segment counts",
      data: {
        type: "capsule",
        capsuleOptions: { ...options, radius: 0.75, height: 3, radialSegments: 12, capSegments: 5, heightSegments: 2 }
      },
      create: () =>
        PrimitiveMesh.createCapsule(engine, {
          ...options,
          radius: 0.75,
          height: 3,
          radialSegments: 12,
          capSegments: 5,
          heightSegments: 2
        })
    },
    {
      name: "torus major and tube ranges",
      data: {
        type: "torus",
        torusOptions: {
          ...options,
          tubeRange: { x: 45, y: 300 },
          angleRange: { x: 20, y: 200 },
          radius: 2,
          tubeRadius: 0.25,
          tubularSegments: 12,
          radialSegments: 8
        }
      },
      create: () =>
        PrimitiveMesh.createTorus(engine, {
          ...options,
          tubeRange: new Vector2(45, 300),
          angleRange: new Vector2(20, 200),
          radius: 2,
          tubeRadius: 0.25,
          tubularSegments: 12,
          radialSegments: 8
        })
    },
    {
      name: "circle sector",
      data: { type: "circle", circleOptions: { ...options, angleRange: { x: 30, y: 240 }, radius: 2, segments: 12 } },
      create: () =>
        PrimitiveMesh.createCircle(engine, { ...options, angleRange: new Vector2(30, 240), radius: 2, segments: 12 })
    },
    {
      name: "ring sector",
      data: {
        type: "ring",
        ringOptions: {
          ...options,
          angleRange: { x: 40, y: 240 },
          innerRadius: 0.5,
          outerRadius: 2,
          radialSegments: 12,
          widthSegments: 3
        }
      },
      create: () =>
        PrimitiveMesh.createRing(engine, {
          ...options,
          angleRange: new Vector2(40, 240),
          outerRadius: 2,
          innerRadius: 0.5,
          radialSegments: 12,
          widthSegments: 3
        })
    },
    {
      name: "ring radius defaults",
      data: { type: "ring", ringOptions: { ...options, outerRadius: 2 } },
      create: () => PrimitiveMesh.createRing(engine, { ...options, outerRadius: 2 })
    },
    {
      name: "tetrahedron subdivision",
      data: { type: "tetrahedron", tetrahedronOptions: { ...options, radius: 2, segments: 3 } },
      create: () => PrimitiveMesh.createTetrahedron(engine, { ...options, radius: 2, segments: 3 })
    },
    {
      name: "octahedron subdivision",
      data: { type: "octahedron", octahedronOptions: { ...options, radius: 1.5, segments: 2 } },
      create: () => PrimitiveMesh.createOctahedron(engine, { ...options, radius: 1.5, segments: 2 })
    },
    {
      name: "icosahedron subdivision",
      data: { type: "icosahedron", icosahedronOptions: { ...options, radius: 2, segments: 3 } },
      create: () => PrimitiveMesh.createIcosahedron(engine, { ...options, radius: 2, segments: 3 })
    },
    {
      name: "dodecahedron subdivision",
      data: { type: "dodecahedron", dodecahedronOptions: { ...options, radius: 1.5, segments: 2 } },
      create: () => PrimitiveMesh.createDodecahedron(engine, { ...options, radius: 1.5, segments: 2 })
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
        tubePath: path,
        tubeOptions: { ...options, closed: true, radius: 0.2, tubularSegments: 16, radialSegments: 6 }
      },
      create: () =>
        PrimitiveMesh.createTube(engine, pathVectors, {
          ...options,
          closed: true,
          radius: 0.2,
          tubularSegments: 16,
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
        extrusionShapes: shapes,
        extrusionOptions: {
          ...groupedOptions,
          bevelSize: 0.1,
          bevelThickness: 0.2,
          bevelOffset: 0.2,
          bevelSegments: 2,
          depth: 2,
          steps: 3
        }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, {
          ...groupedOptions,
          bevelSize: 0.1,
          bevelThickness: 0.2,
          bevelOffset: 0.2,
          bevelSegments: 2,
          depth: 2,
          steps: 3
        })
    },
    {
      name: "inset extrusion without bevels",
      data: {
        type: "extrusion",
        extrusionShapes: shapes,
        extrusionOptions: { ...options, bevelOffset: -0.1, depth: 2 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, { ...options, bevelOffset: -0.1, depth: 2, steps: 1 })
    },
    {
      name: "extrusion along a path",
      data: {
        type: "extrusion",
        extrusionShapes: shapes,
        extrusionOptions: { ...groupedOptions, path: path, steps: 6 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, { ...groupedOptions, path: pathVectors, steps: 6 })
    },
    {
      name: "closed extrusion path",
      data: {
        type: "extrusion",
        extrusionShapes: shapes,
        extrusionOptions: { ...groupedOptions, closed: true, path: path, steps: 12 }
      },
      create: () =>
        PrimitiveMesh.createExtrusion(engine, shapeVectors, {
          ...groupedOptions,
          closed: true,
          path: pathVectors,
          steps: 12
        })
    },
    {
      name: "torus knot winding",
      data: {
        type: "torusKnot",
        torusKnotOptions: { ...options, radius: 2, tubeRadius: 0.2, p: 3, q: 4, tubularSegments: 48, radialSegments: 6 }
      },
      create: () =>
        PrimitiveMesh.createTorusKnot(engine, {
          ...options,
          radius: 2,
          tubeRadius: 0.2,
          p: 3,
          q: 4,
          tubularSegments: 48,
          radialSegments: 6
        })
    },
    {
      name: "negative torus knot windings",
      data: {
        type: "torusKnot",
        torusKnotOptions: {
          ...options,
          radius: 2,
          tubeRadius: 0.2,
          p: -2,
          q: -3,
          tubularSegments: 48,
          radialSegments: 8
        }
      },
      create: () =>
        PrimitiveMesh.createTorusKnot(engine, {
          ...options,
          radius: 2,
          tubeRadius: 0.2,
          p: -2,
          q: -3,
          tubularSegments: 48,
          radialSegments: 8
        })
    },
    {
      name: "rounded cuboid",
      data: {
        type: "roundedCuboid",
        roundedCuboidOptions: { ...groupedOptions, width: 2, height: 3, depth: 4, cornerRadius: 0.2, segments: 3 }
      },
      create: () =>
        PrimitiveMesh.createRoundedCuboid(engine, {
          ...groupedOptions,
          width: 2,
          height: 3,
          depth: 4,
          cornerRadius: 0.2,
          segments: 3
        })
    },
    {
      name: "cuboid inherited defaults",
      data: { type: "cuboid", cuboidOptions: { width: 2, widthSegments: 3 } },
      create: () => PrimitiveMesh.createCuboid(engine, { width: 2, widthSegments: 3 })
    },
    {
      name: "plane inherited defaults",
      data: { type: "plane", planeOptions: { width: 2, horizontalSegments: 4 } },
      create: () => PrimitiveMesh.createPlane(engine, { width: 2, horizontalSegments: 4 })
    },
    {
      name: "capsule inherited cap segments",
      data: { type: "capsule", capsuleOptions: { radialSegments: 10 } },
      create: () => PrimitiveMesh.createCapsule(engine, { radialSegments: 10 })
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
      sphereOptions: {
        horizontalRange: { x: 350, y: 370 },
        verticalRange: { x: 30, y: 150 }
      }
    };
    const serialized = JSON.stringify(data);
    const request = vi.spyOn(engine.resourceManager, "_request").mockReturnValue(AssetPromise.resolve(data) as any);
    const create = vi.spyOn(PrimitiveMesh, "createSphere");
    let mesh: ModelMesh | undefined;
    try {
      mesh = await engine.resourceManager.load<ModelMesh>({ url: "vector-ranges.mesh", type: AssetType.PrimitiveMesh });
      const ranges = create.mock.calls[0][1]!;
      expect(ranges.horizontalRange).toBeInstanceOf(Vector2);
      expect(ranges.verticalRange).toBeInstanceOf(Vector2);
      expect(ranges.horizontalRange!.toJSON()).toEqual({ x: 350, y: 370 });
      expect(ranges.verticalRange!.toJSON()).toEqual({ x: 30, y: 150 });
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
          const data = JSON.parse(
            JSON.stringify({ type, [optionsKey]: { caps, keepData: true, separateMaterials: true } })
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
