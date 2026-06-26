/**
 * @title Gaussian Splatting
 * @category Advance
 */
import {
  AssetType,
  Camera,
  Entity,
  GaussianSplat,
  GaussianSplatRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { Stats } from "@galacean/engine-toolkit-stats";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import * as dat from "dat.gui";

// Same captured scene is not available in all three formats, so each option is its own scene; the point is
// that .splat (no SH), .ply (Inria training output) and .spz (gzip v2/v3) all feed the same renderer.
const FORMATS: Record<string, string> = {
  "skull (.splat)": "https://mdn.alipayobjects.com/rms/afts/file/A*59VdRpKYJ7gAAAAAgFAAAAgAehQnAQ/gs_Skull.splat",
  "halo (.ply)": "https://mdn.alipayobjects.com/rms/afts/file/A*o8-hTq3fs7wAAAAAgSAAAAgAehQnAQ/Halo_Believe.ply",
  "lizard (.spz)": "https://mdn.alipayobjects.com/rms/afts/file/A*XCefRbxaXQ0AAAAAgRAAAAgAehQnAQ/hornedlizard.spz"
};

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  const control = cameraEntity.addComponent(OrbitControl);
  cameraEntity.addComponent(Stats);

  let splatEntity: Entity = null;
  let currentSplat: GaussianSplat = null;

  const loadFormat = async (url: string): Promise<void> => {
    splatEntity?.destroy();
    currentSplat?.destroy();
    const splat = await engine.resourceManager.load<GaussianSplat>({ url, type: AssetType.GaussianSplat });
    currentSplat = splat;

    splatEntity = rootEntity.createChild("splat");
    // .ply/.splat/.spz scenes are stored Y-down relative to Galacean's Y-up convention.
    splatEntity.transform.setScale(1, -1, 1);
    splatEntity.addComponent(GaussianSplatRenderer).splat = splat;

    // Frame the camera to the splat bounds (the Y flip maps local center.y to world -center.y).
    const center = splat.bounds.getCenter(new Vector3());
    const radius = Vector3.distance(splat.bounds.min, splat.bounds.max) * 0.5;
    control.target.set(center.x, -center.y, center.z);
    cameraEntity.transform.setPosition(center.x, -center.y, center.z + radius * 2.2);
    camera.farClipPlane = radius * 20;
  };

  const state = { format: "skull (.splat)" };
  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadFormat(FORMATS[key]));

  await loadFormat(FORMATS[state.format]);
  engine.run();
});
