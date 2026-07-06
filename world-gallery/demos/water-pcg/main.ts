// Water PCG starter demo for AI World Engine ocean / river generation.
import {
  Camera,
  Color,
  Engine,
  MeshRenderer,
  ModelMesh,
  RenderFace,
  UnlitMaterial,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

interface OceanConfig {
  size: number;
  resolution: number;
  waterLevel: number;
  waveAmplitude: number;
  waveLength: number;
  waveSpeed: number;
  alpha: number;
  foamIntensity: number;
}

interface RiverConfig {
  width: number;
  flowSpeed: number;
  bankFeather: number;
}

interface WaterDemoConfig extends OceanConfig, RiverConfig {
  oceanColor: string;
  riverColor: string;
  foamColor: string;
}

enum WaterPreviewMode {
  Ocean = "ocean",
  River = "river"
}

const PREVIEW_MODE_OPTIONS = {
  Ocean: WaterPreviewMode.Ocean,
  River: WaterPreviewMode.River
} as const;

type PreviewModeLabel = keyof typeof PREVIEW_MODE_OPTIONS;

interface GuiState {
  mode: PreviewModeLabel;
}

const config: WaterDemoConfig = {
  size: 90,
  resolution: 72,
  waterLevel: 0,
  waveAmplitude: 0.45,
  waveLength: 12,
  waveSpeed: 0.85,
  alpha: 0.72,
  foamIntensity: 1.1,
  width: 7,
  flowSpeed: 0.18,
  bankFeather: 1.4,
  oceanColor: "#1c8fc7",
  riverColor: "#34a9c9",
  foamColor: "#d8f7ff"
};

const guiState: GuiState = {
  mode: "Ocean"
};

const riverPath = [
  new Vector3(-34, 0.08, -20),
  new Vector3(-22, 0.08, -5),
  new Vector3(-4, 0.08, 4),
  new Vector3(12, 0.08, 0),
  new Vector3(28, 0.08, 15),
  new Vector3(40, 0.08, 25)
];

let activeMode = WaterPreviewMode.Ocean;

function hexToColor(hex: string, alpha: number): Color {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  return new Color(red, green, blue, alpha);
}

function calculateWaveHeight(x: number, z: number, waterLevel: number, time: number): number {
  const frequency = (Math.PI * 2) / Math.max(config.waveLength, 0.001);
  const waveTime = time * config.waveSpeed;
  const waveA = Math.sin((x + z) * frequency + waveTime);
  const waveB = Math.sin((x * 0.45 - z * 0.8) * frequency * 1.7 + waveTime * 1.35);
  return waterLevel + (waveA * 0.65 + waveB * 0.35) * config.waveAmplitude;
}

function createGridPositions(size: number, resolution: number, waterLevel: number, time: number): Vector3[] {
  const segmentCount = Math.max(1, Math.floor(resolution));
  const halfSize = size * 0.5;
  const positions: Vector3[] = [];

  for (let z = 0; z <= segmentCount; z++) {
    for (let x = 0; x <= segmentCount; x++) {
      const u = x / segmentCount;
      const v = z / segmentCount;
      const localX = u * size - halfSize;
      const localZ = v * size - halfSize;
      positions.push(new Vector3(localX, calculateWaveHeight(localX, localZ, waterLevel, time), localZ));
    }
  }

  return positions;
}

function createGridMesh(engine: Engine, size: number, resolution: number, waterLevel: number, time: number): ModelMesh {
  const segmentCount = Math.max(1, Math.floor(resolution));
  const vertexSide = segmentCount + 1;
  const uvs: Vector2[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= segmentCount; z++) {
    for (let x = 0; x <= segmentCount; x++) {
      uvs.push(new Vector2(x / segmentCount, z / segmentCount));
    }
  }

  for (let z = 0; z < segmentCount; z++) {
    for (let x = 0; x < segmentCount; x++) {
      const a = z * vertexSide + x;
      const b = a + 1;
      const c = a + vertexSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return createModelMesh(engine, createGridPositions(size, resolution, waterLevel, time), uvs, indices);
}

function updateGridMesh(mesh: ModelMesh, size: number, resolution: number, waterLevel: number, time: number): void {
  const positions = createGridPositions(size, resolution, waterLevel, time);
  updateMeshBounds(mesh, positions);
  mesh.setPositions(positions);
  mesh.uploadData(false);
}

function createRiverMesh(engine: Engine, points: Vector3[], width: number, yOffset: number): ModelMesh {
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  let distance = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const point = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = new Vector3(next.x - prev.x, 0, next.z - prev.z);
    tangent.normalize();
    const normal = new Vector3(-tangent.z, 0, tangent.x);

    if (i > 0) {
      distance += Vector3.distance(points[i - 1], point);
    }

    const halfWidth = width * 0.5;
    const y = point.y + yOffset;
    positions.push(new Vector3(point.x + normal.x * halfWidth, y, point.z + normal.z * halfWidth));
    positions.push(new Vector3(point.x - normal.x * halfWidth, y, point.z - normal.z * halfWidth));
    uvs.push(new Vector2(0, distance * 0.08));
    uvs.push(new Vector2(1, distance * 0.08));
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  return createModelMesh(engine, positions, uvs, indices);
}

function updateMeshBounds(mesh: ModelMesh, positions: Vector3[]): void {
  const boundsPadding = 3;
  const { min, max } = mesh.bounds;
  min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    min.x = Math.min(min.x, position.x);
    min.y = Math.min(min.y, position.y - boundsPadding);
    min.z = Math.min(min.z, position.z);
    max.x = Math.max(max.x, position.x);
    max.y = Math.max(max.y, position.y + boundsPadding);
    max.z = Math.max(max.z, position.z);
  }
}

function createModelMesh(engine: Engine, positions: Vector3[], uvs: Vector2[], indexValues: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const indices = positions.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues);
  updateMeshBounds(mesh, positions);
  mesh.setPositions(positions);
  mesh.setUVs(uvs);
  mesh.setIndices(indices);
  mesh.uploadData(false);
  mesh.addSubMesh(0, indices.length);
  return mesh;
}

function createWaterMaterial(engine: Engine, baseColor: string, alpha: number): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.isTransparent = true;
  material.renderFace = RenderFace.Double;
  material.baseColor = hexToColor(baseColor, alpha);
  return material;
}

