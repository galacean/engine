import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import {
  TrailRenderer,
  TrailMaterial,
  TrailTextureMode,
  CurveKey,
  ParticleCurve,
  ParticleGradient,
  GradientColorKey,
  GradientAlphaKey,
  BlendMode,
  Camera
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { describe, it, expect, beforeEach } from "vitest";

describe("Trail", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    const rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, -10);
    cameraEntity.transform.lookAt(new Vector3());
  });

  describe("TrailRenderer", () => {
    it("Constructor", () => {
      const rootEntity = scene.getRootEntity();
      const trailRenderer = rootEntity.addComponent(TrailRenderer);

      expect(trailRenderer instanceof TrailRenderer).to.eq(true);
      expect(trailRenderer.emitting).to.eq(true);
      expect(trailRenderer.minVertexDistance).to.eq(0.1);
      expect(trailRenderer.time).to.eq(5.0);
      expect(trailRenderer.width).to.eq(1.0);
      expect(trailRenderer.textureMode).to.eq(TrailTextureMode.Stretch);
      expect(trailRenderer.textureScale).to.eq(1.0);
    });

    it("set emitting", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.emitting = false;
      expect(trailRenderer.emitting).to.eq(false);

      trailRenderer.emitting = true;
      expect(trailRenderer.emitting).to.eq(true);
    });

    it("set minVertexDistance", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.minVertexDistance = 0.5;
      expect(trailRenderer.minVertexDistance).to.eq(0.5);

      trailRenderer.minVertexDistance = 0.2;
      expect(trailRenderer.minVertexDistance).to.eq(0.2);
    });

    it("set time", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.time = 2.0;
      expect(trailRenderer.time).to.eq(2.0);

      trailRenderer.time = 10.0;
      expect(trailRenderer.time).to.eq(10.0);
    });

    it("set width", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.width = 0.5;
      expect(trailRenderer.width).to.eq(0.5);

      trailRenderer.width = 2.0;
      expect(trailRenderer.width).to.eq(2.0);
    });

    it("set textureMode", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.textureMode = TrailTextureMode.Tile;
      expect(trailRenderer.textureMode).to.eq(TrailTextureMode.Tile);

      trailRenderer.textureMode = TrailTextureMode.Stretch;
      expect(trailRenderer.textureMode).to.eq(TrailTextureMode.Stretch);
    });

    it("set textureScale", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.textureScale = 2.0;
      expect(trailRenderer.textureScale).to.eq(2.0);

      trailRenderer.textureScale = 0.5;
      expect(trailRenderer.textureScale).to.eq(0.5);
    });

    it("set widthCurve", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      const widthCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 0));
      trailRenderer.widthCurve = widthCurve;

      expect(trailRenderer.widthCurve).to.eq(widthCurve);
      expect(trailRenderer.widthCurve.keys.length).to.eq(2);
      expect(trailRenderer.widthCurve.keys[0].time).to.eq(0);
      expect(trailRenderer.widthCurve.keys[0].value).to.eq(1);
      expect(trailRenderer.widthCurve.keys[1].time).to.eq(1);
      expect(trailRenderer.widthCurve.keys[1].value).to.eq(0);
    });

    it("set colorGradient", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      const gradient = new ParticleGradient(
        [new GradientColorKey(0, new Color(1, 0, 0, 1)), new GradientColorKey(1, new Color(0, 0, 1, 1))],
        [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 0)]
      );
      trailRenderer.colorGradient = gradient;

      expect(trailRenderer.colorGradient).to.eq(gradient);
      expect(trailRenderer.colorGradient.colorKeys.length).to.eq(2);
      expect(trailRenderer.colorGradient.alphaKeys.length).to.eq(2);
    });

    it("clear", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      // Call clear and verify it doesn't throw
      expect(() => trailRenderer.clear()).not.to.throw();
    });

    it("setMaterial", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);
      const material = new TrailMaterial(engine);

      trailRenderer.setMaterial(material);
      expect(trailRenderer.getMaterial()).to.eq(material);
    });

    it("destroy", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);

      trailRenderer.destroy();
      expect(trailRenderer.destroyed).to.eq(true);
    });

    it("bounds", () => {
      const rootEntity = scene.getRootEntity();
      const trailEntity = rootEntity.createChild("trail");
      const trailRenderer = trailEntity.addComponent(TrailRenderer);
      trailRenderer.setMaterial(new TrailMaterial(engine));
      trailRenderer.width = 2.0;
      trailRenderer.minVertexDistance = 0.1;

      const halfWidth = trailRenderer.width * 0.5; // 1.0

      // Initial bounds is (0,0,0) because dirty flag is not set initially
      expect(trailRenderer.bounds.min).to.deep.include({ x: 0, y: 0, z: 0 });
      expect(trailRenderer.bounds.max).to.deep.include({ x: 0, y: 0, z: 0 });

      // Move entity to (5, 0, 0) - distance > minVertexDistance, creates trail point
      engine.update(); //@todo:删除会触发包围盒无法更新的bug
      trailEntity.transform.position = new Vector3(5, 0, 0);

      // Now has trail geometry, bounds should encompass (0,0,0) to (5,0,0) expanded by halfWidth
      // min: (-1, -1, -1), max: (6, 1, 1)
      expect(trailRenderer.bounds.min.x).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.min.y).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.min.z).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.max.x).to.closeTo(5 + halfWidth, 0.01);
      expect(trailRenderer.bounds.max.y).to.closeTo(halfWidth, 0.01);
      expect(trailRenderer.bounds.max.z).to.closeTo(halfWidth, 0.01);

      // Move entity to (5, 3, 0) and update
      trailEntity.transform.position = new Vector3(5, 3, 0);

      // Bounds should encompass all points: (0,0,0), (5,0,0), (5,3,0)
      // min: (-1, -1, -1), max: (6, 4, 1)
      expect(trailRenderer.bounds.min.x).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.min.y).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.min.z).to.closeTo(-halfWidth, 0.01);
      expect(trailRenderer.bounds.max.x).to.closeTo(5 + halfWidth, 0.01);
      expect(trailRenderer.bounds.max.y).to.closeTo(3 + halfWidth, 0.01);
      expect(trailRenderer.bounds.max.z).to.closeTo(halfWidth, 0.01);

      // Test width change affects bounds
      trailRenderer.width = 4.0;
      const newHalfWidth = 2.0;
      trailEntity.transform.position = new Vector3(5, 4, 0);

      // Bounds with new halfWidth (2.0), encompass (0,0,0) to (5,4,0)
      // min: (-2, -2, -2), max: (7, 6, 2)
      expect(trailRenderer.bounds.min.x).to.closeTo(-newHalfWidth, 0.01);
      expect(trailRenderer.bounds.min.y).to.closeTo(-newHalfWidth, 0.01);
      expect(trailRenderer.bounds.min.z).to.closeTo(-newHalfWidth, 0.01);
      expect(trailRenderer.bounds.max.x).to.closeTo(5 + newHalfWidth, 0.01);
      expect(trailRenderer.bounds.max.y).to.closeTo(4 + newHalfWidth, 0.01);
      expect(trailRenderer.bounds.max.z).to.closeTo(newHalfWidth, 0.01);
    });
  });

  describe("TrailMaterial", () => {
    it("Constructor", () => {
      const material = new TrailMaterial(engine);

      expect(material instanceof TrailMaterial).to.eq(true);
      expect(material.destroyed).to.eq(false);
    });

    it("set baseColor", () => {
      const material = new TrailMaterial(engine);
      const color = new Color(1, 0, 0, 1);

      material.baseColor = color;
      expect(Color.equals(material.baseColor, color)).to.eq(true);
    });

    it("set blendMode", () => {
      const material = new TrailMaterial(engine);

      material.blendMode = BlendMode.Additive;
      expect(material.blendMode).to.eq(BlendMode.Additive);

      material.blendMode = BlendMode.Normal;
      expect(material.blendMode).to.eq(BlendMode.Normal);
    });

    it("clone", () => {
      const material = new TrailMaterial(engine);
      material.baseColor = new Color(1, 0, 0, 1);
      material.blendMode = BlendMode.Additive;

      const clonedMaterial = material.clone();

      expect(clonedMaterial instanceof TrailMaterial).to.eq(true);
      expect(clonedMaterial).not.to.eq(material);
      expect(Color.equals(clonedMaterial.baseColor, material.baseColor)).to.eq(true);
      expect(clonedMaterial.blendMode).to.eq(material.blendMode);
    });

    it("destroy", () => {
      const material = new TrailMaterial(engine);

      material.destroy();
      expect(material.destroyed).to.eq(true);
    });
  });

  describe("TrailTextureMode", () => {
    it("enum values", () => {
      expect(TrailTextureMode.Stretch).to.eq(0);
      expect(TrailTextureMode.Tile).to.eq(1);
    });
  });
});
