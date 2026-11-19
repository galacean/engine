import type { Camera, Engine, Entity } from "@galacean/engine";
import type { EngineResidentScene } from "./EngineResidentScene";
import {
  getMasonryResidencyBudget,
  getMasonryLodTuning,
  subscribeMasonryLodTuning,
  type MasonryLodProbe,
  type MasonryLod,
  type MasonryLodView
} from "./MasonryLodPolicy";
import type { MasonryLodTransition } from "./MasonryLodTransition";

/** Disposable display state. No author directory, plan, object IDs or persistence. */
export interface MasonryResidencyEntry {
  fine?: { runtime: EngineResidentScene; destroy(): void };
  view: {
    root: Entity;
    readonly recentlyRendered: boolean;
    setVisualVisible(visible: boolean): void;
    setFarProxyActive?(active: boolean): void;
    releaseDetailedVisual?(): void;
    setLodDebugEnabled?(enabled: boolean): void;
    setFade(fade: number): void;
  };
  lod: MasonryLod;
  transition: MasonryLodTransition;
  prefetch: boolean;
  probe: MasonryLodProbe;
  budgetLod: MasonryLod;
  lastUsed: number;
  priority: number;
  visible: boolean;
  presentationVisible?: boolean;
  retained?: boolean;
  presentation?: number[];
  coarseVisible?: boolean;
  coarseFade?: number;
  error?: string;
}
export function createMasonryResidencyMetrics() {
  return {
    detailReady: 0,
    nearReady: 0,
    mediumReady: 0,
    cached: 0,
    cacheHits: 0,
    evictions: 0,
    residentBytes: 0,
    cachedBytes: 0,
    triangles: 0,
    fullTriangles: 0,
    requested: 0,
    pendingDetails: 0,
    transitioning: 0,
    residentLodUploadBytes: 0,
    unitLodSelectionMs: 0
  };
}

/** Shared screen-space selection, quality budgeting, crossfade and cache policy.
 * The caller owns asynchronous acquisition and publishes ready projections here. */
export class MasonryResidency<E extends MasonryResidencyEntry> {
  constructor(
    private readonly engine: Engine,
    private readonly camera: Camera,
    private readonly entries: readonly E[],
    private readonly metrics: ReturnType<typeof createMasonryResidencyMetrics>,
    private readonly onDemandChanged: () => void,
    private readonly onResourcesChanged: (evicted: E) => void
  ) {
    const ref = new WeakRef(this);
    const unsub = subscribeMasonryLodTuning(() => {
      const self = ref.deref();
      if (!self) {
        unsub();
        return;
      }
      self.selectionDirty = true;
      self.residencyDirty = true;
      self.syncLodDebugColors();
    });
  }
  private appliedDebugColorized = false;
  private syncLodDebugColors(): void {
    const colorized = getMasonryLodTuning().colorizeLod;
    if (this.appliedDebugColorized === colorized && !colorized) return;
    this.appliedDebugColorized = colorized;
    for (const e of this.entries) {
      e.view.setLodDebugEnabled?.(colorized);
      e.fine?.runtime.setLodDebugTint(colorized);
    }
  }
  invalidate(): void {
    this.residencyDirty = true;
  }
  updateDemand(dt: number): number {
    this.elapsed += Math.max(0, dt);
    const changes = this.cameraChanged();
    if (changes || this.selectionDirty) this.selectLod(changes);
    return changes;
  }
  updatePresentation(now: number): void {
    if (this.residencyDirty || now >= this.residencyWake || this.elapsed >= this.transitionWake)
      this.publishResidency(now);
  }

