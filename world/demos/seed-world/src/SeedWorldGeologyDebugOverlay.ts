import {
  Camera,
  Color,
  type Engine,
  type Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PrimitiveMesh,
  Script,
  UnlitMaterial,
  Vector2,
  Vector3
} from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  sampleSeedWorldGeologyCurve,
  type SeedWorldGeologyLayout,
  type SeedWorldGeologyPoint
} from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import type { SeedWorldSpawnView } from "./SeedWorldSpawnSelection.ts";
import type { SeedWorldRockCompilation } from "./SeedWorldRockCompiler.ts";
import type { SeedWorldRockAcceptanceRequest } from "./SeedWorldRockAcceptance.ts";
import type { SeedWorldRockAssemblyRole, SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

const LINE_SURFACE_OFFSET_METRES = 10;
const WORLD_HALF_EXTENT_METRES = 1_536;

/** Debug-only 3D representation of the same geology layout rendered by the vector acceptance tabs. */
export class SeedWorldGeologyDebugOverlay {
  private readonly _engine: Engine;
  private readonly _camera: Camera;
  private readonly _root: Entity;
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: UnlitMaterial[] = [];
  private readonly _rockObbs = new Map<string, SeedWorldSolvedRockObb>();
  private readonly _rockObbEntities = new Map<string, Entity>();
  private readonly _rockObbMeshes = new Map<string, ModelMesh>();
  private readonly _rockLabelEntities = new Map<string, Entity>();
  private readonly _rockLabelLeaderEntities = new Map<string, Entity>();
  private _selectedRockObbEntity: Entity | undefined;
  private _selectedRockObbMesh: ModelMesh | undefined;
  private _selectedRockObbVolumeEntity: Entity | undefined;
  private _selectedRockObb: SeedWorldSolvedRockObb | undefined;
  private _deletedRockIds: ReadonlySet<string> = new Set();
  private _rockRequestRoot: Entity | undefined;
  private readonly _rockRequestMeshes: ModelMesh[] = [];
  private readonly _rockRequestMaterials: UnlitMaterial[] = [];

  /**
   * Builds terrain-following layout lines and arrows ten metres above Hfinal.
   * @param engine Engine owning diagnostic GPU resources.
   * @param camera Camera used to keep rock identifiers readable from every inspection angle.
   * @param parent Generated world root.
   * @param layout Shared deterministic geology layout.
   * @param fields Final Heightmap after Hydrology.
   * @param spawn Final post-Hydrology and post-Population spawn selection.
   * @param rocks Rock-compiler terrain evidence and final strict OBBs.
   */
  constructor(
    engine: Engine,
    camera: Camera,
    parent: Entity,
    layout: SeedWorldGeologyLayout,
    fields: SeedWorldFields,
    spawn: SeedWorldSpawnView,
    rocks?: SeedWorldRockCompilation
  ) {
    this._engine = engine;
    this._camera = camera;
    this._root = parent.createChild("Geology Layout Debug Overlay");
    this.addLines(
      engine,
      "Hill influence guides",
      [0.65, 0.91, 0.71, 1],
      layout.hills.map((hill) =>
        ellipseCurve(
          hill.center,
          hill.influenceRadiusMetres.major,
          hill.influenceRadiusMetres.minor,
          hill.rotationRadians
        )
      ),
      fields,
      32
    );
    this.addLines(
      engine,
      "Hill body guides",
      [0.91, 1, 0.88, 1],
      layout.hills.map((hill) =>
        ellipseCurve(hill.center, hill.bodyRadiusMetres.major, hill.bodyRadiusMetres.minor, hill.rotationRadians)
      ),
      fields,
      32
    );
    this.addLines(
      engine,
      "Uplift guides",
      [1, 0.45, 0.82, 1],
      layout.upliftBelts.map((belt) => belt.points),
      fields
    );
    this.addLines(
      engine,
      "Uplift direction arrows",
      [1, 0.4, 0.8, 1],
      layout.upliftBelts.flatMap((belt) =>
        arrowCurves(sampleSeedWorldGeologyCurve(belt.points, 0.5), sampleSeedWorldGeologyCurve(belt.points, 0.64), 42)
      ),
      fields,
      1
    );
    this.addLines(
      engine,
      "Canyon guides",
      [0.36, 0.89, 1, 1],
      layout.canyons.map((canyon) => canyon.points),
      fields
    );
    this.addLines(
      engine,
      "Road guides",
      [0.98, 0.73, 0.26, 1],
      layout.roads.map((road) => road.points),
      fields
    );
    const spawnPoint = Object.freeze({ x: spawn.position.x, z: spawn.position.z });
    this.addLines(engine, "Final spawn", [1, 0.32, 0.72, 1], [ellipseCurve(spawnPoint, 22, 22, 0)], fields, 32);
    this.addLines(
      engine,
      "Spawn view",
      [1, 0.82, 0.32, 1],
      arrowCurves(spawnPoint, Object.freeze({ x: spawn.target.x, z: spawn.target.z }), 42),
      fields,
      1
    );
    if (rocks) {
      this.addLines(
        engine,
        "Rock target shoulders and tip bearings",
        [1, 0.82, 0.2, 1],
        rocks.terrain.targets.flatMap((target) =>
          thickArrowCurves(
            Object.freeze({ x: target.shoulderFoot[0], z: target.shoulderFoot[2] }),
            Object.freeze({ x: target.crest[0], z: target.crest[2] }),
            26,
            4
          )
        ),
        fields,
        1
      );
      this.addRockObbs(engine, rocks.assemblies.rocks);
      this.addSelectedRockObb(engine, rocks.assemblies.rocks[0]);
      this.addRockLabels(engine, camera, fields, rocks.assemblies.rocks);
    }
  }

  /** Shows or hides the complete debug overlay without rebuilding its GPU resources. */
  setVisible(visible: boolean): void {
    this._root.isActive = visible;
  }

  /**
   * Shows only the selected rock OBB and updates it to the current acceptance preview.
   * @param rock Selected preview solve, or undefined to restore every compiled OBB.
   */
  setSelectedRockObb(rock: SeedWorldSolvedRockObb | undefined): void {
    this._selectedRockObb = rock;
    this.synchronizeRockVisibility();
    if (!rock || this._deletedRockIds.has(rock.id)) return;
    if (this._selectedRockObbMesh) updateRockObbMesh(this._selectedRockObbMesh, rock);
    this._selectedRockObbVolumeEntity?.transform.setPosition(...rock.obbCenter);
    this._selectedRockObbVolumeEntity?.transform.setRotationQuaternion(...rock.obbRotationQuaternion);
    this._selectedRockObbVolumeEntity?.transform.setScale(...rock.obbSizeMetres);
  }

  /** Hides rejected compiled OBBs and their world-space labels. */
  setDeletedRockIds(rockIds: ReadonlySet<string>): void {
    this._deletedRockIds = new Set(rockIds);
    this.synchronizeRockVisibility();
  }

  /** Rebuilds acceptance-only A-number markers at requested final-Heightmap points. */
  setRockRequestMarkers(requests: readonly SeedWorldRockAcceptanceRequest[]): void {
    this.destroyRockRequestMarkers();
    if (requests.length === 0) return;
    const root = this._root.createChild("Missing rock requests");
    this._rockRequestRoot = root;
    const canvas = root.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.WorldSpace;
    canvas.renderCamera = this._camera;
    canvas.referenceResolutionPerUnit = 100;
    canvas.sortOrder = 42;
    for (const request of requests) {
      this.addRockRequestMarker(root, request);
    }
  }

  /** Releases every debug-only entity, mesh, and material. */
  destroy(): void {
    this.destroyRockRequestMarkers();
    this._root.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._materials) material.destroy();
  }

  private synchronizeRockVisibility(): void {
    const selected = this._selectedRockObb;
    const selectedVisible = Boolean(selected && !this._deletedRockIds.has(selected.id));
    for (const [rockId, entity] of this._rockObbEntities) {
      entity.isActive = !this._deletedRockIds.has(rockId) && !selectedVisible;
    }
    for (const [rockId, entity] of this._rockLabelEntities) {
      entity.isActive = !this._deletedRockIds.has(rockId) && (!selectedVisible || rockId === selected?.id);
    }
    for (const [rockId, entity] of this._rockLabelLeaderEntities) {
      entity.isActive = !this._deletedRockIds.has(rockId) && (!selectedVisible || rockId === selected?.id);
    }
    if (this._selectedRockObbEntity) this._selectedRockObbEntity.isActive = selectedVisible;
    if (this._selectedRockObbVolumeEntity) this._selectedRockObbVolumeEntity.isActive = selectedVisible;
  }

  private addRockRequestMarker(root: Entity, request: SeedWorldRockAcceptanceRequest): void {
    const [x, y, z] = request.position;
    const radius = 13;
    const baseY = y + 3;
    const topY = baseY + 34;
    const positions = [
      new Vector3(x - radius, baseY, z),
      new Vector3(x + radius, baseY, z),
      new Vector3(x, baseY, z - radius),
      new Vector3(x, baseY, z + radius),
      new Vector3(x, baseY, z),
      new Vector3(x, topY, z),
      new Vector3(x - radius, baseY, z),
      new Vector3(x, baseY + 8, z + radius),
      new Vector3(x, baseY + 8, z + radius),
      new Vector3(x + radius, baseY, z),
      new Vector3(x + radius, baseY, z),
      new Vector3(x, baseY + 8, z - radius),
      new Vector3(x, baseY + 8, z - radius),
      new Vector3(x - radius, baseY, z)
    ];
    const mesh = new ModelMesh(this._engine, `Missing rock request ${request.id}`);
    mesh.setPositions(positions);
    mesh.setUVs(positions.map(() => new Vector2()));
    mesh.setIndices(new Uint16Array(positions.map((_, index) => index)));
    mesh.addSubMesh(0, positions.length, MeshTopology.Lines);
    updateBounds(mesh, positions);
    mesh.uploadData(false);
    const material = new UnlitMaterial(this._engine);
    material.name = `Missing rock request ${request.id}`;
    material.baseColor = new Color(1, 0.28, 0.12, 1);
    const entity = root.createChild(`Missing rock request ${request.id}`);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.castShadows = false;
    renderer.priority = 110;
    this._rockRequestMeshes.push(mesh);
    this._rockRequestMaterials.push(material);
    const labelEntity = root.createChild(request.id);
    const text = labelEntity.addComponent(Text);
    const transform = labelEntity.transform as UITransform;
    transform.setPosition(x, topY + 5, z);
    transform.setScale(0.18, 0.18, 0.18);
    transform.size.set(150, 54);
    text.text = request.id;
    text.fontSize = 48;
    text.color = new Color(1, 0.42, 0.2, 1);
    labelEntity.addComponent(RockLabelFacingCamera).camera = this._camera;
  }

  private destroyRockRequestMarkers(): void {
    this._rockRequestRoot?.destroy();
    this._rockRequestRoot = undefined;
    for (const mesh of this._rockRequestMeshes.splice(0)) mesh.destroy(true);
    for (const material of this._rockRequestMaterials.splice(0)) material.destroy();
  }

  private addLines(
    engine: Engine,
    name: string,
    color: readonly [number, number, number, number],
    curves: readonly (readonly SeedWorldGeologyPoint[])[],
    fields: SeedWorldFields,
    samples = 72
  ): void {
    const positions: Vector3[] = [];
    for (const curve of curves) appendCurveLines(curve, fields, positions, samples);
    if (positions.length === 0) return;
    this.addMesh(
      engine,
      name,
      color,
      positions,
      positions.map((_, index) => index),
      MeshTopology.Lines,
      false
    );
  }

  private addMesh(
    engine: Engine,
    name: string,
    color: readonly [number, number, number, number],
    positions: Vector3[],
    indices: number[],
    topology: MeshTopology,
    transparent: boolean
  ): readonly [Entity, ModelMesh] {
    const mesh = new ModelMesh(engine, name);
    mesh.setPositions(positions);
    mesh.setUVs(positions.map(() => new Vector2()));
    mesh.setIndices(positions.length > 65_535 ? new Uint32Array(indices) : new Uint16Array(indices));
    mesh.clearSubMesh();
    mesh.addSubMesh(0, indices.length, topology);
    updateBounds(mesh, positions);
    mesh.uploadData(false);
    const material = new UnlitMaterial(engine);
    material.name = name;
    material.baseColor = new Color(...color);
    material.isTransparent = transparent;
    const entity = this._root.createChild(name);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.castShadows = false;
    renderer.priority = transparent ? 6 : 7;
    this._meshes.push(mesh);
    this._materials.push(material);
    return [entity, mesh];
  }

  private addRockObbs(engine: Engine, rocks: readonly SeedWorldSolvedRockObb[]): void {
    const roleColors: Readonly<Record<SeedWorldRockAssemblyRole, readonly [number, number, number, number]>> = {
      primary: [0.31, 0.87, 1, 1],
      "upper-stack": [1, 0.83, 0.24, 1],
      "shoulder-fill": [1, 0.42, 0.86, 1],
      "depth-layer": [0.45, 1, 0.54, 1]
    };
    for (const [index, rock] of rocks.entries()) {
      const positions: Vector3[] = [];
      appendRockObbLines(rock, positions);
      const [entity, mesh] = this.addMesh(
        engine,
        `Rock OBB · ${formatRockLabel(index)} · ${rock.role}`,
        roleColors[rock.role],
        positions,
        positions.map((_, index) => index),
        MeshTopology.Lines,
        false
      );
      this._rockObbs.set(rock.id, rock);
      this._rockObbEntities.set(rock.id, entity);
      this._rockObbMeshes.set(rock.id, mesh);
    }
  }

  private addSelectedRockObb(engine: Engine, rock: SeedWorldSolvedRockObb | undefined): void {
    if (!rock) return;
    const positions: Vector3[] = [];
    appendRockObbLines(rock, positions);
    const [entity, mesh] = this.addMesh(
      engine,
      "Selected rock OBB",
      [1, 0.3, 0.05, 1],
      positions,
      positions.map((_, index) => index),
      MeshTopology.Lines,
      false
    );
    entity.getComponent(MeshRenderer)!.priority = 100;
    entity.isActive = false;
    this._selectedRockObbEntity = entity;
    this._selectedRockObbMesh = mesh;

    const volumeEntity = this._root.createChild("Selected rock OBB volume");
    const volumeMesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, false);
    const volumeMaterial = new UnlitMaterial(engine);
    volumeMaterial.name = "Selected rock OBB translucent volume";
    volumeMaterial.baseColor = new Color(1, 0.24, 0.03, 0.1);
    volumeMaterial.isTransparent = true;
    const volumeRenderer = volumeEntity.addComponent(MeshRenderer);
    volumeRenderer.mesh = volumeMesh;
    volumeRenderer.setMaterial(volumeMaterial);
    volumeRenderer.castShadows = false;
    volumeRenderer.priority = 99;
    volumeEntity.isActive = false;
    this._meshes.push(volumeMesh);
    this._materials.push(volumeMaterial);
    this._selectedRockObbVolumeEntity = volumeEntity;
  }

  private addRockLabels(
    engine: Engine,
    camera: Camera,
    fields: SeedWorldFields,
    rocks: readonly SeedWorldSolvedRockObb[]
  ): void {
    const canvasRoot = this._root.createChild("Rock OBB identifiers");
    const canvas = canvasRoot.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.WorldSpace;
    canvas.renderCamera = camera;
    canvas.referenceResolutionPerUnit = 100;
    canvas.sortOrder = 40;
    rocks.forEach((rock, index) => {
      const label = formatRockLabel(index);
      const obbTop = measureRockObbWorldMaximumY(rock);
      const terrainTop = sampleSeedWorldHeight(fields, rock.obbCenter[0], rock.obbCenter[2]) ?? obbTop;
      const leaderBottom = Math.max(obbTop, terrainTop + 3);
      const labelY = leaderBottom + Math.max(8, rock.obbSizeMetres[1] * 0.08);
      const leaderPositions = [
        new Vector3(rock.obbCenter[0], leaderBottom, rock.obbCenter[2]),
        new Vector3(rock.obbCenter[0], labelY - 1, rock.obbCenter[2])
      ];
      const entity = canvasRoot.createChild(`${label} · ${rock.id}`);
      const text = entity.addComponent(Text);
      const transform = entity.transform as UITransform;
      transform.setPosition(rock.obbCenter[0], labelY, rock.obbCenter[2]);
      transform.setScale(0.16, 0.16, 0.16);
      transform.size.set(160, 56);
      text.text = label;
      text.fontSize = 48;
      text.color = new Color(1, 0.9, 0.2, 1);
      entity.addComponent(RockLabelFacingCamera).camera = camera;
      this._rockLabelEntities.set(rock.id, entity);
      const [leaderEntity] = this.addMesh(
        engine,
        `Rock OBB identifier leader · ${label}`,
        [1, 0.9, 0.2, 1],
        leaderPositions,
        leaderPositions.map((_, index) => index),
        MeshTopology.Lines,
        false
      );
      this._rockLabelLeaderEntities.set(rock.id, leaderEntity);
    });
  }
}

