import type { Component } from "@galacean/engine";
/** Architectural identity without importing author components into render algorithms. */
export const buildingAuthorMarker = Symbol("BuildingAuthorComponent");
export function isBuildingAuthor(component: Component): boolean {
  return (component as Component & { [buildingAuthorMarker]?: boolean })[buildingAuthorMarker] === true;
}
