import { ContentRestorer } from "../asset/ContentRestorer";
import { Buffer } from "../graphic/Buffer";
import { ModelMesh } from "./ModelMesh";
import { PrimitiveMesh } from "./PrimitiveMesh";

/**
 * @internal
 */
export class PrimitiveMeshRestorer extends ContentRestorer<ModelMesh> {
  constructor(
    resource: ModelMesh,
    public primitiveInfo: PrimitiveRestoreInfo
  ) {
    super(resource);
  }

  override restoreContent(): void {
    const primitiveInfo = this.primitiveInfo;
    switch (primitiveInfo.type) {
      case PrimitiveType.Sphere:
        const sphereInfo = <SphereRestoreInfo>primitiveInfo;
        PrimitiveMesh._setSphereData(
          this.resource,
          sphereInfo.radius,
          sphereInfo.segments,
          sphereInfo.noLongerAccessible,
          true,
          sphereInfo.vertexBuffer
        );
        break;

      case PrimitiveType.CCSphere:
        const CCSphereInfo = <SubdivisionSurfaceSphereRestoreInfo>primitiveInfo;
        PrimitiveMesh._setSubdivisionSurfaceSphereData(
          this.resource,
          CCSphereInfo.radius,
          CCSphereInfo.step,
          CCSphereInfo.noLongerAccessible,
          true,
          CCSphereInfo.vertexBuffer
        );
        break;

      case PrimitiveType.Cuboid:
        const cuboidInfo = <CuboidRestoreInfo>primitiveInfo;
        PrimitiveMesh._setCuboidData(
          this.resource,
          cuboidInfo.width,
          cuboidInfo.height,
          cuboidInfo.depth,
          cuboidInfo.noLongerAccessible,
          true,
          cuboidInfo.vertexBuffer
        );
        break;
      case PrimitiveType.Plane:
        const planeInfo = <PlaneRestoreInfo>primitiveInfo;
        PrimitiveMesh._setPlaneData(
          this.resource,
          planeInfo.width,
          planeInfo.height,
          planeInfo.horizontalSegments,
          planeInfo.verticalSegments,
          planeInfo.noLongerAccessible,
          true,
          planeInfo.vertexBuffer
        );
        break;
      case PrimitiveType.Cylinder:
        const cylinderInfo = <CylinderRestoreInfo>primitiveInfo;
        PrimitiveMesh._setCylinderData(
          this.resource,
          cylinderInfo.radiusTop,
          cylinderInfo.radiusBottom,
          cylinderInfo.height,
          cylinderInfo.radialSegments,
          cylinderInfo.heightSegments,
          cylinderInfo.noLongerAccessible,
          true,
          cylinderInfo.vertexBuffer
        );
        break;
      case PrimitiveType.Torus:
        const torusInfo = <TorusRestoreInfo>primitiveInfo;
        PrimitiveMesh._setTorusData(
          this.resource,
          torusInfo.radius,
          torusInfo.tubeRadius,
          torusInfo.radialSegments,
          torusInfo.tubularSegments,
          torusInfo.arc,
          torusInfo.noLongerAccessible,
          true,
          torusInfo.vertexBuffer
        );
        break;
      case PrimitiveType.Cone:
        const coneInfo = <ConeRestoreInfo>primitiveInfo;
        PrimitiveMesh._setConeData(
          this.resource,
          coneInfo.radius,
          coneInfo.height,
          coneInfo.radialSegments,
          coneInfo.heightSegments,
          coneInfo.noLongerAccessible,
          true,
          coneInfo.vertexBuffer
        );
        break;
      case PrimitiveType.Capsule:
        const capsuleInfo = <CapsuleRestoreInfo>primitiveInfo;
        PrimitiveMesh._setCapsuleData(
          this.resource,
          capsuleInfo.radius,
          capsuleInfo.height,
          capsuleInfo.radialSegments,
          capsuleInfo.heightSegments,
          capsuleInfo.noLongerAccessible,
          true,
          capsuleInfo.vertexBuffer
        );
        break;
    }
  }
}

enum PrimitiveType {
  Sphere,
  Cuboid,
  Plane,
  Cylinder,
  Torus,
  Cone,
  Capsule,
  CCSphere
}

/**
 * @internal
 */
export class PrimitiveRestoreInfo {
  constructor(
    public type: PrimitiveType,
    public vertexBuffer: Buffer,
    public noLongerAccessible: boolean
  ) {}
}

/**
 * @internal
 */
export class SphereRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radius: number,
    public segments: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Sphere, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class SubdivisionSurfaceSphereRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radius: number,
    public step: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.CCSphere, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class CuboidRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public width: number,
    public height: number,
    public depth: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Cuboid, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class PlaneRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public width: number,
    public height: number,
    public horizontalSegments: number,
    public verticalSegments: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Plane, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class CylinderRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radiusTop: number,
    public radiusBottom: number,
    public height: number,
    public radialSegments: number,
    public heightSegments: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Cylinder, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class TorusRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radius: number,
    public tubeRadius: number,
    public radialSegments: number,
    public tubularSegments: number,
    public arc: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Torus, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class ConeRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radius: number,
    public height: number,
    public radialSegments: number,
    public heightSegments: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Cone, vertexBuffer, noLongerAccessible);
  }
}

/**
 * @internal
 */
export class CapsuleRestoreInfo extends PrimitiveRestoreInfo {
  constructor(
    public radius: number,
    public height: number,
    public radialSegments: number,
    public heightSegments: number,
    vertexBuffer: Buffer,
    noLongerAccessible: boolean
  ) {
    super(PrimitiveType.Capsule, vertexBuffer, noLongerAccessible);
  }
}
