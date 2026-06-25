/**
 * @title Gaussian Splatting
 * @category Advance
 */
import {
  AssetType,
  Camera,
  GaussianSplat,
  GaussianSplatRenderer,
  Script,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

class Rotate extends Script {
  onUpdate(deltaTime: number): void {
    this.entity.transform.rotate(0, deltaTime * 30, 0);
  }
}

// The Gaussian Splat shader is authored in ShaderLab, so the compiler must be enabled.
WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);

  // Swap to a .ply to exercise the other parser; both feed the same renderer.
  const splat = await engine.resourceManager.load<GaussianSplat>({
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*59VdRpKYJ7gAAAAAgFAAAAgAehQnAQ/gs_Skull.splat",
    type: AssetType.GaussianSplat
  });

  const splatEntity = rootEntity.createChild("splat");
  // .ply/.splat scenes are stored Y-down relative to Galacean's Y-up convention.
  splatEntity.transform.setScale(1, -1, 1);
  splatEntity.addComponent(GaussianSplatRenderer).splat = splat;
  splatEntity.addComponent(Rotate);

  // Frame the camera to the splat bounds (the Y flip maps local center.y to world -center.y).
  const bounds = splat.bounds;
  const center = bounds.getCenter(new Vector3());
  const radius = Vector3.distance(bounds.min, bounds.max) * 0.5;
  const target = new Vector3(center.x, -center.y, center.z);
  cameraEntity.transform.setPosition(target.x, target.y, target.z + radius * 2.2);
  cameraEntity.transform.lookAt(target);
  camera.farClipPlane = radius * 20;

  engine.run();
});
