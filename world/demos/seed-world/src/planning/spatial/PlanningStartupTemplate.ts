import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";

const rippleNormal = new URL("../../../assets/terrain-surface/RippleNormal.png", import.meta.url);
const microNormal = new URL("../../../assets/terrain-surface/MicroNormal.png", import.meta.url);

let selection: { id: string; seed: number } | undefined;

/** Remember an explicit launch selection for this page lifetime only.
 * @param id Registered theme, or empty for the original world.
 * @param seed Selected world identity.
 */
export function selectPlanningStartupTemplate(id: string, seed: number): void {
  selection = { id, seed };
}

/** Resolve new authoring without replacing a saved world's later edits on refresh.
 * @param search Current page query, carrying the initial template for a new world.
 * @param seed World identity being opened.
 * @param savedTemplate Saved template identity, empty for the original world, undefined if absent.
 * @returns Template to initialize, or undefined to restore the saved document.
 */
export function initialPlanningTemplate(search: string, seed: number, savedTemplate?: string): string | undefined {
  const explicit = selection?.seed === seed ? selection.id : undefined;
  if (savedTemplate !== undefined) return explicit !== undefined && explicit !== savedTemplate ? explicit : undefined;
  const id = explicit ?? new URLSearchParams(search).get("template");
  if (id === "original" || !id) return "";
  if (!worldTemplate(id)) throw new Error("未知世界风格：" + id);
  return id;
}

/** Author the sand surface on new desert template documents. */
export function applyPlanningTemplateSurface(document: PlanningDocument): void {
  applyPlanningMountainSet(document);
  const components = document.entities.world.components;
  if (components.worldTemplate?.values.id !== "titan-wasteland") return;
  const terrain = (components.terrain ??= { values: {} });
  Object.assign(terrain.values, {
    roadSurfacePattern: true,
    surfaceNormalTextureUrl: rippleNormal.href,
    surfaceTileM: 12,
    surfaceNormalScale: 1,
    surfaceMicroNormalTextureUrl: microNormal.href
  });
}

/** New worlds use the same ten carved mountain profiles as the structure gallery.
 * The explicit preview link also enables them in an existing world. */
export function applyPlanningMountainSet(document: PlanningDocument): void {
  const rock = (document.entities.world.components.rockFormation ??= { values: {} });
  Object.assign(rock.values, {
    ridgeArrangement: true,
    seededShapes: true,
    rockShaping: true,
    fractureDepth: 0.7,
    fractureWidth: 1.9,
    fractureIrregularity: 1.8,
    fractureSmoothing: 1
  });
}

/** Refreshes an older desert preview that still carries the original template relief values. */
export function updateDesertPreviewRelief(document: PlanningDocument): void {
  const { worldTemplate, terrain } = document.entities.world.components;
  if (worldTemplate?.values.id !== "titan-wasteland" || !terrain) return;
  const values = terrain.values;
  if (
    values.reliefNearAmplitudeM !== 9 ||
    values.reliefAmplitudeM !== 35 ||
    values.reliefFarAmplitudeM !== 110 ||
    values.reliefScaleM !== 256
  ) return;
  Object.assign(values, WORLD_TEMPLATE_ART["titan-wasteland"].initialPlanning?.relief);
}
