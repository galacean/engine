/** Debug vocabulary and colors kept outside the formal authoring/runtime contracts. */
export enum RiverDebugMode {
  Off = "off",
  Path = "path",
  Banks = "banks",
  Full = "full"
}

export enum RiverPreviewStage {
  Path = "path",
  Banks = "banks",
  Mesh = "mesh",
  Material = "material",
  Full = "full"
}

export const RIVER_DEBUG_OFFSET = 0.16;

export const RIVER_PREVIEW_STAGE_COLOR = {
  meshSurface: "#6bc6ff",
  meshBankFoam: "#f0fbff"
} as const;
