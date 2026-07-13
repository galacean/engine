/**
 * @title Global Illumination
 * @category Light
 */
import * as dat from "dat.gui";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  Camera,
  Logger,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ProbeBrickProbeCountPerDimension,
  ProbeVolume,
  ProbeVolumeBaker,
  ProbeVolumeRegion,
  Shader,
  ShaderProperty,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { Entity, ProbeVolumeJSON, Scene } from "@galacean/engine";
import { probeVolumeData } from "./light-probe-data";

const projectUrl = "https://mdn.alipayobjects.com/oasis_be/afts/file/A*IaYLSLgt64QAAAAAQYAAAAgAekp5AQ/project.json";
const probeMarkerSHProperty = ShaderProperty.getByName("renderer_ProbeSH");

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.resourceManager.retryCount = 2;

  window.addEventListener("resize", () => {
    engine.canvas.resizeByClientSize();
  });

  engine.run();

  engine.resourceManager
    .load({
      type: AssetType.Project,
      url: projectUrl
    })
    .then(() => {
      const scene = engine.sceneManager.activeScene;
      installOrbitControl(scene);
      normalizeProbeDemoMaterials(engine, scene);
      installLightProbe(engine, scene);
    })
    .catch((error) => {
      Logger.error("light", error);
    });
});

function installOrbitControl(scene: Scene): void {
  const camera = scene.rootEntities
    .map((entity) => entity.getComponent(Camera))
    .find((component): component is Camera => Boolean(component?.enabled));
  if (!camera) {
    throw new Error("The light demo requires an enabled scene camera.");
  }

  const control = camera.entity.getComponent(OrbitControl) ?? camera.entity.addComponent(OrbitControl);
  control.target = new Vector3(0, 0, -18);
}

function normalizeProbeDemoMaterials(engine: WebGLEngine, scene: Scene): void {
  const diffuseMaterial = new PBRMaterial(engine);
  diffuseMaterial.metallic = 0;
  diffuseMaterial.roughness = 1;
  diffuseMaterial.baseColor.set(0.92, 0.92, 0.92, 1);

  scene.rootEntities.forEach((entity) => {
    if (entity.name === "Cuboid") {
      entity.getComponent(MeshRenderer)?.setMaterial(diffuseMaterial);
    } else if (entity.name === "Sphere") {
      entity.getComponent(MeshRenderer)?.getMaterial()?.shaderData.enableMacro("MATERIAL_DISABLE_PROBE_VOLUME");
    }
  });
}

