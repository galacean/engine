import { copyWaterTerrainSnapshot } from "../../authoring/terrain/WaterTerrainSnapshot";
import type { OceanEditDocument } from "../../authoring/ocean/OceanEditDocument";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import { createOceanNearshoreFromTerrain } from "../../compiler/ocean/OceanTerrainCompiler";
import { hashStableValue } from "../../compiler/shared/determinism";

export interface OceanEditRevision {
  readonly document: OceanEditDocument;
  readonly nearshore: OceanNearshoreDescriptorV1;
  readonly revision: number;
  readonly terrainHash: string;
  readonly documentHash: string;
}

export interface PreparedOceanEdit {
  /** Synchronous publication; failure must leave the previous generation visible. */
  commit(): void;
  /** Retired resource cleanup, never a reason to revert published authoring. */
  finalize(): Promise<void>;
  rollback(): Promise<void>;
}

export function createOceanEditRevision(
  template: OceanNearshoreDescriptorV1,
  ownership: Uint8Array,
  source: OceanEditDocument,
  revision: number
): OceanEditRevision {
  const terrain = copyWaterTerrainSnapshot(source.terrain);
  const document = Object.freeze({ waterLevel: source.waterLevel, terrain });
  const nearshore = createOceanNearshoreFromTerrain(template, ownership, document);
  const terrainHash = hashStableValue(terrain);
  return Object.freeze({
    document,
    nearshore,
    revision,
    terrainHash,
    documentHash: hashStableValue({ waterLevel: document.waterLevel, terrainHash })
  });
}

/** Latest submission wins before publication. Undo stores authored facts, never GPU resources. */
export class OceanEditSession {
  private _current: OceanEditRevision;
  private readonly _ownership: Uint8Array;
  private readonly _history: OceanEditDocument[] = [];
  private _queue: Promise<void> = Promise.resolve();
  private _request = 0;
  private _abort?: AbortController;
  private _disposed = false;
  private _pending = false;
  private _error: string | null = null;

  constructor(
    initial: OceanEditRevision,
    ownership: Uint8Array,
    private readonly _prepare: (next: OceanEditRevision, signal: AbortSignal) => Promise<PreparedOceanEdit>
  ) {
    this._current = initial;
    this._ownership = ownership.slice();
  }

  get current(): OceanEditRevision {
    return this._current;
  }
  get status() {
    return {
      revision: this._current.revision,
      waterLevel: this._current.document.waterLevel,
      terrainHash: this._current.terrainHash,
      pending: this._pending,
      canUndo: this._history.length > 0,
      error: this._error
    };
  }
  update(document: OceanEditDocument): Promise<void> {
    return this._schedule(document, false);
  }
  undo(): Promise<void> {
    const previous = this._history[this._history.length - 1];
    if (!previous) {
      this.cancel();
      return Promise.resolve();
    }
    return this._schedule(previous, true);
  }
  cancel(): void {
    this._request++;
    this._abort?.abort();
    this._pending = false;
  }
  async dispose(): Promise<void> {
    this._disposed = true;
    this.cancel();
    await this._queue;
  }

  private _schedule(source: OceanEditDocument, undo: boolean): Promise<void> {
    if (this._disposed) return Promise.reject(new Error("Ocean editor is disposed."));
    const document = structuredClone(source);
    this._abort?.abort();
    const request = ++this._request;
    this._pending = true;
    this._error = null;
    const operation = this._queue.then(async () => {
      if (request !== this._request || this._disposed) return;
      const abort = (this._abort = new AbortController());
      let prepared: PreparedOceanEdit | undefined,
        committed = false,
        cleanupFailed = false;
      try {
        const next = createOceanEditRevision(
          this._current.nearshore,
          this._ownership,
          document,
          this._current.revision + 1
        );
        if (next.documentHash === this._current.documentHash) return;
        prepared = await this._prepare(next, abort.signal);
        if (abort.signal.aborted || request !== this._request || this._disposed) {
          const rejected = prepared;
          prepared = undefined;
          try {
            await rejected.rollback();
          } catch (error) {
            cleanupFailed = true;
            throw error;
          }
          return;
        }
        prepared.commit();
        committed = true;
        if (undo) this._history.pop();
        else {
          this._history.push(this._current.document);
          if (this._history.length > 16) this._history.shift();
        }
        this._current = next;
        // Once published, a later request must not abort retirement of this revision.
        this._abort = undefined;
        await prepared.finalize();
      } catch (error) {
        let failure = error;
        if (prepared && !committed) {
          try {
            await prepared.rollback();
          } catch (rollbackError) {
            cleanupFailed = true;
            failure = new AggregateError([error, rollbackError], "Ocean edit failed and rollback cleanup also failed.");
          }
        }
        if (request === this._request) this._error = failure instanceof Error ? failure.message : String(failure);
        if (!abort.signal.aborted || committed || cleanupFailed) throw failure;
      } finally {
        if (request === this._request) {
          this._pending = false;
          this._abort = undefined;
        }
      }
    });
    this._queue = operation.catch(() => {});
    return operation;
  }
}
