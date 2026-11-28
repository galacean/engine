import type { SeedWorldRockAssetObbProfile } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";
import { SEED_WORLD_ROCK_CLIF_1_ASSET_TO_CANONICAL_QUATERNION } from "@galacean/engine-world-planning/world/SeedWorldAssetPlacementProfile";
import { SEED_WORLD_ROCK_CLIF_1_CONTACT_GEOMETRY, type SeedWorldRockContactGeometry } from "@galacean/engine-world-planning/runtime/SeedWorldRockPlacements";

// LOD0's narrow, highest end is authored at -Z; canonical +Z always rises toward the terrain crest.
const CLIFF_1_ASSET_TO_CANONICAL_QUATERNION = SEED_WORLD_ROCK_CLIF_1_ASSET_TO_CANONICAL_QUATERNION;

/** Canonical OBB profile of the pointed Clif_1 acceptance asset. */
export const SEED_WORLD_CLIFF_1_ASSET_PROFILE = makeProfile(
  "clif-1",
  "rock-clif-1",
  SEED_WORLD_ROCK_CLIF_1_CONTACT_GEOMETRY,
  CLIFF_1_ASSET_TO_CANONICAL_QUATERNION,
  0.3
);

/** Active authored Clif profiles available to every rock-composition solve. */
export const SEED_WORLD_CLIFF_ASSET_CATALOG = Object.freeze<readonly SeedWorldRockAssetObbProfile[]>([
  SEED_WORLD_CLIFF_1_ASSET_PROFILE
]);

function makeProfile(
  id: string,
  prototypeFamily: string,
  geometry: SeedWorldRockContactGeometry,
  assetToCanonicalQuaternion: readonly [x: number, y: number, z: number, w: number] = [0, 0, 0, 1],
  tailDetailRevealRatio = 0
): SeedWorldRockAssetObbProfile {
  const { minimum, maximum } = geometry.bounds;
  const authoredCenter = Object.freeze([
    (minimum[0] + maximum[0]) * 0.5,
    (minimum[1] + maximum[1]) * 0.5,
    (minimum[2] + maximum[2]) * 0.5
  ] as const);
  const authoredSupportOffsetsMetres = Object.freeze(
    geometry.supportPoints.map((point) =>
      Object.freeze([point[0] - authoredCenter[0], point[1] - authoredCenter[1], point[2] - authoredCenter[2]] as const)
    )
  );
  if (!geometry.topSurfacePoints) {
    throw new RangeError(`Rock asset OBB profile "${id}" requires authored upper-surface detail samples`);
  }
  const canonicalDetailOffsetsMetres = Object.freeze(
    geometry.topSurfacePoints.map((point) =>
      rotateVectorByQuaternion(
        [point[0] - authoredCenter[0], point[1] - authoredCenter[1], point[2] - authoredCenter[2]],
        assetToCanonicalQuaternion
      )
    )
  );
  const tailSampleCount = Math.max(1, Math.ceil(canonicalDetailOffsetsMetres.length / 3));
  const canonicalTailDetailOffsetsMetres = Object.freeze(
    canonicalDetailOffsetsMetres
      .slice()
      .sort((left, right) => left[2] - right[2] || right[1] - left[1])
      .slice(0, tailSampleCount)
  );
  return Object.freeze({
    id,
    prototypeFamily,
    canonicalSizeMetres: Object.freeze([
      maximum[0] - minimum[0],
      maximum[1] - minimum[1],
      maximum[2] - minimum[2]
    ] as const),
    canonicalCenterMetres: rotateVectorByQuaternion(authoredCenter, assetToCanonicalQuaternion),
    authoredSupportOffsetsMetres,
    canonicalSupportOffsetsMetres: Object.freeze(
      authoredSupportOffsetsMetres.map((offset) => rotateVectorByQuaternion(offset, assetToCanonicalQuaternion))
    ),
    canonicalDetailOffsetsMetres,
    canonicalTailDetailOffsetsMetres,
    tailDetailRevealRatio,
    assetToCanonicalQuaternion: Object.freeze(assetToCanonicalQuaternion)
  });
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return Object.freeze([
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  ] as const);
}
