import { deepClone, ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";

/**
 * Audio Source Component.
 */
export class AudioSource extends Component {
  @ignoreClone
  private _isPlaying: boolean = false;

  @ignoreClone
  private _clip: AudioClip;
  @deepClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode | null = null;

  @deepClone
  private _pausedTime: number = -1;
  @ignoreClone
  private _absoluteStartTime: number = -1;

  @deepClone
  private _volume: number = 1;
  @deepClone
  private _lastVolume: number = 1;
  @deepClone
  private _playbackRate: number = 1;
  @deepClone
  private _loop: boolean = false;

  /** If set to true, the audio component automatically begins to play on startup. */
  playOnEnabled: boolean = true;

  /**
   * The audio clip to play.
   */
  get clip(): AudioClip {
    return this._clip;
  }

  set clip(value: AudioClip) {
    const lastClip = this._clip;
    if (lastClip !== value) {
      lastClip && lastClip._addReferCount(-1);
      this._clip = value;

      if (this.playOnEnabled && this.enabled) {
        this.play();
      }
    }
  }

  /**
   * Whether the clip playing right now (Read Only).
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * The volume of the audio source. 1.0 is origin volume.
   */
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
    if (this._isPlaying) {
      this._gainNode.gain.setValueAtTime(value, AudioManager.context.currentTime);
    }
  }

  /**
   * The playback rate of the audio source, 1.0 is normal playback speed.
   */
  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = value;
    if (this._isPlaying) {
      this._sourceNode.playbackRate.value = this._playbackRate;
    }
  }

  /**
   * Mutes / Unmutes the AudioSource.
   * Mute sets volume as 0, Un-Mute restore volume.
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
   * Whether the audio clip looping. Default false.
   */
  get loop(): boolean {
    return this._loop;
  }

  set loop(value: boolean) {
    if (value !== this._loop) {
      this._loop = value;

      if (this._isPlaying) {
        this._sourceNode.loop = this._loop;
      }
    }
  }

  /**
   * Playback position in seconds.
   */
  get time(): number {
    if (this._isPlaying) {
      return this._pausedTime > 0
        ? this.engine.time.elapsedTime - this._absoluteStartTime + this._pausedTime
        : this.engine.time.elapsedTime - this._absoluteStartTime;
    } else {
      return this._pausedTime > 0 ? this._pausedTime : 0;
    }
  }

  /** @internal */
  constructor(entity: Entity) {
    super(entity);
    this._onPlayEnd = this._onPlayEnd.bind(this);

    this._gainNode = AudioManager.context.createGain();
    this._gainNode.connect(AudioManager.gainNode);
  }

  /**
   * Plays the clip.
   */
  play(): void {
    if (!this._canPlay()) return;
    if (this._isPlaying) return;
    this._initSourceNode();
    this._startPlayback(this._pausedTime > 0 ? this._pausedTime : 0);

    this._pausedTime = -1;
    this._isPlaying = true;
  }

  /**
   * Stops playing the clip.
   */
  stop(): void {
    if (this._isPlaying) {
      this._clearSourceNode();

      this._isPlaying = false;
      this._pausedTime = -1;
      this._absoluteStartTime = -1;
    }
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    if (this._isPlaying) {
      this._clearSourceNode();

      this._isPlaying = false;
      this._pausedTime = this.time;
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

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    if (this._clip) {
      this._clip._addReferCount(-1);
      this._clip = null;
    }
  }

  private _onPlayEnd(): void {
    this.stop();
  }

  private _initSourceNode(): void {
    this._clearSourceNode();
    this._sourceNode = AudioManager.context.createBufferSource();

    const { _sourceNode: sourceNode } = this;
    sourceNode.buffer = this._clip.getAudioSource();
    sourceNode.onended = this._onPlayEnd;
    sourceNode.playbackRate.value = this._playbackRate;
    sourceNode.loop = this._loop;

    this._gainNode.gain.setValueAtTime(this._volume, AudioManager.context.currentTime);
    sourceNode.connect(this._gainNode);
  }

  private _clearSourceNode(): void {
    if (!this._sourceNode) return;

    this._sourceNode.stop();
    this._sourceNode.disconnect();
    this._sourceNode.onended = null;
    this._sourceNode = null;
  }

  private _startPlayback(startTime: number): void {
    this._sourceNode.start(0, startTime);
    this._absoluteStartTime =
      this._absoluteStartTime > 0 ? this.engine.time.elapsedTime - startTime : this.engine.time.elapsedTime;
  }

  private _canPlay(): boolean {
    return this._isValidClip() && this._isAudioContextRunning();
  }

  private _isValidClip(): boolean {
    if (!this._clip || this._clip.duration <= 0) {
      return false;
    }

    return true;
  }

  private _isAudioContextRunning(): boolean {
    if (AudioManager.context.state !== "running") {
      console.warn("AudioContext is not running. User interaction required.");
      return false;
    }

    return true;
  }
}
