import lightningSkyShaderSource from "./shaders/TerrainLightningSky.shader?raw";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Color,
  Entity,
  IndexFormat,
  MeshRenderer,
  MeshTopology,
  SetDataOptions,
  Shader,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  VertexElement,
  VertexElementFormat,
  type Engine
} from "@galacean/engine";

/** Immutable world-space flash event shared with acoustic propagation. */
export interface TerrainLightningStrike {
  readonly id: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly strength: number;
}

/** Visible lightning diagnostics retained by the world-environment boundary. */
export interface TerrainLightningVfxSnapshot {
  readonly active: boolean;
  readonly pulse: number;
  readonly strikeCount: number;
  readonly lastStrikeDistance: number;
}

interface LightningPathScratch {
  readonly points: Float32Array;
  readonly starts: Uint16Array;
  readonly pointCounts: Uint8Array;
  readonly widthScales: Float32Array;
  pathCount: number;
  pointCount: number;
}

interface LightningMeshRuntime {
  readonly mesh: BufferMesh;
  readonly vertexBuffer: Buffer;
  readonly indexBuffer: Buffer;
  readonly vertices: Float32Array;
}

const MAIN_SEGMENTS = 20;
const MAXIMUM_BRANCH_COUNT = 8;
const MAXIMUM_BRANCH_SEGMENTS = 9;
const MAXIMUM_PATH_COUNT = 1 + MAXIMUM_BRANCH_COUNT;
const MAXIMUM_POINT_COUNT = MAIN_SEGMENTS + 1 + MAXIMUM_BRANCH_COUNT * (MAXIMUM_BRANCH_SEGMENTS + 1);
const MAXIMUM_RIBBON_SEGMENT_COUNT = MAIN_SEGMENTS + MAXIMUM_BRANCH_COUNT * MAXIMUM_BRANCH_SEGMENTS;
const LIGHTNING_VERTEX_FLOATS = 5;
const LIGHTNING_VERTEX_STRIDE_BYTES = LIGHTNING_VERTEX_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const STRIKE_VISIBLE_SECONDS = 0.72;
const LIGHTNING_TEXTURE_WIDTH = 64;
const LIGHTNING_TEXTURE_HEIGHT = 16;
const SKY_STRIKE_MIN_DISTANCE = 5_600;
const SKY_STRIKE_MAX_DISTANCE = 7_600;
const LIGHTNING_REFERENCE_DISTANCE = 132;
const LIGHTNING_SKY_SHADER_NAME = "Terrain/LightningSky";
const LIGHTNING_SKY_SHADER_SOURCE = lightningSkyShaderSource;

/**
 * Camera-visible storm lightning with a jagged trunk, short branches, and a three-pulse flash.
 * Geometry and timing belong to this demo; the lighting owner still composes the scene-wide flash.
 */
export class TerrainLightningVfx {
  private readonly _root: Entity;
  private readonly _camera: Camera;
  private readonly _coreEntity: Entity;
  private readonly _glowEntity: Entity;
  private readonly _coreMesh: LightningMeshRuntime;
  private readonly _glowMesh: LightningMeshRuntime;
  private readonly _coreMaterial: UnlitMaterial;
  private readonly _glowMaterial: UnlitMaterial;
  private readonly _stripTexture: Texture2D;
  private readonly _paths = createLightningPathScratch();
  private readonly _strikeOrigin = new Vector3();
  private readonly _strikeTarget = new Vector3();
  private _randomState = 0x4c495447;
  private _strikeAge = Number.POSITIVE_INFINITY;
  private _nextStrikeSeconds = 0;
  private _armed = false;
  private _pulse = 0;
  private _strikeCount = 0;
  private _lastStrikeDistance = 0;
  private _destroyed = false;
  private readonly _strikeListeners = new Set<(strike: TerrainLightningStrike) => void>();

  subscribeStrikes(listener: (strike: TerrainLightningStrike) => void): () => void {
    this._strikeListeners.add(listener);
    return () => {
      this._strikeListeners.delete(listener);
    };
  }

