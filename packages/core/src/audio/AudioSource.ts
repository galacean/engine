import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";
import { assignmentClone, deepClone, ignoreClone } from "../clone/CloneManager";

/**
 * Audio Source Component
 */
export class AudioSource extends Component {
  @ignoreClone
  /** Whether the clip playing right now */
  isPlaying: Readonly<boolean>;
  @deepClone
  /** Whether the audio clip looping. Default false */
  loop: boolean = false;
  @deepClone
  /** If set to true, the audio source will automatically start playing on awake. */
  playOnAwake: boolean = false;

  @ignoreClone
  private _clip: AudioClip;
  @deepClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode;

  @deepClone
  private _startTime: number = 0;
  @deepClone
  private _pausedTime: number = null;
  @deepClone
  private _endTime: number = null;
  @deepClone
  private _duration: number = null;
  @ignoreClone
  private _absoluteStartTime: number;

  @deepClone
  private _volume: number = 1;
  @deepClone
  private _lastVolume: number = 1;
  @deepClone
  private _playbackRate: number = 1;

  /**
   * The audio cilp to play
   */
  get clip(): AudioClip {
    return this._clip;
  }

  set clip(value: AudioClip) {
    const lastClip = this._clip;
    if (lastClip !== value) {
      lastClip && lastClip._addReferCount(-1);
      this._clip = value;
    }
  }

  /**
   * The volume of the audio source. 1.0 is origin volume.
   */
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
    if (this.isPlaying) {
      this._gainNode.gain.setValueAtTime(value, AudioManager.context.currentTime);
    }
  }

  /**
   * The playback speed of the audio source, 1.0 is normal playback speed.
   */
  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = value;
    if (this.isPlaying) {
      this._sourceNode.playbackRate.value = this._playbackRate;
    }
  }

  /**
   * Mutes / Unmutes the AudioSource.
   * Mute sets the volume = 0, Un-Mute restore the original volume.
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
   * The time, in seconds, at which the sound should begin to play. Default 0.
   */
  get startTime(): number {
    return this._startTime;
  }

  set startTime(value: number) {
    this._startTime = value;
  }

  /**
   * The time, in seconds, at which the sound should stop to play.
   */
  get endTime(): number {
    return this._endTime;
  }

  set endTime(value: number) {
    this._endTime = value;
    this._duration = this._endTime - this._startTime;
  }

  /**
   * Playback position in seconds.
   */
  get time(): number {
    if (this.isPlaying) {
      return this._pausedTime
        ? this.engine.time.elapsedTime - this._absoluteStartTime + this._pausedTime
        : this.engine.time.elapsedTime - this._absoluteStartTime + this.startTime;
    }
    return 0;
  }

  /**
   * Plays the clip.
   */
  play(): void {
    if (!this._clip || !this.clip.duration || this.isPlaying) return;
    if (this.startTime > this._clip.duration || this.startTime < 0) return;
    if (this._duration && this._duration < 0) return;

    this._pausedTime = null;
    this._play(this.startTime, this._duration);
  }

  /**
   * Stops playing the clip.
   */
  stop(): void {
    if (this._sourceNode && this.isPlaying) {
      this._sourceNode.stop();
    }
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    if (this._sourceNode && this.isPlaying) {
      this._pausedTime = this.time;

      this.isPlaying = false;

      this._sourceNode.disconnect();
      this._sourceNode.onended = null;
      this._sourceNode = null;
    }
  }

  /**
   * Unpause the paused playback of this AudioSource.
   */
  unPause(): void {
    if (!this.isPlaying && this._pausedTime) {
      const duration = this.endTime ? this.endTime - this._pausedTime : null;
      this._play(this._pausedTime, duration);
    }
  }

  /** @internal */
  constructor(entity: Entity) {
    super(entity);
    this._onPlayEnd = this._onPlayEnd.bind(this);

    this._gainNode = AudioManager.context.createGain();
    this._gainNode.connect(AudioManager.listener);
  }

  override _onAwake(): void {
    this.playOnAwake && this._clip && this.play();
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    this._clip && this.unPause();
  }

  /**
   * @internal
   */
  override _onDisable(): void {
    this._clip && this.pause();
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

  private _play(startTime: number, duration: number | null): void {
    const source = AudioManager.context.createBufferSource();
    source.buffer = this._clip.getData();
    source.onended = this._onPlayEnd;
    source.playbackRate.value = this._playbackRate;

    if (this.loop) {
      source.loop = true;
      source.loopStart = startTime;
      if (this.endTime) {
        source.loopEnd = this.endTime;
      }
    }

    this._gainNode.gain.setValueAtTime(this._volume, 0);
    source.connect(this._gainNode);

    duration ? source.start(0, startTime, duration) : source.start(0, startTime);

    this._absoluteStartTime = this.engine.time.elapsedTime;
    this._sourceNode = source;
    this.isPlaying = true;
  }

  private _onPlayEnd(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
  }
}
