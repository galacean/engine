import {
  BoundingBox,
  type Camera,
  type Engine,
  type Entity,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3
} from "@galacean/engine";
import { registerTerrainLightingIncludes } from "@galacean/engine-terrain/surface/SurfaceShader";
import type { WorldEnvironmentRuntime } from "../integrations/terrain/environment/WorldEnvironmentRuntime.ts";
import {
  clampVista,
  extractSeedWorldBoundaryProfile,
  generatePanoramaVistaBuffers,
  hashVistaU,
  PANORAMA_VISTA_DEFAULT_WIDTH,
  type SeedWorldVistaPlanSource
} from "../vista/PanoramaVistaGenerator.ts";
import { seedWorldOriginX, seedWorldOriginZ, type SeedWorldFields } from "./SeedWorldFields.ts";
import { SEED_WORLD_ROAD_COLOR_DEFAULT } from "./SeedWorldTerrainRuntime.ts";

const FAR_HORIZON_SHADER_NAME = "SeedWorld/PanoramaFarHorizon";
const VISTA_NORMAL_MAP_MACRO = "MATERIAL_VISTA_NORMAL_MAP";

const FAR_HORIZON_SHADER = `Shader "${FAR_HORIZON_SHADER_NAME}" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      BlendState blendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState depthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState rasterState {
        CullMode = CullMode.Off;
      }
      BlendState = blendState;
      DepthState = depthState;
      RasterState = rasterState;
      RenderQueueType = Transparent;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #define MATERIAL_DISABLE_PROBE_VOLUME
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"

      sampler2D material_FarA;
      sampler2D material_FarB;
      #ifdef ${VISTA_NORMAL_MAP_MACRO}
        sampler2D material_VistaNormalMap;
      #endif
      vec3 material_GroundColor;
      vec3 material_RockTint;
      vec4 scene_SurfaceSnowColor;
      // x: minDistanceMetres, y: logMaxOverMin
      vec2 material_VistaDistance;
      // x: winterWeight, y: snowCover
      vec2 material_VistaSnow;
      // xz center of the finite terrain, followed by its half size
      vec3 material_VistaTerrainBounds;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
        vec3 positionWS;
        vec4 positionCS;
      };

      #include "ShaderLibrary/PBR/BSDF.glsl"
      #include "shared/TerrainSurfaceData.glsl"
      #include "shared/Lighting.glsl"

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attributes) {
        Varyings output;
        output.uv = attributes.TEXCOORD_0;
        output.positionWS = (renderer_ModelMat * attributes.POSITION).xyz;
        output.positionCS = renderer_MVPMat * attributes.POSITION;
        gl_Position = output.positionCS;
        return output;
      }

      void frag(Varyings input) {
        // The mesh duplicates its seam vertices so texture filtering sees a continuous UV gradient.
        vec2 uv = input.uv;
        if (uv.y <= 0.002 || uv.y >= 0.998) discard;
        vec4 geometry = texture2D(material_FarA, uv);
        if (geometry.a <= 0.004) discard;

        vec4 surface = texture2D(material_FarB, uv);
        #ifdef ${VISTA_NORMAL_MAP_MACRO}
          vec3 bakedNormal = texture2D(material_VistaNormalMap, uv).rgb;
        #else
          vec3 bakedNormal = geometry.rgb;
        #endif
        vec3 normalWS = normalize(bakedNormal * 2.0 - 1.0);
        float distanceMetres = material_VistaDistance.x * exp(surface.x * material_VistaDistance.y);
        vec3 rayWS = normalize(input.positionWS - camera_Position);

        float rockMask = surface.z;
        float snowThreshold = mix(0.38, 0.04, material_VistaSnow.x);
        float snowCover = material_VistaSnow.y * smoothstep(
          snowThreshold - 0.14, snowThreshold + 0.14, surface.w + (1.0 - rockMask) * 0.16);
        vec3 albedo = mix(material_GroundColor, material_RockTint * 0.48, rockMask);
        albedo = mix(albedo, scene_SurfaceSnowColor.rgb, snowCover * (1.0 - rockMask * 0.58));

        // Light the baked surface at its distant position, beyond the local light and probe volumes.
        Varyings lightingVaryings = input;
        lightingVaryings.positionWS = camera_Position + rayWS * distanceMetres;
        SurfaceData surfaceData = terrainProjectBuildSurfaceData(lightingVaryings, albedo, normalWS, 0.0, 0.0, 1.0);
        vec3 lit = terrainProjectFinalLighting(evaluateTerrainProjectLighting(lightingVaryings, surfaceData));

        float bottomFeather = 1.0 - smoothstep(0.88, 1.0, uv.y);
        float topFeather = smoothstep(0.015, 0.08, uv.y);
        vec4 color = vec4(lit, geometry.a * bottomFeather * topFeather);

        #if SCENE_FOG_MODE != 0
          // Sample the scene fog where this sightline leaves the playable terrain.
          vec2 rayXZ = rayWS.xz;
          vec2 edgeOffset = material_VistaTerrainBounds.xy - camera_Position.xz;
          vec2 edgeDistance = (material_VistaTerrainBounds.z + edgeOffset * sign(rayXZ)) /
            max(abs(rayXZ), vec2(0.0001));
          float distanceToTerrainEdge = max(0.001, min(edgeDistance.x, edgeDistance.y));
          color = fog(color, mat3(camera_ViewMat) * (rayWS * distanceToTerrainEdge));
        #endif

        gl_FragColor = color;
      }
    }
  }
}`;

