import { ignoreClone } from "../clone/CloneDecorators";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";

/** Retained input for submitting the two continuously varying sound-mix controls together. */
export interface AudioSourceMix {
  /** Normalized volume, clamped to 0–1. */
  volume: number;
  /** Low-pass cutoff in Hz, clamped to 10–22050. */
  lowPassFrequency: number;
  /** Exponential volume smoothing in seconds; non-positive/non-finite values are immediate. */
  volumeTimeConstant: number;
  /** Exponential filter smoothing in seconds; non-positive/non-finite values are immediate. */
  filterTimeConstant: number;
}

/**
 * Audio Source Component.
 */
export class AudioSource extends Component {
  /** If set to true, the audio component automatically begins to play on startup. */
  playOnEnabled = true;

  /** @internal */
  @ignoreClone
  _spatialSourceIndex = -1;

  @ignoreClone
  private _isPlaying = false;
  @ignoreClone
  private _pendingPlay = false;

  private _clip: AudioClip | null;
  @ignoreClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode | null = null;

  @ignoreClone
  private _filterNode: BiquadFilterNode;
  @ignoreClone
  private _pannerNode: PannerNode;
  @ignoreClone
  private _playGeneration = 0;
  @ignoreClone
  private readonly _gainTarget = new AudioParameterTarget();
  @ignoreClone
  private readonly _filterTarget = new AudioParameterTarget();
  @ignoreClone
  private readonly _positionXTarget = new AudioParameterTarget();
  @ignoreClone
  private readonly _positionYTarget = new AudioParameterTarget();
  @ignoreClone
  private readonly _positionZTarget = new AudioParameterTarget();

  private _spatial = false;
  private _distanceRolloff = 1;
  private _minDistance = 1;
  private _maxDistance = 10000;
  private _lowPassFrequency = 22050;
  private _gainDecibels = 0;

  /** Smoothing time constant for moving spatial emitters, in seconds. Zero follows immediately. */
  spatialSmoothing = 0;

  @ignoreClone
  private _pausedTime = -1;
  @ignoreClone
  private _playTime = -1;

  private _volume = 1;
  private _lastVolume = 1;
  private _playbackRate = 1;
  private _loop = false;

  /**
   * The audio clip to play.
   */
  get clip(): AudioClip | null {
    return this._clip;
  }

  set clip(value: AudioClip | null) {
    const lastClip = this._clip;
    if (lastClip !== value) {
      lastClip && lastClip._addReferCount(-1);
      value && value._addReferCount(1);
      this._clip = value;
      this.stop();
    }
  }

