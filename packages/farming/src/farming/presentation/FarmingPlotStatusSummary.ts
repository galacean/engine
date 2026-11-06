import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { PlotView } from "../domain/PlotQueries";
import { GROUND_REASON_MESSAGES } from "../domain/FarmingGround";
import { resolveSoilMoistureLabel, SOIL_MOISTURE_LABELS } from "../domain/FarmQueries";

/** Compact display of authoritative query values; never infers a pause from rounded progress. */
export function summarizeFarmingPlot(plot: PlotView, definitions: FarmingDefinitionSet) {
  const crop = plot.crop,
    limiting = crop?.factors.find((f) => f.id === crop.limitingFactorId);
  const nearWater = plot.nearWater;
  const nearWaterCache = !nearWater
    ? "宿主未提供"
    : nearWater.groundRevision === null || nearWater.layoutRevision === null
      ? nearWater.refreshing
        ? "计算中，尚无完整缓存"
        : "尚无完整缓存"
      : `${nearWater.refreshing ? "刷新中，沿用完整旧缓存" : "已完成"} · 岸距 ${nearWater.shoreDistanceM === null ? "无" : `${nearWater.shoreDistanceM.toFixed(2)}m`} · 高差 ${nearWater.heightDifferenceM === null ? "无" : `${nearWater.heightDifferenceM.toFixed(2)}m`} · 系数 ${nearWater.coefficient.toFixed(3)} · 来源 ${nearWater.sourceHash ?? "无"}`;
  const speedPercent = crop ? (crop.growthCoefficientPermille * crop.growthMultiplier) / 10 : 0;
  const cause = limiting ? `${limiting.name} ${Number(limiting.value.toFixed(1))}${limiting.unit}` : "环境条件不适宜";
  const growth = !crop
    ? "未种植"
    : crop.pausedReason === "destroyed"
      ? crop.mature
        ? "已毁坏 · 已成熟，可零产量收获清地或锄地"
        : "已毁坏 · 停止成长，请锄地清除"
      : crop.mature
        ? "已成熟，可以收获"
        : crop.pausedReason === "ground-unavailable"
          ? "暂停 · 耕地不可用"
          : crop.pausedReason === "growth-paused"
            ? "暂停 · 作物生长倍数为 0"
            : crop.pausedReason === "soil-too-dry"
              ? "暂停 · 土壤过干，请浇水"
              : crop.pausedReason === "soil-too-wet"
                ? "暂停 · 土壤过湿，等待水分回落"
                : crop.pausedReason
                  ? `暂停 · ${cause}`
                  : speedPercent < 100
                    ? `减缓 · 速度 ${speedPercent.toFixed(0)}% · ${cause}`
                    : `正常生长 · 速度 ${speedPercent.toFixed(0)}%`;
  const ground =
    plot.ground.availability === "available"
      ? "可用"
      : plot.ground.reason
        ? `不可用：${GROUND_REASON_MESSAGES[plot.ground.reason]}`
        : "地面未加载";
  return [
    ["作物", crop ? `${crop.cropName} · ${crop.stageName} · ${(crop.growthPermille / 10).toFixed(1)}%` : "空地"],
    ["生长", growth],
    [
      "健康",
      crop
        ? `${crop.healthPermille}/1000 · ${{ normal: "正常", damaged: "受损", destroyed: "已毁坏" }[crop.healthStatus]} · 预计产量 ${crop.expectedHarvestQuantity}`
        : "无作物"
    ],
    [
      "当前水分速率",
      `近水 +${plot.waterRates.nearWaterPerMinute.toFixed(2)} / 雨水 +${plot.waterRates.rainWaterPerMinute.toFixed(2)} / 蒸发 -${plot.waterRates.evaporationPerMinute.toFixed(2)} 个百分点/模拟分钟（按当前输入）`
    ],
    ["耕地", `${plot.soil.preparation === "leveled" ? "已整地" : "已翻耕"} · ${ground}`],
    [
      "湿润度",
      `${plot.soil.moistureUnits.toFixed(1)}% · ${SOIL_MOISTURE_LABELS[resolveSoilMoistureLabel(definitions, plot.soil.moistureUnits)]}`
    ],
    ["近水缓存", nearWaterCache]
  ] as const;
}
