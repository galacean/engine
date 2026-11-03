import { Component } from "../Component";
import { AudioManager } from "./AudioManager";

/**
 * Spatial audio listener. Attach to the entity representing the listener's head.
 * The most recently enabled listener in an active scene owns the shared audio context.
 * Disabling it restores the previous active listener. Creating one never starts audio.
 */
export class AudioListener extends Component {
  /** @internal */
  override _onEnableInScene(): void {
    AudioManager._addListener(this);
  }

  /** @internal */
  override _onDisableInScene(): void {
    AudioManager._removeListener(this);
  }

  /** @internal */
  _synchronize(context: AudioContext): void {
    const transform = this.entity.transform;
    const p = transform.worldPosition;
    const f = transform.worldForward;
    const u = transform.worldUp;
    context.listener.setPosition(p.x, p.y, p.z);
    context.listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
  }
}
