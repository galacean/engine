import { AssetType, AudioClip, AudioManager, AudioSource, Script, type Entity } from "@galacean/engine";
import {
  ENVIRONMENT_AUDIO_ASSETS,
  ENVIRONMENT_AUDIO_MIX_TRIM_DB,
  type EnvironmentAudioClip
} from "./EnvironmentAudioAssets";
import {
  audioDistance,
  AudioPropagation,
  audioPropagation,
  clamp01,
  thunderDelaySeconds,
  thunderPropagation,
  waterPropagation,
  AudioPoint
} from "./EnvironmentAudioMath";

export interface EnvironmentAudioEmitter {
  id: string;
  eventId?: number;
  cellX?: number;
  cellZ?: number;
  clip: EnvironmentAudioClip;
  position?: AudioPoint;
  gain: number;
  reach: number;
  occlusion?: number;
}
/** Allocate at setup; every bed, representative and voice uses the same field layout. */
export function createEnvironmentAudioEmitter(
  clip: EnvironmentAudioClip,
  id = "",
  spatial = false
): EnvironmentAudioEmitter {
  return {
    id,
    eventId: undefined,
    cellX: undefined,
    cellZ: undefined,
    clip,
    position: spatial ? new AudioPoint() : undefined,
    gain: 0,
    reach: 1,
    occlusion: 0
  };
}

export interface EnvironmentAudioListener {
  readonly position: AudioPoint;
}
export interface EnvironmentThunderStrike {
  readonly id: number;
  readonly position: AudioPoint;
  readonly strength: number;
}
interface Voice {
  readonly source: AudioSource;
  readonly emitter: EnvironmentAudioEmitter;
  readonly position: AudioPoint;
  active: boolean;
  seen: boolean;
  retiring: boolean;
  retireAt: number;
  occlusionDue: number;
}

const STEP_CLIPS: Record<"grass" | "dirt" | "water" | "snow", readonly EnvironmentAudioClip[]> = {
  grass: ["step-grass-1", "step-grass-2", "step-grass-3", "step-grass-4"],
  dirt: ["step-dirt-1", "step-dirt-2", "step-dirt-3", "step-dirt-4"],
  water: ["step-water-1", "step-water-2", "step-water-3", "step-water-4"],
  snow: ["step-snow-1", "step-snow-2", "step-snow-3", "step-snow-4"]
};

// Immutable asset calibration is computed once, independently of voice starts and per-frame attenuation.
const ASSET_GAIN_DB = new Map<EnvironmentAudioClip, number>(
  (Object.keys(ENVIRONMENT_AUDIO_ASSETS) as EnvironmentAudioClip[]).map((clip) => [
    clip,
    20 * Math.log10(ENVIRONMENT_AUDIO_ASSETS[clip].gain) + (ENVIRONMENT_AUDIO_MIX_TRIM_DB[clip] ?? 0)
  ])
);

/** World sound selection and mix policy. Resources and playback belong to the engine. */
export class EnvironmentAudioRuntime extends Script {
  private readonly clips = new Map<EnvironmentAudioClip, AudioClip>();
  private readonly voices: Voice[] = [];
  private readonly propagation = new AudioPropagation();
  private readonly mix = { volume: 0, lowPassFrequency: 22050, volumeTimeConstant: 0, filterTimeConstant: 0 };
  private readonly eventEmitter = createEnvironmentAudioEmitter("wind");
  private readonly errors = new Map<string, string>();
  private readonly pendingThunder = Array.from({ length: 8 }, () => ({
    id: 0,
    serial: 0,
    position: new AudioPoint(),
    strength: 0,
    due: 0
  }));
  private pendingCount = 0;
  private readonly recentStrikes = new Float64Array(64);
  private recentCount = 0;
  private recentCursor = 0;
  private listener?: EnvironmentAudioListener;
  private frameTime = 0;
  private unlocked = false;
  private loading = false;
  private muted = false;
  private volume = 0.65;
  private active = false;
  private ducked = false;
  private stepSerial = 0;
  private oneShotSerial = 0;
  private strikeSerial = 0;
  private thunderPlayed = 0;
  private occlusion?: (a: AudioPoint, b: AudioPoint) => number;

