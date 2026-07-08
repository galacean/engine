// Gaussian Splatting — one renderer ingests Marble SPZ, Inria .ply and .splat. The .ply and .spz carry
// view-dependent spherical-harmonic color; drag to orbit and watch reflections shift.
import {
  AssetType,
  Camera,
  Entity,
  GaussianSplat,
  GaussianSplatMaterial,
  GaussianSplatRenderer,
  MSAASamples,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

type FormatConfig = {
  url: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
};

const FORMATS: Record<string, FormatConfig> = {
  "skull (.spz)": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*Y2wZTYtEbP0AAAAAgCAAAAgAehQnAQ/gs_Skull.spz",
    cameraPosition: [-2.751, 1.661, 4.156],
    cameraTarget: [0.045, 0.098, 0.004]
  },
  "halo (.ply)": {
    url: "https://mdn.alipayobjects.com/rms/afts/file/A*o8-hTq3fs7wAAAAAgSAAAAgAehQnAQ/Halo_Believe.ply",
    cameraPosition: [0.164, 2.323, 5.582],
    cameraTarget: [0.18, -0.275, 0]
  }
};

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.msaaSamples = MSAASamples.None;
  const control = cameraEntity.addComponent(OrbitControl);

  let splatEntity: Entity | null = null;
  let currentSplat: GaussianSplat | null = null;
  let currentRenderer: GaussianSplatRenderer | null = null;

  const stats = { splats: 0, shDegree: 0, fps: 0, sortMs: 0 };
  const controls = { magic: true };

  const loadFormat = async (config: FormatConfig): Promise<void> => {
    currentRenderer = null;
    splatEntity?.destroy();
    currentSplat?.destroy();
    splatEntity = null;
    currentSplat = null;

    const splat = await engine.resourceManager.load<GaussianSplat>({
      url: config.url,
      type: AssetType.GaussianSplat
    });
    currentSplat = splat;

    splatEntity = rootEntity.createChild("splat");
    const renderer = splatEntity.addComponent(GaussianSplatRenderer);
    renderer.splat = splat;
    stats.splats = splat.splatCount;
    stats.shDegree = splat.shDegree;

    const material = renderer.getMaterial() as GaussianSplatMaterial;
    if (controls.magic) material.playMagic();

    const { min, max } = renderer.bounds;
    const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
    camera.farClipPlane = radius * 8;
    cameraEntity.transform.setPosition(...config.cameraPosition);
    control.target.set(...config.cameraTarget);
    currentRenderer = renderer;
  };

  const state = { format: "skull (.spz)" };
  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadFormat(FORMATS[key]));

  const info = gui.addFolder("Scene Info");
  const readonly = (ctrl: dat.GUIController) => {
    ctrl.domElement.style.pointerEvents = "none";
    ctrl.domElement.style.opacity = "0.8";
    return ctrl.listen();
  };
  readonly(info.add(stats, "splats"));
  readonly(info.add(stats, "shDegree"));
  readonly(info.add(stats, "fps"));
  readonly(info.add(stats, "sortMs"));
  info.open();

  gui.add(controls, "magic").onChange((on: boolean) => {
    const material = currentRenderer?.getMaterial() as GaussianSplatMaterial | undefined;
    if (!material) return;
    on ? material.playMagic() : material.stopMagic();
  });

  let lastFrame = performance.now();
  const tick = (): void => {
    const now = performance.now();
    stats.fps = +(0.9 * stats.fps + 0.1 * (1000 / Math.max(now - lastFrame, 1))).toFixed(1);
    lastFrame = now;
    stats.sortMs = currentRenderer ? +currentRenderer.lastSortTime.toFixed(2) : 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  await loadFormat(FORMATS[state.format]);
  engine.run();
});
