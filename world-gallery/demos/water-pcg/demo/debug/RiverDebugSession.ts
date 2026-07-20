/** Demo-only state and stage mapping for the Water PCG river debug panel. */
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverCompiledData } from "../../compiler/river/types";
import { RiverSurfaceDebugMode } from "../../runtime/river/RiverRuntimeEnums";
import { RiverDebugMode } from "./constants";

export enum RiverDebugStage {
  Authoring = "authoring",
  Topology = "topology",
  Geometry = "geometry",
  Fields = "fields",
  Surface = "surface",
  Final = "final"
}

export enum RiverDebugChannel {
  ControlPoints = "control-points",
  AuthoredPath = "authored-path",
  CompiledTopology = "compiled-topology",
  Samples = "samples",
  Banks = "banks",
  RawMesh = "raw-mesh",
  Chunks = "chunks",
  Junctions = "junctions",
  LocalFlow = "local-flow",
  LocalFoam = "local-foam",
  LocalSignedDistance = "local-sdf",
  AtlasRect = "atlas-rect",
  TerrainCorridor = "terrain-corridor",
  QueryGrid = "query-grid",
  FlowCoordinate = "flow-coordinate",
  MacroHeight = "macro-height",
  CrestMask = "crest-mask",
  MicroNormal = "micro-normal",
  ShoreDamping = "shore-damping",
  Final = "final"
}

export type RiverDebugTargetKind = "network" | "reach" | "junction" | "chunk";

export interface RiverDebugTarget {
  readonly kind: RiverDebugTargetKind;
  readonly id?: string;
}

export interface RiverDebugSelection {
  readonly stage: RiverDebugStage;
  readonly channel: RiverDebugChannel;
  readonly target: RiverDebugTarget;
  readonly queryT: number;
}

export interface RiverDebugCard {
  readonly channel: RiverDebugChannel;
  readonly label: string;
  readonly technicalLabel: string;
  readonly description: string;
  readonly disabledReason?: string;
}

export interface RiverDebugTargetOption {
  readonly value: string;
  readonly label: string;
  readonly target: RiverDebugTarget;
}

export interface RiverDebugRuntimeMetrics {
  readonly resourceByteLength: number;
  readonly drawCalls: number;
  readonly bufferMemory: number;
  readonly textureMemory: number;
  readonly totalMemory: number;
  readonly submissionYieldCount: number;
  readonly submissionMaxSliceMs: number;
  readonly workerDeserializeMs: number;
}

export type RiverDebugSessionStatus = "ready" | "compiling" | "error" | "ocean";

export interface RiverDebugSessionContext {
  readonly exampleLabel: string;
  readonly resourceHash: string;
  readonly data: RiverCompiledData;
  readonly quality: RiverQualityLevel;
  readonly metrics: RiverDebugRuntimeMetrics;
}

export interface RiverDebugSnapshot {
  readonly selection: RiverDebugSelection;
  readonly context: RiverDebugSessionContext;
  readonly status: RiverDebugSessionStatus;
  readonly statusMessage: string;
  readonly cards: readonly RiverDebugCard[];
  readonly targets: readonly RiverDebugTargetOption[];
}

export type RiverNetworkOverlay = "off" | "topology" | "chunks" | "junctions" | "terrain-corridor" | "query-grid";

export interface RiverDebugSceneState {
  readonly overlayMode: RiverDebugMode;
  readonly networkOverlay: RiverNetworkOverlay;
  readonly surfaceDebugMode: RiverSurfaceDebugMode;
  readonly surfaceVisible: boolean;
  readonly foamVisible: boolean;
  readonly rawGeometryMaterial: boolean;
  readonly bedVisible: boolean;
  readonly decorationsVisible: boolean;
}

export const RIVER_DEBUG_STAGE_LABELS: Readonly<Record<RiverDebugStage, string>> = Object.freeze({
  [RiverDebugStage.Authoring]: "1 Authoring",
  [RiverDebugStage.Topology]: "2 Topology",
  [RiverDebugStage.Geometry]: "3 Geometry",
  [RiverDebugStage.Fields]: "4 Fields",
  [RiverDebugStage.Surface]: "5 Surface",
  [RiverDebugStage.Final]: "6 Final"
});

