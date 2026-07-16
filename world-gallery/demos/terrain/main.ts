// Stage 1 terrain demo. See world-gallery/terrain-reference/design.md for the full spec.
//   * Loads manifest.json → fetches disk R16 heightmap + controlmap → binds CC0 PBR layer textures.
//   * Spawns a single 1024m tile (multi-tile / clipmap is a later stage's problem).
//   * Registers WaterPcgConsumer against TerrainSystem — water-pcg's OceanPreview mesh sizes and
//     positions itself from the terrain's Water-kind coverage (no manual sea level).
//   * dat.gui: heightmap min/max/tile size + autoshader knobs + water toggle.
//   * Clickable debug thumbnail wall on the left (see AssetOverlay.ts).
//   * Bloom + Neutral Tonemapping via Galacean PostProcess.
import {
  BloomEffect,
  Camera,
  Color,
  DirectLight,
  PostProcess,
  Shader,
  ShadowType,
  TonemappingEffect,
  TonemappingMode,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import { TerrainMaterial } from "./src/TerrainMaterial";
import { TerrainRenderer } from "./src/TerrainRenderer";
import { TerrainSystem } from "./src/consumer/TerrainSystem";
import { WaterPcgConsumer } from "./src/consumer/WaterPcgConsumer";
import { mountAssetOverlay } from "./src/debug/AssetOverlay";
import { loadControlMap } from "./src/loader/ControlMapLoader";
import { loadHeightMap } from "./src/loader/HeightMapLoader";
import { loadLayerTextureArrays } from "./src/loader/LayerTextureLoader";
import { loadManifest } from "./src/loader/ManifestLoader";
import terrainShaderSource from "./src/shaders/Terrain.shader?raw";

const status = document.getElementById("status") as HTMLDivElement;
const setStatus = (msg: string) => (status.textContent = msg);

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());

  Shader.create(terrainShaderSource);

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.62, 0.78, 0.92, 1);
  const rootEntity = scene.createRootEntity("root");

  // Camera framing the 1024m tile from a 3/4 elevated angle.
  const camEntity = rootEntity.createChild("camera");
  const camera = camEntity.addComponent(Camera);
  camera.farClipPlane = 12000;
  camera.enableHDR = true; // required for meaningful bloom on bright ridges
  camEntity.transform.setPosition(1500, 1200, 2000);
  const orbit = camEntity.addComponent(OrbitControl);
  orbit.target.set(0, 30, 0);
  orbit.minDistance = 100;
  orbit.maxDistance = 8000;

  // Sun + ambient — proper IBL/HDR probe lands in Stage 2.
  const sunEntity = rootEntity.createChild("sun");
  const sun = sunEntity.addComponent(DirectLight);
  // Enable soft shadows on the sun. Terrain shader does not yet sample CSM (S2 wires that up), but
  // water plane and any Stage-2 foliage/cliff meshes will receive/cast shadows through this.
  sun.shadowType = ShadowType.SoftLow;
  sunEntity.transform.setRotation(-50, 35, 0);
  const ambient = scene.ambientLight;
  ambient.diffuseSolidColor.set(0.45, 0.48, 0.55, 1);
  ambient.diffuseIntensity = 0.6;

  // Post-process: Bloom + Tonemapping (Neutral). Requires an entity with the PostProcess component.
  const postEntity = rootEntity.createChild("post-process");
  const post = postEntity.addComponent(PostProcess);
  const bloom = post.addEffect(BloomEffect);
  bloom.threshold.value = 0.9;
  bloom.intensity.value = 0.5;
  const tone = post.addEffect(TonemappingEffect);
  tone.mode.value = TonemappingMode.Neutral;

  setStatus("fetching manifest…");
  const manifestUrl = new URL("./data/manifest.json", import.meta.url).href;
  const manifest = await loadManifest(manifestUrl);
  const baseRegion = manifest.regions[0];

  setStatus("loading heightmap…");
  const heightUrl = new URL(baseRegion.heightmap.url, manifestUrl).href;
  const controlUrl = new URL(baseRegion.controlmap.url, manifestUrl).href;
  const hm = await loadHeightMap(engine, baseRegion.heightmap, heightUrl);
  setStatus("loading controlmap…");
  const cm = await loadControlMap(engine, baseRegion.controlmap, controlUrl);
  setStatus("loading layer textures…");
  const layers = await loadLayerTextureArrays(engine, manifest.layers, manifestUrl);

  const material = new TerrainMaterial(engine);
  material.setLayerAlbedoArray(layers.albedo);
  material.setLayerNormalArray(layers.normal);
  for (const l of manifest.layers) {
    if (l.kind === "Terrain" && l.params) {
      material.setLayerUvScale(l.id, l.params.uvScale);
      material.setLayerNormalIntensity(l.id, l.params.normalIntensity ?? 1);
    }
  }

  // Single-tile stage. Multi-tile / clipmap comes later with real regions to justify the bookkeeping.
  // Loop is kept so the code shape stays the same when TILE_GRID > 1 for the next stage.
  const TILE_GRID = 1;
  const spawnedRenderers: TerrainRenderer[] = [];
  for (let gy = 0; gy < TILE_GRID; gy++) {
    for (let gx = 0; gx < TILE_GRID; gx++) {
      const offX = (gx - Math.floor(TILE_GRID / 2)) * baseRegion.sizeMeter;
      const offZ = (gy - Math.floor(TILE_GRID / 2)) * baseRegion.sizeMeter;
      const tileEntity = rootEntity.createChild(`terrain-${gx}_${gy}`);
      tileEntity.transform.setPosition(offX, 0, offZ);
      const tr = tileEntity.addComponent(TerrainRenderer);
      tr.setResolution(513);
      tr.setTileSize(baseRegion.sizeMeter);
      tr.setHeightRange(hm.minMetres, hm.maxMetres);
      tr.setHeightMap(hm.texture);
      tr.setControlMap(cm.texture);
      tr.setMaterial(material);
      spawnedRenderers.push(tr);
    }
  }

  // Publish the region into the consumer system so downstream Consumers can query terrain data.
  const terrainSystem = new TerrainSystem();
  terrainSystem.setLayers(manifest.layers);
  terrainSystem.addRegion({
    ref: {
      id: "grid",
      positionXZ: [0, 0],
      sizeMeter: baseRegion.sizeMeter * TILE_GRID
    },
    heightsNorm: hm.heightsNorm,
    control: cm.control,
    minMetres: hm.minMetres,
    maxMetres: hm.maxMetres,
    resolution: hm.resolution
  });

  // Single water Consumer — sea surface Y is inferred from the terrain's water coverage,
  // not passed in. dat.gui carries no water knobs; water is fully driven by the terrain data.
  const water = new WaterPcgConsumer(engine, rootEntity, setStatus);
  terrainSystem.registerConsumer(water);

  const state = {
    minMetres: hm.minMetres,
    maxMetres: hm.maxMetres,
    sizeMeter: baseRegion.sizeMeter,
    autoSlope: 1.0,
    autoHeightReduction: 0,
    water: true
  };
  const gui = new dat.GUI({ width: 320 });

  const heightFolder = gui.addFolder("地形几何 Heightmap (实时)");
  heightFolder.open();
  heightFolder
    .add(state, "minMetres", -200, 100, 1)
    .name("min metres")
    .onChange((v: number) => {
      for (const tr of spawnedRenderers) tr.setHeightRange(v, state.maxMetres);
      // Tell TerrainSystem so consumers (WaterPcgConsumer waterline) recompute against the
      // new range. Otherwise sampleHeight() returns stale metres and the ocean plane stays put.
      terrainSystem.setRegionHeightRange("grid", v, state.maxMetres);
    });
  heightFolder
    .add(state, "maxMetres", 50, 1000, 1)
    .name("max metres")
    .onChange((v: number) => {
      for (const tr of spawnedRenderers) tr.setHeightRange(state.minMetres, v);
      terrainSystem.setRegionHeightRange("grid", state.minMetres, v);
    });
  heightFolder
    .add(state, "sizeMeter", 128, 4096, 32)
    .name("tile size (m)")
    .onChange((v: number) => {
      for (const tr of spawnedRenderers) tr.setTileSize(v);
    });

  // Autoshader (T3D) — baker splits the island: LEFT half auto=0 (painted, ignores these knobs),
  // RIGHT half auto=1 (shader recomputes blend from world normal). Dragging these sliders shows a
  // live contrast between the two modes on the same terrain.
  const autoFolder = gui.addFolder("Autoshader (T3D · 只影响 bit0=1 的右半岛)");
  autoFolder.open();
  autoFolder
    .add(state, "autoSlope", 0.1, 5.0, 0.05)
    .name("auto slope 敏感度")
    .onChange((v: number) => material.setAutoshader(v, state.autoHeightReduction));
  const heightRedCtrl = autoFolder
    .add(state, "autoHeightReduction", 0, 1, 0.01)
    .name("高处减 overlay (T3D)")
    .onChange((v: number) => material.setAutoshader(state.autoSlope, v));
  (heightRedCtrl.domElement.parentElement as HTMLElement).title =
    "T3D auto_shader.glsl:9 auto_height_reduction · 0.01 * vertex.y 减 auto_blend";
  material.setAutoshader(state.autoSlope, state.autoHeightReduction);

  // Water Consumer toggle — kept in the gui because it flips a whole subsystem on/off. The Consumer
  // itself takes zero configuration (surface Y comes from terrain data), so no other water controls
  // exist here.
  const systemsFolder = gui.addFolder("外部系统 Consumers");
  systemsFolder.open();
  systemsFolder
    .add(state, "water")
    .name("水系统 · water-pcg")
    .onChange((v: boolean) => {
      if (v) terrainSystem.registerConsumer(water);
      else terrainSystem.unregisterConsumer(water.id);
    });

  mountAssetOverlay(
    document.body,
    {
      regionId: baseRegion.id,
      resolution: hm.resolution,
      heightsNorm: hm.heightsNorm,
      control: cm.control,
      minMetres: hm.minMetres,
      maxMetres: hm.maxMetres
    },
    manifest.layers.map((l) => ({
      layerId: l.id,
      name: l.name,
      kind: l.kind,
      albedoUrl: l.textures?.albedo ? new URL(l.textures.albedo, manifestUrl).href : undefined,
      normalUrl: l.textures?.normal ? new URL(l.textures.normal, manifestUrl).href : undefined
    })),
    {
      onDebugSelected(mode, layerId, _label) {
        material.setDebug(mode, layerId);
      }
    }
  );

  (window as any).__terrain = { material, state, camera: camEntity, terrainSystem, hm, cm };
  setStatus(`${TILE_GRID}×${TILE_GRID} tiles × ${baseRegion.sizeMeter}m`);
  engine.run();
});
