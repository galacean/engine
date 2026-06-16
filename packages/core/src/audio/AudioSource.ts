import { assignmentClone, ignoreClone } from "../clone/CloneManager";
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
  private _isPlaying = false;
  @ignoreClone
  private _pendingPlay = false;

  @assignmentClone
  private _clip: AudioClip;
  @ignoreClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode | null = null;

  @ignoreClone
  private _pausedTime = -1;
  @ignoreClone
  private _playTime = -1;

  @assignmentClone
  private _volume = 1;
  @assignmentClone
  private _lastVolume = 1;
  @assignmentClone
  private _playbackRate = 1;
  @assignmentClone
  private _loop = false;

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
    value = Math.min(Math.max(0, value), 1.0);
    this._volume = value;
    this._gainNode.gain.setValueAtTime(value, AudioManager.getContext().currentTime);
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
      this._sourceNode.playbackRate.value = this._playbackRate;
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
    if (!this._clip?._getAudioSource() || this._isPlaying || this._pendingPlay) {
      return;
    }

    if (AudioManager._canStartPlayback()) {
      this._startPlayback();
    } else {
      this._pendingPlay = true;
      AudioManager.resume().then(
        () => {
          if (!this._pendingPlay) {
            return;
          }
          this._pendingPlay = false;
          if (this._destroyed || !this.enabled || !this._clip?._getAudioSource() || !AudioManager._canStartPlayback()) {
            return;
          }
          this._startPlayback();
        },
        (e) => {
          this._pendingPlay = false;
          console.warn("Failed to resume AudioContext:", e);
        }
      );
    }
  }

  /**
   * Stops playing the clip.
   */
  stop(): void {
    this._cancelPendingPlayback();

    if (this._isPlaying) {
      this._clearSourceNode();
      this._isPlaying = false;
    }

    this._pausedTime = -1;
    this._playTime = -1;
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    this._cancelPendingPlayback();

    if (this._isPlaying) {
      this._clearSourceNode();
      this._pausedTime = AudioManager.getContext().currentTime;
      this._isPlaying = false;
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: AudioSource): void {
    target._clip?._addReferCount(1);
    target._gainNode.gain.setValueAtTime(target._volume, AudioManager.getContext().currentTime);
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

  @ignoreClone
  private _onPlayEnd(): void {
    this.stop();
  }

  private _startPlayback(): void {
    const startTime = this._pausedTime > 0 ? this._pausedTime - this._playTime : 0;
    if (!this._initSourceNode(startTime)) {
      this._pausedTime = -1;
      this._playTime = -1;
      return;
    }

    this._playTime = AudioManager.getContext().currentTime - startTime;
    this._pausedTime = -1;
    this._isPlaying = true;
  }

  private _initSourceNode(startTime: number): boolean {
    const context = AudioManager.getContext();
    const sourceNode = context.createBufferSource();
    const audioBuffer = this._clip._getAudioSource();
    const duration = audioBuffer.duration;
    let offset = Math.max(0, startTime);

    if (duration > 0) {
      if (this._loop) {
        offset %= duration;
      } else if (offset >= duration) {
        return false;
      }
    }

    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = this._playbackRate;
    sourceNode.loop = this._loop;
    sourceNode.onended = this._onPlayEnd;
    this._sourceNode = sourceNode;

    sourceNode.connect(this._gainNode);
    sourceNode.start(0, offset);
    return true;
  }

  private _clearSourceNode(): void {
    const sourceNode = this._sourceNode;
    if (!sourceNode) {
      return;
    }

    sourceNode.onended = null;
    try {
      sourceNode.stop();
    } catch {}
    sourceNode.disconnect();
    this._sourceNode = null;
  }

  private _cancelPendingPlayback(): void {
    this._pendingPlay = false;
  }
}
