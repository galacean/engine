import {
  Color,
  type Engine,
  type Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  UnlitMaterial,
  Vector2,
  Vector3
} from "@galacean/engine";
import type { TerrainProjectDocument } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { sampleTerrainDocumentHeight } from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";

const EDGE_SAMPLE_SPACING_METRES = 24;
const SURFACE_OFFSET_METRES = 0.35;

/** Demo-local wire view that exposes canonical Region boundaries without changing terrain data. */
export class TerrainEditorRegionBoundaryView {
  private readonly _root: Entity;
  private readonly _mesh: ModelMesh;
  private readonly _material: UnlitMaterial;

  /**
   * Builds terrain-following Region edge lines from canonical documents.
   * @param engine Engine owning the preview Scene.
   * @param parent Parent entity used only for editor diagnostics.
   * @param documents Loaded canonical Region documents.
   */
  constructor(engine: Engine, parent: Entity, documents: readonly Readonly<TerrainProjectDocument>[]) {
    this._root = parent.createChild("Region boundaries");
    this._material = new UnlitMaterial(engine);
    this._material.baseColor = new Color(0.38, 0.9, 0.75, 1);
    this._mesh = buildRegionBoundaryMesh(engine, documents);
    const renderer = this._root.addComponent(MeshRenderer);
    renderer.mesh = this._mesh;
    renderer.setMaterial(this._material);
    this._root.isActive = false;
  }

  /** @returns Whether Region boundary lines are currently visible. */
  get visible(): boolean {
    return this._root.isActive;
  }

  /**
   * Shows or hides every canonical Region boundary.
   * @param visible Whether the editor diagnostic should render.
   * @returns Nothing.
   */
  setVisible(visible: boolean): void {
    this._root.isActive = visible;
  }

  /** Releases the editor-only entity, mesh, and material. */
  destroy(): void {
    this._root.destroy();
    this._mesh.destroy(true);
    this._material.destroy();
  }
}

function buildRegionBoundaryMesh(engine: Engine, documents: readonly Readonly<TerrainProjectDocument>[]): ModelMesh {
  const positions: Vector3[] = [];
  for (const document of documents) appendDocumentEdges(document, positions);
  const mesh = new ModelMesh(engine);
  mesh.setPositions(positions);
  mesh.setUVs(positions.map(() => new Vector2()));
  const indices = positions.map((_, index) => index);
  mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  mesh.clearSubMesh();
  mesh.addSubMesh(0, indices.length, MeshTopology.Lines);
  updateBounds(mesh, positions);
  mesh.uploadData(false);
  return mesh;
}

function appendDocumentEdges(document: Readonly<TerrainProjectDocument>, output: Vector3[]): void {
  const [originX, , originZ] = document.descriptor.worldPosition;
  const [extentX, , extentZ] = document.descriptor.worldSize;
  appendEdge(document, originX, originZ, originX + extentX, originZ, output);
  appendEdge(document, originX + extentX, originZ, originX + extentX, originZ + extentZ, output);
  appendEdge(document, originX + extentX, originZ + extentZ, originX, originZ + extentZ, output);
  appendEdge(document, originX, originZ + extentZ, originX, originZ, output);
}

function appendEdge(
  document: Readonly<TerrainProjectDocument>,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  output: Vector3[]
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(endX - startX, endZ - startZ) / EDGE_SAMPLE_SPACING_METRES));
  let previous = sampleEdgePoint(document, startX, startZ);
  for (let step = 1; step <= steps; step++) {
    const factor = step / steps;
    const current = sampleEdgePoint(document, startX + (endX - startX) * factor, startZ + (endZ - startZ) * factor);
    output.push(previous, current);
    previous = current;
  }
}

function sampleEdgePoint(document: Readonly<TerrainProjectDocument>, worldX: number, worldZ: number): Vector3 {
  const height = sampleTerrainDocumentHeight(document, worldX, worldZ);
  if (height === null) throw new Error("Terrain editor Region edge is outside its canonical heightfield");
  return new Vector3(worldX, height + SURFACE_OFFSET_METRES, worldZ);
}

function updateBounds(mesh: ModelMesh, positions: readonly Vector3[]): void {
  const { min, max } = mesh.bounds;
  if (positions.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
    return;
  }
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
