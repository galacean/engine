import { AGeometryRenderer } from "@alipay/o3-geometry";
import { Node } from "@alipay/o3-core";
import { SphereGeometry } from "./Sphere";
import { CylinderGeometry } from "./Cylinder";
import { PlaneGeometry } from "./Plane";
import { CuboidGeometry } from "./Cuboid";
import { BlinnPhongMaterial } from "@alipay/o3-mobile-material";

export class Model extends AGeometryRenderer {
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
          cylinderRadiusTop,
          cylinderRadiusBottom,
          cylinderHeight,
          cylinderRadialSegments,
          cylinderHeightSegments,
          cylinderOpenEnded
        );
        break;

      case "Plane":
        const { planeWidth, planeHeight, planeHorizontalSegments, planeVerticalSegments } = this._props as any;
        this.geometry = new PlaneGeometry(planeWidth, planeHeight, planeHorizontalSegments, planeVerticalSegments);
        break;

      case "Box":
        var { boxWidth, boxHeight, boxDepth } = this._props as any;
        this.geometry = new CuboidGeometry(boxWidth, boxHeight, boxDepth);
        break;
    }

    this._geometryType = value;
  }

  get geometryType() {
    return this._geometryType;
  }

  private _geometryType: GeometryType;

  constructor(node: Node, props) {
    super(node, props);

    const { geometryType = GeometryType.Box } = props;
    if (!props.material) {
      this._material = new BlinnPhongMaterial("mtl");
    }
    this.geometryType = geometryType;
  }

  get material(): any {
    return this._material;
  }

  set material(mtl: any) {
    if (!mtl) {
      this._material = new BlinnPhongMaterial("mtl");
    } else {
      this._material = mtl;
    }
  }
}

enum GeometryType {
  Box = "Box",
  Cylinder = "Cylinder",
  Plane = "Plane",
  Sphere = "Sphere"
}