export const RIVER_DEBUG_STAGE_ORDER: readonly RiverDebugStage[] = Object.freeze([
  RiverDebugStage.Authoring,
  RiverDebugStage.Topology,
  RiverDebugStage.Geometry,
  RiverDebugStage.Fields,
  RiverDebugStage.Surface,
  RiverDebugStage.Final
]);

const DEFAULT_CHANNEL_BY_STAGE: Readonly<Record<RiverDebugStage, RiverDebugChannel>> = Object.freeze({
  [RiverDebugStage.Authoring]: RiverDebugChannel.ControlPoints,
  [RiverDebugStage.Topology]: RiverDebugChannel.CompiledTopology,
  [RiverDebugStage.Geometry]: RiverDebugChannel.RawMesh,
  [RiverDebugStage.Fields]: RiverDebugChannel.LocalFlow,
  [RiverDebugStage.Surface]: RiverDebugChannel.FlowCoordinate,
  [RiverDebugStage.Final]: RiverDebugChannel.Final
});

const CARD_DEFINITIONS: Readonly<Record<RiverDebugStage, readonly Omit<RiverDebugCard, "disabledReason">[]>> =
  Object.freeze({
    [RiverDebugStage.Authoring]: Object.freeze([
      {
        channel: RiverDebugChannel.ControlPoints,
        label: "控制点与手柄",
        technicalLabel: "Descriptor · control points",
        description: "输入控制点、Bezier in/out 手柄和路径端点。"
      },
      {
        channel: RiverDebugChannel.AuthoredPath,
        label: "Authoring Path",
        technicalLabel: "RiverAuthoringConfig.path",
        description: "只查看作者输入路径，不显示编译水面。"
      }
    ]),
    [RiverDebugStage.Topology]: Object.freeze([
      {
        channel: RiverDebugChannel.CompiledTopology,
        label: "编译拓扑",
        technicalLabel: "nodes · reaches · junctions",
        description: "Source、Junction、Mouth 和编译后的连接方向。"
      },
      {
        channel: RiverDebugChannel.Samples,
        label: "路径采样",
        technicalLabel: "RiverReachArtifact.samples",
        description: "编译采样中心线、连续水位和 Query 位置。"
      },
      {
        channel: RiverDebugChannel.Banks,
        label: "河岸与流向",
        technicalLabel: "width · depth · flow",
        description: "左右岸边界、宽度变化与流向箭头。"
      }
    ]),
    [RiverDebugStage.Geometry]: Object.freeze([
      {
        channel: RiverDebugChannel.RawMesh,
        label: "Raw Surface Mesh",
        technicalLabel: "surfaceGeometry · bankFoamGeometry",
        description: "无光照预览材质隔离几何，并以岸线辅助线标示泡沫边界。"
      },
      {
        channel: RiverDebugChannel.Chunks,
        label: "Chunk 边界",
        technicalLabel: "RiverCompiledChunk",
        description: "显示切块边界、局部原点和当前 Chunk 目标。"
      },
      {
        channel: RiverDebugChannel.Junctions,
        label: "Junction Mesh",
        technicalLabel: "RiverJunctionArtifact",
        description: "隔离汇流区域及其独立几何。"
      }
    ]),
    [RiverDebugStage.Fields]: Object.freeze([
      {
        channel: RiverDebugChannel.LocalFlow,
        label: "Local Flow",
        technicalLabel: "Atlas R/G · signed flow XZ",
        description: "局部流向场；颜色编码 X/Z 分量。"
      },
      {
        channel: RiverDebugChannel.LocalFoam,
        label: "Local Foam",
        technicalLabel: "Atlas B · foam",
        description: "汇流与障碍区域的局部泡沫权重。"
      },
      {
        channel: RiverDebugChannel.LocalSignedDistance,
        label: "Signed Distance",
        technicalLabel: "Atlas A · signed distance",
        description: "局部边界有符号距离，红蓝表示内外。"
      },
      {
        channel: RiverDebugChannel.AtlasRect,
        label: "Atlas Rect",
        technicalLabel: "worldToUv · uvRect",
        description: "显示 Chunk 到 Local Atlas tile 的映射范围。"
      },
      {
        channel: RiverDebugChannel.TerrainCorridor,
        label: "Terrain Corridor",
        technicalLabel: "terrainInteraction",
        description: "水侧 carve、湿岸和排除区向量；不代表真实 Terrain 已被修改。"
      },
      {
        channel: RiverDebugChannel.QueryGrid,
        label: "Query Grid",
        technicalLabel: "RiverQueryIndexData",
        description: "运行时水面查询的稀疏网格与 primitive 覆盖。"
      }
    ]),
    [RiverDebugStage.Surface]: Object.freeze([
      {
        channel: RiverDebugChannel.FlowCoordinate,
        label: "Flow Coordinate",
        technicalLabel: "motionData.xy",
        description: "连续网络流动坐标和随时间推进的相位。"
      },
      {
        channel: RiverDebugChannel.MacroHeight,
        label: "Macro Height",
        technicalLabel: "surfaceData.x",
        description: "大尺度顶点位移高度。"
      },
      {
        channel: RiverDebugChannel.CrestMask,
        label: "Crest Mask",
        technicalLabel: "ridge · erosion",
        description: "波峰与侵蚀后的泡沫遮罩。"
      },
      {
        channel: RiverDebugChannel.MicroNormal,
        label: "Micro Normal",
        technicalLabel: "dual-phase flow UV",
        description: "双相流动微法线输出。"
      },
      {
        channel: RiverDebugChannel.ShoreDamping,
        label: "Shore Damping",
        technicalLabel: "surfaceData.y",
        description: "岸边位移衰减范围。"
      }
    ]),
    [RiverDebugStage.Final]: Object.freeze([
      {
        channel: RiverDebugChannel.Final,
        label: "最终合成",
        technicalLabel: "production runtime",
        description: "正式材质、泡沫、河床和场景装饰。"
      }
    ])
  });

