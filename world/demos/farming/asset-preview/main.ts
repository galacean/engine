import { evaluateSoilMoistureGrowth } from "@galacean/engine-farming/farming/domain/GrowthFactors";
import {
  BoundingBox,
  Camera,
  Color,
  DirectLight,
  Entity,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ShadowType,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { plantingCatalog } from "@galacean/engine-farming/farming/content/DefaultPlantingCatalog";
import { getCropContentByAssetId } from "@galacean/engine-farming/farming/content/CropContent";
import { CROP_ICON_URLS, cropIconIssues } from "@galacean/engine-farming/farming/content/CropIcons";
import { isUsableBounds } from "@galacean/engine-farming/farming/assets/bounds";
import {
  createPlantInstance,
  type PlantInstance
} from "@galacean/engine-farming/farming/procedural/runtime/createPlantInstance";
import { createPlantRenderState } from "@galacean/engine-farming/farming/presentation/PlantRenderState";
import { DEFAULT_PLANT_SHAPE, type PlantShape } from "@galacean/engine-farming/farming/procedural/core/PlantGrowthRecipe";
import type { CropDefinition, CropGrowthFactorId } from "@galacean/engine-farming/farming/domain/FarmDefinitions";
import { CROP_GROWTH_FACTOR_META, CROP_GROWTH_FACTOR_ORDER } from "@galacean/engine-farming/farming/domain/GrowthFactors";
import {
  calculateFactorToleranceScore,
  stageSensitivityAtProgress,
  getCropGrowthProfile,
  type CropGrowthProfile
} from "@galacean/engine-farming/farming/profiles/CropGrowthProfiles";
import {
  configureGrowthControls,
  growthMetrics,
  renderGrowthInfo,
  resetGrowthShapeControls
} from "./growthPresentation.ts";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
let engine: WebGLEngine, parent: Entity, camera: Camera, orbit: OrbitControl;
let crop: CropDefinition = plantingCatalog.crops[0];
let growth: PlantInstance | undefined;
let growthProgress = 0.7,
  growthShape: PlantShape = { ...DEFAULT_PLANT_SHAPE };
let generation = 0,
  disposed = false,
  growthFrame = 0;
let loadController = new AbortController();
const events = new AbortController();
const on = (element: HTMLElement, event: string, handler: EventListener) =>
  element.addEventListener(event, handler, { signal: events.signal });
const growthDefinition = () => plantingCatalog.getPlant(crop.appearance.plantId);
function renderObjects() {
  const query = $<HTMLInputElement>("search").value.toLowerCase().trim();
  const items = plantingCatalog.crops.filter((c) =>
    `${c.name} ${c.id} ${c.appearance.plantId}`.toLowerCase().includes(query)
  );
  $("count").textContent = String(plantingCatalog.crops.length);
  $("objects").innerHTML =
    items
      .map(
        (c) =>
          `<button class="object" data-asset="${escape(c.appearance.plantId)}" aria-pressed="${c.id === crop.id}"><img class="crop-icon" src="${escape(CROP_ICON_URLS[c.id])}" alt="" width="48" height="48"/><span class="kind">植物</span><strong>${escape(c.name)}</strong><small>${escape(c.appearance.plantId)} · 程序化生长</small></button>`
      )
      .join("") || '<div class="empty">没有匹配的对象</div>';
}
function stopGrowthPlayback() {
  cancelAnimationFrame(growthFrame);
  growthFrame = 0;
  $("growth-play").textContent = "播放生长";
}
function setProgress(value: number) {
  if (!growth) return;
  growthProgress = Math.max(0, Math.min(1, value));
  growth.update(createPlantRenderState(plantingCatalog, crop.id, `preview-${crop.id}`, growthProgress, growthShape));
  const result = growth.query(),
    percent = `${(growthProgress * 100).toFixed(1)}%`;
  $<HTMLInputElement>("plant-growth").value = String(growthProgress);
  $<HTMLInputElement>("recipe-age").value = String(result.age);
  $("recipe-age-value").textContent = result.age.toFixed(3);
  $("plant-growth-value").textContent = percent;
  $("growth-phase").textContent = result.stageName;
  $("plant-growth").setAttribute("aria-valuetext", `${percent}，${result.stageName}`);
  const metrics = growthMetrics(growth.plant.geometry, growthDefinition());
  $("growth-metrics").textContent = metrics;
  $("status").textContent = `连续生长 ${percent} · ${result.stageName} · ${metrics}`;
  $("info").innerHTML = renderGrowthInfo(growthDefinition(), growth.plant.geometry, result.age);
}
async function loadGrowth() {
  const token = ++generation;
  loadController.abort();
  loadController = new AbortController();
  growth?.dispose();
  growth = undefined;
  $("growth-retry").hidden = true;
  $<HTMLInputElement>("plant-growth").disabled = true;
  $<HTMLButtonElement>("growth-play").disabled = true;
  $("status").textContent = "正在生成植株…";
  try {
    const instance = await createPlantInstance(
      plantingCatalog,
      engine,
      parent,
      createPlantRenderState(plantingCatalog, crop.id, `preview-${crop.id}`, growthProgress, growthShape),
      loadController.signal
    );
    if (disposed || token !== generation) {
      instance.dispose();
      return;
    }
    growth = instance;
    $<HTMLInputElement>("plant-growth").disabled = false;
    $<HTMLButtonElement>("growth-play").disabled = false;
    setProgress(growthProgress);
    fit();
  } catch (error) {
    if (disposed || token !== generation) return;
    $("status").textContent = `植株生成失败：${error instanceof Error ? error.message : String(error)}`;
    $("growth-retry").hidden = false;
  }
}
async function selectAsset(id: string) {
  const next = plantingCatalog.crops.find((c) => c.appearance.plantId === id);
  if (!next) throw new Error(`未知种植物种：${id}`);
  stopGrowthPlayback();
  crop = next;
  growthShape = { ...DEFAULT_PLANT_SHAPE };
  growthProgress = plantingCatalog.getMapping(crop.id).progressAtAge(growthDefinition().preview.initialAge);
  $("asset-name").textContent = crop.name;
  $("asset-subtitle").textContent = `${crop.appearance.plantId} / 单次生长周期`;
  configureGrowthControls(growthDefinition());
  $("growth-anchors").innerHTML = crop.cycle.stages
    .map(
      (s) =>
        `<button data-growth-progress="${s.minimumProgress}">${escape(s.name)} <span>${Math.round(s.minimumProgress * 100)}%</span></button>`
    )
    .join("");
  $("growth-note").textContent = `${growthDefinition().preview.note} 滑块表示种植周期进度；播放仅用于预览。`;
  renderObjects();
  renderGrowthProfile();
  await loadGrowth();
}
function renderGrowthProfile() {
  const profile = getCropGrowthProfile(crop.id)!;
  const content = getCropContentByAssetId(crop.appearance.plantId)!;
  $("growth-profile").innerHTML =
    `<section class="farm-content"><img src="${escape(CROP_ICON_URLS[crop.id])}" alt="" width="64" height="64"/><div><strong>农场作物 · ${escape(crop.name)}</strong><p>理想条件 ${content.idealSeconds} 秒成熟 · 收获 ${escape(content.produce)} × ${content.quantity}</p></div><a href="${import.meta.env.DEV ? "../first-person-farm/index.html" : "../farming-demo/index.html"}?seed=${encodeURIComponent(crop.id)}" target="_blank" rel="noopener">去农场种植 ↗</a></section><header class="profile-heading"><h2>${escape(crop.name)} · 生长属性</h2><span class="profile-badge">玩法基准参数</span></header><section class="profile-card radar-card"><h3>环境适应雷达</h3>${renderRadar(profile)}</section><section class="profile-card heatmap-card"><h3>阶段敏感度</h3>${renderHeatmap(profile)}<p>按当前物种阶段采样的展示数据，不参与成长速率计算。</p></section><section class="profile-card curves-card"><h3>环境响应曲线</h3><div class="factor-curves">${CROP_GROWTH_FACTOR_ORDER.map((id) => renderCurve(profile, id)).join("")}</div></section>`;
}
function renderHeatmap(profile: CropGrowthProfile): string {
  return `<div class="heatmap-scroll"><table class="growth-heatmap"><thead><tr><th>因素</th>${crop.cycle.stages.map((s) => `<th>${escape(s.name)}</th>`).join("")}</tr></thead><tbody>${CROP_GROWTH_FACTOR_ORDER.map(
    (id) =>
      `<tr data-heatmap-factor="${id}"><th>${escape(CROP_GROWTH_FACTOR_META[id].name)}</th>${crop.cycle.stages
        .map((s) => {
          const value = stageSensitivityAtProgress(profile, id, s.minimumProgress);
          return `<td style="--heat:${value / 100}" aria-label="${value}%"><span>${value}</span></td>`;
        })
        .join("")}</tr>`
  ).join("")}</tbody></table></div>`;
}
function renderRadar(profile: CropGrowthProfile): string {
  const size = 260;
  const center = size / 2;
  const radius = 86;
  const point = (index: number, scale = 1) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / CROP_GROWTH_FACTOR_ORDER.length;
    return [center + Math.cos(angle) * radius * scale, center + Math.sin(angle) * radius * scale] as const;
  };
  const rings = [0.25, 0.5, 0.75, 1]
    .map(
      (scale) =>
        `<polygon points="${CROP_GROWTH_FACTOR_ORDER.map((_, index) => point(index, scale).join(",")).join(" ")}" />`
    )
    .join("");
  const scores = CROP_GROWTH_FACTOR_ORDER.map((id) => calculateFactorToleranceScore(profile, id));
  const axes = CROP_GROWTH_FACTOR_ORDER.map((id, index) => {
    const [x, y] = point(index);
    const [labelX, labelY] = point(index, 1.28);
    return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}"/><text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle">${escape(CROP_GROWTH_FACTOR_META[id].name)}</text>`;
  }).join("");
  const valuePoints = scores.map((score, index) => point(index, score / 100).join(",")).join(" ");
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escape(profile.name)}环境适应雷达图"><g class="radar-grid">${rings}${axes}</g><polygon class="radar-value" points="${valuePoints}"/>${scores
    .map((score, index) => {
      const [x, y] = point(index, score / 100);
      return `<circle cx="${x}" cy="${y}" r="3"><title>${escape(CROP_GROWTH_FACTOR_META[CROP_GROWTH_FACTOR_ORDER[index]].name)} ${score}</title></circle>`;
    })
    .join("")}</svg>`;
}

function renderCurve(profile: CropGrowthProfile, id: CropGrowthFactorId): string {
  const factor = profile.factors[id];
  const meta = CROP_GROWTH_FACTOR_META[id];
  const x = (value: number) => 12 + ((value - meta.minimum) / (meta.maximum - meta.minimum)) * 196;
  if (id === "soilMoisture") {
    const points = Array.from({ length: 101 }, (_, value) => `${x(value)},${64 - 52 * evaluateSoilMoistureGrowth(value) / 1000}`).join(" ");
    return `<article class="factor-curve" data-profile-factor="${id}"><div><strong>${escape(meta.name)}</strong><span>越湿成长越快</span></div><svg viewBox="0 0 220 76" role="img" aria-label="土壤水分线性生长曲线"><path d="M12 64H208"/><polyline points="${points}"/></svg><small>干燥20%速度，饱和100%速度，不因水分停长</small></article>`;
  }
  const points = [
    `${x(meta.minimum)},64`,
    `${x(factor.minimum)},64`,
    `${x(factor.optimalMinimum)},12`,
    `${x(factor.optimalMaximum)},12`,
    `${x(factor.maximum)},64`,
    `${x(meta.maximum)},64`
  ].join(" ");
  return `<article class="factor-curve" data-profile-factor="${id}"><div><strong>${escape(meta.name)}</strong><span>${formatRange(factor.optimalMinimum, meta.unit)}–${formatRange(factor.optimalMaximum, meta.unit)} 最适</span></div><svg viewBox="0 0 220 76" role="img" aria-label="${escape(meta.name)}梯形响应曲线"><path d="M12 64H208"/><polyline points="${points}"/></svg><small>生存 ${formatRange(factor.minimum, meta.unit)}–${formatRange(factor.maximum, meta.unit)}</small></article>`;
}

function formatRange(value: number, unit: string): string {
  return unit === "pH" ? String(value) : `${value}${unit}`;
}
function fit() {
  if (!growth) return;
  const bounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );
  if (growth) {
    const frame = growth.plant.framingBounds();
    bounds.min.set(...frame.min);
    bounds.max.set(...frame.max);
    if (growth.plant.support.isActive) {
      for (const renderer of growth.plant.support.getComponentsIncludeChildren(MeshRenderer, []))
        BoundingBox.merge(bounds, renderer.bounds, bounds);
    }
  }
  if (!isUsableBounds(bounds)) return;
  const center = new Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2
  );
  const radius = Math.max(
    0.08,
    Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2
  );
  const canvas = $("canvas");
  if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return;
  const vertical = (camera.fieldOfView * Math.PI) / 360;
  const horizontal = Math.atan((Math.tan(vertical) * canvas.clientWidth) / Math.max(1, canvas.clientHeight));
  const distance =
    Math.max(
      (bounds.max.x - bounds.min.x) / 2 / Math.tan(horizontal),
      (bounds.max.y - bounds.min.y) / 2 / Math.tan(vertical)
    ) *
      1.15 +
    (bounds.max.z - bounds.min.z) * 0.7;
  if (!Number.isFinite(distance) || distance <= 0) return;
  orbit.target.copyFrom(center);
  camera.entity.transform.setPosition(
    center.x + distance * 0.15,
    center.y + distance * 0.35,
    center.z + distance * 0.925
  );
  camera.entity.transform.lookAt(center);
  orbit.minDistance = radius * 0.3;
  orbit.maxDistance = distance * 8;
  camera.farClipPlane = Math.max(100, distance * 20);
}

