import { buildingWorkerAlgorithmIssue } from "./BuildingExecution";
import { buildingPalette } from "./BuildingPalette";
import { profileSupportRegion } from "./BuildingProfileTerrain";
import { groundSupportsInRegion } from "../../runtime/TerrainField";
import { buildingGrounding } from "./BuildingGrounding";
import { designBuilding } from "./BuildingDesign";
import { prepareBuildingPublication, buildingPreviewInput, buildingFocusPoses } from "./BuildingPublication";
import { implementBuilding } from "./BuildingImplementation";
import { prepareBuildingTerrain, type BuildingPlacementFrame } from "./BuildingTerrain";
import { profileSupportGenerators, validateBuildingDraft, type BuildingDraft } from "./BuildingDraft";
import { profilePreview } from "../../runtime/ProfilePreview";
import { ConstructionSurfaceQuery } from "../../runtime/ConstructionSurfaceQuery";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";

/** Current Worker capability: data-only profile parts and native attachment
 * descriptors. Native Entity/Prefab/Mesh references must not cross postMessage.
 * Unsupported supports fail explicitly; no local fallback. */
export function validateBuildingWorkerDraft(draft: BuildingDraft) {
  validateBuildingDraft(draft);
  for (const part of draft.parts) {
    if (part.transform) throw Error("Profile Worker requires geometry in the declared placement frame: " + part.id);
    if (!profileSupportGenerators.has(part.support.generator))
      throw Error("Support has no Worker geometry codec: " + part.support.generator);
    if (typeof part.unit !== "string" && !(part.unit && "nativeAttachment" in part.unit))
      throw Error("Worker parts require a transferable Unit descriptor: " + part.id);
  }
  const issue = buildingWorkerAlgorithmIssue(draft);
  if (issue) throw Error(issue);
}
export interface BuildingCpuOptions {
  frame?: BuildingPlacementFrame;
  includeStructure?: boolean;
  retainDecorationParts?: boolean;
  requireAllDecorations?: boolean;
}
export async function prepareBuildingCpu(
  draft: BuildingDraft,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  options: BuildingCpuOptions = {}
) {
  validateBuildingWorkerDraft(draft);
  const region = profileSupportRegion(draft, options.frame);
  const ground = prepareBuildingTerrain(
    { ...terrain, supports: groundSupportsInRegion(terrain, region) },
    options.frame
  );
  const design = designBuilding(draft, ground.height, assets);
  if (options.requireAllDecorations !== false && design.diagnostics.length)
    throw Error(design.diagnostics.map((d) => d.part + ": " + d.reason).join("\n"));
  const publication = await prepareBuildingPublication(design);
  const preview = profilePreview(buildingPreviewInput(design, publication), ground.height, {
    assets,
    includeStructure: options.includeStructure ?? true,
    includeAppearance: true,
    retainDecorationParts: options.retainDecorationParts ?? true
  });
  const structure =
    preview.structuralParts && new ConstructionSurfaceQuery(preview.structuralParts, [0, 0, 0], (id) => id).snapshot();
  // The complete solved geometry stays in the Worker for later detail, not in
  // the author scene or the response sent to the main thread.
  return {
    prepared: { design, publication, ground },
    preview,
    structure,
    appearance: buildingPalette(design),
    focus: buildingFocusPoses(design, preview.parts),
    diagnostics: design.diagnostics
  };
}
export type BuildingCpuPreparation = Awaited<ReturnType<typeof prepareBuildingCpu>>;
export async function compileBuildingCpu(prepared: BuildingCpuPreparation["prepared"]) {
  const result = await implementBuilding(prepared.design, { publication: prepared.publication });
  return { renderInput: result.renderInput, grounding: buildingGrounding(result, prepared.ground) };
}
