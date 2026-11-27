import { HORSE_PROFILE } from "@galacean/engine-animals/gameplay/horse/HorseProfile";
import { AudioFootstepCadence } from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioMath";
import type { EnvironmentAudioRuntime } from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioRuntime";
import type { EnvironmentAudioClip } from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioAssets";
import type { Camera, Entity } from "@galacean/engine";
import { HorseModule } from "@galacean/engine-animals/gameplay/horse/HorseModule";
import type {
  SeedWorldMountCommandInput,
  SeedWorldMountCommandResult
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { SeedWorldMountHost, type SeedWorldMountHostOptions } from "./SeedWorldMountHost.ts";

// Seed's current 4 m walking camera uses a larger presentation scale than the 1.8 m authoring reference.
const MOUNT_SCALE = 2.2;

/** Scene-owned mount lifecycle shared by dat.gui and Agent commands. */
export class SeedWorldMountSystem {
  private readonly _owner: Entity;
  private readonly _host: SeedWorldMountHost;
  private _horse?: HorseModule;
  private _loading?: Promise<HorseModule>;
  private _disposed = false;
  private _sequence = 0;
  private readonly _hoofCadence = new AudioFootstepCadence();

  /**
   * Binds the mount to the existing scene and navigation input without loading its model.
   * @param root Scene root owning this gameplay lifetime.
   * @param options Live navigation and authoritative terrain readers.
   * @param audio Shared scene soundscape owning playback and resources.
   */
  constructor(root: Entity, options: SeedWorldMountHostOptions, private readonly audio?: EnvironmentAudioRuntime,
    private readonly camera?: Camera, private readonly precompileShaders = true) {
    this._owner = root.createChild("Seed mount system");
    this._host = this._owner.addComponent(SeedWorldMountHost);
    this._host.initialize({ ...options, mountScale: MOUNT_SCALE });
  }

  /** Whether navigation is delegated to the mount. */
  get mounted(): boolean { return this._horse?.mounted ?? false; }

  /** Actual native clip currently playing, or an empty readout when absent. */
  get currentAnimation(): string {
    return this._horse?.currentAnimation ?? "—";
  }

  /**
   * Accepts a semantic intent; absent mounts and repeated commands are resolved internally.
   * @param input One of the three gameplay intents.
   * @param signal Cancellation before dispatch.
   * @returns A receipt for the accepted command, not its eventual animation completion.
   */
  async command(
    input: Readonly<SeedWorldMountCommandInput>,
    signal: AbortSignal
  ): Promise<SeedWorldMountCommandResult> {
    signal.throwIfAborted();
    if (this._disposed) throw new Error("Mount system is disposed");
    const commandId = `mount-${++this._sequence}`;
    // A down/remove command during loading queues behind that same instance instead of spawning another.
    const horse =
      this._horse ?? (this._loading ? await this._loading : input.intent === "appear" ? await this._load() : undefined);
    signal.throwIfAborted();
    if (this._disposed) throw new Error("Mount system is disposed");
    if (horse) horse.execute({ requestId: commandId, action: input.intent === "appear" ? "come" : input.intent });
    return { status: "accepted", intent: input.intent, commandId };
  }

  /** Releases the horse, rider ownership and input delegation with the scene. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._horse?.dispose();
    this._owner.destroy();
  }

  private _load(): Promise<HorseModule> {
    const loading = HorseModule.create(this._owner, this._host, undefined, MOUNT_SCALE)
      .then(async (horse) => {
        try {
          if (this.camera && this.precompileShaders && !this._disposed) {
            // Keep mount lifecycle/imports renderer-independent until compilation is actually requested.
            const { warmupSeedWorldRendererVariants } = await import("@galacean/engine-world-planning/world/SeedWorldShaderWarmup");
            if (!this._disposed) {
              await warmupSeedWorldRendererVariants(this._owner.engine, this.camera.entity.scene!,
                this.camera, [this._owner], { includeGpuInstancing: false, strict: true, frameBudgetMilliseconds: 4 });
            }
          }
        } catch (error) { horse.dispose(); throw error; }
        if (this._disposed) {
          horse.dispose();
          throw new Error("Mount system is disposed");
        }
        this._host.setSaddleAnchor(horse.saddle);
        this._horse = horse;
        horse.groundedTravel.on((distance) => {
          if (!this.audio?.playbackActive) { this._hoofCadence.reset(); return; }
          const walkingSpeed = horse.mounted ? this._host.walkingSpeed : HORSE_PROFILE.walkSpeed * MOUNT_SCALE;
          if (this._hoofCadence.travel(distance, walkingSpeed, horse.engine.time.elapsedTime)) {
            this.audio.playOneShot("horse-hoof", horse.entity.transform.worldPosition, 0.9, 35);
          }
        });
        horse.events.on((event) => {
          if (event.type === "spawned" || event.type === "dismissed") this._hoofCadence.reset();
          const clip: EnvironmentAudioClip | undefined =
            event.type === "mounted" ? "horse-mount" :
            event.type === "dismounted" ? "horse-dismount" :
            event.type === "spawned" ||
            (event.type === "accepted" && event.detail === "come" && horse.inspect().present) ||
            (event.type === "state" && event.detail === "idleB") ? "horse-neigh" : undefined;
          if (clip) this.audio?.playOneShot(clip, horse.entity.transform.worldPosition,
            0.7, clip === "horse-neigh" ? 90 : 35);
        });
        return horse;
      })
      .finally(() => {
        if (this._loading === loading) this._loading = undefined;
      });
    return (this._loading = loading);
  }
}