function buildFarHorizonCylinderMesh(
  engine: Engine,
  radiusMetres: number,
  minElevationRadians: number,
  maxElevationRadians: number
): ModelMesh {
  const azSegments = 160;
  const elSegments = 20;
  const vertexCount = (azSegments + 1) * (elSegments + 1);
  const positions: Vector3[] = new Array(vertexCount);
  const uvs: Vector2[] = new Array(vertexCount);

  let vIdx = 0;
  for (let r = 0; r <= elSegments; r++) {
    const v = r / elSegments;
    const el = maxElevationRadians - v * (maxElevationRadians - minElevationRadians);
    const cosEl = Math.cos(el);
    const sinEl = Math.sin(el);
    for (let c = 0; c <= azSegments; c++) {
      const u = c / azSegments;
      const az = (u - 0.5) * Math.PI * 2;
      const x = Math.sin(az) * cosEl * radiusMetres;
      const y = sinEl * radiusMetres;
      const z = -Math.cos(az) * cosEl * radiusMetres;
      positions[vIdx] = new Vector3(x, y, z);
      uvs[vIdx] = new Vector2(u, v);
      vIdx++;
    }
  }

  const indices = new Uint16Array(azSegments * elSegments * 6);
  let ptr = 0;
  const stride = azSegments + 1;
  for (let r = 0; r < elSegments; r++) {
    for (let c = 0; c < azSegments; c++) {
      const i00 = r * stride + c;
      const i10 = i00 + 1;
      const i01 = (r + 1) * stride + c;
      const i11 = i01 + 1;
      indices[ptr++] = i00;
      indices[ptr++] = i01;
      indices[ptr++] = i10;
      indices[ptr++] = i10;
      indices[ptr++] = i01;
      indices[ptr++] = i11;
    }
  }

  const mesh = new ModelMesh(engine, "SeedWorldFarHorizonCylinder");
  mesh.setPositions(positions);
  mesh.setUVs(uvs);
  mesh.setIndices(indices);
  BoundingBox.fromPoints(positions, mesh.bounds);
  mesh.uploadData(true);
  mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
  return mesh;
}

/** Resolved linear RGB colors from the accepted Seed World. */
export interface SeedWorldVistaPalette {
  readonly groundColor: readonly [number, number, number];
  readonly rockTint: readonly [number, number, number];
}

export interface SeedWorldPanoramaVistaRuntimeOptions {
  readonly engine: Engine;
  readonly parent: Entity;
  readonly camera: Camera;
  readonly environment: WorldEnvironmentRuntime;
  readonly plan: SeedWorldVistaPlanSource;
  readonly fields: SeedWorldFields;
  readonly palette?: SeedWorldVistaPalette;
}

