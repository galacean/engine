/** Serializable carving intent. Actual bed height and water depth are derived results. */
export interface RiverTerrainModifier {
  schemaVersion: 1;
  id: string;
  riverId: string;
  mode: "carve-only";
  targetBedDepth: number;
  /** Flat bed width relative to the River's authored full width. */
  bedWidthRatio: number;
  bankWidth: number;
  falloff: "linear" | "smoothstep";
}

export function createRiverTerrainModifier(riverId: string): RiverTerrainModifier {
  return {
    schemaVersion: 1,
    id: `${riverId}-channel`,
    riverId,
    mode: "carve-only",
    targetBedDepth: 2,
    bedWidthRatio: 0.6,
    bankWidth: 2,
    falloff: "smoothstep"
  };
}

export function validateRiverTerrainModifier(value: unknown, riverId: string): RiverTerrainModifier {
  const keys = ["schemaVersion", "id", "riverId", "mode", "targetBedDepth", "bedWidthRatio", "bankWidth", "falloff"];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("河槽 modifier 格式无效");
  const m = value as RiverTerrainModifier;
  if (
    m.schemaVersion !== 1 ||
    m.riverId !== riverId ||
    typeof m.id !== "string" ||
    !m.id.trim() ||
    m.id.length > 128 ||
    m.mode !== "carve-only" ||
    !["linear", "smoothstep"].includes(m.falloff)
  )
    throw new Error("河槽 modifier 身份、版本或模式无效");
  for (const [name, min, max] of [
    ["targetBedDepth", 0.1, 10],
    ["bedWidthRatio", 0.1, 1],
    ["bankWidth", 0.1, 10]
  ] as const) {
    if (typeof m[name] !== "number" || !Number.isFinite(m[name]) || m[name] < min || m[name] > max)
      throw new Error(`河槽 ${name} 须为 ${min}–${max}`);
  }
  return {
    schemaVersion: 1,
    id: m.id,
    riverId,
    mode: "carve-only",
    targetBedDepth: m.targetBedDepth,
    bedWidthRatio: m.bedWidthRatio,
    bankWidth: m.bankWidth,
    falloff: m.falloff
  };
}
