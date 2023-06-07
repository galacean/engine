import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioManager } from "./AudioManager";

/**
 * Audio Listener
 * Can only have one in a scene.
 */
export class AudioListener extends Component {
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const gain = AudioManager.context.createGain();
    gain.connect(AudioManager.context.destination);
    AudioManager.listener = gain;
  }

  protected override _onDestroy(): void {
    AudioManager.listener = null;
  }
}
