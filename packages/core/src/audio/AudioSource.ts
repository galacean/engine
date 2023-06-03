import { MathUtil } from "@galacean/engine-math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";

/**
 * Audio Source Component
 */
export class AudioSource extends Component {
  /** Whether the sound is playing or not */
  isPlaying: Readonly<boolean>;
  /** whether the sound must be replayed when the end is reached. Default false */
  loop: boolean = false;
  /** Fired when the sound has stopped playing, either because it's reached a predetermined stop time, the full duration of the audio has been performed, or because the entire audio has been played. */
  onPlayEnd: () => any;

  private _clip: AudioClip;
  private _context: AudioContext;
  private _gainNode: GainNode;
  private _sourceNode: AudioBufferSourceNode;

  private _startTime: number = 0;
  private _pausedTime: number = null;
  private _endTime: number = null;
  private _duration: number = null;
  private _absoluteStartTime: number;

  private _currRepeatTimes: number = 1;
  private _repeatTimes: number = 1;
  private _volume: number = 1;
  private _mute: boolean = false;
  private _playbackRate: number = 1;

  /** The audio asset to be played */
  get clip(): AudioClip {
    return this._clip;
  }

  set clip(value: AudioClip) {
    this._clip = value;
  }

  /** the volume, should be positive. Default 1*/
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
    if (this.isPlaying) {
      this._gainNode.gain.setValueAtTime(value, this._context.currentTime);
    }
  }

  /** Speed factor at which the sound will be played. Default 1 */
  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(value: number) {
    this._playbackRate = value;
    if (this.isPlaying) {
      this._sourceNode.playbackRate.value = this._playbackRate;
    }
  }

  /** whether is muted or not */
  get mute(): boolean {
    return this._mute;
  }

  set mute(value: boolean) {
    this._mute = value;
    if (value) {
      this.volume = 0;
    }
  }

  /** repeat times, default 1, should be positive integer */
  get repeatTimes(): number {
    return this._repeatTimes;
  }

  set repeatTimes(value: number) {
    this._repeatTimes = MathUtil.clamp(Math.abs(Math.ceil(value)), 1, Infinity);
    this._currRepeatTimes = this._repeatTimes;
  }

  /** The time, in seconds, at which the sound should begin to play. Default 0 */
  get startTime(): number {
    return this._startTime;
  }

  set startTime(value: number) {
    this._startTime = value;
  }

  /** The time, in seconds, at which the sound should stop to play. */
  get endTime(): number {
    return this._endTime;
  }

  set endTime(value: number) {
    this._endTime = value;
    this._duration = this._endTime - this._startTime;
  }

  /** Current playback progress, in seconds */
  get position(): number {
    if (this.isPlaying) {
      return this._pausedTime
        ? this.engine.time.elapsedTime - this._absoluteStartTime + this._pausedTime
        : this.engine.time.elapsedTime - this._absoluteStartTime + this.startTime;
    }
    return 0;
  }

  /** @internal */
  constructor(entity: Entity) {
    super(entity);
    this._onPlayEnd = this._onPlayEnd.bind(this);

    this._context = AudioManager.context;
    this._gainNode = AudioManager.context.createGain();
    this._gainNode.connect(AudioManager.listener);
  }

  /** play the sound from the very beginning */
  public play() {
    if (!this._clip || !this.clip.duration || this.isPlaying) return;
    if (this.startTime > this._clip.duration || this.startTime < 0) return;
    if (this._duration && this._duration < 0) return;

    this._pausedTime = null;
    this._play(this.startTime, this._duration);
  }

  /** stop play the sound */
  public stop() {
    if (this._sourceNode && this.isPlaying) {
      this._sourceNode.stop();
      this._currRepeatTimes = 1;
    }
  }
  /** pause playing */
  public pause() {
    if (this._sourceNode && this.isPlaying) {
      this._pausedTime = this.position;

      this.isPlaying = false;

      this._sourceNode.disconnect();
      this._sourceNode.onended = null;
      this._sourceNode = null;
    }
  }

  /** resume playing, if is paused */
  public resume() {
    if (!this.isPlaying && this._pausedTime) {
      const duration = this.endTime ? this.endTime - this._pausedTime : null;
      this._play(this._pausedTime, duration);
    }
  }

  private _play(startTime: number, duration: number | null) {
    const source = this._context.createBufferSource();
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

  private _onPlayEnd() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._currRepeatTimes === 1) {
      this._currRepeatTimes = this._repeatTimes;
      this._sourceNode.disconnect();
      this._sourceNode = null;
      this._pausedTime = null;
      this.onPlayEnd && this.onPlayEnd();
      return;
    }
    if (this._currRepeatTimes > 1) {
      this._currRepeatTimes--;
      this.play();
    }
  }
}
