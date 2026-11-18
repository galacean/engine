import {
  BackgroundMode,
  Color,
  DirectLight,
  FogMode,
  Material,
  PrimitiveMesh,
  Shader,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  Vector4,
  type Engine,
  type Entity,
  type Scene
} from "@galacean/engine";
import { clamp, hashU, lerp, smooth } from "./generator";
import type { V3, VistaLightingMode, VistaSettings } from "./model";

const VISTA_PALETTES: Record<
  VistaLightingMode,
  {
    zenith: V3;
    horizon: V3;
    cloudShade: V3;
    cloudLight: V3;
    sunColor: V3;
    sunPower: number;
    ambSky: V3;
    ambGnd: V3;
    night: number;
    overcast: number;
  }
> = {
  day: {
    zenith: [0.038, 0.101, 0.221],
    horizon: [0.49, 0.61, 0.73],
    cloudShade: [0.22, 0.29, 0.4],
    cloudLight: [0.86, 0.89, 0.9],
    sunColor: [1.0, 0.87, 0.72],
    sunPower: 1.75,
    ambSky: [0.36, 0.48, 0.68],
    ambGnd: [0.28, 0.34, 0.42],
    night: 0,
    overcast: 0
  },
  golden: {
    zenith: [0.068, 0.093, 0.18],
    horizon: [0.56, 0.35, 0.25],
    cloudShade: [0.18, 0.18, 0.29],
    cloudLight: [0.95, 0.56, 0.32],
    sunColor: [1.0, 0.55, 0.28],
    sunPower: 2.35,
    ambSky: [0.34, 0.35, 0.56],
    ambGnd: [0.32, 0.24, 0.26],
    night: 0,
    overcast: 0
  },
  night: {
    zenith: [0.004, 0.008, 0.023],
    horizon: [0.048, 0.066, 0.111],
    cloudShade: [0.022, 0.032, 0.065],
    cloudLight: [0.085, 0.115, 0.195],
    sunColor: [0.54, 0.72, 1.0],
    sunPower: 0.42,
    ambSky: [0.09, 0.13, 0.24],
    ambGnd: [0.05, 0.07, 0.13],
    night: 1,
    overcast: 0
  },
  overcast: {
    zenith: [0.22, 0.26, 0.31],
    horizon: [0.48, 0.53, 0.58],
    cloudShade: [0.26, 0.3, 0.36],
    cloudLight: [0.64, 0.68, 0.72],
    sunColor: [0.85, 0.86, 0.88],
    sunPower: 0.68,
    ambSky: [0.42, 0.46, 0.52],
    ambGnd: [0.32, 0.35, 0.39],
    night: 0,
    overcast: 0.88
  }
};

// Cold Smoke's 16_vista.js panoramic far-range constants (20 km .. 190 km)
const VISTA_AZ = 1.45;
const VISTA_EL0 = -0.036;
const VISTA_EL1 = 0.095;
const FAR_W = 1024;
const FAR_H = 192;

/**
 * Port of `Vista.buildFar` from `references/cold-smoke/source/src/16_vista.js`:
 * Ray-marches 240 log-spaced steps from 20 km to 190 km over an 8-octave domain-warped
 * ridged multifractal heightfield with Earth curvature drop (-0.0786 * r^2) to bake a
 * 2D panoramic G-buffer:
 * - `farA`: RGB = surface normal (nx, ny, nz), A = skyline coverage
 * - `farB`: R = log(r / 20km) / ln(10), G = sun-horizon self-shadow tangent, B = bare-rock mask
 */
