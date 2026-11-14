/**
 * @title All Primitive Meshes
 * @category Primitive
 */
import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Entity,
  Font,
  Logger,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  TextRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import type { PrimitiveMeshAsset } from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

class PrimitiveMeshGallery {
  static async create(): Promise<void> {
    await document.fonts.load('24px "AlibabaSans"');
    const engine = await WebGLEngine.create({ canvas: "canvas" });
    engine.canvas.setAutoResolution(2);
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(0.035, 0.045, 0.065, 1);
    scene.ambientLight.diffuseSolidColor.set(0.6, 0.6, 0.6, 1);

    const root = scene.createRootEntity("PrimitiveMeshGallery");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.setPosition(0, 0, 30);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 6.8;
    camera.farClipPlane = 100;

    const light = root.createChild("Light");
    light.transform.setRotation(35, -35, 0);
    light.addComponent(DirectLight).color.set(0.9, 0.9, 0.9, 1);

    const texture = PrimitiveMeshGallery._createChecker(engine);
    const material = new BlinnPhongMaterial(engine);
    material.baseTexture = texture;
    material.specularColor.set(0.18, 0.18, 0.18, 1);
    material.shininess = 32;
    const capMaterial = new BlinnPhongMaterial(engine);
    capMaterial.baseTexture = texture;
    capMaterial.baseColor.set(0.8, 0.9, 1, 1);
    capMaterial.specularColor.set(0.18, 0.18, 0.18, 1);
    const font = Font.createFromOS(engine, "AlibabaSans");

    const profile = [
      new Vector2(0, -1),
      new Vector2(0.7, -1),
      new Vector2(0.85, -0.65),
      new Vector2(0.45, 0),
      new Vector2(0.6, 0.65),
      new Vector2(0.7, 1)
    ];
    const path = [
      new Vector3(-1, -0.6, 0),
      new Vector3(-0.5, 0.6, 0.4),
      new Vector3(0.3, -0.3, 0),
      new Vector3(1, 0.6, -0.2)
    ];
    const polygon = {
      points: [
        new Vector2(-1, -0.7),
        new Vector2(-0.7, -1),
        new Vector2(0.7, -1),
        new Vector2(1, -0.7),
        new Vector2(1, 0.7),
        new Vector2(0.7, 1),
        new Vector2(-0.7, 1),
        new Vector2(-1, 0.7)
      ],
      holes: [[new Vector2(-0.35, -0.35), new Vector2(-0.35, 0.35), new Vector2(0.35, 0.35), new Vector2(0.35, -0.35)]]
    };
    const cases: Record<PrimitiveMeshAsset["type"], { label: string; mesh: ModelMesh; rotation?: Vector3 }> = {
      cuboid: {
        label: "Cuboid",
        mesh: PrimitiveMesh.createCuboid(engine, 1, 1, 1, {
          separateMaterialSlots: true,
          widthSegments: 2,
          heightSegments: 2,
          depthSegments: 2
        })
      },
      plane: {
        label: "Plane",
        mesh: PrimitiveMesh.createPlane(engine, 2, 2, { widthSegments: 4, depthSegments: 4 }),
        rotation: new Vector3(90, 0, 0)
      },
      sphere: { label: "Sphere", mesh: PrimitiveMesh.createSphere(engine, 1, { subdivisionLevel: 3 }) },
      cylinder: {
        label: "Cylinder",
        mesh: PrimitiveMesh.createCylinder(engine, 0.65, 1.5, {
          separateMaterialSlots: true,
          radialSegments: 24,
          heightSegments: 2
        })
      },
      cone: {
        label: "Cone",
        mesh: PrimitiveMesh.createCone(engine, 0.8, 1.8, {
          separateMaterialSlots: true,
          radialSegments: 24,
          heightSegments: 2
        })
      },
      truncatedCone: {
        label: "Truncated Cone",
        mesh: PrimitiveMesh.createTruncatedCone(engine, 0.35, 0.8, 1.6, {
          separateMaterialSlots: true,
          radialSegments: 24,
          heightSegments: 2
        })
      },
      capsule: {
        label: "Capsule",
        mesh: PrimitiveMesh.createCapsule(engine, 0.5, 1, { radialSegments: 24, capSegments: 8, heightSegments: 2 })
      },
      torus: {
        label: "Torus",
        mesh: PrimitiveMesh.createTorus(engine, 0.75, 0.25, { ringSegments: 32, radialSegments: 12 })
      },
      torusKnot: {
        label: "Torus Knot",
        mesh: PrimitiveMesh.createTorusKnot(engine, 0.65, 0.17, 2, 3, { pathSegments: 96, radialSegments: 10 })
      },
      circle: {
        label: "Circle",
        mesh: PrimitiveMesh.createCircle(engine, 1, { segments: 32 }),
        rotation: new Vector3()
      },
      ring: {
        label: "Ring",
        mesh: PrimitiveMesh.createRing(engine, 1, 0.5, { ringSegments: 32, widthSegments: 2 }),
        rotation: new Vector3()
      },
      tetrahedron: { label: "Tetrahedron", mesh: PrimitiveMesh.createTetrahedron(engine, 1) },
      octahedron: { label: "Octahedron", mesh: PrimitiveMesh.createOctahedron(engine, 1) },
      icosahedron: { label: "Icosahedron", mesh: PrimitiveMesh.createIcosahedron(engine, 1) },
      dodecahedron: { label: "Dodecahedron", mesh: PrimitiveMesh.createDodecahedron(engine, 1) },
      lathe: { label: "Lathe", mesh: PrimitiveMesh.createLathe(engine, profile, { segments: 24 }) },
      tube: {
        label: "Tube",
        mesh: PrimitiveMesh.createTube(engine, path, 0.2, { pathSegments: 48, radialSegments: 10 })
      },
      polygon: { label: "Polygon", mesh: PrimitiveMesh.createPolygon(engine, polygon), rotation: new Vector3() },
      extrusion: {
        label: "Extrusion",
        mesh: PrimitiveMesh.createExtrusion(engine, polygon, 0.6, {
          bevelWidth: 0.1,
          bevelDepth: 0.1,
          bevelSegments: 3,
          separateMaterialSlots: true,
          depthSegments: 2
        })
      },
      roundedCuboid: {
        label: "Rounded Cuboid",
        mesh: PrimitiveMesh.createRoundedCuboid(engine, 2, 1.6, 1.4, 0.3, {
          separateMaterialSlots: true,
          roundingSegments: 4
        })
      }
    };
    const coveredFactories = Object.keys(cases).map((type) => `create${type[0].toUpperCase()}${type.slice(1)}`);
    const missingFactories = Object.getOwnPropertyNames(PrimitiveMesh).filter(
      (name) => name.startsWith("create") && !coveredFactories.includes(name)
    );
    if (missingFactories.length > 0) {
      throw new Error(`Primitive gallery is missing: ${missingFactories.join(", ")}`);
    }

    const entries = Object.entries(cases);
    const columns = 6;
    const rows = Math.ceil(entries.length / columns);
    entries.forEach(([type, { label, mesh, rotation }], index) => {
      const row = Math.floor(index / columns);
      const rowColumns = Math.min(columns, entries.length - row * columns);
      const x = ((index % columns) - (rowColumns - 1) / 2) * 3.3;
      const y = ((rows - 1) / 2 - row) * 3.3;
      const pivot = root.createChild(type);
      pivot.transform.setPosition(x, y + 0.25, 0);
      pivot.transform.rotation = rotation ?? new Vector3(18, -30, 0);
      const { min, max } = mesh.bounds;
      const scale = 1.9 / Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
      pivot.transform.setScale(scale, scale, scale);
      const entity = pivot.createChild("Mesh");
      entity.transform.setPosition(-(min.x + max.x) / 2, -(min.y + max.y) / 2, -(min.z + max.z) / 2);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterials(mesh.subMeshes.map((_, slot) => (slot === 0 ? material : capMaterial)));
      PrimitiveMeshGallery._createLabel(root, font, label, x, y - 1.1);
    });

    updateForE2E(engine);
    initScreenshot(engine, camera);
  }

  private static _createChecker(engine: WebGLEngine): Texture2D {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
        const offset = (y * size + x) * 4;
        pixels[offset] = dark ? 40 : 224;
        pixels[offset + 1] = dark ? 119 : 234;
        pixels[offset + 2] = dark ? 181 : 244;
        pixels[offset + 3] = 255;
      }
    }
    const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, true);
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    texture.filterMode = TextureFilterMode.Trilinear;
    return texture;
  }

  private static _createLabel(root: Entity, font: Font, text: string, x: number, y: number): void {
    const entity = root.createChild(`${text} Label`);
    entity.transform.setPosition(x, y, 0);
    const renderer = entity.addComponent(TextRenderer);
    renderer.font = font;
    renderer.fontSize = 24;
    renderer.text = text;
    renderer.color.set(0.85, 0.9, 0.97, 1);
  }
}

Logger.enable();
PrimitiveMeshGallery.create();
