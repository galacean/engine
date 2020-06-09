import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry } from "./Sphere";
import { CylinderGeometry } from "./Cylinder";
import { PlaneGeometry } from "./Plane";
import { CuboidGeometry } from "./Cuboid";
import {
  ConstantMaterial,
  LambertMaterial,
  TransparentMaterial,
  TextureMaterial,
  BlinnPhongMaterial
} from "@alipay/o3-mobile-material";
import { PBRMaterial } from "@alipay/o3-pbr";

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

  set materialType(value: MaterialType) {
    if (this.materialType === value) {
      return;
    }
    const clazz = this._materialMap[value];
    this.material = new (clazz as any)();
    this._materialType = value;
  }

  get materialType() {
    return this._materialType;
  }

  private _geometryType: GeometryType;
  private _materialType: MaterialType;
  private _geometryMap = {
    [GeometryType.Sphere]: SphereGeometry,
    [GeometryType.Cylinder]: CylinderGeometry,
    [GeometryType.Plane]: PlaneGeometry,
    [GeometryType.Box]: CuboidGeometry
  };

  private _materialMap = {
    [MaterialType.BlinnPhong]: BlinnPhongMaterial,
    [MaterialType.PBR]: PBRMaterial,
    [MaterialType.Constant]: ConstantMaterial,
    [MaterialType.Lambert]: LambertMaterial,
    [MaterialType.Transparent]: TransparentMaterial,
    [MaterialType.Texture]: TextureMaterial
  };

  constructor(node, props) {
    super(node, props);

    const { geometryType = GeometryType.Box } = props;

    if (!props.material) {
      this.materialType = MaterialType.BlinnPhong;
    }
    this.geometryType = geometryType;
  }
}

enum GeometryType {
  Box = "Box",
  Cylinder = "Cylinder",
  Plane = "Plane",
  Sphere = "Sphere"
}

enum MaterialType {
  BlinnPhong = "BlinnPhong",
  PBR = "PBR",
  Constant = "Constant",
  Lambert = "Lambert",
  Transparent = "Transparent",
  Texture = "Texture"
}
