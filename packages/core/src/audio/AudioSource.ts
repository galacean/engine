import { ignoreClone } from "../clone/CloneDecorators";
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
  private _pendingPlay: Promise<void> | null = null;

  private _clip: AudioClip;
  @ignoreClone
  private _gainNode: GainNode;
  @ignoreClone
  private _sourceNode: AudioBufferSourceNode | null = null;

  @ignoreClone
  private _playbackOffset = 0;
  @ignoreClone
  private _playbackStartTime = 0;

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
    const elapsedTime = this._getElapsedTime();
    if (this._isPlaying) {
      this._sourceNode.playbackRate.value = value;
    }
    this._playbackOffset += elapsedTime * this._playbackRate;
    this._playbackStartTime += elapsedTime;
    this._playbackRate = value;
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
   * Playback position in clip seconds, including recovery wait time.
   */
  get time(): number {
    return this._playbackOffset + this._getElapsedTime() * this._playbackRate;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onPlayEnd = this._onPlayEnd.bind(this);
  }

  /**
   * Play the clip with recovery-delay compensation.
   */
  play(): void {
    if (!this._clip?._getAudioSource() || this._isPlaying) {
      return;
    }
    // Ignore background plays to avoid delayed sounds
    if (document.hidden) {
      return;
    }

    if (AudioManager.isAudioContextRunning()) {
      this._startPlayback();
    } else {
      if (!this._pendingPlay) {
        this._playbackStartTime = performance.now() / 1000;
      }
      // Share the resume attempt with the document's gesture handler
      const resumePromise = AudioManager.resume();
      if (this._pendingPlay === resumePromise) {
        return;
      }
      this._pendingPlay = resumePromise;
      resumePromise.then(
        () => {
          // A cancelled or replaced play must not consume the current request
          if (this._pendingPlay !== resumePromise) {
            return;
          }
          if (this._destroyed || !this.enabled || !this._clip || document.hidden) {
            this.pause();
            return;
          }
          this._startPlayback();
        },
        (e) => {
          if (this._pendingPlay !== resumePromise) {
            return;
          }
          this.pause();
          console.warn("Failed to resume AudioContext:", e);
        }
      );
    }
  }

  /**
   * Stops playing the clip.
   */
  stop(): void {
    this._pendingPlay = null;

    if (this._isPlaying) {
      this._clearSourceNode();
      this._isPlaying = false;
      AudioManager._playingCount--;
    }

    this._playbackOffset = 0;
    this._playbackStartTime = 0;
  }

  /**
   * Pauses playing the clip.
   */
  pause(): void {
    this._playbackOffset = this.time;
    this._pendingPlay = null;

    if (this._isPlaying) {
      this._clearSourceNode();

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
      // Defer context creation to playback for iOS interruption recovery
      this._gainNode = gainNode = AudioManager.getContext().createGain();
      gainNode.connect(AudioManager.getGainNode());
      gainNode.gain.setValueAtTime(this._volume, AudioManager.getContext().currentTime);
    }
    return gainNode;
  }

  private _startPlayback(): void {
    const startTime = this.time;
    this._pendingPlay = null;
    if (!this._loop && (startTime < 0 || startTime >= this._clip.duration)) {
      this.stop();
      return;
    }
    this._initSourceNode(startTime);

    this._playbackOffset = startTime;
    this._playbackStartTime = AudioManager.getContext().currentTime;
    this._isPlaying = true;
    AudioManager._playingCount++;
  }

  private _getElapsedTime(): number {
    if (this._isPlaying) {
      return AudioManager.getContext().currentTime - this._playbackStartTime;
    }
    if (this._pendingPlay) {
      // Context time freezes during recovery
      return performance.now() / 1000 - this._playbackStartTime;
    }
    return 0;
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
    // start() clamps offsets; wrap them to preserve loop phase
    let offset = startTime;
    if (this._loop && buffer.duration > 0) {
      offset %= buffer.duration;
      if (offset < 0) {
        offset += buffer.duration;
      }
    }
    sourceNode.start(0, offset);
  }

  private _clearSourceNode(): void {
    this._sourceNode.stop();
    this._sourceNode.disconnect();
    this._sourceNode.onended = null;
    this._sourceNode = null;
  }
}
