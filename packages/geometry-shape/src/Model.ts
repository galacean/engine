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
    const clazz = this._geometryMap[value];
    this.geometry = new (clazz as any)();
    this._geometryType = value;
  }

  get geometryType() {
    return this._geometryType;
  }

  private _geometryType: GeometryType;
  private _geometryMap = {
    [GeometryType.Sphere]: SphereGeometry,
    [GeometryType.Cylinder]: CylinderGeometry,
    [GeometryType.Plane]: PlaneGeometry,
    [GeometryType.Box]: CuboidGeometry
  };

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
