import { PrimitiveMesh, Vector2, Vector3 } from "@galacean/engine";
import { PrimitiveMeshExample, PrimitiveMeshGallery } from "./.primitiveMeshGallery";

/**
 * Triangle distribution, subdivision controls and rounded edge quality.
 */
class PrimitiveTopology {
  static async create(): Promise<void> {
    const gallery = await PrimitiveMeshGallery.create();
    const { engine } = gallery;
    const keep = { keepData: true };
    const examples: PrimitiveMeshExample[] = [
      {
        label: "Sphere / level 1",
        detail: "subdivisions: 1",
        mesh: PrimitiveMesh.createSphere(engine, 0.5, { ...keep, subdivisions: 1 })
      },
      {
        label: "Sphere / level 3",
        detail: "subdivisions: 3",
        mesh: PrimitiveMesh.createSphere(engine, 0.5, { ...keep, subdivisions: 3 })
      },
      {
        label: "Cylinder / 6 sides",
        detail: "radialSegments: 6",
        mesh: PrimitiveMesh.createCylinder(engine, 0.5, 2, { ...keep, radialSegments: 6 })
      },
      {
        label: "Cylinder / 24 sides",
        detail: "radial: 24 / height: 4",
        mesh: PrimitiveMesh.createCylinder(engine, 0.5, 2, { ...keep, radialSegments: 24, heightSegments: 4 })
      },
      {
        label: "Cone / 6 sides",
        detail: "radial: 6 / height: 3",
        mesh: PrimitiveMesh.createCone(engine, 0.5, 2, { ...keep, radialSegments: 6, heightSegments: 3 })
      },
      {
        label: "Cuboid subdivisions",
        detail: "width: 4 / height: 2 / depth: 3",
        mesh: PrimitiveMesh.createCuboid(engine, 1, 1, 1, {
          ...keep,
          widthSegments: 4,
          heightSegments: 2,
          depthSegments: 3
        })
      },
      {
        label: "Plane / 1 by 6",
        detail: "horizontal: 1 / vertical: 6",
        mesh: PrimitiveMesh.createPlane(engine, 1, 1, { ...keep, horizontalSegments: 1, verticalSegments: 6 }),
        rotation: new Vector3(65, -20, 0)
      },
      {
        label: "Plane / 6 by 1",
        detail: "horizontal: 6 / vertical: 1",
        mesh: PrimitiveMesh.createPlane(engine, 1, 1, { ...keep, horizontalSegments: 6, verticalSegments: 1 }),
        rotation: new Vector3(65, -20, 0)
      },
      {
        label: "Capsule / coarse caps",
        detail: "radial: 8 / caps: 2 / height: 1",
        mesh: PrimitiveMesh.createCapsule(engine, 0.5, 1, { ...keep, radialSegments: 8, capSegments: 2 })
      },
      {
        label: "Capsule / fine caps",
        detail: "radial: 16 / caps: 8 / height: 4",
        mesh: PrimitiveMesh.createCapsule(engine, 0.5, 1, {
          ...keep,
          radialSegments: 16,
          capSegments: 8,
          heightSegments: 4
        })
      },
      {
        label: "Tetrahedron subdivision",
        detail: "segments: 3",
        mesh: PrimitiveMesh.createTetrahedron(engine, 0.5, { ...keep, segments: 3 })
      },
      {
        label: "Octahedron subdivision",
        detail: "segments: 3",
        mesh: PrimitiveMesh.createOctahedron(engine, 0.5, { ...keep, segments: 3 })
      },
      {
        label: "Icosahedron subdivision",
        detail: "segments: 3",
        mesh: PrimitiveMesh.createIcosahedron(engine, 0.5, { ...keep, segments: 3 })
      },
      {
        label: "Dodecahedron subdivision",
        detail: "segments: 3",
        mesh: PrimitiveMesh.createDodecahedron(engine, 0.5, { ...keep, segments: 3 })
      },
      {
        label: "Sphere / level 2",
        detail: "subdivisions: 2",
        mesh: PrimitiveMesh.createSphere(engine, 0.5, { ...keep, subdivisions: 2 })
      },
      {
        label: "Rounded cuboid / zero",
        detail: "cornerRadius: 0",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0, { ...keep })
      },
      {
        label: "Rounded cuboid / coarse",
        detail: "radius: 0.2 / segments: 1",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0.2, { ...keep, segments: 1 })
      },
      {
        label: "Rounded cuboid / fine",
        detail: "radius: 0.2 / segments: 4",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, 1, 1, 1, 0.2, { ...keep, segments: 4 })
      },
      {
        label: "Torus knot / 2, 3",
        detail: "p: 2 / q: 3",
        mesh: PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 2, 3, { ...keep, tubularSegments: 96 })
      },
      {
        label: "Torus knot / 3, 2",
        detail: "p: 3 / q: 2",
        mesh: PrimitiveMesh.createTorusKnot(engine, 0.5, 0.1, 3, 2, { ...keep, tubularSegments: 96 })
      },
      {
        label: "Circle / 8 segments",
        detail: "segments: 8",
        mesh: PrimitiveMesh.createCircle(engine, 0.5, { ...keep, segments: 8 }),
        rotation: new Vector3()
      },
      {
        label: "Ring / width subdivisions",
        detail: "radial: 12 / width: 4",
        mesh: PrimitiveMesh.createRing(engine, 0.5, 0.25, { ...keep, radialSegments: 12, widthSegments: 4 }),
        rotation: new Vector3()
      },
      {
        label: "Lathe / 8 segments",
        detail: "segments: 8",
        mesh: PrimitiveMesh.createLathe(engine, [new Vector2(0.4, -1), new Vector2(0.8, 0), new Vector2(0.4, 1)], {
          ...keep,
          segments: 8
        })
      },
      {
        label: "Tube / path subdivisions",
        detail: "tubular: 12 / radial: 6",
        mesh: PrimitiveMesh.createTube(
          engine,
          [new Vector3(-1, -0.4, 0), new Vector3(0, 0.4, 0.3), new Vector3(1, -0.4, 0)],
          0.2,
          { ...keep, tubularSegments: 12, radialSegments: 6 }
        )
      },
      {
        label: "Extrusion / bevel layers",
        detail: "steps: 3 / bevelSegments: 3",
        mesh: PrimitiveMesh.createExtrusion(
          engine,
          [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)],
          0.6,
          { ...keep, steps: 3, bevelSize: 0.15, bevelSegments: 3 }
        )
      }
    ];
    gallery.show(
      "Subdivision and triangle topology",
      examples.map((example) => ({ ...example, wireframe: true })),
      5
    );
  }
}

PrimitiveTopology.create();
