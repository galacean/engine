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
  MSAASamples,
  PBRMaterial,
  Ray,
  Vector2,
  UnlitMaterial,
  Vector3,
  VertexElement,
  VertexElementFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { createCliffEnvironment } from "./Environment";
import { createWorldRockMaterials, DEFAULT_WORLD_ROCK_COLOR } from "./Material";
import { NativeRockGrass } from "./NativeGrass";
import { intersectRockRay } from "./RockPicking";
import { buildGrassCoverage, type GrassCoveredSurface } from "./GrassCoverage";

export interface ViewerEvent {
  event: "ready" | "applied" | "grass" | "selected" | "error";
  requestId?: string | number;
  rockId?: string;
  error?: string;
  grassCount: number;
  grassTriangles: number;
  totalGrassCount: number;
  totalGrassTriangles: number;
  totalRockTriangles: number;
  rockCount: number;
  renderer: string;
  grassShader: string;
  sharedGrassColorField: boolean;
}
let onEvent: (event: ViewerEvent) => void;
let activeEngine: WebGLEngine | undefined;
let viewerActive = true;
type RequestId = string | number;
type View = "overview" | "perspective" | "front" | "side" | "back" | "top";
type Bounds = [number[], number[]];
interface SurfaceSettings {
  color?: string;
  tileSize?: number;
  strength?: number;
  roughness?: number;
  detail?: boolean;
}
interface IncomingMesh {
  positions: Float32Array | number[];
  normals: Float32Array | number[];
  indices: Uint32Array | number[];
  bounds: Bounds;
  envelopeBounds?: Bounds;
  surfaceRoles?: Float32Array | number[];
  guideBoxes?: number[][][];
}
interface RockDescriptor {
  rockId: string;
  position: [number, number, number];
  dimensions: [number, number, number];
  seed: number;
  settings: SurfaceSettings;
  grass: { enabled: boolean; density: number };
}
/** One scene inventory, independently replaceable world-space surfaces, and selected-only authoring controls. */
export type Command = { id?: RequestId; rockId?: string } & (
  | { action: "scene"; rocks: RockDescriptor[]; selectedRockId: string }
  | { action: "mesh"; mesh: IncomingMesh; seed?: number }
  | { action: "surface"; settings: SurfaceSettings; mode?: "projected" | "clay" }
  | { action: "grass"; enabled: boolean; density: number; seed?: number }
  | { action: "select" }
  | { action: "view"; view: View }
  | { action: "display"; obb: boolean; wireframe: boolean }
);
interface RockState {
  rockId: string;
  position: [number, number, number];
  envelope: Bounds;
  seed: number;
  density: number;
  grassEnabled: boolean;
  settings: Required<SurfaceSettings>;
  material: PBRMaterial;
  grass: NativeRockGrass;
  surface?: GrassCoveredSurface;
  rock?: OwnedMesh;
  guide?: OwnedMesh;
  guideBoxes?: number[][][];
  wire?: OwnedMesh;
}
interface OwnedMesh {
  entity: Entity;
  mesh: BufferMesh;
  vertexBuffer: Buffer;
  indexBuffer: Buffer;
}

const diagnostics = {
  status: "loading",
  error: "",
  grassCount: 0,
  grassTriangles: 0,
  rockTriangles: 0,
  rockCount: 0,
  selectedRockId: "",
  rockIds: [] as string[],
  lighting: "Seed 12:00",
  renderer: "Galacean",
  grassShader: "",
  sharedGrassColorField: true,
  mode: "projected",
  lastRequestId: undefined as RequestId | undefined
};
(window as unknown as { seedRockViewer: typeof diagnostics }).seedRockViewer = diagnostics;
let applyCommand: ((command: Command) => void) | undefined;
let cleanup: (() => void) | undefined;
let closed = false;
const pending: Command[] = [];

