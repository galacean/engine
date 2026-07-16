import { LayerKind, LayerSpec } from "../loader/ManifestLoader";
import {
  ConsumerInterest,
  RegionRef,
  TerrainChangeEvent,
  TerrainConsumer,
  TerrainContext,
  TerrainRegionCoverage
} from "./TerrainConsumer";

interface RegionRuntime {
  ref: RegionRef;
  /**
   * Elevation stored as unorm [0, 1] (matching the R16F texture upload). Kept in this form so
   * changing minMetres/maxMetres at runtime rescales the world without touching the array — the
   * water Consumer's waterline query recomputes lazily via getHeightMetres().
   */
  heightsNorm: Float32Array;
  /** Live world-elevation range. Mutable via setHeightRange so slider updates take effect. */
  minMetres: number;
  maxMetres: number;
  /** ControlMap bitfields, row-major, N×N. */
  control: Uint32Array;
  /** Heightmap side length in texels. */
  resolution: number;
}


/**
 * Central registry + broadcaster. TerrainSystem owns nothing about rendering — it is only a data hub.
 * The renderer publishes region data via `addRegion` after loading, and downstream systems register
 * consumers to react. Any component (S2's real WaterConsumer, S3's brush undo tracker, S4's cliff
 * scatterer) reuses the same protocol.
 */
export class TerrainSystem {
  private _consumers = new Map<string, TerrainConsumer>();
  private _regions = new Map<string, RegionRuntime>();
  private _layers: LayerSpec[] = [];
  private _context: TerrainContext;

  constructor() {
    this._context = this._buildContext();
  }

  addRegion(runtime: RegionRuntime): void {
    this._regions.set(runtime.ref.id, runtime);
    // Emit initial snapshot events (see below).
    // Notify consumers that a region appeared. Future brush edits also flow through this same path.
    this._broadcast({
      type: ConsumerInterest.RegionChange,
      dirtyRegions: [runtime.ref]
    });
    this._broadcast({
      type: ConsumerInterest.HeightMap,
      dirtyRegions: [runtime.ref]
    });
    this._broadcast({
      type: ConsumerInterest.ControlMap,
      dirtyRegions: [runtime.ref]
    });
  }

  setLayers(layers: LayerSpec[]): void {
    this._layers = layers;
    this._broadcast({
      type: ConsumerInterest.LayerConfig,
      dirtyRegions: Array.from(this._regions.values()).map((r) => r.ref)
    });
  }

  registerConsumer(consumer: TerrainConsumer): void {
    if (this._consumers.has(consumer.id)) {
      console.warn(`[TerrainSystem] consumer id "${consumer.id}" already registered, replacing`);
      this._consumers.get(consumer.id)!.onUnregister();
    }
    this._consumers.set(consumer.id, consumer);
    consumer.onRegister(this._context);
    // Deliver an initial snapshot so consumers that register after data load still see the world.
    if (this._regions.size > 0) {
      const regions = Array.from(this._regions.values()).map((r) => r.ref);
      consumer.onDataChanged({ type: ConsumerInterest.All, dirtyRegions: regions });
    }
  }

  unregisterConsumer(id: string): void {
    const c = this._consumers.get(id);
    if (!c) return;
    c.onUnregister();
    this._consumers.delete(id);
  }

  /** External override — S3 brush code will call this after writing new bitfields. */
  notifyChange(evt: TerrainChangeEvent): void {
    this._broadcast(evt);
  }

  /**
   * Live-update the world elevation range for a region. TerrainRenderer.setHeightRange handles the
   * shader uniform; this call keeps TerrainSystem in sync so `sampleHeight` / findRegionsByLayerKind
   * return metres in the new range too. Broadcasts a HeightMap change so downstream Consumers
   * (WaterPcgConsumer) recompute their waterline.
   */
  setRegionHeightRange(regionId: string, minMetres: number, maxMetres: number): void {
    const r = this._regions.get(regionId);
    if (!r) return;
    r.minMetres = minMetres;
    r.maxMetres = maxMetres;
    this._broadcast({ type: ConsumerInterest.HeightMap, dirtyRegions: [r.ref] });
  }

  private _broadcast(evt: TerrainChangeEvent): void {
    for (const c of this._consumers.values()) {
      // `evt.type === All` = "initial-snapshot / everyone should react" — the broadcaster's decision,
      // not something a consumer can opt out of via interests. The two interest checks cover the
      // opposite direction (consumer subscribes to All, or to this specific type).
      if (
        evt.type === ConsumerInterest.All ||
        c.interests.includes(ConsumerInterest.All) ||
        c.interests.includes(evt.type)
      ) {
        try {
          c.onDataChanged(evt);
        } catch (err) {
          console.error(`[TerrainSystem] consumer "${c.id}" threw during onDataChanged`, err);
        }
      }
    }
  }