  constructor(engine: Engine, parent: Entity, camera: Camera) {
    this._camera = camera;
    this._root = parent.createChild("Terrain Lightning");
    this._glowEntity = this._root.createChild("Lightning Glow");
    this._coreEntity = this._root.createChild("Lightning Core");
    this._stripTexture = createLightningStripTexture(engine);
    this._glowMaterial = createLightningMaterial(engine, this._stripTexture, new Color(0.32, 0.52, 1, 0));
    this._coreMaterial = createLightningMaterial(engine, this._stripTexture, new Color(0.86, 0.94, 1, 0));
    this._glowMesh = createLightningMeshRuntime(engine, "Terrain lightning glow mesh");
    this._coreMesh = createLightningMeshRuntime(engine, "Terrain lightning core mesh");
    const glowRenderer = this._glowEntity.addComponent(MeshRenderer);
    glowRenderer.mesh = this._glowMesh.mesh;
    glowRenderer.priority = 600;
    glowRenderer.setMaterial(this._glowMaterial);
    const coreRenderer = this._coreEntity.addComponent(MeshRenderer);
    coreRenderer.mesh = this._coreMesh.mesh;
    coreRenderer.priority = 601;
    coreRenderer.setMaterial(this._coreMaterial);
    this._setVisible(false);
  }

  /** Advances the random strike clock and returns the scene-light energy multiplier. */
  update(deltaTime: number, strikesPerSecond: number, strength: number): number {
    this._assertAlive();
    const frequency = Math.max(Number.isFinite(strikesPerSecond) ? strikesPerSecond : 0, 0);
    const normalizedStrength = Math.max(Number.isFinite(strength) ? strength : 0, 0);
    const stormActive = frequency > 0.001 && normalizedStrength > 0.001;

    if (stormActive) {
      if (!this._armed) {
        this._armed = true;
        this._triggerStrike(normalizedStrength);
        this._scheduleNextStrike(frequency);
      } else {
        this._nextStrikeSeconds -= deltaTime;
        if (this._nextStrikeSeconds <= 0) {
          this._triggerStrike(normalizedStrength);
          this._scheduleNextStrike(frequency);
        }
      }
    } else {
      this._armed = false;
      this._nextStrikeSeconds = 0;
    }

    if (Number.isFinite(this._strikeAge)) {
      this._strikeAge += deltaTime;
    }
    this._pulse = evaluateLightningPulse(this._strikeAge);
    if (this._pulse > 0.006) {
      this._setVisible(true);
      const coreAlpha = Math.min(1, this._pulse * 1.12);
      const glowAlpha = Math.min(0.72, this._pulse * 0.42);
      this._coreMaterial.baseColor.set(0.86, 0.94, 1, coreAlpha);
      this._glowMaterial.baseColor.set(0.32, 0.52, 1, glowAlpha);
    } else {
      this._setVisible(false);
    }
    return 1 + normalizedStrength * this._pulse;
  }

  /** Returns detached lightning values for diagnostics and browser acceptance. */
  getSnapshot(): TerrainLightningVfxSnapshot {
    this._assertAlive();
    return {
      active: this._pulse > 0.006,
      pulse: this._pulse,
      strikeCount: this._strikeCount,
      lastStrikeDistance: this._lastStrikeDistance
    };
  }

