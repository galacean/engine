import { PrimitiveMesh, Vector2, Vector3 } from "@galacean/engine";
import { PrimitiveMeshGallery } from "./.primitiveMeshGallery";

/**
 * Polygon contours, bevels and open or closed path sweeps.
 */
class PrimitiveContours {
  static async create(): Promise<void> {
    const gallery = await PrimitiveMeshGallery.create();
    const { engine } = gallery;
    const front = new Vector3();
    const outline = [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)];
    const concave = [
      new Vector2(-1, -1),
      new Vector2(1, -1),
      new Vector2(1, -0.2),
      new Vector2(0, -0.2),
      new Vector2(0, 1),
      new Vector2(-1, 1)
    ];
    const hole = [
      new Vector2(-0.35, -0.35),
      new Vector2(-0.35, 0.35),
      new Vector2(0.35, 0.35),
      new Vector2(0.35, -0.35)
    ];
    const polygon = { points: outline, holes: [hole] };
    const twoHoles = {
      points: outline,
      holes: [-0.5, 0.5].map((offset) => hole.map(({ x, y }) => new Vector2(x * 0.55 + offset, y)))
    };
    const shapes = [-0.65, 0.65].map((offset) => ({
      points: outline.map(({ x, y }) => new Vector2(x * 0.45 + offset, y * 0.65))
    }));
    const path = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return new Vector3(-1.2 + 2.4 * t, 0.45 * Math.sin(t * Math.PI * 2), 0.3 * Math.cos(t * Math.PI));
    });
    const loop = Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      return new Vector3(Math.cos(angle), Math.sin(angle), 0.15 * Math.sin(angle * 3));
    });
    const smallProfile = outline.map(({ x, y }) => new Vector2(x * 0.16, y * 0.16));
    const smallHoleProfile = { points: smallProfile, holes: [hole.map(({ x, y }) => new Vector2(x * 0.2, y * 0.2))] };
    gallery.show(
      "Contours, bevels and path sweeps",
      [
        {
          label: "Concave polygon",
          detail: "automatic triangulation",
          mesh: PrimitiveMesh.createPolygon(engine, concave),
          rotation: front
        },
        {
          label: "Two holes",
          detail: "outer + 2 inner contours",
          mesh: PrimitiveMesh.createPolygon(engine, twoHoles),
          rotation: front
        },
        {
          label: "Multiple polygons",
          detail: "2 disjoint contours",
          mesh: PrimitiveMesh.createPolygon(engine, shapes),
          rotation: front
        },
        {
          label: "Straight extrusion",
          detail: "depth: 0.6 / no bevel",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, polygon, 0.6)
        },
        {
          label: "Independent bevel depth",
          detail: "bevel width: 0.16 / depth: 0.06",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, polygon, 0.6, {
            bevelWidth: 0.16,
            bevelDepth: 0.06,
            bevelSegments: 4
          })
        },
        {
          label: "Expanded contour",
          detail: "offset: +0.15 / no bevel",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, polygon, 0.6, { contourOffset: 0.15 })
        },
        {
          label: "Contracted contour",
          detail: "contourOffset: -0.15",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, polygon, 0.6, { contourOffset: -0.15, bevelWidth: 0.08 })
        },
        {
          label: "Open tube",
          detail: "point array / open ends",
          mesh: PrimitiveMesh.createTube(engine, path, 0.15, { pathSegments: 48, radialSegments: 12 })
        },
        {
          label: "Closed tube",
          detail: "closedPath: true / seamless join",
          mesh: PrimitiveMesh.createTube(engine, loop, 0.15, { pathSegments: 64, radialSegments: 12, closedPath: true })
        },
        {
          label: "Open profile sweep",
          detail: "pathSegments: 48",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, smallProfile, path, { pathSegments: 48 })
        },
        {
          label: "Closed profile sweep",
          detail: "closedPath: true / no caps",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, smallProfile, loop, { pathSegments: 64, closedPath: true })
        },
        {
          label: "Hollow profile sweep",
          detail: "path + inner contour",
          mesh: PrimitiveMesh.createExtrudedPolygon(engine, smallHoleProfile, path, { pathSegments: 48 })
        }
      ],
      4
    );
  }
}

PrimitiveContours.create();