const SURFACE_MODE_BY_CHANNEL: Partial<Record<RiverDebugChannel, RiverSurfaceDebugMode>> = {
  [RiverDebugChannel.LocalFlow]: RiverSurfaceDebugMode.LocalFlow,
  [RiverDebugChannel.LocalFoam]: RiverSurfaceDebugMode.LocalFoam,
  [RiverDebugChannel.LocalSignedDistance]: RiverSurfaceDebugMode.LocalSignedDistance,
  [RiverDebugChannel.AtlasRect]: RiverSurfaceDebugMode.AtlasRect,
  [RiverDebugChannel.FlowCoordinate]: RiverSurfaceDebugMode.FlowCoordinate,
  [RiverDebugChannel.MacroHeight]: RiverSurfaceDebugMode.MacroHeight,
  [RiverDebugChannel.CrestMask]: RiverSurfaceDebugMode.CrestMask,
  [RiverDebugChannel.MicroNormal]: RiverSurfaceDebugMode.MicroNormal,
  [RiverDebugChannel.ShoreDamping]: RiverSurfaceDebugMode.ShoreDamping
};

function clampQueryT(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

export function serializeRiverDebugTarget(target: RiverDebugTarget): string {
  return target.kind === "network" ? "network" : `${target.kind}:${target.id ?? ""}`;
}

export function parseRiverDebugTarget(value: string | null): RiverDebugTarget {
  if (!value || value === "network") return { kind: "network" };
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return { kind: "network" };
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return kind === "reach" || kind === "junction" || kind === "chunk" ? { kind, id } : { kind: "network" };
}

export function resolveRiverDebugSceneState(
  selection: RiverDebugSelection,
  quality: RiverQualityLevel,
  hasLocalAtlas: boolean
): RiverDebugSceneState {
  const mediumSurfaceAvailable = quality !== RiverQualityLevel.Low;
  const surfaceDebugMode =
    mediumSurfaceAvailable &&
    (selection.stage === RiverDebugStage.Surface || (selection.stage === RiverDebugStage.Fields && hasLocalAtlas))
      ? (SURFACE_MODE_BY_CHANNEL[selection.channel] ?? RiverSurfaceDebugMode.Off)
      : RiverSurfaceDebugMode.Off;

  switch (selection.stage) {
    case RiverDebugStage.Authoring:
      return {
        overlayMode:
          selection.channel === RiverDebugChannel.ControlPoints
            ? RiverDebugMode.ControlPoints
            : RiverDebugMode.AuthoringPath,
        networkOverlay: "off",
        surfaceDebugMode,
        surfaceVisible: false,
        foamVisible: false,
        rawGeometryMaterial: false,
        bedVisible: false,
        decorationsVisible: false
      };
    case RiverDebugStage.Topology:
      return {
        overlayMode:
          selection.channel === RiverDebugChannel.Banks
            ? RiverDebugMode.Full
            : selection.channel === RiverDebugChannel.Samples
              ? RiverDebugMode.Path
              : RiverDebugMode.Off,
        networkOverlay: selection.channel === RiverDebugChannel.CompiledTopology ? "topology" : "off",
        surfaceDebugMode,
        surfaceVisible: false,
        foamVisible: false,
        rawGeometryMaterial: false,
        bedVisible: false,
        decorationsVisible: false
      };
    case RiverDebugStage.Geometry:
      return {
        overlayMode: selection.channel === RiverDebugChannel.Junctions ? RiverDebugMode.Off : RiverDebugMode.Shoreline,
        networkOverlay:
          selection.channel === RiverDebugChannel.Chunks
            ? "chunks"
            : selection.channel === RiverDebugChannel.Junctions
              ? "junctions"
              : "off",
        surfaceDebugMode,
        surfaceVisible: true,
        foamVisible: true,
        rawGeometryMaterial: true,
        bedVisible: false,
        decorationsVisible: false
      };
    case RiverDebugStage.Fields: {
      const shaderFieldSelected =
        selection.channel === RiverDebugChannel.LocalFlow ||
        selection.channel === RiverDebugChannel.LocalFoam ||
        selection.channel === RiverDebugChannel.LocalSignedDistance ||
        selection.channel === RiverDebugChannel.AtlasRect;
      return {
        overlayMode: RiverDebugMode.Off,
        networkOverlay:
          selection.channel === RiverDebugChannel.TerrainCorridor
            ? "terrain-corridor"
            : selection.channel === RiverDebugChannel.QueryGrid
              ? "query-grid"
              : "off",
        surfaceDebugMode,
        surfaceVisible: shaderFieldSelected,
        foamVisible: false,
        rawGeometryMaterial: false,
        bedVisible: false,
        decorationsVisible: false
      };
    }
    case RiverDebugStage.Surface:
      return {
        overlayMode: RiverDebugMode.Off,
        networkOverlay: "off",
        surfaceDebugMode,
        surfaceVisible: true,
        foamVisible: false,
        rawGeometryMaterial: false,
        bedVisible: true,
        decorationsVisible: false
      };
    default:
      return {
        overlayMode: RiverDebugMode.Off,
        networkOverlay: "off",
        surfaceDebugMode: RiverSurfaceDebugMode.Off,
        surfaceVisible: true,
        foamVisible: true,
        rawGeometryMaterial: false,
        bedVisible: true,
        decorationsVisible: true
      };
  }
}

function targetExists(data: RiverCompiledData, target: RiverDebugTarget): boolean {
  switch (target.kind) {
    case "reach":
      return data.reaches.some((reach) => reach.id === target.id);
    case "junction":
      return data.junctions.some((junction) => junction.id === target.id);
    case "chunk":
      return data.chunks.some((chunk) => chunk.id === target.id);
    default:
      return true;
  }
}

function buildTargets(data: RiverCompiledData): readonly RiverDebugTargetOption[] {
  return Object.freeze([
    { value: "network", label: `Network · ${data.sourceId}`, target: { kind: "network" } },
    ...data.reaches.map((reach) => ({
      value: `reach:${reach.id}`,
      label: `Reach · ${reach.id}`,
      target: { kind: "reach" as const, id: reach.id }
    })),
    ...data.junctions.map((junction) => ({
      value: `junction:${junction.id}`,
      label: `Junction · ${junction.id}`,
      target: { kind: "junction" as const, id: junction.id }
    })),
    ...data.chunks.map((chunk) => ({
      value: `chunk:${chunk.id}`,
      label: `Chunk · ${chunk.id}`,
      target: { kind: "chunk" as const, id: chunk.id }
    }))
  ]);
}

function buildCards(context: RiverDebugSessionContext, stage: RiverDebugStage): readonly RiverDebugCard[] {
  const hasAtlas = Boolean(context.data.terrainInteraction.localMapAtlas);
  return Object.freeze(
    CARD_DEFINITIONS[stage].map((card) => {
      const needsAtlas =
        card.channel === RiverDebugChannel.LocalFlow ||
        card.channel === RiverDebugChannel.LocalFoam ||
        card.channel === RiverDebugChannel.LocalSignedDistance ||
        card.channel === RiverDebugChannel.AtlasRect;
      const needsMediumSurface = stage === RiverDebugStage.Surface || needsAtlas;
      const disabledReason =
        needsAtlas && !hasAtlas
          ? "当前资源没有 Local Atlas"
          : needsMediumSurface && context.quality === RiverQualityLevel.Low
            ? "Low 质量不启用该调试通道"
            : undefined;
      return { ...card, disabledReason };
    })
  );
}

export class RiverDebugSession {
  private _selection: RiverDebugSelection;
  private _status: RiverDebugSessionStatus = "ready";
  private _statusMessage = "runtime ready";
  private _listeners = new Set<(snapshot: RiverDebugSnapshot) => void>();

  constructor(
    private _context: RiverDebugSessionContext,
    initial?: Partial<RiverDebugSelection>
  ) {
    const stage = initial?.stage ?? RiverDebugStage.Final;
    this._selection = {
      stage,
      channel: initial?.channel ?? DEFAULT_CHANNEL_BY_STAGE[stage],
      target: initial?.target ?? { kind: "network" },
      queryT: clampQueryT(initial?.queryT ?? 0.5)
    };
    this._repairSelection();
  }

  get snapshot(): RiverDebugSnapshot {
    return {
      selection: this._selection,
      context: this._context,
      status: this._status,
      statusMessage: this._statusMessage,
      cards: buildCards(this._context, this._selection.stage),
      targets: buildTargets(this._context.data)
    };
  }

  subscribe(listener: (snapshot: RiverDebugSnapshot) => void): () => void {
    this._listeners.add(listener);
    listener(this.snapshot);
    return () => this._listeners.delete(listener);
  }

  updateContext(context: RiverDebugSessionContext): void {
    this._context = context;
    this._repairSelection();
    this._emit();
  }

  setStatus(status: RiverDebugSessionStatus, message: string): void {
    this._status = status;
    this._statusMessage = message;
    this._emit();
  }

  selectStage(stage: RiverDebugStage): void {
    this._selection = { ...this._selection, stage, channel: DEFAULT_CHANNEL_BY_STAGE[stage] };
    this._repairSelection();
    this._emit();
  }

  selectChannel(channel: RiverDebugChannel): void {
    const card = buildCards(this._context, this._selection.stage).find((candidate) => candidate.channel === channel);
    if (!card || card.disabledReason) return;
    this._selection = { ...this._selection, channel };
    this._emit();
  }

  selectTarget(target: RiverDebugTarget): void {
    this._selection = {
      ...this._selection,
      target: targetExists(this._context.data, target) ? target : { kind: "network" }
    };
    this._emit();
  }

  setQueryT(queryT: number): void {
    this._selection = { ...this._selection, queryT: clampQueryT(queryT) };
    this._emit();
  }

  select(selection: Partial<RiverDebugSelection>): void {
    const stage = selection.stage ?? this._selection.stage;
    this._selection = {
      stage,
      channel: selection.channel ?? (selection.stage ? DEFAULT_CHANNEL_BY_STAGE[stage] : this._selection.channel),
      target: selection.target ?? this._selection.target,
      queryT: clampQueryT(selection.queryT ?? this._selection.queryT)
    };
    this._repairSelection();
    this._emit();
  }

  private _repairSelection(): void {
    if (!targetExists(this._context.data, this._selection.target)) {
      this._selection = { ...this._selection, target: { kind: "network" } };
    }
    const cards = buildCards(this._context, this._selection.stage);
    const active = cards.find((card) => card.channel === this._selection.channel);
    if (!active || active.disabledReason) {
      const fallback = cards.find((card) => !card.disabledReason);
      this._selection = {
        ...this._selection,
        channel: fallback?.channel ?? DEFAULT_CHANNEL_BY_STAGE[this._selection.stage]
      };
    }
  }

  private _emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this._listeners) listener(snapshot);
  }
}
