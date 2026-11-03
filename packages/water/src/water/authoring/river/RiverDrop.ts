/** A drop connects two ordinary surface reaches. It is geometry, not a column of water. */
export interface RiverDrop {
  readonly id: string;
  readonly sectionId: string;
  readonly from: string;
  readonly to: string;
  readonly upper: readonly [number, number, number];
  readonly lower: readonly [number, number, number];
  readonly across: readonly [number, number];
  readonly width: number;
}

export function validateRiverDrops(value: unknown): asserts value is readonly RiverDrop[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 4096) throw new Error("INVALID_ARGUMENT: Invalid River drops.");
  const ids = new Set<string>();
  for (const drop of value) {
    if (
      !drop ||
      typeof drop.id !== "string" ||
      !drop.id ||
      ids.has(drop.id) ||
      ![drop.sectionId, drop.from, drop.to].every((v) => typeof v === "string" && v.length > 0) ||
      ![drop.upper, drop.lower].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) ||
      !Array.isArray(drop.across) ||
      drop.across.length !== 2 ||
      !drop.across.every(Number.isFinite) ||
      Math.abs(Math.hypot(...(drop.across as [number, number])) - 1) > 1e-6 ||
      !Number.isFinite(drop.width) ||
      drop.width <= 0 ||
      drop.upper[1] <= drop.lower[1]
    )
      throw new Error("INVALID_ARGUMENT: Invalid River drop geometry or identity.");
    if (
      Math.abs((drop.lower[0] - drop.upper[0]) * drop.across[0] + (drop.lower[2] - drop.upper[2]) * drop.across[1]) >
      1e-6
    )
      throw new Error("INVALID_ARGUMENT: Drop width must be perpendicular to its descent.");
    ids.add(drop.id);
  }
}

/** Closest point on the ruled water curtain, including width and its upper/lower limits. */
export function sampleRiverDrop(drop: RiverDrop, point: readonly [number, number, number]) {
  const axis = drop.lower.map((v, i) => v - drop.upper[i]);
  const along = Math.max(
    0,
    Math.min(1, axis.reduce((s, v, i) => s + (point[i] - drop.upper[i]) * v, 0) / axis.reduce((s, v) => s + v * v, 0))
  );
  const across = Math.max(
    -drop.width / 2,
    Math.min(drop.width / 2, (point[0] - drop.upper[0]) * drop.across[0] + (point[2] - drop.upper[2]) * drop.across[1])
  );
  const closest: [number, number, number] = [
    drop.upper[0] + axis[0] * along + drop.across[0] * across,
    drop.upper[1] + axis[1] * along,
    drop.upper[2] + axis[2] * along + drop.across[1] * across
  ];
  return {
    id: drop.id,
    sectionId: drop.sectionId,
    kind: "water-curtain" as const,
    closest,
    distance: Math.hypot(...closest.map((v, i) => v - point[i])),
    height: drop.upper[1] - drop.lower[1],
    width: drop.width
  };
}

/** Open interval between the lip and receiving surface; end caps must not fill this gap. */
export function insideRiverDropFootprint(drop: RiverDrop, x: number, z: number): boolean {
  const dx = drop.lower[0] - drop.upper[0],
    dz = drop.lower[2] - drop.upper[2],
    den = dx * dx + dz * dz;
  if (den < 1e-12) return false;
  const t = ((x - drop.upper[0]) * dx + (z - drop.upper[2]) * dz) / den;
  return (
    t > 1e-6 &&
    t < 1 - 1e-6 &&
    Math.abs((x - drop.upper[0]) * drop.across[0] + (z - drop.upper[2]) * drop.across[1]) <= drop.width / 2
  );
}