function report(
  event: "ready" | "applied" | "grass" | "selected" | "error",
  requestId?: RequestId,
  rockId?: string,
  error?: string,
  rock?: RockState
): void {
  onEvent({
    event,
    requestId,
    rockId,
    grassCount: rock ? (rock.grassEnabled ? rock.grass.count : 0) : diagnostics.grassCount,
    grassTriangles: rock ? (rock.grassEnabled ? rock.grass.triangles : 0) : diagnostics.grassTriangles,
    totalGrassCount: diagnostics.grassCount,
    totalGrassTriangles: diagnostics.grassTriangles,
    totalRockTriangles: diagnostics.rockTriangles,
    rockCount: diagnostics.rockCount,
    renderer: diagnostics.renderer,
    grassShader: diagnostics.grassShader,
    sharedGrassColorField: true,
    ...(error ? { error } : {})
  });
}

function dispatch(command: Command): void {
  try {
    applyCommand!(command);
    diagnostics.status = "ready";
    diagnostics.error = "";
    diagnostics.lastRequestId = command.id;
    document.body.dataset.ready = "true";
    document.body.dataset.error = "";
    report("applied", command.id, command.rockId);
  } catch (error) {
    fail(error, command.id, command.rockId);
  }
}

/** Applies one editor action without crossing a frame or copying geometry buffers. */
export function sendCommand(command: Command): void {
  if (closed) return;
  if (applyCommand) dispatch(command);
  else pending.push(command);
}
/** Pauses rendering while the 2D tab is visible; keeps 3D edits and camera state. */
export function setViewerActive(active: boolean): void {
  viewerActive = active;
  if (!activeEngine) return;
  if (active) activeEngine.run();
  else activeEngine.pause();
}
/** Initializes the owned viewport and forwards selection/status events to the parameter panel. */
export async function startViewer(callback: (event: ViewerEvent) => void): Promise<void> {
  onEvent = callback;
  await main().catch((error) => fail(error));
}
window.addEventListener(
  "pagehide",
  () => {
    closed = true;
    pending.length = 0;
    cleanup?.();
  },
  { once: true }
);

function fail(error: unknown, requestId?: RequestId, rockId?: string): void {
  diagnostics.status = "error";
  diagnostics.error = error instanceof Error ? error.message : String(error);
  document.body.dataset.error = diagnostics.error;
  report("error", requestId, rockId, diagnostics.error);
  console.error(error);
}

