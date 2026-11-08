// Part-type layer: every part type the building system knows, registered together.
import { createBuildingRegistry, type BuildingRegistry } from "../core";
import { registerHouseTypes } from "./House";
import { registerStripTypes } from "./Strip";

/** Registers every building part type into a registry. */
export function registerBuildingTypes(registry: BuildingRegistry): BuildingRegistry {
  return registerStripTypes(registerHouseTypes(registry));
}
/** A registry with the core mechanism and every building part type. */
export function createBuildingTypeRegistry(): BuildingRegistry {
  return registerBuildingTypes(createBuildingRegistry());
}
