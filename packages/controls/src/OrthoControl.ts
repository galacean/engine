import { Entity, Script } from "oasis-engine";

export class OrthoControl extends Script {
  camera: Entity;
  mainElement: HTMLCanvasElement;

  constructor(entity: Entity) {
    super(entity);

    this.camera = entity;
    // @ts-ignore
    this.mainElement = this.engine.canvas._webCanvas;
  }
}