/**
 * Builds the distant panorama once from the initial terrain.
 * Camera and environment changes update the presentation of the generated vista.
 */
export class SeedWorldPanoramaVistaRuntime {
  static readonly heightRange = { minimum: 50, maximum: 100 } as const;
  static readonly defaultHeightPercent = 85;
  static readonly defaultNormalWidth = PANORAMA_VISTA_DEFAULT_WIDTH;

  readonly root: Entity;
  readonly heightRange = SeedWorldPanoramaVistaRuntime.heightRange;
  private readonly _camera: Camera;
  private readonly _environment: WorldEnvironmentRuntime;
  private readonly _horizonMaterial: Material;
  private readonly _horizonMesh: ModelMesh;
  private readonly _farATex: Texture2D;
  private readonly _farBTex: Texture2D;
  private _normalMap?: Texture2D;
  private _destroyed = false;

  private readonly _groundColor = new Vector3(...SEED_WORLD_ROAD_COLOR_DEFAULT);
  private readonly _rockTint = new Vector3(1, 1, 1);
  private readonly _vistaSnow = new Vector2();
  private readonly _terrainBounds = new Vector3();

  constructor(options: SeedWorldPanoramaVistaRuntimeOptions) {
    const { engine, plan, fields } = options;
    this._camera = options.camera;
    this._environment = options.environment;

    const geologySeed =
      "stageSeeds" in plan ? (plan.stageSeeds.geology ^ plan.rootSeed) >>> 0 : hashVistaU(plan.rootSeed ^ 0x9e3779b9);
    const profile = extractSeedWorldBoundaryProfile(plan, fields);
    const panorama = generatePanoramaVistaBuffers({
      seed: geologySeed,
      boundaryProfile: profile
    });

    registerTerrainLightingIncludes();
    const horizonShader = Shader.find(FAR_HORIZON_SHADER_NAME) ?? Shader.create(FAR_HORIZON_SHADER);
    this._horizonMaterial = new Material(engine, horizonShader);
    this._farATex = this._createPanoramaTexture(engine, panorama.width, panorama.height, panorama.farA);
    this._farBTex = this._createPanoramaTexture(engine, panorama.width, panorama.height, panorama.farB);
    const hData = this._horizonMaterial.shaderData;
    hData.setTexture("material_FarA", this._farATex);
    hData.setTexture("material_FarB", this._farBTex);
    hData.setVector3("material_GroundColor", this._groundColor);
    hData.setVector3("material_RockTint", this._rockTint);
    hData.setVector2(
      "material_VistaDistance",
      new Vector2(panorama.minDistanceKm * 1000, Math.log(panorama.maxDistanceKm / panorama.minDistanceKm))
    );
    hData.setVector2("material_VistaSnow", this._vistaSnow);
    hData.setVector3("material_VistaTerrainBounds", this._terrainBounds);
    this.setTerrainBounds(fields);

    this._horizonMesh = buildFarHorizonCylinderMesh(
      engine,
      9_400,
      panorama.minElevationRadians,
      panorama.maxElevationRadians
    );
    this.root = options.parent.createChild("SeedWorldPanoramaVista");
    const horizonRenderer = this.root.addComponent(MeshRenderer);
    horizonRenderer.mesh = this._horizonMesh;
    horizonRenderer.setMaterial(this._horizonMaterial);
    horizonRenderer.priority = -10;
    horizonRenderer.receiveShadows = false;
    horizonRenderer.castShadows = false;
    this.heightPercent = SeedWorldPanoramaVistaRuntime.defaultHeightPercent;
    if (options.palette) this.setPalette(options.palette);
    this.update();
  }

  get visible(): boolean {
    return this.root.isActive;
  }

  set visible(value: boolean) {
    this.root.isActive = value;
  }

  /** Scale the panorama around its horizon. */
  get heightPercent(): number {
    return Math.round(this.root.transform.scale.y * 100);
  }

