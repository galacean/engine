// Gaussian Splatting demo — one config = one asset in one or more formats. When a config lists multiple URLs
// (e.g. cat.ply / cat.spz / cat.splat), each renders in its own viewport slice on the same canvas so the
// per-format quality and SH degree can be compared side-by-side under a shared orbit.
import {
  AssetType,
  Camera,
  Entity,
  GaussianSplat,
  GaussianSplatMaterial,
  GaussianSplatRenderer,
  Layer,
  MSAASamples,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

type SplatConfig = { urls: string[] };

const FORMATS: Record<string, SplatConfig> = {
  cat: {
    urls: [
      "https://mdn.alipayobjects.com/rms/afts/file/A*uah0RovP84IAAAAAgxAAAAgAehQnAQ/cat.ply",
      "https://mdn.alipayobjects.com/rms/afts/file/A*x8tvSYGs_moAAAAAgDAAAAgAehQnAQ/cat.spz",
      "https://mdn.alipayobjects.com/rms/afts/file/A*gnFMQJ1iIWMAAAAAgGAAAAgAehQnAQ/cat.splat"
    ]
  },
  "skull (.spz)": {
    urls: ["https://mdn.alipayobjects.com/rms/afts/file/A*Y2wZTYtEbP0AAAAAgCAAAAgAehQnAQ/gs_Skull.spz"]
  }
};

// One Layer bit per viewport slot so each camera's cullingMask picks out exactly its assigned splat entity.
const LAYERS = [Layer.Layer0, Layer.Layer1, Layer.Layer2, Layer.Layer3];

const formatOf = (url: string): string => (url.match(/\.(ply|spz|splat)(?:\?|$)/i)?.[1] ?? "gs").toUpperCase();

const fetchByteSize = async (url: string): Promise<number> => {
  const res = await fetch(url, { method: "HEAD" });
  return Number(res.headers.get("content-length") ?? 0);
};

const humanSize = (bytes: number): string =>
  bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;bottom:20px;left:0;right:0;display:flex;pointer-events:none;color:#fff;" +
    "font-family:monospace;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,0.9)";
  document.body.appendChild(overlay);

  const materials: GaussianSplatMaterial[] = [];
  const renderers: GaussianSplatRenderer[] = [];
  const cleanup: Entity[] = [];

  const clearScene = (): void => {
    for (const e of cleanup) e.destroy();
    cleanup.length = 0;
    materials.length = 0;
    renderers.length = 0;
    overlay.innerHTML = "";
  };

  const loadConfig = async (config: SplatConfig): Promise<void> => {
    clearScene();
    const N = config.urls.length;
    let primaryCamEntity: Entity | null = null;

    for (let i = 0; i < N; i++) {
      const url = config.urls[i];
      const layer = LAYERS[i];

      const splat = await engine.resourceManager.load<GaussianSplat>({ url, type: AssetType.GaussianSplat });

      const splatEntity = rootEntity.createChild(`splat-${i}`);
      splatEntity.layer = layer;
      const renderer = splatEntity.addComponent(GaussianSplatRenderer);
      renderer.splat = splat;
      renderer.useSH = state.useSH;
      renderers.push(renderer);
      cleanup.push(splatEntity);

      const material = renderer.getMaterial() as GaussianSplatMaterial;
      materials.push(material);
      material.playMagic();

      // First camera is the OrbitControl anchor; the rest are its children with local (0,0,0), so all
      // viewports share the same world transform and rotate together under a single mouse orbit.
      const camParent = primaryCamEntity ?? rootEntity;
      const cameraEntity = camParent.createChild(`camera-${i}`);
      const camera = cameraEntity.addComponent(Camera);
      camera.msaaSamples = MSAASamples.None;
      camera.viewport = new Vector4(i / N, 0, 1 / N, 1);
      camera.cullingMask = layer;
      const { min, max } = renderer.bounds;
      const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
      camera.farClipPlane = radius * 8;

      if (i === 0) {
        const cx = (min.x + max.x) * 0.5;
        const cy = (min.y + max.y) * 0.5;
        const cz = (min.z + max.z) * 0.5;
        // Camera on -Z side so the model faces the viewer (asset conventions vary — this matches cat/skull).
        cameraEntity.transform.setPosition(cx - radius * 0.6, cy + radius * 0.7, cz - radius * 3);
        const orbit = cameraEntity.addComponent(OrbitControl);
        orbit.target.set(cx, cy, cz);
        primaryCamEntity = cameraEntity;
        cleanup.push(cameraEntity);
      }

      const bytes = await fetchByteSize(url);
      const bytesPerSplat = bytes ? (bytes / splat.splatCount).toFixed(0) : "?";
      const cell = document.createElement("div");
      cell.style.cssText = "flex:1;text-align:center;line-height:1.5";
      cell.innerHTML =
        `<div>${formatOf(url)} · SH${splat.shDegree}</div>` +
        `<div>${splat.splatCount.toLocaleString()} splats</div>` +
        `<div>文件 ${humanSize(bytes)} · ${bytesPerSplat} B/splat</div>`;
      overlay.appendChild(cell);
    }
  };

  const state = {
    format: "cat",
    useSH: true,
    playMagic: () => materials.forEach((m) => m.playMagic())
  };
  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadConfig(FORMATS[key]));
  gui.add(state, "useSH")
    .name("use SH")
    .onChange((v: boolean) => renderers.forEach((r) => (r.useSH = v)));
  gui.add(state, "playMagic").name("play magic");

  await loadConfig(FORMATS[state.format]);
  engine.run();
});
