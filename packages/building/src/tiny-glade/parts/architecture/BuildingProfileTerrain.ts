import type { BuildingDraft } from "./BuildingDraft";
import type { BuildingPlacementFrame } from "./BuildingTerrain";
import { normalizeProfileFootprint } from "../../runtime/ProfileParameters";

/** Support sampling extent for the native wall profile algorithms. Other support
 * generators must publish their own extents before they can run in this Worker. */
export function profileSupportRegion(
  draft: BuildingDraft,
  frame: BuildingPlacementFrame = { position: [0, 0, 0], rotationY: 0 }
) {
  const c = Math.cos(frame.rotationY),
    s = Math.sin(frame.rotationY);
  const region = [Infinity, Infinity, -Infinity, -Infinity];
  for (const part of draft.parts) {
    if (!["wallProfile", "wallStrip"].includes(part.support.generator)) continue;
    const shape = normalizeProfileFootprint(part.support.params),
      center = shape.circle?.center ?? shape.rectangle!.center,
      angle = shape.rectangle?.rotation ?? 0,
      w =
        shape.circle?.radius ??
        (Math.abs(Math.cos(angle)) * shape.rectangle!.size[0] + Math.abs(Math.sin(angle)) * shape.rectangle!.size[1]) /
          2,
      d =
        shape.circle?.radius ??
        (Math.abs(Math.sin(angle)) * shape.rectangle!.size[0] + Math.abs(Math.cos(angle)) * shape.rectangle!.size[1]) /
          2;
    // Same sampling halo as the profile/support algorithms, not a visible geometry offset.
    for (const x of [center[0] - w - 2, center[0] + w + 2])
      for (const z of [center[1] - d - 2, center[1] + d + 2]) {
        const wx = frame.position[0] + c * x + s * z,
          wz = frame.position[2] - s * x + c * z;
        region[0] = Math.min(region[0], wx);
        region[1] = Math.min(region[1], wz);
        region[2] = Math.max(region[2], wx);
        region[3] = Math.max(region[3], wz);
      }
  }
  if (!region.every(Number.isFinite)) throw Error("Profile grounding requires a wall support");
  return region;
}
