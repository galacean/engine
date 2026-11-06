import type { TerrainHeight } from "./PublishedWallProfile";
import { planWallConnections, placeWallConnections, type PublishedConnectionOwner } from "./WallConnectionPipeline";
import { planInterRoofMerlons, placeInterRoofMerlons, type InterRoofOwner } from "./RecoveredInterRoofMerlons";

/** Only participating supports are supplied. Ordering is explicit and stable;
 * the solver neither discovers houses nor infers relations from naming suffixes. */
export interface ProfileContactInputs {
  walls: readonly PublishedConnectionOwner[];
  roofs: readonly InterRoofOwner[];
  slots: ReadonlyMap<bigint, number>;
}

export function planProfileContacts(input: ProfileContactInputs, terrain: TerrainHeight) {
  for (const id of [...input.walls.map((w) => w.id), ...input.roofs.map((r) => r.nativeId)])
    if (!input.slots.has(id)) throw Error(`Missing contact render slot: ${id}`);
  const connections = planWallConnections(
    input.walls,
    input.walls.map((w) => w.id),
    terrain,
    input.slots
  );
  const merlons = planInterRoofMerlons(input.roofs);
  // The same reservations constrain wall placement and attached openings.
  const contactHoles = new Map(
    [...input.slots.keys()].map((id) => [id, [...(connections.holes.get(id) ?? []), ...(merlons.holes.get(id) ?? [])]])
  );
  return { connections, merlons, contactHoles };
}

export function placeProfileContacts(plan: ReturnType<typeof planProfileContacts>, input: ProfileContactInputs) {
  return {
    ...plan,
    connections: placeWallConnections(plan.connections, input.slots),
    merlons: placeInterRoofMerlons(plan.merlons, input.roofs)
  };
}
