import { Component } from "../Component";
import { Entity } from "../Entity";
import { TransformModifyFlags } from "../Transform";
import { ignoreClone } from "../clone/CloneManager";
import { AudioManager } from "./AudioManager";

/**
 * Audio Listener
 * only one per scene
 */
export class AudioListener extends Component {
  private _context: AudioContext;

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const gain = AudioManager.context.createGain();
    gain.connect(AudioManager.context.destination);
    AudioManager.listener = gain;

    this._context = AudioManager.context;
    this._registerEntityTransformListener();
  }

  /**
   * @internal
   */
  @ignoreClone
  protected _onTransformChanged(type: TransformModifyFlags) {
    const { position, worldUp, worldForward } = this.entity.transform;
    const { listener, currentTime } = this._context;

    listener.positionX.setValueAtTime(position.x, currentTime);
    listener.positionY.setValueAtTime(position.y, currentTime);
    listener.positionZ.setValueAtTime(position.z, currentTime);

    listener.upX.setValueAtTime(worldUp.x, currentTime);
    listener.upY.setValueAtTime(worldUp.y, currentTime);
    listener.upZ.setValueAtTime(worldUp.z, currentTime);

    listener.forwardX.setValueAtTime(worldForward.x, currentTime);
    listener.forwardY.setValueAtTime(worldForward.y, currentTime);
    listener.forwardZ.setValueAtTime(worldForward.z, currentTime);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    AudioManager.listener = null;
    this.entity.transform._updateFlagManager.removeListener(this._onTransformChanged);
  }

  private _registerEntityTransformListener() {
    this.entity.transform._updateFlagManager.addListener(this._onTransformChanged);
  }
}
