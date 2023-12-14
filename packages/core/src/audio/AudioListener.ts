import { Component } from "../Component";
import { Entity } from "../Entity";
import { AudioManager } from "./AudioManager";

/**
 * Audio Listener
 * Can only have one in a scene.
 */
export class AudioListener extends Component {
  private static instance: AudioListener | null = null;
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    if (AudioListener.instance) {
      throw new Error("There can only be one AudioListener in a scene.");
    }
    AudioListener.instance = this;
    if (!AudioManager.listener) {
      const gain = AudioManager.context.createGain();
      gain.connect(AudioManager.context.destination);
      AudioManager.listener = gain;
    }
  }

  protected override _onDestroy(): void {
    if (AudioListener.instance === this) {
      AudioListener.instance = null;
    }
    
    if (AudioManager.listener) {
      AudioManager.listener.disconnect();
      AudioManager.listener = null;
    }
  }
}