async function main() {
  if (import.meta.env.DEV) Logger.enable();
  engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  if (disposed) {
    engine.destroy();
    return;
  }
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor = new Color(0.925, 0.94, 0.905, 1);
  scene.ambientLight.diffuseSolidColor = new Color(0.75, 0.79, 0.71, 1);
  scene.ambientLight.diffuseIntensity = 0.45;
  scene.castShadows = true;
  scene.shadowDistance = 8;
  const root = scene.createRootEntity("farming-preview");
  parent = root.createChild("stages");
  const cameraEntity = root.createChild("camera");
  camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 0.005;
  camera.fieldOfView = 38;
  orbit = cameraEntity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  const light = root.createChild("key-light");
  light.transform.setRotation(-45, -30, 0);
  const sun = light.addComponent(DirectLight);
  sun.color = new Color(0.9, 0.87, 0.82, 1);
  sun.shadowType = ShadowType.SoftLow;
  scene.sun = sun;
  const fill = root.createChild("fill-light");
  fill.transform.setRotation(-30, 140, 0);
  fill.addComponent(DirectLight).color = new Color(0.2, 0.23, 0.27, 1);
  const floor = root.createChild("ground");
  floor.transform.setPosition(0, -0.002, 0);
  const renderer = floor.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 200, 200);
  const material = new PBRMaterial(engine);
  material.baseColor = new Color(0.52, 0.52, 0.52, 1);
  material.metallic = 0;
  material.roughness = 1;
  renderer.setMaterial(material);
  renderer.castShadows = false;
  renderer.receiveShadows = true;
  on($("growth-ground"), "change", () => {
    floor.isActive = $<HTMLInputElement>("growth-ground").checked;
  });
  on($("search"), "input", renderObjects);
  on($("objects"), "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-asset]");
    if (button) void selectAsset(button.dataset.asset!);
  });
  on($("reset"), "click", fit);
  on($("growth-controls"), "input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === "plant-growth") {
      stopGrowthPlayback();
      setProgress(Number(input.value));
    } else if (input.id === "recipe-age") {
      stopGrowthPlayback();
      setProgress(plantingCatalog.getMapping(crop.id).progressAtAge(Number(input.value)));
    } else if (input.dataset.growthShape) {
      growthShape = { ...growthShape, [input.dataset.growthShape]: Number(input.value) };
      $(`${input.id}-value`).textContent = `${Number(input.value).toFixed(2)}×`;
      setProgress(growthProgress);
    }
  });
  on($("growth-support"), "change", () => {
    if (growth) growth.plant.support.isActive = $<HTMLInputElement>("growth-support").checked;
  });
  on($("growth-controls"), "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.id === "growth-retry") {
      stopGrowthPlayback();
      void loadGrowth();
    } else if (button.dataset.growthProgress !== undefined) {
      stopGrowthPlayback();
      setProgress(Number(button.dataset.growthProgress));
    } else if (button.id === "growth-shape-reset") {
      growthShape = { ...DEFAULT_PLANT_SHAPE };
      resetGrowthShapeControls(growthShape);
      setProgress(growthProgress);
    } else if (button.id === "growth-play" && growth) {
      if (growthFrame) {
        stopGrowthPlayback();
        return;
      }
      if (growthProgress >= 1) setProgress(0);
      button.textContent = "暂停生长";
      let previous = performance.now();
      const advance = (now: number) => {
        setProgress(
          growthProgress + Math.min(0.05, (now - previous) / 1000) / growthDefinition().preview.durationSeconds
        );
        previous = now;
        if (growthProgress >= 1 || disposed) stopGrowthPlayback();
        else growthFrame = requestAnimationFrame(advance);
      };
      growthFrame = requestAnimationFrame(advance);
    }
  });
  $("issues").innerHTML = cropIconIssues
    .map((issue) => `<p>${escape(issue.path)}<br/>${escape(issue.message)}</p>`)
    .join("");
  if (import.meta.env.DEV)
    (window as any).__farmingPreview = {
      engine,
      growth: () => growth?.plant,
      instance: () => growth,
      growthDefinition,
      catalog: plantingCatalog,
      createPlantInstance,
      createPlantRenderState,
      setProgress
    };
  engine.run();
  renderObjects();
  await selectAsset(crop.appearance.plantId);
}
function dispose() {
  if (disposed) return;
  disposed = true;
  generation++;
  loadController.abort();
  events.abort();
  stopGrowthPlayback();
  growth?.dispose();
  engine?.destroy();
}
window.addEventListener("pagehide", dispose, { once: true });
void main().catch((error) => {
  $("status").textContent = `预览初始化失败：${error instanceof Error ? error.message : String(error)}`;
  dispose();
});
