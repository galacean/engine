import { Entity } from "../Entity";
import { GeometryRenderer } from "../geometry/GeometryRenderer";
import { BlinnPhongMaterial } from "../mobile-material/BlinnPhongMaterial";
import { CuboidGeometry } from "./CuboidGeometry";
import { CylinderGeometry } from "./CylinderGeometry";
import { PlaneGeometry } from "./PlaneGeometry";
import { SphereGeometry } from "./SphereGeometry";

export class Model extends GeometryRenderer {
  set geometryType(value: GeometryType) {
    if (this._geometryType === value) {
      return;
    }

    switch (value) {
      case "Sphere":
        const {
          sphereRadius,
          sphereHorizontalSegments,
          sphereVerticalSegments,
          sphereAlphaStart,
          sphereAlphaRange,
          sphereThetaStart,
          sphereThetaRange
        } = this._props as any;
        this.geometry = new SphereGeometry(
          sphereRadius,
          sphereHorizontalSegments,
          sphereVerticalSegments,
          sphereAlphaStart,
          sphereAlphaRange,
          sphereThetaStart,
          sphereThetaRange,
          this.engine
        );
        break;

      case "Cylinder":
        const {
          cylinderRadiusTop,
          cylinderRadiusBottom,
          cylinderHeight,
          cylinderRadialSegments,
          cylinderHeightSegments,
          cylinderOpenEnded
        } = this._props as any;
        this.geometry = new CylinderGeometry(
          cylinderRadiusTop,
          cylinderRadiusBottom,
          cylinderHeight,
          cylinderRadialSegments,
          cylinderHeightSegments,
          cylinderOpenEnded,
          undefined,
          undefined,
          undefined,
          this.engine
        );
        break;

      case "Plane":
        const { planeWidth, planeHeight, planeHorizontalSegments, planeVerticalSegments } = this._props as any;
        this.geometry = new PlaneGeometry(
          planeWidth,
          planeHeight,
          planeHorizontalSegments,
          planeVerticalSegments,
          this.engine
        );
        break;

      case "Box":
        var { boxWidth, boxHeight, boxDepth } = this._props as any;
        this.geometry = new CuboidGeometry(boxWidth, boxHeight, boxDepth, this.engine);
        break;
    }

    this._geometryType = value;
  }

  get geometryType() {
    return this._geometryType;
  }

  private _geometryType: GeometryType;

  constructor(entity: Entity, props) {
    super(entity, props);

    const { geometryType = GeometryType.Box } = props;
    if (!props.material) {
      this.material = new BlinnPhongMaterial("mtl");
    }
    this.geometryType = geometryType;
  }

  get material(): any {
    return this.material;
  }

  set material(mtl: any) {
    if (!mtl) {
      this.material = new BlinnPhongMaterial("mtl");
    } else {
      this.material = mtl;
    }
  }
}

enum GeometryType {
  Box = "Box",
  Cylinder = "Cylinder",
  Plane = "Plane",
  Sphere = "Sphere"
}