  private elapsed = 0;
  readonly desired = new Set<E>();
  selectionDirty = true;
  private residencyDirty = true;
  private residencyWake = Infinity;
  private transitionWake = Infinity;
  // Own scalar snapshots: engine matrices and transition scratch arrays are mutable.
  private readonly cameraSnapshot = new Float64Array(40).fill(NaN);
  private readonly lodView: MasonryLodView = {
    view: [],
    projection: [],
    orthographic: false,
    pixelHeight: 0,
    near: 0,
    far: 0
  };
  private cameraChanged(): number {
    const c = this.camera,
      snapshot = this.cameraSnapshot;
    let changed = 0;
    const view = c.viewMatrix.elements,
      projection = c.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (snapshot[i] !== view[i]) {
        snapshot[i] = view[i];
        changed |= 1;
      }
      if (snapshot[i + 16] !== projection[i]) {
        snapshot[i + 16] = projection[i];
        changed |= 4;
      }
    }
    const position = c.entity.transform.worldPosition;
    changed |= capture(snapshot, 32, this.engine.canvas.height * c.viewport.w, 4);
    changed |= capture(snapshot, 33, Number(c.isOrthographic), 4);
    changed |= capture(snapshot, 34, c.nearClipPlane, 4);
    changed |= capture(snapshot, 35, c.farClipPlane, 4);
    changed |= capture(snapshot, 36, this.engine.canvas.width * c.viewport.z, 4);
    changed |= capture(snapshot, 37, position.x, 2);
    changed |= capture(snapshot, 38, position.y, 2);
    changed |= capture(snapshot, 39, position.z, 2);
    return changed;
  }
  private selectLod(changes: number) {
    const camera = this.camera;
    // Probes read this view synchronously, so one owned record is reused every selection
    const view = this.lodView;
    view.view = camera.viewMatrix.elements;
    view.projection = camera.projectionMatrix.elements;
    view.orthographic = camera.isOrthographic;
    view.pixelHeight = this.engine.canvas.height * camera.viewport.w;
    view.near = camera.nearClipPlane;
    view.far = camera.farClipPlane;
    let demandChanged = this.selectionDirty;
    const flags = this.selectionDirty ? 7 : changes;
    this.selectionDirty = false;
    const position = camera.entity.transform.worldPosition;
    const detailCandidates: E[] = [];
    const fullCandidates: E[] = [];
    for (const e of this.entries) {
      e.probe.update(view, position, flags, e.lod);
      // An unloaded request entering view changes queue order, not resident LOD
      // allocation. Wake its loader without sorting/publishing every resident.
      if (e.visible !== e.probe.visible && this.desired.has(e)) this.onDemandChanged();
      if (e.lod !== e.probe.lod || (e.fine && e.visible !== e.probe.visible)) demandChanged = true;
      e.lod = e.probe.lod;
      e.visible = e.probe.visible;
      e.prefetch = e.probe.eligible;
      if (e.lod < 2 && e.visible) {
        detailCandidates.push(e);
        if (e.lod === 0 && e.fine) fullCandidates.push(e);
      }
    }
    const budget = getMasonryResidencyBudget();
    let wantedSet: Set<E> | null = null;
    if (detailCandidates.length > budget.maxDetailBuildings) {
      for (const e of detailCandidates) e.priority = e.probe.priority();
      detailCandidates.sort((a, b) => this.detailRankScore(b) - this.detailRankScore(a));
      wantedSet = new Set(detailCandidates.slice(0, budget.maxDetailBuildings));
    }
    if (!demandChanged && flags & 6 && fullCandidates.length > budget.maxFullBuildings) {
      for (const e of fullCandidates) e.priority = e.probe.priority();
      fullCandidates.sort((a, b) => this.detailRankScore(b) - this.detailRankScore(a));
      const fullCap = Math.min(budget.maxFullBuildings, budget.maxDetailBuildings);
      for (let i = 0; i < fullCap; i++) {
        const winner = fullCandidates[i]!;
        if ((!wantedSet || wantedSet.has(winner)) && winner.budgetLod !== 0) {
          this.residencyDirty = true;
          break;
        }
      }
    }
    for (const e of this.entries) {
      const wanted = e.lod < 2 && e.visible && (!wantedSet || wantedSet.has(e));
      // Coarse-only visibility changes need no residency sort, transition update
      // or metrics rebuild. Final per-renderer culling remains engine-owned.
      if (!e.fine) {
        const useFarProxy = e.visible && (e.lod === 2 || !wanted);
        if (e.coarseVisible !== e.visible) {
          e.view.setFarProxyActive?.(useFarProxy);
          e.view.setVisualVisible(e.visible);
          e.coarseVisible = e.visible;
        } else if (e.visible) {
          e.view.setFarProxyActive?.(useFarProxy);
        }
      }
      if (wanted !== this.desired.has(e)) {
        demandChanged = true;
        if (wanted) this.desired.add(e);
        else this.desired.delete(e);
      }
    }
    if (demandChanged) {
      this.metrics.requested = this.desired.size;
      this.residencyDirty = true;
      this.onDemandChanged();
    }
  }
  private detailRankScore(e: E): number {
    // Mild hysteresis keeps stationary / rotating views stable while letting closer buildings win on walk-up.
    const bonus =
      e.presentationVisible && e.budgetLod === 0
        ? 1.15
        : (e.presentationVisible && e.budgetLod === 1) || this.desired.has(e)
          ? 1.1
          : 1;
    return e.priority * bonus;
  }
  refreshPriorities() {
    for (const e of this.entries) e.priority = e.probe.priority();
  }
  /** One ordering for both load admission and cache replacement. Positive means a wins. */
  compareResidency(a: E, b: E): number {
    const tier = (e: E) => (e.visible ? 2 : this.desired.has(e) ? 1 : 0);
    return (
      tier(a) - tier(b) || a.priority - b.priority || Number(a.view.recentlyRendered) - Number(b.view.recentlyRendered)
    );
  }
  refreshMetrics() {
    let ready = 0,
      near = 0,
      medium = 0,
      cached = 0,
      residentBytes = 0,
      cachedBytes = 0,
      triangles = 0,
      fullTriangles = 0,
      residentLodUploadBytes = 0,
      unitLodSelectionMs = 0;
    for (const e of this.entries)
      if (e.fine) {
        const m = e.fine.runtime.metrics;
        residentBytes += m.residentBytes;
        residentLodUploadBytes += m.lodUploadBytes;
        if (e.fine.runtime.root.isActive) unitLodSelectionMs += m.lodSelectionMs;
        if (e.fine.runtime.root.isActive) {
          ready++;
          if (m.lod === 0) near++;
          else medium++;
          if (e.visible) {
            triangles += m.triangles;
            fullTriangles += m.fullTriangles;
          }
        } else {
          cached++;
          cachedBytes += m.residentBytes;
        }
      }
    Object.assign(this.metrics, {
      residentLodUploadBytes,
      unitLodSelectionMs,
      detailReady: ready,
      nearReady: near,
      mediumReady: medium,
      cached,
      residentBytes,
      cachedBytes,
      triangles,
      fullTriangles
    });
  }
  evict(e: E) {
    this.invalidate();
    this.onResourcesChanged(e);
    e.presentation = undefined;
    e.presentationVisible = false;
    e.coarseVisible = undefined;
    e.coarseFade = undefined;
    e.retained = false;
    e.fine?.destroy();
    e.fine = undefined;
    e.transition.reset(this.elapsed);
    e.view.root.isActive = true;
    if (e.lod === 2) {
      e.view.releaseDetailedVisual?.();
    }
    e.view.setFarProxyActive?.(e.visible && (e.lod === 2 || !this.desired.has(e)));
    e.view.setVisualVisible(e.visible);
    e.view.setFade(1);
    this.metrics.evictions++;
  }
  /** Admit one asynchronous detail request using the same ranking as display.
   * One load may exceed the cap; a later request must reclaim inactive cold or
   * lower-priority cached residents before allocating again. Never evict an active resident. */
  admit(request: E): boolean {
    const budget = getMasonryResidencyBudget();
    this.refreshMetrics();
    if (this.metrics.residentBytes <= budget.detailBytes) return true;
    for (const cold of this.entries.filter(
      (entry) => entry.fine && !this.desired.has(entry) && !entry.fine.runtime.root.isActive
    ))
      this.evict(cold);
    this.refreshMetrics();
    for (const lower of this.entries
      .filter((entry) => entry.fine && !entry.fine.runtime.root.isActive && this.compareResidency(entry, request) < 0)
      .sort((a, b) => this.compareResidency(a, b))) {
      if (this.metrics.residentBytes <= budget.detailBytes) break;
      this.evict(lower);
      this.refreshMetrics();
    }
    return this.metrics.residentBytes <= budget.detailBytes;
  }
  publishResidency(now = performance.now()) {
    // Budget release and asynchronous readiness are also ranking events. Use the
    // latest cached distances even if movement stayed within one LOD band.
    this.refreshPriorities();
    this.residencyDirty = false;
    this.residencyWake = this.transitionWake = Infinity;
    // Rank visible fine residents with mild hysteresis (detailRankScore) so stationary /
    // rotating views stay stable while closer buildings can claim the LOD0 / detail slots on walk-up.
    // LOD1-budgeted buildings clamp unit-level LOD to 1 (via EngineResidentScene.setLodStates).
    const active = this.entries.filter((e) => e.fine && e.visible);
    // Reserve outgoing full meshes until their fade ends; do not spend that budget twice.
    let residentExtra = active.reduce(
      (sum, e) =>
        sum +
        (e.presentationVisible && e.fine!.runtime.metrics.fullCoverage
          ? e.fine!.runtime.metrics.fullTriangles - e.fine!.runtime.metrics.mediumTriangles
          : 0),
      0
    );
    let selectedExtra = 0;
    let fullCount = 0;
    let detailCount = 0;
    active.sort((a, b) => this.detailRankScore(b) - this.detailRankScore(a));
    const budget = getMasonryResidencyBudget();
    for (const e of active) {
      if (e.lod === 2 || detailCount >= budget.maxDetailBuildings) {
        e.budgetLod = 2;
        continue;
      }
      detailCount++;
      const runtime = e.fine!.runtime;
      const extra = runtime.metrics.fullTriangles - runtime.metrics.mediumTriangles;
      const selected =
        e.lod === 0 && fullCount < budget.maxFullBuildings && selectedExtra + extra <= budget.fullTriangleBudget;
      if (selected) selectedExtra += extra;
      const reserved = e.presentationVisible && runtime.metrics.fullCoverage;
      if (selected && (reserved || residentExtra + extra <= budget.fullTriangleBudget)) {
        e.budgetLod = 0;
        fullCount++;
        if (!reserved) residentExtra += extra;
      } else e.budgetLod = 1;
    }
    for (const e of this.entries) {
      if (e.fine && !e.visible) {
        // Residency prepares resources, not a full-quality display allocation.
        e.budgetLod = this.desired.has(e) ? 1 : 2;
      }
    }
    this.metrics.transitioning = 0;
    this.metrics.pendingDetails = [...this.desired].filter((e) => !e.fine && !e.error).length;
    for (const e of this.entries) {
      const runtime = e.fine?.runtime;
      const requested = runtime ? e.budgetLod : 2;
      // Hidden resources stay ready at medium quality. Re-entry uses the newly
      // allocated representation immediately; an offscreen full fade cannot leak
      // into the visible budget. Already visible transitions retain their fade.
      const states =
        runtime && (!e.visible || e.presentationVisible === false)
          ? e.transition.snap(this.elapsed, requested)
          : e.transition.update(this.elapsed, requested, !!runtime, e.prefetch || e.visible);
      e.presentationVisible = e.visible;
      this.transitionWake = Math.min(this.transitionWake, e.transition.nextUpdateTime);
      if (states.length > 1) this.metrics.transitioning++;
      const fineVisible = states.some((s) => s.lodIndex < 2);
      const coarse = states.find((s) => s.lodIndex === 2);
      const coarseVisible = !!coarse && e.visible;
      if (runtime) {
        if (fineVisible && e.visible && !runtime.root.isActive) this.metrics.cacheHits++;
        const previous = e.presentation;
        if (
          !previous ||
          previous.length !== states.length * 2 ||
          states.some((s, i) => previous[i * 2] !== s.lodIndex || previous[i * 2 + 1] !== s.signedFade)
        ) {
          const fullCoverage = runtime.metrics.fullCoverage;
          runtime.setLodStates(states);
          // Reconsider allocations after the final outgoing full mesh releases
          // its reservation, even when neither camera nor desired LOD changes.
          if (e.visible && fullCoverage && !runtime.metrics.fullCoverage) this.residencyDirty = true;
          e.presentation = states.flatMap((s) => [s.lodIndex, s.signedFade]);
        }
        runtime.root.isActive = fineVisible && e.visible;
        if (getMasonryLodTuning().colorizeLod) runtime.setLodDebugTint(true);
        // Prefetch retains nearby resources in every direction, independent of rendering.
        const retained = this.desired.has(e) || fineVisible;
        // Start retention on departure, even after hours with a stationary camera.
        if (retained || e.retained) e.lastUsed = now;
        e.retained = retained;
      }
      e.view.root.isActive = true;
      e.view.setFarProxyActive?.(
        coarseVisible && (e.lod === 2 || !this.desired.has(e) || (!!runtime && e.budgetLod === 2)) && !fineVisible
      );
      if (runtime && fineVisible && !coarseVisible && states.length === 1) {
        e.view.releaseDetailedVisual?.();
      }
      if (e.coarseVisible !== coarseVisible) {
        e.view.setVisualVisible(coarseVisible);
        e.coarseVisible = coarseVisible;
      }
      const coarseFade = coarse?.signedFade ?? 1;
      if (coarseVisible && e.coarseFade !== coarseFade) {
        e.view.setFade(coarseFade);
        e.coarseFade = coarseFade;
      }
    }
    this.refreshMetrics();
    const unused = this.entries
      .filter((e) => e.fine && !this.desired.has(e) && !e.fine.runtime.root.isActive)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let cached = this.metrics.cachedBytes,
      total = this.metrics.residentBytes;
    let evicted = false;
    for (const e of unused) {
      if (now - e.lastUsed >= budget.retainMs || cached > budget.cacheBytes || total > budget.detailBytes) {
        const bytes = e.fine!.runtime.metrics.residentBytes;
        this.evict(e);
        cached -= bytes;
        total -= bytes;
        evicted = true;
      } else this.residencyWake = Math.min(this.residencyWake, e.lastUsed + budget.retainMs);
    }
    if (evicted) this.refreshMetrics();
  }
}

function capture(snapshot: Float64Array, index: number, value: number, flag: number): number {
  if (snapshot[index] === value) return 0;
  snapshot[index] = value;
  return flag;
}
