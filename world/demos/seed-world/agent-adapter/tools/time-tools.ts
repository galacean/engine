import * as z from "zod";

import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import type { SeedWorldTimeUpdateInput } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import { emptyToolInputSchema, environmentUpdateOutputSchema, seasonSchema } from "./tool-contract.ts";

const timeHoursSchema = z.number().min(0).max(24).describe("目标世界时刻，0 和 24 都表示午夜");
const transitionDurationSchema = z.number().min(0).max(60).optional().describe("现实中的过渡秒数。用户未指定时长时省略，默认平滑过渡 5 秒；指定时长时按其要求传入。只有用户明确要求瞬切或不要过渡时才传 0，‘变成晚上’或‘切到白天’不表示瞬切。时间向前连续变化，6 到 24 经过中午和黄昏，23 到 1 跨午夜");
const waitForIblSchema = z.boolean().optional().describe("是否等待环境光烘焙发布，省略时为 true");
export const timeUpdateInputSchema = z
  .union([
    z.strictObject({
      timeHours: timeHoursSchema,
      fromTimeHours: z.number().min(0).max(24).optional().describe("明确指定的起点时刻；省略则从当前时刻开始。指定后先设置起点，再向目标过渡"),
      season: seasonSchema.optional(),
      transitionDuration: transitionDurationSchema,
      waitForIbl: waitForIblSchema
    }),
    z.strictObject({
      timeHours: timeHoursSchema.optional(),
      season: seasonSchema,
      transitionDuration: transitionDurationSchema,
      waitForIbl: waitForIblSchema
    })
  ])
  .describe("至少提供 timeHours 或 season；同时提供时并行过渡二者");

export const timeGetOutputSchema = z.strictObject({
  timeHours: z.number().min(0).max(24),
  phase: z.string().describe("当前日夜阶段"),
  playing: z.boolean(),
  season: seasonSchema,
  seasonTransitionProgress: z.number(),
  ibl: z.strictObject({
    phase: z.string(),
    progress: z.number(),
    bakingEnabled: z.boolean()
  })
});

export const timeGetContract = defineSeedWorldApiContract({
  name: "time.get", effect: "read",
  domain: "time",
  description: "读取当前世界时间、季节和环境光状态。",
  inputDescription: "不接受参数。",
  outputDescription: "当前时间、季节和环境光状态。",
  inputMode: "none",
  input: emptyToolInputSchema,
  output: timeGetOutputSchema
});

export const timeUpdateContract = defineSeedWorldApiContract({
  name: "time.update",
  domain: "time",
  description: "修改世界时间、季节，或同时修改两者。默认平滑过渡。只需调用一次，不需要用脚本循环推进。",
  inputDescription: "至少包含 timeHours 或 season，可配置过渡和环境光等待。",
  outputDescription: "返回规范化请求和草稿目标状态，并未开始过渡。execute 提交后才执行过渡；waitForIbl 控制额外等待环境光。以 execute.receipt 判断提交，提交后的过渡失败记录在 runtimeErrors，不撤销编辑数据。",
  input: timeUpdateInputSchema,
  output: environmentUpdateOutputSchema
});

export const SEED_WORLD_TIME_CONTRACTS = Object.freeze([timeGetContract, timeUpdateContract]);

export function createSeedWorldTimeTools(application: SeedWorldAgentApplication): readonly AgentTool[] {
  return [
    defineSeedWorldTool(timeGetContract, {
      execute: () => application.getTime()
    }),
    defineSeedWorldTool(timeUpdateContract, {
      execute: (input, { signal }) => application.updateTime(normalizeTimeUpdate(input), signal)
    })
  ];
}

function normalizeTimeUpdate(input: z.output<typeof timeUpdateInputSchema>): SeedWorldTimeUpdateInput {
  return {
    timeHours: input.timeHours,
    fromTimeHours: "fromTimeHours" in input ? input.fromTimeHours : undefined,
    season: input.season,
    transitionDuration: input.transitionDuration ?? 5,
    waitForIbl: input.waitForIbl ?? true
  };
}
