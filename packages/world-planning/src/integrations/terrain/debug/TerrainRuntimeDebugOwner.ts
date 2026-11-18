import type { Engine } from "@galacean/engine";
import type { TerrainDemoControls, TerrainDemoControlsOptions } from "./TerrainDemoControls.ts";
import type {
  TerrainRuntimeDebug,
  TerrainRuntimeDebugOptions
} from "@galacean/engine-terrain/terrain/debug/TerrainRuntimeDebug";
import type {
  TerrainRuntimeDebugInspector,
  TerrainRuntimeDebugInspectorOptions
} from "./TerrainRuntimeDebugInspector.ts";
import type {
  TerrainScreenSpaceReflectionPanel,
  TerrainScreenSpaceReflectionPanelOptions
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import type { TerrainVolumetricCloudPanel } from "./TerrainVolumetricCloudPanel.ts";
import type { WorldEnvironmentRuntime } from "../environment/WorldEnvironmentRuntime.ts";

/** Inputs for one complete five-module Terrain debug surface. */
export interface TerrainRuntimeDebugOwnerOptions {
  /** Runtime identity used to deduplicate repeated creation requests. */
  readonly key: object;
  /** Engine whose optional diagnostic Material resources are loaded. */
  readonly engine?: Engine;
  /** Renderer, camera, and lighting inputs for pages that opt into core runtime diagnostics. */
  readonly runtimeDebug?: TerrainRuntimeDebugOptions;
  /** Camera and page-owned element capabilities exposed by shared controls. */
  readonly controls: TerrainDemoControlsOptions;
  /** Inspector dependencies excluding the runtime Debug and controls created here. */
  readonly inspector: Omit<TerrainRuntimeDebugInspectorOptions, "debug" | "controls">;
  /** Live Camera SSR configuration and status bridge. */
  readonly screenSpaceReflection: TerrainScreenSpaceReflectionPanelOptions;
  /** Shared weather environment exposed by the volumetric-cloud panel. */
  readonly environment: WorldEnvironmentRuntime;
}

/** One active set of the five shared Terrain debug modules. */
export interface TerrainRuntimeDebugSession {
  /** Runtime identity supplied to the owner. */
  readonly key: object;
  /** Core renderer and lighting diagnostics, when the page opts into them. */
  readonly debug?: TerrainRuntimeDebug;
  /** Shared camera and element controls. */
  readonly controls: TerrainDemoControls;
  /** Complete shared dat.gui inspector. */
  readonly inspector: TerrainRuntimeDebugInspector;
  /** Water-scoped SSR tuning and live status panel. */
  readonly screenSpaceReflectionPanel: TerrainScreenSpaceReflectionPanel;
  /** Climate-scoped volumetric-cloud tuning panel. */
  readonly volumetricCloudPanel: TerrainVolumetricCloudPanel;
}

/** Construction boundary used by the owner and deterministic lifecycle tests. */
export interface TerrainRuntimeDebugModuleFactory {
  /** Loads core runtime diagnostics. */
  createRuntimeDebug(engine: Engine, options: TerrainRuntimeDebugOptions): Promise<TerrainRuntimeDebug>;
  /** Creates shared camera and element controls. */
  createControls(options: TerrainDemoControlsOptions): TerrainDemoControls;
  /** Creates the shared inspector. */
  createInspector(options: TerrainRuntimeDebugInspectorOptions): TerrainRuntimeDebugInspector;
  /** Appends the SSR panel below Water after the shared inspector. */
  createScreenSpaceReflectionPanel(
    inspector: TerrainRuntimeDebugInspector,
    options: TerrainScreenSpaceReflectionPanelOptions
  ): TerrainScreenSpaceReflectionPanel;
  /** Appends the volumetric-cloud panel below Climate. */
  createVolumetricCloudPanel(
    inspector: TerrainRuntimeDebugInspector,
    environment: WorldEnvironmentRuntime
  ): TerrainVolumetricCloudPanel;
}

interface OwnedTerrainRuntimeDebugSession {
  readonly session: TerrainRuntimeDebugSession;
  destroyed: boolean;
}

/** Owns creation order, generation invalidation, and exact-once teardown for Terrain Debug. */
export class TerrainRuntimeDebugOwner {
  private readonly _factory: TerrainRuntimeDebugModuleFactory;
  private _epoch = 0;
  private _current: OwnedTerrainRuntimeDebugSession | undefined;
  private _creation:
    | { readonly key: object; readonly task: Promise<TerrainRuntimeDebugSession | undefined> }
    | undefined;
  private _destroyed = false;

  /**
   * Creates a reusable owner without mounting Debug until {@link create} is called.
   * @param factory Module constructors shared by every Terrain page.
   */
  constructor(factory: TerrainRuntimeDebugModuleFactory) {
    this._factory = factory;
  }

  /** Current complete session, or `undefined` while absent or still loading. */
  get current(): TerrainRuntimeDebugSession | undefined {
    return this._current?.session;
  }

  /**
   * Mounts one complete Debug surface and invalidates an older runtime generation.
   * @param options Runtime identity and dependencies shared by the five modules.
   * @returns The current session, or `undefined` when this request became stale while loading.
   * @throws If the owner was destroyed or a module cannot be created.
   */
  create(options: TerrainRuntimeDebugOwnerOptions): Promise<TerrainRuntimeDebugSession | undefined> {
    if (this._destroyed) throw new Error("Terrain runtime Debug owner has been destroyed.");
    if (this._current?.session.key === options.key) return Promise.resolve(this._current.session);
    if (this._creation?.key === options.key) return this._creation.task;

    const epoch = ++this._epoch;
    this._destroyCurrent();
    const task = this._createSession(options, epoch);
    this._creation = { key: options.key, task };
    const clearCreation = (): void => {
      if (this._creation?.task === task) this._creation = undefined;
    };
    void task.then(clearCreation, clearCreation);
    return task;
  }

  /**
   * Invalidates pending creation and removes the current session while allowing later recreation.
   * @returns Nothing.
   */
  dispose(): void {
    if (this._destroyed) return;
    this._epoch++;
    this._creation = undefined;
    this._destroyCurrent();
  }

  /**
   * Permanently invalidates pending creation and tears down the current session exactly once.
   * @returns Nothing.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._epoch++;
    this._creation = undefined;
    this._destroyCurrent();
  }

  private async _createSession(
    options: TerrainRuntimeDebugOwnerOptions,
    epoch: number
  ): Promise<TerrainRuntimeDebugSession | undefined> {
    let debug: TerrainRuntimeDebug | undefined;
    let controls: TerrainDemoControls | undefined;
    let inspector: TerrainRuntimeDebugInspector | undefined;
    let screenSpaceReflectionPanel: TerrainScreenSpaceReflectionPanel | undefined;
    let volumetricCloudPanel: TerrainVolumetricCloudPanel | undefined;
    try {
      if (options.runtimeDebug) {
        if (!options.engine) throw new Error("Terrain runtime diagnostics require an Engine.");
        debug = await this._factory.createRuntimeDebug(options.engine, options.runtimeDebug);
        if (!this._isCurrent(epoch)) {
          debug.destroy();
          return undefined;
        }
      }
      controls = this._factory.createControls(options.controls);
      inspector = this._factory.createInspector({ ...options.inspector, ...(debug ? { debug } : {}), controls });
      screenSpaceReflectionPanel = this._factory.createScreenSpaceReflectionPanel(
        inspector,
        options.screenSpaceReflection
      );
      volumetricCloudPanel = this._factory.createVolumetricCloudPanel(inspector, options.environment);
      const session: TerrainRuntimeDebugSession = Object.freeze({
        key: options.key,
        ...(debug ? { debug } : {}),
        controls,
        inspector,
        screenSpaceReflectionPanel,
        volumetricCloudPanel
      });
      const owned = { session, destroyed: false };
      if (!this._isCurrent(epoch)) {
        destroyOwnedSession(owned);
        return undefined;
      }
      this._current = owned;
      return session;
    } catch (error) {
      screenSpaceReflectionPanel?.destroy();
      volumetricCloudPanel?.destroy();
      inspector?.destroy();
      debug?.destroy();
      controls?.destroy();
      throw error;
    }
  }

  private _isCurrent(epoch: number): boolean {
    return !this._destroyed && epoch === this._epoch;
  }

  private _destroyCurrent(): void {
    if (!this._current) return;
    destroyOwnedSession(this._current);
    this._current = undefined;
  }
}

function destroyOwnedSession(owned: OwnedTerrainRuntimeDebugSession): void {
  if (owned.destroyed) return;
  owned.destroyed = true;
  const session = owned.session;
  session.screenSpaceReflectionPanel.destroy();
  session.volumetricCloudPanel.destroy();
  session.inspector.destroy();
  session.debug?.destroy();
  session.controls.destroy();
}
