export interface SlabSettings {
  enabled: boolean;
  seed: number;
  size: number;
  coverage: number;
  depth: number;
  variation: number;
}
export const defaultSlabSettings = (): SlabSettings => ({
  enabled: true,
  seed: 17,
  size: 28,
  coverage: 0.65,
  depth: 2,
  variation: 0.85
});

export function validateSlabSettings(value: SlabSettings | undefined): void {
  if (value === undefined) return;
  if (!value || typeof value.enabled !== "boolean") throw Error("Invalid slab configuration");
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff)
    throw Error("Slab seed must be an unsigned 32-bit integer");
  for (const [key, min, max] of [
    ["size", 2, 120],
    ["coverage", 0, 1],
    ["depth", 0.1, 20],
    ["variation", 0, 1]
  ] as const)
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max)
      throw Error(`Slab ${key}: expected ${min}…${max}`);
}