  /** Releases dynamic geometry and local emissive resources. */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._strikeListeners.clear();
    this._root.destroy();
    destroyLightningMeshRuntime(this._coreMesh);
    destroyLightningMeshRuntime(this._glowMesh);
    this._coreMaterial.baseTexture = null!;
    this._glowMaterial.baseTexture = null!;
    this._coreMaterial.destroy(true);
    this._glowMaterial.destroy(true);
    this._stripTexture.destroy(true);
  }

  private _triggerStrike(strength: number): void {
    const distance = this._chooseStrikeEndpoints();
    const origin = this._strikeOrigin;
    const target = this._strikeTarget;
    const geometryScale = distance / LIGHTNING_REFERENCE_DISTANCE;
    const paths = this._paths;
    paths.pathCount = 0;
    paths.pointCount = 0;
    const mainPath = this._appendJaggedPath(
      origin.x,
      origin.y,
      origin.z,
      target.x,
      target.y,
      target.z,
      MAIN_SEGMENTS,
      6.5 * geometryScale
    );
    paths.widthScales[mainPath] = 1;
    const mainStart = paths.starts[mainPath]!;
    const branchCount = 5 + Math.floor(this._random() * 4);
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex++) {
      const attachment = 3 + Math.floor(this._random() * (MAIN_SEGMENTS - 6));
      const startOffset = (mainStart + attachment) * 3;
      const startX = paths.points[startOffset]!;
      const startY = paths.points[startOffset + 1]!;
      const startZ = paths.points[startOffset + 2]!;
      const horizontalAngle = this._random() * Math.PI * 2;
      const branchLength = (18 + this._random() * 34) * geometryScale;
      const endX = startX + Math.cos(horizontalAngle) * branchLength * (0.42 + this._random() * 0.32);
      const endY = Math.max(target.y + 8 * geometryScale, startY - branchLength * (0.45 + this._random() * 0.42));
      const endZ = startZ + Math.sin(horizontalAngle) * branchLength * (0.42 + this._random() * 0.32);
      const segments = 5 + Math.floor(this._random() * 5);
      const pathIndex = this._appendJaggedPath(startX, startY, startZ, endX, endY, endZ, segments, 3.1 * geometryScale);
      paths.widthScales[pathIndex] = 0.42 + this._random() * 0.24;
    }
    const cameraPosition = this._camera.entity.transform.worldPosition;
    uploadLightningMesh(this._coreMesh, paths, cameraPosition, 0.46 * geometryScale);
    uploadLightningMesh(this._glowMesh, paths, cameraPosition, 2.4 * geometryScale);
    this._strikeAge = 0;
    this._pulse = 1;
    this._strikeCount++;
    this._lastStrikeDistance = distance;
    const strike: TerrainLightningStrike = Object.freeze({
      id: this._strikeCount,
      position: Object.freeze({ x: target.x, y: target.y, z: target.z }),
      strength
    });
    for (const listener of this._strikeListeners) listener(strike);
    this._setVisible(true);
  }

  private _chooseStrikeEndpoints(): number {
    const cameraPosition = this._camera.entity.transform.worldPosition;
    const cameraForward = this._camera.entity.transform.worldForward;
    const forwardLength = Math.hypot(cameraForward.x, cameraForward.z);
    const forwardX = forwardLength > 1e-4 ? cameraForward.x / forwardLength : 0;
    const forwardZ = forwardLength > 1e-4 ? cameraForward.z / forwardLength : -1;
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const farDistanceLimit = Math.max(this._camera.nearClipPlane + 1, this._camera.farClipPlane * 0.65);
    const maximumDistance = Math.min(SKY_STRIKE_MAX_DISTANCE, farDistanceLimit);
    const minimumDistance = Math.min(SKY_STRIKE_MIN_DISTANCE, maximumDistance);
    const forwardDistance = minimumDistance + this._random() * (maximumDistance - minimumDistance);
    const lateral = (this._random() * 2 - 1) * forwardDistance * 0.26;
    const targetX = cameraPosition.x + forwardX * forwardDistance + rightX * lateral;
    const targetZ = cameraPosition.z + forwardZ * forwardDistance + rightZ * lateral;
    const target = this._strikeTarget;
    target.set(targetX, cameraPosition.y + forwardDistance * (0.08 + this._random() * 0.08), targetZ);
    this._strikeOrigin.set(
      targetX + (this._random() * 2 - 1) * forwardDistance * 0.08,
      target.y + forwardDistance * (0.42 + this._random() * 0.18),
      targetZ + (this._random() * 2 - 1) * forwardDistance * 0.08
    );
    return Math.hypot(targetX - cameraPosition.x, targetZ - cameraPosition.z);
  }

  private _appendJaggedPath(
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    segments: number,
    jitter: number
  ): number {
    const paths = this._paths;
    const pathIndex = paths.pathCount;
    const pointCount = segments + 1;
    const pointStart = paths.pointCount;
    if (pathIndex >= MAXIMUM_PATH_COUNT || pointStart + pointCount > MAXIMUM_POINT_COUNT) {
      throw new Error("Terrain lightning path scratch capacity is too small");
    }
    paths.pathCount++;
    paths.pointCount += pointCount;
    paths.starts[pathIndex] = pointStart;
    paths.pointCounts[pathIndex] = pointCount;
    for (let segment = 0; segment <= segments; segment++) {
      const progress = segment / segments;
      const envelope = Math.sin(progress * Math.PI);
      const displacement = jitter * envelope;
      const pointOffset = (pointStart + segment) * 3;
      paths.points[pointOffset] = startX + (endX - startX) * progress + (this._random() * 2 - 1) * displacement;
      paths.points[pointOffset + 1] =
        startY + (endY - startY) * progress + (this._random() * 2 - 1) * displacement * 0.36;
      paths.points[pointOffset + 2] = startZ + (endZ - startZ) * progress + (this._random() * 2 - 1) * displacement;
    }
    const firstOffset = pointStart * 3;
    const lastOffset = (pointStart + segments) * 3;
    paths.points[firstOffset] = startX;
    paths.points[firstOffset + 1] = startY;
    paths.points[firstOffset + 2] = startZ;
    paths.points[lastOffset] = endX;
    paths.points[lastOffset + 1] = endY;
    paths.points[lastOffset + 2] = endZ;
    return pathIndex;
  }

  private _scheduleNextStrike(frequency: number): void {
    // Weather channels fade in gradually; keep the first interpolated value from scheduling a minutes-long gap.
    const averageInterval = 1 / Math.max(frequency, 0.18);
    this._nextStrikeSeconds = averageInterval * (0.68 + this._random() * 0.64);
  }

  private _random(): number {
    this._randomState = (Math.imul(this._randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this._randomState / 0xffff_ffff;
  }

  private _setVisible(visible: boolean): void {
    this._coreEntity.isActive = visible;
    this._glowEntity.isActive = visible;
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("Terrain lightning VFX has been destroyed");
    }
  }
}

