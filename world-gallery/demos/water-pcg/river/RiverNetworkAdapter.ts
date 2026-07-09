/**
 * River-network to river-segment adapter.
 *
 * The render prototype still builds meshes from RiverConfig, while authoring is
 * moving toward RiverNetworkConfig. This adapter is the boundary between those
 * layers: it resolves segment defaults, clones mutable config, and returns one
 * renderable RiverConfig per directed network segment.
 */
import { RiverDebugMode, RiverPreviewStage } from "./constants";
import {
  RiverConfig,
  RiverCurveConfig,
  RiverDebugConfig,
  RiverFlowConfig,
  RiverMaterialConfig,
  RiverNetworkConfig,
  RiverPathControlPoint,
  RiverQualityConfig,
  RiverSegmentConfig,
  RiverShapeConfig,
  Vector3Tuple
} from "./types";

function cloneVector3Tuple(tuple: Vector3Tuple): Vector3Tuple {
  return [tuple[0], tuple[1], tuple[2]];
}

function cloneControlPoint(point: RiverPathControlPoint): RiverPathControlPoint {
  return {
    ...point,
    position: cloneVector3Tuple(point.position),
    in: point.in ? cloneVector3Tuple(point.in) : undefined,
    out: point.out ? cloneVector3Tuple(point.out) : undefined
  };
}

function cloneCurveConfig(config: RiverCurveConfig): RiverCurveConfig {
  return {
    mode: config.mode,
    segmentLength: config.segmentLength,
    points: config.points.map(cloneControlPoint)
  };
}

function cloneShapeConfig(config: RiverShapeConfig): RiverShapeConfig {
  return { ...config };
}

function cloneFlowConfig(config: RiverFlowConfig): RiverFlowConfig {
  return { ...config };
}

function cloneMaterialConfig(config: RiverMaterialConfig): RiverMaterialConfig {
  return { ...config };
}

function cloneQualityConfig(config: RiverQualityConfig): RiverQualityConfig {
  return { ...config };
}

function cloneDebugConfig(config: RiverDebugConfig): RiverDebugConfig {
  return { ...config };
}

function getDefaultDebugConfig(): RiverDebugConfig {
  return {
    previewStage: RiverPreviewStage.Full,
    mode: RiverDebugMode.Full,
    queryT: 0.5
  };
}

function resolveSegmentShape(network: RiverNetworkConfig, segment: RiverSegmentConfig): RiverShapeConfig {
  return {
    ...cloneShapeConfig(network.defaults.shape),
    ...segment.shape
  };
}

function resolveSegmentFlow(network: RiverNetworkConfig, segment: RiverSegmentConfig): RiverFlowConfig {
  return {
    ...cloneFlowConfig(network.defaults.flow),
    ...segment.flow
  };
}

function resolveSegmentMaterial(network: RiverNetworkConfig, segment: RiverSegmentConfig): RiverMaterialConfig {
  return {
    ...cloneMaterialConfig(network.defaults.material),
    ...segment.material
  };
}

export function createRiverConfigsFromNetwork(network: RiverNetworkConfig): RiverConfig[] {
  const debug = network.debug ? cloneDebugConfig(network.debug) : getDefaultDebugConfig();
  return network.segments.map((segment) => ({
    id: segment.id,
    path: cloneCurveConfig(segment.curve),
    shape: resolveSegmentShape(network, segment),
    flow: resolveSegmentFlow(network, segment),
    material: resolveSegmentMaterial(network, segment),
    quality: cloneQualityConfig(network.defaults.quality),
    debug: cloneDebugConfig(debug)
  }));
}
