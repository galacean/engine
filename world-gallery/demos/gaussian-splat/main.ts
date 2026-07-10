// Gaussian Splatting demo. Configs with multiple URLs render side-by-side under a shared orbit for
// per-format comparison.
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

  const style = document.createElement("style");
  style.textContent =
    "@keyframes gsBlink{50%{opacity:0.15}}" +
    ".gs-dots span{animation:gsBlink 1.2s infinite;display:inline-block}" +
    ".gs-dots span:nth-child(2){animation-delay:0.2s}" +
    ".gs-dots span:nth-child(3){animation-delay:0.4s}";
  document.head.appendChild(style);

  const sharedMaterial = new GaussianSplatMaterial(engine);
  const renderers: GaussianSplatRenderer[] = [];
  const cleanup: Entity[] = [];

  const clearScene = (): void => {
    for (const e of cleanup) e.destroy();
    cleanup.length = 0;
    renderers.length = 0;
    overlay.innerHTML = "";
  };

  let loadToken = 0;

  const loadingCell = (fmt: string): string =>
    `<div>${fmt}</div>` +
    `<div class="size">—</div>` +
    `<div>loading<span class="gs-dots"><span>.</span><span>.</span><span>.</span></span></div>`;

  const loadConfig = async (config: SplatConfig): Promise<void> => {
    const token = ++loadToken;
    clearScene();
    const N = config.urls.length;

    // Primary camera created upfront so child cameras can attach regardless of load order.
    const primaryCamEntity = rootEntity.createChild("camera-0");
    const primaryCam = primaryCamEntity.addComponent(Camera);
    primaryCam.msaaSamples = MSAASamples.None;
    primaryCam.viewport = new Vector4(0, 0, 1 / N, 1);
    primaryCam.cullingMask = LAYERS[0];
    cleanup.push(primaryCamEntity);

    // Reserve overlay cells in URL order so late arrivals don't reshuffle the layout.
    const cells: HTMLDivElement[] = [];
    for (let i = 0; i < N; i++) {
      const cell = document.createElement("div");
      cell.style.cssText = "flex:1;text-align:center;line-height:1.5";
      cell.innerHTML = loadingCell(formatOf(config.urls[i]));
      overlay.appendChild(cell);
      cells.push(cell);
    }

    let camConfigured = false;

    const setup = async (i: number, url: string): Promise<void> => {
      // HEAD races the main fetch — its size fills the cell early so the user sees why we're waiting.
      const bytesPromise = fetchByteSize(url).then((b) => {
        if (token === loadToken) {
          const sizeEl = cells[i].querySelector(".size");
          if (sizeEl) sizeEl.textContent = humanSize(b);
        }
        return b;
      });

      const splat = await engine.resourceManager.load<GaussianSplat>({ url, type: AssetType.GaussianSplat });
      if (token !== loadToken) return;
      const bytes = await bytesPromise;
      if (token !== loadToken) return;

      const layer = LAYERS[i];
      const splatEntity = rootEntity.createChild(`splat-${i}`);
      splatEntity.layer = layer;
      const renderer = splatEntity.addComponent(GaussianSplatRenderer);
      renderer.setMaterial(sharedMaterial);
      renderer.splat = splat;
      renderer.useSH = state.useSH;
      renderer.playMagic();
      renderers.push(renderer);
      cleanup.push(splatEntity);

      let camera: Camera;
      if (i === 0) {
        camera = primaryCam;
      } else {
        const cameraEntity = primaryCamEntity.createChild(`camera-${i}`);
        camera = cameraEntity.addComponent(Camera);
        camera.msaaSamples = MSAASamples.None;
        camera.viewport = new Vector4(i / N, 0, 1 / N, 1);
        camera.cullingMask = layer;
      }
      const { min, max } = renderer.bounds;
      const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
      camera.farClipPlane = radius * 8;

      // First arrival positions the shared orbit — the config's URLs render the same asset so bounds agree.
      if (!camConfigured) {
        const cx = (min.x + max.x) * 0.5;
        const cy = (min.y + max.y) * 0.5;
        const cz = (min.z + max.z) * 0.5;
        primaryCamEntity.transform.setPosition(cx - radius * 0.6, cy + radius * 0.7, cz - radius * 3);
        const orbit = primaryCamEntity.addComponent(OrbitControl);
        orbit.target.set(cx, cy, cz);
        camConfigured = true;
      }

      const bytesPerSplat = bytes ? (bytes / splat.splatCount).toFixed(0) : "?";
      cells[i].innerHTML =
        `<div>${formatOf(url)} · SH${splat.shDegree}</div>` +
        `<div>${splat.splatCount.toLocaleString()} splats</div>` +
        `<div>文件 ${humanSize(bytes)} · ${bytesPerSplat} B/splat</div>`;
    };

    await Promise.all(config.urls.map((url, i) => setup(i, url)));
  };

  const state = {
    format: "skull (.spz)",
    useSH: true,
    playMagic: () => renderers.forEach((r) => r.playMagic())
  };
  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadConfig(FORMATS[key]));
  gui
    .add(state, "useSH")
    .name("use SH")
    .onChange((v: boolean) => renderers.forEach((r) => (r.useSH = v)));
  gui.add(state, "playMagic").name("play magic");

  await loadConfig(FORMATS[state.format]);
  engine.run();
});
