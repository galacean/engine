import { validateRiverTerrainModifier, type RiverTerrainModifier } from "./RiverTerrainModifier";
import { RIVER_LIMITS } from "./RiverAuthoringLimits";
import {
  RIVER_GENERATION_MAX_POINT_COUNT,
  validateRiverGenerationParameters,
  type RiverGenerationSource
} from "./RiverGenerationParameters";

// Per point: 128 ID code units escaped to at most 768 JSON characters, five
// numbers at up to 25 characters each, and under 100 characters of keys/syntax.
// Round up to 1 KiB per point, plus 16 KiB for recipe, modifier and terrain metadata.
export const RIVER_EDIT_DOCUMENT_MAX_JSON_LENGTH = RIVER_GENERATION_MAX_POINT_COUNT * 1024 + 16 * 1024;

export interface RiverEditablePoint {
  id: string;
  position: [number, number, number];
  width: number;
  flowSpeed: number;
  elevationLocked: boolean;
}

/** Author inputs only. Geometry, Look and terrain heights are not editor history. */
export interface RiverEditDocument {
  version: 3;
  riverEnabled: boolean;
  modifier?: RiverTerrainModifier;
  riverId: string;
  terrain: { id: string; revision: number; contentHash: string };
  points: RiverEditablePoint[];
  generation?: RiverGenerationSource;
}

export function validateRiverEditDocument(value: unknown, reference: RiverEditDocument["terrain"]): RiverEditDocument {
  const record = (v: unknown, keys: string[], label: string): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((key) => !keys.includes(key)))
      throw new Error(`${label} 格式无效`);
    return v as Record<string, unknown>;
  };
  const finite = (v: unknown, min: number, max: number, label: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${label} 超出有效范围`);
    return v;
  };
  const text = (v: unknown, label: string): string => {
    if (typeof v !== "string" || !v.trim() || v.length > 128) throw new Error(`${label} 无效`);
    return v;
  };
  const doc = record(
    value,
    ["version", "riverId", "terrain", "points", "riverEnabled", "modifier", "generation"],
    "River 文档"
  );
  if (doc.version !== 1 && doc.version !== 2 && doc.version !== 3) throw new Error("不支持的 River 编辑文档版本");
  if (doc.version !== 3 && "generation" in doc) throw new Error("生成来源需要 V3 编辑文档");
  if (doc.version === 1 && ("modifier" in doc || "riverEnabled" in doc))
    throw new Error("V1 文档不能包含地形修改或删除状态");
  const riverId = text(doc.riverId, "River ID");
  const riverEnabled = doc.version === 1 ? true : doc.riverEnabled;
  if (typeof riverEnabled !== "boolean") throw new Error("River 启用状态无效");
  const modifier = doc.modifier === undefined ? undefined : validateRiverTerrainModifier(doc.modifier, riverId);
  if (!riverEnabled && modifier) throw new Error("已删除水体不能保留河槽 modifier");
  const terrain = record(doc.terrain, ["id", "revision", "contentHash"], "地形引用");
  if (
    terrain.id !== reference.id ||
    terrain.revision !== reference.revision ||
    terrain.contentHash !== reference.contentHash
  )
    throw new Error("文档地形版本与当前固定地形不一致");
  if (!Array.isArray(doc.points) || doc.points.length < 2) throw new Error("至少需要两个控制点");
  const ids = new Set<string>();
  const points = doc.points.map((input, index): RiverEditablePoint => {
    const label = `控制点 ${index + 1}`;
    const point = record(input, ["id", "position", "width", "flowSpeed", "elevationLocked"], label);
    const id = text(point.id, `${label} ID`);
    if (ids.has(id)) throw new Error(`控制点 ID 重复：${id}`);
    ids.add(id);
    if (!Array.isArray(point.position) || point.position.length !== 3) throw new Error(`${label} 坐标无效`);
    if (typeof point.elevationLocked !== "boolean") throw new Error(`${label} 高程锁定无效`);
    return {
      id,
      position: [0, 1, 2].map((axis) =>
        finite((point.position as unknown[])[axis], -100000, 100000, `${label} 坐标`)
      ) as [number, number, number],
      width: finite(point.width, RIVER_LIMITS.minWidth, RIVER_LIMITS.maxWidth, `${label} 宽度`),
      flowSpeed: finite(point.flowSpeed, RIVER_LIMITS.minFlowSpeed, RIVER_LIMITS.maxFlowSpeed, `${label} 流速`),
      elevationLocked: point.elevationLocked
    };
  });
  let generation: RiverGenerationSource | undefined;
  if (doc.generation !== undefined) {
    const source = record(doc.generation, ["generatorVersion", "parameters", "generatedPointsHash"], "生成来源");
    const generatedPointsHash = text(source.generatedPointsHash, "生成基准 hash");
    if (!/^[0-9a-f]{16}$/.test(generatedPointsHash)) throw new Error("生成基准 hash 格式无效");
    generation = {
      generatorVersion: text(source.generatorVersion, "生成器版本"),
      parameters: validateRiverGenerationParameters(source.parameters),
      generatedPointsHash
    };
  }
  return {
    version: 3,
    riverId,
    riverEnabled,
    ...(modifier ? { modifier } : {}),
    terrain: { ...reference },
    points,
    ...(generation ? { generation } : {})
  };
}
