import { Script } from "../../Script";
import { UnlitMaterial } from "../../material";
import { MeshRenderer, ModelMesh } from "../../mesh";
import { XRPlane } from "./trackable/XRPlane";

export class XRPlaneVisualizer extends Script {
  private _xrPlane: XRPlane;
  private _renderer: MeshRenderer;
  private _mesh: ModelMesh;

  override onAwake(): void {
    this._xrPlane = this._entity.getComponent(XRPlane);
    this._renderer = this.entity.addComponent(MeshRenderer);
    this._mesh = this._renderer.mesh = new ModelMesh(this.engine);
    this._renderer.setMaterial(new UnlitMaterial(this.engine));
    this._updateMesh();
  }

  override onUpdate(): void {
    if (this._xrPlane.platformData.frameCount === this.engine.time.frameCount) {
      this._updateMesh();
    }
  }

  private _updateMesh(): void {
    const { platformData } = this._xrPlane;
    this._mesh.setPositions(platformData.polygon);
  }
}