  private _buildContext(): TerrainContext {
    const self = this;
    return {
      sampleHeight(x, z) {
        const { region, u, v } = self._locate(x, z);
        if (!region) return 0;
        return self._sampleMetres(region, u, v);
      },
      sampleSlope(x, z) {
        const { region, u, v } = self._locate(x, z);
        if (!region) return 0;
        const N = region.resolution;
        const ts = 1 / N;
        const h = (uu: number, vv: number) => self._sampleMetres(region, uu, vv);
        const dh = h(u + ts, v) - h(u - ts, v);
        const dv = h(u, v + ts) - h(u, v - ts);
        const texelWorld = region.ref.sizeMeter / (N - 1);
        return Math.min(1, Math.sqrt(dh * dh + dv * dv) / (2 * texelWorld));
      },
      sampleControl(x, z) {
        const { region, u, v } = self._locate(x, z);
        if (!region) return 0;
        const N = region.resolution;
        const px = Math.min(Math.max(Math.round(u * (N - 1)), 0), N - 1);
        const py = Math.min(Math.max(Math.round(v * (N - 1)), 0), N - 1);
        return region.control[py * N + px];
      },
      findTexelsByLayer(regionId, layerId) {
        const region = self._regions.get(regionId);
        if (!region) return new Uint32Array();
        const out: number[] = [];
        for (let i = 0; i < region.control.length; i++) {
          const baseId = (region.control[i] >>> 27) & 0x1f;
          if (baseId === layerId) out.push(i);
        }
        return new Uint32Array(out);
      },
      findRegionsByLayerKind(kind): TerrainRegionCoverage[] {
        // Kind → layer ids: a Consumer says "give me all water" and we look up which layer(s) the
        // manifest declared as `kind === Water`, then scan the controlmap's base_id / overlay_id
        // (bits 31-27 / 26-22) for any texel using that id. No bit stealing from controlmap.
        const matchIds = new Set(
          self._layers.filter((l) => l.kind === kind).map((l) => l.id)
        );
        if (matchIds.size === 0) return [];
        const out: TerrainRegionCoverage[] = [];
        for (const region of self._regions.values()) {
          const N = region.resolution;
          const range = region.maxMetres - region.minMetres;
          const texels: number[] = [];
          let minPx = N, minPy = N, maxPx = -1, maxPy = -1;
          let minH = Infinity, maxH = -Infinity;
          for (let i = 0; i < region.control.length; i++) {
            const c = region.control[i] >>> 0;
            const baseId = (c >>> 27) & 0x1f;
            const overId = (c >>> 22) & 0x1f;
            if (!matchIds.has(baseId) && !matchIds.has(overId)) continue;
            texels.push(i);
            const px = i % N;
            const py = (i / N) | 0;
            if (px < minPx) minPx = px;
            if (py < minPy) minPy = py;
            if (px > maxPx) maxPx = px;
            if (py > maxPy) maxPy = py;
            const h = region.minMetres + region.heightsNorm[i] * range;
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
          }
          if (texels.length === 0) continue;
          const [rx, rz] = region.ref.positionXZ;
          const half = region.ref.sizeMeter / 2;
          const texelWorld = region.ref.sizeMeter / (N - 1);
          const worldMinX = rx - half + minPx * texelWorld;
          const worldMinZ = rz - half + minPy * texelWorld;
          const worldMaxX = rx - half + maxPx * texelWorld;
          const worldMaxZ = rz - half + maxPy * texelWorld;
          // User request — surface plane at the coverage's LOWEST pixel elevation (min y).
          // Waterline / coastline / mean sea level are all defensible choices; user picked min.
          out.push({
            regionId: region.ref.id,
            texels: new Uint32Array(texels),
            min: [worldMinX, minH, worldMinZ],
            max: [worldMaxX, maxH, worldMaxZ],
            size: [worldMaxX - worldMinX, worldMaxZ - worldMinZ],
            surfaceY: minH
          });
        }
        return out;
      },
      getLayers() {
        return self._layers;
      },
      getRegions() {
        return Array.from(self._regions.values()).map((r) => r.ref);
      }
    };
  }

  private _locate(worldX: number, worldZ: number): { region?: RegionRuntime; u: number; v: number } {
    // S1 hosts a single region; iterate anyway so multi-region S2 does not need to touch this method.
    for (const r of this._regions.values()) {
      const [rx, rz] = r.ref.positionXZ;
      const half = r.ref.sizeMeter / 2;
      if (worldX >= rx - half && worldX <= rx + half && worldZ >= rz - half && worldZ <= rz + half) {
        return { region: r, u: (worldX - (rx - half)) / r.ref.sizeMeter, v: (worldZ - (rz - half)) / r.ref.sizeMeter };
      }
    }
    return { u: 0, v: 0 };
  }

  private _sampleMetres(region: RegionRuntime, u: number, v: number): number {
    const N = region.resolution;
    const clampU = Math.min(Math.max(u, 0), 1);
    const clampV = Math.min(Math.max(v, 0), 1);
    const fx = clampU * (N - 1);
    const fy = clampV * (N - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, N - 1);
    const y1 = Math.min(y0 + 1, N - 1);
    const dx = fx - x0;
    const dy = fy - y0;
    const h00 = region.heightsNorm[y0 * N + x0];
    const h10 = region.heightsNorm[y0 * N + x1];
    const h01 = region.heightsNorm[y1 * N + x0];
    const h11 = region.heightsNorm[y1 * N + x1];
    const norm = h00 * (1 - dx) * (1 - dy) + h10 * dx * (1 - dy) + h01 * (1 - dx) * dy + h11 * dx * dy;
    return region.minMetres + norm * (region.maxMetres - region.minMetres);
  }
}