function buildFarPanoramaTextures(engine: Engine, sunAzRad = -0.2): { farA: Texture2D; farB: Texture2D } {
  const tab = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) tab[i] = (hashU(i * 7 + 99991) >>> 8) / 16777216;

  const vn = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ix & 255;
    const x1 = (ix + 1) & 255;
    const y0 = (iy & 255) << 8;
    const y1 = ((iy + 1) & 255) << 8;
    const a = tab[y0 + x0];
    const b = tab[y0 + x1];
    const c = tab[y1 + x0];
    const d = tab[y1 + x1];
    return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
  };

  const envAz = (az: number): number => {
    const a = (az + 0.37) / 0.22;
    const b = (az - 0.62) / 0.28;
    const c = (az - 0.14) / 0.3;
    return 0.62 + 0.52 * Math.exp(-a * a) + 0.38 * Math.exp(-b * b) - 0.18 * Math.exp(-c * c);
  };

  const farH = (x: number, z: number, oct: number): number => {
    const r = Math.hypot(x, z);
    const wx = x + 9 * (vn(x * 0.045 + 3.1, z * 0.045 + 7.7) - 0.5);
    const wz = z + 9 * (vn(x * 0.045 + 11.4, z * 0.045 + 1.9) - 0.5);
    let f = 1 / 15;
    let amp = 1;
    let sum = 0;
    let w = 1;
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(vn(wx * f + o * 17.3, wz * f + o * 9.1) * 2 - 1);
      n *= n * w;
      w = Math.min(1, n * 1.9 + 0.15);
      sum += n * amp;
      f *= 2.1;
      amp *= 0.52;
    }
    const rg = 0.3 + 0.7 * smooth(0.36, 0.62, vn(x * 0.021 + 40.3, z * 0.021 + 13.7));
    return -1400 + smooth(20, 32, r) * envAz(Math.atan2(x, -z)) * rg * Math.pow(sum, 1.3) * 2750 - r * r * 0.0786;
  };

  const A = new Uint8Array(FAR_W * FAR_H * 4);
  const B = new Uint8Array(FAR_W * FAR_H * 4);
  const NR = 220;
  const R0 = 20;
  const R1 = 190;
  const dr = Math.log(R1 / R0) / (NR - 1);
  const del = (VISTA_EL1 - VISTA_EL0) / FAR_H;
  const rad = new Float32Array(NR);
  for (let i = 0; i < NR; i++) rad[i] = R0 * Math.exp(i * dr);
  const tanRow = new Float32Array(FAR_H);
  for (let k = 0; k < FAR_H; k++) tanRow[k] = Math.tan(VISTA_EL1 - (k + 0.5) * del);
  const dist = new Float32Array(FAR_H);
  const sdx = Math.sin(sunAzRad);
  const sdz = -Math.cos(sunAzRad);
  const HS = [0.25, 0.8, 2.4, 6.0];
  const rowOf = (t: number) => (VISTA_EL1 - Math.atan(t)) / del - 0.5;

  for (let c = 0; c < FAR_W; c++) {
    const az = -VISTA_AZ + ((c + 0.5) / FAR_W) * 2 * VISTA_AZ;
    const dx = Math.sin(az);
    const dz = -Math.cos(az);
    dist.fill(0);
    let maxT = Math.tan(VISTA_EL0);
    let tPrev = maxT;
    let rPrev = R0;
    let kBot = FAR_H;

    for (let i = 0; i < NR; i++) {
      const r = rad[i];
      const t = farH(dx * r, dz * r, 6) / (r * 1000);
      if (t > maxT) {
        const kTop = Math.max(0, Math.ceil(rowOf(t)));
        for (let k = Math.min(kBot, FAR_H) - 1; k >= kTop; k--) {
          const f = clamp((tanRow[k] - tPrev) / (t - tPrev), 0, 1);
          dist[k] = rPrev + (r - rPrev) * f;
        }
        if (kTop < kBot) kBot = kTop;
        maxT = t;
      }
      tPrev = t;
      rPrev = r;
    }

    const fr = rowOf(maxT) + 0.5;
    const ks = Math.floor(fr);
    const cov = ks + 1 - fr;
    if (ks >= 0 && ks < FAR_H - 1 && dist[ks] === 0 && dist[ks + 1] > 0 && cov > 0.02) {
      dist[ks] = dist[ks + 1];
    }

    let top = -1;
    for (let k = 0; k < FAR_H; k++) {
      const rr = dist[k];
      if (rr <= 0) continue;
      if (top < 0) top = k;
      const x = dx * rr;
      const z = dz * rr;
      const e = Math.max(0.02, rr * 0.0007);
      const h0 = farH(x, z, 8);
      const gx = -(farH(x + e, z, 8) - h0) / (e * 1000);
      const gz = -(farH(x, z + e, 8) - h0) / (e * 1000);
      const il = 1 / Math.hypot(gx, 1, gz);
      let hzn = -0.1;
      for (let s = 0; s < 4; s++) {
        const q = (farH(x + sdx * HS[s], z + sdz * HS[s], 5) - h0) / (HS[s] * 1000);
        if (q > hzn) hzn = q;
      }
      const rock = smooth(0.9, 0.72, il + (vn(x * 2.7 + 5, z * 2.7) - 0.5) * 0.26);
      const o = (k * FAR_W + c) * 4;
      A[o] = clamp(Math.round(127.5 + 127.5 * gx * il), 0, 255);
      A[o + 1] = clamp(Math.round(127.5 + 127.5 * il), 0, 255);
      A[o + 2] = clamp(Math.round(127.5 + 127.5 * gz * il), 0, 255);
      A[o + 3] = clamp(Math.round(255 * (k === ks ? cov : 1)), 0, 255);
      B[o] = clamp(Math.round((255 * Math.log(rr / 20)) / Math.LN10), 0, 255);
      B[o + 1] = clamp(Math.round((255 * (hzn + 0.1)) / 1.1), 0, 255);
      B[o + 2] = clamp(Math.round(255 * rock), 0, 255);
      B[o + 3] = 255;
    }

    if (top > 0) {
      const s = (top * FAR_W + c) * 4;
      for (let k = top - 1; k >= 0; k--) {
        const o = (k * FAR_W + c) * 4;
        A[o] = A[s];
        A[o + 1] = A[s + 1];
        A[o + 2] = A[s + 2];
        B[o] = B[s];
        B[o + 1] = B[s + 1];
        B[o + 2] = B[s + 2];
        B[o + 3] = 255;
      }
    }
  }

  const upload = (pixels: Uint8Array) => {
    const tex = new Texture2D(engine, FAR_W, FAR_H, TextureFormat.R8G8B8A8, true, false);
    tex.wrapModeU = TextureWrapMode.Clamp;
    tex.wrapModeV = TextureWrapMode.Clamp;
    tex.filterMode = TextureFilterMode.Trilinear;
    tex.setPixelBuffer(pixels);
    tex.generateMipmaps();
    return tex;
  };

  return { farA: upload(A), farB: upload(B) };
}