function updateWaterMaterial(material: UnlitMaterial, baseColor: string, alpha: number): void {
  material.baseColor = hexToColor(baseColor, alpha);
}

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.06, 0.1, 0.12, 1);
  const rootEntity = scene.createRootEntity("water-pcg-root");

  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  const control = cameraEntity.addComponent(OrbitControl);

  const oceanGroup = rootEntity.createChild("ocean-preview");
  const oceanRenderer = oceanGroup.createChild("ocean-surface").addComponent(MeshRenderer);
  const oceanMaterial = createWaterMaterial(engine, config.oceanColor, config.alpha);
  let oceanMesh = createGridMesh(engine, config.size, config.resolution, config.waterLevel, 0);
  oceanRenderer.mesh = oceanMesh;
  oceanRenderer.setMaterial(oceanMaterial);

  const riverGroup = rootEntity.createChild("river-preview");
  const riverFoamRenderer = riverGroup.createChild("river-bank").addComponent(MeshRenderer);
  const riverRenderer = riverGroup.createChild("river-water").addComponent(MeshRenderer);
  const riverMaterial = createWaterMaterial(engine, config.riverColor, config.alpha);
  const riverFoamMaterial = createWaterMaterial(engine, config.foamColor, 0.36);
  riverFoamRenderer.setMaterial(riverFoamMaterial);
  riverRenderer.setMaterial(riverMaterial);

  const rebuildOceanMesh = (): void => {
    oceanMesh = createGridMesh(engine, config.size, config.resolution, config.waterLevel, 0);
    oceanRenderer.mesh = oceanMesh;
  };
  const rebuildRiverMeshes = (): void => {
    const bankWidth = config.width + config.bankFeather * 2;
    riverFoamRenderer.mesh = createRiverMesh(engine, riverPath, bankWidth, -0.03);
    riverRenderer.mesh = createRiverMesh(engine, riverPath, config.width, 0.02);
  };
  const updateOceanMaterial = (): void => {
    updateWaterMaterial(oceanMaterial, config.oceanColor, Math.min(1, config.alpha + config.foamIntensity * 0.02));
  };
  const updateRiverMaterials = (): void => {
    updateWaterMaterial(riverMaterial, config.riverColor, config.alpha);
    updateWaterMaterial(riverFoamMaterial, config.foamColor, Math.min(0.54, 0.22 + config.bankFeather * 0.06));
  };
  const setPreviewMode = (mode: WaterPreviewMode): void => {
    activeMode = mode;
    guiState.mode = mode === WaterPreviewMode.Ocean ? "Ocean" : "River";
    oceanGroup.isActive = mode === WaterPreviewMode.Ocean;
    riverGroup.isActive = mode === WaterPreviewMode.River;
    scene.background.solidColor =
      mode === WaterPreviewMode.Ocean ? new Color(0.06, 0.1, 0.12, 1) : new Color(0.05, 0.08, 0.08, 1);

    if (mode === WaterPreviewMode.Ocean) {
      control.target.set(0, 0, 0);
      cameraEntity.transform.setPosition(0, 34, 54);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    } else {
      control.target.set(4, 0, 4);
      cameraEntity.transform.setPosition(0, 28, 44);
      cameraEntity.transform.lookAt(new Vector3(4, 0, 4));
    }
  };

  let gui: dat.GUI | null = null;
  const rebuildGui = (): void => {
    gui?.destroy();
    gui = new dat.GUI({ name: "Water PCG", width: 320 });
    gui
      .add(guiState, "mode", Object.keys(PREVIEW_MODE_OPTIONS) as PreviewModeLabel[])
      .name("Preview")
      .onChange((label: PreviewModeLabel) => {
        setPreviewMode(PREVIEW_MODE_OPTIONS[label]);
        rebuildGui();
      });

    if (activeMode === WaterPreviewMode.Ocean) {
      const oceanFolder = gui.addFolder("Ocean");
      oceanFolder.add(config, "size", 20, 180, 1).name("Size").onFinishChange(rebuildOceanMesh);
      oceanFolder.add(config, "resolution", 4, 128, 1).name("Resolution").onFinishChange(rebuildOceanMesh);
      oceanFolder.add(config, "waterLevel", -2, 3, 0.05).name("Water Level").onChange(() => {
        updateGridMesh(oceanMesh, config.size, config.resolution, config.waterLevel, 0);
      });
      oceanFolder.add(config, "waveAmplitude", 0, 2, 0.01).name("Amplitude");
      oceanFolder.add(config, "waveLength", 2, 40, 0.1).name("Wave Length");
      oceanFolder.add(config, "waveSpeed", 0, 3, 0.01).name("Wave Speed");
      oceanFolder.add(config, "alpha", 0.15, 1, 0.01).name("Alpha").onChange(updateOceanMaterial);
      oceanFolder.add(config, "foamIntensity", 0, 5, 0.1).name("Foam").onChange(updateOceanMaterial);
      oceanFolder.addColor(config, "oceanColor").name("Color").onChange(updateOceanMaterial);
      oceanFolder.open();
    } else {
      const riverFolder = gui.addFolder("River");
      riverFolder.add(config, "width", 2, 18, 0.1).name("Width").onChange(rebuildRiverMeshes);
      riverFolder.add(config, "flowSpeed", 0, 1, 0.01).name("Flow Speed");
      riverFolder.add(config, "bankFeather", 0, 5, 0.1).name("Bank").onChange(() => {
        rebuildRiverMeshes();
        updateRiverMaterials();
      });
      riverFolder.addColor(config, "riverColor").name("Color").onChange(updateRiverMaterials);
      riverFolder.addColor(config, "foamColor").name("Foam Color").onChange(updateRiverMaterials);
      riverFolder.open();
    }
  };

  rebuildRiverMeshes();
  updateOceanMaterial();
  updateRiverMaterials();
  setPreviewMode(WaterPreviewMode.Ocean);
  rebuildGui();
  engine.run();

  const startTime = performance.now();
  const update = (): void => {
    const time = (performance.now() - startTime) / 1000;
    if (activeMode === WaterPreviewMode.Ocean) {
      updateGridMesh(oceanMesh, config.size, config.resolution, config.waterLevel, time);
      updateOceanMaterial();
    } else {
      const riverPulse = Math.sin(time * (1 + config.flowSpeed * 8)) * 0.06;
      updateWaterMaterial(riverMaterial, config.riverColor, Math.max(0.2, Math.min(1, config.alpha + riverPulse)));
      updateWaterMaterial(riverFoamMaterial, config.foamColor, Math.min(0.58, 0.24 + config.bankFeather * 0.06));
    }
    requestAnimationFrame(update);
  };
  update();
});
