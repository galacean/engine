// Public building API: the European style generators, the scene manager and components, and
// the conversion of a draft to a Prefab Source. Drafts are core drafts (see ../../core).
import { European } from "../../application/European";
export const Building = { European };
export * from "../../application/European";
export type { BuildingCoreDraft as BuildingDraft } from "../../core";
export { validateBuildingDraft } from "./BuildingCpu";
export * from "./BuildingManager";
export * from "./BuildingPartComponent";
export * from "./BuildingGroupComponent";
export * from "./BuildingSource";
