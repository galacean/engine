import { PrimitiveMesh, PrimitiveMeshCapMode, Vector2, Vector3 } from "@galacean/engine";
import { PrimitiveMeshGallery } from "./.primitiveMeshGallery";

/**
 * Angular ranges and independent end-cap controls.
 */
class PrimitiveSections {
  static async create(): Promise<void> {
    const gallery = await PrimitiveMeshGallery.create();
    const { engine } = gallery;
    const front = new Vector3();
    const profile = [new Vector2(0, -1), new Vector2(0.7, -1), new Vector2(0.9, 0), new Vector2(0.6, 1)];
    gallery.show(
      "Angular ranges and end caps",
      [
        {
          label: "Circle sector",
          detail: "angleRange: [30, 300]",
          mesh: PrimitiveMesh.createCircle(engine, { angleRange: new Vector2(30, 300) }),
          rotation: front
        },
        {
          label: "Ring sector",
          detail: "angleRange: [30, 300]",
          mesh: PrimitiveMesh.createRing(engine, { angleRange: new Vector2(30, 300) }),
          rotation: front
        },
        {
          label: "Torus arc",
          detail: "angleRange: [30, 300]",
          mesh: PrimitiveMesh.createTorus(engine, { angleRange: new Vector2(30, 300) })
        },
        {
          label: "Torus cross-section",
          detail: "tubeRange: [0, 180]",
          mesh: PrimitiveMesh.createTorus(engine, { tubeRadius: 0.2, tubeRange: new Vector2(0, 180) })
        },
        {
          label: "Both torus ranges",
          detail: "arc 270 / tube 270 degrees",
          mesh: PrimitiveMesh.createTorus(engine, {
            tubeRadius: 0.2,
            angleRange: new Vector2(30, 300),
            tubeRange: new Vector2(45, 315)
          })
        },
        { label: "Cylinder: both", detail: "caps: both", mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4 }) },
        {
          label: "Cylinder: top",
          detail: "caps: top",
          mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4, caps: PrimitiveMeshCapMode.Top })
        },
        {
          label: "Cylinder: bottom",
          detail: "caps: bottom",
          mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4, caps: PrimitiveMeshCapMode.Bottom }),
          rotation: new Vector3(-25, -28, 0)
        },
        {
          label: "Cylinder: open",
          detail: "caps: none",
          mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4, caps: PrimitiveMeshCapMode.None })
        },
        {
          label: "Cylinder sector",
          detail: "angleRange: [30, 270]",
          mesh: PrimitiveMesh.createCylinder(engine, { height: 1.4, angleRange: new Vector2(30, 270) })
        },
        {
          label: "Truncated cone sector",
          detail: "top 0.25 / bottom 0.6",
          mesh: PrimitiveMesh.createTruncatedCone(engine, {
            bottomRadius: 0.6,
            height: 1.4,
            angleRange: new Vector2(30, 270)
          })
        },
        {
          label: "Cone with cap",
          detail: "cap: true",
          mesh: PrimitiveMesh.createCone(engine, { height: 1.4 }),
          rotation: new Vector3(-25, -28, 0)
        },
        {
          label: "Cone without cap",
          detail: "cap: false",
          mesh: PrimitiveMesh.createCone(engine, { height: 1.4, cap: false }),
          rotation: new Vector3(-25, -28, 0)
        },
        {
          label: "Full lathe",
          detail: "angleRange: [0, 360]",
          mesh: PrimitiveMesh.createLathe(engine, profile, { segments: 32 })
        },
        {
          label: "Partial lathe",
          detail: "angleRange: [30, 270]",
          mesh: PrimitiveMesh.createLathe(engine, profile, { segments: 32, angleRange: new Vector2(30, 270) })
        }
      ],
      5
    );
  }
}

PrimitiveSections.create();
