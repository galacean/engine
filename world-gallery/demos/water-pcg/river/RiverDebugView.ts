/**
 * River debug visualization.
 *
 * River bugs are often geometric or authoring mistakes rather than hard runtime
 * failures: wrong tangents, flipped banks, poor sample density, stale query points,
 * or misleading flow direction. This file renders the internal water-system state
 * as centerlines, bank lines, flow arrows, and query markers. It gives the gallery
 * and future editor tooling a way to inspect the river pipeline without mixing
 * debug drawing into mesh generation, material code, or gameplay query logic.
 */
import { Color, Engine, Entity, MeshRenderer, UnlitMaterial, Vector3 } from "@galacean/engine";
import { RiverDebugMode, RIVER_MESH_OFFSET } from "./constants";
import { buildFlowArrowMesh, buildLineMesh, buildLineSegmentsMesh } from "./RiverMeshBuilder";
import { getPointAtRiverT, queryRiver } from "./WaterQuery";
import { RiverConfig, RiverQueryResult, RiverSamplePoint } from "./types";

function createDebugMaterial(engine: Engine, color: Color): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.baseColor = color;
  return material;
}

function createRenderer(entity: Entity, name: string, material: UnlitMaterial): MeshRenderer {
  const child = entity.createChild(name);
  const renderer = child.addComponent(MeshRenderer);
  renderer.setMaterial(material);
  return renderer;
}

export class RiverDebugView {
  private readonly _root: Entity;
  private readonly _controlPointRenderer: MeshRenderer;
  private readonly _centerLineRenderer: MeshRenderer;
  private readonly _bankLineRenderer: MeshRenderer;
  private readonly _arrowRenderer: MeshRenderer;
  private readonly _queryRenderer: MeshRenderer;

  constructor(engine: Engine, parent: Entity) {
    this._root = parent.createChild("river-debug-view");
    this._controlPointRenderer = createRenderer(
      this._root,
      "control-points",
      createDebugMaterial(engine, new Color(1, 0.54, 0.12, 1))
    );
    this._centerLineRenderer = createRenderer(
      this._root,
      "center-line",
      createDebugMaterial(engine, new Color(1, 0.92, 0.36, 1))
    );
    this._bankLineRenderer = createRenderer(
      this._root,
      "bank-lines",
      createDebugMaterial(engine, new Color(0.68, 1, 0.78, 1))
    );
    this._arrowRenderer = createRenderer(this._root, "flow-arrows", createDebugMaterial(engine, new Color(1, 1, 1, 1)));
    this._queryRenderer = createRenderer(
      this._root,
      "query-marker",
      createDebugMaterial(engine, new Color(1, 0.38, 0.22, 1))
    );
  }

  update(engine: Engine, config: RiverConfig, samples: RiverSamplePoint[]): RiverQueryResult {
    this._root.isActive = config.debug.mode !== RiverDebugMode.Off;

    const queryPosition = getPointAtRiverT(samples, config.debug.queryT);
    const queryResult = queryRiver(samples, queryPosition);
    if (config.debug.mode === RiverDebugMode.Off) {
      return queryResult;
    }

    const centerLine = samples.map(
      (sample) => new Vector3(sample.position.x, sample.position.y + RIVER_MESH_OFFSET.debug, sample.position.z)
    );
    this._centerLineRenderer.mesh = buildLineMesh(engine, centerLine, new Color(1, 0.92, 0.36, 1));
    this._controlPointRenderer.mesh = buildLineSegmentsMesh(
      engine,
      this._buildControlPointMarkers(config),
      new Color(1, 0.54, 0.12, 1)
    );

    if (config.debug.mode === RiverDebugMode.Banks || config.debug.mode === RiverDebugMode.Full) {
      this._bankLineRenderer.mesh = buildLineSegmentsMesh(
        engine,
        this._buildBankLineSegments(samples),
        new Color(0.68, 1, 0.78, 1)
      );
    }

    if (config.debug.mode === RiverDebugMode.Full) {
      this._arrowRenderer.mesh = buildFlowArrowMesh(engine, samples, 8, 2.2, new Color(1, 1, 1, 1));
    }

    this._bankLineRenderer.entity.isActive =
      config.debug.mode === RiverDebugMode.Banks || config.debug.mode === RiverDebugMode.Full;
    this._arrowRenderer.entity.isActive = config.debug.mode === RiverDebugMode.Full;
    this._queryRenderer.mesh = buildLineSegmentsMesh(
      engine,
      this._buildQueryMarker(queryPosition),
      new Color(1, 0.38, 0.22, 1)
    );

    return queryResult;
  }

  private _buildControlPointMarkers(config: RiverConfig): Vector3[] {
    const points: Vector3[] = [];
    const size = 0.9;

    for (let i = 0; i < config.path.points.length; i++) {
      const point = config.path.points[i];
      const x = point.position[0];
      const y = point.position[1] + RIVER_MESH_OFFSET.debug + 0.12;
      const z = point.position[2];

      points.push(
        new Vector3(x - size, y, z),
        new Vector3(x + size, y, z),
        new Vector3(x, y, z - size),
        new Vector3(x, y, z + size),
        new Vector3(x, y - size * 0.55, z),
        new Vector3(x, y + size * 0.55, z)
      );

      if (point.in) {
        points.push(new Vector3(x, y, z), new Vector3(x + point.in[0], y + point.in[1], z + point.in[2]));
      }

      if (point.out) {
        points.push(new Vector3(x, y, z), new Vector3(x + point.out[0], y + point.out[1], z + point.out[2]));
      }
    }

    return points;
  }

  private _buildBankLineSegments(samples: RiverSamplePoint[]): Vector3[] {
    const points: Vector3[] = [];
    const left: Vector3[] = [];
    const right: Vector3[] = [];

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const normal = new Vector3(-sample.tangent.z, 0, sample.tangent.x);
      const halfWidth = sample.width * 0.5;
      left.push(
        new Vector3(
          sample.position.x + normal.x * halfWidth,
          sample.position.y + RIVER_MESH_OFFSET.debug,
          sample.position.z + normal.z * halfWidth
        )
      );
      right.push(
        new Vector3(
          sample.position.x - normal.x * halfWidth,
          sample.position.y + RIVER_MESH_OFFSET.debug,
          sample.position.z - normal.z * halfWidth
        )
      );
    }

    for (let i = 1; i < samples.length; i++) {
      points.push(left[i - 1], left[i], right[i - 1], right[i]);
    }

    return points;
  }

  private _buildQueryMarker(position: Vector3): Vector3[] {
    const y = position.y + RIVER_MESH_OFFSET.debug + 0.08;
    const size = 1.15;
    return [
      new Vector3(position.x - size, y, position.z),
      new Vector3(position.x + size, y, position.z),
      new Vector3(position.x, y, position.z - size),
      new Vector3(position.x, y, position.z + size)
    ];
  }
}
