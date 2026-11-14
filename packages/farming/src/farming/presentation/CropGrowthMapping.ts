import type { CropDefinition } from "../domain/FarmDefinitions";

export interface PlantAppearanceBinding {
  readonly plantId: string;
  readonly plantRevision: number;
  readonly recipeRevision: number;
  readonly ageByStage: readonly { readonly stageId: string; readonly age: number }[];
  readonly emergence: { readonly start: number; readonly end: number };
}

export function requireProgress(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("成长进度必须在 0..1 之间");
}

/** Pure mapping; the domain owns the cycle and the renderer never advances it. */
export class CropGrowthMapping {
  readonly keys: readonly { progress: number; age: number }[];
  readonly emergenceStart: number;
  readonly emergenceEnd: number;
  constructor(readonly crop: CropDefinition) {
    const binding = crop.appearance;
    const stages = crop.cycle.stages;
    if (binding.ageByStage.length !== stages.length) throw new Error("每个周期阶段都必须有形态映射");
    this.keys = binding.ageByStage.map((key, i) => {
      if (key.stageId !== stages[i].id) throw new Error(`形态阶段缺失或顺序错误：${key.stageId}`);
      requireProgress(key.age);
      if (i && key.age < binding.ageByStage[i - 1].age) throw new Error("形态 age 必须单调递增");
      return Object.freeze({ progress: stages[i].minimumProgress, age: key.age });
    });
    if (
      this.keys[0].progress !== 0 ||
      this.keys[0].age !== 0 ||
      this.keys.at(-1)!.progress !== 1 ||
      this.keys.at(-1)!.age !== 1
    )
      throw new Error("形态映射必须完整覆盖播种到成熟");
    const { start, end } = binding.emergence;
    requireProgress(start);
    requireProgress(end);
    if (start >= end || this.age(end) !== 0) throw new Error("出苗区间必须在幼苗形态开始之前结束");
    this.emergenceStart = start;
    this.emergenceEnd = end;
    Object.freeze(this.keys);
  }
  age(progress: number): number {
    requireProgress(progress);
    for (let i = 1; i < this.keys.length; i++) {
      const a = this.keys[i - 1],
        b = this.keys[i];
      if (progress <= b.progress)
        return a.age + ((b.age - a.age) * (progress - a.progress)) / (b.progress - a.progress);
    }
    return 1;
  }
  /** Debugger converts a raw recipe sample back into an explicit cycle input. */
  progressAtAge(age: number): number {
    requireProgress(age);
    for (let i = 1; i < this.keys.length; i++) {
      const a = this.keys[i - 1],
        b = this.keys[i];
      if (b.age > a.age && age <= b.age)
        return a.progress + ((b.progress - a.progress) * (age - a.age)) / (b.age - a.age);
    }
    return 1;
  }
  emergence(progress: number): number {
    requireProgress(progress);
    if (progress >= this.emergenceEnd) return 1;
    if (progress <= this.emergenceStart) return 0;
    const t = (progress - this.emergenceStart) / (this.emergenceEnd - this.emergenceStart);
    return t * t * (3 - 2 * t);
  }
}

/** Shared by update scheduling and visibility restoration. NaN still marks unapplied shape edits. */
export function growthProgressMatches(applied: number, target: number): boolean {
  return Number.isFinite(applied) && Math.abs(applied - target) < 1e-7;
}

/** No extrapolation: rendering interpolates only toward an authoritative snapshot. */
export class CropVisualTimeline {
  private from = 0;
  target = 0;
  private start = 0;
  private duration = 0;
  sample(now: number): number {
    if (!this.duration) return this.target;
    const t = Math.max(0, Math.min(1, (now - this.start) / this.duration));
    if (t === 1) return this.target;
    return this.from + (this.target - this.from) * t;
  }
  push(target: number, now: number, duration: number, snap = false): void {
    target = Math.max(0, Math.min(1, target));
    if (snap || target < this.target) {
      this.from = this.target = target;
      this.start = now;
      this.duration = 0;
      return;
    }
    if (target === this.target) return;
    this.from = this.sample(now);
    this.target = target;
    this.start = now;
    this.duration = Math.max(0, duration);
  }
  snap(): void {
    this.from = this.target;
    this.duration = 0;
  }
}
