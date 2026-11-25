import { Color, type Engine, Entity, Matrix, ModelMesh, PrimitiveMesh, Vector2, Vector3 } from "@galacean/engine";
import { destroyOwnedMesh, destroyOwnedMeshSet } from "@galacean/engine-modify/geometry/destroyOwnedMesh";
import { buildHarvestProduce } from "./HarvestProduceShape";
import { createWheatProduceGeometry } from "./WheatProduceGeometry";

interface PrimitiveGeometry {
  positions: Vector3[];
  normals: Vector3[];
  indices: number[];
  colors?: readonly (readonly [number, number, number])[];
  revealRange?: readonly [minimum: number, height: number];
}
let templates: ReadonlyMap<string, PrimitiveGeometry> | undefined;
let sizeTemplates: ReadonlyMap<string, readonly Vector3[]> | undefined;

/** Pure-CPU primitive hulls for bounding-box sizing without creating or uploading any GPU ModelMesh. */
function produceSizeTemplates(): ReadonlyMap<string, readonly Vector3[]> {
  if (sizeTemplates) return sizeTemplates;
  const result = new Map<string, readonly Vector3[]>();
  const spherePoints: Vector3[] = [new Vector3(0, 0.5, 0), new Vector3(0, -0.5, 0)];
  const latBands = 6;
  const lonBands = 12;
  for (let lat = 1; lat < latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon < lonBands; lon++) {
      const phi = (lon * Math.PI * 2) / lonBands;
      spherePoints.push(new Vector3(0.5 * sinTheta * Math.cos(phi), 0.5 * cosTheta, 0.5 * sinTheta * Math.sin(phi)));
    }
  }
  result.set("sphere", spherePoints);
  const conePoints: Vector3[] = [new Vector3(0, 0.5, 0)];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI + (i * Math.PI * 2) / 6;
    conePoints.push(new Vector3(0.5 * Math.sin(angle), -0.5, 0.5 * Math.cos(angle)));
  }
  result.set("cone", conePoints);
  const strawPoints: Vector3[] = [];
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) strawPoints.push(new Vector3(x, y, z));
  result.set("straw", strawPoints);
  result.set("grain", [
    new Vector3(0.5, 0, 0),
    new Vector3(-0.5, 0, 0),
    new Vector3(0, 0.5, 0),
    new Vector3(0, -0.5, 0),
    new Vector3(0, 0, 0.5),
    new Vector3(0, 0, -0.5)
  ]);
  const wheat = createWheatProduceGeometry();
  result.set(
    "wheat sheaf",
    wheat.positions.map((p) => new Vector3(...p))
  );
  sizeTemplates = result;
  return result;
}

function producePieceKind(name: string, cone: boolean): string {
  return name === "wheat sheaf"
    ? name
    : name === "straw" || name === "stem" || name === "stalk"
      ? "straw"
      : name === "grain" || name === "seed"
        ? "grain"
        : cone
          ? "cone"
          : "sphere";
}

/** Measure a crop unit's local bounding dimensions on CPU without allocating or uploading GPU buffers. */
export function measureHarvestProduceSize(
  engine: Engine,
  cropId: string,
  warehouse = true
): readonly [number, number, number] {
  const hulls = produceSizeTemplates();
  const root = new Entity(engine, "produce-size-template");
  const pieces: { entity: Entity; points: readonly Vector3[] }[] = [];
  try {
    if (warehouse) root.transform.setRotation(cropId === "wheat" || cropId === "rice" ? 0 : -90, 0, 0);
    buildHarvestProduce(root, cropId, 1, (name, position, size, _rgb, _delay = 0, cone = false) => {
      const entity = root.createChild(name);
      entity.transform.setPosition(position[0], position[1], position[2]);
      entity.transform.setRotation(90, 0, 0);
      entity.transform.setScale(size[0], size[1], size[2]);
      pieces.push({ entity, points: hulls.get(producePieceKind(name, cone))! });
      return entity;
    });
    const minimum = new Vector3(Infinity, Infinity, Infinity),
      maximum = new Vector3(-Infinity, -Infinity, -Infinity),
      transformed = new Vector3();
    for (const piece of pieces) {
      const matrix = piece.entity.transform.worldMatrix;
      for (const point of piece.points) {
        Vector3.transformCoordinate(point, matrix, transformed);
        Vector3.min(minimum, transformed, minimum);
        Vector3.max(maximum, transformed, maximum);
      }
    }
    return [maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z];
  } finally {
    root.destroy();
  }
}

