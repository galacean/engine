import {
  BoundingBox,
  type Camera,
  type Engine,
  type Entity,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  type Scene,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import type { WorldEnvironmentRuntime } from "../integrations/terrain/environment/WorldEnvironmentRuntime.ts";
import type { TerrainLightingRuntime } from "../integrations/terrain/lighting/TerrainLightingRuntime.ts";
import {
  clampVista,
  extractSeedWorldBoundaryProfile,
  generatePanoramaVistaBuffers,
  hashVistaU,
  lerpVista,
  smoothVista,
  type SeedWorldVistaPlanSource
} from "../vista/PanoramaVistaGenerator.ts";
import type { SeedWorldFields } from "./SeedWorldFields.ts";
import { SEED_WORLD_ROAD_COLOR_DEFAULT } from "./SeedWorldTerrainRuntime.ts";

const FAR_HORIZON_SHADER_NAME = "SeedWorld/PanoramaFarHorizon";

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

      mat4 renderer_MVPMat;

      sampler2D material_FarA;
      sampler2D material_FarB;

      vec3 material_SunDir;
      vec3 material_SunColor;
      vec3 material_AmbSky;
      vec3 material_AmbGnd;
      vec3 material_HorizonColor;
      vec3 material_SnowAlbedo;
      vec3 material_GroundColor;
      vec3 material_RockTint;
      // x: minDistanceMetres, y: logMaxOverMin
      vec2 material_VistaDistance;
      // x: winterWeight, y: surfaceSnowCover, z: aerialExtinctionScale, w: overallOpacity
      vec4 material_VistaSeason;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 v_uv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attributes) {
        Varyings output;
        output.v_uv = attributes.TEXCOORD_0;
        gl_Position = renderer_MVPMat * attributes.POSITION;
        return output;
      }

      void frag(Varyings input) {
        // The mesh duplicates its seam vertices so texture filtering sees a continuous UV gradient.
        vec2 uv = input.v_uv;
        vec3 outColor = material_HorizonColor;
        float outAlpha = 0.0;

        if (uv.y > 0.002 && uv.y < 0.998) {
          vec4 A = texture2D(material_FarA, uv);
          if (A.a > 0.004) {
            vec4 B = texture2D(material_FarB, uv);
            vec3 N = normalize(A.xyz * 2.0 - 1.0);
            float dist = material_VistaDistance.x * exp(B.x * material_VistaDistance.y);
            vec3 L = normalize(material_SunDir);
            float tanE = L.y / max(length(L.xz), 1e-3);
            float sh = smoothstep(-0.035, 0.055, tanE - (B.y * 1.1 - 0.1));
            float ndl = dot(N, L);

            vec3 amb = material_AmbSky * (1.05 + 0.75 * N.y) + material_AmbGnd * (0.42 - 0.32 * N.y);

            float rockMask = B.z;
            float normElev = B.w;
            float winterWeight = material_VistaSeason.x;
            float snowThreshold = mix(0.38, 0.04, winterWeight);
            float snowCover = material_VistaSeason.y * smoothstep(
              snowThreshold - 0.14, snowThreshold + 0.14, normElev + (1.0 - rockMask) * 0.16);

            vec3 snowLit = material_SnowAlbedo * (material_SunColor * clamp((ndl + 0.18) / 1.18, 0.0, 1.0) * sh + amb);
            float rockWeight = clamp(rockMask * 1.25 + normElev * 0.35, 0.0, 1.0);
            vec3 rockAlbedo = mix(material_GroundColor * 0.88, material_RockTint * 0.48, rockWeight);
            vec3 rockLit = rockAlbedo * (material_SunColor * clamp(ndl, 0.0, 1.0) * sh + amb);
            vec3 mtnCol = mix(rockLit, snowLit, clamp(snowCover * (1.0 - rockMask * 0.58), 0.0, 1.0));

            float transmittance = exp(-dist / material_VistaSeason.z);
            outColor = mix(material_HorizonColor, mtnCol, transmittance);

            float bottomFeather = 1.0 - smoothstep(0.88, 1.0, uv.y);
            float topFeather = smoothstep(0.015, 0.08, uv.y);
            outAlpha = A.a * bottomFeather * topFeather * material_VistaSeason.w;
          }
        }

        gl_FragColor = vec4(outColor, clamp(outAlpha, 0.0, 1.0));
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
  readonly scene: Scene;
  readonly parent: Entity;
  readonly camera: Camera;
  readonly lighting: TerrainLightingRuntime;
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
  readonly root: Entity;
  readonly heightRange = { minimum: 50, maximum: 100 } as const;
  private readonly _scene: Scene;
  private readonly _camera: Camera;
  private readonly _lighting: TerrainLightingRuntime;
  private readonly _environment: WorldEnvironmentRuntime;
  private readonly _horizonMaterial: Material;
  private readonly _horizonMesh: ModelMesh;
  private readonly _farATex: Texture2D;
  private readonly _farBTex: Texture2D;
  private _destroyed = false;

  // Cached uniform vectors
  private readonly _sunDir = new Vector3(0.3, 0.4, -0.85);
  private readonly _sunColor = new Vector3(1.8, 1.65, 1.45);
  private readonly _ambSky = new Vector3(0.28, 0.36, 0.52);
  private readonly _ambGnd = new Vector3(0.14, 0.15, 0.16);
  private readonly _fogColor = new Vector3(0.58, 0.68, 0.78);
  private readonly _groundColor = new Vector3(...SEED_WORLD_ROAD_COLOR_DEFAULT);
  private readonly _rockTint = new Vector3(1, 1, 1);
  private readonly _snowAlbedo = new Vector3(0.88, 0.93, 0.98);
  private readonly _vistaDistance = new Vector2();
  private readonly _vistaSeason = new Vector4(0, 0, 62000, 1.0);

  constructor(options: SeedWorldPanoramaVistaRuntimeOptions) {
    const { engine, plan, fields } = options;
    this._scene = options.scene;
    this._camera = options.camera;
    this._lighting = options.lighting;
    this._environment = options.environment;

    const geologySeed =
      "stageSeeds" in plan ? (plan.stageSeeds.geology ^ plan.rootSeed) >>> 0 : hashVistaU(plan.rootSeed ^ 0x9e3779b9);
    const profile = extractSeedWorldBoundaryProfile(plan, fields);
    const sunDir = this._lighting.system.state.sunDirection;
    const sunAzimuthRadians = Math.atan2(sunDir.x, -sunDir.z);
    const panorama = generatePanoramaVistaBuffers({
      seed: geologySeed,
      sunAzimuthRadians,
      boundaryProfile: profile
    });
    this._vistaDistance.set(panorama.minDistanceKm * 1000, Math.log(panorama.maxDistanceKm / panorama.minDistanceKm));

    const horizonShader = Shader.find(FAR_HORIZON_SHADER_NAME) ?? Shader.create(FAR_HORIZON_SHADER);
    this._horizonMaterial = new Material(engine, horizonShader);
    this._farATex = this._createPanoramaTexture(engine, panorama.width, panorama.height, panorama.farA);
    this._farBTex = this._createPanoramaTexture(engine, panorama.width, panorama.height, panorama.farB);
    const hData = this._horizonMaterial.shaderData;
    hData.setTexture("material_FarA", this._farATex);
    hData.setTexture("material_FarB", this._farBTex);
    hData.setVector3("material_SunDir", this._sunDir);
    hData.setVector3("material_SunColor", this._sunColor);
    hData.setVector3("material_AmbSky", this._ambSky);
    hData.setVector3("material_AmbGnd", this._ambGnd);
    hData.setVector3("material_HorizonColor", this._fogColor);
    hData.setVector3("material_SnowAlbedo", this._snowAlbedo);
    hData.setVector3("material_GroundColor", this._groundColor);
    hData.setVector3("material_RockTint", this._rockTint);
    hData.setVector2("material_VistaDistance", this._vistaDistance);
    hData.setVector4("material_VistaSeason", this._vistaSeason);

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
    this.heightPercent = 85;
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

  /** Update the colors on the baked panorama. */
  setPalette(palette: SeedWorldVistaPalette): void {
    this._groundColor.set(...palette.groundColor);
    this._rockTint.set(...palette.rockTint);
  }

  /**
   * Updates camera-relative horizon alignment and live Day/Night, Season, and Weather uniforms.
   */
  update(): void {
    if (this._destroyed) return;

    const camPos = this._camera.entity.transform.worldPosition;
    // Keep the 9,400 m far horizon cylinder centered horizontally on the camera so it stays inside farClipPlane (12,000 m)
    const anchorY = 95 + (camPos.y - 95) * 0.72;
    this.root.transform.setWorldPosition(camPos.x, anchorY, camPos.z);

    const sunDir = this._lighting.system.state.sunDirection;
    const lightSnap = this._lighting.getSnapshot();
    this._sunDir.set(sunDir.x, sunDir.y, sunDir.z);
    this._sunColor.set(
      lightSnap.sunLightColor[0] * 0.85,
      lightSnap.sunLightColor[1] * 0.85,
      lightSnap.sunLightColor[2] * 0.85
    );

    const fogCol = this._scene.fogColor;
    this._fogColor.set(fogCol.r, fogCol.g, fogCol.b);
    const sunElev = clampVista(lightSnap.sunElevation, -0.35, 1.2);
    const dayFactor = smoothVista(-0.12, 0.25, sunElev);
    this._ambSky.set(
      lerpVista(0.04, Math.max(0.18, fogCol.r * 0.78), dayFactor),
      lerpVista(0.06, Math.max(0.24, fogCol.g * 0.88), dayFactor),
      lerpVista(0.11, Math.max(0.36, fogCol.b * 1.05), dayFactor)
    );
    this._ambGnd.set(this._ambSky.x * 0.45, this._ambSky.y * 0.44, this._ambSky.z * 0.42);

    const env = this._environment.getSnapshot();
    const snowCover = clampVista(env.surface.snowCover, 0, 1);
    const winterWeight = Math.max(env.season.weights.winter, snowCover);

    const fogEnabled = this._lighting.getVisibility().fog;
    const baseFogDensity = fogEnabled ? Math.max(0.00009, this._scene.fogDensity * 0.32) : 0.00006;
    const aerialScale = fogEnabled ? clampVista(0.75 / Math.max(1e-5, baseFogDensity), 42_000, 105_000) : 110_000;
    this._vistaSeason.set(winterWeight, snowCover, aerialScale, 1.0);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._horizonMesh.destroy();
    this._horizonMaterial.destroy();
    this._farATex.destroy();
    this._farBTex.destroy();
  }

  private _createPanoramaTexture(engine: Engine, width: number, height: number, pixels: Uint8Array): Texture2D {
    const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, true, false);
    texture.wrapModeU = TextureWrapMode.Repeat;
    texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    return texture;
  }
}
