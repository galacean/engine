import { AssetType, ModelMesh, PrimitiveMesh, PrimitiveMeshAsset, Vector2, Vector3 } from "@galacean/engine";
import { PrimitiveMeshExample, PrimitiveMeshGallery } from "./.primitiveMeshGallery";

/**
 * Material slots, retained mesh data and JSON asset creation.
 */
class PrimitiveMaterials {
  static async create(): Promise<void> {
    const gallery = await PrimitiveMeshGallery.create();
    const { engine } = gallery;
    const square = [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)];
    const polygons = [-0.6, 0.6].map((offset) => ({
      points: square.map(({ x, y }) => new Vector2(x * 0.4 + offset, y * 0.6))
    }));
    const loop = Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      return new Vector3(Math.cos(angle), Math.sin(angle), 0.1 * Math.sin(angle * 3));
    });
    const profiles = [-0.12, 0.12].map((offset) => ({
      points: square.map(({ x, y }) => new Vector2(x * 0.07 + offset, y * 0.07))
    }));
    const asset = { type: "sphere", sphereOptions: { radius: 1, subdivisions: 2 } } satisfies PrimitiveMeshAsset;
    const url = URL.createObjectURL(new Blob([JSON.stringify(asset)], { type: "application/json" }));
    const loaded = await engine.resourceManager.load<ModelMesh>({ type: AssetType.PrimitiveMesh, url });
    URL.revokeObjectURL(url);
    const retained = PrimitiveMesh.createSphere(engine, { radius: 1, subdivisions: 2, keepData: true });
    if (loaded.accessible || !retained.accessible || loaded.vertexCount !== retained.vertexCount) {
      throw new Error("Primitive data retention or JSON asset creation differs from the factory.");
    }
    const examples: (PrimitiveMeshExample & { slots: number })[] = [
      {
        label: "Cuboid / one material",
        detail: "separateMaterials: false",
        mesh: PrimitiveMesh.createCuboid(engine),
        slots: 1
      },
      {
        label: "Cuboid / face materials",
        detail: "+Y -Y -X +X +Z -Z",
        mesh: PrimitiveMesh.createCuboid(engine, { separateMaterials: true }),
        slots: 6
      },
      {
        label: "Cylinder / part materials",
        detail: "side / top / bottom",
        mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4, separateMaterials: true }),
        slots: 3
      },
      {
        label: "Cone / part materials",
        detail: "side / bottom",
        mesh: PrimitiveMesh.createCone(engine, { height: 1.4, separateMaterials: true }),
        slots: 2,
        rotation: new Vector3(-25, -28, 0)
      },
      {
        label: "Polygon / shape materials",
        detail: "one slot per polygon",
        mesh: PrimitiveMesh.createPolygon(engine, polygons, { separateMaterials: true }),
        slots: 2,
        rotation: new Vector3()
      },
      {
        label: "Extrusion / cap and wall",
        detail: "caps / walls + bevels",
        mesh: PrimitiveMesh.createExtrusion(engine, square, { depth: 0.6, bevelSize: 0.12, separateMaterials: true }),
        slots: 2
      },
      {
        label: "Closed / two profiles",
        detail: "one wall slot per profile",
        mesh: PrimitiveMesh.createExtrusion(engine, profiles, {
          path: loop,
          steps: 64,
          closed: true,
          separateMaterials: true
        }),
        slots: 2
      },
      {
        label: "Rounded / face materials",
        detail: "six material slots",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, { cornerRadius: 0.2, segments: 4, separateMaterials: true }),
        slots: 6
      },
      {
        label: "Factory / retained data",
        detail: "keepData: true / readable",
        mesh: retained,
        slots: 1,
        appearance: "checker"
      },
      {
        label: "JSON asset / released data",
        detail: "keepData: false / same shape",
        mesh: loaded,
        slots: 1,
        appearance: "checker"
      },
      {
        label: "Mirrored torus knot",
        detail: "p: 2 / q: -3",
        mesh: PrimitiveMesh.createTorusKnot(engine, { q: -3, tubularSegments: 96 }),
        slots: 1,
        appearance: "checker"
      },
      {
        label: "Clamped corner radius",
        detail: "radius: 2 clamped to 0.5",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, { cornerRadius: 2, segments: 6 }),
        slots: 1,
        appearance: "checker"
      }
    ];
    for (const { label, mesh, slots } of examples) {
      if (mesh.subMeshes.length !== slots) {
        throw new Error(`${label}: expected ${slots} material slots, got ${mesh.subMeshes.length}.`);
      }
    }
    gallery.show(
      "Material groups, CPU data and JSON assets",
      examples.map((example) => ({ ...example, appearance: example.appearance ?? "groups" })),
      4
    );
  }
}

PrimitiveMaterials.create();
