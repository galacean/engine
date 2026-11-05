import * as z from "zod";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { jsonObjectSchema } from "./tool-contract.ts";
import type { BuildingDraft } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingDraft";

const vector3 = z.tuple([z.number(), z.number(), z.number()]);
export const buildingGenerateContract = defineSeedWorldApiContract({
  name: "building.generate",
  effect: "read",
  domain: "building",
  description:
    "调用新版建筑风格生成器，返回可持久化的平铺 BuildingPartComponent Prefab Source。不创建场景对象、不铺设或渲染。",
  inputDescription:
    "generator 对应 Building.European 的同名函数；parameters 使用该函数的原有参数，必须含 id。只有 buildHouses 接受参数数组。source.id 是 Prefab 根身份；assetLibrary 使用现有 BuildingGroupComponent 的真实资产库路径。原生轮廓建筑 position.y 为 0，地形由场景宿主求解。",
  outputDescription:
    "content 是 Prefab JSON；在同一 execute 中交给 editor.asset.create({path,type:'Prefab',content})，再用 editor.entity.create 实例化。execute 提交后才生成渲染结果。后续修改通过组件 Source 事务，勿持久化第二份生成器参数。",
  input: z.strictObject({
    generator: z.enum([
      "European.buildHouses",
      "European.buildTower",
      "European.buildWall",
      "European.buildFence",
      "European.buildSteps"
    ]),
    parameters: z.union([jsonObjectSchema, z.array(jsonObjectSchema).min(1)]),
    source: z.strictObject({
      id: z.string().min(1),
      name: z.string().optional(),
      assetLibrary: z.string().min(1),
      position: vector3.optional(),
      rotation: vector3.optional()
    })
  }),
  output: z.strictObject({ content: z.string() })
});

export const SEED_WORLD_BUILDING_CONTRACTS = Object.freeze([buildingGenerateContract]);

/** Pure transport boundary. Generator defaults, normalization and validation
 * belong to the same functions used by native Scripts, not a second planner. */
export function createSeedWorldBuildingTools() {
  return [
    defineSeedWorldTool(buildingGenerateContract, {
      execute: async (input, { signal }) => {
        signal.throwIfAborted();
        if (Array.isArray(input.parameters) && input.generator !== "European.buildHouses")
          throw Error("Only European.buildHouses accepts multiple parameter objects");
        const { European } = await import("@galacean/engine-building/tiny-glade/parts/architecture/European");
        const { buildingDraftSource } = await import(
          "@galacean/engine-building/tiny-glade/parts/architecture/BuildingSource"
        );
        signal.throwIfAborted();
        const name = input.generator.slice("European.".length) as keyof typeof European;
        const build: (parameters: never) => BuildingDraft = European[name];
        const source = buildingDraftSource(build(input.parameters as never), input.source);
        return {
          content: JSON.stringify({
            asset: { version: "2.0" },
            root: source.rootEntities[0],
            entities: source.entities,
            components: source.components
          })
        };
      }
    })
  ];
}