  /**
   * Whether the clip playing right now.
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * The volume of the audio source, ranging from 0 to 1.
   * @defaultValue `1`
   */
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this.setVolume(value);
  }

  /** Changes volume with an optional exponential smoothing time constant in seconds. */
  setVolume(value: number, timeConstant = 0): void {
    this._volume = Number.isFinite(value) ? Math.min(Math.max(0, value), 1) : 0;
    this._gainTarget.timeConstant = timeConstant;
    this._applyVolume();
  }

  /** Asset calibration in decibels, applied in addition to the normalized volume. Default is 0 dB. */
  get gainDecibels(): number {
    return this._gainDecibels;
  }

  set gainDecibels(value: number) {
    this._gainDecibels = Number.isFinite(value) ? Math.min(60, Math.max(-80, value)) : 0;
    this._gainTarget.timeConstant = 0;
    this._applyVolume();
  }

  /** Enables HRTF positioning from this entity's world transform. Default is non-spatial playback. */
  get spatial(): boolean {
    return this._spatial;
  }

  set spatial(value: boolean) {
    if (this._spatial === value) return;
    this._spatial = value;
    if (this._gainNode) this._connectOutput();
    if (this._isPlaying && value) AudioManager._addSpatialSource(this);
    else AudioManager._removeSpatialSource(this);
  }

  /** Inverse-distance attenuation factor. Set to 0 when the caller supplies its own attenuation curve. */
  get distanceRolloff(): number {
    return this._distanceRolloff;
  }

  set distanceRolloff(value: number) {
    this._distanceRolloff = Number.isFinite(value) ? Math.max(0, value) : 1;
    if (this._pannerNode) this._pannerNode.rolloffFactor = this._distanceRolloff;
  }

  /** Reference distance in world units, below which inverse-distance attenuation stops increasing. */
  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(value: number) {
    this._minDistance = Number.isFinite(value) ? Math.max(0.001, value) : 1;
    if (this._pannerNode) this._pannerNode.refDistance = this._minDistance;
  }

  /** Maximum distance in world units used by the spatial panner. */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(value: number) {
    this._maxDistance = Number.isFinite(value) ? Math.max(0.001, value) : 10000;
    if (this._pannerNode) this._pannerNode.maxDistance = this._maxDistance;
  }

  /** Low-pass cutoff in Hz. The default leaves the original playback path unfiltered. */
  get lowPassFrequency(): number {
    return this._lowPassFrequency;
  }

  set lowPassFrequency(value: number) {
    this.setLowPassFrequency(value);
  }

  /** Changes the low-pass cutoff with an optional exponential smoothing time constant in seconds. */
  setLowPassFrequency(value: number, timeConstant = 0): void {
    this._lowPassFrequency = Number.isFinite(value) ? Math.min(22050, Math.max(10, value)) : 22050;
    this._filterTarget.timeConstant = timeConstant;
    this._applyLowPass();
  }

  /**
   * Applies volume and filtering from reusable caller-owned storage.
   * Copies values synchronously; later writes to mix do not change this source until submitted again.
   */
  setMix(mix: Readonly<AudioSourceMix>): void {
    const volume = mix.volume,
      frequency = mix.lowPassFrequency;
    this._volume = Number.isFinite(volume) ? Math.min(Math.max(0, volume), 1) : 0;
    this._lowPassFrequency = Number.isFinite(frequency) ? Math.min(22050, Math.max(10, frequency)) : 22050;
    this._gainTarget.timeConstant = mix.volumeTimeConstant;
    this._filterTarget.timeConstant = mix.filterTimeConstant;
    this._applyVolume();
    this._applyLowPass();
  }

  private _applyLowPass(): void {
    if (!this._gainNode) return;
    if (!this._filterNode && this._lowPassFrequency < 22050) {
      this._ensureFilterNode();
      if (this._sourceNode) {
        this._sourceNode.disconnect();
        this._sourceNode.connect(this._filterNode);
      }
    }
    this._filterTarget.value = this._lowPassFrequency;
    this._filterTarget.apply();
  }

  /** Whether playback is waiting for the audio context to resume. */
  get isPendingPlay(): boolean {
    return this._pendingPlay;
  }

  /**
   * The playback rate of the audio source.
   * @defaultValue `1`
   */
  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = value;
    if (this._isPlaying) {
      this._sourceNode!.playbackRate.value = this._playbackRate;
    }
  }

  /**
   * Mutes or unmute the audio source.
   * Mute sets volume as 0, unmute restore volume.
   */
  get mute(): boolean {
    return this.volume === 0;
  }

  set mute(value: boolean) {
    if (value) {
      this._lastVolume = this.volume;
      this.volume = 0;
    } else {
      this.volume = this._lastVolume;
    }
  }

  /**
   * Whether the audio clip looping.
   * @defaultValue `false`
   */
  get loop(): boolean {
    return this._loop;
  }

  set loop(value: boolean) {
    if (value !== this._loop) {
      this._loop = value;

      if (this._isPlaying) {
        this._sourceNode!.loop = this._loop;
      }
    }
  }

  /**
   * Playback position in seconds.
   */
  get time(): number {
    if (this._isPlaying) {
      const currentTime = AudioManager.getContext().currentTime;
      return currentTime - this._playTime;
    } else {
      return this._pausedTime > 0 ? this._pausedTime - this._playTime : 0;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onPlayEnd = this._onPlayEnd.bind(this);
    // Gain node is created lazily on first play, not here: creating it would spin up the AudioContext
    // before any user gesture, and on iOS such a pre-gesture context never recovers from a phone-call
    // interruption (stays a silent zombie)
  }

  /**
   * Play the clip.
   * @param offset - Optional starting position in seconds. Omit to resume the paused position.
   */
  play(offset?: number): void {
    if (
      this._destroyed ||
      this._pendingDestroy ||
      !this.enabled ||
      !this._entity._isActiveInHierarchy ||
      !this._entity._isActiveInScene ||
      !this._clip?._getAudioSource() ||
      this._isPlaying ||
      this._pendingPlay
    ) {
      return;
    }
    // Hidden page: don't start (would leak a sound) and don't pend (would replay out of sync) -> drop
    if (document.hidden) {
      return;
    }

    if (AudioManager.isAudioContextRunning()) this._startPlayback(offset);
    else this._resumePlayback(offset);
  }

  /**
   * Stops playing the clip.
   */
  stop(): void {
    this._playGeneration++;
    this._pendingPlay = false;
    AudioManager._removeSpatialSource(this);

    if (this._isPlaying) {
      this._clearSourceNode();
      this._isPlaying = false;
      AudioManager._playingCount--;
    }

    // stop() always resets to the start, including from a paused state (where _isPlaying is already false)
    this._pausedTime = -1;
    this._playTime = -1;
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    this._playGeneration++;
    this._pendingPlay = false;
    AudioManager._removeSpatialSource(this);

    if (this._isPlaying) {
      this._clearSourceNode();

      this._pausedTime = AudioManager.getContext().currentTime;
      this._isPlaying = false;
      AudioManager._playingCount--;
    }
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    this.playOnEnabled && this.play();
  }

  /**
   * @internal
   */
  override _onDisable(): void {
    this.pause();
  }

  /** @internal */
  override _onEnableInScene(): void {
    this.playOnEnabled && this.play();
  }

  /** @internal */
  override _onDisableInScene(): void {
    this.pause();
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this.stop();
    this.clip = null;
    this._gainNode?.disconnect();
    this._filterNode?.disconnect();
    this._pannerNode?.disconnect();
    this._gainNode = null!;
    this._filterNode = null!;
    this._pannerNode = null!;
    this._gainTarget.bind(null);
    this._filterTarget.bind(null);
    this._positionXTarget.bind(null);
    this._positionYTarget.bind(null);
    this._positionZTarget.bind(null);
  }

  @ignoreClone
  private _onPlayEnd(): void {
    this.stop();
  }

  private _ensureGainNode(): GainNode {
    let gainNode = this._gainNode;
    if (!gainNode) {
      this._gainNode = gainNode = AudioManager.getContext().createGain();
      this._gainTarget.bind(gainNode.gain);
      this._gainTarget.timeConstant = 0;
      this._applyVolume();
      this._connectOutput();
    }
    return gainNode;
  }

  // Only suspended playback needs closures that retain the request offset and cancellation generation.
  private _resumePlayback(offset?: number): void {
    // iOS Safari requires resume() to be called within the same user gesture callback that triggers playback.
    // This helper remains synchronous with play(), including its call to resume().
    this._pendingPlay = true;
    const generation = ++this._playGeneration;
    AudioManager.resume().then(
      () => {
        // Check if cancelled by stop()/pause()
        if (!this._pendingPlay || generation !== this._playGeneration) {
          return;
        }
        this._pendingPlay = false;
        // Check if still valid to play after async resume (page may have been hidden meanwhile)
        if (
          this._destroyed ||
          this._pendingDestroy ||
          !this.enabled ||
          !this._entity._isActiveInHierarchy ||
          !this._entity._isActiveInScene ||
          !this._clip ||
          document.hidden
        ) {
          return;
        }
        this._startPlayback(offset);
      },
      (e) => {
        if (generation !== this._playGeneration) return;
        this._pendingPlay = false;
        console.warn("Failed to resume AudioContext:", e);
      }
    );
  }

  private _startPlayback(offset?: number): void {
    const startTime =
      offset === undefined
        ? this._pausedTime > 0
          ? this._pausedTime - this._playTime
          : 0
        : Number.isFinite(offset)
          ? Math.max(0, offset)
          : 0;
    this._initSourceNode(startTime);

    this._playTime = AudioManager.getContext().currentTime - startTime;
    this._pausedTime = -1;
    this._isPlaying = true;
    AudioManager._playingCount++;
    if (this._spatial) AudioManager._addSpatialSource(this);
  }

  private _initSourceNode(startTime: number): void {
    const context = AudioManager.getContext();
    const sourceNode = context.createBufferSource();
    const buffer = this._clip!._getAudioSource()!;

    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = this._playbackRate;
    sourceNode.loop = this._loop;
    sourceNode.onended = this._onPlayEnd;
    this._sourceNode = sourceNode;

    const gain = this._ensureGainNode();
    if (this._lowPassFrequency < 22050) this._ensureFilterNode();
    sourceNode.connect(this._filterNode ?? gain);
    this._synchronizePosition(true);
    // startTime is total elapsed time; for a looping clip wrap it into the buffer to keep the loop phase
    // (start()'s offset clamps past the end, it does not wrap)
    const offset = this._loop && buffer.duration > 0 ? startTime % buffer.duration : startTime;
    sourceNode.start(0, offset);
  }

  private _clearSourceNode(): void {
    this._sourceNode!.stop();
    this._sourceNode!.disconnect();
    this._sourceNode!.onended = null;
    this._sourceNode = null;
  }

  private _applyVolume(): void {
    this._gainTarget.value = this._volume * Math.pow(10, this._gainDecibels / 20);
    this._gainTarget.apply();
  }

  private _ensureFilterNode(): void {
    if (this._filterNode) return;
    const filter = (this._filterNode = AudioManager.getContext().createBiquadFilter());
    filter.type = "lowpass";
    filter.frequency.value = this._lowPassFrequency;
    this._filterTarget.bind(filter.frequency);
    filter.Q.value = 0.5;
    filter.connect(this._gainNode);
  }

  private _connectOutput(): void {
    const gain = this._gainNode;
    gain.disconnect();
    this._pannerNode?.disconnect();
    if (this._spatial) {
      const panner = (this._pannerNode ??= AudioManager.getContext().createPanner());
      this._positionXTarget.bind(panner.positionX);
      this._positionYTarget.bind(panner.positionY);
      this._positionZTarget.bind(panner.positionZ);
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.rolloffFactor = this._distanceRolloff;
      panner.refDistance = this._minDistance;
      panner.maxDistance = this._maxDistance;
      gain.connect(panner);
      panner.connect(AudioManager.getGainNode());
      this._synchronizePosition(true);
    } else {
      gain.connect(AudioManager.getGainNode());
    }
  }

  /** @internal */
  _synchronizePosition(immediate = false): void {
    if (!this._spatial || !this._pannerNode) return;
    const p = this.entity.transform.worldPosition;
    const timeConstant = immediate ? 0 : this.spatialSmoothing;
    const x = this._positionXTarget,
      y = this._positionYTarget,
      z = this._positionZTarget;
    x.value = p.x;
    y.value = p.y;
    z.value = p.z;
    x.timeConstant = y.timeConstant = z.timeConstant = timeConstant;
    x.apply();
    y.apply();
    z.apply();
  }
}

