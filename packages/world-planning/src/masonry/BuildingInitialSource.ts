import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import type { ConstructionTerrainGrid } from "@galacean/engine-building/tiny-glade/runtime/TerrainField";
import type { BuildingUnitAssets } from "@galacean/engine-building/tiny-glade/runtime/BuildingUnitAssets";
import { initialBuildingDrafts } from "./BuildingInitialDraft";
import { designBuilding } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingDesign";
import {
  buildingDraftSource,
  type BuildingSourceOptions
} from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingSource";
import { prepareBuildingTerrain } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingTerrain";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingPublication";
import { profilePreview } from "@galacean/engine-building/tiny-glade/runtime/ProfilePreview";
import { profileShape } from "@galacean/engine-building/tiny-glade/runtime/ProfileGeometry";
import { wallMountCurve, wallMountPoint } from "@galacean/engine-building/tiny-glade/runtime/WallMountGeometry";

/** One-shot creation from published planning intent. Style builders publish
 * parts directly; rejected speculative attachments are never saved as objects. */
export async function initialBuildingSource(
  plan: IslandPlan,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  library: string,
  signal?: AbortSignal
) {
  const result: ReturnType<typeof buildingDraftSource> = { rootEntities: [], entities: [], components: [] };
  for (const group of initialBuildingDrafts(plan, assets)) {
    signal?.throwIfAborted();
    const height = prepareBuildingTerrain(terrain, { position: group.position, rotationY: 0 }).height;
    const design = designBuilding(group.draft, height, assets);
    const publication = await prepareBuildingPublication(design, { signal });
    const geometry = profilePreview(buildingPreviewInput(design, publication), height, {
      assets,
      includeAppearance: true,
      retainDecorationParts: true
    });
    const accepted = new Set([
      ...geometry.decorationParts.map((p) => p.decorationId),
      ...geometry.stones.map((p) => p.decorationId),
      ...geometry.frames.map((p) => p.decorationId),
      ...geometry.archGroups.map((p) => p.decorationId),
      ...geometry.retainedWallUnits.map((p) => p.pickId),
      ...geometry.woodArchFrames.map((p) => p.decorationId),
      ...geometry.woodArchPillars.map((p) => p.decorationId)
    ]);
    const parts = group.draft.parts.filter((p) => p.support.generator !== "attachmentMount" || accepted.has(p.id));
    const ids = new Set(parts.map((p) => p.id));
    const draft = {
      ...group.draft,
      parts,
      relations: group.draft.relations.filter((r) => ids.has(r.from.part) && ids.has(r.to.part))
    };
    // Scene nodes own position and orientation. Keep each support in its group's
    // local coordinates, exactly as when a user moves that group in the editor.
    const groupTransforms: NonNullable<BuildingSourceOptions["groupTransforms"]> = {};
    for (const part of draft.parts) {
      if (!["wallProfile", "wallStrip"].includes(part.support.generator)) continue;
      const p = part.support.params;
      const shape = p.rectangle ?? p.circle;
      groupTransforms[part.group] = {
        position: [shape.center[0], 0, shape.center[1]],
        rotation: [0, (-(p.rectangle ? shape.rotation : shape.phase) * 180) / Math.PI, 0]
      };
      shape.center = [0, 0];
      if (p.rectangle) shape.rotation = 0;
      else shape.phase = 0;
    }
    // The attachment node owns its physical Point. Keep the support offset at
    // zero; design projects the node's position through the host wall chart.
    const partTransforms: NonNullable<BuildingSourceOptions["partTransforms"]> = {};
    for (const part of draft.parts) {
      if (part.support.generator !== "attachmentMount") continue;
      const host = draft.relations.find((r) => r.from.part === part.id)?.to.part;
      const wall = draft.parts.find((p) => p.id === host && p.support.generator === "wallProfile");
      if (!wall) continue;
      const spec = part.support.params.spec;
      partTransforms[part.id] = {
        position: wallMountPoint(wallMountCurve(profileShape(wall.support.params)), spec.u, spec.bottom)
      };
      part.support.params.point = [0, 0, 0];
      delete spec.u;
      delete spec.bottom;
    }
    const source = buildingDraftSource(draft, {
      id: "building-group:" + group.id,
      name: "建筑组",
      position: group.position,
      groupTransforms,
      partTransforms,
      assetLibrary: library
    });
    result.rootEntities.push(...source.rootEntities);
    result.entities.push(...source.entities);
    result.components.push(...source.components);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return result;
}