function formatRockLabel(index: number): string {
  return `P${String(index + 1).padStart(2, "0")}`;
}

function measureRockObbWorldMaximumY(rock: SeedWorldSolvedRockObb): number {
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let bits = 0; bits < 8; bits++) {
    const local = Object.freeze([
      (bits & 1 ? 1 : -1) * rock.obbSizeMetres[0] * 0.5,
      (bits & 2 ? 1 : -1) * rock.obbSizeMetres[1] * 0.5,
      (bits & 4 ? 1 : -1) * rock.obbSizeMetres[2] * 0.5
    ] as const);
    maximumY = Math.max(maximumY, rock.obbCenter[1] + rotateVectorByQuaternion(local, rock.obbRotationQuaternion)[1]);
  }
  return maximumY;
}

class RockLabelFacingCamera extends Script {
  camera: Camera | null = null;

  override onLateUpdate(): void {
    if (!this.camera) return;
    this.entity.transform.lookAt(this.camera.entity.transform.worldPosition);
    this.entity.transform.rotate(0, 180, 0);
  }
}

function appendRockObbLines(rock: SeedWorldSolvedRockObb, output: Vector3[]): void {
  const corners = Array.from({ length: 8 }, (_, bits) => {
    const local = Object.freeze([
      (bits & 1 ? 1 : -1) * rock.obbSizeMetres[0] * 0.5,
      (bits & 2 ? 1 : -1) * rock.obbSizeMetres[1] * 0.5,
      (bits & 4 ? 1 : -1) * rock.obbSizeMetres[2] * 0.5
    ] as const);
    const rotated = rotateVectorByQuaternion(local, rock.obbRotationQuaternion);
    return new Vector3(rock.obbCenter[0] + rotated[0], rock.obbCenter[1] + rotated[1], rock.obbCenter[2] + rotated[2]);
  });
  for (const [start, end] of [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7]
  ] as const) {
    output.push(corners[start]!, corners[end]!);
  }
}