const COLD_SMOKE_VISTA_SHADER = `Shader "WorldGallery/ColdSmokeMountainVista" {
  SubShader "Default" {
    Pass "Sky" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        CompareFunction = CompareFunction.LessEqual;
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"

      struct Varyings {
        vec3 direction;
      };

      sampler2D material_FarA;
      sampler2D material_FarB;
      vec3 material_ZenithColor;
      vec3 material_HorizonColor;
      vec3 material_CelestialColor;
      vec3 material_CelestialDirection;
      vec3 material_CloudShade;
      vec3 material_CloudLight;
      vec3 material_CloudMotion;
      vec3 material_AmbSky;
      vec3 material_AmbGnd;
      vec4 material_VistaToggles; // x: showFarRanges, y: showCloudSea, z: showCity, w: overcast
      float material_Night;

      Varyings vert(Attributes attributes) {
        Varyings output;
        output.direction = attributes.POSITION;
        gl_Position = camera_VPMat * vec4(attributes.POSITION, 1.0);
        return output;
      }

      float hash(vec2 p) {
        vec3 q = fract(p.xyx * 0.1031);
        q += dot(q, q.yzx + 19.19);
        return fract((q.x + q.y) * q.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 t = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), t.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), t.x),
          t.y
        );
      }

      float surface(vec2 p) {
        vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * p;
        return noise(p) * 0.53 + noise(q * 2.19 + 2.3) * 0.27
          + noise(p * 4.55 - 1.7) * 0.13 + noise(q * 9.12 + 6.7) * 0.07;
      }

      // Cold Smoke 16_vista.js farRanges(): relights the 20-190 km panoramic G-buffer every frame
      vec3 farRanges(vec3 d, vec3 colIn) {
        float az = atan(d.x, -d.z);
        float el = atan(d.y, length(d.xz));
        vec2 uv = vec2(az / 2.90 + 0.5, (0.095 - el) / 0.131);
        vec3 result = colIn;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
          vec4 A = texture2D(material_FarA, uv);
          if (A.a > 0.004) {
            vec4 B = texture2D(material_FarB, uv);
            vec3 N = normalize(A.xyz * 2.0 - 1.0);
            float dist = 20000.0 * exp(B.x * 2.302585);
            vec3 L = normalize(material_CelestialDirection);
            float tanE = L.y / max(length(L.xz), 1e-3);
            float sh = smoothstep(-0.03, 0.05, tanE - (B.y * 1.1 - 0.1));
            float ndl = dot(N, L);
            vec3 amb = material_AmbSky * (1.2 + 0.8 * N.y) + material_AmbGnd * (0.45 - 0.35 * N.y);
            vec3 sunFar = material_CelestialColor * mix(2.2, 0.38, material_Night);
            vec3 snow = vec3(0.92, 0.95, 0.98) * (sunFar * clamp((ndl + 0.18) / 1.18, 0.0, 1.0) * sh + amb);
            vec3 rock = vec3(0.17, 0.155, 0.15) * (sunFar * clamp(ndl, 0.0, 1.0) * sh + amb);
            vec3 c = mix(snow, rock, B.z);
            // Exponential aerial perspective (exp(-dist / 65000))
            c = mix(material_HorizonColor, c, exp(-dist / 65000.0));
            // Submerge lower flanks into the cloud deck (950 m below eye)
            float hc = dist * tan(el) + 950.0;
            float a = A.a * smoothstep(-120.0, 260.0, hc) * smoothstep(0.0, 0.03, uv.x) * (1.0 - smoothstep(0.97, 1.0, uv.x));
            result = mix(colIn, c, a);
          }
        }
        return result;
      }

      vec3 cloudDeck(vec3 ray, vec3 behind, float glow) {
        float down = max(-ray.y, 0.004);
        vec2 p = ray.xz * (0.18 / down) + material_CloudMotion.xy;
        vec2 ripples = p * 4.5 + vec2(10.0, 0.7);
        ripples += 0.28 * vec2(noise(ripples - 7.2), noise(ripples + 9.6));
        float billows = surface(ripples);
        float neighbor = surface(ripples - material_CelestialDirection.xz * 0.25);
        float light = clamp(0.29 + smoothstep(0.38, 0.68, billows) * 0.55 + (billows - neighbor) * 1.72, 0.0, 1.0);
        float sunPath = glow * 0.16 * smoothstep(0.36, 0.65, billows);
        vec3 deck = mix(material_CloudShade, material_CloudLight, light) + material_CelestialColor * sunPath;
        deck = mix(material_HorizonColor, deck, smoothstep(0.003, 0.070, down));
        return mix(behind, deck, smoothstep(0.0, 0.023, down));
      }

      vec3 city(vec3 color, float azimuth, float altitude) {
        vec3 res = color;
        if (azimuth >= 0.06 && azimuth <= 0.54 && altitude >= -0.055 && altitude <= 0.079) {
          float x = (azimuth - 0.29) * 260.0;
          float y = altitude + 0.039;
          float cell = floor(x);
          float random = hash(vec2(cell, 3.8));
          float cluster = exp(-pow(abs(x / 14.7), 1.5))
            + 0.45 * exp(-pow(abs((x - 23.0) / 9.0), 1.8));
          float height = (0.011 + random * random * 0.069) * min(cluster, 1.0);
          float edge = abs(fract(x) - 0.5);
          float tower = step(0.18, random) * (1.0 - smoothstep(0.17 + random * 0.16, 0.37 + random * 0.16, edge));
          float spire = step(0.91, random) * (1.0 - smoothstep(0.025, 0.18, edge));
          float outline = max(
            tower * (1.0 - smoothstep(height, height + 0.0014, y)),
            spire * (1.0 - smoothstep(height, height * 1.4, y))
          );
          outline *= smoothstep(-0.016, 0.008, y) * smoothstep(0.1, 0.35, cluster);
          vec3 building = mix(material_CloudShade * 0.82, material_HorizonColor * 0.59, 0.29 + random * 0.19);
          float window = step(0.70, hash(vec2(cell, floor(y * 1250.0)))) * step(0.42, fract(y * 1250.0));
          building += material_Night * vec3(0.62, 0.41, 0.20) * window;
          res = mix(color, building, outline * 0.84);
        }
        return res;
      }

      vec3 cirrus(vec3 ray, vec3 color, float glow) {
        float above = max(ray.y, 0.012);
        vec2 p = ray.xz * (0.42 / above) + material_CloudMotion.xy * 0.8;
        float mass = surface(vec2(p.x * 0.64 + p.y * 0.22, p.y * 1.36) + 5.3);
        float mask = smoothstep(0.62, 0.78, mass)
          * smoothstep(0.016, 0.09, above) * (1.0 - smoothstep(0.49, 0.78, above));
        vec3 bright = mix(material_HorizonColor, material_CloudLight, 0.53) + glow * material_CelestialColor * 0.12;
        return mix(color, bright, mask * 0.37);
      }

      vec3 nightSky(vec3 color, float azimuth, float altitude) {
        vec2 starGrid = vec2(azimuth * 180.0, altitude * 188.0);
        vec2 starCell = floor(starGrid);
        vec2 starOffset = vec2(hash(starCell + 2.13), hash(starCell - 12.43));
        float spot = length(fract(starGrid) - mix(vec2(0.2), vec2(0.8), starOffset));
        float starlight = (1.0 - smoothstep(0.035, 0.16, spot))
          * pow(hash(starCell), 17.0) * smoothstep(0.016, 0.14, altitude);
        color += vec3(0.70, 0.80, 1.0) * starlight * 1.35;

        float wave = 0.21 + 0.053 * sin(azimuth * 4.5 + 1.7) + 0.035 * sin(azimuth * 8.0 - 1.2);
        wave += (noise(vec2(azimuth * 18.0, 7.2)) - 0.5) * 0.034;
        float curtainHeight = altitude - wave;
        float curtain = smoothstep(-0.026, 0.014, curtainHeight) * exp(-max(curtainHeight, 0.0) * 13.0);
        float stream = 0.36 + 0.64 * noise(vec2(azimuth * 52.0 + altitude * 12.0, 1.28));
        float shimmer = 0.86 + 0.14 * sin(azimuth * 22.0 + material_CloudMotion.z * 0.54);
        vec3 colorA = vec3(0.035, 0.28, 0.21);
        vec3 colorB = vec3(0.28, 0.10, 0.24);
        return color + mix(colorA, colorB, smoothstep(0.0, 0.12, curtainHeight))
          * curtain * stream * shimmer * exp(-abs(azimuth + 0.1) * 1.3);
      }

      void frag(Varyings input) {
        vec3 ray = normalize(input.direction);
        float azimuth = atan(ray.x, -ray.z);
        float altitude = ray.y;
        float air = 1.0 - exp(-max(altitude, 0.0) * 6.6);
        vec3 color = mix(material_HorizonColor, material_ZenithColor, air);
        vec3 source = normalize(material_CelestialDirection);
        float angle = sqrt(max(2.0 * (1.0 - dot(ray, source)), 0.0));
        float glow = exp(-angle * 12.0);
        color += material_CelestialColor * (glow * 0.29 + exp(-angle * 45.0) * 0.74)
          * mix(1.0, 0.43, material_Night);
        if (material_Night > 0.5) {
          color = nightSky(color, azimuth, altitude);
        }
        color = cirrus(ray, color, glow);

        float radius = mix(0.010, 0.013, material_Night);
        float disk = 1.0 - smoothstep(radius, radius + 0.002, angle);
        color += material_CelestialColor * disk * 3.2;

        if (material_VistaToggles.x > 0.5) {
          color = farRanges(ray, color);
        }
        if (material_VistaToggles.y > 0.5 && altitude < 0.0) {
          color = cloudDeck(ray, color, glow);
        }
        if (material_VistaToggles.z > 0.5) {
          color = city(color, azimuth, altitude);
        }

        float overcast = material_VistaToggles.w;
        float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
        vec3 overcastTint = mix(color, vec3(grey), 0.68) * 0.75;
        color = mix(color, overcastTint, overcast * smoothstep(-0.08, 0.18, altitude));
        gl_FragColor = vec4(color, 1.0);
      }
    }
  }
}`;

