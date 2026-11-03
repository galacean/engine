/** Per-handle generation ownership for atomic, latest-wins Water replacement. */

export interface WaterActivationGeneration {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly active: boolean;
  assertCurrent(): void;
  finish(): void;
}

export class WaterActivationTransaction {
  private _generation = 0;
  private _current?: {
    readonly id: number;
    readonly abortController: AbortController;
  };

  get active(): boolean {
    return this._current !== undefined;
  }

  begin(externalSignal?: AbortSignal): WaterActivationGeneration {
    this.cancel();
    const id = ++this._generation;
    const abortController = new AbortController();
    const onExternalAbort = (): void => abortController.abort();
    if (externalSignal?.aborted) abortController.abort();
    else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    const generation = { id, abortController };
    this._current = generation;
    let finished = false;
    const isCurrent = (): boolean => this._current === generation && !abortController.signal.aborted;
    return Object.freeze({
      id,
      signal: abortController.signal,
      get active() {
        return !finished && isCurrent();
      },
      assertCurrent: () => {
        if (!finished && isCurrent()) return;
        throw new DOMException("Water body replacement was superseded.", "AbortError");
      },
      finish: () => {
        if (finished) return;
        finished = true;
        externalSignal?.removeEventListener("abort", onExternalAbort);
        if (this._current === generation) this._current = undefined;
      }
    });
  }

  cancel(): void {
    this._current?.abortController.abort();
    this._current = undefined;
  }
}
