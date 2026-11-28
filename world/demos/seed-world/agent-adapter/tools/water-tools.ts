import * as z from "zod";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";

const digRiver = defineSeedWorldApiContract({
  name: "water.digRiver",
  domain: "water",
  description: "在玩家面前挖河或溪流，在一次项目编辑中一起创建河床和原生河流水面。",
  inputDescription: "直接调用一次。未指定距离时优先玩家正前方 20 米，自动绕开现成水体。用户未提供尺寸或距离时传 {}。",
  outputDescription: "返回河流标识和中心线。以外层 execute 提交及运行回执确认发布。",
  input: z.strictObject({
    distanceMetres: z.number().min(5).max(150).optional().describe("河道两端连线中点到玩家的距离，默认 20 米"),
    lengthMetres: z.number().min(8).max(100).optional().describe("河道横向跨度，默认 32 米"),
    widthMetres: z.number().min(1).max(16).optional().describe("河道宽度，默认 6 米"),
    depthMetres: z.number().min(0.25).max(3).optional().describe("河道深度，默认 0.8 米")
  }),
  output: z.strictObject({
    id: z.string(),
    centerline: z.array(z.strictObject({ x: z.number(), z: z.number() }))
  })
});

export const SEED_WORLD_WATER_EDIT_CONTRACTS = [digRiver] as const;

/** Bind Seed World's terrain-backed river authoring to the Agent's project edit. */
export function createSeedWorldWaterTools(application: SeedWorldAgentApplication) {
  return [defineSeedWorldTool(digRiver, {
    execute: (input, { signal }) => application.digRiver(input, signal)
  })];
}
