import { windowShutterBaseQuaternion, settledWindowShutterRotation } from "./RecoveredWindowShutter";
import { requireDecorationCollision, type ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import type { UnitFootprintScale } from "./MaterialFootprint";
import { add, sub, mul, f32, type RoofCurve, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import type { CottageDormerFrameTransform } from "./RecoveredCottageDormerPlacement";
import {
  recoveredCottageWallPlacement,
  recoveredCottageWallCut,
  rotateCottageVector
} from "./RecoveredCottageWallPlacement";
import { cottageHalfDormerHasShutters } from "./RecoveredHalfDormer";
import { cottageHalfDormerHoles48 } from "./RecoveredCottageDormerHoles";
import { cottageDecorationWallHole } from "./RecoveredDecorationWallHoles";
import { assembleCottageDormerRoof, packCottageStrip64 } from "./RecoveredCottageDormerRoof";

/** Original half Cottage assembly (wall producer086, roof producer148).
 * The host validates eave crossing, gable/flat exclusion and occupied space.
 * Cached roof anchoring and reconstructed wall-body anchoring are deliberately
 * distinct. A curved wall's cached transform must not be replaced by its chord.
 * Shutters use the original settled hinge orientation. Native transient easing
 * is separate from the project's building entrance animation.
 */
export function generateCottageHalfDormer(
  collisions: ConstructionDecorationCollisions | undefined,
  spec: {
    id: string;
    hostId: string;
    rank: 1 | 2 | 3;
    cachedTransform: CottageDormerFrameTransform;
    wallX: number;
    pivotY: number;
    seed: number;
    /** Author resizing extension; fixed native offsets stay in metres. */
    scale?: readonly [number, number, number];
  },
  host: {
    wall: { kind: "rectangle" } | { kind: "circle"; curve: RoofCurve; wallSpaceLength?: number };
    wallMaxY: number;
    /** Native stone-foundation suppression only; never substitute column height. */
    foundationTransitionY: number | undefined;
    surface: RoofSurface;
    footprint: RoofFootprint;
    renderSlot: number;
    tileScale?: UnitFootprintScale;
    tileSeed?: bigint;
  }
) {
  if (!spec.id || !spec.hostId || ![1, 2, 3].includes(spec.rank))
    throw Error("Stable half-dormer/host identities and rank 1..3 required");
  if (![spec.wallX, spec.pivotY, host.wallMaxY].every((v) => Number.isFinite(f32(v))))
    throw Error("Finite half-dormer wall coordinates required");
  const scale = spec.scale ?? [1, 1, 1];
  if (scale.length !== 3 || !scale.every((v) => Number.isFinite(f32(v)) && f32(v) > 0))
    throw Error("Positive finite half-dormer scale required");
  const [sx, sy] = scale;
  const collision = requireDecorationCollision(collisions, `window_cottage_${spec.rank}x1_halfdormer_collision`);
  const sourceWidth = sub(collision.max[0], collision.min[0]),
    width = mul(sourceWidth, sx),
    height = mul(sub(collision.max[1], collision.min[1]), sy);
  if (host.wall.kind === "circle" && width >= (host.wall.wallSpaceLength ?? host.wall.curve.length))
    throw Error("Half-dormer collision span covers the entire closed wall");
  // Validate the cache even for curved bodies: producer148 still consumes it.
  const cached = spec.cachedTransform;
  if (
    cached.position.length !== 3 ||
    cached.quaternion.length !== 4 ||
    cached.scale.length !== 3 ||
    ![...cached.position, ...cached.quaternion, ...cached.scale].every((v) => Number.isFinite(f32(v))) ||
    !cached.scale.every((v) => f32(v) > 0) ||
    !cached.quaternion.some((v) => v !== 0)
  )
    throw Error("Finite original half-dormer cached transform required");
  const placement = recoveredCottageWallPlacement(
    host.wall.kind === "rectangle"
      ? { kind: "rectangle", cached }
      : {
          kind: "curve",
          curve: host.wall.curve,
          wallSpaceLength: host.wall.wallSpaceLength,
          closed: true,
          wallX: spec.wallX,
          pivotY: spec.pivotY,
          collisionWidth: width
        }
  );
  const frame = placement.frame,
    glass = placement.glass!;
  for (const transform of [frame, glass]) transform.scale = transform.scale.map((v, i) => mul(v, scale[i]));
  const hasShutters = cottageHalfDormerHasShutters(
    spec.rank,
    spec.seed,
    spec.pivotY,
    mul(collision.min[1], sy),
    host.foundationTransitionY
  );
  const id = JSON.stringify([spec.hostId, spec.id]);
  const holes48 = cottageHalfDormerHoles48(
    frame.position,
    frame.quaternion,
    width,
    height,
    host.renderSlot,
    hasShutters
  );
  // The native separate roof producer uses cached XZ and public maxY. In
  // particular it does not inherit the body chord or its local +.14 offset.
  const roofPosition = [f32(cached.position[0]), f32(host.wallMaxY), f32(cached.position[2])];
  const roofRise = sub(mul(height, 0.5), sub(host.wallMaxY, cached.position[1]));
  if (!(roofRise > 0)) throw Error("Half-dormer roof does not rise above the host eave");
  const strips = assembleCottageDormerRoof(
    roofPosition,
    spec.rank,
    mul(add(sourceWidth, 0.2), sx),
    roofRise,
    mul([0.1, 0.05, 0.3][spec.rank - 1], sx),
    new RecoveredCottageRoofSampler(host.surface, host.footprint),
    host.renderSlot,
    true,
    host.tileScale,
    host.tileSeed
  );
  return {
    id,
    hostId: spec.hostId,
    sourceId: spec.id,
    rank: spec.rank,
    placements: { body: frame, glass },
    hasShutters,
    windowCut: recoveredCottageWallCut(frame, spec.rank, [spec.wallX, spec.pivotY], true, [sx, sy]),
    wallHoles: [
      cottageDecorationWallHole(
        collisions,
        spec.rank,
        host.wall.kind === "circle",
        spec.wallX,
        spec.pivotY,
        sx,
        sy,
        "half"
      )
    ],
    holes48,
    shutters: hasShutters
      ? ([0, 1] as const).map((side) => ({
          id: `${id}/shutter/${side}`,
          mesh: "window_shutter",
          side,
          transform: {
            position: rotateCottageVector(frame.quaternion, [mul(width, side === 0 ? 0.45 : -0.45), 0, f32(0.2)]).map(
              (v, i) => add(frame.position[i], v)
            ),
            quaternion: settledWindowShutterRotation(
              windowShutterBaseQuaternion(rotateCottageVector(frame.quaternion, [0, 0, 1])),
              side
            ),
            // Original clutter ignores copied source scale. Author resize is an
            // explicit extension, independent of that ignored native field.
            scale: scale.map(f32)
          }
        }))
      : [],
    strips: strips.map((strip) => ({
      ...strip,
      id: `${id}/${strip.role}/${strip.row}/${strip.column}`,
      initial64: packCottageStrip64(strip)
    }))
  };
}
