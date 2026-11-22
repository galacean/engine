import type { BuildingCoreDraft as BuildingDraft } from "../../core";
import type { BuildingCpuOptions, BuildingCpuPreparation, compileBuildingCpu } from "./BuildingCpu";
import type { InitialBuildingGroupInput, InitialBuildingGroupOutput } from "./BuildingInitialGroup";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";

export type BuildingCpuPreview = Omit<BuildingCpuPreparation, "prepared">;
export type BuildingCpuDetail = Awaited<ReturnType<typeof compileBuildingCpu>>;
export type BuildingWorkerRequest =
  | {
      id: number;
      mode: "preview" | "previewOnly";
      draft: BuildingDraft;
      assetId: number;
      terrainId: number;
      units?: BuildingUnitAssets;
      terrain?: ConstructionTerrainGrid;
      options?: BuildingCpuOptions;
      workerSlim?: boolean;
    }
  | {
      id: number;
      mode: "initial-group";
      group: InitialBuildingGroupInput;
      library: string;
      layoutKey?: string;
      assetId: number;
      terrainId: number;
      units?: BuildingUnitAssets;
      terrain?: ConstructionTerrainGrid;
    }
  | {
      id: number;
      mode: "detail";
      token: number;
      feedbackGrid?: boolean;
      workerSlim?: boolean;
      omitEmptyCells?: boolean;
    }
  | {
      id: number;
      mode: "detailFromDraft";
      draft: BuildingDraft;
      assetId: number;
      terrainId: number;
      units?: BuildingUnitAssets;
      terrain?: ConstructionTerrainGrid;
      options?: BuildingCpuOptions;
      feedbackGrid?: boolean;
      workerSlim?: boolean;
      omitEmptyCells?: boolean;
    }
  | { mode: "release"; token: number };
export type BuildingWorkerReply =
  | { id: number; ok: true; result: BuildingCpuPreview | BuildingCpuDetail | InitialBuildingGroupOutput }
  | { id: number; ok: false; error: string };