/** Matches the reference's bright-dark-bright-dark-bright strobe before a short glow decay. */
export function evaluateLightningPulse(age: number): number {
  if (!Number.isFinite(age) || age < 0 || age > STRIKE_VISIBLE_SECONDS) {
    return 0;
  }
  if (age < 0.035) {
    return 1;
  }
  if (age < 0.065) {
    return 0.08;
  }
  if (age < 0.1) {
    return 0.78;
  }
  if (age < 0.13) {
    return 0.06;
  }
  if (age < 0.17) {
    return 0.94;
  }
  return Math.exp(-(age - 0.17) * 8.5) * 0.72;
}

function createLightningPathScratch(): LightningPathScratch {
  return {
    points: new Float32Array(MAXIMUM_POINT_COUNT * 3),
    starts: new Uint16Array(MAXIMUM_PATH_COUNT),
    pointCounts: new Uint8Array(MAXIMUM_PATH_COUNT),
    widthScales: new Float32Array(MAXIMUM_PATH_COUNT),
    pathCount: 0,
    pointCount: 0
  };
}

function createLightningMeshRuntime(engine: Engine, name: string): LightningMeshRuntime {
  const vertices = new Float32Array(MAXIMUM_RIBBON_SEGMENT_COUNT * 4 * LIGHTNING_VERTEX_FLOATS);
  initializeLightningUvs(vertices);
  const indices = createLightningIndices();
  const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices.byteLength, BufferUsage.Dynamic);
  const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
  const mesh = new BufferMesh(engine, name);
  mesh.setVertexBufferBinding(vertexBuffer, LIGHTNING_VERTEX_STRIDE_BYTES);
  mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
  mesh.setVertexElements([
    new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
    new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
  ]);
  mesh.addSubMesh(0, 0, MeshTopology.Triangles);
  return { mesh, vertexBuffer, indexBuffer, vertices };
}

function destroyLightningMeshRuntime(runtime: LightningMeshRuntime): void {
  runtime.mesh.destroy(true);
  runtime.vertexBuffer.destroy(true);
  runtime.indexBuffer.destroy(true);
}

function initializeLightningUvs(vertices: Float32Array): void {
  for (let segment = 0; segment < MAXIMUM_RIBBON_SEGMENT_COUNT; segment++) {
    const offset = segment * 4 * LIGHTNING_VERTEX_FLOATS;
    vertices[offset + 3] = 0;
    vertices[offset + 4] = 0;
    vertices[offset + 8] = 0;
    vertices[offset + 9] = 1;
    vertices[offset + 13] = 1;
    vertices[offset + 14] = 0;
    vertices[offset + 18] = 1;
    vertices[offset + 19] = 1;
  }
}

function createLightningIndices(): Uint16Array {
  const indices = new Uint16Array(MAXIMUM_RIBBON_SEGMENT_COUNT * 6);
  for (let segment = 0; segment < MAXIMUM_RIBBON_SEGMENT_COUNT; segment++) {
    const vertexStart = segment * 4;
    const indexOffset = segment * 6;
    indices[indexOffset] = vertexStart;
    indices[indexOffset + 1] = vertexStart + 2;
    indices[indexOffset + 2] = vertexStart + 1;
    indices[indexOffset + 3] = vertexStart + 1;
    indices[indexOffset + 4] = vertexStart + 2;
    indices[indexOffset + 5] = vertexStart + 3;
  }
  return indices;
}

