import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Font,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  TextRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

class SphereSections {
  static async create(): Promise<void> {
    await document.fonts.load('24px "AlibabaSans"');
    const engine = await WebGLEngine.create({ canvas: "canvas" });
    engine.canvas.setAutoResolution(2);
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(0.035, 0.045, 0.065, 1);
    scene.ambientLight.diffuseSolidColor.set(0.6, 0.6, 0.6, 1);
    const root = scene.createRootEntity("Sphere Sections");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.setPosition(0, 0, 16);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 3.7;
    const light = root.createChild("Light");
    light.transform.setRotation(35, -35, 0);
    light.addComponent(DirectLight);

    const material = new BlinnPhongMaterial(engine);
    material.renderFace = RenderFace.Double;
    material.specularColor.set(0.18, 0.18, 0.18, 1);
    const pixels = new Uint8Array(64 * 32 * 4);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        const dark = ((x >> 2) + (y >> 2)) % 2 === 0;
        const offset = (y * 64 + x) * 4;
        pixels[offset] = dark ? 40 : 224;
        pixels[offset + 1] = dark ? 119 : 234;
        pixels[offset + 2] = dark ? 181 : 244;
        pixels[offset + 3] = 255;
      }
    }
    const texture = new Texture2D(engine, 64, 32, TextureFormat.R8G8B8A8, true);
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    texture.filterMode = TextureFilterMode.Trilinear;
    material.baseTexture = texture;
    const cases: {
      name: string;
      horizontalRange?: Vector2;
      verticalRange?: Vector2;
      rotation?: Vector3;
    }[] = [
      { name: "Full sphere" },
      { name: "Hemisphere", verticalRange: new Vector2(0, 90) },
      { name: "Half longitude", horizontalRange: new Vector2(90, 270) },
      { name: "Octant", horizontalRange: new Vector2(90, 180), verticalRange: new Vector2(0, 90) },
      { name: "Latitude band", verticalRange: new Vector2(50, 130) },
      {
        name: "Across 360 degrees",
        horizontalRange: new Vector2(330, 390),
        verticalRange: new Vector2(20, 160),
        rotation: new Vector3(20, 90, 0)
      }
    ];
    const font = Font.createFromOS(engine, "AlibabaSans");
    cases.forEach(({ name, horizontalRange, verticalRange, rotation }, index) => {
      const x = ((index % 3) - 1) * 3.3;
      const y = (0.5 - Math.floor(index / 3)) * 3.2;
      const entity = root.createChild(name);
      entity.transform.setPosition(x, y + 0.2, 0);
      entity.transform.rotation = rotation ?? new Vector3(20, -35, 0);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createSphere(engine, {
        horizontalRange,
        verticalRange,
        radius: 1,
        subdivisions: 3
      });
      renderer.setMaterial(material);
      const label = root.createChild(`${name} Label`);
      label.transform.setPosition(x, y - 1.15, 0);
      const text = label.addComponent(TextRenderer);
      text.font = font;
      text.fontSize = 24;
      text.text = name;
      text.color.set(0.85, 0.9, 0.97, 1);
    });
    updateForE2E(engine);
    initScreenshot(engine, camera);
  }
}

SphereSections.create();