/** One retained target and smoothing binding per processing-node AudioParam. */
class AudioParameterTarget {
  value = 0;
  timeConstant = 0;
  private _parameter: AudioParam | null = null;
  private _lastValue = NaN;
  private _lastTimeConstant = NaN;
  private _smoothing = NaN;
  private _setSmoothedValue: ((value: number) => void) | null = null;
  private _previousSmoothing = NaN;
  private _setPreviousSmoothedValue: ((value: number) => void) | null = null;

  bind(parameter: AudioParam | null): void {
    if (parameter === this._parameter) return;
    this._parameter = parameter;
    this._lastValue = this._lastTimeConstant = NaN;
    this._smoothing = NaN;
    this._setSmoothedValue = null;
    this._previousSmoothing = NaN;
    this._setPreviousSmoothedValue = null;
  }

  apply(): void {
    const parameter = this._parameter;
    if (!parameter) return;
    const value = this.value;
    const timeConstant = Number.isFinite(this.timeConstant) && this.timeConstant > 0 ? this.timeConstant : 0;
    if (this._lastValue === value && this._lastTimeConstant === timeConstant) return;
    if (timeConstant > 0) {
      if (this._smoothing !== timeConstant) this._bindSmoothing(timeConstant);
      this._setSmoothedValue!(value);
    } else parameter.value = value;
    this._lastValue = value;
    this._lastTimeConstant = timeConstant;
  }

  private _bindSmoothing(timeConstant: number): void {
    // Retain the previous binding as well: playback and fade-out can repeatedly alternate smoothing.
    const previous = this._setSmoothedValue;
    this._setSmoothedValue =
      this._previousSmoothing === timeConstant
        ? this._setPreviousSmoothedValue
        : createSmoothedSetter(this._parameter!, timeConstant);
    this._previousSmoothing = this._smoothing;
    this._setPreviousSmoothedValue = previous;
    this._smoothing = timeConstant;
  }
}

function createSmoothedSetter(parameter: AudioParam, timeConstant: number): (value: number) => void {
  // Past automation times are clamped to the current audio time by Web Audio.
  // Capture fixed settings only when they change; hot submissions carry only the varying target.
  return (value) => parameter.setTargetAtTime(value, 0, timeConstant);
}
