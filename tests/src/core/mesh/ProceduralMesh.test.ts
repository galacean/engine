import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  EngineEventType,
  ModelMesh,
  PrimitiveMesh,
  PrimitiveMeshCapMode,
  SetDataOptions,
  Vector2,
  Vector3,
  VertexAttribute,
  VertexElement,
  VertexElementFormat,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => engine.destroy());

const polygon = {
  points: [new Vector2(-2, -2), new Vector2(2, -2), new Vector2(2, 2), new Vector2(-2, 2)],
  holes: [[new Vector2(-1, -1), new Vector2(-1, 1), new Vector2(1, 1), new Vector2(1, -1)]]
};
const path = [new Vector3(0, 0, 0), new Vector3(0, 1, 1), new Vector3(1, 2, 2)];

const creators: [string, () => ModelMesh][] = [
  ["sphere", () => PrimitiveMesh.createSphere(engine, { keepData: true, radius: 2, subdivisions: 2 })],
  [
    "cuboid",
    () =>
      PrimitiveMesh.createCuboid(engine, {
        keepData: true,
        width: 1,
        height: 1,
        depth: 1,
        widthSegments: 3,
        heightSegments: 2,
        depthSegments: 2
      })
  ],
  [
    "plane",
    () =>
      PrimitiveMesh.createPlane(engine, {
        keepData: true,
        width: 1,
        height: 1,
        horizontalSegments: 3,
        verticalSegments: 2
      })
  ],
  [
    "cylinder",
    () =>
      PrimitiveMesh.createTruncatedCone(engine, {
        keepData: true,
        topRadius: 0.25,
        bottomRadius: 1,
        height: 2,
        radialSegments: 12,
        heightSegments: 1
      })
  ],
  [
    "cone",
    () =>
      PrimitiveMesh.createCone(engine, {
        keepData: true,
        radius: 0.5,
        height: 2,
        radialSegments: 12,
        heightSegments: 1
      })
  ],
  [
    "capsule",
    () =>
      PrimitiveMesh.createCapsule(engine, {
        keepData: true,
        radius: 0.5,
        height: 2,
        radialSegments: 12,
        capSegments: 4,
        heightSegments: 1
      })
  ],
  [
    "torus",
    () =>
      PrimitiveMesh.createTorus(engine, {
        keepData: true,
        angleRange: new Vector2(0, 360),
        radius: 0.5,
        tubeRadius: 0.1,
        tubularSegments: 16,
        radialSegments: 8
      })
  ],
  [
    "circle",
    () =>
      PrimitiveMesh.createCircle(engine, { keepData: true, angleRange: new Vector2(0, 180), radius: 0.5, segments: 12 })
  ],
  [
    "ring",
    () =>
      PrimitiveMesh.createRing(engine, {
        keepData: true,
        angleRange: new Vector2(0, 360),
        outerRadius: 0.5,
        innerRadius: 0.25,
        radialSegments: 12,
        widthSegments: 2
      })
  ],
  ["tetrahedron", () => PrimitiveMesh.createTetrahedron(engine, { keepData: true, radius: 0.5, segments: 1 })],
  ["octahedron", () => PrimitiveMesh.createOctahedron(engine, { keepData: true, radius: 0.5, segments: 1 })],
  ["icosahedron", () => PrimitiveMesh.createIcosahedron(engine, { keepData: true, radius: 0.5, segments: 2 })],
  ["dodecahedron", () => PrimitiveMesh.createDodecahedron(engine, { keepData: true, radius: 0.5, segments: 1 })],
  [
    "lathe",
    () =>
      PrimitiveMesh.createLathe(engine, [new Vector2(0, -1), new Vector2(1, 0), new Vector2(0, 1)], {
        keepData: true,
        angleRange: new Vector2(0, 360),
        segments: 12
      })
  ],
  [
    "tube",
    () =>
      PrimitiveMesh.createTube(engine, path, { keepData: true, radius: 0.5, tubularSegments: 12, radialSegments: 8 })
  ],
  ["polygon", () => PrimitiveMesh.createPolygon(engine, polygon, { keepData: true })],
  ["extrusion", () => PrimitiveMesh.createExtrusion(engine, polygon, { keepData: true, depth: 2, steps: 1 })],
  [
    "extrusion",
    () =>
      PrimitiveMesh.createExtrusion(engine, polygon, {
        keepData: true,
        bevelSize: 0.1,
        bevelOffset: 0.2,
        depth: 1,
        steps: 1
      })
  ],
  ["extrusion", () => PrimitiveMesh.createExtrusion(engine, polygon, { keepData: true, path, steps: 5 })],
  [
    "extrusion",
    () =>
      PrimitiveMesh.createExtrusion(
        engine,
        {
          points: [
            new Vector2(0, 0),
            new Vector2(2, 0),
            new Vector2(2, 1),
            new Vector2(1, 1),
            new Vector2(1, 2),
            new Vector2(0, 2)
          ]
        },
        { keepData: true, bevelSize: 0.05, bevelThickness: 0.1, bevelOffset: -0.05, depth: 1, steps: 1 }
      )
  ],
  [
    "torusKnot",
    () =>
      PrimitiveMesh.createTorusKnot(engine, {
        keepData: true,
        radius: 0.5,
        tubeRadius: 0.1,
        p: 2,
        q: 3,
        tubularSegments: 32,
        radialSegments: 8
      })
  ],
  [
    "torusKnot",
    () =>
      PrimitiveMesh.createTorusKnot(engine, {
        keepData: true,
        radius: 0.5,
        tubeRadius: 0.1,
        p: -2,
        q: -3,
        tubularSegments: 32,
        radialSegments: 8
      })
  ],
  [
    "roundedCuboid",
    () =>
      PrimitiveMesh.createRoundedCuboid(engine, {
        keepData: true,
        width: 1,
        height: 1,
        depth: 1,
        cornerRadius: 0.15,
        segments: 3
      })
  ]
];

