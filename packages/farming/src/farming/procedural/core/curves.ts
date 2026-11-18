export type PlantPoint = readonly [number, number, number];
export type PlantUV = readonly [number, number];
export interface GrowthKey<T> {
  readonly age: number;
  readonly value: T;
}
export type GrowthCurve<T> = readonly GrowthKey<T>[];

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const pointMix = (a: PlantPoint, b: PlantPoint, t: number): PlantPoint => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t)
];
export const growthEase = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export const mixPlantAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Curves clamp at their own endpoints and can have any number of authoring keys. */
export function sampleGrowthCurve<T>(
  keys: GrowthCurve<T>,
  age: number,
  interpolate: (a: T, b: T, t: number) => T,
  smooth = true
): T {
  if (!Number.isFinite(age)) throw new Error("生长进度必须是有限数值");
  if (!keys.length) throw new Error("生长曲线不能为空");
  if (age <= keys[0].age) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    if (age === keys[i].age) return keys[i].value;
    if (age <= keys[i].age) {
      const a = keys[i - 1],
        b = keys[i];
      const t = (age - a.age) / (b.age - a.age);
      return interpolate(a.value, b.value, smooth ? growthEase(t) : t);
    }
  }
  return keys[keys.length - 1].value;
}

export const sampleScalarCurve = (keys: GrowthCurve<number>, age: number) => sampleGrowthCurve(keys, age, mix);
export const sampleColorCurve = (keys: GrowthCurve<PlantPoint>, age: number) =>
  sampleGrowthCurve(keys, age, pointMix, false);
