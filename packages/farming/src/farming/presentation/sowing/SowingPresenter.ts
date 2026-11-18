import type { Entity } from "@galacean/engine";
import type { FarmingService } from "../../application/FarmingService";
import type { FarmSnapshot } from "../../domain/FarmState";
import type { FarmChange } from "../../domain/FarmCommands";
import { SOWING_MOTION, sampleSowingMotion } from "./SowingMotion";
import { SowingSeedLibrary } from "./SowingSeedLibrary";

export interface SowingSurface {
  readonly center: readonly [number, number];
  /** World-space height of the rendered soil, sampled for every individual landing point. */
  heightAt(x: number, z: number): number | null;
}
export interface SowingPresentationSnapshot {
  readonly active: boolean;
  readonly jobs: readonly {
    cropInstanceId: string;
    plotId: string;
    elapsed: number;
    phase: string;
    visibleSeeds: number;
    positions: readonly (readonly [number, number, number])[];
  }[];
}
interface SowingJob {
  root: Entity;
  cropInstanceId: string;
  plotId: string;
  elapsed: number;
  seeds: { entity: Entity; x: number; z: number }[];
}

/** Confirmed planting events own transient seed effects; persisted crops remain the sole gameplay state. */
export class SowingPresenter {
  readonly root: Entity;
  private readonly library: SowingSeedLibrary;
  private readonly jobs = new Map<string, SowingJob>();
  private readonly unsubscribe: () => void;
  private active = true;
  private disposed = false;
  constructor(
    parent: Entity,
    service: FarmingService,
    public surface: (plotId: string) => SowingSurface | null
  ) {
    // Published plot coordinates are world coordinates, independent of an area's transform.
    this.root = parent.scene!.createRootEntity(`Farming sowing / ${service.getSnapshot().farmId}`);
    this.library = new SowingSeedLibrary(this.root);
    this.unsubscribe = service.subscribe(({ snapshot, changes, source }) => {
      this.sync(snapshot, source === "local" ? changes : []);
    });
  }
  private sync(snapshot: FarmSnapshot, changes: readonly FarmChange[]): void {
    if (this.disposed) return;
    for (const [id, job] of this.jobs) {
      const plot = snapshot.plots.find((p) => p.plotId === job.plotId);
      if (!snapshot.crops[id] || plot?.ground.availability !== "available") this.remove(id);
    }
    if (!this.active) return;
    for (const change of changes) {
      if (change.kind !== "crop-planted" || this.jobs.has(change.cropInstanceId)) continue;
      if (!this.surface(change.plotId)) continue;
      const root = this.root.createChild(`sowing-${change.cropInstanceId}`);
      const surface = this.surface(change.plotId)!;
      const seeds = this.library.parts(change.cropId).map((part, index) => ({
        entity: this.library.create(root, change.cropId, index),
        x: surface.center[0] + part.center[0],
        z: surface.center[1] + part.center[2]
      }));
      this.jobs.set(change.cropInstanceId, {
        root,
        plotId: change.plotId,
        cropInstanceId: change.cropInstanceId,
        elapsed: 0,
        seeds
      });
    }
    this.update(0);
  }
  update(dt: number): void {
    if (this.disposed || !this.active || !Number.isFinite(dt) || dt < 0) return;
    for (const [id, job] of this.jobs) {
      job.elapsed += dt;
      const surface = this.surface(job.plotId);
      if (!surface || job.elapsed >= SOWING_MOTION.duration + (job.seeds.length - 1) * SOWING_MOTION.seedDelay) {
        this.remove(id);
        continue;
      }
      job.seeds.forEach((seed, index) => {
        const pose = sampleSowingMotion(job.elapsed, index),
          y = surface.heightAt(seed.x, seed.z);
        seed.entity.isActive = pose.visible && y !== null;
        if (y === null) return;
        seed.entity.transform.setWorldPosition(
          seed.x + pose.position[0],
          y + pose.position[1],
          seed.z + pose.position[2]
        );
        seed.entity.transform.setScale(pose.scale, pose.scale, pose.scale);
      });
    }
  }
  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    this.root.isActive = active;
    if (!active) for (const id of this.jobs.keys()) this.remove(id);
  }
  snapshot(): SowingPresentationSnapshot {
    return {
      active: this.active && !this.disposed,
      jobs: [...this.jobs.values()].map((job) => ({
        cropInstanceId: job.cropInstanceId,
        plotId: job.plotId,
        elapsed: job.elapsed,
        phase: sampleSowingMotion(job.elapsed).phase,
        visibleSeeds: job.seeds.filter((seed) => seed.entity.isActive).length,
        positions: job.seeds
          .filter((seed) => seed.entity.isActive)
          .map((seed) => {
            const p = seed.entity.transform.worldPosition;
            return [p.x, p.y, p.z] as const;
          })
      }))
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const id of this.jobs.keys()) this.remove(id);
    this.root.destroy();
    this.library.dispose();
  }
  private remove(id: string): void {
    this.jobs.get(id)?.root.destroy();
    this.jobs.delete(id);
  }
}
