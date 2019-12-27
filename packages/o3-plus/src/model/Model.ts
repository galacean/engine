import {
  AGeometryRenderer,
  SphereGeometry,
  CuboidGeometry,
  PlaneGeometry,
  CylinderGeometry,
  BlinnPhongMaterial,
  ConstantMaterial,
  LambertMaterial,
  TransparentMaterial,
  TextureMaterial,
  PBRMaterial
} from "@alipay/o3";

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