async function main(): Promise<void> {
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  if (closed) {
    engine.destroy();
    return;
  }
  activeEngine = engine;
  // WebCanvas owns a ResizeObserver, including tab/sidebar size changes.
  engine.canvas.setAutoResolution();
  const root = engine.sceneManager.activeScene!.createRootEntity("Native atomic rock preview");
  const cameraEntity = root.createChild("Orbit camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 0.05;
  camera.farClipPlane = 1500;
  camera.fieldOfView = 42;
  camera.enableHDR = true;
  camera.msaaSamples = MSAASamples.FourX;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  orbit.minDistance = 0.25;
  orbit.maxDistance = 800;
  orbit.maxPolarAngle = Math.PI - 0.001;
  orbit.target = new Vector3(0, 3, 0);
  cameraEntity.transform.setPosition(12, 9, 16);
  cameraEntity.transform.lookAt(orbit.target);
  if (viewerActive) engine.run();
  let environment: Awaited<ReturnType<typeof createCliffEnvironment>> | undefined;
  let materials: Awaited<ReturnType<typeof createWorldRockMaterials>> | undefined;
  const rocks = new Map<string, RockState>();
  const pointerEvents = new AbortController();
  let guideMaterial: UnlitMaterial | undefined;
  let wireMaterial: UnlitMaterial | undefined;
  let disposed = false;
  let initializing = true;
  cleanup = () => {
    // Await resource creation before releasing its owner; a late promise must not leak its result.
    if (disposed || initializing) return;
    disposed = true;
    pointerEvents.abort();
    for (const rock of rocks.values()) releaseRock(rock);
    rocks.clear();
    materials?.dispose();
    guideMaterial?.destroy();
    wireMaterial?.destroy();
    environment?.dispose();
    // This engine belongs to this page. On pagehide the browser releases its GL context;
    // pausing avoids the current asset-loader Shader registry teardown fault during navigation.
    if (closed) engine.pause();
    else engine.destroy();
  };
  try {
    environment = await createCliffEnvironment(engine, root, camera);
    if (closed) {
      initializing = false;
      cleanup();
      return;
    }
    diagnostics.grassShader = environment.grass.map((binding) => binding.material.shader.name).join(", ");
    materials = await createWorldRockMaterials(engine, environment.field);
    initializing = false;
    if (closed) {
      cleanup();
      return;
    }
    guideMaterial = new UnlitMaterial(engine);
    guideMaterial.baseColor = new Color(1, 0.65, 0.15, 1);
    wireMaterial = new UnlitMaterial(engine);
    wireMaterial.baseColor = new Color(0.06, 0.09, 0.1, 1);
    let showOBB = false;
    let showWireframe = false;

    function updateTotals(): void {
      diagnostics.rockIds = [...rocks.keys()];
      diagnostics.rockCount = [...rocks.values()].filter((rock) => rock.surface).length;
      diagnostics.rockTriangles = diagnostics.grassCount = diagnostics.grassTriangles = 0;
      for (const rock of rocks.values()) {
        diagnostics.rockTriangles += (rock.surface?.indices.length ?? 0) / 3;
        if (rock.grassEnabled) {
          diagnostics.grassCount += rock.grass.count;
          diagnostics.grassTriangles += rock.grass.triangles;
        }
      }
      document.body.dataset.rockCount = String(diagnostics.rockCount);
      document.body.dataset.rockIds = diagnostics.rockIds.join(",");
      document.body.dataset.selectedRockId = diagnostics.selectedRockId;
    }

    function applySurface(rock: RockState): void {
      const { settings, material } = rock;
      const rgb = Number.parseInt(settings.color.slice(1), 16);
      // The factory shares textures; tint and tile size belong to this stone only.
      material.shaderData.setVector3(
        "material_RockColor",
        new Vector3(
          Color.sRGBToLinearSpace((rgb >>> 16) / 255),
          Color.sRGBToLinearSpace(((rgb >>> 8) & 255) / 255),
          Color.sRGBToLinearSpace((rgb & 255) / 255)
        )
      );
      rock.grass.setStoneSurface(settings.color, settings.tileSize);
      materials!.setTileSize(material, settings.tileSize);
      material.roughness = settings.roughness;
      material.shaderData.setFloat("material_WorldRockNormalStrength", settings.detail ? settings.strength : 0);
      material.shaderData.setFloat("material_WorldGrassCoverageFromMesh", 1);
      material.shaderData.setFloat("material_WorldGrassEnable", rock.grassEnabled ? 1 : 0);
      material.shaderData.setFloat("material_WorldRockProjectionEnable", diagnostics.mode === "clay" ? 0 : 1);
    }

    function updateGrass(rock: RockState, requestId?: RequestId): void {
      if (rock.surface) rock.grass.rebuild(rock.surface, rock.density, rock.seed);
      rock.grass.setVisible(rock.grassEnabled);
      updateTotals();
      report("grass", requestId, rock.rockId, undefined, rock);
    }

    function fitCamera(view: View, rockId = diagnostics.selectedRockId): void {
      const envelopes =
        view === "overview"
          ? [...rocks.values()].map((rock) => rock.envelope)
          : rocks.has(rockId)
            ? [rocks.get(rockId)!.envelope]
            : [];
      if (!envelopes.length) return;
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (const bounds of envelopes)
        for (let axis = 0; axis < 3; axis++) {
          lo[axis] = Math.min(lo[axis], bounds[0][axis]);
          hi[axis] = Math.max(hi[axis], bounds[1][axis]);
        }
      const target = new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      const radius = Math.max(0.1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      const vertical = (camera.fieldOfView * Math.PI) / 360;
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspectRatio);
      const directions: Record<View, [number, number, number]> = {
        overview: [0.08, 0.45, 1],
        perspective: [0.85, 1.0, 1.2],
        front: [0, 0, 1],
        side: [1, 0, 0],
        back: [0, 0, -1],
        top: [0, 1, 0.001]
      };
      const direction = new Vector3(...directions[view]).normalize();
      const right = new Vector3(direction.z, 0, -direction.x).normalize();
      const up = new Vector3();
      Vector3.cross(direction, right, up);
      let distance = radius * 0.1;
      // Fit actual envelope corners in camera space. A bounding sphere wastes the foreground in a long scene.
      for (const bounds of envelopes)
        for (let corner = 0; corner < 8; corner++) {
          const x = bounds[corner & 1 ? 1 : 0][0] - target.x;
          const y = bounds[corner & 2 ? 1 : 0][1] - target.y;
          const z = bounds[corner & 4 ? 1 : 0][2] - target.z;
          const forward = x * direction.x + y * direction.y + z * direction.z;
          const horizontalOffset = Math.abs(x * right.x + y * right.y + z * right.z);
          const verticalOffset = Math.abs(x * up.x + y * up.y + z * up.z);
          distance = Math.max(
            distance,
            forward + 1.15 * Math.max(horizontalOffset / Math.tan(horizontal), verticalOffset / Math.tan(vertical))
          );
        }
      orbit.target = target;
      orbit.minDistance = Math.max(0.1, view === "overview" ? 0.25 : radius * 0.12);
      orbit.maxDistance = Math.max(800, distance * 5);
      camera.nearClipPlane = Math.max(0.01, Math.min(0.1, radius / 500));
      camera.farClipPlane = Math.max(1500, distance * 8);
      cameraEntity.transform.setPosition(
        target.x + direction.x * distance,
        target.y + direction.y * distance,
        target.z + direction.z * distance
      );
      cameraEntity.transform.lookAt(target);
      document.body.dataset.view = view;
    }

    function updateDisplay(): void {
      for (const rock of rocks.values()) {
        const selected = rock.rockId === diagnostics.selectedRockId;
        const { surface, envelope } = rock;
        if (selected && showOBB && !rock.guide) {
          const [lo, hi] = envelope,
            positions: number[] = [],
            edges: number[] = [];
          if (rock.guideBoxes) {
            for (const box of rock.guideBoxes) {
              const base = positions.length / 3;
              for (const point of box) positions.push(...point);
              for (let i = 0; i < 8; i++)
                for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push(base + i, base + (i | bit));
            }
          } else {
            for (let top = 0; top < 2; top++)
              for (const [x, z] of [
                [lo[0], lo[2]],
                [hi[0], lo[2]],
                [hi[0], hi[2]],
                [lo[0], hi[2]]
              ]) {
                positions.push(x, top ? hi[1] : lo[1], z);
              }
            for (let i = 0; i < 4; i++) edges.push(i, (i + 1) % 4, i + 4, ((i + 1) % 4) + 4, i, i + 4);
          }
          rock.guide = uploadLines(
            engine,
            root,
            new Float32Array(positions),
            new Uint32Array(edges),
            envelope,
            guideMaterial!,
            "Selected rock OBB"
          );
        }
        if (rock.guide) rock.guide.entity.isActive = selected && showOBB;
        if (selected && showWireframe && surface && !rock.wire) {
          const edges: number[] = [],
            seen = new Set<number>(),
            count = surface.positions.length / 3;
          for (let i = 0; i < surface.indices.length; i += 3)
            for (let side = 0; side < 3; side++) {
              const a = surface.indices[i + side],
                b = surface.indices[i + ((side + 1) % 3)];
              const key = Math.min(a, b) * count + Math.max(a, b);
              if (!seen.has(key)) {
                seen.add(key);
                edges.push(a, b);
              }
            }
          rock.wire = uploadLines(
            engine,
            root,
            surface.positions,
            new Uint32Array(edges),
            surface.bounds,
            wireMaterial!,
            "Selected rock triangle edges"
          );
        }
        if (rock.wire) rock.wire.entity.isActive = selected && showWireframe;
      }
    }

    function select(rockId: string, notify = false): void {
      if (!rocks.has(rockId)) return;
      diagnostics.selectedRockId = rockId;
      document.body.dataset.selectedRockId = rockId;
      updateDisplay();
      if (notify) report("selected", undefined, rockId);
    }

    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    let pointerStart: { id: number; x: number; y: number; moved: boolean } | undefined;
    const events = { signal: pointerEvents.signal };
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), events);
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button === 0 && event.isPrimary)
          pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        else pointerStart = undefined;
      },
      events
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5)
          pointerStart.moved = true;
      },
      events
    );
    canvas.addEventListener(
      "pointercancel",
      () => {
        pointerStart = undefined;
      },
      events
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        const start = pointerStart;
        pointerStart = undefined;
        if (
          !start ||
          start.id !== event.pointerId ||
          start.moved ||
          event.button !== 0 ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
        )
          return;
        const rect = canvas.getBoundingClientRect(),
          ray = new Ray();
        camera.viewportPointToRay(
          new Vector2((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height),
          ray
        );
        let nearest = Infinity,
          picked: string | undefined;
        for (const rock of rocks.values())
          if (rock.surface) {
            const distance = intersectRockRay(rock.surface, ray.origin, ray.direction);
            if (distance < nearest) {
              nearest = distance;
              picked = rock.rockId;
            }
          }
        if (picked) select(picked, true);
      },
      events
    );

    applyCommand = (command) => {
      switch (command.action) {
        case "scene": {
          const retained = new Set(command.rocks.map((descriptor) => descriptor.rockId));
          for (const [id, rock] of rocks)
            if (!retained.has(id)) {
              releaseRock(rock);
              rocks.delete(id);
            }
          for (const descriptor of command.rocks) {
            if (
              !descriptor.rockId ||
              descriptor.position.length !== 3 ||
              descriptor.dimensions.length !== 3 ||
              [...descriptor.position, ...descriptor.dimensions].some((value) => !Number.isFinite(value)) ||
              descriptor.dimensions.some((value) => value <= 0)
            )
              throw Error("Invalid rock scene placement");
            const [x, y, z] = descriptor.position,
              [w, h, d] = descriptor.dimensions;
            let rock = rocks.get(descriptor.rockId);
            if (rock) {
              release(rock.rock);
              release(rock.guide);
              release(rock.wire);
              rock.grass.dispose();
              rock.rock = rock.guide = rock.wire = undefined;
              rock.surface = undefined;
            } else {
              rock = {
                rockId: descriptor.rockId,
                position: descriptor.position,
                envelope: [
                  [0, 0, 0],
                  [0, 0, 0]
                ],
                seed: descriptor.seed,
                density: 2,
                grassEnabled: true,
                settings: { color: DEFAULT_WORLD_ROCK_COLOR, tileSize: 20, strength: 0.35, roughness: 1, detail: true },
                material: materials!.create(20),
                grass: new NativeRockGrass(engine, root, environment!)
              };
              rocks.set(rock.rockId, rock);
            }
            rock.position = [...descriptor.position];
            rock.envelope = [
              [x - w / 2, y, z - d / 2],
              [x + w / 2, y + h, z + d / 2]
            ];
            rock.seed = Number.isFinite(descriptor.seed) ? descriptor.seed : 1;
            rock.density = Math.max(0, Number.isFinite(descriptor.grass?.density) ? descriptor.grass.density : 2);
            rock.grassEnabled = descriptor.grass?.enabled !== false;
            updateSettings(rock.settings, descriptor.settings);
            applySurface(rock);
          }
          select(command.selectedRockId);
          updateTotals();
          fitCamera("overview");
          break;
        }
        case "mesh": {
          const rock = rocks.get(command.rockId!);
          if (!rock) throw Error(`Unknown rock: ${command.rockId}`);
          const next = worldSurface(command.mesh, rock.position);
          const nextRock = uploadSurface(engine, root, next, rock.material);
          release(rock.rock);
          release(rock.guide);
          release(rock.wire);
          rock.rock = nextRock;
          rock.guide = rock.wire = undefined;
          rock.surface = next;
          rock.envelope = next.envelopeBounds ?? next.bounds;
          rock.guideBoxes = command.mesh.guideBoxes?.map((box) =>
            box.map((point) => [
              point[0] + rock.position[0],
              point[1] - command.mesh.bounds[0][1] + rock.position[1],
              point[2] + rock.position[2]
            ])
          );
          if (Number.isFinite(command.seed)) rock.seed = command.seed!;
          updateDisplay();
          updateGrass(rock, command.id);
          break;
        }
        case "surface": {
          const rock = rocks.get(command.rockId!);
          if (!rock) return;
          updateSettings(rock.settings, command.settings);
          if (command.mode === "projected" || command.mode === "clay") diagnostics.mode = command.mode;
          applySurface(rock);
          for (const other of rocks.values())
            other.material.shaderData.setFloat(
              "material_WorldRockProjectionEnable",
              diagnostics.mode === "clay" ? 0 : 1
            );
          break;
        }
        case "grass": {
          const rock = rocks.get(command.rockId!);
          if (!rock) return;
          const density = Number.isFinite(command.density) ? Math.max(0, command.density) : rock.density;
          const seed = Number.isFinite(command.seed) ? command.seed! : rock.seed;
          const rebuild = density !== rock.density || seed !== rock.seed;
          rock.density = density;
          rock.seed = seed;
          rock.grassEnabled = !!command.enabled;
          applySurface(rock);
          if (rebuild) updateGrass(rock, command.id);
          else {
            rock.grass.setVisible(rock.grassEnabled);
            updateTotals();
            report("grass", command.id, rock.rockId, undefined, rock);
          }
          break;
        }
        case "select":
          if (command.rockId) select(command.rockId);
          break;
        case "view":
          if (["overview", "perspective", "front", "side", "back", "top"].includes(command.view))
            fitCamera(command.view, command.rockId);
          break;
        case "display":
          showOBB = !!command.obb;
          showWireframe = !!command.wireframe;
          updateDisplay();
          break;
      }
    };
    diagnostics.status = "ready";
    document.body.dataset.ready = "true";
    report("ready");
    for (const command of pending.splice(0)) dispatch(command);
  } catch (error) {
    initializing = false;
    cleanup();
    throw error;
  }
}