export interface VistaAtmosphereState {
  sunDirection: Vector3;
  sunColor: Vector3;
  ambSky: Vector3;
  ambGnd: Vector3;
  horizonColor: Vector3;
  zenithColor: Vector3;
  fogDensity: number;
}

export function createColdSmokeVista(engine: Engine, scene: Scene, root: Entity) {
  const shader = Shader.find("WorldGallery/ColdSmokeMountainVista") ?? Shader.create(COLD_SMOKE_VISTA_SHADER);
  const material = new Material(engine, shader);
  const data = material.shaderData;

  const { farA, farB } = buildFarPanoramaTextures(engine, -0.2);
  data.setTexture("material_FarA", farA);
  data.setTexture("material_FarB", farB);

  scene.background.mode = BackgroundMode.Sky;
  scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  scene.background.sky.material = material;

  const sunEntity = root.createChild("Alpine Sun");
  const sun = sunEntity.addComponent(DirectLight);
  sun.shadowType = ShadowType.SoftHigh;
  sun.shadowStrength = 0.75;
  sun.shadowBias = 0.8;
  sun.shadowNormalBias = 0.9;
  scene.sun = sun;
  scene.shadowDistance = 1600;
  scene.shadowCascades = ShadowCascadesMode.TwoCascades;
  scene.shadowResolution = ShadowResolution.High;
  scene.fogMode = FogMode.ExponentialSquared;

  const sunDirection = new Vector3();
  const sunTarget = new Vector3();
  const sunColor = new Vector3();
  const ambSky = new Vector3();
  const ambGnd = new Vector3();
  const horizonColor = new Vector3();
  const zenithColor = new Vector3();
  const cloudShade = new Vector3();
  const cloudLight = new Vector3();
  const cloudMotion = new Vector3();
  const vistaToggles = new Vector4(1, 1, 1, 0);
  data.setVector4("material_VistaToggles", vistaToggles);

  function update(settings: VistaSettings, timeSeconds = 0): VistaAtmosphereState {
    const palette = VISTA_PALETTES[settings.lighting];
    const azRad = (settings.sunAzimuthDegrees * Math.PI) / 180;
    const elRad = (settings.sunElevationDegrees * Math.PI) / 180;
    const cosEl = Math.cos(elRad);
    sunDirection.set(Math.sin(azRad) * cosEl, Math.sin(elRad), -Math.cos(azRad) * cosEl).normalize();
    sunTarget.copyFrom(sunDirection).scale(-1);
    sunEntity.transform.setPosition(0, 0, 0);
    sunEntity.transform.lookAt(sunTarget);

    const directPower = palette.sunPower * lerp(1, 0.35, palette.overcast);
    sun.color.set(
      palette.sunColor[0] * directPower,
      palette.sunColor[1] * directPower,
      palette.sunColor[2] * directPower,
      1
    );
    sunColor.set(
      palette.sunColor[0] * directPower,
      palette.sunColor[1] * directPower,
      palette.sunColor[2] * directPower
    );
    ambSky.set(palette.ambSky[0], palette.ambSky[1], palette.ambSky[2]);
    ambGnd.set(palette.ambGnd[0], palette.ambGnd[1], palette.ambGnd[2]);
    horizonColor.set(palette.horizon[0], palette.horizon[1], palette.horizon[2]);
    zenithColor.set(palette.zenith[0], palette.zenith[1], palette.zenith[2]);
    cloudShade.set(palette.cloudShade[0], palette.cloudShade[1], palette.cloudShade[2]);
    cloudLight.set(palette.cloudLight[0], palette.cloudLight[1], palette.cloudLight[2]);
    cloudMotion.set(timeSeconds * 0.0018, -timeSeconds * 0.0006, timeSeconds);

    scene.ambientLight.diffuseSolidColor = new Color(palette.ambSky[0], palette.ambSky[1], palette.ambSky[2], 1);
    scene.ambientLight.diffuseIntensity = 1.0;
    scene.fogDensity = settings.fogDensity;
    scene.fogColor = new Color(palette.horizon[0], palette.horizon[1], palette.horizon[2], 1);

    data.setVector3("material_ZenithColor", zenithColor);
    data.setVector3("material_HorizonColor", horizonColor);
    data.setVector3("material_CelestialColor", new Vector3(palette.sunColor[0], palette.sunColor[1], palette.sunColor[2]));
    data.setVector3("material_CelestialDirection", sunDirection);
    data.setVector3("material_CloudShade", cloudShade);
    data.setVector3("material_CloudLight", cloudLight);
    data.setVector3("material_CloudMotion", cloudMotion);
    data.setVector3("material_AmbSky", ambSky);
    data.setVector3("material_AmbGnd", ambGnd);
    data.setFloat("material_Night", palette.night);
    vistaToggles.set(
      settings.showFarRanges ? 1 : 0,
      settings.showCloudSea ? 1 : 0,
      settings.showCity ? 1 : 0,
      palette.overcast
    );
    data.setVector4("material_VistaToggles", vistaToggles);

    return {
      sunDirection,
      sunColor,
      ambSky,
      ambGnd,
      horizonColor,
      zenithColor,
      fogDensity: settings.fogDensity
    };
  }

  return { update };
}
