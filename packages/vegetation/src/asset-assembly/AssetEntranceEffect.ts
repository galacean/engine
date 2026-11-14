import { Entity, MeshRenderer, Script, ShaderMacro, ShaderProperty } from "@galacean/engine";
import { ASSET_ASSEMBLY_ENTRANCE_DURATION_MS } from "./AssetAssemblyRenderProfile";

const GENERATION_REVEAL_MACRO = ShaderMacro.getByName("RENDERER_GENERATION_REVEAL");
const REVEAL_PROGRESS = ShaderProperty.getByName("renderer_GenerationRevealProgress");
const REVEAL_ORIGIN_Y = ShaderProperty.getByName("renderer_GenerationRevealOriginY");
const REVEAL_HEIGHT = ShaderProperty.getByName("renderer_GenerationRevealHeight");
const REVEAL_LIFT = ShaderProperty.getByName("renderer_GenerationRevealLift");

/** Default crest displacement shared with assembled shrubs, grass, flowers, and rocks. */
export const ASSET_ENTRANCE_LIFT_METRES = 0.8;

/** Semantic world-space height interval occupied by one renderer's current visible content. */
export interface AssetEntranceRevealRange {
  readonly minimumY: number;
  readonly maximumY: number;
}

interface MutableAssetEntranceRevealRange {
  minimumY: number;
  maximumY: number;
}

const explicitRevealRanges = new WeakMap<MeshRenderer, MutableAssetEntranceRevealRange>();
const activeTransactions = new Set<AssetEntranceTransaction>();

/** Runtime-only playback controls for an asset entrance. */
export interface AssetEntranceEffectOptions {
  /** Positive playback duration. Defaults to the Asset Assembly two-second contract. */
  readonly durationMs?: number;
  /** Non-negative vertical crest displacement in world metres. */
  readonly liftMetres?: number;
  /** Optional cancellation owned by the publishing runtime. */
  readonly signal?: AbortSignal;
}

/**
 * Publishes the semantic reveal interval independently from the renderer's conservative culling Bounds.
 * Dynamic instancing runtimes should update this whenever their submitted instance prefix changes.
 * @param renderer Renderer whose current content owns the supplied world-space interval.
 * @param range Finite inclusive world-space Y interval.
 * @returns Nothing.
 */
export function setAssetEntranceRevealRange(renderer: MeshRenderer, range: AssetEntranceRevealRange): void {
  setAssetEntranceRevealRangeValues(renderer, range.minimumY, range.maximumY);
}

/**
 * Publishes one semantic reveal interval without requiring a caller-owned range object.
 * Dynamic renderer slots use this hot-path form to retain their per-renderer range state.
 * @param renderer Renderer whose current content owns the supplied world-space interval.
 * @param minimumY First finite world-space Y endpoint.
 * @param maximumY Second finite world-space Y endpoint.
 * @returns Nothing.
 */
export function setAssetEntranceRevealRangeValues(renderer: MeshRenderer, minimumY: number, maximumY: number): void {
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) {
    throw new RangeError("Asset entrance reveal range must be finite");
  }
  const normalizedMinimumY = Math.min(minimumY, maximumY);
  const normalizedMaximumY = Math.max(minimumY, maximumY);
  let range = explicitRevealRanges.get(renderer);
  if (!range) {
    range = { minimumY: normalizedMinimumY, maximumY: normalizedMaximumY };
    explicitRevealRanges.set(renderer, range);
  } else {
    range.minimumY = normalizedMinimumY;
    range.maximumY = normalizedMaximumY;
  }
  applyAssetEntranceRange(renderer, range);
  if (activeTransactions.size > 0) activeTransactions.forEach(adoptRendererForActiveTransaction, renderer);
}

function adoptRendererForActiveTransaction(this: MeshRenderer, transaction: AssetEntranceTransaction): void {
  transaction.adopt(this);
}

