import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry } from "./Sphere";
import { CylinderGeometry } from "./Cylinder";
import { PlaneGeometry } from "./Plane";
import { CuboidGeometry } from "./Cuboid";
import { BlinnPhongMaterial } from "@alipay/o3-mobile-material";
import { Material } from "@alipay/o3-material/types/Material";

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

  constructor(node, props) {
    super(node, props);

    const { geometryType = GeometryType.Box } = props;
    if (!props.material) {
      this.material = new BlinnPhongMaterial("mtl");
    }
    this.geometryType = geometryType;
  }

  get material(): Material {
    return this._material;
  }

  set material(mtl) {
    if (!mtl) {
      this.material = new BlinnPhongMaterial("mtl");
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
