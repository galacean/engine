import { compileConstructionDecorations, assertConstructionDecorationInstallations } from "./ConstructionDecorations";
import {
  constructionContactSource,
  publishConstructionOwners,
  generateConstructionContacts
} from "./ConstructionContacts";
import type { ConstructionGeometryAssets } from "../resources/BuildingGeometry";
import type { MasonryDocument } from "./MasonryDocument";
type Geometry = ConstructionGeometryAssets;

/** The same installation producer used by rendering, without wall/roof tessellation or GPU allocation. */
export function validateBuildingInstallations(
  document: MasonryDocument,
  assets: Geometry,
  height: (x: number, z: number) => number
): void {
  const owners = publishConstructionOwners(
    constructionContactSource(document.construction, document.bindings),
    height,
    document.bindings
  );
  const contacts = generateConstructionContacts(
    owners,
    height,
    document.construction.environment.type === "host_terrain"
  );
  for (const owner of owners) {
    const body = owner.building;
    if (!body.decorations?.length) continue;
    const result = compileConstructionDecorations(
      body,
      owner.shape,
      owner.profile,
      body.decorations,
      contacts.contactHoles.get(owner.nativeId) ?? [],
      {
        wallSlot: owner.slot,
        seed: Number(owner.seed),
        wallEnvelope: owner.wallEnvelope,
        roofBinding: document.bindings.find((b) => b.geometry_id === body.id + "-roof"),
        assets
      }
    );
    assertConstructionDecorationInstallations(body, result);
  }
}