function updateRockObbMesh(mesh: ModelMesh, rock: SeedWorldSolvedRockObb): void {
  const positions: Vector3[] = [];
  appendRockObbLines(rock, positions);
  mesh.setPositions(positions);
  updateBounds(mesh, positions);
  mesh.uploadData(false);
}

function rotateVectorByQuaternion(
  vector: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const axis = Object.freeze([quaternion[0], quaternion[1], quaternion[2]] as const);
  const uv = cross3(axis, vector);
  const uuv = cross3(axis, uv);
  return Object.freeze([
    vector[0] + 2 * (uv[0] * quaternion[3] + uuv[0]),
    vector[1] + 2 * (uv[1] * quaternion[3] + uuv[1]),
    vector[2] + 2 * (uv[2] * quaternion[3] + uuv[2])
  ] as const);
}

function cross3(left: readonly number[], right: readonly number[]): readonly [number, number, number] {
  return Object.freeze([
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!
  ] as const);
}

function appendCurveLines(
  points: readonly SeedWorldGeologyPoint[],
  fields: SeedWorldFields,
  output: Vector3[],
  samples: number
): void {
  let previousPoint = sampleSeedWorldGeologyCurve(points, 0);
  for (let ordinal = 1; ordinal <= samples; ordinal++) {
    const currentPoint = sampleSeedWorldGeologyCurve(points, ordinal / samples);
    if (isInsideWorld(previousPoint) && isInsideWorld(currentPoint)) {
      output.push(
        sampleOverlayPoint(previousPoint, fields, LINE_SURFACE_OFFSET_METRES),
        sampleOverlayPoint(currentPoint, fields, LINE_SURFACE_OFFSET_METRES)
      );
    }
    previousPoint = currentPoint;
  }
}

