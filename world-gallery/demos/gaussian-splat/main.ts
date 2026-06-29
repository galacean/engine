// Gaussian Splatting — one renderer ingests Marble SPZ, Inria .ply and .splat. The .ply and .spz carry
// view-dependent spherical-harmonic color; drag to orbit and watch reflections shift.
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
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import * as dat from "dat.gui";

// skull is the light default; .ply/.spz carry higher-order SH and are much heavier — switch to them to see
// view-dependent color. `yDown` is the source axis convention: Inria .splat/.ply are Y-down, SPZ defaults to
// Y-up (RUB), so only the former are flipped into Galacean's Y-up world.
const FORMATS: Record<string, { url: string; yDown: boolean }> = {
  "skull (.splat)": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*59VdRpKYJ7gAAAAAgFAAAAgAehQnAQ/gs_Skull.splat",
    yDown: true
  },
  "halo (.ply)": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*o8-hTq3fs7wAAAAAgSAAAAgAehQnAQ/Halo_Believe.ply",
    yDown: true
  },
  "lizard (.spz)": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*XCefRbxaXQ0AAAAAgRAAAAgAehQnAQ/hornedlizard.spz",
    yDown: false
  }
};

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  const control = cameraEntity.addComponent(OrbitControl);

  let splatEntity: Entity = null;
  let currentSplat: GaussianSplat = null;

  const loadFormat = async (format: { url: string; yDown: boolean }): Promise<void> => {
    splatEntity?.destroy();
    currentSplat?.destroy();
    const splat = await engine.resourceManager.load<GaussianSplat>({ url: format.url, type: AssetType.GaussianSplat });
    currentSplat = splat;

    const yScale = format.yDown ? -1 : 1;
    splatEntity = rootEntity.createChild("splat");
    splatEntity.transform.setScale(1, yScale, 1);
    splatEntity.addComponent(GaussianSplatRenderer).splat = splat;

    // Frame the camera to the splat bounds (the Y scale maps local center.y to world yScale * center.y).
    const center = splat.bounds.getCenter(new Vector3());
    const radius = Vector3.distance(splat.bounds.min, splat.bounds.max) * 0.5;
    const wy = center.y * yScale;
    control.target.set(center.x, wy, center.z);
    cameraEntity.transform.setPosition(center.x, wy, center.z + radius * 2.2);
    camera.farClipPlane = radius * 20;
  };

  const state = { format: "skull (.splat)" };
  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadFormat(FORMATS[key]));

  await loadFormat(FORMATS[state.format]);
  engine.run();
});