/** Ground the actual rock bottom; render and grass consumers use these same world buffers. */
function worldSurface(input: IncomingMesh, position: [number, number, number]): GrassCoveredSurface {
  if (!input || !input.positions || !input.normals || !input.indices || !input.bounds)
    throw Error("Missing rock mesh buffers");
  const positions = new Float32Array(input.positions);
  const normals = new Float32Array(input.normals);
  const indices = new Uint32Array(input.indices);
  if (
    !positions.length ||
    positions.length % 3 ||
    normals.length !== positions.length ||
    !indices.length ||
    indices.length % 3
  ) {
    throw Error("Invalid rock mesh buffer lengths");
  }
  const envelope = input.envelopeBounds ?? input.bounds;
  for (const bounds of [input.bounds, envelope]) {
    if (
      bounds.length !== 2 ||
      bounds.some((point) => point.length !== 3 || point.some((value) => !Number.isFinite(value))) ||
      bounds[0].some((value, axis) => value > bounds[1][axis])
    )
      throw Error("Invalid rock mesh bounds");
  }
  const floorY = input.bounds[0][1];
  for (let i = 0; i < positions.length; i += 3) {
    if (
      !Number.isFinite(positions[i]) ||
      !Number.isFinite(positions[i + 1]) ||
      !Number.isFinite(positions[i + 2]) ||
      !Number.isFinite(normals[i]) ||
      !Number.isFinite(normals[i + 1]) ||
      !Number.isFinite(normals[i + 2])
    )
      throw Error("Non-finite rock mesh vertex");
    positions[i] += position[0];
    positions[i + 1] += position[1] - floorY;
    positions[i + 2] += position[2];
  }
  const vertexCount = positions.length / 3;
  for (const index of indices) if (index >= vertexCount) throw Error("Rock mesh index is outside the vertex buffer");
  const translate = (bounds: Bounds): Bounds =>
    bounds.map((point) => [point[0] + position[0], point[1] - floorY + position[1], point[2] + position[2]]) as Bounds;
  const surface = { positions, normals, indices, bounds: translate(input.bounds), envelopeBounds: translate(envelope) };
  const surfaceRoles = input.surfaceRoles ? new Float32Array(input.surfaceRoles) : undefined;
  return { ...surface, surfaceRoles, grassCoverage: buildGrassCoverage(surface, surfaceRoles) };
}

