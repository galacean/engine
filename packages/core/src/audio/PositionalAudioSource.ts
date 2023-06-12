import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioClip } from "./AudioClip";
import { AudioManager } from "./AudioManager";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { TransformModifyFlags } from "../Transform";

/**
 * Positional Audio Source Component
 */
export class PositionalAudioSource extends Component {
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
  @deepClone
  private _pannerNode: PannerNode;
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
   * The spatialization algorithm to use to position the audio in 3D space.
   * Default equal power.
   */
  get PanningMode(): PanningModelType {
    return this._pannerNode.panningModel;
  }

  set PanningMode(value: PanningModelType) {
    this._pannerNode.panningModel = value;
  }

  /**
   * The algorithm to use to reduce the volume of the audio source as it moves away from the listener.
   * Default inverse.
   */
  get distanceModel(): DistanceModelType {
    return this._pannerNode.distanceModel;
  }

  set distanceModel(value: DistanceModelType) {
    this._pannerNode.distanceModel = value;
  }

  /**
   * The minimum distance which the volume start to reduce.
   */
  get minDistance(): number {
    return this._pannerNode.refDistance;
  }

  set minDistance(value: number) {
    this._pannerNode.refDistance = value;
  }
  /**
   * The maximum distance beyond which the volume is not reduced any further.
   */
  get maxDistance(): number {
    return this._pannerNode.maxDistance;
  }

  set maxDistance(value: number) {
    this._pannerNode.maxDistance = value;
  }

  /**
   * Direcitonal audio clip.
   * The angle, in degrees, of a cone inside of which there will be no volume reduction.
   */
  get innerAngle(): number {
    return this._pannerNode.coneInnerAngle;
  }

  set innerAngle(value: number) {
    this._pannerNode.coneInnerAngle = value;
  }

  /**
   * Directional audio clip.
   * The angle, in degrees, of a cone outside of which the volume will be reduced by a constant value.
   */
  get outerAngle(): number {
    return this._pannerNode.coneOuterAngle;
  }

  set outerAngle(value: number) {
    this._pannerNode.coneOuterAngle = value;
  }

  /**
   * Directional audio clip.
   * The volume outside the cone defined by the coneOuterAngle. Default 0, meaning that no sound can be heard.
   */
  get outerVolume(): number {
    return this._pannerNode.coneOuterGain;
  }

  set outerVolume(value: number) {
    this._pannerNode.coneOuterGain = value;
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

    this._pannerNode = AudioManager.context.createPanner();
    this._pannerNode.connect(this._gainNode);
    this._gainNode.connect(AudioManager.listener);

    this._onTransformChanged = this._onTransformChanged.bind(this);
    this._registerEntityTransformListener();
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

    this.entity.transform._updateFlagManager.removeListener(this._onTransformChanged);
  }

  /**
   * @internal
   */
  @ignoreClone
  protected _onTransformChanged(type: TransformModifyFlags) {
    if ((type & TransformModifyFlags.WmWp) != 0) {
      this._updatePosition();
    }

    if ((type & TransformModifyFlags.WmWeWq) != 0) {
      this._updateOrientation();
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

  private _registerEntityTransformListener() {
    this.entity.transform._updateFlagManager.addListener(this._onTransformChanged);
  }

  private _updatePosition() {
    const { _pannerNode: panner } = this;
    const { position } = this.entity.transform;
    const { context } = AudioManager;

    panner.positionX.setValueAtTime(position.x, context.currentTime);
    panner.positionY.setValueAtTime(position.y, context.currentTime);
    panner.positionZ.setValueAtTime(position.z, context.currentTime);
  }

  private _updateOrientation() {
    const { _pannerNode: panner } = this;
    const { worldForward } = this.entity.transform;
    const { context } = AudioManager;

    panner.orientationX.setValueAtTime(worldForward.x, context.currentTime);
    panner.orientationY.setValueAtTime(worldForward.y, context.currentTime);
    panner.orientationZ.setValueAtTime(worldForward.z, context.currentTime);
  }
}
