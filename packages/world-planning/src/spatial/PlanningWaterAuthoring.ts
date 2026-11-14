import type { SpatialCommand } from "./SpatialDocument";
import type { RiverParameters } from "./hydrology/RiverRegions";
import type { LakeParameters } from "./hydrology/LakeRegions";

export type PlanningWaterCreation =
  | { kind: "river"; id: string; parameters: Partial<RiverParameters> & Pick<RiverParameters, "points"> }
  | {
      kind: "lake";
      id: string;
      parameters: Partial<LakeParameters> & {
        shoreline: NonNullable<LakeParameters["shoreline"]>;
        referenceLevel: number;
      };
    };

/** Authored and generated bodies both become ordinary schema-driven planning entities. */
export function planningWaterCreation(input: PlanningWaterCreation): SpatialCommand {
  if (!input || !["river", "lake"].includes(input.kind) || !input.id?.startsWith(`${input.kind}:authored:`))
    throw new Error("INVALID_ARGUMENT: 手工水体 ID 须以 river:authored: 或 lake:authored: 开头。");
  if (input.kind === "river" && !input.parameters.points?.length)
    throw new Error("INVALID_ARGUMENT: 创建河流需要控制点。");
  if (
    input.kind === "lake" &&
    (!input.parameters.shoreline?.length || !Number.isFinite(input.parameters.referenceLevel))
  )
    throw new Error("INVALID_ARGUMENT: 创建湖泊需要闭合岸线与固定湖盆参考高程。");
  const component = input.kind === "river" ? "rivers" : "lakes";
  return {
    op: "create",
    entity: {
      id: input.id,
      name: input.kind === "river" ? "自定义河流" : "自定义湖泊",
      parent: "world",
      components: {
        [component]: { base: { entity: "world", component }, values: { ...input.parameters, enabled: true } }
      }
    }
  };
}
