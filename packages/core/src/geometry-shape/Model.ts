import { Entity } from "../Entity";
import { GeometryRenderer } from "../geometry/GeometryRenderer";
import { BlinnPhongMaterial } from "../mobile-material/BlinnPhongMaterial";
import { CuboidGeometry } from "./CuboidGeometry";
import { CylinderGeometry } from "./CylinderGeometry";
import { PlaneGeometry } from "./PlaneGeometry";
import { SphereGeometry } from "./SphereGeometry";

// 只给编辑器用 TODO
export class Model extends GeometryRenderer {
  private _props: any;
  private _geometryType: GeometryType;

  set geometryType(value: GeometryType) {
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
          this.engine,
          sphereRadius,
          sphereHorizontalSegments,
          sphereVerticalSegments,
          sphereAlphaStart,
          sphereAlphaRange,
          sphereThetaStart,
          sphereThetaRange
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
          this.engine,
          cylinderRadiusTop,
          cylinderRadiusBottom,
          cylinderHeight,
          cylinderRadialSegments,
          cylinderHeightSegments,
          cylinderOpenEnded,
          undefined,
          undefined,
          undefined
        );
        break;

      case "Plane":
        const { planeWidth, planeHeight, planeHorizontalSegments, planeVerticalSegments } = this._props as any;
        this.geometry = new PlaneGeometry(
          this.engine,
          planeWidth,
          planeHeight,
          planeHorizontalSegments,
          planeVerticalSegments
        );
        break;

      case "Box":
        var { boxWidth, boxHeight, boxDepth } = this._props as any;
        this.geometry = new CuboidGeometry(this.engine, boxWidth, boxHeight, boxDepth);
        break;
    }

    this._geometryType = value;
  }

  get geometryType() {
    return this._geometryType;
  }

  constructor(entity: Entity) {
    super(entity);
  }

  get material(): any {
    return this._material;
  }

  set material(mtl: any) {
    if (!mtl) {
      this._material = new BlinnPhongMaterial(this.engine, "mtl");
    } else {
      this._material = mtl;
    }
  }

  initProps(props: any) {
    this._props = props;

    const { geometryType = GeometryType.Box } = props;
    this.material = props.material;
    this.geometryType = geometryType;
  }

  setProp(key: string, value: any) {
    this._props[key] = value;

    if (key === "material") {
      this.material = value;
    } else {
      this.geometryType = this._props.geometryType;
    }
  }
}

enum GeometryType {
  Box = "Box",
  Cylinder = "Cylinder",
  Plane = "Plane",
  Sphere = "Sphere"
}
