import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ModelMesh,
  PrimitiveMesh,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.PrimitiveMesh, ["mesh"], false)
class PrimitiveMeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, { engine }): AssetPromise<ModelMesh> {
    return this.request<IPrimitiveMesh>(item.url, {
      ...item,
      type: "json"
    }).then((data) => {
      switch (data.type) {
        case PrimitiveMeshType.Sphere:
          return PrimitiveMesh.createSphere(engine, data.sphereRadius, data.sphereSegments);
        case PrimitiveMeshType.Capsule:
          return PrimitiveMesh.createCapsule(
            engine,
            data.capsuleRadius,
            data.capsuleHeight,
            data.capsuleRadialSegments,
            data.capsuleHeightSegments
          );
        case PrimitiveMeshType.Cone:
          return PrimitiveMesh.createCone(
            engine,
            data.coneRadius,
            data.coneHeight,
            data.coneRadialSegment,
            data.coneHeightSegment
          );
        case PrimitiveMeshType.Cuboid:
          return PrimitiveMesh.createCuboid(engine, data.cuboidWidth, data.cuboidHeight, data.cuboidDepth);
        case PrimitiveMeshType.Cylinder:
          return PrimitiveMesh.createCylinder(
            engine,
            data.cylinderRadiusTop,
            data.cylinderRadiusBottom,
            data.cylinderHeight,
            data.cylinderRadialSegment,
            data.cylinderHeightSegment
          );
        case PrimitiveMeshType.Plane:
          return PrimitiveMesh.createPlane(
            engine,
            data.planeWidth,
            data.planeHeight,
            data.planeHorizontalSegments,
            data.planeVerticalSegments
          );
        case PrimitiveMeshType.Torus:
          return PrimitiveMesh.createTorus(
            engine,
            data.torusRadius,
            data.torusTubeRadius,
            data.torusRadialSegments,
            data.torusTubularSegments,
            data.torusArc
          );
      }
    });
  }
}

enum PrimitiveMeshType {
  Sphere = "sphere",
  Cuboid = "cuboid",
  Plane = "plane",
  Cylinder = "cylinder",
  Torus = "torus",
  Cone = "cone",
  Capsule = "capsule"
}

type IPrimitiveMesh = {
  type: PrimitiveMeshType;
  sphereRadius: number;
  sphereSegments: number;
  capsuleRadius: number;
  capsuleHeight: number;
  capsuleRadialSegments: number;
  capsuleHeightSegments: number;
  coneRadius: number;
  coneHeight: number;
  coneRadialSegment: number;
  coneHeightSegment: number;
  cuboidWidth: number;
  cuboidHeight: number;
  cuboidDepth: number;
  cylinderRadiusTop: number;
  cylinderRadiusBottom: number;
  cylinderHeight: number;
  cylinderRadialSegment: number;
  cylinderHeightSegment: number;
  planeWidth: number;
  planeHeight: number;
  planeHorizontalSegments: number;
  planeVerticalSegments: number;
  torusRadius: number;
  torusTubeRadius: number;
  torusRadialSegments: number;
  torusTubularSegments: number;
  torusArc: number;
};