  set heightPercent(value: number) {
    if (!Number.isFinite(value)) return;
    const { minimum, maximum } = this.heightRange;
    const scale = clampVista(value, minimum, maximum) / 100;
    this.root.transform.setScale(1, scale, 1);
  }

  /** Changes the sampling resolution of the baked normal map. */
  setNormalWidth(width: number): void {
    if (width === (this._normalMap ?? this._farATex).width) return;
    const scale = this._farATex.width / width;
    const height = this._farATex.height / scale;
    if (!Number.isInteger(scale) || scale < 1 || !Number.isInteger(height) || height < 1) {
      throw new RangeError("Normal width must evenly divide the baked panorama dimensions.");
    }

    const normalMap = scale === 1 ? undefined : this._createNormalMap(width, height, scale);
    const shaderData = this._horizonMaterial.shaderData;
    shaderData.setTexture("material_VistaNormalMap", normalMap ?? null);
    if (normalMap) shaderData.enableMacro(VISTA_NORMAL_MAP_MACRO);
    else shaderData.disableMacro(VISTA_NORMAL_MAP_MACRO);
    this._normalMap?.destroy();
    this._normalMap = normalMap;
  }

  /** Update the colors on the baked panorama. */
  setPalette(palette: SeedWorldVistaPalette): void {
    this._groundColor.set(...palette.groundColor);
    this._rockTint.set(...palette.rockTint);
  }

  /** Updates the fog reference after a terrain publication. */
  setTerrainBounds(fields: Pick<SeedWorldFields, "sizeMetres" | "worldOrigin">): void {
    const halfSize = fields.sizeMetres * 0.5;
    this._terrainBounds.set(seedWorldOriginX(fields) + halfSize, seedWorldOriginZ(fields) + halfSize, halfSize);
  }

  /**
   * Updates the camera-relative panorama and its snow coverage.
   */
  update(): void {
    if (this._destroyed) return;

    const camPos = this._camera.entity.transform.worldPosition;
    // Keep the 9,400 m far horizon cylinder centered horizontally on the camera so it stays inside farClipPlane (12,000 m)
    const anchorY = 95 + (camPos.y - 95) * 0.72;
    this.root.transform.setWorldPosition(camPos.x, anchorY, camPos.z);

    const snowCover = clampVista(this._environment.surfaceClimate.snowCover, 0, 1);
    this._vistaSnow.set(Math.max(this._environment.winterWeight, snowCover), snowCover);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._horizonMesh.destroy();
    this._horizonMaterial.destroy();
    this._farATex.destroy();
    this._farBTex.destroy();
    this._normalMap?.destroy();
  }

  private _createNormalMap(width: number, height: number, scale: number): Texture2D {
    const source = this._farATex;
    const sourcePixels = new Uint8Array(source.width * source.height * 4);
    source.getPixelBuffer(sourcePixels);
    const pixels = new Uint8Array(width * height * 4);
    const sampleCount = scale * scale;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let red = 0;
        let green = 0;
        let blue = 0;
        for (let row = 0; row < scale; row++) {
          const start = ((y * scale + row) * source.width + x * scale) * 4;
          for (let column = 0; column < scale; column++) {
            const offset = start + column * 4;
            red += sourcePixels[offset]!;
            green += sourcePixels[offset + 1]!;
            blue += sourcePixels[offset + 2]!;
          }
        }
        const index = (y * width + x) * 4;
        pixels[index] = Math.round(red / sampleCount);
        pixels[index + 1] = Math.round(green / sampleCount);
        pixels[index + 2] = Math.round(blue / sampleCount);
        pixels[index + 3] = 255;
      }
    }
    return this._createPanoramaTexture(source.engine, width, height, pixels);
  }

  private _createPanoramaTexture(engine: Engine, width: number, height: number, pixels: Uint8Array): Texture2D {
    const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8_UNorm, true, false);
    texture.wrapModeU = TextureWrapMode.Repeat;
    texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    return texture;
  }
}
