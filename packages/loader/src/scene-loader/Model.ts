import { BlinnPhongMaterial, Entity, MeshRenderer, PrimitiveMesh } from "@oasis-engine/core";

// Only for editor
export class Model extends MeshRenderer {
  private _geometryType: GeometryType;

  set geometryType(value: GeometryType) {
    switch (value) {
      case "Sphere":
        this.mesh = PrimitiveMesh.createSphere(this._engine);
        break;

      case "Cylinder":
        this.mesh = PrimitiveMesh.createCylinder(this._engine);
        break;

      case "Plane":
        this.mesh = PrimitiveMesh.createPlane(this._engine);
        break;

      case "Box":
        this.mesh = PrimitiveMesh.createCuboid(this._engine);
        break;
    }

    this._geometryType = value;
  }

  get geometryType() {
    return this._geometryType;
  }

  constructor(entity: Entity) {
    super(entity);
    this.setMaterial(new BlinnPhongMaterial(this.engine));
    this.geometryType = GeometryType.Box;
  }

  get material(): any {
    return this.getMaterial();
  }

  set material(mtl: any) {
    this.setMaterial(mtl);
  }
}

enum GeometryType {
  Box = "Box",
  Cylinder = "Cylinder",
  Plane = "Plane",
  Sphere = "Sphere"
}