describe("primitive mesh defaults", () => {
  const options = { keepData: true };
  const profile = [new Vector2(0, -1), new Vector2(1, 0), new Vector2(0, 1)];
  const cases: [string, () => ModelMesh, () => ModelMesh][] = [
    [
      "sphere",
      () => PrimitiveMesh.createSphere(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createSphere(engine, { ...options, radius: 1, subdivisions: 3 })
    ],
    [
      "cuboid",
      () => PrimitiveMesh.createCuboid(engine, { ...options, width: 2, height: 3, depth: 4, widthSegments: 3 }),
      () =>
        PrimitiveMesh.createCuboid(engine, {
          ...options,
          width: 2,
          height: 3,
          depth: 4,
          widthSegments: 3,
          heightSegments: 3,
          depthSegments: 3
        })
    ],
    [
      "plane",
      () => PrimitiveMesh.createPlane(engine, { ...options, width: 2, height: 3, horizontalSegments: 2 }),
      () =>
        PrimitiveMesh.createPlane(engine, {
          ...options,
          width: 2,
          height: 3,
          horizontalSegments: 2,
          verticalSegments: 2
        })
    ],
    [
      "cylinder",
      () => PrimitiveMesh.createCylinder(engine, { ...options, radius: 1, height: 2 }),
      () =>
        PrimitiveMesh.createCylinder(engine, {
          ...options,
          radius: 1,
          height: 2,
          radialSegments: 20,
          heightSegments: 1
        })
    ],
    [
      "truncated cone",
      () => PrimitiveMesh.createTruncatedCone(engine, { ...options, topRadius: 0.25, bottomRadius: 1, height: 2 }),
      () =>
        PrimitiveMesh.createTruncatedCone(engine, {
          ...options,
          topRadius: 0.25,
          bottomRadius: 1,
          height: 2,
          radialSegments: 20,
          heightSegments: 1
        })
    ],
    [
      "cone",
      () => PrimitiveMesh.createCone(engine, { ...options, radius: 1, height: 2 }),
      () =>
        PrimitiveMesh.createCone(engine, { ...options, radius: 1, height: 2, radialSegments: 20, heightSegments: 1 })
    ],
    [
      "capsule",
      () => PrimitiveMesh.createCapsule(engine, { ...options, radius: 1, height: 2, radialSegments: 12 }),
      () =>
        PrimitiveMesh.createCapsule(engine, {
          ...options,
          radius: 1,
          height: 2,
          radialSegments: 12,
          capSegments: 12,
          heightSegments: 1
        })
    ],
    [
      "torus",
      () => PrimitiveMesh.createTorus(engine, { ...options, radius: 1, tubeRadius: 0.2 }),
      () =>
        PrimitiveMesh.createTorus(engine, {
          ...options,
          radius: 1,
          tubeRadius: 0.2,
          tubularSegments: 30,
          radialSegments: 30
        })
    ],
    [
      "circle",
      () => PrimitiveMesh.createCircle(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createCircle(engine, { ...options, radius: 1, segments: 32 })
    ],
    [
      "ring",
      () => PrimitiveMesh.createRing(engine, { ...options, outerRadius: 1, innerRadius: 0.5 }),
      () =>
        PrimitiveMesh.createRing(engine, {
          ...options,
          outerRadius: 1,
          innerRadius: 0.5,
          radialSegments: 32,
          widthSegments: 1
        })
    ],
    [
      "tetrahedron",
      () => PrimitiveMesh.createTetrahedron(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createTetrahedron(engine, { ...options, radius: 1, segments: 1 })
    ],
    [
      "octahedron",
      () => PrimitiveMesh.createOctahedron(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createOctahedron(engine, { ...options, radius: 1, segments: 1 })
    ],
    [
      "icosahedron",
      () => PrimitiveMesh.createIcosahedron(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createIcosahedron(engine, { ...options, radius: 1, segments: 1 })
    ],
    [
      "dodecahedron",
      () => PrimitiveMesh.createDodecahedron(engine, { ...options, radius: 1 }),
      () => PrimitiveMesh.createDodecahedron(engine, { ...options, radius: 1, segments: 1 })
    ],
    [
      "lathe",
      () => PrimitiveMesh.createLathe(engine, profile, { ...options }),
      () => PrimitiveMesh.createLathe(engine, profile, { ...options, segments: 12 })
    ],
    [
      "tube",
      () => PrimitiveMesh.createTube(engine, path, { ...options, radius: 0.2 }),
      () => PrimitiveMesh.createTube(engine, path, { ...options, radius: 0.2, tubularSegments: 64, radialSegments: 8 })
    ],
    [
      "depth extrusion",
      () => PrimitiveMesh.createExtrusion(engine, polygon, { ...options, depth: 2 }),
      () => PrimitiveMesh.createExtrusion(engine, polygon, { ...options, depth: 2, steps: 1 })
    ],
    [
      "path extrusion",
      () => PrimitiveMesh.createExtrusion(engine, polygon, { ...options, path }),
      () => PrimitiveMesh.createExtrusion(engine, polygon, { ...options, path, steps: 1 })
    ],
    [
      "torus knot",
      () => PrimitiveMesh.createTorusKnot(engine, { ...options, radius: 1, tubeRadius: 0.2, p: 2, q: 3 }),
      () =>
        PrimitiveMesh.createTorusKnot(engine, {
          ...options,
          radius: 1,
          tubeRadius: 0.2,
          p: 2,
          q: 3,
          tubularSegments: 64,
          radialSegments: 8
        })
    ],
    [
      "rounded cuboid",
      () => PrimitiveMesh.createRoundedCuboid(engine, { ...options, width: 2, height: 3, depth: 4, cornerRadius: 0.2 }),
      () =>
        PrimitiveMesh.createRoundedCuboid(engine, {
          ...options,
          width: 2,
          height: 3,
          depth: 4,
          cornerRadius: 0.2,
          segments: 2
        })
    ]
  ];

  it.each(cases)("uses the same defaults for %s", (_name, createWithDefaults, createWithExplicitDefaults) => {
    const withDefaults = createWithDefaults();
    const withExplicitDefaults = createWithExplicitDefaults();
    try {
      expect(withDefaults.getPositions()).toEqual(withExplicitDefaults.getPositions());
      expect(withDefaults.getNormals()).toEqual(withExplicitDefaults.getNormals());
      expect(withDefaults.getUVs()).toEqual(withExplicitDefaults.getUVs());
      expect(withDefaults.getIndices()).toEqual(withExplicitDefaults.getIndices());
      expect(withDefaults.subMeshes.map(({ start, count }) => [start, count])).toEqual(
        withExplicitDefaults.subMeshes.map(({ start, count }) => [start, count])
      );
    } finally {
      withDefaults.destroy();
      withExplicitDefaults.destroy();
    }
  });

  it.each([0.5, 1])("derives a valid ring from outer radius %s", (radius) => {
    const mesh = PrimitiveMesh.createRing(engine, { ...options, outerRadius: radius });
    const defaultMesh = PrimitiveMesh.createRing(engine, { outerRadius: radius });
    try {
      const positions = mesh.getPositions()!;
      const indices = mesh.getIndices()!;
      expect(defaultMesh.bounds.max.x).toBeCloseTo(radius);
      expect(Math.min(...positions.map(({ x, y }) => Math.hypot(x, y)))).toBeCloseTo(radius / 2);
      expect(Math.max(...positions.map(({ x, y }) => Math.hypot(x, y)))).toBeCloseTo(radius);
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]];
        const b = positions[indices[i + 1]];
        const c = positions[indices[i + 2]];
        expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeGreaterThan(0);
      }
    } finally {
      mesh.destroy();
      defaultMesh.destroy();
    }
  });
});

describe("procedural mesh geometry", () => {
  it("uses uniform size and subdivision defaults for partial options", () => {
    const cube = PrimitiveMesh.createCuboid(engine, { width: 2 });
    const plane = PrimitiveMesh.createPlane(engine, { width: 3 });
    const sphere = PrimitiveMesh.createSphere(engine, { radius: 1 });
    const detailedSphere = PrimitiveMesh.createSphere(engine, { radius: 1, subdivisions: 4 });
    try {
      expect(cube.bounds.min).toMatchObject({ x: -1, y: -1, z: -1 });
      expect(cube.bounds.max).toMatchObject({ x: 1, y: 1, z: 1 });
      expect(plane.bounds.max).toMatchObject({ x: 1.5, y: 0, z: 1.5 });
      expect(sphere.vertexCount).toBe(417);
      expect(detailedSphere.vertexCount).toBe(1585);
    } finally {
      cube.destroy();
      plane.destroy();
      sphere.destroy();
      detailedSphere.destroy();
    }
  });

  it("distinguishes cylinders from frustums and selects end caps independently", () => {
    const cylinder = PrimitiveMesh.createCylinder(engine, { radius: 1, height: 3 });
    const frustum = PrimitiveMesh.createTruncatedCone(engine, { topRadius: 0.5, bottomRadius: 1.5, height: 4 });
    const topOnly = PrimitiveMesh.createCylinder(engine, {
      caps: PrimitiveMeshCapMode.Top,
      keepData: true,
      radius: 1,
      height: 3,
      radialSegments: 8,
      heightSegments: 1
    });
    try {
      expect(cylinder.bounds.max).toMatchObject({ x: 1, y: 1.5, z: 1 });
      expect(frustum.bounds.max).toMatchObject({ x: 1.5, y: 2, z: 1.5 });
      expect(topOnly.getIndices()!.length).toBe(72);
      expect(topOnly.getNormals()!.some((normal) => normal.y === 1)).toBe(true);
      expect(topOnly.getNormals()!.some((normal) => normal.y === -1)).toBe(false);
    } finally {
      cylinder.destroy();
      frustum.destroy();
      topOnly.destroy();
    }
  });

  it("uses one polygon algorithm for contours and polygons with holes", () => {
    const fromContours = PrimitiveMesh.createPolygon(
      engine,
      { points: polygon.points, holes: polygon.holes },
      { keepData: true }
    );
    const fromShape = PrimitiveMesh.createPolygon(engine, polygon, { keepData: true });
    const withoutHoles = PrimitiveMesh.createPolygon(engine, polygon.points, { keepData: true });
    try {
      expect(Array.from(fromContours.getIndices()!)).toEqual(Array.from(fromShape.getIndices()!));
      expect(withoutHoles.getIndices()!.length).toBe(6);
    } finally {
      fromContours.destroy();
      fromShape.destroy();
      withoutHoles.destroy();
    }
  });

  it("honors offset angular ranges for torus sections", () => {
    const mesh = PrimitiveMesh.createTorus(engine, {
      keepData: true,
      angleRange: new Vector2(90, 180),
      radius: 1,
      tubeRadius: 0.25,
      tubularSegments: 8,
      radialSegments: 6
    });
    try {
      const first = mesh.getPositions()![0];
      expect(first.x).toBeCloseTo(0);
      expect(first.y).toBeCloseTo(1.25);
    } finally {
      mesh.destroy();
    }
  });

  it.each([
    { p: 2, q: 3, expected: new Vector3(1, Math.sqrt(3), 1) },
    { p: 2, q: -3, expected: new Vector3(1, Math.sqrt(3), -1) },
    { p: -2, q: 3, expected: new Vector3(1, -Math.sqrt(3), 1) },
    { p: -2, q: -3, expected: new Vector3(1, -Math.sqrt(3), -1) },
    { p: 0, q: 1, expected: new Vector3(2 + Math.sqrt(3) / 2, 0, 0.5) },
    { p: 1, q: 0, expected: new Vector3((3 * Math.sqrt(3)) / 2, 1.5, 0) }
  ])("preserves torus knot windings p=$p, q=$q during creation and restoration", ({ p, q, expected }) => {
    const radialSegments = 8;
    const mesh = PrimitiveMesh.createTorusKnot(engine, {
      keepData: true,
      radius: 2,
      tubeRadius: 0.2,
      p,
      q,
      tubularSegments: 48,
      radialSegments
    });
    try {
      const positions = mesh.getPositions()!;
      const center = new Vector3();
      for (let i = 0; i < radialSegments; i++) {
        center.add(positions[4 * (radialSegments + 1) + i]);
      }
      center.scale(1 / radialSegments);
      expect(Vector3.distance(center, expected)).toBeLessThan(1e-6);

      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = buffer.data!.slice();
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
    } finally {
      mesh.destroy();
    }
  });

  it.each([
    { radialSegments: 3, capSegments: 1, heightSegments: 1 },
    { radialSegments: 8, capSegments: 4, heightSegments: 1 },
    { radialSegments: 13, capSegments: 7, heightSegments: 3 }
  ])(
    "centers capsule pole UVs with $radialSegments radial segments",
    ({ radialSegments, capSegments, heightSegments }) => {
      const mesh = PrimitiveMesh.createCapsule(engine, {
        keepData: true,
        radius: 1,
        height: 2,
        radialSegments,
        capSegments,
        heightSegments
      });
      try {
        const positions = mesh.getPositions()!;
        const uvs = mesh.getUVs()!;
        const indices = mesh.getIndices()!;
        const poleTriangles = [0, 0];
        for (let i = 0; i < indices.length; i += 3) {
          const triangle = [indices[i], indices[i + 1], indices[i + 2]];
          const pole = triangle.find((index) => Math.abs(positions[index].y) === 2);
          if (pole !== undefined) {
            const edge = triangle.filter((index) => index !== pole);
            expect(uvs[pole].x).toBeCloseTo((uvs[edge[0]].x + uvs[edge[1]].x) / 2, 6);
            expect(uvs[pole].x).toBeGreaterThan(0);
            expect(uvs[pole].x).toBeLessThan(1);
            const top = positions[pole].y > 0;
            expect(uvs[pole].y).toBe(top ? 0 : 1);
            poleTriangles[top ? 1 : 0]++;
          }
        }
        expect(poleTriangles).toEqual([radialSegments, radialSegments]);

        const buffer = mesh.vertexBufferBindings[0]!.buffer;
        const original = buffer.data!.slice();
        MeshTestUtils.clearBuffer(buffer);
        (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
      } finally {
        mesh.destroy();
      }
    }
  );

  it.each([
    {
      segments: 1,
      crossSection: [
        [0, 1],
        [1, 0]
      ]
    },
    {
      segments: 2,
      crossSection: [
        [0, 1],
        [Math.SQRT1_2, Math.SQRT1_2],
        [1, 0]
      ]
    }
  ])("preserves $segments segment(s) in a partial lathe", ({ segments, crossSection }) => {
    const mesh = PrimitiveMesh.createLathe(engine, [new Vector2(1, -1), new Vector2(1, 1)], {
      keepData: true,
      angleRange: new Vector2(0, 90),
      segments
    });
    try {
      expect(mesh.vertexCount).toBe(crossSection.length * 2);
      expect(mesh.getIndices()!).toHaveLength(segments * 6);
      const positions = mesh.getPositions()!;
      for (let i = 0; i < crossSection.length; i++) {
        const [x, z] = crossSection[i];
        for (let j = 0; j < 2; j++) {
          const position = positions[i * 2 + j];
          expect(position.x).toBeCloseTo(x, 6);
          expect(position.y).toBe(j === 0 ? -1 : 1);
          expect(position.z).toBeCloseTo(z, 6);
        }
      }

      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = buffer.data!.slice();
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
    } finally {
      mesh.destroy();
    }
  });

  it.each([1, 4, 8])("maps rounded cuboid UVs by surface length with %s corner segments", (segments) => {
    const sizes = { x: 2, y: 3, z: 4 };
    const radius = 0.25;
    const mesh = PrimitiveMesh.createRoundedCuboid(engine, {
      keepData: true,
      separateMaterials: true,
      width: sizes.x,
      height: sizes.y,
      depth: sizes.z,
      cornerRadius: radius,
      segments
    });
    const faces = [
      { axis: "y", sign: 1, u: "x", v: "z", flipU: false, flipV: false },
      { axis: "y", sign: -1, u: "x", v: "z", flipU: false, flipV: true },
      { axis: "x", sign: -1, u: "z", v: "y", flipU: false, flipV: true },
      { axis: "x", sign: 1, u: "z", v: "y", flipU: true, flipV: true },
      { axis: "z", sign: 1, u: "x", v: "y", flipU: false, flipV: true },
      { axis: "z", sign: -1, u: "x", v: "y", flipU: true, flipV: true }
    ] as const;
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      const uvs = mesh.getUVs()!;
      const indices = mesh.getIndices()!;
      expect(mesh.subMeshes).toHaveLength(6);
      mesh.subMeshes.forEach(({ start, count }, faceIndex) => {
        const face = faces[faceIndex];
        const flatVertices = [...new Set(indices.subarray(start, start + count))].filter(
          (index) => normals[index][face.axis] === face.sign
        );
        expect(flatVertices).toHaveLength(4);
        const uEdge = (Math.PI * radius) / 4 / (sizes[face.u] - 2 * radius + (Math.PI * radius) / 2);
        const vEdge = (Math.PI * radius) / 4 / (sizes[face.v] - 2 * radius + (Math.PI * radius) / 2);
        for (const index of flatVertices) {
          const position = positions[index];
          expect(position[face.axis]).toBeCloseTo((face.sign * sizes[face.axis]) / 2, 6);
          expect(uvs[index].x).toBeCloseTo(position[face.u] < 0 !== face.flipU ? uEdge : 1 - uEdge, 6);
          expect(uvs[index].y).toBeCloseTo(position[face.v] < 0 !== face.flipV ? vEdge : 1 - vEdge, 6);
        }
      });

      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = buffer.data!.slice();
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
    } finally {
      mesh.destroy();
    }
  });

  it("handles rounded cuboid radius and segment limits without changing the cuboid fallback", () => {
    const options = { keepData: true, separateMaterials: true };
    const meshes = [
      PrimitiveMesh.createCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        widthSegments: 1,
        heightSegments: 1,
        depthSegments: 1
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: 0,
        segments: 4
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: -1,
        segments: 4
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: 1,
        segments: 3
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: 8,
        segments: 3
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: 0.2,
        segments: 0
      }),
      PrimitiveMesh.createRoundedCuboid(engine, {
        ...options,
        width: 2,
        height: 3,
        depth: 4,
        cornerRadius: 0.2,
        segments: 1
      })
    ];
    try {
      for (const [a, b] of [
        [0, 1],
        [0, 2],
        [3, 4],
        [5, 6]
      ]) {
        expect(meshes[a].vertexBufferBindings[0]!.buffer.data).toEqual(meshes[b].vertexBufferBindings[0]!.buffer.data);
        expect(meshes[a].getIndices()).toEqual(meshes[b].getIndices());
      }
    } finally {
      meshes.forEach((mesh) => mesh.destroy());
    }
  });

  it.each([
    { width: 2, height: 2, depth: 2, radius: 1 },
    { width: 2, height: 3, depth: 4, radius: 1 },
    { width: 2, height: 3, depth: 4, radius: 0.0001 }
  ])("keeps rounded cuboid attributes valid at radius $radius for $width x $height x $depth", (shape) => {
    const { width, height, depth, radius } = shape;
    const mesh = PrimitiveMesh.createRoundedCuboid(engine, {
      keepData: true,
      width,
      height,
      depth,
      cornerRadius: radius,
      segments: 4
    });
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      const uvs = mesh.getUVs()!;
      const inner = new Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const nearest = new Vector3(
          Math.max(-inner.x, Math.min(inner.x, p.x)),
          Math.max(-inner.y, Math.min(inner.y, p.y)),
          Math.max(-inner.z, Math.min(inner.z, p.z))
        );
        expect(Vector3.distance(p, nearest)).toBeCloseTo(radius, 6);
        expect(normals[i].length()).toBeCloseTo(1, 6);
        expect(uvs[i].x).toBeGreaterThanOrEqual(-1e-6);
        expect(uvs[i].x).toBeLessThanOrEqual(1 + 1e-6);
        expect(uvs[i].y).toBeGreaterThanOrEqual(-1e-6);
        expect(uvs[i].y).toBeLessThanOrEqual(1 + 1e-6);
      }
      expect(mesh.bounds.min.toJSON()).toEqual({ x: -width / 2, y: -height / 2, z: -depth / 2 });
      expect(mesh.bounds.max.toJSON()).toEqual({ x: width / 2, y: height / 2, z: depth / 2 });
    } finally {
      mesh.destroy();
    }
  });

  it.each([false, true])("controls all generated vertex data through keepData=%s", (keepData) => {
    const mesh = PrimitiveMesh.createSphere(engine, { keepData, radius: 0.5, subdivisions: 1 });
    try {
      for (const binding of mesh.vertexBufferBindings) {
        expect(binding!.buffer.readable).toBe(keepData);
      }
      if (keepData) {
        expect(mesh.getPositions()).toHaveLength(mesh.vertexCount);
        expect(mesh.getNormals()).toHaveLength(mesh.vertexCount);
        expect(mesh.getTangents()).toHaveLength(mesh.vertexCount);
        expect(mesh.getUVs()).toHaveLength(mesh.vertexCount);
        expect(mesh.getIndices()!.length).toBeGreaterThan(0);
      } else {
        expect(() => mesh.getPositions()).toThrow();
        expect(() => mesh.getNormals()).toThrow();
        expect(() => mesh.getTangents()).toThrow();
        expect(() => mesh.getUVs()).toThrow();
        expect(() => mesh.getIndices()).toThrow();
      }
    } finally {
      mesh.destroy();
    }
  });

  it.each(creators)("generates finite attributes and valid winding for %s", (_name, create) => {
    const mesh = create();
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      const uvs = mesh.getUVs()!;
      const tangents = mesh.getTangents()!;
      const indices = mesh.getIndices()!;
      expect(indices.length).toBeGreaterThan(0);
      for (const index of indices) {
        expect(index).toBeLessThan(positions.length);
        const p = positions[index];
        const n = normals[index];
        const t = tangents[index];
        expect(
          [p.x, p.y, p.z, n.x, n.y, n.z, uvs[index].x, uvs[index].y, t.x, t.y, t.z, t.w].every(Number.isFinite)
        ).toBe(true);
        expect(n.length()).toBeCloseTo(1, 5);
        expect(p.x).toBeGreaterThanOrEqual(mesh.bounds.min.x - 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(mesh.bounds.min.y - 1e-6);
        expect(p.z).toBeGreaterThanOrEqual(mesh.bounds.min.z - 1e-6);
        expect(p.x).toBeLessThanOrEqual(mesh.bounds.max.x + 1e-6);
        expect(p.y).toBeLessThanOrEqual(mesh.bounds.max.y + 1e-6);
        expect(p.z).toBeLessThanOrEqual(mesh.bounds.max.z + 1e-6);
      }
      const ab = new Vector3();
      const ac = new Vector3();
      const normal = new Vector3();
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]];
        Vector3.subtract(positions[indices[i + 1]], a, ab);
        Vector3.subtract(positions[indices[i + 2]], a, ac);
        Vector3.cross(ab, ac, normal);
        expect(Vector3.dot(normal, normals[indices[i]])).toBeGreaterThanOrEqual(-1e-6);
      }
    } finally {
      mesh.destroy();
    }
  });

  it("keeps sphere tangents perpendicular at non-unit radii", () => {
    const mesh = PrimitiveMesh.createSphere(engine, { keepData: true, radius: 2, subdivisions: 3 });
    try {
      expect(mesh.vertexCount).toBe(417);
      expect(mesh.getIndices()!.length / 3).toBe(768);
      const normals = mesh.getNormals()!;
      const tangents = mesh.getTangents()!;
      for (const index of mesh.getIndices()!) {
        const n = normals[index];
        const t = tangents[index];
        expect(n.x * t.x + n.y * t.y + n.z * t.z).toBeCloseTo(0, 5);
      }
    } finally {
      mesh.destroy();
    }
  });

  it("supports a northern hemisphere", () => {
    const mesh = PrimitiveMesh.createSphere(engine, {
      keepData: true,
      verticalRange: new Vector2(0, 90),
      radius: 0.5,
      subdivisions: 2
    });
    try {
      expect(mesh.getPositions()!.every((p) => p.y >= -1e-7)).toBe(true);
    } finally {
      mesh.destroy();
    }
  });

  it.each([
    { horizontal: [0, 360], vertical: [0, 90] },
    { horizontal: [90, 270], vertical: [0, 180] },
    { horizontal: [350, 370], vertical: [30, 150] },
    { horizontal: [20, 290], vertical: [30, 150] },
    { horizontal: [0, 360], vertical: [80, 85] },
    { horizontal: [0, 90], vertical: [0, 10] }
  ])("clips a sphere to $horizontal and $vertical without cracks", ({ horizontal, vertical }) => {
    const radius = 2;
    const mesh = PrimitiveMesh.createSphere(engine, {
      keepData: true,
      horizontalRange: new Vector2(horizontal[0], horizontal[1]),
      verticalRange: new Vector2(vertical[0], vertical[1]),
      radius,
      subdivisions: 3
    });
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      const uvs = mesh.getUVs()!;
      const indices = mesh.getIndices()!;
      const edges = new Map<string, { a: Vector3; b: Vector3; count: number }>();
      const sidePlanes = horizontal.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return new Vector3(Math.sin(radians), 0, Math.cos(radians));
      });
      const latitudeHeights = vertical.map((angle) => radius * Math.cos((angle * Math.PI) / 180));
      expect(indices.length).toBeGreaterThan(0);
      for (const position of positions) {
        expect(position.length()).toBeCloseTo(radius, 6);
        const latitude = (Math.acos(Math.max(-1, Math.min(1, position.y / radius))) * 180) / Math.PI;
        expect(latitude).toBeGreaterThanOrEqual(vertical[0] - 1e-5);
        expect(latitude).toBeLessThanOrEqual(vertical[1] + 1e-5);
        if (Math.hypot(position.x, position.z) > 1e-7) {
          let longitude = (Math.atan2(position.z, -position.x) * 180) / Math.PI;
          while (longitude < horizontal[0] - 1e-5) {
            longitude += 360;
          }
          expect(longitude).toBeLessThanOrEqual(horizontal[1] + 1e-5);
        }
      }
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [indices[i], indices[i + 1], indices[i + 2]];
        const a = positions[triangle[0]];
        const ab = positions[triangle[1]].clone().subtract(a);
        const ac = positions[triangle[2]].clone().subtract(a);
        Vector3.cross(ab, ac, ab);
        expect(Vector3.dot(ab, normals[triangle[0]])).toBeGreaterThan(1e-10);
        expect(triangle.every((index) => Number.isFinite(uvs[index].x) && Number.isFinite(uvs[index].y))).toBe(true);
        for (let edge = 0; edge < 3; edge++) {
          const a = positions[triangle[edge]];
          const b = positions[triangle[(edge + 1) % 3]];
          const key = [a, b]
            .map((point) => [point.x, point.y, point.z].map((value) => value.toFixed(6)).join(","))
            .sort()
            .join("/");
          const existing = edges.get(key);
          if (existing) {
            existing.count++;
          } else {
            edges.set(key, { a, b, count: 1 });
          }
        }
      }
      for (const { a, b, count } of edges.values()) {
        expect(count).toBeLessThanOrEqual(2);
        if (count === 1) {
          const onLatitude = latitudeHeights.some(
            (height) => Math.abs(a.y - height) < 1e-5 && Math.abs(b.y - height) < 1e-5
          );
          const onLongitude =
            horizontal[1] - horizontal[0] < 360 &&
            sidePlanes.some(
              (normal) => Math.abs(Vector3.dot(a, normal)) < 1e-5 && Math.abs(Vector3.dot(b, normal)) < 1e-5
            );
          expect(onLatitude || onLongitude).toBe(true);
        }
      }
    } finally {
      mesh.destroy();
    }
  });

  it("rotates complete spheres without changing topology", () => {
    const original = PrimitiveMesh.createSphere(engine, { keepData: true, radius: 1, subdivisions: 2 });
    const rotated = PrimitiveMesh.createSphere(engine, {
      keepData: true,
      horizontalRange: new Vector2(90, 450),
      radius: 1,
      subdivisions: 2
    });
    try {
      expect(rotated.getIndices()).toEqual(original.getIndices());
      expect(rotated.getUVs()).toEqual(original.getUVs());
      const positions = original.getPositions()!;
      rotated.getPositions()!.forEach((position, i) => {
        expect(position.x).toBeCloseTo(positions[i].z, 6);
        expect(position.y).toBeCloseTo(positions[i].y, 6);
        expect(position.z).toBeCloseTo(-positions[i].x, 6);
      });
    } finally {
      original.destroy();
      rotated.destroy();
    }
  });

  it("captures sphere ranges for device restoration", () => {
    const horizontalRange = new Vector2(20, 290);
    const verticalRange = new Vector2(30, 150);
    const mesh = PrimitiveMesh.createSphere(engine, { horizontalRange, verticalRange, radius: 1, subdivisions: 3 });
    try {
      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = MeshTestUtils.readBuffer(buffer);
      horizontalRange.y = 360;
      verticalRange.x = 0;
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
    } finally {
      mesh.destroy();
    }
  });

  it("omits cylinder caps and makes material groups opt-in", () => {
    const open = PrimitiveMesh.createCylinder(engine, {
      keepData: true,
      caps: PrimitiveMeshCapMode.None,
      radius: 0.5,
      height: 2,
      radialSegments: 8,
      heightSegments: 1
    });
    const grouped = PrimitiveMesh.createCylinder(engine, {
      separateMaterials: true,
      radius: 0.5,
      height: 2,
      radialSegments: 8,
      heightSegments: 1
    });
    const cube = PrimitiveMesh.createCuboid(engine, {
      separateMaterials: true,
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });
    try {
      expect(open.getIndices()!.length).toBe(48);
      expect(open.subMeshes.length).toBe(1);
      expect(grouped.subMeshes.length).toBe(3);
      expect(cube.subMeshes.length).toBe(6);
    } finally {
      open.destroy();
      grouped.destroy();
      cube.destroy();
    }
  });

  it("orders cuboid material slots by face direction", () => {
    const mesh = PrimitiveMesh.createCuboid(engine, {
      keepData: true,
      separateMaterials: true,
      width: 1,
      height: 2,
      depth: 3,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });
    try {
      const indices = mesh.getIndices()!;
      const normals = mesh.getNormals()!;
      expect(mesh.subMeshes.map(({ start }) => normals[indices[start]].toJSON())).toEqual([
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 }
      ]);
    } finally {
      mesh.destroy();
    }
  });

  it.each([
    {
      name: "cylinder with both caps",
      create: () =>
        PrimitiveMesh.createCylinder(engine, {
          keepData: true,
          separateMaterials: true,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "top", "bottom"]
    },
    {
      name: "cylinder with only its top cap",
      create: () =>
        PrimitiveMesh.createCylinder(engine, {
          keepData: true,
          separateMaterials: true,
          caps: PrimitiveMeshCapMode.Top,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "top"]
    },
    {
      name: "cylinder with only its bottom cap",
      create: () =>
        PrimitiveMesh.createCylinder(engine, {
          keepData: true,
          separateMaterials: true,
          caps: PrimitiveMeshCapMode.Bottom,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "bottom"]
    },
    {
      name: "cylinder without caps",
      create: () =>
        PrimitiveMesh.createCylinder(engine, {
          keepData: true,
          separateMaterials: true,
          caps: PrimitiveMeshCapMode.None,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side"]
    },
    {
      name: "truncated cone with a zero top radius",
      create: () =>
        PrimitiveMesh.createTruncatedCone(engine, {
          keepData: true,
          separateMaterials: true,
          topRadius: 0,
          bottomRadius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "bottom"]
    },
    {
      name: "truncated cone with a zero bottom radius",
      create: () =>
        PrimitiveMesh.createTruncatedCone(engine, {
          keepData: true,
          separateMaterials: true,
          topRadius: 1,
          bottomRadius: 0,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "top"]
    },
    {
      name: "cone with its bottom cap",
      create: () =>
        PrimitiveMesh.createCone(engine, {
          keepData: true,
          separateMaterials: true,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side", "bottom"]
    },
    {
      name: "cone without its bottom cap",
      create: () =>
        PrimitiveMesh.createCone(engine, {
          keepData: true,
          separateMaterials: true,
          cap: false,
          radius: 1,
          height: 2,
          radialSegments: 8,
          heightSegments: 1
        }),
      parts: ["side"]
    }
  ])("uses consecutive material slots for $name", ({ create, parts }) => {
    const mesh = create();
    try {
      const indices = mesh.getIndices()!;
      const normals = mesh.getNormals()!;
      expect(
        mesh.subMeshes.map(({ start }) => {
          const normalY = normals[indices[start]].y;
          return normalY === 1 ? "top" : normalY === -1 ? "bottom" : "side";
        })
      ).toEqual(parts);
    } finally {
      mesh.destroy();
    }
  });

  it("assigns one material slot to each polygon including its holes", () => {
    const shapes = [polygon, { points: polygon.points.map(({ x, y }) => new Vector2(x + 6, y)) }];
    const mesh = PrimitiveMesh.createPolygon(engine, shapes, { keepData: true, separateMaterials: true });
    try {
      const indices = mesh.getIndices()!;
      const positions = mesh.getPositions()!;
      expect(mesh.subMeshes).toHaveLength(2);
      mesh.subMeshes.forEach(({ start, count }, shapeIndex) => {
        const groupIndices = indices.subarray(start, start + count);
        expect(Array.from(groupIndices).every((index) => (positions[index].x > 3 ? 1 : 0) === shapeIndex)).toBe(true);
      });
    } finally {
      mesh.destroy();
    }
  });

  it("orders each extruded shape's cap and wall material slots together", () => {
    const shapes = [polygon, { points: polygon.points.map(({ x, y }) => new Vector2(x + 6, y)) }];
    const mesh = PrimitiveMesh.createExtrusion(engine, shapes, {
      keepData: true,
      separateMaterials: true,
      depth: 2,
      steps: 1
    });
    try {
      const indices = mesh.getIndices()!;
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      expect(mesh.subMeshes).toHaveLength(4);
      mesh.subMeshes.forEach(({ start, count }, slot) => {
        const groupIndices = Array.from(indices.subarray(start, start + count));
        expect(groupIndices.every((index) => (positions[index].x > 3 ? 1 : 0) === Math.floor(slot / 2))).toBe(true);
        const normalZ = new Set(groupIndices.map((index) => normals[index].z));
        expect(normalZ).toEqual(slot % 2 === 0 ? new Set([-1, 1]) : new Set([0]));
      });
    } finally {
      mesh.destroy();
    }
  });

  it.each([0.2, -0.2])("offsets extrusion walls and bevels by %s and restores their geometry", (bevelOffset) => {
    const options = { keepData: true, separateMaterials: true, bevelSize: 0.1, bevelThickness: 0.2, bevelOffset };
    const mesh = PrimitiveMesh.createExtrusion(engine, polygon, { ...options, depth: 2, steps: 2 });
    try {
      const outer = 2 + bevelOffset;
      const hole = 1 - bevelOffset;
      expect(mesh.bounds.min.x).toBeCloseTo(-outer);
      expect(mesh.bounds.min.y).toBeCloseTo(-outer);
      expect(mesh.bounds.min.z).toBe(0);
      expect(mesh.bounds.max.x).toBeCloseTo(outer);
      expect(mesh.bounds.max.y).toBeCloseTo(outer);
      expect(mesh.bounds.max.z).toBe(2);
      expect(mesh.subMeshes).toHaveLength(2);
      const positions = mesh.getPositions()!;
      for (const point of [
        new Vector3(outer, outer, 0.2),
        new Vector3(hole, hole, 0.2),
        new Vector3(outer - 0.1, outer - 0.1, 0),
        new Vector3(hole + 0.1, hole + 0.1, 0),
        new Vector3(outer - 0.1, outer - 0.1, 2),
        new Vector3(hole + 0.1, hole + 0.1, 2)
      ]) {
        expect(positions.some((position) => Vector3.distance(position, point) < 1e-6)).toBe(true);
      }

      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = buffer.data!.slice();
      const indices = Array.from(mesh.getIndices()!);
      options.bevelOffset = 100;
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
      expect(Array.from(mesh.getIndices()!)).toEqual(indices);
      expect(mesh.subMeshes).toHaveLength(2);
    } finally {
      mesh.destroy();
    }
  });

  it.each([0.2, -0.2])("offsets extrusion contours by %s without adding bevels", (bevelOffset) => {
    const mesh = PrimitiveMesh.createExtrusion(engine, polygon, { keepData: true, bevelOffset, depth: 2, steps: 1 });
    try {
      const positions = mesh.getPositions()!;
      expect(positions.every(({ z }) => z === 0 || z === 2)).toBe(true);
      const indices = mesh.getIndices()!;
      let topArea = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]];
        const b = positions[indices[i + 1]];
        const c = positions[indices[i + 2]];
        if (a.z === 2 && b.z === 2 && c.z === 2) {
          topArea += ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        }
      }
      const outer = 2 + bevelOffset;
      const hole = 1 - bevelOffset;
      expect(topArea).toBeCloseTo(4 * (outer * outer - hole * hole), 5);
    } finally {
      mesh.destroy();
    }
  });

  it("triangulates holes without filling their interiors", () => {
    const mesh = PrimitiveMesh.createPolygon(engine, polygon, { keepData: true });
    try {
      const positions = mesh.getPositions()!;
      const indices = mesh.getIndices()!;
      let area = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]],
          b = positions[indices[i + 1]],
          c = positions[indices[i + 2]];
        area += ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        const x = (a.x + b.x + c.x) / 3;
        const y = (a.y + b.y + c.y) / 3;
        expect(Math.abs(x) < 1 && Math.abs(y) < 1).toBe(false);
      }
      expect(area).toBeCloseTo(12, 6);
    } finally {
      mesh.destroy();
    }
  });

  const triangulationCases = [
    {
      name: "concave outlines",
      points: [
        new Vector2(0, 0),
        new Vector2(4, 0),
        new Vector2(4, 1),
        new Vector2(1, 1),
        new Vector2(1, 4),
        new Vector2(0, 4)
      ],
      holes: [],
      area: 7
    },
    {
      name: "multiple holes",
      points: [new Vector2(0, 0), new Vector2(10, 0), new Vector2(10, 6), new Vector2(0, 6)],
      holes: [
        [new Vector2(1, 1), new Vector2(3, 1), new Vector2(3, 4), new Vector2(1, 4)],
        [new Vector2(6, 2), new Vector2(9, 2), new Vector2(9, 5), new Vector2(6, 5)]
      ],
      area: 45
    },
    {
      name: "collinear and repeated boundary vertices",
      points: [
        new Vector2(0, 0),
        new Vector2(2, 0),
        new Vector2(2, 0),
        new Vector2(4, 0),
        new Vector2(4, 2),
        new Vector2(2, 2),
        new Vector2(0, 2),
        new Vector2(0, 0)
      ],
      holes: [],
      area: 8
    },
    {
      name: "large concave rings with a hole",
      points: Array.from({ length: 128 }, (_, i) => {
        const angle = (i * Math.PI) / 64;
        const radius = i % 2 === 0 ? 4 : 3;
        return new Vector2(radius * Math.cos(angle), radius * Math.sin(angle));
      }),
      holes: [
        Array.from({ length: 32 }, (_, i) => {
          const angle = (i * Math.PI) / 16;
          return new Vector2(Math.cos(angle), Math.sin(angle));
        })
      ],
      area: 768 * Math.sin(Math.PI / 64) - 16 * Math.sin(Math.PI / 16)
    }
  ];

  it.each(triangulationCases)("triangulates $name in either winding order", ({ points, holes, area }) => {
    for (const reversed of [false, true]) {
      const shape = {
        points: reversed ? points.slice().reverse() : points,
        holes: holes.map((hole) => (reversed ? hole : hole.slice().reverse()))
      };
      const mesh = PrimitiveMesh.createPolygon(engine, shape, { keepData: true });
      try {
        const positions = mesh.getPositions()!;
        const indices = mesh.getIndices()!;
        let triangleArea = 0;
        for (let i = 0; i < indices.length; i += 3) {
          const a = positions[indices[i]];
          const b = positions[indices[i + 1]];
          const c = positions[indices[i + 2]];
          const signedArea = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
          expect(signedArea).toBeGreaterThan(0);
          triangleArea += signedArea;

          const x = (a.x + b.x + c.x) / 3;
          const y = (a.y + b.y + c.y) / 3;
          const contours = [shape.points, ...shape.holes];
          for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
            const contour = contours[contourIndex];
            let inside = false;
            for (let j = 0, k = contour.length - 1; j < contour.length; k = j++) {
              const p = contour[j];
              const q = contour[k];
              if (p.y > y !== q.y > y && x < ((q.x - p.x) * (y - p.y)) / (q.y - p.y) + p.x) {
                inside = !inside;
              }
            }
            expect(inside).toBe(contourIndex === 0);
          }
        }
        expect(triangleArea).toBeCloseTo(area, 5);
      } finally {
        mesh.destroy();
      }
    }
  });

  it("preserves multiple holes in extrusion caps and restored buffers", () => {
    const { points, holes, area } = triangulationCases[1];
    const mesh = PrimitiveMesh.createExtrusion(engine, { points, holes }, { keepData: true, depth: 3, steps: 1 });
    try {
      const positions = mesh.getPositions()!;
      const indices = Array.from(mesh.getIndices()!);
      let topArea = 0;
      let bottomArea = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const a = positions[indices[i]];
        const b = positions[indices[i + 1]];
        const c = positions[indices[i + 2]];
        const signedArea = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        if (a.z === 0 && b.z === 0 && c.z === 0) {
          bottomArea -= signedArea;
        } else if (a.z === 3 && b.z === 3 && c.z === 3) {
          topArea += signedArea;
        }
      }
      expect(topArea).toBeCloseTo(area, 6);
      expect(bottomArea).toBeCloseTo(area, 6);
      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = new Uint8Array(buffer.data!.buffer).slice();
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(Array.from(mesh.getIndices()!)).toEqual(indices);
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
    } finally {
      mesh.destroy();
    }
  });

  it("restores captured geometry after caller-owned inputs and buffers change", () => {
    const points = [new Vector3(0, 0, 0), new Vector3(0, 1, 1), new Vector3(1, 2, 2)];
    const mesh = PrimitiveMesh.createTube(engine, points, {
      keepData: true,
      radius: 0.5,
      tubularSegments: 8,
      radialSegments: 8
    });
    try {
      const before = mesh.getPositions()!.map((p) => p.toJSON());
      const indices = Array.from(mesh.getIndices()!);
      points[1].set(100, 200, 300);
      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      MeshTestUtils.clearBuffer(buffer);
      const restorers = (engine.resourceManager as any)._contentRestorerPool;
      restorers[mesh.instanceId].restoreContent();
      expect(mesh.getPositions()!.map((p) => p.toJSON())).toEqual(before);
      expect(Array.from(mesh.getIndices()!)).toEqual(indices);
      expect(mesh.vertexBufferBindings[0]!.buffer).toBe(buffer);
    } finally {
      mesh.destroy();
    }
  });

  it.each([
    { type: "tube", keepData: false },
    { type: "tube", keepData: true },
    { type: "extrusion", keepData: false },
    { type: "extrusion", keepData: true }
  ])("copies $type path points for device restoration with keepData=$keepData", ({ type, keepData }) => {
    const points = path.map((point) => point.clone());
    const mesh =
      type === "tube"
        ? PrimitiveMesh.createTube(engine, points, {
            keepData,
            radius: 0.5,
            tubularSegments: 12,
            radialSegments: 8
          })
        : PrimitiveMesh.createExtrusion(engine, polygon, { keepData, path: points, steps: 12 });
    try {
      const buffers = mesh.vertexBufferBindings.map((binding) => binding!.buffer);
      buffers.push(mesh._primitive.indexBufferBinding!._buffer);
      const before = buffers.map((buffer) => MeshTestUtils.readBuffer(buffer));
      points[1].set(100, 200, 300);
      points.push(new Vector3(400, 500, 600));
      buffers.forEach((buffer) => MeshTestUtils.clearBuffer(buffer));
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      buffers.forEach((buffer, index) => {
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(before[index]);
      });
    } finally {
      mesh.destroy();
    }
  });

  it("restores primitive buffers after the default cache release", () => {
    const mesh = PrimitiveMesh.createSphere(engine);
    try {
      const restorer = (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId];
      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = MeshTestUtils.readBuffer(buffer);
      MeshTestUtils.clearBuffer(buffer);
      expect(() => restorer.restoreContent()).not.toThrow();
      expect(() => restorer.restoreContent()).not.toThrow();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
      expect(buffer.readable).toBe(false);
    } finally {
      mesh.destroy();
    }
  });

  it("restores spheres independently after interleaved creation", () => {
    const meshes = [
      PrimitiveMesh.createSphere(engine, { keepData: true, radius: 0.5, subdivisions: 2 }),
      PrimitiveMesh.createSphere(engine, { keepData: true, radius: 2, subdivisions: 4 })
    ];
    const originals = meshes.map((mesh) => ({
      vertices: mesh.vertexBufferBindings[0]!.buffer.data!.slice(),
      indices: Array.from(mesh.getIndices()!)
    }));
    try {
      for (const index of [0, 1, 0]) {
        const mesh = meshes[index];
        const buffer = mesh.vertexBufferBindings[0]!.buffer;
        MeshTestUtils.clearBuffer(buffer);
        (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(originals[index].vertices);
        expect(Array.from(mesh.getIndices()!)).toEqual(originals[index].indices);
      }
    } finally {
      for (const mesh of meshes) {
        mesh.destroy();
      }
    }
  });

  it("uses 32-bit indices for subdivided meshes beyond 65535 vertices", () => {
    const mesh = PrimitiveMesh.createPlane(engine, {
      keepData: true,
      width: 1,
      height: 1,
      horizontalSegments: 256,
      verticalSegments: 256
    });
    try {
      expect(mesh.vertexCount).toBe(66049);
      expect(mesh.getIndices()).toBeInstanceOf(Uint32Array);
    } finally {
      mesh.destroy();
    }
  });
  it.each([1, 2])("keeps the radius of a closed tube with %s longitudinal segments", (segments) => {
    const path = [new Vector3(-2, 0, -2), new Vector3(2, 0, -2), new Vector3(2, 0, 2), new Vector3(-2, 0, 2)];
    const mesh = PrimitiveMesh.createTube(engine, path, {
      keepData: true,
      closed: true,
      radius: 0.5,
      tubularSegments: segments,
      radialSegments: 8
    });
    try {
      expect(mesh.vertexCount).toBe((segments + 1) * 9);
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      for (let row = 0; row <= segments; row++) {
        const center = segments === 2 && row === 1 ? path[2] : path[0];
        for (let i = 0; i <= 8; i++) {
          const vertex = row * 9 + i;
          expect(Vector3.distance(positions[vertex], center)).toBeCloseTo(0.5, 6);
          expect(normals[vertex].length()).toBeCloseTo(1, 6);
        }
      }
    } finally {
      mesh.destroy();
    }
  });

  it.each([1, 2])("keeps torus-knot cross-sections with %s longitudinal segments", (segments) => {
    const mesh = PrimitiveMesh.createTorusKnot(engine, {
      keepData: true,
      radius: 1,
      tubeRadius: 0.2,
      p: 2,
      q: 3,
      tubularSegments: segments,
      radialSegments: 8
    });
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      for (let row = 0; row <= segments; row++) {
        const center = new Vector3(segments === 2 && row === 1 ? 0.5 : 1.5, 0, 0);
        for (let i = 0; i <= 8; i++) {
          const vertex = row * 9 + i;
          expect(Vector3.distance(positions[vertex], center)).toBeCloseTo(0.2, 6);
          expect(normals[vertex].length()).toBeCloseTo(1, 6);
        }
      }
    } finally {
      mesh.destroy();
    }
  });

  it("rejects a torus knot without either winding", () => {
    expect(() => PrimitiveMesh.createTorusKnot(engine, { radius: 1, tubeRadius: 0.2, p: 0, q: 0 })).toThrow(
      "at least one nonzero winding"
    );
  });

  it("closes tube frames without a position or normal seam", () => {
    const radialSegments = 8;
    const points = Array.from({ length: 40 }, (_, i) => {
      const angle = (i / 40) * Math.PI * 2;
      return new Vector3(Math.cos(angle), Math.sin(angle), Math.sin(angle * 2) / 3);
    });
    const mesh = PrimitiveMesh.createTube(engine, points, {
      keepData: true,
      closed: true,
      radius: 0.5,
      tubularSegments: 40,
      radialSegments
    });
    try {
      const positions = mesh.getPositions()!;
      const normals = mesh.getNormals()!;
      for (let i = 0; i <= radialSegments; i++) {
        const end = positions.length - radialSegments - 1 + i;
        expect(Vector3.distance(positions[i], positions[end])).toBeLessThan(1e-6);
        expect(Vector3.distance(normals[i], normals[end])).toBeLessThan(1e-6);
      }
    } finally {
      mesh.destroy();
    }
  });

  it.each([0, 0.4])("closes extrusion cross-sections without caps on a path of height %s", (height) => {
    const points = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return new Vector3(3 * Math.cos(angle), 3 * Math.sin(angle), height * Math.sin(angle * 2));
    });
    const originalPoints = points.map((point) => point.toJSON());
    const profile = [new Vector2(0.2, 0), new Vector2(-0.1, 0.1), new Vector2(-0.1, -0.1)];
    const options = { keepData: true, closed: true };
    const mesh = PrimitiveMesh.createExtrusion(engine, profile, { ...options, path: points, steps: 32 });
    const repeated = PrimitiveMesh.createExtrusion(engine, profile, {
      ...options,
      path: [...points, points[0].clone()],
      steps: 32
    });
    try {
      const positions = mesh.getPositions()!;
      const indices = mesh.getIndices()!;
      expect(indices).toHaveLength(32 * profile.length * 6);
      expect(points.map((point) => point.toJSON())).toEqual(originalPoints);
      expect(mesh.vertexBufferBindings[0]!.buffer.data).toEqual(repeated.vertexBufferBindings[0]!.buffer.data);

      const keys = positions.map((point) =>
        [point.x, point.y, point.z].map((value) => Math.round(value * 1e5)).join(",")
      );
      const edges = new Map<string, number>();
      for (let i = 0; i < indices.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          const edge = [keys[indices[i + j]], keys[indices[i + ((j + 1) % 3)]]].sort().join("|");
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      expect(new Set(edges.values())).toEqual(new Set([2]));

      const buffer = mesh.vertexBufferBindings[0]!.buffer;
      const original = buffer.data!.slice();
      const originalIndices = Array.from(indices);
      points[0].set(100, 200, 300);
      options.closed = false;
      MeshTestUtils.clearBuffer(buffer);
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      expect(MeshTestUtils.readBuffer(buffer)).toEqual(original);
      expect(Array.from(mesh.getIndices()!)).toEqual(originalIndices);
    } finally {
      mesh.destroy();
      repeated.destroy();
    }
  });

  it("uses one wall material slot per closed extrusion shape including its holes", () => {
    const shapes = [
      {
        points: polygon.points.map((point) => point.clone().scale(0.1)),
        holes: polygon.holes.map((hole) => hole.map((point) => point.clone().scale(0.1)))
      },
      { points: polygon.points.map(({ x, y }) => new Vector2(x * 0.1 + 0.6, y * 0.1)) }
    ];
    const points = [new Vector3(-4, 0, -4), new Vector3(4, 0, -4), new Vector3(4, 0, 4), new Vector3(-4, 0, 4)];
    const mesh = PrimitiveMesh.createExtrusion(engine, shapes, {
      keepData: true,
      separateMaterials: true,
      closed: true,
      path: points,
      steps: 16
    });
    try {
      const counts = [16 * 8 * 6, 16 * 4 * 6];
      expect(mesh.subMeshes.map(({ start, count }) => ({ start, count }))).toEqual([
        { start: 0, count: counts[0] },
        { start: counts[0], count: counts[1] }
      ]);
      expect(mesh.getIndices()!).toHaveLength(counts[0] + counts[1]);
    } finally {
      mesh.destroy();
    }
  });

  it("uses at least three steps to close an extrusion path", () => {
    const profile = [new Vector2(0.2, 0), new Vector2(-0.1, 0.1), new Vector2(-0.1, -0.1)];
    const points = [new Vector3(-4, 0, -4), new Vector3(4, 0, -4), new Vector3(4, 0, 4), new Vector3(-4, 0, 4)];
    const mesh = PrimitiveMesh.createExtrusion(engine, profile, { keepData: true, closed: true, path: points });
    try {
      const positions = mesh.getPositions()!;
      const indices = mesh.getIndices()!;
      expect(indices).toHaveLength(3 * profile.length * 6);
      const ab = new Vector3();
      const ac = new Vector3();
      const normal = new Vector3();
      for (let i = 0; i < indices.length; i += 3) {
        Vector3.subtract(positions[indices[i + 1]], positions[indices[i]], ab);
        Vector3.subtract(positions[indices[i + 2]], positions[indices[i]], ac);
        Vector3.cross(ab, ac, normal);
        expect(normal.length()).toBeGreaterThan(1e-6);
      }
    } finally {
      mesh.destroy();
    }
  });

  it("samples tube paths at equal distances along their line segments", () => {
    const radialSegments = 8;
    const mesh = PrimitiveMesh.createTube(engine, [new Vector3(), new Vector3(1, 0, 0), new Vector3(1, 3, 0)], {
      keepData: true,
      radius: 0.5,
      tubularSegments: 4,
      radialSegments
    });
    try {
      const positions = mesh.getPositions()!;
      const centers = [
        new Vector3(),
        new Vector3(1, 0, 0),
        new Vector3(1, 1, 0),
        new Vector3(1, 2, 0),
        new Vector3(1, 3, 0)
      ];
      for (let i = 0; i < centers.length; i++) {
        const center = new Vector3();
        for (let j = 0; j < radialSegments; j++) {
          center.add(positions[i * (radialSegments + 1) + j]);
        }
        center.scale(1 / radialSegments);
        expect(Vector3.distance(center, centers[i])).toBeLessThan(1e-6);
      }
    } finally {
      mesh.destroy();
    }
  });

  it.each(["createTetrahedron", "createOctahedron", "createIcosahedron", "createDodecahedron"] as const)(
    "keeps %s UVs within the shortest longitudinal interval",
    (create) => {
      for (const segments of [1, 2, 3]) {
        const mesh = PrimitiveMesh[create](engine, { radius: 1, segments, keepData: true });
        try {
          const uvs = mesh.getUVs()!;
          const indices = mesh.getIndices()!;
          for (let i = 0; i < indices.length; i += 3) {
            const values = [uvs[indices[i]].x, uvs[indices[i + 1]].x, uvs[indices[i + 2]].x];
            expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(0.500001);
          }
        } finally {
          mesh.destroy();
        }
      }
    }
  );

  it("ignores replaced vertex buffers while preserving pending position edits", () => {
    const mesh = new ModelMesh(engine);
    const previous = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      new Float32Array([0, 0, 0]),
      BufferUsage.Static,
      true
    );
    const current = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      new Float32Array([1, 0, 0]),
      BufferUsage.Static,
      true
    );
    try {
      mesh.setVertexElements([new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0)]);
      mesh.setVertexBufferBinding(previous, 12, 0);
      mesh.setVertexBufferBinding(current, 12, 0);
      mesh.setPositions([new Vector3(2, 0, 0)]);
      previous.setData(new Float32Array([3, 0, 0]));
      expect(mesh.getPositions()![0].x).toBe(2);
      mesh.uploadData(false);
      expect(new Float32Array(MeshTestUtils.readBuffer(current).buffer)[0]).toBe(2);
    } finally {
      mesh.destroy();
      previous.destroy();
      current.destroy();
    }
  });

  it("preserves edited primitive data and material groups after device restoration", async () => {
    const restoredEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const released = PrimitiveMesh.createSphere(restoredEngine, { radius: 1, subdivisions: 1 });
    const mesh = PrimitiveMesh.createCuboid(restoredEngine, {
      keepData: true,
      separateMaterials: true,
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });
    try {
      const uvs = mesh.getUVs()!.map((uv) => new Vector2(uv.x * 2 + 0.25, uv.y * 3 - 0.5));
      const secondaryUVs = uvs.map((uv) => uv.clone().scale(0.5));
      mesh.setUVs(uvs);
      mesh.setUVs(secondaryUVs, 1);
      mesh.calculateTangents();
      mesh.setIndices(mesh.getIndices()!.slice(0, 6));
      mesh.clearSubMesh();
      const subMesh = mesh.addSubMesh(0, 6);
      mesh.bounds.min.set(-2, -3, -4);
      mesh.bounds.max.set(2, 3, 4);
      mesh.uploadData(false);
      const bindings = mesh.vertexBufferBindings.map((binding) => binding!.buffer);
      const buffers = bindings.map((buffer) => MeshTestUtils.readBuffer(buffer));
      const releasedBindings = released.vertexBufferBindings.map((binding) => binding!.buffer);
      releasedBindings.push(released._primitive.indexBufferBinding!._buffer);
      const releasedBuffers = releasedBindings.map((buffer) => MeshTestUtils.readBuffer(buffer));

      const lost = new Promise<void>((resolve) => restoredEngine.once(EngineEventType.DeviceLost, () => resolve()));
      restoredEngine.forceLoseDevice();
      await lost;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const restored = new Promise<void>((resolve) =>
        restoredEngine.once(EngineEventType.DeviceRestored, () => resolve())
      );
      restoredEngine.forceRestoreDevice();
      await restored;

      expect(mesh.getUVs()!.map((uv) => uv.toJSON())).toEqual(uvs.map((uv) => uv.toJSON()));
      expect(mesh.getUVs(1)!.map((uv) => uv.toJSON())).toEqual(secondaryUVs.map((uv) => uv.toJSON()));
      expect(mesh.getIndices()!).toHaveLength(6);
      expect(mesh.subMeshes).toHaveLength(1);
      expect(mesh.subMeshes[0]).toBe(subMesh);
      expect(mesh.bounds.min.toJSON()).toEqual({ x: -2, y: -3, z: -4 });
      expect(mesh.bounds.max.toJSON()).toEqual({ x: 2, y: 3, z: 4 });
      bindings.forEach((buffer, index) => {
        expect(mesh.vertexBufferBindings[index]!.buffer).toBe(buffer);
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(buffers[index]);
      });
      releasedBindings.forEach((buffer, index) => {
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(releasedBuffers[index]);
      });
    } finally {
      restoredEngine.destroy();
    }
  });

  it("restores released tangents from edited primitive UVs", () => {
    const mesh = PrimitiveMesh.createPlane(engine, {
      keepData: true,
      width: 2,
      height: 3,
      horizontalSegments: 1,
      verticalSegments: 1
    });
    try {
      mesh.setUVs(mesh.getUVs()!.map((uv) => new Vector2(uv.y, uv.x)));
      mesh.calculateTangents();
      mesh.uploadData(true);
      const bindings = mesh.vertexBufferBindings.map((binding) => binding!.buffer);
      bindings.push(mesh._primitive.indexBufferBinding!._buffer);
      const original = bindings.map((buffer) => MeshTestUtils.readBuffer(buffer));
      bindings.forEach((buffer) => MeshTestUtils.clearBuffer(buffer));
      (engine.resourceManager as any)._contentRestorerPool[mesh.instanceId].restoreContent();
      bindings.forEach((buffer, index) => {
        expect(MeshTestUtils.readBuffer(buffer)).toEqual(original[index]);
      });
    } finally {
      mesh.destroy();
    }
  });

  it.each([1, 1e-8])("normalizes tangents for a plane of size %s", (size) => {
    const mesh = PrimitiveMesh.createPlane(engine, {
      keepData: true,
      width: size,
      height: size,
      horizontalSegments: 1,
      verticalSegments: 1
    });
    try {
      for (const tangent of mesh.getTangents()!) {
        expect(Math.hypot(tangent.x, tangent.y, tangent.z)).toBeCloseTo(1, 6);
        expect(tangent.x).toBeCloseTo(1, 6);
        expect(tangent.y).toBeCloseTo(0, 6);
        expect(tangent.z).toBeCloseTo(0, 6);
      }
    } finally {
      mesh.destroy();
    }
  });

  it("keeps tangent calculations finite for collapsed UV triangles", () => {
    const mesh = new ModelMesh(engine);
    try {
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setNormals([new Vector3(0, 0, 2), new Vector3(0, 0, 2), new Vector3(0, 0, 2)]);
      mesh.setUVs([new Vector2(), new Vector2(), new Vector2()]);
      mesh.setIndices(new Uint16Array([0, 1, 2]));
      mesh.calculateTangents();
      expect(mesh.getTangents()!.every((t) => [t.x, t.y, t.z, t.w].every(Number.isFinite))).toBe(true);
    } finally {
      mesh.destroy();
    }
  });

  it.each([false, true])("preserves tangent data when adding a vertex channel after reading: %s", (readTangents) => {
    const mesh = PrimitiveMesh.createSphere(engine, { keepData: true, subdivisions: 2 });
    try {
      const original = MeshTestUtils.readBuffer(mesh.vertexBufferBindings[1]!.buffer);
      if (readTangents) {
        mesh.getTangents();
      }
      mesh.setUVs(
        mesh.getUVs()!.map((uv) => uv.clone()),
        1
      );
      mesh.uploadData(false);
      const element = mesh.getVertexElement(VertexAttribute.Tangent)!;
      const binding = mesh.vertexBufferBindings[element.bindingIndex]!;
      const buffer = MeshTestUtils.readBuffer(binding.buffer);
      const tangents = new Uint8Array(mesh.vertexCount * 16);
      for (let i = 0; i < mesh.vertexCount; i++) {
        const offset = i * binding.stride + element.offset;
        tangents.set(buffer.subarray(offset, offset + 16), i * 16);
      }
      expect(tangents).toEqual(original);
      expect(mesh.vertexBufferBindings).toHaveLength(2);
    } finally {
      mesh.destroy();
    }
  });

  it("releases primitive tangent data through the ModelMesh buffer lifecycle", () => {
    const mesh = PrimitiveMesh.createPlane(engine, { keepData: true });
    try {
      const tangentBuffer = mesh.vertexBufferBindings[1]!.buffer;
      expect(tangentBuffer.readable).toBe(true);
      mesh.uploadData(true);
      expect(tangentBuffer.readable).toBe(false);
      expect(() => mesh.getTangents()).toThrow();
    } finally {
      mesh.destroy();
    }
  });

  it("calculates tangents for non-indexed triangles with non-unit normals", () => {
    const mesh = new ModelMesh(engine);
    try {
      mesh.setPositions([new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setNormals([new Vector3(0, 0, 2), new Vector3(0, 0, 2), new Vector3(0, 0, 2)]);
      mesh.setUVs([new Vector2(), new Vector2(1, 0), new Vector2(0, 1)]);
      mesh.calculateTangents();
      expect(mesh.getTangents()!.map((tangent) => tangent.toJSON())).toEqual([
        { x: 1, y: 0, z: 0, w: 1 },
        { x: 1, y: 0, z: 0, w: 1 },
        { x: 1, y: 0, z: 0, w: 1 }
      ]);
    } finally {
      mesh.destroy();
    }
  });

  it("promotes growing extrusion indices beyond the 16-bit vertex range", () => {
    const contour = Array.from({ length: 256 }, (_, i) => {
      const angle = (i * Math.PI * 2) / 256;
      return new Vector2(Math.cos(angle), Math.sin(angle));
    });
    const mesh = PrimitiveMesh.createExtrusion(engine, contour, { keepData: true, steps: 43 });
    try {
      const indices = mesh.getIndices()!;
      expect(mesh.vertexCount).toBeGreaterThan(65535);
      expect(indices).toBeInstanceOf(Uint32Array);
      expect(indices[indices.length - 1]).toBe(mesh.vertexCount - 1);
    } finally {
      mesh.destroy();
    }
  });

  it("handles repeated contour endpoints when beveling", () => {
    const mesh = PrimitiveMesh.createExtrusion(
      engine,
      {
        points: [
          new Vector2(0, 0),
          new Vector2(2, 0),
          new Vector2(2, 0),
          new Vector2(2, 2),
          new Vector2(0, 2),
          new Vector2(0, 0)
        ]
      },
      { keepData: true, bevelSize: 0.1, depth: 1, steps: 1 }
    );
    try {
      expect(mesh.getPositions()!.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
    } finally {
      mesh.destroy();
    }
  });
});

class MeshTestUtils {
  static clearBuffer(buffer: Buffer): void {
    buffer._platformBuffer.setData(
      buffer.byteLength,
      new Uint8Array(buffer.byteLength),
      0,
      0,
      undefined,
      SetDataOptions.None
    );
  }

  static readBuffer(buffer: Buffer): Uint8Array {
    const data = new Uint8Array(buffer.byteLength);
    buffer.getData(data);
    return data;
  }
}
