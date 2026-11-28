import * as z from "zod";

export const skyColorRgbSchema = z
  .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
  .nullable()
  .describe("天空染色的 sRGB 三通道整数 0 到 255；例如紫色 [180,80,255]，null 恢复默认昼夜天空。染色立即生效并保持到当前世界销毁或显式恢复；保留时间、天气与太阳/月亮，实际亮度受昼夜光照影响。");
