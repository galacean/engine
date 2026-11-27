import { compileRockAtom, type RockAtom, type AtomKind } from "./RockAtoms";
import { planningAtomCatalog } from "./InteractiveLandforms";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
/** Grow an irregular group from overlapping neighbours. No rows, mirrored perimeter or fixed silhouette.
 * Atom profiles retain support/taper/top responsibilities; positions and orientations belong to the group.
 * Optional landing width reserves a flat top above adjoining pieces; actual access still
 * requires terrain/collision verification. Other profiles make no walkable-ascent promise.
 */
export function composeRockGroup(
  seed: number,
  key: string,
  size: {
    lengthM: number;
    heightM: number;
    count: number;
    variation: number;
    plateau?: boolean;
    profiles?: AtomKind[];
    landingMinimumWidthM?: number;
  }
): RockAtom[] {
  const random = (suffix: string) => settlementRandom(seed, `${key}:${suffix}`);
  const atoms: RockAtom[] = [],
    catalog = planningAtomCatalog();
  const kinds: AtomKind[] =
    size.profiles ??
    (size.plateau
      ? ["terrace/cap", "terrace/cap", "buttress/shoulder", "wall"]
      : ["crown", "wall", "buttress/shoulder", "mass", "spire"]);
  const count = Math.max(2, Math.min(12, Math.round(size.count)));
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(random(`${i}:kind`) * kinds.length)];
    const width = size.lengthM * (0.2 + random(`${i}:w`) * 0.2),
      depth = width * (0.55 + random(`${i}:d`) * 0.65);
    const parent = atoms[Math.floor(random(`${i}:parent`) * atoms.length)];
    const angle = random(`${i}:angle`) * Math.PI * 2;
    const step = parent ? (parent.width + width) * (0.18 + random(`${i}:overlap`) * 0.14) : 0;
    const height = size.heightM * (size.plateau ? 0.65 + random(`${i}:h`) * 0.35 : 0.3 + random(`${i}:h`) * 0.7);
    const definition = catalog[kind];
    const shifted = {
      ...definition,
      parts: definition.parts.map(
        ([x, z, b, w, d, h]) =>
          [
            x + (random(`${i}:${b}:x`) - 0.5) * Math.min(0.18, 1 - w) * size.variation,
            z + (random(`${i}:${b}:z`) - 0.5) * Math.min(0.18, 1 - d) * size.variation,
            b,
            w,
            d,
            h
          ] as const
      )
    };
    atoms.push(
      compileRockAtom(
        {
          id: `${key}-${i}`,
          kind,
          x: (parent?.x ?? 0) + Math.cos(angle) * step,
          z: (parent?.z ?? 0) + Math.sin(angle) * step,
          baseY: 0,
          yaw: random(`${i}:yaw`) * Math.PI * 2,
          width,
          depth,
          height
        },
        { ...catalog, [kind]: shifted }
      )
    );
  }
  // Normalize the whole group to an explicit metre span; this is an authoring extent, not a circle boundary.
  const corners = atoms.flatMap((a) =>
    a.boxes.flatMap((b) =>
      [-1, 1].flatMap((u) =>
        [-1, 1].map((v) => ({
          x: b.center.x + ((u * b.sizeX) / 2) * Math.cos(b.yaw) - ((v * b.sizeZ) / 2) * Math.sin(b.yaw),
          z: b.center.z + ((u * b.sizeX) / 2) * Math.sin(b.yaw) + ((v * b.sizeZ) / 2) * Math.cos(b.yaw)
        }))
      )
    )
  );
  const minX = Math.min(...corners.map((p) => p.x)),
    maxX = Math.max(...corners.map((p) => p.x)),
    minZ = Math.min(...corners.map((p) => p.z)),
    maxZ = Math.max(...corners.map((p) => p.z));
  const scale = size.lengthM / Math.max(maxX - minX, maxZ - minZ),
    cx = (minX + maxX) / 2,
    cz = (minZ + maxZ) / 2;
  const normalized = atoms.map((a) => ({
    ...a,
    x: (a.x - cx) * scale,
    z: (a.z - cz) * scale,
    width: a.width * scale,
    depth: a.depth * scale,
    boxes: a.boxes.map((b) => ({
      ...b,
      center: { x: (b.center.x - cx) * scale, z: (b.center.z - cz) * scale },
      sizeX: b.sizeX * scale,
      sizeZ: b.sizeZ * scale
    }))
  }));
  if (size.landingMinimumWidthM !== undefined) {
    const candidates = normalized.filter((a) => Math.min(a.width, a.depth) >= size.landingMinimumWidthM!);
    if (!candidates.length) return [];
    const landing = candidates.reduce((a, b) => (a.width * a.depth > b.width * b.depth ? a : b));
    // Preserve random footprints and orientations. One flat support stays above its neighbours,
    // so their decorative upper tiers cannot occupy the required landing surface.
    return normalized.map((a) =>
      a === landing
        ? compileRockAtom({ ...a, kind: "mass", height: size.heightM })
        : {
            ...a,
            height: a.height * 0.65,
            boxes: a.boxes.map((b) => ({ ...b, sizeY: b.sizeY * 0.65, elevation: (b.elevation ?? 0) * 0.65 }))
          }
    );
  }
  return normalized;
}
