import * as z from "zod";
import { INSTANCED_BIRCH_VARIATION_LIMITS as limits } from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeVariationControls";

const scalar = (key: keyof typeof limits, description: string) =>
  z.number().min(limits[key][0]).max(limits[key][1]).describe(description);
const color = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255)
]);

/** Executable source for both tree readback and vegetation.update; units match the artist panel. */
export const treeShapeSchema = z.strictObject({
  horizontalScale: scalar(
    "horizontalScale",
    "整棵树相对基础实例的水平缩放，包含树干、树冠；与 verticalScale 同时调整可整体放大缩小。"
  ),
  verticalScale: scalar("verticalScale", "整棵树相对基础实例的高度缩放。"),
  yawDegrees: scalar("yawDegrees", "相对基础实例朝向的水平旋转，单位为度。"),
  trunkThicknessScale: scalar("trunkThicknessScale", "主树干径向粗细倍率；不移动枝条中心线。"),
  branchLengthScale: scalar("branchLengthScale", "树枝长度倍率；小于 1 修剪枝梢，大于 1 延长枝条。"),
  branchCurvatureDegreesPerMeter: scalar("branchCurvatureDegreesPerMeter", "每米枝条的弯曲角度。"),
  branchDensity: scalar("branchDensity", "基础枝条的保留比例，0 到 1；1 为全部保留。"),
  leafDensity: scalar(
    "leafDensity",
    "基础叶片的保留比例，0 到 1；1 已为最大叶量。想更浓密时先读取当前值，不能用树林株数 count 代替。"
  ),
  leafSizeScale: scalar("leafSizeScale", "单张树叶卡片的大小倍率；不是新增叶片数量。"),
  leafColorRgb: color.describe("树叶颜色，sRGB 三通道整数 0 到 255。"),
  barkColorRgb: color.describe("树皮颜色，sRGB 三通道整数 0 到 255。")
});

export const treeShapePatchSchema = treeShapeSchema
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "treeShape 不能为空" })
  .describe(
    "程序化树共享效果的绝对参数补丁；省略字段保持不变。与 Tree Variations 面板共用配方和 Effect 参数，影响所有使用该效果的树，不创建单树覆盖。先读取 TreeAsset.properties.treeShape 再计算相对变化。"
  );
