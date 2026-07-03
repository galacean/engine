import { ignoreClone } from "../clone/CloneManager";
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

  private _clip: AudioClip;
  @ignoreClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode | null = null;

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
    // No node yet -> _ensureGainNode() applies _volume on first play
    this._gainNode?.gain.setValueAtTime(value, AudioManager.getContext().currentTime);
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
    // Gain node is created lazily on first play, not here: creating it would spin up the AudioContext
    // before any user gesture, and on iOS such a pre-gesture context never recovers from a phone-call
    // interruption (stays a silent zombie)
  }

  /**
   * Play the clip.
   */
  play(): void {
    if (!this._clip?._getAudioSource() || this._isPlaying || this._pendingPlay) {
      return;
    }
    // Hidden page: don't start (would leak a sound) and don't pend (would replay out of sync) -> drop
    if (document.hidden) {
      return;
    }

    if (AudioManager.isAudioContextRunning()) {
      this._startPlayback();
    } else {
      // iOS Safari requires resume() to be called within the same user gesture callback that triggers playback.
      // Document-level events won't work - must call resume() directly here in play().
      this._pendingPlay = true;
      AudioManager.resume().then(
        () => {
          // Check if cancelled by stop()/pause()
          if (!this._pendingPlay) {
            return;
          }
          this._pendingPlay = false;
          // Check if still valid to play after async resume (page may have been hidden meanwhile)
          if (this._destroyed || !this.enabled || !this._clip || document.hidden) {
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
    this._pendingPlay = false;

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
    this._pendingPlay = false;

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

  private _ensureGainNode(): GainNode {
    let gainNode = this._gainNode;
    if (!gainNode) {
      this._gainNode = gainNode = AudioManager.getContext().createGain();
      gainNode.connect(AudioManager.getGainNode());
      gainNode.gain.setValueAtTime(this._volume, AudioManager.getContext().currentTime);
    }
    return gainNode;
  }

  private _startPlayback(): void {
    const startTime = this._pausedTime > 0 ? this._pausedTime - this._playTime : 0;
    this._initSourceNode(startTime);

    this._playTime = AudioManager.getContext().currentTime - startTime;
    this._pausedTime = -1;
    this._isPlaying = true;
    AudioManager._playingCount++;
  }

  private _initSourceNode(startTime: number): void {
    const context = AudioManager.getContext();
    const sourceNode = context.createBufferSource();
    const buffer = this._clip._getAudioSource();

    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = this._playbackRate;
    sourceNode.loop = this._loop;
    sourceNode.onended = this._onPlayEnd;
    this._sourceNode = sourceNode;

    sourceNode.connect(this._ensureGainNode());
    // startTime is total elapsed time; for a looping clip wrap it into the buffer to keep the loop phase
    // (start()'s offset clamps past the end, it does not wrap)
    const offset = this._loop && buffer.duration > 0 ? startTime % buffer.duration : startTime;
    sourceNode.start(0, offset);
  }

  private _clearSourceNode(): void {
    this._sourceNode.stop();
    this._sourceNode.disconnect();
    this._sourceNode.onended = null;
    this._sourceNode = null;
  }
}