function ellipseCurve(
  center: SeedWorldGeologyPoint,
  majorRadiusMetres: number,
  minorRadiusMetres: number,
  rotationRadians: number
): readonly SeedWorldGeologyPoint[] {
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const sectors = 32;
  return Object.freeze(
    Array.from({ length: sectors + 1 }, (_, ordinal) => {
      const angle = (ordinal / sectors) * Math.PI * 2;
      const localX = Math.cos(angle) * majorRadiusMetres;
      const localZ = Math.sin(angle) * minorRadiusMetres;
      return Object.freeze({
        x: center.x + localX * cosine - localZ * sine,
        z: center.z + localX * sine + localZ * cosine
      });
    })
  );
}

function arrowCurves(
  start: SeedWorldGeologyPoint,
  end: SeedWorldGeologyPoint,
  headLengthMetres: number
): readonly (readonly SeedWorldGeologyPoint[])[] {
  const angle = Math.atan2(end.z - start.z, end.x - start.x);
  const left = Object.freeze({
    x: end.x - Math.cos(angle - Math.PI / 6) * headLengthMetres,
    z: end.z - Math.sin(angle - Math.PI / 6) * headLengthMetres
  });
  const right = Object.freeze({
    x: end.x - Math.cos(angle + Math.PI / 6) * headLengthMetres,
    z: end.z - Math.sin(angle + Math.PI / 6) * headLengthMetres
  });
  return Object.freeze([Object.freeze([start, end]), Object.freeze([end, left]), Object.freeze([end, right])]);
}

