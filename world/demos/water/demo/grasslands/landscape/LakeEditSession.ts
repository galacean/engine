import type { LakeBoundaryV1, HeightfieldWaterDescriptorV1 } from "@galacean/engine-water/water/index";

import type { LakeTerrainSnapshot } from "@galacean/engine-water/water/compiler/index";
import {
  createLakeFromTerrain,
  captureWaterTerrainSnapshot,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/index";

import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import {
  createLakeBasinTerrain,
  createLakeDemoBaseTerrain,
  deriveLakeDemoTerrain,
  type LakeBasinSettings,
  type LakeTerrainPreset
} from "./LakeBasinTerrain.ts";

export interface LakeEditDocument {
  readonly boundary: LakeBoundaryV1;
  readonly basin: LakeBasinSettings;
  readonly terrainPreset?: LakeTerrainPreset;
}

export interface LakeEditRevision {
  readonly document: LakeEditDocument;
  readonly terrain: LakeTerrainSnapshot;
  readonly baseTerrain: WaterTerrainSnapshot;
  readonly derivedTerrain: WaterTerrainSnapshot;
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly revision: number;
}

export interface PreparedLakeEdit {
  /** Synchronously publishes ground, water, queries and their observation state. */
  commit(): void;
  finalize(): Promise<void>;
  rollback(): Promise<void>;
}

export function createLakeEditRevision(
  template: HeightfieldWaterDescriptorV1,
  source: LakeEditDocument,
  revision: number,
  previous?: LakeEditRevision
): LakeEditRevision {
  const document: LakeEditDocument = structuredClone(source);
  const shape = (d: LakeEditDocument) => ({
    rings: d.boundary.rings,
    error: d.boundary.maxChordError,
    segmentLength: d.boundary.maxSegmentLength,
    basin: d.basin,
    terrainPreset: d.terrainPreset ?? "hills"
  });
  const preset = document.terrainPreset ?? "hills";
  if (
    preset === "existing-basin" &&
    previous?.document.terrainPreset === preset &&
    hashStableValue(shape(previous.document)) !== hashStableValue(shape(document))
  )
    throw new Error("Existing terrain is read-only; select a carving preset to edit the basin or reference outline.");
  const baseTerrain =
    previous && (previous.document.terrainPreset ?? "hills") === preset
      ? previous.baseTerrain
      : createLakeDemoBaseTerrain(template.grid, preset);
  const sameGround = previous && hashStableValue(shape(previous.document)) === hashStableValue(shape(document));
  let derivedTerrain = sameGround ? previous.derivedTerrain : baseTerrain;
  if (!sameGround && preset !== "existing-basin") {
    if (document.basin.profile === "calibration") {
      // This fixed-depth optical fixture remains Demo policy, outside the public modifier.
      const calibration = createLakeBasinTerrain(document.boundary, template.grid, document.basin);
      derivedTerrain = captureWaterTerrainSnapshot(
        { ...baseTerrain, id: "lake-demo-calibration", revision },
        (x, z) =>
          calibration.heights[
            Math.round((z - baseTerrain.origin[1]) / baseTerrain.spacing) * baseTerrain.columns +
              Math.round((x - baseTerrain.origin[0]) / baseTerrain.spacing)
          ]
      );
    } else derivedTerrain = deriveLakeDemoTerrain(baseTerrain, document.boundary, document.basin, revision);
  }
  const descriptor = createLakeFromTerrain({
    ...template,
    terrain: derivedTerrain,
    coverage: { kind: "terrain-basin", waterLevel: document.boundary.waterLevel }
  });
  const terrain =
    sameGround || (previous && derivedTerrain === previous.derivedTerrain)
      ? previous!.terrain
      : Object.freeze({
          grid: descriptor.grid,
          heights: descriptor.bedHeights!,
          hash: hashStableValue({ grid: descriptor.grid, heights: descriptor.bedHeights })
        });
  return Object.freeze({ document, terrain, baseTerrain, derivedTerrain, descriptor, revision });
}

/** Serialized edits retain the last published generation. Superseded work is cancelled before publication. */
export class LakeEditSession {
  private _current: LakeEditRevision;
  private _draft: LakeEditDocument;
  private readonly _history: LakeEditDocument[] = [];
  private _queue: Promise<void> = Promise.resolve();
  private _request = 0;
  private _abort?: AbortController;
  private _disposed = false;
  private _pendingEdit?: { documentHash: string; undo: boolean; promise: Promise<void> };
  private _error: string | null = null;

  constructor(
    initial: LakeEditRevision,
    private readonly _prepare: (next: LakeEditRevision, signal: AbortSignal) => Promise<PreparedLakeEdit>
  ) {
    this._current = initial;
    this._draft = structuredClone(initial.document);
  }

  get current(): LakeEditRevision {
    return this._current;
  }
  get draft(): LakeEditDocument {
    return structuredClone(this._draft);
  }
  get status() {
    return {
      revision: this._current.revision,
      pending: this._pendingEdit !== undefined,
      error: this._error,
      canUndo: this._history.length > 0,
      terrainHash: this._current.terrain.hash,
      baseTerrainId: this._current.baseTerrain.id,
      baseTerrainRevision: this._current.baseTerrain.revision,
      terrainPreset: this._current.document.terrainPreset ?? "hills"
    };
  }

  update(document: LakeEditDocument): Promise<void> {
    return this._schedule(document, false);
  }
  undo(): Promise<void> {
    const previous = this._history[this._history.length - 1];
    if (!previous) return Promise.resolve();
    return this._schedule(previous, true);
  }
  cancel(): void {
    this._request++;
    this._abort?.abort();
    this._pendingEdit = undefined;
    this._draft = structuredClone(this._current.document);
  }
  async dispose(): Promise<void> {
    this._disposed = true;
    this.cancel();
    await this._queue;
  }

  private _schedule(source: LakeEditDocument, undo: boolean): Promise<void> {
    if (this._disposed) return Promise.reject(new Error("Lake editor is disposed."));
    const document = structuredClone(source);
    const documentHash = hashStableValue(document);
    if (this._pendingEdit?.documentHash === documentHash && this._pendingEdit.undo === undo) {
      return this._pendingEdit.promise;
    }
    this._draft = document;
    this._abort?.abort();
    const request = ++this._request;
    this._error = null;
    const operation = this._queue.then(async () => {
      if (request !== this._request || this._disposed) return;
      const abort = (this._abort = new AbortController());
      let prepared: PreparedLakeEdit | undefined;
      let committed = false;
      try {
        // Compare after prior work has settled: reverting a pending edit must still cancel it.
        if (documentHash === hashStableValue(this._current.document)) return;
        const next = createLakeEditRevision(
          this._current.descriptor,
          document,
          this._current.revision + 1,
          this._current
        );
        prepared = await this._prepare(next, abort.signal);
        if (abort.signal.aborted || request !== this._request || this._disposed) {
          await prepared.rollback();
          return;
        }
        prepared.commit();
        committed = true;
        if (undo) this._history.pop();
        else this._history.push(this._current.document);
        this._current = next;
        this._draft = structuredClone(next.document);
        await prepared.finalize();
      } catch (error) {
        if (prepared && !committed) await prepared.rollback();
        if (request === this._request) {
          this._error = error instanceof Error ? error.message : String(error);
          this._draft = structuredClone(this._current.document);
        }
        if (!abort.signal.aborted) throw error;
      } finally {
        if (request === this._request) this._pendingEdit = undefined;
      }
    });
    this._queue = operation.catch(() => {});
    this._pendingEdit = { documentHash, undo, promise: operation };
    return operation;
  }
}
