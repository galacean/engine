/**
 * @title Trail Renderer Basic
 * @category Trail
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  CurveKey,
  GradientAlphaKey,
  GradientColorKey,
  Logger,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleGradient,
  Script,
  Texture2D,
  TrailMaterial,
  TrailRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({
  canvas: "canvas"
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0.1, 0.1, 0.1, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.position = new Vector3(0, 5, 15);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  // Create trail entity
  const trailEntity = rootEntity.createChild("trail");
  trailEntity.transform.position = new Vector3(0, 0, 0);

  // Add TrailRenderer component
  const trail = trailEntity.addComponent(TrailRenderer);
  const material = new TrailMaterial(engine);
  material.blendMode = BlendMode.Additive;
  trail.setMaterial(material);
  trail.time = 2.0;
  trail.width = 0.5;
  trail.minVertexDistance = 0.2;

  // Setup width curve (taper from head to tail)
  trail.widthCurve = new ParticleCompositeCurve(
    new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 0))
  );

  // Setup color gradient (orange to blue with fade out)
  const gradient = new ParticleGradient(
    [
      new GradientColorKey(0, new Color(1, 0.5, 0, 1)),
      new GradientColorKey(0.5, new Color(1, 0, 0.5, 1)),
      new GradientColorKey(1, new Color(0, 0.5, 1, 1))
    ],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(0.7, 0.8), new GradientAlphaKey(1, 0)]
  );
  trail.colorGradient = gradient;

  // Add movement script
  class MoveScript extends Script {
    private _time = 0;
    private _radius = 4;
    private _speed = 2;
    private _verticalSpeed = 1.5;

    onUpdate(deltaTime: number): void {
      this._time += deltaTime;
      const t = this._time * this._speed;

      // Lissajous curve movement
      const x = Math.sin(t) * this._radius;
      const y = Math.sin(t * this._verticalSpeed) * 2;
      const z = Math.cos(t * 0.7) * this._radius;

      this.entity.transform.position.set(x, y, z);
    }
  }

  trailEntity.addComponent(MoveScript);

  // Load trail texture
  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*-DEWQZ0ncrEAAAAASTAAAAgAeil6AQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      // Set texture on trail material
      material.baseTexture = texture;

      // engine.run();

      // Run for e2e testing
      updateForE2E(engine, 50, 20);
      initScreenshot(engine, camera);
    });
});
