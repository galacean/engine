import {
  BoundingBox,
  Camera,
  Color,
  type Engine,
  Entity,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  Scene,
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
  generateVistaTransitionSkirt,
  hashVista2U,
  hashVistaU,
  lerpVista,
  smoothVista,
  type SeedWorldVistaPlanSource,
  type VistaTransitionSkirtMeshData
} from "../vista/PanoramaVistaGenerator.ts";
import { SEED_WORLD_SEA_LEVEL_METRES, sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";

const TRANSITION_SKIRT_SHADER_NAME = "SeedWorld/PanoramaTransitionSkirt";
const FAR_HORIZON_SHADER_NAME = "SeedWorld/PanoramaFarHorizon";

const TRANSITION_SKIRT_SHADER = `Shader "${TRANSITION_SKIRT_SHADER_NAME}" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState depthState {
        Enabled = true;
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState rasterState {
        CullMode = CullMode.Off;
      }
      DepthState = depthState;
      RasterState = rasterState;
      RenderQueueType = Opaque;

      mat4 renderer_MVPMat;
      vec3 camera_Position;

      sampler2D material_DetailTex;
      sampler2D material_SnowTex;

      vec3 material_SunDir;
      vec3 material_SunColor;
      vec3 material_AmbSky;
      vec3 material_AmbGnd;
      vec3 material_FogColor;
      vec3 material_ZenithColor;
      vec3 material_GrassTint;
      vec3 material_LeafTint;
      vec3 material_SnowAlbedo;
      // x: spring, y: summer, z: autumn, w: winter
      vec4 material_SeasonWeights;
      // x: wetness, y: snowCover, z: fogDensity, w: outerFadeRadius
      vec4 material_ClimateParams;
      // x: bedThickness, y: foldStrength, z: seaLevelMetres, w: innerHalfSizeMetres
      vec4 material_StrataParams;
      // x: worldCenterX, y: worldCenterZ, z: oceanSurfaceDatum (0), w: seabedDatum (-5)
      vec4 material_WorldCenter;

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 COLOR_0;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec3 v_worldPos;
        vec3 v_normal;
        vec4 v_channels; // x: mountainWeight, y: concavity, z: cavityAO, w: sunHorizonTangent
        vec2 v_slopes;   // x: slopeX, y: slopeZ
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attributes) {
        Varyings output;
        output.v_worldPos = attributes.POSITION.xyz;
        output.v_normal = normalize(attributes.NORMAL);
        output.v_channels = attributes.COLOR_0;
        output.v_slopes = attributes.TEXCOORD_0;
        gl_Position = renderer_MVPMat * attributes.POSITION;
        return output;
      }

      vec2 decodeSnowSlope(vec4 t) {
        vec2 q = t.xy * 2.0 - 1.0;
        return q * abs(q);
      }

      float strataAt(vec2 p, float y) {
        float bed = max(16.0, material_StrataParams.x);
        float fold = material_StrataParams.y;
        float k = 0.0061359232;
        float u = y / bed + fold * (
          0.84 * sin(k * (p.x + p.y) + 1.1 * sin(k * (p.x - p.y) + 0.7))
          + 0.32 * sin(2.0 * k * p.x + 1.7 * sin(k * p.y))
          + 0.20 * sin(3.0 * k * p.y + 1.3 * sin(k * p.x) + 1.1)
          + 0.09 * sin(4.0 * k * (p.x - p.y) + 2.0 * sin(k * (p.x + p.y)))
        );
        float ph = 2.1 * sin(k * (p.x - p.y) + 0.4) + 1.3 * sin(2.0 * k * p.y + 1.1 * sin(k * p.x));
        return u + 0.22 * sin(1.9634954 * u + 1.7 + ph) + 0.035 * sin(5.1050881 * u + 0.6 - 0.8 * ph);
      }

      void frag(Varyings input) {
        vec3 wp = input.v_worldPos;
        vec2 wxz = wp.xz;
        vec2 relXZ = wxz - material_WorldCenter.xy;
        vec3 toCam = camera_Position - wp;
        float dist = length(toCam);
        vec3 V = toCam / max(dist, 1e-4);
        vec3 L = normalize(material_SunDir);

        float mnt = clamp(input.v_channels.x, 0.0, 1.0);
        float conc = input.v_channels.y;
        float ao = clamp(input.v_channels.z, 0.25, 1.25);
        float hz = input.v_channels.w;
        vec2 sm = input.v_slopes;

        float tanE = L.y / max(length(L.xz), 1e-3);
        float farShadow = smoothstep(-0.025, 0.04, tanE - hz);

        // Multi-scale wind-worked detail and crag normal offsets
        vec4 d1 = texture2D(material_SnowTex, relXZ / 24.0);
        vec4 d3 = texture2D(material_SnowTex, relXZ / 76.0 + vec2(0.71, 0.23));
        float f1 = 1.0 - smoothstep(80.0, 900.0, dist);
        float f3 = 1.0 - smoothstep(140.0, 1800.0, dist);

        vec4 e1 = texture2D(material_DetailTex, relXZ / 341.333 + vec2(0.13, 0.71));
        vec4 e2 = texture2D(material_DetailTex, relXZ / 1024.0 + vec2(0.57, 0.29));
        vec4 e3 = texture2D(material_DetailTex, relXZ / 82.0 + vec2(0.41, 0.07));
        float q1 = e1.z * 2.0 - 1.0;
        float q2 = e2.z * 2.0 - 1.0;
        float cw = mnt * smoothstep(40.0, 220.0, dist);
        vec2 cs = (
          (q1 / sqrt(q1 * q1 + 0.012)) * (e1.xy - 0.5) * 1.35
          + (q2 / sqrt(q2 * q2 + 0.012)) * (e2.xy - 0.5) * 1.75
        ) * (-cw);
        vec3 Nc = normalize(vec3(-(sm.x + cs.x * 0.4), 1.0, -(sm.y + cs.y * 0.4)));

        // 3D folded rock strata & vertical fracture joints
        float tau = strataAt(relXZ, wp.y);
        float bedFloor = floor(tau);
        float bm = bedFloor - 16.0 * floor(bedFloor / 16.0);
        float lb = texture2D(material_DetailTex, vec2((relXZ.x + relXZ.y) / 1024.0, (floor(tau + 0.5) + 0.5) / 16.0)).z;
        float bench = smoothstep(0.30, 0.44, abs(fract(tau) - 0.5) + (lb - 0.5) * 0.5);
        vec4 sa = texture2D(material_DetailTex, vec2((relXZ.x + relXZ.y) / 1024.0, tau));

        float rgate = clamp((mnt - 0.04) * 5.5, 0.0, 1.0);
        float shut = 0.45 * (1.0 - rgate);
        float fr = fract(tau);
        float bn = texture2D(material_DetailTex, vec2((relXZ.x + relXZ.y) / 2900.0 + bm * 0.37, (relXZ.x - relXZ.y) / 4100.0 + bm * 0.213)).z;
        float cl = clamp((0.86 - Nc.y - shut) * 3.3 + (bn - 0.5) * 3.6 + (lb - 0.5) * 0.8 - conc * 1.1, 0.0, 1.0);
        float hw = cl * 0.44;
        float ctr = 0.47 + (sa.x - 0.5) * 0.08;
        float top = ctr + hw + (sa.x - 0.5) * 0.05 + (e1.z - 0.5) * 0.03;
        float bot = ctr - hw + (e3.z - 0.5) * 0.40 * hw + (e2.z - 0.5) * 0.30 * hw + max(conc - 0.12, 0.0) * 0.8;
        float ew = 0.024 + dist * 0.000025;
        float rb = clamp((top - fr) / ew, 0.0, 1.0) * clamp((fr - bot) / (ew * 2.5), 0.0, 1.0) * smoothstep(0.05, 0.12, hw);
        rb = max(rb, clamp(cl * 2.0 - 0.92, 0.0, 1.0) * (1.0 - smoothstep(0.44, 0.56, lb + (sa.x - 0.5) * 0.3))) * step(0.001, rgate);

        vec2 fd = normalize(sm + vec2(1e-5, 0.0));
        vec4 jw = pow(abs(vec4(fd.x, fd.y, (fd.x + fd.y) * 0.70711, (fd.x - fd.y) * 0.70711)), vec4(10.0));
        float jo = fract(sin(bm * 12.9898 + 4.1) * 43758.547) * 0.22 + (e1.z - 0.5) * 0.30 + (e3.z - 0.5) * 0.16;
        vec4 jc = vec4(relXZ.y * (11.0 / 1024.0), relXZ.x * (11.0 / 1024.0), (relXZ.x - relXZ.y) * (8.0 / 1024.0), (relXZ.x + relXZ.y) * (8.0 / 1024.0)) + jo;
        vec4 jA = smoothstep(vec4(0.035), vec4(0.075), abs(fract(jc) - 0.5));
        vec4 jB = smoothstep(vec4(0.04), vec4(0.10), abs(fract(jc * 3.0 + vec4(0.31, 0.57, 0.13, 0.79) + (sa.y - 0.5) * 0.8) - 0.5) + (sa.z - 0.5) * 0.25);
        float jm = dot(jw, jA * mix(vec4(1.0), jB, 0.6)) / max(jw.x + jw.y + jw.z + jw.w, 1e-4);
        rb *= mix(1.0, jm, smoothstep(0.02, 0.10, hw));

        float steepRock = 1.0 - smoothstep(0.62, 0.76, Nc.y + (e3.z - 0.5) * 0.12);
        float rock = clamp(max(rb, steepRock * 0.82), 0.0, 1.0);

        // Seasonal snowline & biome weights
        float winterWeight = clamp(max(material_SeasonWeights.w, material_ClimateParams.y), 0.0, 1.0);
        float autumnWeight = clamp(material_SeasonWeights.z * (1.0 - winterWeight), 0.0, 1.0);
        float snowLineMetres = mix(330.0 - autumnWeight * 55.0, -30.0, winterWeight);
        float elevSnow = smoothstep(
          snowLineMetres - 55.0,
          snowLineMetres + 65.0,
          wp.y + conc * 58.0 + bench * 26.0 + (e1.z - 0.5) * 38.0
        );
        float snowMask = clamp(max(elevSnow, winterWeight * 0.94) * (1.0 - rock * 0.82), 0.0, 1.0);

        vec2 g1 = decodeSnowSlope(d1) * (0.65 * f1);
        vec2 g3 = decodeSnowSlope(d3) * (0.42 * f3);
        vec2 slope = sm + cs + (g1 + g3) * (0.35 + 0.65 * snowMask) + decodeSnowSlope(d1) * rock * 1.05;
        vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
        float ndl = clamp(dot(N, L), 0.0, 1.0);
        float wrap = clamp((dot(N, L) + 0.12) / 1.12, 0.0, 1.0);

        // Meadow & forest substrate (Spring / Summer / Autumn)
        float canopyPatch = smoothstep(0.36, 0.66, e2.z * 0.6 + e3.z * 0.4 + conc * 0.2);
        vec3 meadowSummer = vec3(0.115, 0.168, 0.072) * material_GrassTint * (0.82 + 0.36 * e1.z);
        vec3 forestSummer = vec3(0.052, 0.095, 0.054) * material_LeafTint * (0.78 + 0.42 * e3.z);
        vec3 meadowAutumn = vec3(0.245, 0.165, 0.078) * (0.84 + 0.32 * e1.z);
        vec3 forestAutumn = mix(vec3(0.23, 0.11, 0.042), vec3(0.065, 0.095, 0.052), smoothstep(0.35, 0.72, e1.w));
        vec3 meadowCol = mix(meadowSummer, meadowAutumn, autumnWeight);
        vec3 forestCol = mix(forestSummer, forestAutumn, autumnWeight);
        float treeLineMask = 1.0 - smoothstep(235.0, 340.0, wp.y);
        vec3 biomeGround = mix(meadowCol, forestCol, canopyPatch * treeLineMask * smoothstep(0.66, 0.88, Nc.y));

        // Coastal shelf & submerged seabed tint near water level (datum Y = 0)
        float oceanDatum = material_WorldCenter.z;
        float shoreBlend = 1.0 - smoothstep(oceanDatum - 3.0, oceanDatum + 14.0, wp.y);
        vec3 sandColor = vec3(0.21, 0.185, 0.14) * (0.85 + 0.3 * e3.z);
        biomeGround = mix(biomeGround, sandColor, shoreBlend * (1.0 - winterWeight * 0.7));

        vec3 amb = material_AmbSky * (0.65 + 0.35 * N.y) + material_AmbGnd * (0.38 - 0.28 * N.y);
        vec3 groundLit = biomeGround * (material_SunColor * ndl * farShadow + amb * ao);

        // Snow lighting (Cold Smoke forward scatter + sky shadow fill)
        vec3 snowDirect = material_SunColor * wrap * farShadow;
        vec3 snowAmb = material_AmbSky * (1.08 + 0.55 * N.y) + material_AmbGnd * (0.42 - 0.32 * N.y);
        vec3 snowLit = material_SnowAlbedo * (snowDirect + snowAmb * ao);
        vec3 surfaceCol = mix(groundLit, snowLit, snowMask);

        // Stratified rock cliff lighting
        if (rock > 0.001) {
          vec4 sb = texture2D(material_DetailTex, vec2((relXZ.x - relXZ.y) / 1024.0 + 0.37, tau * 0.25 + 0.61));
          float lay = clamp(0.5 + ((sb.z - 0.5) * 1.7 + (sa.z - 0.5) * 0.9), 0.0, 1.0);
          vec3 ra = mix(vec3(0.115, 0.110, 0.118), vec3(0.28, 0.255, 0.225), lay);
          ra = mix(ra, vec3(0.26, 0.19, 0.135), smoothstep(0.55, 0.75, sb.z) * 0.35);
          ra *= 0.82 + 0.36 * e1.z;

          vec3 tdir = vec3(0.0, 1.0, 0.0) - N * N.y;
          float fs = fract(tau * 7.0 + 0.75 * sin(tau * 6.2831853 + sa.x * 3.0) + (sa.x - 0.5) * 0.9);
          float saw = (smoothstep(0.0, 0.85, fs) - smoothstep(0.85, 1.0, fs)) * 2.0 - 1.0;
          float ov = smoothstep(top - 0.08 * max(top - bot, 0.05) - 0.04, top - 0.012, fr) * (1.0 - smoothstep(top - 0.01, top + 0.01, fr));
          vec3 Nr = normalize(N - tdir * (-0.85 * saw + (sa.y - 0.5) * 0.55 - 1.25 * ov));

          float near = 1.0 - smoothstep(450.0, 1600.0, dist);
          float lip = smoothstep(0.80, 0.90, fs) * smoothstep(0.38, 0.56, sb.x + (e1.z - 0.5) * 0.45) * near * snowMask;
          vec3 rc = ra * (
            material_SunColor * clamp(dot(Nr, L), 0.0, 1.0) * farShadow * (1.0 - 0.8 * ov)
            + (material_AmbSky * (0.75 + 0.45 * Nr.y) + material_AmbGnd * (0.40 - 0.30 * Nr.y)) * ao * (1.0 - 0.55 * ov)
          );
          surfaceCol = mix(surfaceCol, rc, rock * (1.0 - 0.85 * lip));
        }

        // Wetness darkening during rain
        float wetness = clamp(material_ClimateParams.x, 0.0, 1.0) * (1.0 - snowMask);
        surfaceCol *= 1.0 - 0.24 * wetness;

        // Subtle underwater / coastal water shading where wp.y <= oceanDatum
        float waterMask = 1.0 - smoothstep(oceanDatum - 0.4, oceanDatum + 1.2, wp.y);
        if (waterMask > 0.001) {
          vec2 waveSlope = (e1.xy - 0.5) * 0.08 + (d1.xy - 0.5) * 0.05;
          vec3 Nw = normalize(vec3(-waveSlope.x, 1.0, -waveSlope.y));
          float fresnel = 0.03 + 0.97 * pow(clamp(1.0 - max(dot(Nw, V), 0.0), 0.0, 1.0), 4.5);
          vec3 deepWater = vec3(0.032, 0.165, 0.205) * (material_SunColor * clamp(dot(Nw, L), 0.0, 1.0) * 0.45 + material_AmbSky * 0.85);
          vec3 skyRefl = mix(material_AmbSky * 1.15, material_FogColor, 0.52);
          vec3 Hw = normalize(V + L);
          float sunSpec = pow(clamp(dot(Nw, Hw), 0.0, 1.0), 160.0) * 0.65;
          vec3 waterCol = mix(deepWater, skyRefl, clamp(fresnel * 0.72, 0.0, 0.85)) + material_SunColor * sunSpec;
          float foamLine = smoothstep(oceanDatum - 0.35, oceanDatum + 0.25, wp.y) * (1.0 - smoothstep(oceanDatum + 0.25, oceanDatum + 1.15, wp.y));
          waterCol = mix(waterCol, material_SnowAlbedo * (material_SunColor * 0.45 + material_AmbSky * 0.8), foamLine * 0.35);
          surfaceCol = mix(surfaceCol, waterCol, waterMask);
        }

        // Exponential aerial perspective into the Scene horizon fog
        float fogDensity = material_ClimateParams.z;
        float outerRadius = max(2500.0, material_ClimateParams.w);
        float worldRadius = length(relXZ);
        float rimHaze = smoothstep(outerRadius * 0.78, outerRadius * 0.99, worldRadius);
        float distFog = 1.0 - exp(-pow(dist * fogDensity, 1.45));
        float totalFog = clamp(max(distFog * 0.72, rimHaze * 0.78), 0.0, 0.88);
        vec3 finalColor = mix(surfaceCol, material_FogColor, totalFog);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    }
  }
}`;

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
      vec3 material_FoothillColor;
      // x: minEl, y: spanEl, z: minDistanceMetres, w: logMaxOverMin
      vec4 material_VistaRange;
      // x: winterWeight, y: autumnWeight, z: aerialExtinctionScale, w: overallOpacity
      vec4 material_VistaSeason;

      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec3 v_rayDir;
        vec2 v_uv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attributes) {
        Varyings output;
        output.v_rayDir = attributes.POSITION.xyz;
        output.v_uv = attributes.TEXCOORD_0;
        gl_Position = renderer_MVPMat * attributes.POSITION;
        return output;
      }

      void frag(Varyings input) {
        vec3 d = normalize(input.v_rayDir);
        float az = atan(d.x, -d.z);
        float el = atan(d.y, max(length(d.xz), 1e-4));
        float minEl = material_VistaRange.x;
        float spanEl = material_VistaRange.y;
        float maxEl = minEl + spanEl;

        vec2 uv = vec2(fract(az / 6.28318530718 + 0.5), (maxEl - el) / spanEl);
        vec3 outColor = material_HorizonColor;
        float outAlpha = 0.0;

        if (uv.y > 0.002 && uv.y < 0.998) {
          vec4 A = texture2D(material_FarA, uv);
          if (A.a > 0.004) {
            vec4 B = texture2D(material_FarB, uv);
            vec3 N = normalize(A.xyz * 2.0 - 1.0);
            float dist = material_VistaRange.z * exp(B.x * material_VistaRange.w);
            vec3 L = normalize(material_SunDir);
            float tanE = L.y / max(length(L.xz), 1e-3);
            float sh = smoothstep(-0.035, 0.055, tanE - (B.y * 1.1 - 0.1));
            float ndl = dot(N, L);

            vec3 amb = material_AmbSky * (1.05 + 0.75 * N.y) + material_AmbGnd * (0.42 - 0.32 * N.y);
            vec3 sunFar = material_SunColor * 1.35;

            float rockMask = B.z;
            float normElev = B.w;
            float winterWeight = material_VistaSeason.x;
            float snowThreshold = mix(0.38, 0.04, winterWeight);
            float snowCover = smoothstep(snowThreshold - 0.14, snowThreshold + 0.14, normElev + (1.0 - rockMask) * 0.16);

            vec3 snowLit = material_SnowAlbedo * (sunFar * clamp((ndl + 0.18) / 1.18, 0.0, 1.0) * sh + amb);
            vec3 rockAlbedo = mix(material_FoothillColor, vec3(0.145, 0.135, 0.138), clamp(rockMask * 1.25 + normElev * 0.35, 0.0, 1.0));
            vec3 rockLit = rockAlbedo * (sunFar * clamp(ndl, 0.0, 1.0) * sh + amb);
            vec3 mtnCol = mix(rockLit, snowLit, clamp(snowCover * (1.0 - rockMask * 0.58), 0.0, 1.0));

            // Exponential aerial perspective across 6 km .. 160 km
            float tr = exp(-dist / max(28000.0, material_VistaSeason.z));
            outColor = mix(material_HorizonColor, mtnCol, clamp(0.32 + tr * 0.62, 0.28, 0.94));

            float bottomFeather = smoothstep(minEl, minEl + spanEl * 0.12, el);
            float topFeather = smoothstep(0.015, 0.08, uv.y);
            outAlpha = A.a * bottomFeather * topFeather * material_VistaSeason.w;
          }
        }

        gl_FragColor = vec4(outColor, clamp(outAlpha, 0.0, 1.0));
      }
    }
  }
}`;

function createVistaDetailTexture(engine: Engine): Texture2D {
  const n = 512;
  const h = new Float32Array(n * n);
  const data = new Uint8Array(n * n * 4);
  const octaves: [number, number][] = [
    [6, 1.0],
    [12, 0.5],
    [24, 0.27],
    [48, 0.15],
    [96, 0.085],
    [192, 0.05]
  ];
  const hashFloat = (i: number, seed: number) => (hashVista2U(i, seed) & 0xffffff) / 0x800000 - 1;

  for (let o = 0; o < octaves.length; o++) {
    const [P, amp] = octaves[o]!;
    const lat = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) lat[i] = hashFloat(i, 977 + o);
    for (let y = 0; y < n; y++) {
      const fy = (y * P) / n;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      const y0 = (iy % P) * P;
      const y1 = ((iy + 1) % P) * P;
      for (let x = 0; x < n; x++) {
        const fx = (x * P) / n;
        const ix = Math.floor(fx);
        const tx = fx - ix;
        const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
        const x0 = ix % P;
        const x1 = (ix + 1) % P;
        h[y * n + x] +=
          amp * lerpVista(lerpVista(lat[y0 + x0]!, lat[y0 + x1]!, ux), lerpVista(lat[y1 + x0]!, lat[y1 + x1]!, ux), uy);
      }
    }
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const gx = ((h[y * n + ((x + 1) & 511)]! - h[y * n + ((x + 511) & 511)]!) * 0.5 * n) / 48;
      const gy = ((h[((y + 1) & 511) * n + x]! - h[((y + 511) & 511) * n + x]!) * 0.5 * n) / 48;
      data[i * 4] = clampVista(Math.round(128 + gx * 127), 0, 255);
      data[i * 4 + 1] = clampVista(Math.round(128 + gy * 127), 0, 255);
      data[i * 4 + 2] = clampVista(Math.round(128 + h[i]! * 110), 0, 255);
      data[i * 4 + 3] = hashVistaU(i + 31337) >>> 24;
    }
  }

  const texture = new Texture2D(engine, n, n, TextureFormat.R8G8B8A8, false, false);
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(data);
  return texture;
}

function createVistaSnowTexture(engine: Engine): Texture2D {
  const n = 256;
  const h = new Float32Array(n * n);
  const data = new Uint8Array(n * n * 4);
  const wave = (x: number, y: number, px: number, py: number, phase: number) =>
    Math.sin((px * x + py * y) * ((2 * Math.PI) / n) + phase);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const wind = wave(x, y, 5, 3, 1.8 * wave(x, y, 1, -2, 0.5));
      const drifts = wave(x, y, 2, -1, 1.6 * wave(x, y, -1, -2, 2.0));
      const grain = (hashVista2U(x, y) & 0xffff) / 65536 - 0.5;
      const u = x / n;
      const v = y / n;
      const t = wind * 0.85 + v * 4 + 8;
      const ft = Math.floor(t);
      const fr = t - ft;
      const terr = (ft - 8 + smoothVista(0, 0.35, fr) - v * 4) / 1.7;
      const rip = Math.sin((v * 18 + u * 4 + wind * 0.6) * Math.PI * 2) * 0.08;
      h[y * n + x] = 0.25 * terr + 0.32 * wind + 0.18 * drifts + rip + grain * 0.04;
    }
  }

  const H = (x: number, y: number) => h[((y + n) & (n - 1)) * n + ((x + n) & (n - 1))]!;
  const encSlope = (g: number) => {
    const q = clampVista(g / 36, -1, 1);
    return clampVista(Math.round(127.5 + 127.5 * Math.sign(q) * Math.sqrt(Math.abs(q))), 0, 255);
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const h0 = h[i]!;
      const gx = (H(x + 1, y) - H(x - 1, y)) * 0.5 * n;
      const gy = (H(x, y + 1) - H(x, y - 1)) * 0.5 * n;
      let hz = 0;
      for (const st of [1, 2, 4, 7, 11, 16]) {
        const q = ((H(x, y - st) - h0) / st) * n;
        if (q > hz) hz = q;
      }
      data[i * 4] = encSlope(gx);
      data[i * 4 + 1] = encSlope(gy);
      data[i * 4 + 2] = clampVista(Math.round(127.5 + h0 * 110), 0, 255);
      data[i * 4 + 3] = clampVista(Math.round((hz / 42) * 255), 0, 255);
    }
  }

  const texture = new Texture2D(engine, n, n, TextureFormat.R8G8B8A8, false, false);
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(data);
  return texture;
}

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

export interface SeedWorldPanoramaVistaRuntimeOptions {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly parent: Entity;
  readonly camera: Camera;
  readonly lighting: TerrainLightingRuntime;
  readonly environment: WorldEnvironmentRuntime;
  readonly plan: SeedWorldVistaPlanSource;
  readonly fields: SeedWorldFields;
}

/**
 * Builds the transition skirt and distant panorama once from the initial terrain.
 * Camera and environment changes update the presentation of the generated vista.
 */
export class SeedWorldPanoramaVistaRuntime {
  readonly root: Entity;
  private readonly _scene: Scene;
  private readonly _camera: Camera;
  private readonly _lighting: TerrainLightingRuntime;
  private readonly _environment: WorldEnvironmentRuntime;
  private readonly _skirtMaterial: Material;
  private readonly _horizonEntity: Entity;
  private readonly _horizonMaterial: Material;
  private readonly _horizonMesh: ModelMesh;
  private readonly _detailTex: Texture2D;
  private readonly _snowTex: Texture2D;
  private readonly _farATex: Texture2D;
  private readonly _farBTex: Texture2D;
  private readonly _skirtMesh: ModelMesh;
  private readonly _outerSkirtRadiusMetres: number;
  private _destroyed = false;

  // Cached uniform vectors
  private readonly _sunDir = new Vector3(0.3, 0.4, -0.85);
  private readonly _sunColor = new Vector3(1.8, 1.65, 1.45);
  private readonly _ambSky = new Vector3(0.28, 0.36, 0.52);
  private readonly _ambGnd = new Vector3(0.14, 0.15, 0.16);
  private readonly _fogColor = new Vector3(0.58, 0.68, 0.78);
  private readonly _zenithColor = new Vector3(0.22, 0.36, 0.62);
  private readonly _grassTint = new Vector3(1, 1, 1);
  private readonly _leafTint = new Vector3(1, 1, 1);
  private readonly _snowAlbedo = new Vector3(0.88, 0.93, 0.98);
  private readonly _foothillColor = new Vector3(0.11, 0.15, 0.1);
  private readonly _seasonWeights = new Vector4(0, 1, 0, 0);
  private readonly _climateParams = new Vector4(0, 0, 0.00022, 6800);
  private readonly _strataParams = new Vector4(64, 1.0, SEED_WORLD_SEA_LEVEL_METRES, 1536);
  private readonly _worldCenter = new Vector4(1536, 1536, 0, SEED_WORLD_SEA_LEVEL_METRES);
  private readonly _vistaRange = new Vector4(-0.042, 0.322, 6000, Math.log(160 / 6));
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
    this._outerSkirtRadiusMetres = Math.max(profile.worldHalfSizeMetres * 1.8, 6_800);
    const skirt = generateVistaTransitionSkirt({
      seed: geologySeed,
      boundaryProfile: profile,
      sampleInnerBoundaryHeight: (wx, wz) => sampleSeedWorldHeight(fields, wx, wz),
      outerRadiusMetres: this._outerSkirtRadiusMetres,
      segmentsPerSide: 44,
      radialRings: 26,
      sunAzimuthRadians
    });
    const panorama = generatePanoramaVistaBuffers({
      seed: geologySeed,
      width: 1024,
      height: 256,
      minDistanceKm: 6.0,
      maxDistanceKm: 160.0,
      radialSteps: 140,
      minElevationRadians: -0.042,
      maxElevationRadians: 0.28,
      sunAzimuthRadians,
      boundaryProfile: profile
    });
    this._strataParams.w = profile.worldHalfSizeMetres;
    this._worldCenter.set(profile.worldCenterX, profile.worldCenterZ, 0, SEED_WORLD_SEA_LEVEL_METRES);
    this._vistaRange.set(
      panorama.minElevationRadians,
      panorama.maxElevationRadians - panorama.minElevationRadians,
      panorama.minDistanceKm * 1000,
      Math.log(panorama.maxDistanceKm / panorama.minDistanceKm)
    );

    this.root = options.parent.createChild("SeedWorldPanoramaVista");
    this._detailTex = createVistaDetailTexture(engine);
    this._snowTex = createVistaSnowTexture(engine);

    const skirtShader = Shader.find(TRANSITION_SKIRT_SHADER_NAME) ?? Shader.create(TRANSITION_SKIRT_SHADER);
    this._skirtMaterial = new Material(engine, skirtShader);
    const sData = this._skirtMaterial.shaderData;
    sData.setTexture("material_DetailTex", this._detailTex);
    sData.setTexture("material_SnowTex", this._snowTex);
    sData.setVector3("material_SunDir", this._sunDir);
    sData.setVector3("material_SunColor", this._sunColor);
    sData.setVector3("material_AmbSky", this._ambSky);
    sData.setVector3("material_AmbGnd", this._ambGnd);
    sData.setVector3("material_FogColor", this._fogColor);
    sData.setVector3("material_ZenithColor", this._zenithColor);
    sData.setVector3("material_GrassTint", this._grassTint);
    sData.setVector3("material_LeafTint", this._leafTint);
    sData.setVector3("material_SnowAlbedo", this._snowAlbedo);
    sData.setVector4("material_SeasonWeights", this._seasonWeights);
    sData.setVector4("material_ClimateParams", this._climateParams);
    sData.setVector4("material_StrataParams", this._strataParams);
    sData.setVector4("material_WorldCenter", this._worldCenter);

    this._skirtMesh = this._createSkirtMesh(engine, skirt);
    const skirtRenderer = this.root.createChild("PanoramaTransitionSkirt").addComponent(MeshRenderer);
    skirtRenderer.mesh = this._skirtMesh;
    skirtRenderer.setMaterial(this._skirtMaterial);
    skirtRenderer.receiveShadows = false;
    skirtRenderer.castShadows = false;

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
    hData.setVector3("material_FoothillColor", this._foothillColor);
    hData.setVector4("material_VistaRange", this._vistaRange);
    hData.setVector4("material_VistaSeason", this._vistaSeason);

    this._horizonMesh = buildFarHorizonCylinderMesh(
      engine,
      9_400,
      panorama.minElevationRadians,
      panorama.maxElevationRadians
    );
    this._horizonEntity = this.root.createChild("PanoramaFarHorizonRing");
    const horizonRenderer = this._horizonEntity.addComponent(MeshRenderer);
    horizonRenderer.mesh = this._horizonMesh;
    horizonRenderer.setMaterial(this._horizonMaterial);
    horizonRenderer.priority = -10;
    horizonRenderer.receiveShadows = false;
    horizonRenderer.castShadows = false;
    this.update();
  }

  /**
   * Updates camera-relative horizon alignment and live Day/Night, Season, and Weather uniforms.
   */
  update(): void {
    if (this._destroyed) return;

    const camPos = this._camera.entity.transform.worldPosition;
    // Keep the 9,400 m far horizon cylinder centered horizontally on the camera so it stays inside farClipPlane (12,000 m)
    const anchorY = 95 + (camPos.y - 95) * 0.72;
    this._horizonEntity.transform.setWorldPosition(camPos.x, anchorY, camPos.z);

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
    this._zenithColor.set(this._ambSky.x * 0.65, this._ambSky.y * 0.85, this._ambSky.z * 1.25);

    const env = this._environment.getSnapshot();
    const w = env.season.weights;
    this._seasonWeights.set(w.spring, w.summer, w.autumn, w.winter);
    const sc = env.seasonColors;
    this._grassTint.set(sc.grass.r, sc.grass.g, sc.grass.b);
    this._leafTint.set(sc.treeLeaf.r, sc.treeLeaf.g, sc.treeLeaf.b);

    const winterWeight = clampVista(Math.max(w.winter, env.surface.snowCover), 0, 1);
    const autumnWeight = clampVista(w.autumn * (1 - winterWeight), 0, 1);
    this._foothillColor.set(
      lerpVista(0.085, 0.21, autumnWeight),
      lerpVista(0.135, 0.125, autumnWeight),
      lerpVista(0.085, 0.065, autumnWeight)
    );

    const fogEnabled = this._lighting.getVisibility().fog;
    const baseFogDensity = fogEnabled ? Math.max(0.00009, this._scene.fogDensity * 0.32) : 0.00006;
    this._climateParams.set(env.surface.wetness, env.surface.snowCover, baseFogDensity, this._outerSkirtRadiusMetres);

    const aerialScale = fogEnabled ? clampVista(0.75 / Math.max(1e-5, baseFogDensity), 42_000, 105_000) : 110_000;
    this._vistaSeason.set(winterWeight, autumnWeight, aerialScale, 1.0);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._skirtMesh.destroy();
    this._horizonMesh.destroy();
    this._skirtMaterial.destroy();
    this._horizonMaterial.destroy();
    this._farATex.destroy();
    this._farBTex.destroy();
    this._detailTex.destroy();
    this._snowTex.destroy();
  }

  private _createSkirtMesh(engine: Engine, data: VistaTransitionSkirtMeshData): ModelMesh {
    const vertexCount = data.positions.length / 3;
    const posArray: Vector3[] = new Array(vertexCount);
    const normArray: Vector3[] = new Array(vertexCount);
    const colArray: Color[] = new Array(vertexCount);
    const uvArray: Vector2[] = new Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const p3 = i * 3;
      const c4 = i * 4;
      const s2 = i * 2;
      posArray[i] = new Vector3(data.positions[p3]!, data.positions[p3 + 1]!, data.positions[p3 + 2]!);
      normArray[i] = new Vector3(data.normals[p3]!, data.normals[p3 + 1]!, data.normals[p3 + 2]!);
      colArray[i] = new Color(
        data.channels[c4]!,
        data.channels[c4 + 1]!,
        data.channels[c4 + 2]!,
        data.channels[c4 + 3]!
      );
      uvArray[i] = new Vector2(data.slopes[s2]!, data.slopes[s2 + 1]!);
    }

    const mesh = new ModelMesh(engine, "SeedWorldPanoramaTransitionSkirtMesh");
    mesh.setPositions(posArray);
    mesh.setNormals(normArray);
    mesh.setColors(colArray);
    mesh.setUVs(uvArray);
    mesh.setIndices(data.indices);
    BoundingBox.fromPoints(posArray, mesh.bounds);
    mesh.uploadData(true);
    mesh.addSubMesh(0, data.indices.length, MeshTopology.Triangles);

    return mesh;
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
