import { deepClone, ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";

/**
 * Audio Source Component.
 */
export class AudioSource extends Component {
  /** If set to true, the audio component automatically begins to play on startup. */
  playOnEnabled = true;

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
  private _playTime: number = -1;

  @deepClone
  private _volume: number = 1;
  @deepClone
  private _lastVolume: number = 1;
  @deepClone
  private _playbackRate: number = 1;
  @deepClone
  private _loop: boolean = false;

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
      value && value._addReferCount(1);
      this._clip = value;
      this.stop();
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
    this._gainNode.gain.setValueAtTime(value, AudioManager.getContext().currentTime);
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

    this._gainNode = AudioManager.getContext().createGain();
    this._gainNode.connect(AudioManager.getGainNode());
  }

  /**
   * Play the clip.
   */
  play(): void {
    if (!this._canPlay()) {
      return;
    }
    if (this._isPlaying) {
      return;
    }
    const startTime = this._pausedTime > 0 ? this._pausedTime - this._playTime : 0;
    this._initSourceNode(startTime);

    this._playTime = AudioManager.getContext().currentTime - startTime;
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
      this._playTime = -1;
    }
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    if (this._isPlaying) {
      this._clearSourceNode();

      this._pausedTime = AudioManager.getContext().currentTime;
      this._isPlaying = false;
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
    this.stop();
    this.clip = null;
  }

  private _onPlayEnd(): void {
    this.stop();
  }

  private _initSourceNode(startTime: number): void {
    const context = AudioManager.getContext();
    const sourceNode = context.createBufferSource();

    sourceNode.buffer = this._clip._getAudioSource();
    sourceNode.playbackRate.value = this._playbackRate;
    sourceNode.loop = this._loop;
    sourceNode.onended = this._onPlayEnd;
    this._sourceNode = sourceNode;

    sourceNode.connect(this._gainNode);

    this._sourceNode.start(0, startTime);
  }

  private _clearSourceNode(): void {
    this._sourceNode.stop();
    this._sourceNode.disconnect();
    this._sourceNode.onended = null;
    this._sourceNode = null;
  }

  private _canPlay(): boolean {
    const isValidClip = this._clip?._getAudioSource() ? true : false;
    return isValidClip && AudioManager.isAudioContextRunning();
  }
}