  constructor(entity: Entity) {
    super(entity);
    try {
      const saved = JSON.parse(localStorage.getItem("seed-world:nature-audio:v1") ?? "null");
      if (typeof saved?.muted === "boolean") this.muted = saved.muted;
      if (typeof saved?.volume === "number" && Number.isFinite(saved.volume)) this.volume = clamp01(saved.volume);
    } catch {
      /* Storage is optional in private browsing and embedded hosts. */
    }
    for (let i = 0; i < 24; i++) {
      const source = entity.createChild(`Nature audio voice ${i}`).addComponent(AudioSource);
      source.playOnEnabled = false;
      source.distanceRolloff = 0;
      source.spatialSmoothing = 0.12;
      this.voices.push({
        source,
        emitter: createEnvironmentAudioEmitter("wind"),
        position: new AudioPoint(),
        active: false,
        seen: false,
        retiring: false,
        retireAt: Infinity,
        occlusionDue: Infinity
      });
    }
    for (const name of ["pointerdown", "touchstart", "keydown"])
      document.addEventListener(name, this.onGesture, { capture: true, passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pageshow", this.onVisibility);
  }

  private readonly onGesture = (event: Event): void => {
    if (
      !event.isTrusted ||
      this.destroyed ||
      this.pendingDestroy ||
      document.hidden ||
      (this.unlocked && AudioManager.state === "running")
    )
      return;
    void this.unlock();
  };

  /** Request engine playback from the first trusted gesture; the engine owns context recovery. */
  async unlock(): Promise<void> {
    if (this.destroyed || this.pendingDestroy || (this.unlocked && AudioManager.state === "running")) return;
    try {
      const resumed = AudioManager.resume();
      if (!this.loading) void this.load();
      await resumed;
      if (this.destroyed || this.pendingDestroy) return;
      this.unlocked = AudioManager.state === "running";
      this.errors.delete("context");
    } catch (error) {
      if (!this.destroyed && !this.pendingDestroy) this.errors.set("context", String(error));
    }
  }

  private async load(): Promise<void> {
    this.loading = true;
    const entries = Object.entries(ENVIRONMENT_AUDIO_ASSETS) as [EnvironmentAudioClip, { url: string }][];
    let index = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (index < entries.length && !this.destroyed && !this.pendingDestroy) {
          const [id, asset] = entries[index++]!;
          try {
            const clip = await this.engine.resourceManager.load<AudioClip>({ url: asset.url, type: AssetType.Audio });
            // The ResourceManager owns shared requests. Do not cancel or destroy another consumer's clip.
            if (this.destroyed || this.pendingDestroy) return;
            this._addResourceReferCount(clip, 1);
            this.clips.set(id, clip);
            this.errors.delete(id);
          } catch (error) {
            if (!this.destroyed && !this.pendingDestroy) this.errors.set(id, String(error));
          }
        }
      })
    );
  }

  setOcclusionProvider(sample: (a: AudioPoint, b: AudioPoint) => number): void {
    this.occlusion = sample;
  }

  setVolume(value: number): void {
    this.volume = clamp01(Number.isFinite(value) ? value : 0);
    this.saveSettings();
  }
  setMuted(value: boolean): void {
    this.muted = value;
    this.saveSettings();
    this.pendingCount = 0;
    this.stopOneShots();
  }
  private saveSettings(): void {
    try {
      localStorage.setItem("seed-world:nature-audio:v1", JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      /* The in-memory setting still applies when storage is unavailable. */
    }
  }

  setActive(value: boolean): void {
    if (this.active === value) return;
    this.active = value;
    if (!value) {
      this.pendingCount = 0;
      this.stopOneShots();
    }
  }
  setDucked(value: boolean): void {
    this.ducked = value;
  }
  resetWorld(): void {
    this.pendingCount = 0;
    this.recentCount = this.recentCursor = 0;
    this.stopOneShots();
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i]!;
      if (voice.active && voice.source.loop) this.retire(voice);
    }
  }

  update(
    listener: EnvironmentAudioListener,
    emitters: readonly EnvironmentAudioEmitter[],
    emitterCount = emitters.length
  ): void {
    this.listener = listener;
    if (this.destroyed || this.pendingDestroy || document.hidden) return;
    const now = (this.frameTime = AudioManager.currentTime);
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i]!;
      voice.seen = false;
      if (
        voice.active &&
        ((voice.retiring && now >= voice.retireAt) || (!voice.source.isPlaying && !voice.source.isPendingPlay))
      )
        this.release(voice);
    }
    if (this.playbackActive) {
      for (let i = 0; i < Math.min(emitterCount, emitters.length, 16); i++) {
        const emitter = emitters[i]!;
        if (emitter.gain < 0.001) continue;
        let voice: Voice | undefined;
        for (let j = 0; j < this.voices.length; j++) {
          const candidate = this.voices[j]!;
          const previous = candidate.emitter;
          if (
            candidate.active &&
            !candidate.retiring &&
            candidate.source.loop &&
            previous.id === emitter.id &&
            previous.clip === emitter.clip &&
            previous.cellX === emitter.cellX &&
            previous.cellZ === emitter.cellZ
          ) {
            voice = candidate;
            break;
          }
        }
        if (!voice) voice = this.makeVoice(emitter, true);
        if (voice) {
          voice.seen = true;
          this.copyEmitter(voice, emitter);
          this.updateVoice(voice, listener.position);
        }
      }
      for (let i = this.pendingCount - 1; i >= 0; i--) {
        const pending = this.pendingThunder[i]!;
        if (pending.due > now) continue;
        const emitter = this.eventEmitter;
        emitter.id = "thunder";
        emitter.eventId = pending.id;
        emitter.cellX = undefined;
        emitter.cellZ = undefined;
        audioDistance(pending.position, listener.position, this.propagation);
        emitter.clip = this.propagation.distance < 800 ? "thunder-near" : "thunder-far";
        emitter.occlusion = this.occlusion?.(listener.position, pending.position) ?? 0;
        emitter.position = pending.position;
        emitter.gain = 0.9 * Math.min(1, pending.strength);
        emitter.reach = 14000;
        if (this.makeVoice(emitter, false)) this.thunderPlayed++;
        this.pendingThunder[i] = this.pendingThunder[--this.pendingCount]!;
        this.pendingThunder[this.pendingCount] = pending;
      }
    }
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i]!;
      if (voice.active && voice.source.loop && !voice.seen) this.retire(voice);
    }
    if (this.playbackActive) this.refreshThunderOcclusion(listener.position);
    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i]!;
      if (voice.active && !voice.source.loop && !voice.retiring) this.updateVoice(voice, listener.position);
    }
  }

  private refreshThunderOcclusion(listener: AudioPoint): void {
    if (!this.occlusion) return;
    const now = this.frameTime;
    // Oldest due first prevents starvation when several thunder tails begin together.
    for (let count = 0; count < 2; count++) {
      let next: Voice | undefined;
      for (let i = 0; i < this.voices.length; i++) {
        const voice = this.voices[i]!;
        if (!voice.active || voice.source.loop || voice.retiring || voice.occlusionDue > now || !voice.emitter.position)
          continue;
        if (voice.emitter.clip !== "thunder-near" && voice.emitter.clip !== "thunder-far") continue;
        if (!next || voice.occlusionDue < next.occlusionDue) next = voice;
      }
      if (!next) break;
      const emitter = next.emitter;
      const occlusion = this.occlusion(listener, emitter.position!);
      emitter.occlusion = occlusion;
      next.occlusionDue = now + 0.2;
    }
  }

  strike(strike: EnvironmentThunderStrike): void {
    if (!this.playbackActive || !this.listener) return;
    for (let i = 0; i < this.recentCount; i++) if (this.recentStrikes[i] === strike.id) return;
    this.recentStrikes[this.recentCursor] = strike.id;
    this.recentCursor = (this.recentCursor + 1) % this.recentStrikes.length;
    this.recentCount = Math.min(this.recentCount + 1, this.recentStrikes.length);
    if (this.pendingCount === this.pendingThunder.length) {
      // Preserve the newest eight flashes, without shifting into a newly allocated array.
      let oldest = 0;
      for (let i = 1; i < this.pendingCount; i++)
        if (this.pendingThunder[i]!.serial < this.pendingThunder[oldest]!.serial) oldest = i;
      const free = this.pendingThunder[oldest]!;
      this.pendingThunder[oldest] = this.pendingThunder[--this.pendingCount]!;
      this.pendingThunder[this.pendingCount] = free;
    }
    const pending = this.pendingThunder[this.pendingCount++]!;
    pending.id = strike.id;
    pending.serial = this.strikeSerial++;
    pending.strength = strike.strength;
    pending.position.x = strike.position.x;
    pending.position.y = strike.position.y;
    pending.position.z = strike.position.z;
    pending.due = AudioManager.currentTime + thunderDelaySeconds(pending.position, this.listener.position);
  }

  footstep(surface: "grass" | "dirt" | "water" | "snow", position: AudioPoint): void {
    if (!this.playbackActive || this.ducked) return;
    const emitter = this.eventEmitter;
    emitter.id = "step";
    emitter.clip = STEP_CLIPS[surface][this.stepSerial++ % 4]!;
    emitter.eventId = this.stepSerial;
    emitter.cellX = undefined;
    emitter.cellZ = undefined;
    emitter.position = position;
    emitter.occlusion = 0;
    emitter.gain = surface === "water" ? 0.6 : 0.48;
    emitter.reach = 15;
    this.makeVoice(emitter, false);
  }

  /**
   * Plays a spatial event through the shared engine voice pool and soundscape mix.
   * @param clip Registered non-looping audio asset.
   * @param position World-space event origin, copied into the acquired voice.
   * @param gain Event mix level before master volume.
   * @param reach Audible propagation range in world metres.
   */
  playOneShot(clip: EnvironmentAudioClip, position: AudioPoint, gain = 0.65, reach = 45): void {
    if (!this.playbackActive || !this.listener || this.ducked || ENVIRONMENT_AUDIO_ASSETS[clip].loop) return;
    const emitter = this.eventEmitter;
    emitter.id = clip;
    emitter.clip = clip;
    emitter.eventId = ++this.oneShotSerial;
    emitter.cellX = emitter.cellZ = undefined;
    emitter.position = position;
    emitter.occlusion = this.occlusion?.(this.listener.position, position) ?? 0;
    emitter.gain = gain;
    emitter.reach = reach;
    this.makeVoice(emitter, false);
  }

  /** World queries are useful only while this soundscape can produce output. */
  get playbackActive(): boolean {
    return (
      !this.destroyed &&
      !this.pendingDestroy &&
      this.enabled &&
      this.entity.isActiveInHierarchy &&
      this.active &&
      this.unlocked &&
      !this.muted &&
      !document.hidden &&
      AudioManager.state === "running"
    );
  }

  private makeVoice(emitter: EnvironmentAudioEmitter, loop: boolean): Voice | undefined {
    const clip = this.clips.get(emitter.clip);
    if (!clip || clip.destroyed || clip.pendingDestroy || !this.listener) return;
    let voice: Voice | undefined;
    let oneShots = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (!v.active && !voice) voice = v;
      if (v.active && !v.source.loop) oneShots++;
    }
    if (!voice || (!loop && oneShots >= 8)) return;
    const source = voice.source;
    source.clip = clip;
    source.loop = loop;
    source.spatial = !!emitter.position;
    source.gainDecibels = ASSET_GAIN_DB.get(emitter.clip)!;
    voice.active = true;
    voice.retiring = false;
    voice.retireAt = Infinity;
    voice.occlusionDue = AudioManager.currentTime + 0.2;
    this.copyEmitter(voice, emitter);
    this.updateVoice(voice, this.listener.position, true);
    // A loop may start in the middle of a waveform; fade it in to avoid an onset click.
    if (loop) source.volume = 0;
    let hash = 1;
    for (let i = 0; i < emitter.id.length; i++) hash = (Math.imul(hash, 31) + emitter.id.charCodeAt(i)) >>> 0;
    if (emitter.eventId !== undefined) hash = (Math.imul(hash, 31) + emitter.eventId) >>> 0;
    if (emitter.cellX !== undefined) hash = (Math.imul(hash, 31) + emitter.cellX) >>> 0;
    if (emitter.cellZ !== undefined) hash = (Math.imul(hash, 31) + emitter.cellZ) >>> 0;
    source.playbackRate = !loop && emitter.id === "step" ? 0.98 + (hash % 5) * 0.01 : 1;
    source.play(loop ? ((hash % 997) / 997) * clip.duration : 0);
    if (loop) this.updateVoice(voice, this.listener.position);
    return voice;
  }

  /** Voice ownership isolates retiring/one-shot positions from the next query's reused output. */
  private copyEmitter(voice: Voice, emitter: EnvironmentAudioEmitter): void {
    const target = voice.emitter;
    target.id = emitter.id;
    target.eventId = emitter.eventId;
    target.cellX = emitter.cellX;
    target.cellZ = emitter.cellZ;
    target.clip = emitter.clip;
    target.gain = emitter.gain;
    target.reach = emitter.reach;
    target.occlusion = emitter.occlusion;
    if (emitter.position) {
      voice.position.x = emitter.position.x;
      voice.position.y = emitter.position.y;
      voice.position.z = emitter.position.z;
      target.position = voice.position;
    } else target.position = undefined;
  }

  private updateVoice(voice: Voice, listener: AudioPoint, initial = false): void {
    const emitter = voice.emitter;
    const propagation = this.propagation;
    if (emitter.position) audioDistance(emitter.position, listener, propagation);
    else propagation.distance = 0;
    if (emitter.clip === "thunder-near" || emitter.clip === "thunder-far")
      thunderPropagation(emitter.reach, emitter.occlusion ?? 0, propagation);
    else if (emitter.clip === "stream" || emitter.clip === "lake" || emitter.clip === "ocean")
      waterPropagation(emitter.reach, emitter.occlusion ?? 0, propagation);
    else audioPropagation(emitter.reach, emitter.occlusion ?? 0, propagation);
    const mix = this.muted ? 0 : this.volume * (this.ducked ? 0.13 : 1);
    const parameters = this.mix;
    parameters.volume = emitter.gain * propagation.gain * mix;
    parameters.lowPassFrequency = propagation.cutoff;
    parameters.volumeTimeConstant = initial ? 0 : 0.08;
    parameters.filterTimeConstant = initial ? 0 : 0.18;
    voice.source.setMix(parameters);
    if (emitter.position) {
      const p = emitter.position;
      const transform = voice.source.entity.transform;
      const current = transform.worldPosition;
      if (current.x !== p.x || current.y !== p.y || current.z !== p.z) current.copyFrom(p);
    }
  }

  private retire(voice: Voice): void {
    if (voice.retiring) return;
    voice.retiring = true;
    voice.retireAt = AudioManager.currentTime + 0.6;
    voice.source.setVolume(0, 0.12);
  }
  private release(voice: Voice): void {
    if (!voice.active) return;
    voice.active = false;
    voice.source.stop();
  }
  private stopOneShots(): void {
    for (let i = 0; i < this.voices.length; i++) if (!this.voices[i]!.source.loop) this.release(this.voices[i]!);
  }

  // Discard expired world events on backgrounding. AudioManager alone suspends/resumes playback.
  private readonly onVisibility = (): void => {
    this.pendingCount = 0;
    this.stopOneShots();
  };

  getSnapshot() {
    return {
      backend: "engine-audio-source",
      state: AudioManager.state,
      loaded: this.clips.size,
      total: Object.keys(ENVIRONMENT_AUDIO_ASSETS).length,
      voices: this.voices.filter((v) => v.active).length,
      loops: this.voices.filter((v) => v.active && v.source.loop && !v.retiring).length,
      pendingThunder: this.pendingCount,
      thunderPlayed: this.thunderPlayed,
      steps: this.stepSerial,
      muted: this.muted,
      volume: this.volume,
      active: this.active,
      ducked: this.ducked,
      errors: Object.fromEntries(this.errors),
      emitters: this.voices
        .filter((v) => v.active)
        .map(({ source, emitter, retiring }) => ({
          id:
            emitter.eventId !== undefined
              ? `${emitter.id}-${emitter.eventId}`
              : emitter.cellX === undefined
                ? emitter.id
                : `${emitter.id}:${emitter.cellX}${emitter.cellZ === undefined ? "" : `:${emitter.cellZ}`}`,
          clip: emitter.clip,
          gain: source.volume * Math.pow(10, source.gainDecibels / 20),
          cutoffHz: source.lowPassFrequency,
          position: source.spatial
            ? {
                x: source.entity.transform.worldPosition.x,
                y: source.entity.transform.worldPosition.y,
                z: source.entity.transform.worldPosition.z
              }
            : null,
          playing: source.isPlaying,
          retiring
        }))
    };
  }

  override onDisable(): void {
    this.pendingCount = 0;
    for (let i = 0; i < this.voices.length; i++) this.release(this.voices[i]!);
  }

  override onDestroy(): void {
    for (const name of ["pointerdown", "touchstart", "keydown"])
      document.removeEventListener(name, this.onGesture, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pageshow", this.onVisibility);
    this.pendingCount = 0;
    this.recentCount = this.recentCursor = 0;
    for (let i = 0; i < this.voices.length; i++) this.release(this.voices[i]!);
    for (let i = 0; i < this.voices.length; i++) this.voices[i]!.source.entity.destroy();
    for (const clip of this.clips.values()) this._addResourceReferCount(clip, -1);
    this.clips.clear();
  }
}
