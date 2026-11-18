import { Scene, Script } from "@galacean/engine";
import { AnimalSystem } from "./AnimalSystem";

/** Scene-owned simulation clock shared by roaming animals and companion capabilities. */
export class AnimalSystemComponent extends Script {
  /** Borrowed by animal instances; this component owns shutdown. */
  readonly system = new AnimalSystem();

  /**
   * Locate or create the scene's animal clock without process-global state.
   * @param scene Scene that owns all registered animal Entities.
   * @returns The existing or newly attached system component.
   */
  static getOrCreate(scene: Scene): AnimalSystemComponent {
    for (const root of scene.rootEntities) {
      const component = root.getComponent(AnimalSystemComponent);
      if (component) return component;
    }
    return scene.createRootEntity("Animal system").addComponent(AnimalSystemComponent);
  }

  /** Advance engine simulation time; zero time preserves pending work during pause. */
  override onUpdate(seconds: number): void {
    this.system.update(Math.min(seconds, 0.1));
  }

  /** Cancel registered runtimes before the Scene releases their resources. */
  override onDestroy(): void {
    this.system.dispose();
  }
}