function installLightProbe(engine: WebGLEngine, scene: Scene): void {
  const camera = scene.rootEntities
    .map((entity) => entity.getComponent(Camera))
    .find((component): component is Camera => Boolean(component?.enabled));
  if (!camera) {
    throw new Error("The probe demo requires an enabled scene camera.");
  }
  const regionEntity = scene.createRootEntity("probe_volume_region");
  regionEntity.transform.position.set(3, 4, -14);
  regionEntity.transform.scale.set(2, 2, 2);
  const region = regionEntity.addComponent(ProbeVolumeRegion);
  region.size.set(12, 8, 12);
  region.minBrickSize = probeVolumeData.minBrickSize;

  let probeVolume = ProbeVolume.fromJSON(probeVolumeData);
  updateProbeVolumeTransform(region, probeVolume);
  let markerRoot = createProbeMarkers(engine, region, probeVolume);
  let bakedLightingEnabled = true;
  const controls = {
    showMarkers: false,
    get bakedLightingEnabled(): boolean {
      return bakedLightingEnabled;
    },
    toggleBakedLighting: () => {
      bakedLightingEnabled = !bakedLightingEnabled;
      scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
      camera.render();
    },
    bake: () => {
      const previousVolume = probeVolume;
      markerRoot.destroy();
      try {
        probeVolume = ProbeVolumeBaker.bakeRegion(scene, region, {
          camera,
          resolution: 8,
          nearClipPlane: 0.05,
          farClipPlane: 60,
          bounceCount: 1
        });
        probeVolume.normalBias = 0.2;
        markerRoot = createProbeMarkers(engine, region, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
        downloadProbeVolumeArtifact(probeVolume);
        previousVolume.dispose();
        camera.render();
      } catch (error) {
        probeVolume = previousVolume;
        markerRoot = createProbeMarkers(engine, region, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
        Logger.error("probe bake", error);
      }
    }
  };
  markerRoot.isActive = controls.showMarkers;

  scene.environmentLighting.probeVolume = probeVolume;
  camera.render();
  createProbeDebug(
    region,
    controls,
    (visible) => {
      markerRoot.isActive = visible;
    },
    () => {
      if (!updateProbeMarkerPositions(markerRoot, region)) {
        markerRoot.destroy();
        markerRoot = createProbeMarkers(engine, region, probeVolume);
        markerRoot.isActive = controls.showMarkers;
      }
      camera.render();
    }
  );
}

function downloadProbeVolumeArtifact(volume: ProbeVolume): void {
  const data: ProbeVolumeJSON = {
    minBrickSize: volume.minBrickSize,
    normalBias: volume.normalBias,
    viewBias: volume.viewBias,
    localToWorldMatrix: Array.from(volume.localToWorldMatrix.elements),
    bricks: volume.bricks.map((brick) => ({
      position: [brick.position.x, brick.position.y, brick.position.z],
      subdivisionLevel: brick.subdivisionLevel,
      sphericalHarmonics: brick.sphericalHarmonics.map((sh) => Array.from(sh.coefficients)),
      validity: brick.validity ? Array.from(brick.validity) : undefined
    }))
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "probe-volume.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function updateProbeVolumeTransform(region: ProbeVolumeRegion, volume: ProbeVolume): void {
  const sourceMin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const sourceMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let i = 0; i < volume.bricks.length; i++) {
    const brick = volume.bricks[i];
    const brickSize = volume.minBrickSize * Math.pow(3, brick.subdivisionLevel);
    sourceMin.x = Math.min(sourceMin.x, brick.position.x);
    sourceMin.y = Math.min(sourceMin.y, brick.position.y);
    sourceMin.z = Math.min(sourceMin.z, brick.position.z);
    sourceMax.x = Math.max(sourceMax.x, brick.position.x + brickSize);
    sourceMax.y = Math.max(sourceMax.y, brick.position.y + brickSize);
    sourceMax.z = Math.max(sourceMax.z, brick.position.z + brickSize);
  }

  const scaleX = region.size.x / (sourceMax.x - sourceMin.x);
  const scaleY = region.size.y / (sourceMax.y - sourceMin.y);
  const scaleZ = region.size.z / (sourceMax.z - sourceMin.z);
  const gridToRegion = new Matrix(
    scaleX,
    0,
    0,
    0,
    0,
    scaleY,
    0,
    0,
    0,
    0,
    scaleZ,
    0,
    -region.size.x * 0.5 - sourceMin.x * scaleX,
    -region.size.y * 0.5 - sourceMin.y * scaleY,
    -region.size.z * 0.5 - sourceMin.z * scaleZ,
    1
  );
  const localToWorld = new Matrix();
  Matrix.multiply(region.entity.transform.worldMatrix, gridToRegion, localToWorld);
  volume.localToWorldMatrix = localToWorld;
}

function createProbeMarkers(engine: WebGLEngine, region: ProbeVolumeRegion, volume: ProbeVolume): Entity {
  const markerRoot = region.entity.createChild("probe_markers");
  const markerMesh = PrimitiveMesh.createSphere(engine, 0.1, 8);
  const markerMaterial = createProbeMarkerMaterial(engine);
  const hasMatchingLayout = volume.bricks.length === getProbeBrickCount(region);

  forEachProbeMarkerPosition(region, (x, y, z, gridX, gridY, gridZ) => {
    const marker = markerRoot.createChild("probe");
    marker.transform.position.set(x, y, z);

    const renderer = marker.addComponent(MeshRenderer);
    renderer.mesh = markerMesh;
    renderer.setMaterial(markerMaterial);
    renderer.shaderData.setFloatArray(
      probeMarkerSHProperty,
      hasMatchingLayout ? getProbeSphericalHarmonics(volume, region, gridX, gridY, gridZ) : neutralProbeSH
    );
  });

  return markerRoot;
}

function updateProbeMarkerPositions(markerRoot: Entity, region: ProbeVolumeRegion): boolean {
  if (markerRoot.children.length !== getProbeMarkerCount(region)) {
    return false;
  }

  let markerIndex = 0;
  forEachProbeMarkerPosition(region, (x, y, z) => {
    markerRoot.children[markerIndex++].transform.position.set(x, y, z);
  });
  return true;
}

function getProbeMarkerCount(region: ProbeVolumeRegion): number {
  const cellsPerBrick = ProbeBrickProbeCountPerDimension - 1;
  const x = Math.ceil(region.size.x / region.minBrickSize) * cellsPerBrick + 1;
  const y = Math.ceil(region.size.y / region.minBrickSize) * cellsPerBrick + 1;
  const z = Math.ceil(region.size.z / region.minBrickSize) * cellsPerBrick + 1;
  return x * y * z;
}

function getProbeBrickCount(region: ProbeVolumeRegion): number {
  return (
    Math.ceil(region.size.x / region.minBrickSize) *
    Math.ceil(region.size.y / region.minBrickSize) *
    Math.ceil(region.size.z / region.minBrickSize)
  );
}

function getProbeSphericalHarmonics(
  volume: ProbeVolume,
  region: ProbeVolumeRegion,
  gridX: number,
  gridY: number,
  gridZ: number
): Float32Array {
  const cellsPerBrick = ProbeBrickProbeCountPerDimension - 1;
  const brickCountX = Math.ceil(region.size.x / region.minBrickSize);
  const brickCountY = Math.ceil(region.size.y / region.minBrickSize);
  const brickCountZ = Math.ceil(region.size.z / region.minBrickSize);
  const brickX = Math.min(Math.floor(gridX / cellsPerBrick), brickCountX - 1);
  const brickY = Math.min(Math.floor(gridY / cellsPerBrick), brickCountY - 1);
  const brickZ = Math.min(Math.floor(gridZ / cellsPerBrick), brickCountZ - 1);
  const probeX = gridX - brickX * cellsPerBrick;
  const probeY = gridY - brickY * cellsPerBrick;
  const probeZ = gridZ - brickZ * cellsPerBrick;
  const brickIndex = brickX + brickCountX * (brickY + brickCountY * brickZ);
  const probeIndex = probeX + ProbeBrickProbeCountPerDimension * (probeY + ProbeBrickProbeCountPerDimension * probeZ);
  return volume.bricks[brickIndex].sphericalHarmonics[probeIndex].coefficients;
}

function forEachProbeMarkerPosition(
  region: ProbeVolumeRegion,
  callback: (x: number, y: number, z: number, gridX: number, gridY: number, gridZ: number) => void
): void {
  const cellsPerBrick = ProbeBrickProbeCountPerDimension - 1;
  const cellCountX = Math.ceil(region.size.x / region.minBrickSize) * cellsPerBrick;
  const cellCountY = Math.ceil(region.size.y / region.minBrickSize) * cellsPerBrick;
  const cellCountZ = Math.ceil(region.size.z / region.minBrickSize) * cellsPerBrick;
  for (let z = 0; z <= cellCountZ; z++) {
    for (let y = 0; y <= cellCountY; y++) {
      for (let x = 0; x <= cellCountX; x++) {
        callback(
          (x / cellCountX - 0.5) * region.size.x,
          (y / cellCountY - 0.5) * region.size.y,
          (z / cellCountZ - 0.5) * region.size.z,
          x,
          y,
          z
        );
      }
    }
  }
}

function createProbeMarkerMaterial(engine: WebGLEngine): Material {
  const shader = Shader.find("Debug/ProbeMarker") ?? Shader.create(probeMarkerShaderSource);
  return new Material(engine, shader);
}

const neutralProbeSH = new Float32Array(27);
neutralProbeSH[0] = neutralProbeSH[1] = neutralProbeSH[2] = 0.18;

const probeMarkerShaderSource = `Shader "Debug/ProbeMarker" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec3 NORMAL;
      };

      struct Varyings {
        vec3 normalWS;
      };

      mat4 renderer_MVPMat;
      mat4 renderer_NormalMat;
      vec3 renderer_ProbeSH[9];

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        output.normalWS = normalize((renderer_NormalMat * vec4(attr.NORMAL, 0.0)).xyz);
        return output;
      }

      vec4 frag(Varyings input) {
        vec3 normal = normalize(input.normalWS);
        vec3 irradiance =
          renderer_ProbeSH[0] * 0.886227 +
          renderer_ProbeSH[1] * (-1.023327 * normal.y) +
          renderer_ProbeSH[2] * ( 1.023327 * normal.z) +
          renderer_ProbeSH[3] * (-1.023327 * normal.x) +
          renderer_ProbeSH[4] * ( 0.858086 * normal.y * normal.x) +
          renderer_ProbeSH[5] * (-0.858086 * normal.y * normal.z) +
          renderer_ProbeSH[6] * ( 0.247708 * (3.0 * normal.z * normal.z - 1.0)) +
          renderer_ProbeSH[7] * (-0.858086 * normal.z * normal.x) +
          renderer_ProbeSH[8] * ( 0.429042 * (normal.x * normal.x - normal.y * normal.y));
        irradiance = max(irradiance, vec3(0.0));
        vec3 displayColor = irradiance / (vec3(1.0) + irradiance * 0.35);
        return vec4(displayColor, 1.0);
      }
    }
  }
}`;

function createProbeDebug(
  region: ProbeVolumeRegion,
  controls: {
    showMarkers: boolean;
    bakedLightingEnabled: boolean;
    toggleBakedLighting: () => void;
    bake: () => void;
  },
  onMarkersChange: (visible: boolean) => void,
  onMarkerGridChange: () => void
): void {
  const gui = new dat.GUI();
  const folder = gui.addFolder("Probe");
  folder.add(controls, "showMarkers").onChange(onMarkersChange);

  const regionFolder = folder.addFolder("Region");
  const positionFolder = regionFolder.addFolder("Position");
  positionFolder.add(region.entity.transform.position, "x", -30, 30, 0.1).onChange(onMarkerGridChange);
  positionFolder.add(region.entity.transform.position, "y", -20, 20, 0.1).onChange(onMarkerGridChange);
  positionFolder.add(region.entity.transform.position, "z", -40, 10, 0.1).onChange(onMarkerGridChange);

  const rotationFolder = regionFolder.addFolder("Rotation");
  rotationFolder.add(region.entity.transform.rotation, "x", -180, 180, 1).onChange(onMarkerGridChange);
  rotationFolder.add(region.entity.transform.rotation, "y", -180, 180, 1).onChange(onMarkerGridChange);
  rotationFolder.add(region.entity.transform.rotation, "z", -180, 180, 1).onChange(onMarkerGridChange);

  const scaleFolder = regionFolder.addFolder("Scale");
  scaleFolder.add(region.entity.transform.scale, "x", 0.1, 4, 0.1).onChange(onMarkerGridChange);
  scaleFolder.add(region.entity.transform.scale, "y", 0.1, 4, 0.1).onChange(onMarkerGridChange);
  scaleFolder.add(region.entity.transform.scale, "z", 0.1, 4, 0.1).onChange(onMarkerGridChange);

  const sizeFolder = regionFolder.addFolder("Size");
  sizeFolder.add(region.size, "x", 1, 40, 1).onChange(onMarkerGridChange);
  sizeFolder.add(region.size, "y", 1, 40, 1).onChange(onMarkerGridChange);
  sizeFolder.add(region.size, "z", 1, 40, 1).onChange(onMarkerGridChange);
  regionFolder.add(region, "minBrickSize", 1, 12, 1).onChange(onMarkerGridChange);
  regionFolder.add(controls, "bake").name("Bake");
  const bakedLightingControl = {
    toggle: () => {
      controls.toggleBakedLighting();
      bakedLightingController.name(controls.bakedLightingEnabled ? "Disable Baked Lighting" : "Enable Baked Lighting");
    }
  };
  const bakedLightingController = regionFolder.add(bakedLightingControl, "toggle").name("Disable Baked Lighting");

  positionFolder.open();
  rotationFolder.open();
  scaleFolder.open();
  sizeFolder.open();
  regionFolder.open();
  folder.open();
}