function thickArrowCurves(
  start: SeedWorldGeologyPoint,
  end: SeedWorldGeologyPoint,
  headLengthMetres: number,
  halfWidthMetres: number
): readonly (readonly SeedWorldGeologyPoint[])[] {
  const length = Math.max(1e-9, Math.hypot(end.x - start.x, end.z - start.z));
  const normalX = -(end.z - start.z) / length;
  const normalZ = (end.x - start.x) / length;
  return Object.freeze(
    [-1, -0.5, 0, 0.5, 1].flatMap((ratio) => {
      const offset = ratio * halfWidthMetres;
      return arrowCurves(
        Object.freeze({ x: start.x + normalX * offset, z: start.z + normalZ * offset }),
        Object.freeze({ x: end.x + normalX * offset, z: end.z + normalZ * offset }),
        headLengthMetres
      );
    })
  );
}

function sampleOverlayPoint(point: SeedWorldGeologyPoint, fields: SeedWorldFields, offsetMetres: number): Vector3 {
  const worldX = Math.max(-WORLD_HALF_EXTENT_METRES, Math.min(WORLD_HALF_EXTENT_METRES, point.x));
  const worldZ = Math.max(-WORLD_HALF_EXTENT_METRES, Math.min(WORLD_HALF_EXTENT_METRES, point.z));
  return new Vector3(worldX, (sampleSeedWorldHeight(fields, worldX, worldZ) ?? 0) + offsetMetres, worldZ);
}

function isInsideWorld(point: SeedWorldGeologyPoint): boolean {
  return Math.abs(point.x) <= WORLD_HALF_EXTENT_METRES && Math.abs(point.z) <= WORLD_HALF_EXTENT_METRES;
}

function updateBounds(mesh: ModelMesh, positions: readonly Vector3[]): void {
  const { min, max } = mesh.bounds;
  min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const point of positions) {
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
}
