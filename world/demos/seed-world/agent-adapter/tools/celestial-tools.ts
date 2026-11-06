import * as z from "zod";
import { skyColorRgbSchema } from "../contracts/SeedWorldSkyColorContract.ts";

import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import type { SeedWorldAtmosphereUpdateRequest } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";
import {
  emptyToolInputSchema,
  environmentStateSchema,
  environmentUpdateOutputSchema,
  weatherPresetSchema
} from "./tool-contract.ts";

const normalized = (description: string) => z.number().min(0).max(1).describe(description);
function nonEmptyPatch<Shape extends z.ZodRawShape>(shape: Shape, description: string) {
  return z.strictObject(shape).refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: `${description}至少需要一个字段` }
  ).describe(description);
}

const windSchema = nonEmptyPatch({
  speedMetresPerSecond: z.number().min(0).max(60).optional().describe("持续风速，单位为米每秒"),
  directionDegrees: z.number().min(-180).max(180).optional().describe("风吹向的世界水平航向，度：0 为 -Z，90 为 +X，-90 为 -X；不是风的来向或内部偏转角。过渡完成后生效；不修改基础风向"),
  gustiness: normalized("阵风强度").optional(),
  turbulence: normalized("乱流程度").optional()
}, "风通道局部修改");
const precipitationSchema = nonEmptyPatch({
  rainIntensity: normalized("降雨强度").optional(),
  snowIntensity: normalized("降雪强度").optional()
}, "降水通道局部修改");
const atmosphereSchema = nonEmptyPatch({
  skyColorRgb: skyColorRgbSchema.optional(),
  cloudiness: normalized("云层覆盖").optional(),
  fogIntensity: normalized("雾强度").optional()
}, "天空颜色与云雾通道局部修改");
const lightningSchema = nonEmptyPatch({
  frequency: normalized("闪电频率").optional(),
  intensity: normalized("闪电强度").optional()
}, "闪电通道局部修改");
const commonUpdateFields = {
  transitionDuration: z.number().min(0).max(60).optional().describe("天气通道过渡秒数，省略时为 1；天空染色立即生效"),
  waitForIbl: z.boolean().optional().describe("是否等待环境光烘焙发布，省略时为 true")
};
const optionalChannels = {
  weatherPreset: weatherPresetSchema.optional(),
  wind: windSchema.optional(),
  precipitation: precipitationSchema.optional(),
  atmosphere: atmosphereSchema.optional(),
  lightning: lightningSchema.optional()
};
export const atmosphereUpdateInputSchema = z
  .strictObject({ ...optionalChannels, ...commonUpdateFields })
  .refine(
    (value) => value.weatherPreset !== undefined || value.wind !== undefined || value.precipitation !== undefined ||
      value.atmosphere !== undefined || value.lightning !== undefined,
    { message: "至少提供 weatherPreset、wind、precipitation、atmosphere 或 lightning 中的一项" }
  )
  .describe("至少提供一个要修改的天象字段；preset 先应用，显式通道随后覆盖");

export const atmosphereGetOutputSchema = z.strictObject({
  phase: z.string(),
  environment: environmentStateSchema,
  ibl: z.strictObject({
    phase: z.string(),
    progress: z.number(),
    bakingEnabled: z.boolean()
  })
});

export const atmosphereGetContract = defineSeedWorldApiContract({
  name: "atmosphere.get", effect: "read",
  domain: "atmosphere",
  description: "读取当前天空颜色、风、雨、雪、雷、云、雾和环境光状态。",
  inputDescription: "不接受参数。",
  outputDescription: "当前天象与环境光状态。",
  inputMode: "none",
  input: emptyToolInputSchema,
  output: atmosphereGetOutputSchema
});

export const atmosphereUpdateContract = defineSeedWorldApiContract({
  name: "atmosphere.update",
  domain: "atmosphere",
  description: "修改天空颜色或一个或多个天象通道。",
  inputDescription: "天空改色使用 atmosphere.skyColorRgb，null 恢复默认；无需修改时间、云雾或天气预设。至少包含一个天象字段；预设先应用，显式通道随后覆盖。天空颜色也参与环境光烘焙。",
  outputDescription: "规范化请求和草稿目标状态。execute 提交后才激活天象与环境光过渡；运行失败记录在 execute.receipt.runtimeErrors，不撤销已提交的编辑数据。",
  input: atmosphereUpdateInputSchema,
  output: environmentUpdateOutputSchema
});

export const SEED_WORLD_ATMOSPHERE_CONTRACTS = Object.freeze([
  atmosphereGetContract,
  atmosphereUpdateContract
]);

export function createSeedWorldCelestialTools(application: SeedWorldAgentApplication): readonly AgentTool[] {
  return [
    defineSeedWorldTool(atmosphereGetContract, {
      execute: () => application.getAtmosphere()
    }),
    defineSeedWorldTool(atmosphereUpdateContract, {
      execute: (input, { signal }) => application.updateAtmosphere(normalizeAtmosphereUpdate(input), signal)
    })
  ];
}

function normalizeAtmosphereUpdate(
  input: z.output<typeof atmosphereUpdateInputSchema>
): SeedWorldAtmosphereUpdateRequest {
  return {
    weatherPreset: input.weatherPreset,
    wind: input.wind,
    precipitation: input.precipitation,
    atmosphere: input.atmosphere,
    lightning: input.lightning,
    transitionDuration: input.transitionDuration ?? 1,
    waitForIbl: input.waitForIbl ?? true
  };
}
