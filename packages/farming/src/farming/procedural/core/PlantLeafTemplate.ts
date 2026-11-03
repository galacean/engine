import type { GrowthCurve, PlantPoint, PlantUV } from "./curves";
import type { PlantGrowthRecipe, PlantLeaf } from "./PlantGrowthRecipe";

/** Dimensions are in metres; droop is the fraction of length lost to the arch. */
export interface PlantBladeShape {
  readonly length: number;
  readonly width: number;
  readonly bend: number;
  readonly droop: number;
  readonly ridge: number;
}
export interface PlantLeafTemplate {
  readonly id: string;
  readonly columns: number;
  readonly rows: number;
  readonly uv: PlantUV;
  readonly poses: GrowthCurve<PlantBladeShape>;
}
export interface PlantTemplateLeaf {
  readonly id: string;
  readonly anchor: string;
  readonly template: string;
  readonly size: PlantPoint;
  readonly scale?: GrowthCurve<number>;
}

/** Compact authoring document. Measured leaves remain available alongside blade templates. */
export interface PlantGrowthRecipeDocument extends Omit<PlantGrowthRecipe, "leaves"> {
  readonly schemaVersion: 1;
  readonly leafTemplates: readonly PlantLeafTemplate[];
  readonly leaves: readonly (PlantLeaf | PlantTemplateLeaf)[];
}

/** Expands a validated document once, before instances allocate their own dynamic geometry. */
export function compilePlantLeafTemplates(document: PlantGrowthRecipeDocument): PlantGrowthRecipe {
  const templates = new Map(
    document.leafTemplates.map((template) => [
      template.id,
      template.poses.map(({ age, value }) => ({
        age,
        value: Array.from({ length: template.rows * template.columns }, (_, index): PlantPoint => {
          const t = Math.floor(index / template.columns) / (template.rows - 1);
          const side = ((index % template.columns) / (template.columns - 1)) * 2 - 1;
          const arch = Math.sin(Math.PI * t);
          return [
            value.bend * t * t,
            value.length * (t - value.droop * t * t) + (1 - Math.abs(side)) * value.ridge * arch,
            (side * value.width * Math.pow(arch, 0.65)) / 2
          ];
        })
      }))
    ])
  );
  const { schemaVersion: _format, leafTemplates: _templates, ...content } = document;
  return {
    ...content,
    surfaces: [
      ...document.surfaces,
      ...document.leafTemplates.map((template) => ({
        id: template.id,
        columns: template.columns,
        rows: template.rows,
        uvs: Array.from({ length: template.columns * template.rows }, () => template.uv),
        lengthSample: (template.rows - 1) * template.columns + Math.floor(template.columns / 2)
      }))
    ],
    leaves: document.leaves.map(
      (leaf): PlantLeaf =>
        "template" in leaf
          ? {
              id: leaf.id,
              anchor: leaf.anchor,
              surface: leaf.template,
              scale: leaf.scale,
              poses: templates.get(leaf.template)!.map(({ age, value }) => ({
                age,
                value: value.map((p): PlantPoint => [p[0] * leaf.size[0], p[1] * leaf.size[1], p[2] * leaf.size[2]])
              }))
            }
          : leaf
    )
  };
}