function uploadLightningMesh(
  runtime: LightningMeshRuntime,
  paths: LightningPathScratch,
  cameraPosition: Vector3,
  baseWidth: number
): void {
  const points = paths.points;
  const vertices = runtime.vertices;
  let ribbonSegment = 0;
  for (let pathIndex = 0; pathIndex < paths.pathCount; pathIndex++) {
    const pointStart = paths.starts[pathIndex]!;
    const pointCount = paths.pointCounts[pathIndex]!;
    const widthScale = paths.widthScales[pathIndex]!;
    for (let segment = 0; segment < pointCount - 1; segment++) {
      const startOffset = (pointStart + segment) * 3;
      const endOffset = startOffset + 3;
      const startX = points[startOffset]!;
      const startY = points[startOffset + 1]!;
      const startZ = points[startOffset + 2]!;
      const endX = points[endOffset]!;
      const endY = points[endOffset + 1]!;
      const endZ = points[endOffset + 2]!;
      const directionX = endX - startX;
      const directionY = endY - startY;
      const directionZ = endZ - startZ;
      const viewX = cameraPosition.x - (startX + endX) * 0.5;
      const viewY = cameraPosition.y - (startY + endY) * 0.5;
      const viewZ = cameraPosition.z - (startZ + endZ) * 0.5;
      let sideX = directionY * viewZ - directionZ * viewY;
      let sideY = directionZ * viewX - directionX * viewZ;
      let sideZ = directionX * viewY - directionY * viewX;
      let sideLength = Math.hypot(sideX, sideY, sideZ);
      if (sideLength < 1e-4) {
        sideX = directionZ;
        sideY = 0;
        sideZ = -directionX;
        sideLength = Math.max(Math.hypot(sideX, sideZ), 1e-4);
      }
      const progress = segment / Math.max(pointCount - 2, 1);
      const width = baseWidth * widthScale * (0.34 + Math.pow(1 - progress, 0.42) * 0.66) * 0.5;
      sideX = (sideX / sideLength) * width;
      sideY = (sideY / sideLength) * width;
      sideZ = (sideZ / sideLength) * width;
      const vertexOffset = ribbonSegment * 4 * LIGHTNING_VERTEX_FLOATS;
      writeLightningVertex(vertices, vertexOffset, startX - sideX, startY - sideY, startZ - sideZ);
      writeLightningVertex(
        vertices,
        vertexOffset + LIGHTNING_VERTEX_FLOATS,
        startX + sideX,
        startY + sideY,
        startZ + sideZ
      );
      writeLightningVertex(
        vertices,
        vertexOffset + LIGHTNING_VERTEX_FLOATS * 2,
        endX - sideX,
        endY - sideY,
        endZ - sideZ
      );
      writeLightningVertex(
        vertices,
        vertexOffset + LIGHTNING_VERTEX_FLOATS * 3,
        endX + sideX,
        endY + sideY,
        endZ + sideZ
      );
      ribbonSegment++;
    }
  }
  runtime.vertexBuffer.setData(vertices, 0, 0, vertices.length, SetDataOptions.Discard);
  runtime.mesh.subMeshes[0]!.count = ribbonSegment * 6;
  updateLightningBounds(runtime.mesh, vertices, ribbonSegment * 4);
}

function writeLightningVertex(vertices: Float32Array, offset: number, x: number, y: number, z: number): void {
  vertices[offset] = x;
  vertices[offset + 1] = y;
  vertices[offset + 2] = z;
}

function updateLightningBounds(mesh: BufferMesh, vertices: Float32Array, vertexCount: number): void {
  const { min, max } = mesh.bounds;
  min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * LIGHTNING_VERTEX_FLOATS;
    const x = vertices[offset]!;
    const y = vertices[offset + 1]!;
    const z = vertices[offset + 2]!;
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  }
}

function createLightningStripTexture(engine: Engine): Texture2D {
  const texture = new Texture2D(
    engine,
    LIGHTNING_TEXTURE_WIDTH,
    LIGHTNING_TEXTURE_HEIGHT,
    TextureFormat.R8G8B8A8,
    false,
    false
  );
  texture.name = "Terrain lightning soft strip";
  const pixels = new Uint8Array(LIGHTNING_TEXTURE_WIDTH * LIGHTNING_TEXTURE_HEIGHT * 4);
  for (let y = 0; y < LIGHTNING_TEXTURE_HEIGHT; y++) {
    for (let x = 0; x < LIGHTNING_TEXTURE_WIDTH; x++) {
      const across = Math.abs((y + 0.5) / LIGHTNING_TEXTURE_HEIGHT - 0.5) * 2;
      const along = Math.abs((x + 0.5) / LIGHTNING_TEXTURE_WIDTH - 0.5) * 2;
      const coverage = Math.exp(-across * across * 7.2) * Math.min(1, (1 - along) * 12);
      const offset = (y * LIGHTNING_TEXTURE_WIDTH + x) * 4;
      pixels[offset] = 214;
      pixels[offset + 1] = 233;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(coverage * 255);
    }
  }
  texture.setPixelBuffer(pixels);
  return texture;
}

function createLightningMaterial(engine: Engine, texture: Texture2D, color: Color): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.shader = Shader.find(LIGHTNING_SKY_SHADER_NAME) ?? Shader.create(LIGHTNING_SKY_SHADER_SOURCE);
  material.baseTexture = texture;
  material.baseColor = color;
  return material;
}