/** CPU-only templates survive engine changes; no cached Entity, Material or GPU allocation. */
function produceTemplates(engine: Engine): ReadonlyMap<string, PrimitiveGeometry> {
  if (templates) return templates;
  const meshes = new Map<string, ModelMesh>();
  try {
    meshes.set("sphere", PrimitiveMesh.createSphere(engine, 0.5, { subdivisionLevel: 2, keepMeshData: true }));
    meshes.set(
      "cone",
      PrimitiveMesh.createCone(engine, 0.5, 1, { radialSegments: 6, heightSegments: 1, keepMeshData: true })
    );
    meshes.set("straw", PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true }));
    const grain = new ModelMesh(engine, "Produce grain template");
    meshes.set("grain", grain);
    const points = [
      new Vector3(0.5, 0, 0),
      new Vector3(-0.5, 0, 0),
      new Vector3(0, 0.5, 0),
      new Vector3(0, -0.5, 0),
      new Vector3(0, 0, 0.5),
      new Vector3(0, 0, -0.5)
    ];
    grain.setPositions(points);
    grain.setNormals(points.map((p) => p.clone().normalize()));
    grain.setIndices(new Uint16Array([2, 4, 0, 2, 1, 4, 2, 5, 1, 2, 0, 5, 3, 0, 4, 3, 4, 1, 3, 1, 5, 3, 5, 0]));
    const result = new Map<string, PrimitiveGeometry>();
    for (const [name, mesh] of meshes)
      result.set(name, {
        positions: mesh.getPositions()!.map((p) => p.clone()),
        normals: mesh.getNormals()!.map((p) => p.clone()),
        indices: Array.from(mesh.getIndices()!)
      });
    const wheat = createWheatProduceGeometry();
    const minimumY = Math.min(...wheat.positions.map((p) => p[1]));
    const maximumY = Math.max(...wheat.positions.map((p) => p[1]));
    result.set("wheat sheaf", {
      positions: wheat.positions.map((p) => new Vector3(...p)),
      normals: wheat.normals.map((n) => new Vector3(...n)),
      indices: wheat.indices,
      colors: wheat.colors,
      revealRange: [minimumY, maximumY - minimumY]
    });
    templates = result;
    return result;
  } finally {
    destroyOwnedMeshSet(meshes.values());
  }
}

/** One merged batch. UV0 stores original piece height/delay; UV1 preserves its local reveal noise coordinates. */
export function createHarvestProduceMesh(engine: Engine, cropId: string, count: number, warehouse = false) {
  const primitives = produceTemplates(engine);
  const root = new Entity(engine, "produce-template");
  const pieces: { entity: Entity; geometry: PrimitiveGeometry; rgb: number[]; delay: number }[] = [];
  let mesh: ModelMesh | undefined;
  try {
    if (warehouse) root.transform.setRotation(cropId === "wheat" || cropId === "rice" ? 0 : -90, 0, 0);
    buildHarvestProduce(root, cropId, count, (name, position, size, rgb, delay = 0, cone = false) => {
      const entity = root.createChild(name);
      entity.transform.setPosition(position[0], position[1], position[2]);
      entity.transform.setRotation(90, 0, 0);
      entity.transform.setScale(size[0], size[1], size[2]);
      const kind =
        name === "wheat sheaf"
          ? name
          : name === "straw" || name === "stem" || name === "stalk"
            ? "straw"
            : name === "grain" || name === "seed"
              ? "grain"
              : cone
                ? "cone"
                : "sphere";
      pieces.push({ entity, geometry: primitives.get(kind)!, rgb, delay });
      return entity;
    });
    const positions: Vector3[] = [],
      normals: Vector3[] = [],
      colors: Color[] = [],
      uvs: Vector2[] = [],
      noise: Vector2[] = [],
      indices: number[] = [];
    const normalMatrix = new Matrix();
    for (const piece of pieces) {
      const matrix = piece.entity.transform.worldMatrix,
        offset = positions.length;
      Matrix.invert(matrix, normalMatrix);
      normalMatrix.transpose();
      for (const [index, position] of piece.geometry.positions.entries()) {
        positions.push(position.clone().transformCoordinate(matrix));
        const rgb = piece.geometry.colors?.[index] ?? piece.rgb;
        colors.push(new Color(rgb[0], rgb[1], rgb[2], 1));
        const range = piece.geometry.revealRange;
        uvs.push(new Vector2(range ? (position.y - range[0]) / range[1] : position.y + 0.5, piece.delay));
        noise.push(new Vector2(position.x, position.z));
      }
      for (const normal of piece.geometry.normals)
        normals.push(normal.clone().transformNormal(normalMatrix).normalize());
      for (const index of piece.geometry.indices) indices.push(offset + index);
    }
    const minimum = new Vector3(Infinity, Infinity, Infinity),
      maximum = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const position of positions) {
      Vector3.min(minimum, position, minimum);
      Vector3.max(maximum, position, maximum);
    }
    const size: [number, number, number] = [maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z];
    if (warehouse) {
      const center = minimum.clone().add(maximum).scale(0.5);
      for (const position of positions) position.subtract(center);
      minimum.subtract(center);
      maximum.subtract(center);
    }
    mesh = new ModelMesh(engine, `${warehouse ? "Warehouse" : "Harvest"}/${cropId}`);
    mesh.bounds.min.copyFrom(minimum);
    mesh.bounds.max.copyFrom(maximum);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    if (!warehouse) {
      mesh.setUVs(uvs);
      mesh.setUVs(noise, 1);
    }
    mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
    mesh.addSubMesh(0, indices.length);
    mesh.uploadData(false);
    return { mesh, size };
  } catch (error) {
    destroyOwnedMesh(mesh);
    throw error;
  } finally {
    root.destroy();
  }
}
