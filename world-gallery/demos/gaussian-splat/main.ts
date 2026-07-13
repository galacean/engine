// Gaussian Splatting demo. Configs with multiple URLs render side-by-side under a shared camera for
// per-format comparison. Camera exposes both orbit and free-fly modes via engine-toolkit-controls.
import {
  AssetType,
  Camera,
  Entity,
  GaussianSplat,
  GaussianSplatMaterial,
  GaussianSplatRenderer,
  Layer,
  MSAASamples,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { FreeControl, OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

type ControlMode = "orbit" | "free";

/**
 * Per-scene view. Every value is explicit — no auto-fit from bounds — because scan orientation, floor
 * height, and preferred stance vary too much across assets to guess reliably.
 */
type SplatConfig = {
  urls: string[];
  /** Control mode this scene starts in and reverts to when the user re-selects it in the format dropdown. */
  control: ControlMode;
  /** Orbit target and free-mode lookAt fallback. */
  target: [number, number, number];
  /** Initial camera world position. */
  cameraPosition: [number, number, number];
  /** Free-mode gaze target; defaults to `target`. */
  freeLookAt?: [number, number, number];
  /** Free-mode movement speed (m/s). */
  freeSpeed?: number;
};

const FORMATS: Record<string, SplatConfig> = {
  "skull (.spz)": {
    urls: ["https://mdn.alipayobjects.com/rms/afts/file/A*Y2wZTYtEbP0AAAAAgCAAAAgAehQnAQ/gs_Skull.spz"],
    control: "orbit",
    target: [0, 0, 0],
    cameraPosition: [-3.49, 1.05, 1.24],
    freeLookAt: [-0.77, 0.23, 0.28],
    freeSpeed: 2
  },
  compare_format: {
    urls: [
      "https://mdn.alipayobjects.com/rms/afts/file/A*uah0RovP84IAAAAAgxAAAAgAehQnAQ/cat.ply",
      "https://mdn.alipayobjects.com/rms/afts/file/A*x8tvSYGs_moAAAAAgDAAAAgAehQnAQ/cat.spz",
      "https://mdn.alipayobjects.com/rms/afts/file/A*gnFMQJ1iIWMAAAAAgGAAAAgAehQnAQ/cat.splat"
    ],
    control: "orbit",
    target: [-0.11, 1.15, 0.22],
    cameraPosition: [2.47, 2.63, -8.5],
    freeLookAt: [1.63, 2.15, -5.66],
    freeSpeed: 2
  },
  "Marketplace Street (.spz)": {
    urls: [
      "https://mdn.alipayobjects.com/rms/afts/file/A*rhp7S5ZiuEsAAAAAgbAAAAgAehQnAQ/Bustling%20Ancient%20Marketplace%20Street.spz"
    ],
    control: "free",
    target: [-1.02, 1.63, -3.5],
    cameraPosition: [-0.94, 1.57, -0.5],
    freeLookAt: [-1.02, 1.63, -3.5],
    freeSpeed: 2
  },
  "bedroom (.spz)": {
    urls: [
      "https://mdn.alipayobjects.com/rms/afts/file/A*PdQqQotWDMoAAAAAgaAAAAgAehQnAQ/Cozy%20Sunlit%20Study%20Bedroom.spz"
    ],
    control: "free",
    target: [0.02, 1.16, 1.42],
    cameraPosition: [0.17, 1.18, -1.57],
    freeLookAt: [0.02, 1.16, 1.42],
    freeSpeed: 1
  },
  "1-image-generate (.spz)": {
    urls: [
      "https://mdn.alipayobjects.com/rms/afts/file/A*do11S4suNwEAAAAAgbAAAAgAehQnAQ/Werewolf-themed%20Game%20Room.spz"
    ],
    control: "free",
    target: [0.45, 1.23, -2.3],
    cameraPosition: [0.71, 1.24, 0.69],
    freeLookAt: [0.45, 1.23, -2.3],
    freeSpeed: 1
  }
};

const LAYERS = [Layer.Layer0, Layer.Layer1, Layer.Layer2, Layer.Layer3];
const _tempExtent = new Vector3();
const _tempLookAt = new Vector3();

const formatOf = (url: string): string => (url.match(/\.(ply|spz|splat)(?:\?|$)/i)?.[1] ?? "gs").toUpperCase();

async function fetchByteSize(url: string): Promise<number> {
  const res = await fetch(url, { method: "HEAD" });
  return Number(res.headers.get("content-length") ?? 0);
}

function humanSize(bytes: number): string {
  return bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function loadingCellHtml(fmt: string): string {
  return (
    `<div>${fmt}</div>` +
    `<div class="size">—</div>` +
    `<div>loading<span class="gs-dots"><span>.</span><span>.</span><span>.</span></span></div>`
  );
}

/** Attach a Camera to `entity` with the i-th horizontal viewport slice (of N) and the matching layer. */
function attachViewportCamera(entity: Entity, i: number, N: number, layer: Layer, farClip: number): Camera {
  const camera = entity.addComponent(Camera);
  camera.msaaSamples = MSAASamples.None;
  camera.viewport = new Vector4(i / N, 0, 1 / N, 1);
  camera.cullingMask = layer;
  camera.farClipPlane = farClip;
  return camera;
}

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");
  const overlay = document.getElementById("overlay") as HTMLDivElement;

  const sharedMaterial = new GaussianSplatMaterial(engine);
  const renderers: GaussianSplatRenderer[] = [];
  const cleanup: Entity[] = [];
  let loadToken = 0;

  // Runtime handles for the currently active viewport rig. Rebuilt on every loadConfig.
  const rig: {
    primary: Entity | null;
    target: Vector3;
    speed: number;
    control: OrbitControl | FreeControl | null;
  } = { primary: null, target: new Vector3(), speed: 1, control: null };

  function activateControl(mode: ControlMode): void {
    rig.control?.destroy();
    rig.control = null;
    if (!rig.primary) return;
    if (mode === "orbit") {
      const orbit = rig.primary.addComponent(OrbitControl);
      orbit.target.copyFrom(rig.target);
      rig.control = orbit;
    } else {
      const free = rig.primary.addComponent(FreeControl);
      free.movementSpeed = rig.speed;
      free.floorMock = false;
      rig.control = free;
    }
  }

  const clearScene = (): void => {
    for (const e of cleanup) e.destroy();
    cleanup.length = 0;
    renderers.length = 0;
    overlay.innerHTML = "";
    rig.primary = null;
    rig.control = null;
  };

  const loadConfig = async (config: SplatConfig): Promise<void> => {
    const token = ++loadToken;
    clearScene();
    const N = config.urls.length;

    // Snap state.control to the config's default so switching back to a small-object scene resets to orbit
    // even if the user last had free enabled elsewhere. Update GUI display after mutating.
    state.control = config.control;
    controlCtrl.updateDisplay();

    // Primary camera comes online immediately so out-of-order arrivals can hang off it, and gets its
    // authored pose right away — no black cell while the splat is still fetching.
    const primaryEntity = rootEntity.createChild("camera-0");
    const primaryCam = attachViewportCamera(primaryEntity, 0, N, LAYERS[0], 100);
    cleanup.push(primaryEntity);
    rig.primary = primaryEntity;
    rig.target.set(config.target[0], config.target[1], config.target[2]);
    rig.speed = config.freeSpeed ?? 1;
    primaryEntity.transform.setPosition(config.cameraPosition[0], config.cameraPosition[1], config.cameraPosition[2]);
    const lookAt = config.freeLookAt ?? config.target;
    primaryEntity.transform.lookAt(_tempLookAt.set(lookAt[0], lookAt[1], lookAt[2]));
    activateControl(config.control);

    const cells: HTMLDivElement[] = [];
    for (let i = 0; i < N; i++) {
      const cell = document.createElement("div");
      cell.innerHTML = loadingCellHtml(formatOf(config.urls[i]));
      overlay.appendChild(cell);
      cells.push(cell);
    }

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

      const farClip = renderer.bounds.getExtent(_tempExtent).length() * 4;
      const camera =
        i === 0 ? primaryCam : attachViewportCamera(primaryEntity.createChild(`camera-${i}`), i, N, layer, farClip);
      camera.farClipPlane = farClip;

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
    control: "orbit" as ControlMode,
    useSH: true,
    playMagic: () => renderers.forEach((r) => r.playMagic())
  };

  const gui = new dat.GUI();
  gui.add(state, "format", Object.keys(FORMATS)).onChange((key: string) => loadConfig(FORMATS[key]));
  const controlCtrl = gui
    .add(state, "control", ["orbit", "free"] as ControlMode[])
    .onChange((mode: ControlMode) => activateControl(mode));
  gui
    .add(state, "useSH")
    .name("use SH")
    .onChange((v: boolean) => renderers.forEach((r) => (r.useSH = v)));
  gui.add(state, "playMagic").name("play magic");

  await loadConfig(FORMATS[state.format]);
  engine.run();
});
