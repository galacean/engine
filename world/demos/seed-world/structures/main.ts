import {
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ShadowType,
  Vector3,
  WebGLEngine,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import {
  uploadRockFormationSurface,
  type RockFormationSurface
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/View";
import {
  createRockFormationMaterial,
  prepareRockTextures
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/RockMaterial";
import {
  ROCK_SHAPE_DEFAULTS,
  type RockFormationSettings
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { MOUNTAIN_DEFAULTS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/MountainSettings";
import { readRockColorBlend } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/ColorPalette";
import type { RockFormationJob, RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import "./style.css";

type Examples = {
  seed: number;
  candidateCount: number;
  minimumSeparation: number;
  examples: Array<{ index: number; seed: number }>;
};
type Entry = {
  entity: Entity;
  camera: Camera;
  label: HTMLElement;
  surface?: RockFormationSurface;
  formation?: RockFormationMesh;
};

/** A native Seed World inspection page. The same worker, publication mesh,
 * materials, corner normals and settings are used by the full world. */
export async function mountStructureGallery(): Promise<void> {
  document.title = "Seed World · Seeded structures";
  document.body.innerHTML = `<main id="structures">
    <header><h1>Seeded rock structures</h1><a href="../index.html?seed=498&template=original&debug=1&view=3d" id="world-link">Seed World</a></header>
    <div class="toolbar">
      <label>Set seed <input id="set-seed" aria-label="Set seed" type="number" min="0" max="4294967295" step="1" value="498"></label>
      <button id="generate">Generate 10</button><button id="next">Next seed</button>
      <label><input type="checkbox" id="arrangement" checked>Arrangement</label>
      <label><input type="checkbox" id="shaping" checked>Shaping / carving</label>
      <label>Finish <select id="finish" aria-label="Finish"><option value="clay">Clay</option><option value="textured">Atomic triplanar</option></select></label>
      <button id="overview" aria-pressed="true">All 10</button>
      <label>View <select id="view" aria-label="View"><option value="oblique">Oblique</option><option value="front">Front</option><option value="top">Top</option><option value="side">Side</option></select></label>
      <label>Height <input id="height" type="range" min="25" max="200" step="5" value="100"><output id="height-value">100%</output></label>
    </div>
    <details id="shaping-controls"><summary>Fracture controls</summary><div class="controls">
      <label>Depth <output id="depth-value">70%</output><input id="depth" aria-label="Fracture depth" type="range" min="0" max="200" step="10" value="70"></label>
      <label>Width <output id="width-value">190%</output><input id="width" aria-label="Fracture width" type="range" min="0" max="200" step="10" value="190"></label>
      <label>Irregularity <output id="irregularity-value">180%</output><input id="irregularity" aria-label="Fracture irregularity" type="range" min="0" max="200" step="10" value="180"></label>
      <label>Normal smoothing <output id="smoothing-value">100%</output><input id="smoothing" aria-label="Normal smoothing" type="range" min="0" max="100" step="5" value="100"></label>
    </div></details>
    <p id="status" role="status" aria-live="polite">Generating ten different structures…</p>
    <div id="viewport"><canvas id="structures-canvas" aria-label="Ten procedurally generated rock structures"></canvas><div id="labels"></div></div>
    <p class="hint">Drag to orbit all views. Select an example to inspect it. The same seed reproduces the same ten structures.</p>
  </main>`;
  const root = document.getElementById("structures")!;
  const input = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)!;
  const select = (id: string) => root.querySelector<HTMLSelectElement>(`#${id}`)!;
  const status = root.querySelector<HTMLElement>("#status")!,
    viewport = root.querySelector<HTMLElement>("#viewport")!,
    labels = root.querySelector<HTMLElement>("#labels")!;
  const initial = new URL(location.href).searchParams.get("seed");
  if (initial !== null && Number.isInteger(Number(initial))) input("set-seed").value = String(Number(initial) >>> 0);
  const worldUrl = new URL("../index.html", import.meta.url);
  worldUrl.search = "?template=original&debug=1&view=3d";
  worldUrl.searchParams.set("seed", input("set-seed").value);
  (root.querySelector("#world-link") as HTMLAnchorElement).href = worldUrl.href;
  const abort = new AbortController(),
    client = new RockFormationClient(),
    selector = new Worker(new URL("./Examples.worker.ts", import.meta.url), { type: "module" });
  let sequence = 0,
    selectionSequence = 0,
    disposed = false,
    busy = false,
    pending = false,
    selected = -1,
    yaw = 0.6,
    pitch = 0.48,
    examples: Examples | undefined;
  let generationAbort: AbortController | undefined;
  const selectionJobs = new Map<number, { resolve(result: Examples): void; reject(error: unknown): void }>();
  selector.onmessage = ({ data }) => {
    const job = selectionJobs.get(data.id);
    if (!job) return;
    selectionJobs.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.result);
  };
  selector.onerror = (event) => {
    for (const job of selectionJobs.values()) job.reject(new Error(event.message));
    selectionJobs.clear();
  };
  const choose = (seed: number) =>
    new Promise<Examples>((resolve, reject) => {
      const id = ++selectionSequence;
      selectionJobs.set(id, { resolve, reject });
      selector.postMessage({ id, seed });
    });
  let engine: WebGLEngine;
  try {
    engine = await WebGLEngine.create({ canvas: "structures-canvas", shaderCompiler: new ShaderCompiler() });
  } catch (error) {
    status.textContent = String(error);
    status.setAttribute("role", "alert");
    selector.terminate();
    client.dispose();
    return;
  }
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!,
    sceneRoot = scene.createRootEntity("Seeded structure examples");
  scene.background.solidColor = new Color(0.015, 0.02, 0.025, 1);
  scene.ambientLight.diffuseSolidColor = new Color(0.72, 0.76, 0.82, 1);
  scene.ambientLight.diffuseIntensity = 0.45;
  const sun = sceneRoot.createChild("Key light");
  sun.transform.setRotation(-48, -35, 0);
  const light = sun.addComponent(DirectLight);
  light.color = new Color(1.15, 1.15, 1.15, 1);
  light.shadowType = ShadowType.SoftLow;
  const fill = sceneRoot.createChild("Fill light");
  fill.transform.setRotation(-25, 145, 0);
  fill.addComponent(DirectLight).color = new Color(0.25, 0.25, 0.25, 1);
  const clay = new PBRMaterial(engine);
  clay.baseColor = new Color(0.45, 0.47, 0.48, 1);
  clay.roughness = 0.9;
  clay.metallic = 0;
  const groundMaterial = new PBRMaterial(engine);
  groundMaterial.baseColor = new Color(0.055, 0.07, 0.08, 1);
  groundMaterial.roughness = 1;
  const floor = PrimitiveMesh.createPlane(engine, 112, 92);
  let textured: PBRMaterial | undefined;
  const textureReady = prepareRockTextures(engine, abort.signal).then(() => {
    if (disposed) return;
    textured = createRockFormationMaterial(engine, 0);
    textured.shaderData.setFloat("material_WorldGrassEnable", 0);
    finish();
  });
  const entries: Entry[] = Array.from({ length: 10 }, (_, i) => {
    const entity = sceneRoot.createChild(`Example ${i + 1}`);
    entity.transform.setPosition(i * 350, 0, 0);
    const floorEntity = sceneRoot.createChild(`Ground ${i + 1}`);
    floorEntity.transform.setPosition(i * 350, -0.25, 0);
    const renderer = floorEntity.addComponent(MeshRenderer);
    renderer.mesh = floor;
    renderer.setMaterial(groundMaterial);
    renderer.receiveShadows = true;
    const cameraEntity = sceneRoot.createChild(`Camera ${i + 1}`),
      camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.nearClipPlane = 0.1;
    camera.farClipPlane = 320;
    camera.orthographicSize = 54;
    camera.priority = i;
    const label = document.createElement("div");
    label.className = "sample";
    label.innerHTML = `<button aria-label="Inspect example ${i + 1}"><span>${String(i + 1).padStart(2, "0")}</span><small>Generating…</small></button><small class="stats"></small>`;
    label.querySelector("button")!.addEventListener("click", () => {
      selected = i;
      layout();
    });
    labels.append(label);
    return { entity, camera, label };
  });
  function cameras() {
    const height = Number(input("height").value) / 100;
    viewport.dataset.cameraYaw = String(yaw);
    viewport.dataset.cameraPitch = String(pitch);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i],
        target = new Vector3(i * 350, 22 * height, 0),
        distance = 185;
      e.entity.transform.setScale(1, height, 1);
      e.camera.entity.transform.setPosition(
        target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(yaw) * Math.cos(pitch) * distance
      );
      e.camera.entity.transform.lookAt(target);
      const aspect = e.camera.aspectRatio;
      e.camera.orthographicSize = Math.max(48 * height, 62 / Math.max(0.5, aspect));
    }
  }
  function layout() {
    const width = viewport.clientWidth,
      columns = selected < 0 ? (width >= 1400 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2) : 1,
      rows = selected < 0 ? Math.ceil(10 / columns) : 1;
    viewport.style.height = `${selected < 0 ? rows * 280 : Math.max(400, Math.min(720, width * 0.65))}px`;
    labels.style.gridTemplateColumns = `repeat(${columns},1fr)`;
    labels.style.gridTemplateRows = `repeat(${rows},1fr)`;
    for (let i = 0; i < entries.length; i++) {
      const active = selected < 0 || i === selected,
        e = entries[i];
      e.camera.enabled = active;
      e.label.classList.toggle("hidden", !active);
      e.camera.viewport.set(
        selected < 0 ? (i % columns) / columns : 0,
        selected < 0 ? Math.floor(i / columns) / rows : 0,
        1 / columns,
        1 / rows
      );
      if (selected >= 0) e.camera.viewport.set(0, 0, 1, 1);
      e.label.querySelector("button")!.setAttribute("aria-pressed", String(selected === i));
    }
    root.querySelector("#overview")!.setAttribute("aria-pressed", String(selected < 0));
    cameras();
  }
  function finish() {
    for (const e of entries)
      e.surface?.renderer.setMaterial(select("finish").value === "textured" && textured ? textured : clay);
  }
  function release(e: Entry) {
    e.surface?.renderer.destroy();
    e.surface?.mesh.destroy();
    e.surface?.buffer.destroy();
    e.surface = undefined;
  }
  function settings(): RockFormationSettings {
    return {
      shape: { ...ROCK_SHAPE_DEFAULTS },
      variation: 0.65,
      targetTriangles: 1000,
      textureScale: 0,
      colorBlend: readRockColorBlend(),
      mountain: {
        ...MOUNTAIN_DEFAULTS,
        ridgeArrangement: input("arrangement").checked,
        seededShapes: true,
        rockShaping: input("shaping").checked,
        fractureDepth: Number(input("depth").value) / 100,
        fractureWidth: Number(input("width").value) / 100,
        fractureIrregularity: Number(input("irregularity").value) / 100,
        fractureSmoothing: Number(input("smoothing").value) / 100
      }
    };
  }
  async function generate() {
    sequence++;
    pending = true;
    if (busy) return;
    busy = true;
    while (pending && !disposed) {
      pending = false;
      const request = sequence,
        seed = Number(input("set-seed").value) >>> 0,
        configuration = settings();
      generationAbort = new AbortController();
      status.removeAttribute("role");
      status.setAttribute("role", "status");
      viewport.setAttribute("aria-busy", "true");
      try {
        if (examples?.seed !== seed) {
          status.textContent = "Growing and comparing seeded shapes…";
          const next = await choose(seed);
          if (request !== sequence) continue;
          examples = next;
        }
        status.textContent = "Building the ten rock structures…";
        const jobs: RockFormationJob[] = examples.examples.map((e) => ({
          id: `example-${e.index}`,
          kind: "mountain",
          seed: e.seed,
          worldSeed: seed,
          surfaceGrass: false,
          origin: [0, 0, 0],
          guides: [
            {
              id: `example-${e.index}-box`,
              ownerId: `example-${e.index}`,
              center: [0, 30, 0],
              size: [96, 60, 80],
              axes: [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1]
              ]
            }
          ]
        }));
        const result = await client.prepareJobs(jobs, configuration, generationAbort.signal);
        if (request !== sequence || disposed) continue;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          release(e);
          e.formation = result[i];
          e.surface = uploadRockFormationSurface(engine, e.entity, result[i], clay);
          e.label.dataset.seed = String(examples.examples[i].seed);
          e.label.querySelector("button small")!.textContent = `Seed ${examples.examples[i].seed}`;
          const count = result[i].stats.bodies;
          e.label.querySelector(".stats")!.textContent = `${count} ${count === 1 ? "mass" : "masses"}`;
        }
        finish();
        cameras();
        viewport.dataset.setSeed = String(seed);
        viewport.dataset.exampleCount = "10";
        status.textContent = `10 generated structures · Set ${seed} · ${configuration.mountain!.ridgeArrangement ? "Arrangement on" : "Arrangement off"} · ${configuration.mountain!.rockShaping ? "Carving on" : "Carving off"}`;
        const url = new URL(location.href);
        url.searchParams.set("seed", String(seed));
        history.replaceState(null, "", url);
        worldUrl.searchParams.set("seed", String(seed));
        (root.querySelector("#world-link") as HTMLAnchorElement).href = worldUrl.href;
      } catch (error) {
        if (!disposed) {
          status.textContent = `Generation failed: ${String(error)}`;
          status.setAttribute("role", "alert");
        }
      } finally {
        viewport.setAttribute("aria-busy", "false");
      }
    }
    busy = false;
  }
  for (const id of ["depth", "width", "irregularity", "smoothing", "height"]) {
    input(id).addEventListener("input", () => {
      root.querySelector(`#${id}-value`)!.textContent = input(id).value + "%";
      if (id === "height") cameras();
    });
    if (id !== "height") input(id).addEventListener("change", () => void generate());
  }
  input("shaping").addEventListener("change", () => {
    root.querySelector<HTMLElement>("#shaping-controls")!.hidden = !input("shaping").checked;
    void generate();
  });
  input("arrangement").addEventListener("change", () => void generate());
  root.querySelector("#generate")!.addEventListener("click", () => void generate());
  root.querySelector("#next")!.addEventListener("click", () => {
    input("set-seed").value = String((Number(input("set-seed").value) + 1) >>> 0);
    void generate();
  });
  root.querySelector("#overview")!.addEventListener("click", () => {
    selected = -1;
    layout();
  });
  select("finish").addEventListener("change", finish);
  select("view").addEventListener("change", () => {
    const view = select("view").value;
    [yaw, pitch] =
      view === "top"
        ? [0, Math.PI / 2 - 0.001]
        : view === "front"
          ? [0, 0.03]
          : view === "side"
            ? [Math.PI / 2, 0.03]
            : [0.6, 0.48];
    cameras();
  });
  let pointer: { id: number; x: number; y: number } | undefined;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      end();
      return;
    }
    yaw -= (event.clientX - pointer.x) * 0.008;
    pitch = Math.max(0.015, Math.min(1.56, pitch + (event.clientY - pointer.y) * 0.006));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    cameras();
  });
  const end = () => {
    const id = pointer?.id;
    pointer = undefined;
    if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  // Release also outside the canvas or after capture loss. A mouse move over a
  // toolbar button must never be interpreted as the tail of an earlier drag.
  window.addEventListener("pointerup", end, { signal: abort.signal });
  window.addEventListener("pointercancel", end, { signal: abort.signal });
  window.addEventListener("blur", end, { signal: abort.signal });
  viewport.addEventListener("lostpointercapture", end);
  const observer = new ResizeObserver(layout);
  observer.observe(viewport);
  layout();
  engine.run();
  void textureReady.catch((error) => {
    if (!disposed) {
      status.textContent = `Texture unavailable: ${String(error)}`;
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      abort.abort();
      generationAbort?.abort();
      client.dispose();
      selector.terminate();
      observer.disconnect();
      for (const job of selectionJobs.values()) job.reject(new Error("Preview closed"));
      selectionJobs.clear();
      for (const e of entries) release(e);
      sceneRoot.destroy();
      clay.destroy();
      textured?.destroy();
      groundMaterial.destroy();
      floor.destroy();
      engine.pause();
    },
    { once: true }
  );
  await generate();
}
