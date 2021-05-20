import { BlinnPhongMaterial, Entity, MeshRenderer, PrimitiveMesh } from "@oasis-engine/core";

// Only for editor
export class Model extends MeshRenderer {
  private _props: Object = null;

  constructor(entity: Entity) {
    super(entity);
    this.setMaterial(new BlinnPhongMaterial(this.engine));
  }

  get material(): any {
    return this.getMaterial();
  }

  set material(mtl: any) {
    this.setMaterial(mtl);
  }

  setProps(props: any = {}) {
    if (this._props !== props) {
      this._props = props;
    }

    switch (props.geometryType) {
      case "Sphere":
        this.mesh = PrimitiveMesh.createSphere(this._engine, props.sphereRadius, props.sphereSegments);
        break;

      case "Cylinder":
        this.mesh = PrimitiveMesh.createCylinder(
          this._engine,
          props.cylinderRadiusTop,
          props.cylinderRadiusBottom,
          props.cylinderHeight,
          props.cylinderRadialSegments,
          props.cylinderHeightSegments
        );
        break;

      case "Plane":
        this.mesh = PrimitiveMesh.createPlane(
          this._engine,
          props.planeWidth,
          props.planeHeight,
          props.planeHorizontalSegments,
          props.planeVerticalSegments
        );
        break;

      case "Box":
        this.mesh = PrimitiveMesh.createCuboid(this._engine, props.boxWidth, props.boxHeight, props.boxDepth);
        break;
    }
  }

  updateProp(key: string, value: string | number) {
    const props = this._props;
    props[key] = value;
    this.setProps(props);
  }
}
