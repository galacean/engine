/** Generated placement buffers; these are not persisted assets. */
export type ConstructionResourceRole =
  | "instances"
  | "indirection"
  | "view"
  | "frame"
  | "frameCounter"
  | "stoneFoundation"
  | "roofColors"
  | "wallColors"
  | "identities"
  | "woodenColors"
  | "halfTimberColors"
  | "roofCounts"
  | "roofHoles"
  | "domainRoof"
  | "domainCounts"
  | "domainHoles"
  | "windowCuts"
  | "plasterVertices";
export type ConstructionAssetLoader = (name: string) => Promise<ArrayBuffer>;

/** Shared by shader resource binding and pre-publication asset validation. */
export const decorationTextureBindings = [
  ["material_WindowTimber", "timberframe", true],
  ["material_WindowCurtains", "menu/feedback/think", false],
  ["material_WindowIndoors", "menu/feedback/aww", false],
  ["material_WindowGlass", "window_glass", false]
] as const;
export const plasterTextureBindings = [
  ["material_PlasterColors", "plaster_colors", true],
  ["material_PlasterMortar", "mortar", false]
] as const;