/** Applies one semantic entrance state to a Renderer currently presenting its owning stable instance. */
export function setRendererAssetEntranceProgress(
  renderer: MeshRenderer,
  progress: number,
  liftMetres = ASSET_ENTRANCE_LIFT_METRES
): boolean {
  validateRendererAssetEntranceProgress(progress, liftMetres);
  if (renderer.destroyed || renderer.pendingDestroy) return false;
  const range = resolveAssetEntranceRange(renderer);
  if (!range) {
    settleAssetEntranceRenderer(renderer);
    return false;
  }
  applyRendererAssetEntranceProgress(renderer, progress, range.minimumY, range.maximumY, liftMetres);
  return true;
}

/** Applies entrance progress from caller-retained range scalars without temporary range storage. */
export function setRendererAssetEntranceProgressValues(
  renderer: MeshRenderer,
  progress: number,
  minimumY: number,
  maximumY: number,
  liftMetres = ASSET_ENTRANCE_LIFT_METRES
): boolean {
  validateRendererAssetEntranceProgress(progress, liftMetres);
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) {
    throw new RangeError("Asset entrance reveal range must be finite");
  }
  if (renderer.destroyed || renderer.pendingDestroy) return false;
  applyRendererAssetEntranceProgress(
    renderer,
    progress,
    Math.min(minimumY, maximumY),
    Math.max(minimumY, maximumY),
    liftMetres
  );
  return true;
}

function validateRendererAssetEntranceProgress(progress: number, liftMetres: number): void {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new RangeError("Asset entrance progress must be finite and normalized");
  }
  if (!Number.isFinite(liftMetres) || liftMetres < 0) {
    throw new RangeError("Asset entrance lift must be finite and non-negative");
  }
}

function applyRendererAssetEntranceProgress(
  renderer: MeshRenderer,
  progress: number,
  minimumY: number,
  maximumY: number,
  liftMetres: number
): void {
  renderer.shaderData.enableMacro(GENERATION_REVEAL_MACRO);
  applyAssetEntranceRangeValues(renderer, minimumY, maximumY);
  renderer.shaderData.setFloat(REVEAL_LIFT, liftMetres);
  renderer.shaderData.setFloat(REVEAL_PROGRESS, progress);
}

/** Restores one pooled Renderer to its unconditional authored presentation. */
export function settleRendererAssetEntranceEffect(renderer: MeshRenderer): void {
  settleAssetEntranceRenderer(renderer);
}

/**
 * Applies Asset Assembly's bottom-up reveal to the live material Renderer set below the supplied roots.
 * The effect only changes renderer presentation state; authored transforms and world data stay untouched.
 * @param roots Asset-only scene roots. Terrain and gameplay roots should not be included.
 * @param options Playback duration, crest displacement, and cancellation.
 * @returns Promise resolved after every Renderer participating during the transaction reaches its authored appearance.
 */
export async function playAssetEntranceEffect(
  roots: readonly Entity[],
  options: Readonly<AssetEntranceEffectOptions> = {}
): Promise<void> {
  const playbackRoot = roots.find((root) => !root.destroyed && !root.pendingDestroy);
  const transaction = AssetEntranceTransaction.forRoots(roots, options.liftMetres ?? ASSET_ENTRANCE_LIFT_METRES);
  return playAssetEntranceTransaction(playbackRoot, transaction, options);
}

/**
 * Applies the shared entrance presentation to an already-published Renderer set.
 * This is the handoff used by dynamic runtimes which must retain their canonical Mesh, Material, and Renderer
 * ownership instead of creating a duplicate presentation hierarchy.
 * @param playbackRoot Live owner used only to advance the effect on Engine frames.
 * @param renderers Canonical Renderers which have already completed their first runtime submission.
 * @param options Playback duration, crest displacement, and cancellation.
 * @returns Promise resolved after the canonical Renderers reach their authored appearance.
 */
export async function playRendererAssetEntranceEffect(
  playbackRoot: Entity,
  renderers: readonly MeshRenderer[],
  options: Readonly<AssetEntranceEffectOptions> = {}
): Promise<void> {
  const transaction = AssetEntranceTransaction.forRenderers(
    renderers,
    options.liftMetres ?? ASSET_ENTRANCE_LIFT_METRES
  );
  return playAssetEntranceTransaction(playbackRoot, transaction, options);
}