function uploadSurface(
  engine: WebGLEngine,
  root: Entity,
  surface: GrassCoveredSurface,
  material: PBRMaterial
): OwnedMesh {
  const data = new Float32Array((surface.positions.length / 3) * 10);
  for (let i = 0; i < surface.positions.length / 3; i++) {
    data.set(surface.positions.subarray(i * 3, i * 3 + 3), i * 10);
    data.set(surface.normals.subarray(i * 3, i * 3 + 3), i * 10 + 3);
    data[i * 10 + 9] = surface.grassCoverage[i]; // Native RockSurface coverage is TEXCOORD_1.y.
  }
  const resource = createMesh(engine, root, data, surface.indices, surface.bounds, "Native rock surface");
  resource.mesh.setVertexElements([
    new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
    new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
    new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0),
    new VertexElement("TEXCOORD_1", 32, VertexElementFormat.Vector2, 0)
  ]);
  resource.mesh.setVertexBufferBinding(resource.vertexBuffer, 40);
  resource.mesh.addSubMesh(0, surface.indices.length);
  const renderer = resource.entity.addComponent(MeshRenderer);
  renderer.mesh = resource.mesh;
  renderer.setMaterial(material);
  renderer.castShadows = renderer.receiveShadows = true;
  return resource;
}

function uploadLines(
  engine: WebGLEngine,
  root: Entity,
  positions: Float32Array,
  indices: Uint32Array,
  bounds: Bounds,
  material: UnlitMaterial,
  name: string
): OwnedMesh {
  const resource = createMesh(engine, root, positions, indices, bounds, name);
  resource.mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
  resource.mesh.setVertexBufferBinding(resource.vertexBuffer, 12);
  resource.mesh.addSubMesh(0, indices.length, MeshTopology.Lines);
  const renderer = resource.entity.addComponent(MeshRenderer);
  renderer.mesh = resource.mesh;
  renderer.setMaterial(material);
  renderer.castShadows = renderer.receiveShadows = false;
  return resource;
}

