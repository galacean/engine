import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Entity,
  MeshRenderer,
  PBRMaterial,
  ParticleStopMode,
  PrimitiveMesh,
  Script,
  ShadowType,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { FarmingPropAnimationPlayer } from "@galacean/engine-farming/farming/presentation/props/FarmingPropAnimationPlayer";
import {
  FARMING_PROP_ANIMATIONS,
  type FarmingPropAnimationId as PropAnimationId
} from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { SoilVisualProvider } from "@galacean/engine-farming/farming/presentation/soil/SoilVisualProvider";
import type { SoilPreparation } from "@galacean/engine-farming/farming/domain/SoilCultivation";
import { SoilWorkPresenter } from "@galacean/engine-farming/farming/presentation/soil/SoilWorkPresenter";
import { WateringParticles } from "@galacean/engine-farming/farming/presentation/watering/WateringParticles";
import {
  WATERING_CONFIG as water,
  waterFlightSeconds
} from "@galacean/engine-farming/farming/presentation/watering/WateringConfig";

import { HarvestBasketPresenter } from "@galacean/engine-farming/farming/presentation/harvest/HarvestBasketPresenter";
import { HarvestBasketPreview } from "@galacean/engine-farming/farming/presentation/harvest/HarvestBasketPreview";
import { FARM_CROP_CONTENT } from "@galacean/engine-farming/farming/content/CropContent";
type FarmingPropAnimationId = PropAnimationId | "harvest";
const isSoil = () => selected === "hoe" || selected === "rake";
const duration = (id: FarmingPropAnimationId) =>
  id === "harvest" ? harvest!.duration : FARMING_PROP_ANIMATIONS[id].duration;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const info = {
  watering: {
    title: "浇水",
    tool: "水壶",
    description: "从右侧抬壶，向左前方倾倒，保持出水后收壶。壶内水面与动作同步。",
    beats: [
      [0, "抬壶"],
      [0.35, "倾倒"],
      [0.55, "持续出水"],
      [1.5, "收壶"]
    ]
  },
  hoe: {
    title: "锄地",
    tool: "长柄锄头",
    description: "抬起锄头、加速落锄，刃口入土后向身前拉松，再抬离地面。连续两次落锄。",
    beats: [
      [0, "准备"],
      [0.3, "抬锄"],
      [0.98, "落锄与回拉"],
      [1.68, "再次抬锄"],
      [2.38, "第二次回拉"],
      [3.05, "复位"]
    ]
  },
  harvest: {
    title: "收获",
    tool: "手提篮",
    description: "篮子从左后方移入左前方；收获产物在篮内消融显现，跟随视角，60 秒无收获后自动收起。",
    beats: [
      [0, "唤出"],
      [0.6, "产物显现"],
      [2, "混装"],
      [9.6, "满篮替换"],
      [11.4, "收起"],
      [12.15, "空篮再次唤出"]
    ]
  },
  rake: {
    title: "耙地",
    tool: "硬齿耙",
    description: "前伸后让齿尖浅接触表土，长距离回拉碎土、整平；抬起后前伸复位。",
    beats: [
      [0, "前伸"],
      [0.58, "贴地回拉"],
      [1.56, "抬起前伸"],
      [2.3, "第二次回拉"],
      [3.28, "复位"]
    ]
  }
} as const;
let engine: WebGLEngine | undefined,
  player: FarmingPropAnimationPlayer | HarvestBasketPreview | undefined,
  camera: Camera,
  orbit: OrbitControl;
let propPlayer: FarmingPropAnimationPlayer, propRoot: Entity, harvest: HarvestBasketPreview;
let particles: WateringParticles | undefined, soil: SoilVisualProvider | undefined;
let work: SoilWorkPresenter | undefined;
let sequence = false;
let selected: FarmingPropAnimationId = "watering",
  generation = 0,
  disposed = false;
let emitted = 0,
  fraction = 0,
  clock = 0,
  nextImpact = 0;
let impacts: { at: number; point: Vector3 }[] = [];
const direction = new Vector3(),
  look = new Vector3();
const events = new AbortController();
const on = (id: string, event: string, handler: EventListener) =>
  $(id).addEventListener(event, handler, { signal: events.signal });

