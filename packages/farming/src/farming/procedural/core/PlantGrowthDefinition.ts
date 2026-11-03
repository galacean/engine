import { z } from "zod";
import type { GrowthCurve, PlantPoint } from "./curves";
import type { PlantGrowthRecipe } from "./PlantGrowthRecipe";
import { growthCurveSchema } from "./validation";

export interface PlantMaterialDefinition {
  readonly alphaCutoff: number;
  readonly doubleSided: boolean;
  readonly roughness: number;
  readonly metallic: number;
  readonly tintColors?: GrowthCurve<PlantPoint>;
}
export interface PlantGrowthMetadata {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: { readonly author: string; readonly license: string; readonly url: string };
  readonly material: PlantMaterialDefinition;
  readonly preview: {
    readonly initialAge: number;
    readonly durationSeconds: number;
    readonly landmarks: readonly { readonly age: number; readonly label: string }[];
    readonly phases: readonly { readonly age: number; readonly label: string }[];
    readonly note: string;
    readonly fruitLabel?: string;
    readonly fruitUnit?: string;
    readonly materialNote?: string;
  };
}
export interface PlantGrowthDefinition extends PlantGrowthMetadata {
  readonly recipe: PlantGrowthRecipe;
  readonly atlasUrl: string;
}
const unit = z.number().finite().min(0).max(1);
const label = z.string().min(1);
const markers = z
  .array(z.object({ age: unit, label }))
  .min(1)
  .max(32)
  .refine((keys) => keys.every((k, i) => i === 0 || k.age > keys[i - 1].age), "展示阶段必须严格递增");
const schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  id: label,
  name: label,
  description: label,
  source: z.object({
    author: label,
    license: label,
    url: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//.test(value), "来源需要 HTTP 链接")
  }),
  material: z.object({
    alphaCutoff: unit,
    doubleSided: z.boolean(),
    roughness: unit,
    metallic: unit,
    tintColors: growthCurveSchema(z.tuple([unit, unit, unit])).optional()
  }),
  preview: z.object({
    initialAge: unit,
    durationSeconds: z.number().finite().positive().max(3600),
    landmarks: markers,
    phases: markers,
    note: label,
    fruitLabel: label.optional(),
    fruitUnit: label.optional(),
    materialNote: label.optional()
  })
});
export const parsePlantGrowthMetadata = (value: unknown): PlantGrowthMetadata => schema.strict().parse(value);
export function plantGrowthPhase(definition: PlantGrowthMetadata, age: number): string {
  const phases = definition.preview.phases;
  let label = phases[0].label;
  for (const phase of phases) {
    if (age < phase.age) break;
    label = phase.label;
  }
  return label;
}
