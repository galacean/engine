import { MeshRenderer, MeshTopology, ModelMesh, Script, UnlitMaterial, Color } from "@galacean/engine";
import { XRPlane } from "./trackable/XRPlane";

export class XRPlaneVisualizer extends Script {
  private _xrPlane: XRPlane;
  private _renderer: MeshRenderer;
  private _mesh: ModelMesh;
  private _color: Color = new Color();

  override onAwake(): void {
    const { entity } = this;
    this._xrPlane = entity.getComponent(XRPlane);
    this._renderer = entity.addComponent(MeshRenderer);
    this._mesh = this._renderer.mesh = new ModelMesh(this.engine);
    this._color.r = Math.random();
    this._color.g = Math.random();
    this._color.b = Math.random();
    this._color.a = 0.5;
    const material = new UnlitMaterial(this.engine);
    material.baseColor = this._color;
    material.isTransparent = true;
    this._renderer.setMaterial(material);
    this._updateMesh();
  }

  override onUpdate(): void {
    if (this._xrPlane.platformData.frameCount === this.engine.time.frameCount) {
      this._updateMesh();
    }
  }

  private _updateMesh(): void {
    const { polygon } = this._xrPlane.platformData;
    this._mesh.setPositions(polygon);
    this._mesh.uploadData(false);
    this._mesh.clearSubMesh();
    this._mesh.addSubMesh(0, polygon.length, MeshTopology.TriangleFan);
  }
}