function clearWater(): void {
  impacts.length = 0;
  fraction = clock = nextImpact = emitted = 0;
  if (particles)
    for (const system of [particles.drops, particles.splash, particles.mist])
      system.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
}
function setView(): void {
  const view = $<HTMLSelectElement>("view").value;
  camera.fieldOfView = selected === "harvest" ? 65 : 43;
  orbit.enabled = view === "orbit";
  if (view === "first") {
    camera.entity.transform.setPosition(0, 1.58, 1.6);
    camera.entity.transform.lookAt(new Vector3(0, 0.18, -0.02));
  } else if (view === "side") {
    camera.entity.transform.setPosition(2.5, 1.1, 0.8);
    camera.entity.transform.lookAt(new Vector3(0, 0.6, 0.25));
  } else {
    camera.entity.transform.setPosition(2.8, 1.9, 2.7);
    orbit.target.set(0, 0.55, 0);
  }
  $("view-hint").textContent =
    selected === "harvest"
      ? "篮子固定在视角左前方 · 切换 / 转动视角可检查跟随"
      : view === "first"
        ? "第一人称 · 从身前观察工具与土地"
        : view === "side"
          ? "侧面检查 · 观察刃口和齿尖的触地位置"
          : "拖动旋转 · 滚轮缩放 · 右键平移";
}
function actionBeats(id: FarmingPropAnimationId): readonly (readonly [number, string])[] {
  return id === "harvest" && harvest.lifecycle
    ? [
        [0, "唤出"],
        [0.6, "产物显现"],
        [3, "刷新停留"],
        [60, "继续停留"],
        [63, "自动收起"],
        [65, "空篮再次唤出"],
        [67.45, "收起"]
      ]
    : info[id].beats;
}
function syncControls(): void {
  if (!player) return;
  const ready = player.ready;
  const state = work?.summary();
  const allowed = !isSoil() || Boolean(state?.target);
  for (const id of ["play", "restart", "progress"]) $<HTMLButtonElement>(id).disabled = !ready || !allowed;
  document.querySelectorAll<HTMLButtonElement>("#beats button").forEach((button) => {
    button.disabled = !ready || !allowed;
  });
  $("play").textContent = player.playing ? "暂停" : "播放";
  $<HTMLInputElement>("progress").value = String(player.elapsed);
  $("time").textContent =
    selected === "harvest" && harvest.live
      ? `连续测试 ${player.elapsed.toFixed(1)} 秒 · 拖动进度返回演示`
      : `${player.elapsed.toFixed(2)} / ${player.duration.toFixed(2)} 秒`;
  let phase: string = actionBeats(selected)[0][1];
  for (const [seconds, label] of actionBeats(selected)) if (player.elapsed >= seconds) phase = label;
  $("phase").textContent = phase;
  $<HTMLButtonElement>("sequence").disabled = !ready || sequence;
  $<HTMLButtonElement>("soil-reset").disabled = !ready;
  $<HTMLSelectElement>("soil-shape").disabled = !ready;
  $<HTMLInputElement>("moisture").disabled = !work;
  $<HTMLInputElement>("loop").disabled = sequence;
  $("sequence").textContent = sequence ? "开垦演示中…" : "开垦演示";
  if (selected === "harvest") {
    const basket = harvest.basket.snapshot();
    $("basket-state").textContent =
      `${{ hidden: "已收起", showing: "唤出中", held: "停留中", hiding: "收起中" }[basket.phase]} · ${basket.batches.length} 展示组 · 显式放下前持续携带`;
    if (harvest.live)
      $("phase").textContent = { hidden: "已收起", showing: "唤出中", held: "停留中", hiding: "收起中" }[basket.phase];
    $("basket-mode").textContent = harvest.live ? "连续收获测试 · 库存不变" : "时间轴演示 · 模拟成功收获";
  }
  if (state) {
    const names = { raw: "未开垦", leveled: "已整平" };
    $<HTMLSelectElement>("soil-shape").value = state.preparation;
    $("soil-state").textContent =
      `${names[state.preparation]} · ${state.canPlant ? "可种植" : "不可种植，请先锄地"}`;
    $("soil-state").dataset.plantable = String(state.canPlant);
    $("work-hint").textContent =
      selected === "rake" && !allowed
        ? "锄地直接整平，当前无需耙地。"
        : isSoil() && !state.completed && player.elapsed > 0
          ? "动作预览中 · 完整播放结束后保留土地状态"
          : "形态固定；湿度只改变土色，不改变形状。";
  }
}
async function select(id: FarmingPropAnimationId, autoplay = false): Promise<void> {
  const request = ++generation;
  selected = id;
  document.body.dataset.previewAnimation = id;
  propPlayer.playing = harvest.playing = false;
  propRoot.isActive = id !== "harvest";
  harvest.basket.reset();
  player = id === "harvest" ? harvest : propPlayer;
  setView();
  $("harvest-controls").hidden = id !== "harvest";
  document
    .querySelectorAll<HTMLElement>(".soil-settings,.soil-actions,#work-hint")
    .forEach((node) => (node.hidden = id === "harvest"));
  clearWater();
  work?.cancel();
  const item = info[id];
  $("stage-title").textContent = $("action-name").textContent = item.title;
  $("description").textContent = item.description;
  $("tool-name").textContent = item.tool;
  $("duration").textContent = `${duration(id).toFixed(1)} 秒`;
  $<HTMLInputElement>("progress").max = String(duration(id));
  $("particle-hint").textContent =
    id === "watering"
      ? "拖动进度查看姿态，播放时显示水流。"
      : id === "harvest"
        ? "选择作物模拟收获；只有新产物播放消融显现。"
        : "触地时松土 / 整平，结束后保留固定形态。";
  document
    .querySelectorAll<HTMLButtonElement>("[data-animation]")
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.animation === id)));
  $("beats").replaceChildren(
    ...actionBeats(id).map(([seconds, label]) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.dataset.seconds = String(seconds);
      return button;
    })
  );
  $("status").hidden = false;
  $("status").textContent = "正在加载动画…";
  const url = new URL(location.href);
  url.searchParams.set("animation", id);
  history.replaceState(null, "", url);
  try {
    const promise = id === "harvest" ? harvest.select() : propPlayer.select(id);
    syncControls();
    if (!(await promise) || disposed || request !== generation) return;
    if (id === "hoe" || id === "rake") work!.prepare(propPlayer, id);
    player!.loop = sequence ? false : $<HTMLInputElement>("loop").checked;
    if (autoplay && (id === "watering" || id === "harvest" || work!.summary().target)) player!.play();
    $("status").hidden = true;
    syncControls();
  } catch (error) {
    if (disposed || request !== generation) return;
    $("status").textContent = `加载失败：${error instanceof Error ? error.message : String(error)}。点击动作重试。`;
    syncControls();
    console.error(error);
  }
}
function updateWater(previous: number, dt: number): void {
  if (!particles || !player || selected !== "watering" || !player.ready) return;
  const advancing = player.playing || player.elapsed >= player.duration;
  for (const system of [particles.drops, particles.splash, particles.mist])
    system.generator.main.simulationSpeed = advancing ? player.speed : 0;
  if (!advancing) return;
  clock += dt * player.speed;
  const emission = Math.max(0, Math.min(player.elapsed, water.waterOff) - Math.max(previous, water.waterOn));
  const nozzle = player.entity?.findByName("WateringNozzle");
  if (emission > 0 && nozzle) {
    const origin = nozzle.transform.worldPosition;
    Vector3.transformNormal(direction.set(0, 1, 0), nozzle.transform.worldMatrix, direction);
    direction.normalize();
    const flight = waterFlightSeconds(origin.y, direction.y * water.speed);
    if (flight > 0 && direction.y < 0) {
      particles.drops.entity.transform.worldPosition = origin;
      Vector3.add(origin, direction, look);
      particles.drops.entity.transform.lookAt(look);
      particles.drops.generator.main.startLifetime.constant = flight;
      fraction += emission * water.dropsPerSecond;
      const count = Math.floor(fraction);
      fraction -= count;
      particles.drops.generator.emit(count);
      emitted += count;
      if (player.elapsed >= nextImpact) {
        nextImpact = player.elapsed + water.impactInterval;
        impacts.push({
          at: clock + flight,
          point: new Vector3(
            origin.x + direction.x * water.speed * flight,
            0.04,
            origin.z + direction.z * water.speed * flight
          )
        });
      }
    }
  }
  while (impacts.length && impacts[0].at <= clock) {
    const impact = impacts.shift()!;
    particles.splash.entity.transform.worldPosition = impact.point;
    particles.mist.entity.transform.worldPosition = impact.point;
    particles.splash.generator.emit(1);
    particles.mist.generator.emit(3);
  }
}
class PreviewTick extends Script {
  override onUpdate(dt: number): void {
    if (!player || disposed) return;
    const previous = player.elapsed;
    const wasPlaying = player.playing;
    const wrapped = player.update(dt);
    if (isSoil()) work?.seek(player.elapsed);
    if (wrapped) {
      clearWater();
      if (isSoil()) work?.finish();
    }
    updateWater(previous, dt);
    soil?.update(dt);
    syncControls();
    if (wasPlaying && !player.playing && player.elapsed >= player.duration && isSoil()) {
      work?.finish();
      if (sequence) {
        sequence = false;
        player.loop = $<HTMLInputElement>("loop").checked;
      }
      syncControls();
    }
  }
}
function dispose(): void {
  if (disposed) return;
  disposed = true;
  generation++;
  events.abort();
  clearWater();
  propPlayer?.dispose();
  harvest?.dispose();
  particles?.dispose();
  work?.dispose();
  soil?.dispose();
  engine?.destroy();
}
window.addEventListener("pagehide", dispose, { once: true });
void (async () => {
  const created = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  if (disposed) {
    created.destroy();
    return;
  }
  engine = created;
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor = new Color(0.925, 0.94, 0.905, 1);
  scene.ambientLight.diffuseSolidColor = new Color(0.75, 0.79, 0.71, 1);
  scene.ambientLight.diffuseIntensity = 0.65;
  scene.castShadows = true;
  scene.shadowDistance = 8;
  const root = scene.createRootEntity("farming-animation-preview");
  camera = root.createChild("camera").addComponent(Camera);
  camera.fieldOfView = 43;
  camera.nearClipPlane = 0.06;
  orbit = camera.entity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  setView();
  const light = root.createChild("sun");
  light.transform.setRotation(-45, -30, 0);
  const sun = light.addComponent(DirectLight);
  sun.color = new Color(0.95, 0.91, 0.82, 1);
  sun.shadowType = ShadowType.SoftLow;
  scene.sun = sun;
  const fill = root.createChild("fill");
  fill.transform.setRotation(-35, 135, 0);
  fill.addComponent(DirectLight).color = new Color(0.2, 0.23, 0.27, 1);
  const floor = root.createChild("ground");
  floor.transform.setPosition(0, -0.045, 0);
  const ground = floor.addComponent(MeshRenderer);
  ground.mesh = PrimitiveMesh.createPlane(engine, 200, 200);
  ground.castShadows = false;
  const material = new PBRMaterial(engine);
  material.baseColor = new Color(0.68, 0.73, 0.65, 1);
  material.roughness = 1;
  ground.setMaterial(material);
  const bed = root.createChild("soil target").addComponent(MeshRenderer);
  // The shared bed mesh has its surface at -7 cm; authored tool contacts use ground y = 0.
  bed.entity.transform.setPosition(0, 0.07, 0);
  soil = new SoilVisualProvider(engine, 1.2);
  soil.apply(bed, 0.25);
  bed.receiveShadows = true;
  work = new SoilWorkPresenter(bed, soil);
  propRoot = root.createChild("props");
  propPlayer = new FarmingPropAnimationPlayer(propRoot);
  harvest = new HarvestBasketPreview(new HarvestBasketPresenter(camera));
  player = propPlayer;
  root.addComponent(PreviewTick);
  const splash = await engine.resourceManager.load<Texture2D>({ url: water.splashUrl, type: AssetType.Texture });
  if (disposed) return;
  particles = new WateringParticles(root, splash);
  on("animations", "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-animation]");
    if (button) {
      sequence = false;
      void select(button.dataset.animation as FarmingPropAnimationId);
    }
  });
  on("play", "click", () => {
    if (player!.playing) player!.playing = false;
    else {
      if (player!.elapsed >= player!.duration) {
        clearWater();
      }
      if (!sequence) player!.loop = $<HTMLInputElement>("loop").checked;
      player!.play();
    }
    syncControls();
  });
  on("restart", "click", () => {
    clearWater();
    player!.seek(0);
    player!.play();
  });
  on("progress", "input", () => {
    player!.playing = false;
    clearWater();
    player!.seek(Number($<HTMLInputElement>("progress").value));
    syncControls();
  });
  on("beats", "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-seconds]");
    if (button && player!.ready) {
      player!.playing = false;
      clearWater();
      player!.seek(Number(button.dataset.seconds));
      syncControls();
    }
  });
  on("loop", "change", () => {
    player!.loop = $<HTMLInputElement>("loop").checked;
  });
  on("speed", "change", () => {
    player!.speed = Number($<HTMLSelectElement>("speed").value);
  });
  on("view", "change", setView);
  $("crop-select").replaceChildren(
    ...FARM_CROP_CONTENT.map((crop) => {
      const option = document.createElement("option");
      option.value = crop.id;
      option.textContent = `${crop.name} → ${crop.produce}`;
      return option;
    })
  );
  on("basket-add", "click", () =>
    harvest.receive($<HTMLSelectElement>("crop-select").value, Number($<HTMLInputElement>("harvest-quantity").value))
  );
  on("basket-show", "click", () => harvest.show());
  on("basket-hide", "click", () => harvest.hide());
  on("basket-scenario", "change", () => {
    harvest.lifecycle = $<HTMLSelectElement>("basket-scenario").value === "lifecycle";
    void select("harvest");
  });
  function setPreparation(preparation: SoilPreparation): void {
    sequence = false;
    player!.playing = false;
    player!.seek(0);
    work!.setPreparation(preparation);
    if (isSoil() && player!.ready) work!.prepare(propPlayer, selected as "hoe" | "rake");
    player!.loop = $<HTMLInputElement>("loop").checked;
    clearWater();
    syncControls();
  }
  on("soil-reset", "click", () => setPreparation("raw"));
  on("soil-shape", "change", () => setPreparation($<HTMLSelectElement>("soil-shape").value as SoilPreparation));
  on("moisture", "input", () => {
    const moisture = Number($<HTMLInputElement>("moisture").value);
    work!.setMoisture(moisture / 100);
    $("moisture-value").textContent = `${moisture}%`;
  });
  on("sequence", "click", () => {
    sequence = true;
    void select("hoe", true);
  });
  const requested = new URLSearchParams(location.search).get("animation");
  selected =
    requested && (requested === "harvest" || Object.prototype.hasOwnProperty.call(FARMING_PROP_ANIMATIONS, requested))
      ? (requested as FarmingPropAnimationId)
      : "watering";
  window.farmingAnimationPreview = {
    snapshot: () => ({
      id: player!.id,
      ready: player!.ready,
      playing: player!.playing,
      elapsed: player!.elapsed,
      duration: player!.duration,
      loop: player!.loop,
      speed: player!.speed,
      emittedDrops: emitted,
      particlesAlive: particles!.alive,
      soil: work!.summary(),
      basket: harvest.basket.snapshot(),
      gpuMemoryBytes: engine!.renderingStatistics.totalMemory,
      sequence,
      contact: player!.entity
        ?.findByName(selected === "watering" ? "WateringNozzle" : selected === "hoe" ? "HoeContact" : "RakeContact")
        ?.transform.worldPosition.clone()
    }),
    basket: {
      show: () => harvest.show(),
      hide: () => harvest.hide(),
      receive: (cropId: string, quantity = 1) => harvest.receive(cropId, quantity),
      snapshot: () => harvest.basket.snapshot()
    },
    dispose
  };
  engine.run();
  await select(selected);
})().catch((error) => {
  $("status").hidden = false;
  $("status").textContent = `初始化失败：${String(error)}`;
  console.error(error);
});
declare global {
  interface Window {
    farmingAnimationPreview?: {
      snapshot(): unknown;
      basket: { show(): void; hide(): void; receive(cropId: string, quantity?: number): void; snapshot(): unknown };
      dispose(): void;
    };
  }
}
