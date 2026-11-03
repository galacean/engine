import type { PlantGrowthDefinition } from "@galacean/engine-farming/farming/procedural/core/PlantGrowthDefinition";
import type { PlantGeometry } from "@galacean/engine-farming/farming/procedural/core/PlantGrowthGeometry";
import {
  DEFAULT_PLANT_SHAPE,
  PLANT_SHAPE_LIMITS,
  type PlantShape
} from "@galacean/engine-farming/farming/procedural/core/PlantGrowthRecipe";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
const percent = (age: number) => `${Number((age * 100).toFixed(1))}%`;

/** Presentation belongs to the preview; plant names, phases and landmarks belong to content. */
export function configureGrowthControls(definition: PlantGrowthDefinition | undefined): void {
  $("growth-controls").hidden = !definition;
  if (!definition) return;
  $("growth-title").textContent = `${definition.name}，连续生长`;
  $("growth-note").textContent = definition.preview.note;
  $("growth-fruit-label").textContent = `${definition.preview.fruitLabel ?? "果实"}大小`;
  $("growth-support").closest("label")!.hidden = definition.recipe.supports.length === 0;
  $<HTMLInputElement>("growth-support").checked = false;
  const availability = {
    leafSpread: definition.recipe.leaves.length > 0 || !!definition.recipe.meshes?.some((m) => m.kind === "leaf"),
    stemBend: definition.recipe.stems.length > 0,
    fruitScale:
      definition.recipe.volumes.some((v) => v.kind === "fruit") ||
      !!definition.recipe.meshes?.some((m) => m.kind === "fruit")
  };
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-growth-shape]")) {
    const key = input.dataset.growthShape as keyof PlantShape;
    input.closest("label")!.hidden = !availability[key];
    input.min = String(PLANT_SHAPE_LIMITS[key][0]);
    input.max = String(PLANT_SHAPE_LIMITS[key][1]);
  }
  resetGrowthShapeControls(DEFAULT_PLANT_SHAPE);
}

export function resetGrowthShapeControls(shape: PlantShape): void {
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-growth-shape]")) {
    const value = shape[input.dataset.growthShape as keyof PlantShape];
    input.value = String(value);
    $(`${input.id}-value`).textContent = `${value.toFixed(2)}×`;
  }
}

export function growthMetrics(data: PlantGeometry, definition?: PlantGrowthDefinition): string {
  return `株高 ${(data.bounds.max[1] - data.bounds.min[1]).toFixed(3)} m · ${data.leafCount} 组叶片${data.organs.some((o) => o.kind === "fruit") ? ` · ${data.fruitCount} ${definition?.preview.fruitUnit ?? "颗"}${definition?.preview.fruitLabel ?? "果实"}` : ""}`;
}

export function renderGrowthInfo(
  definition: PlantGrowthDefinition,
  data: PlantGeometry | undefined,
  age: number
): string {
  const recipe = definition.recipe;
  const fruits =
    recipe.volumes.filter((volume) => volume.kind === "fruit").length +
    (recipe.meshes?.filter((m) => m.kind === "fruit").length ?? 0);
  const leaves = recipe.leaves.length + (recipe.meshes?.filter((m) => m.kind === "leaf").length ?? 0);
  return `<div><span class="eyebrow">${escape(definition.name)} / 生长预览</span><h2>连续生长</h2><p>${escape(definition.description)}</p></div>
    <section class="info-section"><h3>当前植株</h3>${data ? `<dl><dt>配方 age</dt><dd>${percent(age)}</dd><dt>尺寸 / 米</dt><dd>${data.bounds.max.map((v, i) => (v - data.bounds.min[i]).toFixed(3)).join(" × ")}<br />宽 × 高 × 深，不含支架</dd><dt>叶片</dt><dd>${data.leafCount} / ${leaves} 组</dd>${fruits ? `<dt>${escape(definition.preview.fruitLabel ?? "果实")}</dt><dd>${data.fruitCount} / ${fruits} ${escape(definition.preview.fruitUnit ?? "颗")}</dd>` : ""}<dt>三角形</dt><dd>${(data.indices.length / 3).toLocaleString()} 面</dd></dl>` : "<p>正在准备生长配方…</p>"}</section>
    <section class="info-section"><h3>配方形态参考（age）</h3><p>${definition.preview.landmarks.map((key) => `${percent(key.age)} ${escape(key.label)}`).join(" · ")}</p><p>${escape(definition.preview.note)}</p><p>上方预览由配方实时生成。${recipe.supports.length ? "支架独立显示，不参与生长。" : ""}</p></section>
    <section class="info-section"><h3>素材来源</h3><p>${escape(definition.source.author)} · ${escape(definition.source.license)}<br />${escape(definition.preview.materialNote ?? "生长配方与原始贴图")}</p><p><a href="${escape(definition.source.url)}" target="_blank" rel="noopener noreferrer">查看原始素材 ↗</a></p></section>`;
}
