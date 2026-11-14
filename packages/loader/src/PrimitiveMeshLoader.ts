import {
  AssetPromise,
  AssetType,
  Engine,
  LoadItem,
  Loader,
  ModelMesh,
  PolygonShape,
  PrimitiveMesh,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import type { PrimitiveMeshAsset, SerializedPrimitiveMeshOptions } from "./PrimitiveMeshAsset";

@resourceLoader(AssetType.PrimitiveMesh, ["mesh"], false)
class PrimitiveMeshLoader extends Loader<ModelMesh> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<ModelMesh> {
    return resourceManager
      ._request<PrimitiveMeshAsset>(item.url!, { ...item, type: "json" })
      .then((data) => this._createPrimitiveMesh(resourceManager.engine, data));
  }

  private _createPrimitiveMesh(engine: Engine, data: PrimitiveMeshAsset): ModelMesh {
    const { type } = data;
    switch (type) {
      case "sphere":
        return PrimitiveMesh.createSphere(engine, data.sphereRadius, this._parseRangeOptions(data.sphereOptions));
      case "cuboid":
        return PrimitiveMesh.createCuboid(
          engine,
          data.cuboidWidth,
          data.cuboidHeight,
          data.cuboidDepth,
          data.cuboidOptions
        );
      case "plane":
        return PrimitiveMesh.createPlane(engine, data.planeWidth, data.planeDepth, data.planeOptions);
      case "cylinder":
        return PrimitiveMesh.createCylinder(
          engine,
          data.cylinderRadius,
          data.cylinderHeight,
          this._parseRangeOptions(data.cylinderOptions)
        );
      case "truncatedCone":
        return PrimitiveMesh.createTruncatedCone(
          engine,
          data.truncatedConeTopRadius,
          data.truncatedConeBottomRadius,
          data.truncatedConeHeight,
          this._parseRangeOptions(data.truncatedConeOptions)
        );
      case "cone":
        return PrimitiveMesh.createCone(
          engine,
          data.coneRadius,
          data.coneHeight,
          this._parseRangeOptions(data.coneOptions)
        );
      case "capsule":
        return PrimitiveMesh.createCapsule(engine, data.capsuleRadius, data.capsuleCylinderHeight, data.capsuleOptions);
      case "torus":
        return PrimitiveMesh.createTorus(
          engine,
          data.torusRadius,
          data.torusTubeRadius,
          this._parseRangeOptions(data.torusOptions)
        );
      case "circle":
        return PrimitiveMesh.createCircle(engine, data.circleRadius, this._parseRangeOptions(data.circleOptions));
      case "ring":
        return PrimitiveMesh.createRing(
          engine,
          data.ringOuterRadius,
          data.ringInnerRadius,
          this._parseRangeOptions(data.ringOptions)
        );
      case "tetrahedron":
        return PrimitiveMesh.createTetrahedron(engine, data.tetrahedronRadius, data.tetrahedronOptions);
      case "octahedron":
        return PrimitiveMesh.createOctahedron(engine, data.octahedronRadius, data.octahedronOptions);
      case "icosahedron":
        return PrimitiveMesh.createIcosahedron(engine, data.icosahedronRadius, data.icosahedronOptions);
      case "dodecahedron":
        return PrimitiveMesh.createDodecahedron(engine, data.dodecahedronRadius, data.dodecahedronOptions);
      case "lathe":
        return PrimitiveMesh.createLathe(
          engine,
          this._parseVector2s(data.latheProfile),
          this._parseRangeOptions(data.latheOptions)
        );
      case "tube":
        return PrimitiveMesh.createTube(engine, this._parseVector3s(data.tubePath), data.tubeRadius, data.tubeOptions);
      case "polygon":
        return PrimitiveMesh.createPolygon(engine, this._parseShapes(data.polygonShapes), data.polygonOptions);
      case "extrudedPolygon":
        if ("extrudedPolygonPath" in data) {
          return PrimitiveMesh.createExtrudedPolygon(
            engine,
            this._parseShapes(data.extrudedPolygonShapes),
            this._parseVector3s(data.extrudedPolygonPath),
            data.extrudedPolygonOptions
          );
        }
        return PrimitiveMesh.createExtrudedPolygon(
          engine,
          this._parseShapes(data.extrudedPolygonShapes),
          data.extrudedPolygonDepth,
          data.extrudedPolygonOptions
        );
      case "torusKnot":
        return PrimitiveMesh.createTorusKnot(
          engine,
          data.torusKnotRadius,
          data.torusKnotTubeRadius,
          data.torusKnotAxisTurns,
          data.torusKnotCrossSectionTurns,
          data.torusKnotOptions
        );
      case "roundedCuboid":
        return PrimitiveMesh.createRoundedCuboid(
          engine,
          data.roundedCuboidWidth,
          data.roundedCuboidHeight,
          data.roundedCuboidDepth,
          data.roundedCuboidCornerRadius,
          data.roundedCuboidOptions
        );
      default: {
        const unsupportedType: never = type;
        throw new Error(`Unknown primitive mesh type: ${unsupportedType}`);
      }
    }
  }

  private _parseRangeOptions<T>(options: SerializedPrimitiveMeshOptions<T> | undefined): T | undefined {
    if (!options) {
      return;
    }
    const result = { ...options } as T;
    for (const key in options) {
      const value: unknown = options[key];
      if (value && typeof value === "object") {
        const range = value as { x: number; y: number };
        result[key] = new Vector2(range.x, range.y) as T[typeof key];
      }
    }
    return result;
  }

  private _parseVector2s(points: readonly { x: number; y: number }[]): Vector2[] {
    return points.map(({ x, y }) => new Vector2(x, y));
  }

  private _parseVector3s(points: readonly { x: number; y: number; z: number }[]): Vector3[] {
    return points.map(({ x, y, z }) => new Vector3(x, y, z));
  }

  private _parseShapes(shapes: Extract<PrimitiveMeshAsset, { type: "polygon" }>["polygonShapes"]): PolygonShape[] {
    return shapes.map(({ points, holes }) => ({
      points: this._parseVector2s(points),
      holes: holes?.map((hole) => this._parseVector2s(hole))
    }));
  }
}
