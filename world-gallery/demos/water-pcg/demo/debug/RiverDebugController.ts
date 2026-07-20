/** Demo-only lifecycle for per-reach debug views. */
import type { Engine } from "@galacean/engine-core";
import type { RiverQuerySourceData, RiverSamplePoint } from "../../compiler/river/types";
import type { RiverRuntimeReach } from "../../runtime/river/RiverRuntimeController";
import type { RiverQueryResult } from "../../runtime/river/types";
import type { RiverDemoConfig } from "../types";
import type { RiverDebugMode } from "./constants";
import { RiverDebugView } from "./RiverDebugView";

export class RiverDebugController {
  private readonly _viewSets = new Map<string, RiverDebugView[]>();
  private _activeViews: RiverDebugView[] = [];

  constructor(private readonly _engine: Engine) {}

  activate(networkId: string, reaches: readonly RiverRuntimeReach[]): void {
    const cached = this._viewSets.get(networkId);
    if (cached) {
      this._activeViews = cached;
      return;
    }
    const views = reaches.map((reach) => new RiverDebugView(this._engine, reach.root));
    this._viewSets.set(networkId, views);
    this._activeViews = views;
  }

  replace(networkId: string, reaches: readonly RiverRuntimeReach[]): void {
    this.remove(networkId);
    this.activate(networkId, reaches);
  }

  update(
    reachIndex: number,
    config: RiverDemoConfig,
    mode: RiverDebugMode,
    queryT: number,
    samples: RiverSamplePoint[],
    querySource: RiverQuerySourceData,
    dirty: { geometry: boolean; query: boolean }
  ): RiverQueryResult | undefined {
    return this._activeViews[reachIndex]?.update(this._engine, config, mode, queryT, samples, querySource, dirty);
  }

  remove(networkId: string): void {
    const views = this._viewSets.get(networkId);
    if (!views) return;
    for (const view of views) view.destroy();
    this._viewSets.delete(networkId);
    if (this._activeViews === views) this._activeViews = [];
  }

  destroy(): void {
    for (const views of this._viewSets.values()) {
      for (const view of views) view.destroy();
    }
    this._viewSets.clear();
    this._activeViews = [];
  }
}