function createMesh(
  engine: WebGLEngine,
  root: Entity,
  vertices: Float32Array,
  indices: Uint32Array,
  bounds: Bounds,
  name: string
): OwnedMesh {
  const mesh = new BufferMesh(engine, name);
  const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
  const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
  mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt32);
  mesh.bounds.min.set(...(bounds[0] as [number, number, number]));
  mesh.bounds.max.set(...(bounds[1] as [number, number, number]));
  return { entity: root.createChild(name), mesh, vertexBuffer, indexBuffer };
}

function release(resource?: OwnedMesh): void {
  if (!resource) return;
  resource.entity.destroy();
  resource.mesh.destroy();
  resource.vertexBuffer.destroy();
  resource.indexBuffer.destroy();
}

/** Scalar material edits stay independent of geometry and neighbouring stones. */
function updateSettings(settings: Required<SurfaceSettings>, next: SurfaceSettings = {}): void {
  if (next.color && /^#[0-9a-f]{6}$/i.test(next.color)) settings.color = next.color;
  if (Number.isFinite(next.tileSize)) settings.tileSize = Math.max(0.01, next.tileSize!);
  if (Number.isFinite(next.strength)) settings.strength = Math.max(0, next.strength!);
  if (Number.isFinite(next.roughness)) settings.roughness = Math.max(0, Math.min(1, next.roughness!));
  if (typeof next.detail === "boolean") settings.detail = next.detail;
}

function releaseRock(rock: RockState): void {
  release(rock.rock);
  release(rock.guide);
  release(rock.wire);
  rock.grass.dispose();
  // Material factory retains ownership until the entire viewer is disposed.
}
