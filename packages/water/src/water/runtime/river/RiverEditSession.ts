import { diagnoseRiverEdit, type RiverEditDiagnostic } from "../../compiler/river/RiverEditDiagnostics";
import { createRiver } from "../../authoring/river/createRiver";
import { RiverPathMode } from "../../authoring/river/RiverAuthoringEnums";
import {
  RIVER_EDIT_DOCUMENT_MAX_JSON_LENGTH,
  validateRiverEditDocument,
  type RiverEditDocument,
  type RiverEditablePoint
} from "../../authoring/river/RiverEditDocument";
import {
  copyWaterTerrainSnapshot,
  isWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import type { RiverTerrainModifier } from "../../authoring/river/RiverTerrainModifier";
import {
  deriveRiverTerrain,
  riverTerrainContentHash,
  riverTerrainModifierBounds,
  riverTerrainDirtyBounds,
  type RiverTerrainBounds
} from "../../compiler/river/RiverTerrainModifierCompiler";
import { validateRiverNetwork } from "../../compiler/river/RiverNetworkValidator";
import {
  generateRiver,
  hashRiverGeneratedPoints,
  type RiverGenerationResult
} from "../../compiler/river/RiverGenerator";
import {
  RIVER_GENERATOR_VERSION,
  RiverGenerationInputError,
  type RiverGenerationParameters
} from "../../authoring/river/RiverGenerationParameters";

export interface RiverEditPublication {
  readonly document: RiverEditDocument;
  readonly signal: AbortSignal;
  readonly terrain: WaterTerrainSnapshot;
  readonly terrainContentHash: string;
  readonly affectedBounds?: RiverTerrainBounds;
  assertCurrent(): void;
  /** Called synchronously with successful Host publication, before retiring old resources. */
  commit(): void;
  finish(): void;
}

/** A single-reach authoring session. Terrain is immutable and supplied by its external owner. */
export class RiverEditSession {
  readonly terrain: WaterTerrainSnapshot;
  readonly terrainReference: RiverEditDocument["terrain"];
  private _draft: RiverEditDocument;
  private _history: RiverEditDocument[];
  private _historyIndex = 0;
  private _revision = 0;
  private _publicationRevision = 0;
  private _pending?: AbortController;
  private _nextPointId = 0;
  private _publishedTerrain: WaterTerrainSnapshot;
  private _terrainContentHash: string;
  private _affectedBounds?: RiverTerrainBounds;
  private _diagnostics?: RiverEditDiagnostic[];

  get diagnostics(): RiverEditDiagnostic[] {
    if (!this._diagnostics) {
      this._diagnostics = [];
      try {
        this._validateGeometry(this._draft);
        this._diagnostics = diagnoseRiverEdit(this._draft);
      } catch (error) {
        this._diagnostics.push(this._diagnoseError(error, this._draft, "authoring"));
      }
    }
    return structuredClone(this._diagnostics);
  }

  shiftElevation(delta: number, includeLocked = false): void {
    if (!Number.isFinite(delta) || Math.abs(delta) > 100) throw new Error("整段升降量须为 -100–100 米");
    if (delta === 0) return;
    const locked = this._draft.points.flatMap((p, i) => (p.elevationLocked ? [i + 1] : []));
    if (!includeLocked && locked.length)
      throw new Error(`第 ${locked.join("、")} 点高程已锁定；整段升降需要解锁全部点，或明确勾选包含锁定点。`);
    this._replaceDraft({
      ...this._draft,
      points: this._draft.points.map((p) => ({ ...p, position: [p.position[0], p.position[1] + delta, p.position[2]] }))
    });
  }

  get publishedTerrain(): WaterTerrainSnapshot {
    return this._publishedTerrain;
  }

  constructor(
    terrain: WaterTerrainSnapshot,
    points: RiverEditablePoint[],
    readonly riverId = "river-demo"
  ) {
    if (!isWaterTerrainSnapshot(terrain)) throw new Error("基础地形快照无效");
    this.terrain = copyWaterTerrainSnapshot(terrain);
    const { id, revision } = this.terrain;
    this._publishedTerrain = this.terrain;
    this._terrainContentHash = riverTerrainContentHash(this.terrain);
    this.terrainReference = Object.freeze({ id, revision, contentHash: this._terrainContentHash });
    this._draft = validateRiverEditDocument(
      { version: 1, riverId, terrain: this.terrainReference, points },
      this.terrainReference
    );
    this._validateGeometry(this._draft);
    this._history = [structuredClone(this._draft)];
  }

  get snapshot() {
    return {
      diagnostics: this.diagnostics,
      generationStatus: this._draft.generation
        ? {
            supported: this._draft.generation.generatorVersion === RIVER_GENERATOR_VERSION,
            modified: hashRiverGeneratedPoints(this._draft.points) !== this._draft.generation.generatedPointsHash
          }
        : undefined,
      draft: structuredClone(this._draft),
      published: structuredClone(this._history[this._historyIndex]),
      dirty: JSON.stringify(this._draft) !== JSON.stringify(this._history[this._historyIndex]),
      draftRevision: this._revision,
      publicationRevision: this._publicationRevision,
      pending: !!this._pending && !this._pending.signal.aborted,
      canUndo: this._historyIndex > 0,
      canRedo: this._historyIndex < this._history.length - 1,
      terrain: { ...this.terrainReference },
      derivedTerrain: {
        id: this._publishedTerrain.id,
        revision: this._publishedTerrain.revision,
        contentHash: this._terrainContentHash
      },
      affectedBounds: structuredClone(this._affectedBounds)
    };
  }

  patchPoint(id: string, patch: Partial<Omit<RiverEditablePoint, "id">>): void {
    if (
      !patch ||
      typeof patch !== "object" ||
      Array.isArray(patch) ||
      Object.keys(patch).some((key) => !["position", "width", "flowSpeed", "elevationLocked"].includes(key))
    )
      throw new Error("控制点修改字段无效；ID 不能修改");
    const next = structuredClone(this._draft);
    const point = next.points.find((p) => p.id === id);
    if (!point) throw new Error(`控制点不存在：${id}`);
    if ((patch.elevationLocked ?? point.elevationLocked) && patch.position && patch.position[1] !== point.position[1])
      throw new Error(`控制点 ${id} 的高程已锁定`);
    Object.assign(point, structuredClone(patch));
    this._replaceDraft(next);
  }

  insertAfter(id: string): string {
    const next = structuredClone(this._draft);
    const index = next.points.findIndex((p) => p.id === id);
    if (index < 0 || index === next.points.length - 1) throw new Error("请选择末端之前的控制点插入");
    const a = next.points[index],
      b = next.points[index + 1];
    let newId: string;
    do {
      newId = `edit-point-${++this._nextPointId}`;
    } while (next.points.some((p) => p.id === newId));
    next.points.splice(index + 1, 0, {
      id: newId,
      position: a.position.map((v, i) => (v + b.position[i]) / 2) as [number, number, number],
      width: (a.width + b.width) / 2,
      flowSpeed: (a.flowSpeed + b.flowSpeed) / 2,
      elevationLocked: a.elevationLocked && b.elevationLocked
    });
    this._replaceDraft(next);
    return newId;
  }

  removePoint(id: string): void {
    if (!this._draft.points.some((p) => p.id === id)) throw new Error(`控制点不存在：${id}`);
    this._replaceDraft({ ...this._draft, points: this._draft.points.filter((p) => p.id !== id) });
  }

  snapPointToTerrain(id: string, clearance: number): void {
    if (!Number.isFinite(clearance) || clearance < 0 || clearance > 10) throw new Error("贴地水面偏移须为 0–10 米");
    const point = this._draft.points.find((p) => p.id === id);
    if (!point) throw new Error(`控制点不存在：${id}`);
    const [x, , z] = point.position;
    const height = sampleWaterTerrainHeight(this.terrain, x, z);
    if (height === undefined) throw new Error(`控制点 ${id} 超出地形范围`);
    this.patchPoint(id, { position: [x, height + clearance, z] });
  }

  cancel(): void {
    this._pending?.abort();
    this._pending = undefined;
    this._draft = structuredClone(this._history[this._historyIndex]);
    this._diagnostics = undefined;
    this._revision++;
  }

  exportJSON(): string {
    return JSON.stringify(this._draft);
  }

  /** Explicit replacement; failure leaves both the existing draft and pending publication untouched. */
  generate(parameters: RiverGenerationParameters): RiverGenerationResult {
    if (this._draft.generation && this._draft.generation.generatorVersion !== RIVER_GENERATOR_VERSION)
      return {
        ok: false,
        diagnostics: [
          {
            code: "generator-version",
            severity: "error",
            path: "generation.generatorVersion",
            pointIndices: [],
            message: "此文档使用未知生成器版本，可编辑和应用保存的控制点；请在新编辑场景使用当前生成器"
          }
        ]
      };
    const result = generateRiver(parameters);
    if (!result.ok) return result;
    const candidate = { ...this._draft, riverEnabled: true, points: result.points, generation: result.generation };
    try {
      this._validateGeometry(candidate);
      const requested = result.generation.parameters.bounds;
      const base = this.terrain;
      const maxX = base.origin[0] + (base.columns - 1) * base.spacing;
      const maxZ = base.origin[1] + (base.rows - 1) * (base.spacingZ ?? base.spacing);
      if (
        requested.min[0] < base.origin[0] ||
        requested.min[1] < base.origin[1] ||
        requested.max[0] > maxX ||
        requested.max[1] > maxZ
      )
        throw new RiverGenerationInputError("bounds", "允许范围必须位于基础地形内");
      const bounds = {
        min: [
          Math.max(requested.min[0], base.origin[0] + base.spacing),
          Math.max(requested.min[1], base.origin[1] + (base.spacingZ ?? base.spacing))
        ] as [number, number],
        max: [
          Math.min(requested.max[0], maxX - base.spacing),
          Math.min(requested.max[1], maxZ - (base.spacingZ ?? base.spacing))
        ] as [number, number]
      };
      const channelBounds = riverTerrainModifierBounds(candidate.points, candidate.modifier);
      if (channelBounds && channelBounds.min.some((v, i) => v < bounds.min[i] || channelBounds.max[i] > bounds.max[i]))
        throw new RiverGenerationInputError("bounds", "河槽及岸坡超出允许范围或地形采样范围");
      const diagnostics = diagnoseRiverEdit(candidate, bounds).map((diagnostic) =>
        diagnostic.code === "bank-intersection" ? { ...diagnostic, severity: "error" as const } : diagnostic
      );
      if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics };
      this._replaceDraft(candidate);
      this._diagnostics = diagnostics;
      return { ...result, diagnostics: structuredClone(diagnostics) };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [this._diagnoseError(error, candidate, "generation-constraints")]
      };
    }
  }
  importJSON(json: string): void {
    if (json.length > RIVER_EDIT_DOCUMENT_MAX_JSON_LENGTH) throw new Error("River 编辑文档过大");
    const candidate = validateRiverEditDocument(JSON.parse(json), this.terrainReference);
    if (candidate.riverId !== this.riverId) throw new Error("River ID 与当前编辑会话不一致");
    this._validateGeometry(candidate);
    deriveRiverTerrain(this.terrain, this.riverId, candidate.points, candidate.modifier, this.terrain.revision);
    this._replaceDraft(candidate);
  }

  setTerrainModifier(modifier?: RiverTerrainModifier): void {
    this._replaceDraft({ ...this._draft, modifier, riverEnabled: modifier ? true : this._draft.riverEnabled });
  }

  setRiverEnabled(enabled: boolean): void {
    this._replaceDraft({ ...this._draft, riverEnabled: enabled, modifier: enabled ? this._draft.modifier : undefined });
  }

  prepareRemove(): RiverEditPublication {
    return this._prepare({ ...this._history[this._historyIndex], riverEnabled: false, modifier: undefined });
  }

  createDescriptor(document = this._draft, terrain = this.terrain) {
    const descriptor = createRiver({
      id: this.riverId,
      points: document.points.map(({ elevationLocked, ...point }) => point),
      terrain
    });
    descriptor.segments[0].curve.mode = RiverPathMode.Polyline;
    return descriptor;
  }

  prepareApply(): RiverEditPublication {
    return this._prepare(this._draft);
  }
  prepareUndo(): RiverEditPublication {
    if (this._historyIndex <= 0) throw new Error("没有可撤销的已应用编辑");
    return this._prepare(this._history[this._historyIndex - 1], this._historyIndex - 1);
  }
  prepareRedo(): RiverEditPublication {
    if (this._historyIndex >= this._history.length - 1) throw new Error("没有可重做的编辑");
    return this._prepare(this._history[this._historyIndex + 1], this._historyIndex + 1);
  }

  private _replaceDraft(document: RiverEditDocument): void {
    const next = validateRiverEditDocument(document, this.terrainReference);
    this._pending?.abort();
    this._pending = undefined;
    this._draft = next;
    this._diagnostics = undefined;
    this._revision++;
  }

  private _prepare(document: RiverEditDocument, historyIndex?: number): RiverEditPublication {
    this._pending?.abort();
    this._pending = undefined;
    if (document !== this._draft) this._validateGeometry(document);
    const errors = (document === this._draft ? this.diagnostics : diagnoseRiverEdit(document)).filter(
      (issue) => issue.severity === "error"
    );
    if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));
    let terrain = deriveRiverTerrain(
      this.terrain,
      this.riverId,
      document.points,
      document.modifier,
      this.terrain.revision + this._publicationRevision + 1
    );
    const terrainContentHash = riverTerrainContentHash(terrain);
    if (terrainContentHash === this._terrainContentHash) terrain = this._publishedTerrain;
    const previous = this._history[this._historyIndex];
    const affectedBounds = riverTerrainDirtyBounds(
      this.terrain,
      riverTerrainModifierBounds(previous.points, previous.modifier),
      riverTerrainModifierBounds(document.points, document.modifier)
    );
    if (affectedBounds) {
      Object.freeze(affectedBounds.min);
      Object.freeze(affectedBounds.max);
      Object.freeze(affectedBounds);
    }
    const captured = structuredClone(document);
    captured.points.forEach((point) => {
      Object.freeze(point.position);
      Object.freeze(point);
    });
    Object.freeze(captured.points);
    Object.freeze(captured.terrain);
    if (captured.modifier) Object.freeze(captured.modifier);
    if (captured.generation) {
      const p = captured.generation.parameters;
      Object.freeze(p.source);
      Object.freeze(p.mouth);
      Object.freeze(p.bounds.min);
      Object.freeze(p.bounds.max);
      Object.freeze(p.bounds);
      Object.freeze(p);
      Object.freeze(captured.generation);
    }
    Object.freeze(captured);
    const pending = (this._pending = new AbortController());
    let committed = false;
    const assertCurrent = () => {
      if (committed || pending.signal.aborted || this._pending !== pending)
        throw new DOMException("编辑已过期", "AbortError");
    };
    return {
      terrain,
      terrainContentHash,
      affectedBounds,
      assertCurrent,
      document: captured,
      signal: pending.signal,
      commit: () => {
        assertCurrent();
        if (historyIndex !== undefined) this._historyIndex = historyIndex;
        else if (JSON.stringify(captured) !== JSON.stringify(this._history[this._historyIndex])) {
          this._history.splice(this._historyIndex + 1);
          this._history.push(captured);
          if (this._history.length > 51) this._history.shift();
          this._historyIndex = this._history.length - 1;
        }
        this._draft = structuredClone(captured);
        this._publishedTerrain = terrain;
        this._terrainContentHash = terrainContentHash;
        this._affectedBounds = affectedBounds;
        this._diagnostics = undefined;
        this._publicationRevision++;
        this._revision++;
        committed = true;
      },
      finish: () => {
        if (this._pending === pending) this._pending = undefined;
      }
    };
  }

  private _diagnoseError(error: unknown, document: RiverEditDocument, code: string): RiverEditDiagnostic {
    const message = error instanceof Error ? error.message : String(error);
    return {
      severity: "error",
      code,
      message,
      ...(error instanceof RiverGenerationInputError ? { path: error.path } : {}),
      pointIndices: document.points.flatMap((p, i) =>
        message.includes(`控制点 ${p.id} `) || message.includes(`第 ${i + 1} 点`) ? [i] : []
      )
    };
  }

  private _validateGeometry(document: RiverEditDocument): void {
    for (const point of document.points) {
      const radius = point.width / 2 + 1;
      for (const dx of [-radius, radius])
        for (const dz of [-radius, radius]) {
          if (sampleWaterTerrainHeight(this.terrain, point.position[0] + dx, point.position[2] + dz) === undefined)
            throw new Error(`控制点 ${point.id} 的河宽范围超出固定地形`);
        }
    }
    const cross = (a: number[], b: number[], c: number[]) =>
      (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
    for (let i = 1; i < document.points.length; i++) {
      const a = document.points[i - 1].position,
        b = document.points[i].position;
      if (Math.hypot(b[0] - a[0], b[2] - a[2]) < 0.1) throw new Error(`控制点 ${document.points[i].id} 与相邻点过近`);
      for (let j = i + 2; j < document.points.length; j++) {
        const c = document.points[j - 1].position,
          d = document.points[j].position;
        if (
          Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
            Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
          Math.max(Math.min(a[2], b[2]), Math.min(c[2], d[2])) <=
            Math.min(Math.max(a[2], b[2]), Math.max(c[2], d[2])) &&
          cross(a, b, c) * cross(a, b, d) <= 0 &&
          cross(c, d, a) * cross(c, d, b) <= 0
        )
          throw new Error(`第 ${i} 点至第 ${i + 1} 点与第 ${j} 点至第 ${j + 1} 点之间的河流中心线自交`);
      }
    }
    // The session owns a validated, frozen Base. Only author inputs change while dragging.
    // External network inputs and publication compilation still validate terrain in full.
    const descriptor = this.createDescriptor(document);
    delete descriptor.terrain;
    const validation = validateRiverNetwork(descriptor);
    if (!validation.valid) throw new Error(validation.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"));
  }
}
