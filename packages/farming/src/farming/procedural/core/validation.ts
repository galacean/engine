import { z } from "zod";
import type { PlantGrowthRecipe } from "./PlantGrowthRecipe";
import { compilePlantLeafTemplates } from "./PlantLeafTemplate";
import { freezePlantContent } from "./immutable";

const scalar = z.number().finite();
const age = scalar.min(0).max(1);
const id = z.string().min(1).max(120);
const point = z.tuple([scalar, scalar, scalar]);
const uv = z.tuple([age, age]);
const radii = z.tuple([scalar.nonnegative(), scalar.nonnegative(), scalar.nonnegative()]);
export const growthCurveSchema = <T extends z.ZodType>(value: T) =>
  z
    .array(z.object({ age, value }))
    .min(1)
    .max(256)
    .refine((keys) => keys.every((key, i) => i === 0 || key.age > keys[i - 1].age), "关键点进度必须严格递增");
const scale = growthCurveSchema(scalar.nonnegative().max(100));
const leafSchema = z.object({
  id,
  anchor: id,
  surface: id,
  poses: growthCurveSchema(z.array(point).max(4096)),
  scale: scale.optional()
});
const recipeSchema = z
  .object({
    revision: z.number().int().positive(),
    id,
    anchors: z
      .array(
        z.object({ id, parent: id.optional(), poses: growthCurveSchema(z.object({ offset: point, azimuth: scalar })) })
      )
      .min(1)
      .max(512),
    surfaces: z
      .array(
        z.object({
          id,
          columns: z.number().int().min(2).max(64),
          rows: z.number().int().min(2).max(64),
          uvs: z.array(uv).max(4096),
          lengthSample: z.number().int().nonnegative()
        })
      )
      .max(128),
    stems: z
      .array(
        z.object({
          id,
          path: z.array(id).min(2).max(512),
          radii: growthCurveSchema(z.array(scalar.nonnegative()).max(512)),
          sides: z.number().int().min(3).max(32),
          startDirection: point.refine((p) => Math.hypot(...p) > 1e-9).optional(),
          uv
        })
      )
      .max(256),
    leaves: z.array(leafSchema).max(512),
    volumes: z
      .array(
        z.object({
          id,
          kind: z.enum(["fruit", "root", "flower", "organ"]),
          anchor: id,
          poses: growthCurveSchema(z.object({ offset: point, radii })),
          scale: scale.optional(),
          uv,
          tint: z.boolean(),
          followLeaf: z.object({ id, untilAge: age }).optional()
        })
      )
      .max(512),
    meshes: z
      .array(
        z.object({
          id,
          kind: z.enum(["leaf", "stem", "fruit", "root", "flower", "organ"]),
          anchor: id,
          positions: z.array(point).min(3).max(20000),
          uvs: z.array(uv).min(3).max(20000),
          indices: z.array(z.number().int().nonnegative()).min(3).max(120000),
          poses: growthCurveSchema(
            z.object({ scale: radii, unfold: age, tilt: scalar.min(-Math.PI).max(Math.PI).optional() })
          ),
          tint: z.boolean().optional()
        })
      )
      .max(512)
      .optional(),
    supports: z
      .array(
        z.object({ id, center: point, size: z.tuple([scalar.positive(), scalar.positive(), scalar.positive()]), uv })
      )
      .max(64),
    maturity: growthCurveSchema(age)
  })
  .strict();
