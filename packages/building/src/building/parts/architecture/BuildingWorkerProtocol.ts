import type { BuildingCoreDraft as BuildingDraft } from "../../core";
import type { BuildingCpuOptions, BuildingCpuPreparation, compileBuildingCpu } from "./BuildingCpu";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";

export type BuildingCpuPreview = Omit<BuildingCpuPreparation, "prepared">;
export type BuildingCpuDetail = Awaited<ReturnType<typeof compileBuildingCpu>>;
export type BuildingWorkerRequest =
  | {
      id: number;
      mode: "preview";
      draft: BuildingDraft;
      assetId: number;
      terrainId: number;
      units?: BuildingUnitAssets;
      terrain?: ConstructionTerrainGrid;
      options?: BuildingCpuOptions;
    }
  | { id: number; mode: "detail"; token: number }
  | { mode: "release"; token: number };
export type BuildingWorkerReply =
  | { id: number; ok: true; result: BuildingCpuPreview | BuildingCpuDetail }
  | { id: number; ok: false; error: string };