async function playAssetEntranceTransaction(
  playbackRoot: Entity | undefined,
  transaction: AssetEntranceTransaction,
  options: Readonly<AssetEntranceEffectOptions>
): Promise<void> {
  const durationMs = options.durationMs ?? ASSET_ASSEMBLY_ENTRANCE_DURATION_MS;
  const liftMetres = options.liftMetres ?? ASSET_ENTRANCE_LIFT_METRES;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError("Asset entrance duration must be positive and finite");
  }
  if (!Number.isFinite(liftMetres) || liftMetres < 0) {
    throw new RangeError("Asset entrance lift must be finite and non-negative");
  }
  options.signal?.throwIfAborted();

  activeTransactions.add(transaction);
  try {
    transaction.captureInitialMembers();
    transaction.setProgress(0);
  } catch (error) {
    activeTransactions.delete(transaction);
    try {
      transaction.settle();
    } catch {
      // Preserve the initiating error after making a best-effort authored-state rollback.
    }
    throw error;
  }

  await new Promise<void>((resolve, reject) => {
    let elapsedMs = 0;
    let settled = false;
    let driver: AssetEntrancePlaybackDriver | undefined;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      activeTransactions.delete(transaction);
      let finalError = error;
      try {
        driver?.stop();
      } catch (driverError) {
        finalError ??= driverError;
      }
      try {
        transaction.settle();
      } catch (settlementError) {
        finalError ??= settlementError;
      }
      finalError === undefined ? resolve() : reject(finalError);
    };
    const abort = (): void =>
      finish(options.signal?.reason ?? new DOMException("Asset entrance aborted", "AbortError"));
    const advance = (deltaTimeSeconds: number): void => {
      if (settled) return;
      try {
        if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
          throw new RangeError("Asset entrance Engine delta time must be finite and non-negative");
        }
        elapsedMs += deltaTimeSeconds * 1_000;
        const progress = Math.min(1, elapsedMs / durationMs);
        transaction.setProgress(progress);
        if (progress >= 1) finish();
      } catch (error) {
        finish(error);
      }
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (!playbackRoot) {
      finish(new Error("Asset entrance requires at least one live Engine Entity root"));
      return;
    }
    try {
      driver = playbackRoot.addComponent(AssetEntrancePlaybackDriver);
      driver.start(advance);
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Advances presentation strictly on Engine frames. The first update only arms playback because its
 * delta may include synchronous work completed before this transaction was registered mid-frame.
 */
class AssetEntrancePlaybackDriver extends Script {
  private _advance: ((deltaTimeSeconds: number) => void) | undefined;
  private _armed = false;

  start(advance: (deltaTimeSeconds: number) => void): void {
    if (this._advance) throw new Error("Asset entrance playback driver is already started");
    this._advance = advance;
  }

  override onUpdate(deltaTimeSeconds: number): void {
    const advance = this._advance;
    if (!advance) return;
    if (!this._armed) {
      this._armed = true;
      advance(0);
      return;
    }
    advance(deltaTimeSeconds);
  }

  stop(): void {
    this._advance = undefined;
    this.destroy();
  }
}

class AssetEntranceTransaction {
  private readonly _roots: ReadonlySet<Entity>;
  private readonly _explicitRenderers: ReadonlySet<MeshRenderer> | undefined;
  private readonly _renderers = new Set<MeshRenderer>();
  private _progress = 0;

  private constructor(
    roots: readonly Entity[],
    renderers: readonly MeshRenderer[] | undefined,
    private readonly _liftMetres: number
  ) {
    this._roots = new Set(roots);
    this._explicitRenderers = renderers ? new Set(renderers) : undefined;
  }

  static forRoots(roots: readonly Entity[], liftMetres: number): AssetEntranceTransaction {
    return new AssetEntranceTransaction(roots, undefined, liftMetres);
  }

  static forRenderers(renderers: readonly MeshRenderer[], liftMetres: number): AssetEntranceTransaction {
    return new AssetEntranceTransaction([], renderers, liftMetres);
  }

  captureInitialMembers(): void {
    const renderers = this._explicitRenderers ?? collectAssetRenderers([...this._roots]);
    for (const renderer of renderers) this._configure(renderer);
  }

  adopt(renderer: MeshRenderer): void {
    if (this._owns(renderer)) this._configure(renderer);
  }

  setProgress(progress: number): void {
    this._progress = progress;
    setAssetEntranceProgress(this._renderers, progress);
  }

  settle(): void {
    this._progress = 1;
    settleAssetEntranceRenderers(this._renderers);
    this._renderers.clear();
  }

  private _configure(renderer: MeshRenderer): void {
    if (renderer.destroyed || renderer.pendingDestroy) {
      this._renderers.delete(renderer);
      return;
    }
    if (!setRendererAssetEntranceProgress(renderer, this._progress, this._liftMetres)) {
      // Fail open. A dynamic runtime can join later by publishing its finite semantic range.
      this._renderers.delete(renderer);
      return;
    }
    this._renderers.add(renderer);
  }

  private _owns(renderer: MeshRenderer): boolean {
    if (this._explicitRenderers) return this._explicitRenderers.has(renderer);
    let entity: Entity | null | undefined = renderer.entity;
    while (entity) {
      if (this._roots.has(entity)) return true;
      entity = entity.parent;
    }
    return false;
  }
}

function collectAssetRenderers(roots: readonly Entity[]): MeshRenderer[] {
  const renderers: MeshRenderer[] = [];
  const seen = new Set<MeshRenderer>();
  for (const root of roots) {
    const descendants: MeshRenderer[] = [];
    root.getComponentsIncludeChildren(MeshRenderer, descendants);
    for (const renderer of descendants) {
      if (!seen.has(renderer)) {
        seen.add(renderer);
        renderers.push(renderer);
      }
    }
  }
  return renderers;
}

function resolveAssetEntranceRange(renderer: MeshRenderer): AssetEntranceRevealRange | undefined {
  const explicit = explicitRevealRanges.get(renderer);
  if (explicit) return explicit;

  const worldRange = finiteBoundsRange(renderer.bounds);
  if (worldRange) return worldRange;

  // Disabled Prefab LOD renderers can expose an empty cached world Bounds before their first active frame.
  // Their source Mesh and transform are still authoritative, so derive the same interval without enabling them.
  const localBounds = renderer.mesh?.bounds;
  if (!localBounds || !finiteBoundsRange(localBounds)) return undefined;
  const derivedBounds = localBounds.clone();
  derivedBounds.transform(renderer.entity.transform.worldMatrix);
  return finiteBoundsRange(derivedBounds);
}

function finiteBoundsRange(
  bounds: Readonly<{ min: { y: number }; max: { y: number } }>
): AssetEntranceRevealRange | undefined {
  const minimumY = bounds.min.y;
  const maximumY = bounds.max.y;
  if (!Number.isFinite(minimumY) || !Number.isFinite(maximumY)) return undefined;
  return { minimumY: Math.min(minimumY, maximumY), maximumY: Math.max(minimumY, maximumY) };
}

function applyAssetEntranceRange(renderer: MeshRenderer, range: AssetEntranceRevealRange): void {
  applyAssetEntranceRangeValues(renderer, range.minimumY, range.maximumY);
}

function applyAssetEntranceRangeValues(renderer: MeshRenderer, minimumY: number, maximumY: number): void {
  renderer.shaderData.setFloat(REVEAL_ORIGIN_Y, minimumY);
  renderer.shaderData.setFloat(REVEAL_HEIGHT, Math.max(0.001, maximumY - minimumY));
}

function setAssetEntranceProgress(renderers: Iterable<MeshRenderer>, progress: number): void {
  for (const renderer of renderers) {
    if (!renderer.destroyed && !renderer.pendingDestroy) renderer.shaderData.setFloat(REVEAL_PROGRESS, progress);
  }
}

function settleAssetEntranceRenderers(renderers: Iterable<MeshRenderer>): void {
  for (const renderer of renderers) settleAssetEntranceRenderer(renderer);
}

function settleAssetEntranceRenderer(renderer: MeshRenderer): void {
  if (renderer.destroyed || renderer.pendingDestroy) return;
  renderer.shaderData.setFloat(REVEAL_PROGRESS, 1);
  // Progress=1 is visually complete only inside the captured height interval. Removing
  // the presentation macro makes the authored renderer state the unconditional endpoint.
  renderer.shaderData.disableMacro(GENERATION_REVEAL_MACRO);
}
