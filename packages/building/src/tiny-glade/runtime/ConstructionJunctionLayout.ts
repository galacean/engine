import type { ProfileWallGeometry } from "./ProfileWallGeometry";
import type { placeProfileContacts } from "./ProfileContacts";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import type { SupportCell } from "./PlacementSupport.ts";
import { supportShapeFrame } from "./ConstructionSupportFrame.ts";

export interface ConstructionJunctionGroup {
  decorationId?: string;
  ownerId: string;
  binding: MasonryBinding;
  slot: number;
  role: "wall_junction" | "roof_junction" | "wall_arch";
  sourceUnit: "brick" | "wooden_plank";
  sourceDrawId: string;
  cells: SupportCell[];
  records: Uint8Array[];
}

/** Junctions retain the native rendering owner: alternating brick ownership or
 * the selected beam owner for walls, and the flat roof for inter-roof merlons.
 * That same owner supplies a metric edit anchor, material and render slot.
 * Raw packed records remain the default variant; replacement units use the
 * decoded affine frame. No generated placement is persisted in author data. */
export function profileJunctionGroups(
  owners: readonly ProfileJunctionOwner[],
  contacts: Pick<ReturnType<typeof placeProfileContacts>, "connections" | "merlons">
): ConstructionJunctionGroup[] {
  const byId = new Map(owners.map((o) => [o.nativeId, o]));
  const groups = new Map<string, ConstructionJunctionGroup>();
  const ordinals = new Map<string, number>();
  const wallAnchor = (o: ProfileJunctionOwner, center: number[]): number[] => {
    let best = Infinity,
      arc = 0,
      u = 0;
    for (let i = 1; i < o.profile.points.length; i++) {
      const a = o.profile.points[i - 1],
        b = o.profile.points[i];
      const dx = b[0] - a[0],
        dz = b[2] - a[2],
        length = Math.hypot(dx, dz);
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((center[0] - a[0]) * dx + (center[2] - a[2]) * dz) / (length * length)));
      const distance = (center[0] - a[0] - t * dx) ** 2 + (center[2] - a[2] - t * dz) ** 2;
      if (distance < best) {
        best = distance;
        u = arc + t * length;
      }
      arc += length;
    }
    if (!Number.isFinite(best)) throw Error("Junction owner has no wall chart");
    return [u, center[1] - o.profile.minGround];
  };
  const append = (
    ownerId: bigint,
    participants: readonly bigint[],
    role: ConstructionJunctionGroup["role"],
    sourceUnit: ConstructionJunctionGroup["sourceUnit"],
    sourceDrawId: string,
    affine: Uint8Array,
    packed: Uint8Array
  ) => {
    const owner = byId.get(ownerId);
    if (!owner) throw Error("Junction owner is absent");
    const binding = role === "wall_junction" ? owner.wallBinding : owner.roofBinding;
    // Legacy examples without wall author bindings keep their original static draw.
    if (!binding) return;
    const key = JSON.stringify([binding.id, role, sourceUnit, sourceDrawId]);
    let group = groups.get(key);
    if (!group) {
      group = {
        ownerId: owner.id,
        binding,
        slot: owner.slot,
        role,
        sourceUnit,
        sourceDrawId,
        cells: [],
        records: []
      };
      groups.set(key, group);
    }
    const v = new DataView(affine.buffer, affine.byteOffset, affine.byteLength);
    const columns = [0, 1, 2].map((c) => [0, 1, 2].map((i) => v.getFloat32((c * 3 + i) * 4, true)));
    const size = columns.map((c) => Math.hypot(...c));
    if (size.some((n) => !Number.isFinite(n) || n <= 0)) throw Error("Non-positive junction frame");
    const axes = columns.map((c, i) => c.map((n) => n / size[i]));
    const center = [0, 1, 2].map(
      (i) => v.getFloat32(36 + i * 4, true) + (sourceUnit === "wooden_plank" ? columns[1][i] / 2 : 0)
    );
    const identity = JSON.stringify([role, participants.map((id) => byId.get(id)!.id).sort(), owner.id, sourceUnit]);
    const ordinal = ordinals.get(identity) ?? 0;
    ordinals.set(identity, ordinal + 1);
    const id = binding.geometry_id + "/junction/" + identity + "/" + ordinal;
    const variationIdentity = JSON.stringify([
      role,
      participants
        .map((id) => {
          const p = byId.get(id)!;
          return p.variationKey ?? p.id;
        })
        .sort(),
      owner.variationKey ?? owner.id,
      sourceUnit
    ]);
    const variationKey =
      binding.variationKey !== undefined ||
      owner.variationKey !== undefined ||
      participants.some((id) => byId.get(id)!.variationKey !== undefined)
        ? (binding.variationKey ?? binding.geometry_id) + "/junction/" + variationIdentity + "/" + ordinal
        : undefined;
    let anchor: number[];
    if (role === "wall_junction") anchor = wallAnchor(owner, center);
    else {
      const { c, s, width, depth } = supportShapeFrame(owner.shape);
      const dx = center[0] - owner.shape.center[0],
        dz = center[2] - owner.shape.center[1];
      anchor = [c * dx + s * dz + width / 2, depth / 2 - (-s * dx + c * dz)];
    }
    group.cells.push({
      id,
      logical_id: id,
      ...(variationKey !== undefined ? { seed_id: variationKey, lod_seed_id: variationKey } : {}),
      surface_id: binding.geometry_id,
      anchor_uv: anchor,
      center,
      size,
      tangent: axes[0],
      bitangent: axes[1],
      normal: axes[2]
    });
    group.records.push(packed);
  };
  for (const b of contacts.connections.bricks)
    append(b.primaryWallId, b.placement.wallIds, "wall_junction", "brick", "connection-bricks", b.domain96, b.packed64);
  for (const b of contacts.connections.beams)
    append(
      b.primaryWallId,
      b.placement.wallIds,
      "wall_junction",
      "wooden_plank",
      "connection-beams",
      b.packed80,
      b.packed80
    );
  contacts.merlons.groups.forEach((g, index) => {
    const pair = [g.candidate.flatId, g.candidate.pitchedId];
    for (const b of g.bricks)
      append(pair[0], pair, "roof_junction", "brick", "inter-roof-bricks-" + index, b.domain96, b.packed64);
    for (const b of g.beams)
      append(pair[0], pair, "roof_junction", "wooden_plank", "inter-roof-beams-" + index, b.packed80, b.packed80);
  });
  return [...groups.values()];
}

export interface ProfileJunctionOwner
  extends Pick<ProfileWallGeometry, "id" | "slot" | "shape" | "profile" | "variationKey"> {
  nativeId: bigint;
  wallBinding?: MasonryBinding;
  roofBinding?: MasonryBinding;
}