export const plantGrowthRecipeSchema = recipeSchema.superRefine((recipe, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const items of [
    recipe.anchors,
    recipe.surfaces,
    [...recipe.stems, ...recipe.leaves, ...recipe.volumes, ...(recipe.meshes ?? []), ...recipe.supports]
  ]) {
    if (new Set(items.map((item) => item.id)).size !== items.length) fail("同类 ID 必须唯一");
  }
  const anchors = new Map(recipe.anchors.map((a) => [a.id, a]));
  for (const anchor of recipe.anchors) {
    const visited = new Set<string>();
    let current: typeof anchor | undefined = anchor;
    while (current) {
      if (visited.has(current.id)) {
        fail(`挂点父子关系存在环：${anchor.id}`);
        break;
      }
      visited.add(current.id);
      if (current.parent && !anchors.has(current.parent)) fail(`挂点 ${current.id} 引用了不存在的父级`);
      current = current.parent ? anchors.get(current.parent) : undefined;
    }
  }
  for (const surface of recipe.surfaces) {
    const count = surface.columns * surface.rows;
    if (surface.uvs.length !== count || surface.lengthSample >= count) fail(`表面 ${surface.id} 的采样网格不匹配`);
  }
  for (const stem of recipe.stems) {
    if (stem.path.some((id) => !anchors.has(id)) || stem.radii.some((key) => key.value.length !== stem.path.length))
      fail(`茎 ${stem.id} 的路径或半径不匹配`);
  }
  for (const leaf of recipe.leaves) {
    const surface = recipe.surfaces.find((s) => s.id === leaf.surface);
    if (
      !anchors.has(leaf.anchor) ||
      !surface ||
      leaf.poses.some((key) => key.value.length !== surface.columns * surface.rows)
    )
      fail(`叶 ${leaf.id} 的挂点或表面不匹配`);
  }
  for (const volume of recipe.volumes) {
    if (!anchors.has(volume.anchor)) fail(`实体 ${volume.id} 的挂点不存在`);
    if (volume.followLeaf && !recipe.leaves.some((leaf) => leaf.id === volume.followLeaf!.id))
      fail(`实体 ${volume.id} 的跟随叶片不存在`);
  }
  for (const mesh of recipe.meshes ?? []) {
    if (!anchors.has(mesh.anchor)) fail(`器官 ${mesh.id} 的挂点不存在`);
    if (
      mesh.uvs.length !== mesh.positions.length ||
      mesh.indices.length % 3 !== 0 ||
      mesh.indices.some((index) => index >= mesh.positions.length)
    )
      fail(`器官 ${mesh.id} 的拓扑或 UV 不匹配`);
  }
  const vertices =
    (recipe.meshes ?? []).reduce((n, mesh) => n + mesh.positions.length, 0) +
    recipe.stems.reduce((n, s) => n + s.path.length * s.sides + 2, 0) +
    recipe.leaves.reduce((n, l) => n + (recipe.surfaces.find((s) => s.id === l.surface)?.uvs.length ?? 0), 0) +
    recipe.volumes.length * 12;
  if (vertices === 0 || vertices > 200_000) fail("配方网格需要 1 至 200000 个顶点");
});

const documentSchema = recipeSchema
  .extend({
    schemaVersion: z.literal(1),
    leafTemplates: z
      .array(
        z.object({
          id,
          columns: z.number().int().min(2).max(64),
          rows: z.number().int().min(2).max(64),
          uv,
          poses: growthCurveSchema(
            z.object({
              length: scalar.nonnegative(),
              width: scalar.nonnegative(),
              bend: scalar,
              droop: age,
              ridge: scalar.nonnegative()
            })
          )
        })
      )
      .max(128),
    leaves: z
      .array(
        z.union([
          leafSchema.strict(),
          z.object({ id, anchor: id, template: id, size: radii, scale: scale.optional() }).strict()
        ])
      )
      .max(512)
  })
  .superRefine((document, ctx) => {
    const ids = [...document.surfaces, ...document.leafTemplates].map((surface) => surface.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "叶型模板与表面 ID 必须唯一" });
    for (const leaf of document.leaves)
      if ("template" in leaf && !document.leafTemplates.some((template) => template.id === leaf.template))
        ctx.addIssue({ code: "custom", message: `叶 ${leaf.id} 的模板不存在` });
    // Compact input must not expand to unbounded temporary arrays before the compiled budget check.
    let samples = document.leafTemplates.reduce((n, t) => n + t.columns * t.rows * t.poses.length, 0);
    for (const leaf of document.leaves) {
      if ("template" in leaf) {
        const template = document.leafTemplates.find((t) => t.id === leaf.template);
        if (template) samples += template.columns * template.rows * template.poses.length;
      } else samples += leaf.poses.reduce((n, key) => n + key.value.length, 0);
    }
    if (samples > 1_000_000) ctx.addIssue({ code: "custom", message: "叶型模板展开后的采样点过多" });
  });

// Only frozen, parsed outputs are trusted. Mutable caller input is never cached.
const validatedRecipes = new WeakSet<object>();

/** Parse and compile untrusted JSON once; instances share this immutable recipe. */
export function parsePlantGrowthRecipe(value: unknown): PlantGrowthRecipe {
  if (value && typeof value === "object" && validatedRecipes.has(value)) return value as PlantGrowthRecipe;
  const input = compilePlantLeafTemplates(documentSchema.strict().parse(value));
  const recipe = freezePlantContent(plantGrowthRecipeSchema.parse(input));
  validatedRecipes.add(recipe);
  return recipe;
}
export function validatePlantGrowthRecipe(value: unknown): asserts value is PlantGrowthRecipe {
  if (value && typeof value === "object" && validatedRecipes.has(value)) return;
  plantGrowthRecipeSchema.parse(value);
}

/** Only parser-owned deeply frozen recipes are safe keys for shared compiled geometry. */
export function isImmutablePlantGrowthRecipe(recipe: PlantGrowthRecipe): boolean {
  return validatedRecipes.has(recipe);
}
