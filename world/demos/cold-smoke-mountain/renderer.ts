import {
  BloomEffect,
  BoundingBox,
  Camera,
  Color,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PBRMaterial,
  PostProcess,
  Ray,
  Scene,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  TonemappingEffect,
  TonemappingMode,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine,
  WebGLMode,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { clamp, createMountainEvaluator, hash2U, hashU, lerp, shapeCurvePoint, smooth } from "./generator";
import type {
  ColdSmokeMountainRecipe,
  ColdSmokeMountainResult,
  GullyValleyFeature,
  MountainGuideOBB,
  RockAppearanceMode,
  V3
} from "./model";
import { createColdSmokeVista } from "./vista";

function createNoiseTexture(engine: WebGLEngine): Texture2D {
  const n = 256;
  const d = new Uint8Array(n * n * 4);
  const r = new Uint8Array(n * n);
  const b = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    r[i] = hashU(i * 2 + 1) >>> 24;
    b[i] = hashU(i * 2 + 0x9e3779) >>> 24;
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const j = ((y + 17) & 255) * n + ((x + 37) & 255);
      d[i * 4] = r[i];
      d[i * 4 + 1] = r[j];
      d[i * 4 + 2] = b[i];
      d[i * 4 + 3] = b[j];
    }
  }
  const tex = new Texture2D(engine, n, n, TextureFormat.R8G8B8A8, false, false);
  tex.wrapModeU = TextureWrapMode.Repeat;
  tex.wrapModeV = TextureWrapMode.Repeat;
  tex.filterMode = TextureFilterMode.Bilinear;
  tex.setPixelBuffer(d);
  return tex;
}

function createDetailTexture(engine: WebGLEngine): Texture2D {
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
  const hashFloat = (i: number, seed: number) => (hash2U(i, seed) & 0xffffff) / 0x800000 - 1;

  for (let o = 0; o < octaves.length; o++) {
    const [P, amp] = octaves[o];
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
          amp * lerp(lerp(lat[y0 + x0], lat[y0 + x1], ux), lerp(lat[y1 + x0], lat[y1 + x1], ux), uy);
      }
    }
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const gx = ((h[y * n + ((x + 1) & 511)] - h[y * n + ((x + 511) & 511)]) * 0.5 * n) / 48;
      const gy = ((h[((y + 1) & 511) * n + x] - h[((y + 511) & 511) * n + x]) * 0.5 * n) / 48;
      data[i * 4] = clamp(Math.round(128 + gx * 127), 0, 255);
      data[i * 4 + 1] = clamp(Math.round(128 + gy * 127), 0, 255);
      data[i * 4 + 2] = clamp(Math.round(128 + h[i] * 110), 0, 255);
      data[i * 4 + 3] = hashU(i + 31337) >>> 24;
    }
  }

  const texture = new Texture2D(engine, n, n, TextureFormat.R8G8B8A8, false, false);
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(data);
  return texture;
}

function createSnowTexture(engine: WebGLEngine): Texture2D {
  const n = 256;
  const h = new Float32Array(n * n);
  const data = new Uint8Array(n * n * 4);

  const wave = (x: number, y: number, px: number, py: number, phase: number) =>
    Math.sin((px * x + py * y) * ((2 * Math.PI) / n) + phase);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const wind = wave(x, y, 5, 3, 1.8 * wave(x, y, 1, -2, 0.5));
      const drifts = wave(x, y, 2, -1, 1.6 * wave(x, y, -1, -2, 2.0));
      const grain = (hash2U(x, y) & 0xffff) / 65536 - 0.5;
      const u = x / n;
      const v = y / n;
      const t = wind * 0.85 + v * 4 + 8;
      const ft = Math.floor(t);
      const fr = t - ft;
      const terr = (ft - 8 + smooth(0, 0.35, fr) - v * 4) / 1.7;
      const rip = Math.sin((v * 18 + u * 4 + wind * 0.6) * Math.PI * 2) * 0.08;
      h[y * n + x] = 0.25 * terr + 0.32 * wind + 0.18 * drifts + rip + grain * 0.04;
    }
  }

  const H = (x: number, y: number) => h[((y + n) & (n - 1)) * n + ((x + n) & (n - 1))];
  const encSlope = (g: number) => {
    const q = clamp(g / 36, -1, 1);
    return clamp(Math.round(127.5 + 127.5 * Math.sign(q) * Math.sqrt(Math.abs(q))), 0, 255);
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const h0 = h[i];
      const gx = (H(x + 1, y) - H(x - 1, y)) * 0.5 * n;
      const gy = (H(x, y + 1) - H(x, y - 1)) * 0.5 * n;
      let hz = 0;
      for (const st of [1, 2, 4, 7, 11, 16]) {
        const q = ((H(x, y - st) - h0) / st) * n;
        if (q > hz) hz = q;
      }
      data[i * 4] = encSlope(gx);
      data[i * 4 + 1] = encSlope(gy);
      data[i * 4 + 2] = clamp(Math.round(127.5 + h0 * 110), 0, 255);
      data[i * 4 + 3] = clamp(Math.round((hz / 42) * 255), 0, 255);
    }
  }

  const texture = new Texture2D(engine, n, n, TextureFormat.R8G8B8A8, false, false);
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(data);
  return texture;
}

/**
 * Procedural snow-laden alpine spruce tree generator ported from `next-gallery/demos/cold-smoke/forest.ts`.
 */
function makeSprucePrototype(variant: number) {
  let state = (145109 + variant * 7919) >>> 0;
  const random = () => {
    state = hashU(state + 0x9e3779b9);
    return (state >>> 8) / 16777216;
  };

  const positions: V3[] = [];
  const normals: V3[] = [];
  const colors: Color[] = [];
  const indices: number[] = [];

  const bark = new Color(0.095, 0.076, 0.064, 1);
  const barkShadow = new Color(0.059, 0.048, 0.044, 1);
  const needles = new Color(0.064 + 0.007 * variant, 0.112, 0.114, 1);
  const needleShadow = new Color(0.043, 0.068, 0.082, 1);
  const snow = new Color(0.84, 0.9, 0.96, 1);
  const softSnow = new Color(0.62, 0.71, 0.8, 1);
  const edgeSnow = new Color(0.39, 0.49, 0.58, 1);

  const outline = 5;
  const tiers = 7;
  const lean = (random() - 0.5) * 0.18;
  const crownWidth = 0.88 + random() * 0.32;

  const addVertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, color: Color) => {
    const idx = positions.length;
    positions.push([x + lean * y * y, y, z]);
    normals.push([nx, ny, nz]);
    colors.push(color);
    return idx;
  };

  const TAU = Math.PI * 2;
  for (let side = 0; side < outline; side++) {
    const angle = (side / outline) * TAU;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const tint = side % 2 ? bark : barkShadow;
    addVertex(0.105 * x, -0.04, 0.105 * z, x, 0, z, tint);
    addVertex(0.026 * x, 0.87, 0.026 * z, x, 0, z, tint);
  }
  for (let side = 0; side < outline; side++) {
    const left = 2 * side;
    const right = 2 * ((side + 1) % outline);
    indices.push(left, left + 1, right, right, left + 1, right + 1);
  }

  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const y = 0.19 + t * 0.73 + (tier === tiers - 1 ? 0 : (random() - 0.5) * 0.035);
    const radius = crownWidth * Math.pow(1 - t * 0.9, 0.82);
    const phase = random() * TAU;
    const points = 2 * outline;
    const crest = addVertex(0, Math.min(1, y + 0.1), 0, 0, 1, 0, snow);
    const underside = addVertex(0, y - 0.052, 0, 0, -1, 0, needleShadow);
    const crown: { nearTip: number; edge: number; lower: number }[] = [];

    for (let side = 0; side < points; side++) {
      const tip = side % 2 === 0;
      const angle = phase + (side / points) * TAU;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      const lobe = radius * (tip ? 0.84 + random() * 0.32 : 0.38 + random() * 0.18);
      const drop = (random() - 0.5) * 0.04 - (tip ? 0.04 : 0.014);
      const snowy = random() > (tip ? 0.4 : 0.68);
      const nearTip = addVertex(
        x * lobe * 0.71,
        y + drop * 0.25 + 0.042,
        z * lobe * 0.71,
        x * 0.13,
        1,
        z * 0.13,
        snowy ? snow : tip ? softSnow : needles
      );
      const edge = addVertex(x * lobe, y + drop, z * lobe, x * 0.4, 1, z * 0.4, snowy ? edgeSnow : needles);
      const lower = addVertex(
        x * lobe,
        y + drop,
        z * lobe,
        x * 0.09,
        -1,
        z * 0.09,
        snowy && tip ? edgeSnow : needles
      );
      crown.push({ nearTip, edge, lower });
    }

    for (let side = 0; side < points; side++) {
      const a = crown[side];
      const b = crown[(side + 1) % points];
      indices.push(crest, b.nearTip, a.nearTip);
      indices.push(a.nearTip, b.nearTip, b.edge, a.nearTip, b.edge, a.edge);
      indices.push(underside, a.lower, b.lower);
    }
  }

  return { positions, normals, colors, indices };
}

const COLD_SMOKE_MOUNTAIN_SHADER = `Shader "WorldGallery/ColdSmokeMountainSurface" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      mat4 renderer_MVPMat;
      vec3 camera_Position;

      sampler2D material_DetailTex;
      sampler2D material_SnowTex;
      sampler2D material_NoiseTex;
      vec3 material_SunDir;
      vec3 material_SunColor;
      vec3 material_AmbSky;
      vec3 material_AmbGnd;
      vec3 material_HorizonColor;
      vec3 material_ZenithColor;
      // x: bedThickness, y: foldStrength, z: rockMode (0=bands, 1=patches, 2=heavy, 3=concavity, 4=clay), w: fogDensity
      vec4 material_Params;
      // x: timeSeconds, y: spindriftAmount, z: sparkleGain, w: brushCursorActive
      vec4 material_AnimParams;
      // xy: brushWorldXZ, z: brushRadius, w: unused
      vec4 material_BrushCursor;

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

      // Cold Smoke's 3D folded rock strata function (strataAt in 04_terrain.js)
      float strataAt(vec2 p, float y) {
        float bed = max(16.0, material_Params.x);
        float fold = material_Params.y;
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

      // Blowing snow streams drifting down the slope (driftRho in 04_terrain.js)
      float driftRho(vec2 p, float tm) {
        float za = p.y + tm * 9.0;
        float xm = p.x + 0.55 * sin(za * 0.39270) + 1.4 * sin(za * 0.14726 + 0.9);
        float a = texture2D(material_DetailTex, vec2(xm * (152.0 / 1024.0), za * (25.0 / 1024.0))).z;
        float b = texture2D(material_DetailTex, vec2(xm * (456.0 / 1024.0) + 0.37, (p.y + tm * 12.5) * (19.0 / 1024.0) + 0.61)).z;
        return smoothstep(0.50, 0.74, a) * smoothstep(0.44, 0.70, b) * 1.5;
      }

      // Single-crystal mirror facet glints (sparkLayer in 04_terrain.js)
      vec3 sparkLayer(vec2 wxz, float cell, vec3 N, vec3 Hh) {
        vec2 g = wxz / cell;
        vec2 id = floor(g);
        vec4 r = texture2D(material_NoiseTex, (id + 0.5) / 256.0);
        vec2 tilt = (r.xz - 0.5) * (0.30 + 2.1 * r.y * r.y);
        vec3 n = normalize(N + vec3(tilt.x, 0.0, tilt.y));
        float d = max(dot(n, Hh), 0.0);
        vec2 w = g - id - 0.5 - (r.yw - 0.5) * 0.4;
        float shape = clamp(1.0 - dot(w, w) * 4.5, 0.0, 1.0);
        vec3 tint = mix(vec3(1.0), 0.55 + 0.75 * cos(6.2832 * (r.z + vec3(0.0, 0.33, 0.67))), 0.42 * r.x);
        return tint * (pow(d, 220.0) * shape * shape);
      }

      void frag(Varyings input) {
        vec3 wp = input.v_worldPos;
        vec2 wxz = wp.xz;
        vec3 toCam = camera_Position - wp;
        float dist = length(toCam);
        vec3 V = toCam / max(dist, 1e-4);
        vec3 L = normalize(material_SunDir);

        float mnt = clamp(input.v_channels.x, 0.0, 1.0);
        float conc = input.v_channels.y;
        float ao = clamp(input.v_channels.z, 0.25, 1.25);
        float hz = input.v_channels.w;
        vec2 sm = input.v_slopes;

        float mode = material_Params.z;
        float tanE = L.y / max(length(L.xz), 1e-3);
        float farShadow = smoothstep(-0.018, 0.028, tanE - hz);
        vec3 finalColor = vec3(0.0);

        if (mode > 2.5 && mode < 3.5) {
          // Mode 3: Diagnostic Concavity, Gully & Horizon Self-Shadow Heatmap
          vec3 N0 = normalize(vec3(-sm.x, 1.0, -sm.y));
          float lit = clamp(dot(N0, L), 0.0, 1.0) * (0.35 + 0.65 * farShadow) + 0.32;
          vec3 gullyTint = mix(vec3(0.88, 0.91, 0.95), vec3(0.08, 0.62, 0.92), clamp(conc * 1.1, 0.0, 1.0));
          vec3 ribTint = mix(gullyTint, vec3(0.94, 0.36, 0.14), clamp(-conc * 1.2, 0.0, 1.0));
          finalColor = ribTint * lit * ao;
        } else if (mode > 3.5) {
          // Mode 4: Plain Sculpted Clay
          vec3 N0 = normalize(vec3(-sm.x, 1.0, -sm.y));
          float ndl0 = clamp(dot(N0, L), 0.0, 1.0);
          vec3 clay = vec3(0.68, 0.65, 0.60) * (
            material_SunColor * ndl0 * farShadow * 0.72
            + (material_AmbSky * (0.65 + 0.35 * N0.y) + material_AmbGnd * (0.35 - 0.25 * N0.y)) * ao
          );
          finalColor = pow(max(clay, vec3(0.0)), vec3(1.0 / 2.2));
        } else {
          // Full Cold Smoke Mountain Snow & Rock Strata Pipeline (04_terrain.js)
          vec4 d1 = texture2D(material_SnowTex, wxz / 16.0);
          vec4 d2 = texture2D(material_SnowTex, wxz / 3.6 + vec2(0.37, 0.11));
          vec4 d3 = texture2D(material_SnowTex, wxz / 52.0 + vec2(0.71, 0.23));
          float f1 = 1.0 - smoothstep(50.0, 550.0, dist);
          float f2 = 1.0 - smoothstep(8.0, 90.0, dist);
          float f3 = 1.0 - smoothstep(80.0, 650.0, dist);

          // Crags on the mountain walls finer than the mesh
          vec4 e1 = texture2D(material_DetailTex, wxz / 341.333 + vec2(0.13, 0.71));
          vec4 e2 = texture2D(material_DetailTex, wxz / 1024.0 + vec2(0.57, 0.29));
          float q1 = e1.z * 2.0 - 1.0;
          float q2 = e2.z * 2.0 - 1.0;
          float cw = mnt * smoothstep(35.0, 150.0, dist);
          vec2 cs = (
            (q1 / sqrt(q1 * q1 + 0.012)) * (e1.xy - 0.5) * 1.45
            + (q2 / sqrt(q2 * q2 + 0.012)) * (e2.xy - 0.5) * 1.85
          ) * (-cw);
          vec3 Nc = normalize(vec3(-(sm.x + cs.x * 0.4), 1.0, -(sm.y + cs.y * 0.4)));

          // Snow retention on ledges (bench), inside gullies (conc > 0), and crags
          float tau = strataAt(wxz, wp.y);
          float bedFloor = floor(tau);
          float bm = bedFloor - 16.0 * floor(bedFloor / 16.0);
          float lb = texture2D(material_DetailTex, vec2((wxz.x + wxz.y) / 1024.0, (floor(tau + 0.5) + 0.5) / 16.0)).z;
          float bench = smoothstep(0.30, 0.44, abs(fract(tau) - 0.5) + (lb - 0.5) * 0.5);
          vec4 sa = texture2D(material_DetailTex, vec2((wxz.x + wxz.y) / 1024.0, tau));
          vec4 e3 = texture2D(material_DetailTex, wxz / 73.0 + vec2(0.41, 0.07));
          float hold = bench * 0.16 + conc * 0.42 + max((sa.z - 0.5) * 0.10 + (e1.z - 0.5) * 0.22 + (e2.z - 0.5) * 0.12 + (e3.z - 0.5) * 0.28, -0.20);

          float rgate = clamp((mnt - 0.05) * 7.0, 0.0, 1.0);
          float shut = 0.5 * (1.0 - rgate);
          float patchRock = (1.0 - smoothstep(0.55, 0.64, Nc.y + (d1.z - 0.5) * 0.16 + hold + shut)) * step(0.001, rgate);

          float blendBands = (mode < 0.5 || mode > 1.5) ? 1.0 : 0.0;
          float extraRock = (mode > 1.5 && mode < 2.5) ? 0.075 : 0.0;
          vec3 rk = vec3(0.0, 0.5, 0.0);
          float rock = patchRock;

          if (blendBands > 0.5 && mnt > 0.001) {
            float fr = fract(tau);
            float bn = texture2D(material_DetailTex, vec2((wxz.x + wxz.y) / 2900.0 + bm * 0.37, (wxz.x - wxz.y) / 4100.0 + bm * 0.213)).z;
            float cl = clamp((0.86 + extraRock - Nc.y - shut) * 3.4 + (bn - 0.5) * 3.8 + (lb - 0.5) * 0.8 - conc * 1.15, 0.0, 1.0);
            float hw = cl * (0.42 + 0.5 * extraRock);
            float ctr = 0.47 + (sa.x - 0.5) * 0.08;
            float top = ctr + hw + (sa.x - 0.5) * 0.05 + (e1.z - 0.5) * 0.03;
            float bot = ctr - hw + (e3.z - 0.5) * 0.40 * hw + (e2.z - 0.5) * 0.30 * hw + max(conc - 0.12, 0.0) * 0.82;
            float ew = 0.022 + dist * 0.00003;
            float rb = clamp((top - fr) / ew, 0.0, 1.0) * clamp((fr - bot) / (ew * 2.5), 0.0, 1.0) * smoothstep(0.05, 0.12, hw);
            rb = max(rb, clamp(cl * 2.0 - 0.92, 0.0, 1.0) * (1.0 - smoothstep(0.44, 0.56, lb + (sa.x - 0.5) * 0.3))) * step(0.001, rgate);

            // Vertical fracture joints: 4 orientation families selected by face fall-line
            vec2 fd = normalize(sm + vec2(1e-5, 0.0));
            vec4 jw = pow(abs(vec4(fd.x, fd.y, (fd.x + fd.y) * 0.70711, (fd.x - fd.y) * 0.70711)), vec4(10.0));
            float jo = fract(sin(bm * 12.9898 + 4.1) * 43758.547) * 0.22 + (e1.z - 0.5) * 0.30 + (e3.z - 0.5) * 0.16;
            vec4 jc = vec4(wxz.y * (11.0 / 1024.0), wxz.x * (11.0 / 1024.0), (wxz.x - wxz.y) * (8.0 / 1024.0), (wxz.x + wxz.y) * (8.0 / 1024.0)) + jo;
            vec4 jA = smoothstep(vec4(0.035), vec4(0.075), abs(fract(jc) - 0.5));
            vec4 jB = smoothstep(vec4(0.04), vec4(0.10), abs(fract(jc * 3.0 + vec4(0.31, 0.57, 0.13, 0.79) + (sa.y - 0.5) * 0.8) - 0.5) + (sa.z - 0.5) * 0.25);
            float jm = dot(jw, jA * mix(vec4(1.0), jB, 0.6)) / max(jw.x + jw.y + jw.z + jw.w, 1e-4);
            rb *= mix(1.0, jm, smoothstep(0.02, 0.10, hw));
            rk = vec3(top, max(top - bot, 0.05), rb);
            rock = rb;
          }

          // Middle-distance wind pillows & sastrugi (04_terrain.js#L613-L641)
          float fM = smoothstep(20.0, 50.0, dist) * (1.0 - smoothstep(320.0, 580.0, dist)) * (1.0 - rock);
          vec2 gM = vec2(0.0);
          if (fM > 0.002) {
            vec4 pz = texture2D(material_DetailTex, wxz / 512.0 + vec2(0.23, 0.67));
            float wS = smoothstep(0.42, 0.62, pz.z);
            float wP = 0.55 + 0.45 * (1.0 - smoothstep(0.40, 0.62, pz.z));
            vec4 pil = texture2D(material_DetailTex, wxz / 128.0 + vec2(0.61, 0.17));
            vec4 sas = texture2D(material_DetailTex, vec2(wxz.x / 32.0, wxz.y / 256.0) + vec2(0.29, 0.83));
            float qs = sas.z * 2.0 - 1.0;
            float rs = qs / sqrt(qs * qs + 0.015);
            gM = ((pil.xy - 0.5) * 1.35 * wP - rs * (sas.xy - 0.5) * vec2(1.26, 0.16) * wS) * fM;
          }

          vec2 g1 = decodeSnowSlope(d1) * (0.75 * f1);
          vec2 g2 = decodeSnowSlope(d2) * (0.75 * f2);
          vec2 g3 = decodeSnowSlope(d3) * (0.45 * f3);
          vec2 slope = sm + cs + g1 + g2 + g3 + gM + decodeSnowSlope(d1) * rock * 1.15;

          float cap = smoothstep(rk.x, rk.x + 0.015, fract(tau)) * (1.0 - smoothstep(rk.x + 0.07, rk.x + 0.14, fract(tau))) * step(0.001, rk.y - 0.051) * blendBands;
          slope *= 1.0 - 0.45 * max(bench, cap) * (1.0 - rock) * (1.0 - smoothstep(0.62, 0.80, Nc.y)) * clamp(mnt * 5.0, 0.0, 1.0);

          vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
          float ndl = dot(N, L);
          float nv = max(dot(N, V), 0.0);

          vec2 sdir = normalize(L.xz + vec2(1e-4, 0.0));
          float t3 = max(tanE - dot(sm, sdir), 0.03);
          float msh = 1.0 - smoothstep(t3 * 0.8, t3 * 1.3 + 0.03, d1.w * 0.75 * f1);

          // Blowing spindrift streams (04_terrain.js#L713-L726)
          float tm = material_AnimParams.x;
          float driftMask = material_AnimParams.y * (1.0 - smoothstep(90.0, 480.0, dist)) * (1.0 - rock);
          float dView = 0.0;
          float dSun = 0.0;
          if (driftMask > 0.003) {
            float zg = wxz.y + tm * 10.0;
            float gust = driftMask * smoothstep(0.40, 0.60, texture2D(material_DetailTex, vec2(3.0 * wxz.x + zg, 3.0 * zg - wxz.x) / 1024.0).z);
            if (gust > 0.003) {
              vec2 dpar = wxz + (V.xz - N.xz * nv) / max(nv, 0.08) * 0.16;
              dView = gust * driftRho(dpar, tm);
              dSun = gust * driftRho(wxz + sdir * (0.16 / max(tanE, 0.05)), tm);
            }
          }

          float sh = farShadow * mix(1.0, msh, 0.65) * (1.0 - 0.28 * (1.0 - exp(-dSun * 2.4)));

          // Snow lighting
          float wrap = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
          vec3 Hh = normalize(V + L);
          float fres = pow(1.0 - nv, 5.0);
          vec3 snowAlbedo = vec3(0.92, 0.955, 0.99);
          float back = clamp(dot(normalize(-V.xz + vec2(1e-5, 0.0)), sdir), 0.0, 1.0);
          float mic = 1.0 - 0.55 * back * back * clamp(1.0 - tanE * 1.2, 0.0, 1.0);
          vec3 direct = material_SunColor * wrap * sh * mic;
          float mu = dot(-V, L);
          float fwd = pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 6.0) * (0.25 + 0.75 * fres) * clamp(ndl * 4.0 + 0.6, 0.0, 1.0);
          direct += material_SunColor * fwd * 0.22 * sh;

          vec3 fill = material_SunColor * (0.045 * (1.0 - farShadow));
          vec3 amb = material_AmbSky * (1.15 + 0.65 * N.y) + material_AmbGnd * (0.48 - 0.38 * N.y) + fill;
          vec3 col = snowAlbedo * (direct + amb * ao);
          col += snowAlbedo * material_SunColor * vec3(0.45, 0.26, 0.18) * (sh * (1.0 - sh)) * 0.5;

          float nh = clamp(dot(N, Hh), 0.0, 1.0);
          float spec = pow(nh, 42.0) * (0.04 + 0.96 * fres) * clamp(ndl, 0.0, 1.0) * 0.35;
          vec3 glint = sparkLayer(wxz, 1.8, N, Hh) * (1.0 - smoothstep(60.0, 360.0, dist)) * material_AnimParams.z;
          col += material_SunColor * sh * (vec3(spec) + glint * 8.0) * (1.0 - rock);
          col += mix(material_HorizonColor, material_ZenithColor, 0.35) * (pow(1.0 - nv, 4.0) * 0.32 * ao * (1.0 - rock));

          // Rock strata lighting
          if (rock > 0.001) {
            vec4 sb = texture2D(material_DetailTex, vec2((wxz.x - wxz.y) / 1024.0 + 0.37, tau * 0.25 + 0.61));
            float lay = clamp(0.5 + ((sb.z - 0.5) * 1.7 + (sa.z - 0.5) * 0.9) * mix(1.0, 0.55, smoothstep(500.0, 1600.0, dist)), 0.0, 1.0);
            vec3 ra = mix(vec3(0.125, 0.120, 0.128), vec3(0.31, 0.29, 0.265), lay);
            ra = mix(ra, vec3(0.29, 0.21, 0.15), smoothstep(0.55, 0.75, sb.z) * 0.35);
            ra = mix(ra, vec3(0.085, 0.082, 0.09), (1.0 - smoothstep(0.22, 0.36, sb.z)) * 0.6) * (0.80 + 0.40 * e1.z);

            float bh = fract(sin(bm * 78.233 + 1.3) * 43758.547);
            float bt = clamp(bh + (sa.w - 0.5) * 0.25 + (sb.x - 0.5) * 0.3, 0.0, 1.0);
            vec3 tone = mix(vec3(0.62, 0.67, 0.76), vec3(1.06, 1.00, 0.91), smoothstep(0.18, 0.34, bt));
            tone = mix(tone, vec3(1.28, 0.96, 0.73), smoothstep(0.58, 0.70, bt));
            tone = mix(tone, vec3(1.40, 1.35, 1.25), smoothstep(0.86, 0.95, bt));
            ra *= mix(vec3(1.0), tone, blendBands);

            vec3 tdir = vec3(0.0, 1.0, 0.0) - N * N.y;
            float fr = fract(tau);
            float fs = fract(tau * 7.0 + 0.75 * sin(tau * 6.2831853 + sa.x * 3.0) + (sa.x - 0.5) * 0.9);
            float saw = (smoothstep(0.0, 0.85, fs) - smoothstep(0.85, 1.0, fs)) * 2.0 - 1.0;
            float ov = smoothstep(rk.x - 0.10 * rk.y - 0.045, rk.x - 0.015, fr) * (1.0 - smoothstep(rk.x - 0.012, rk.x + 0.01, fr)) * blendBands;
            vec3 Nr = normalize(N - tdir * mix((sa.y - 0.5) * 1.6 + (sb.y - 0.5) * 1.2, -0.9 * saw + (sa.y - 0.5) * 0.6 - 1.4 * ov, blendBands));

            float near = 1.0 - smoothstep(420.0, 1300.0, dist);
            float lip = smoothstep(0.80, 0.90, fs) * smoothstep(0.38, 0.56, sb.x + (e1.z - 0.5) * 0.45) * near;
            float under = smoothstep(0.52, 0.72, fs) * (1.0 - smoothstep(0.80, 0.86, fs)) * near;
            float ck = texture2D(material_DetailTex, vec2((wxz.x + wxz.y) / 43.0, tau * 0.55 + 0.19)).z;
            ra *= (1.0 - 0.42 * under) * (1.0 - 0.45 * (1.0 - smoothstep(0.27, 0.36, ck)) * near);
            ra *= (1.0 + 0.25 * blendBands) * (1.0 - 0.6 * ov);

            vec3 rc = ra * (
              material_SunColor * clamp(dot(Nr, L), 0.0, 1.0) * sh * (1.0 - 0.85 * ov)
              + (material_AmbSky * (1.15 + 0.65 * Nr.y) + material_AmbGnd * (0.48 - 0.38 * Nr.y) + fill * 1.4) * ao * (1.0 - 0.6 * ov)
            );
            col = mix(col, rc, rock * (1.0 - 0.88 * lip));
          }

          // Blowing spindrift veil in the air
          if (dView > 0.002) {
            float trV = exp(-dView * min(1.0 / max(nv, 0.06), 4.2) * 0.42);
            vec3 driftLit = snowAlbedo * (material_SunColor * (0.55 * sh) + amb);
            col = col * trV + driftLit * (1.0 - trV);
          }

          // Interactive 3D Sculpt Brush Cursor Ring
          if (material_AnimParams.w > 0.5) {
            float bDist = length(wxz - material_BrushCursor.xy);
            float bRadius = max(10.0, material_BrushCursor.z);
            float ring = smoothstep(bRadius - 4.0, bRadius - 1.0, bDist) * (1.0 - smoothstep(bRadius + 1.0, bRadius + 4.0, bDist));
            float fillDisc = (1.0 - smoothstep(0.0, bRadius, bDist)) * 0.18;
            col = mix(col, vec3(0.22, 0.86, 1.0), clamp(ring * 0.9 + fillDisc, 0.0, 1.0));
          }

          // Exponential-squared atmospheric perspective into the Vista horizon
          float fogFactor = 1.0 - exp(-pow(dist * material_Params.w, 2.0));
          finalColor = mix(col, material_HorizonColor, clamp(fogFactor, 0.0, 0.92));
        }

        gl_FragColor = vec4(finalColor, 1.0);
      }
    }
  }
}`;

const OVERLAY_LINE_SHADER = `Shader "WorldGallery/ColdSmokeGuideLine" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      vec4 material_LineColor;

      struct Attributes {
        vec4 POSITION;
      };

      VertexShader = vert;
      FragmentShader = frag;

      void vert(Attributes attributes) {
        gl_Position = renderer_MVPMat * attributes.POSITION;
      }

      void frag() {
        gl_FragColor = material_LineColor;
      }
    }
  }
}`;

const ROCK_MODE_INDEX: Record<RockAppearanceMode, number> = {
  bands: 0,
  patches: 1,
  heavy: 2,
  concavity: 3,
  clay: 4
};

export interface PickHit {
  kind: "guide" | "feature-point" | "terrain";
  guideId?: string;
  featureId?: string;
  pointIndex?: 0 | 1 | 2;
  point: V3;
}

export async function createColdSmokeRenderer(canvasId: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const engine = await WebGLEngine.create({
    canvas,
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  engine.canvas.setAutoResolution();

  const scene = new Scene(engine, "Cold Smoke Mountain Lab");
  engine.sceneManager.addScene(scene);
  const root = scene.createRootEntity("Cold Smoke Mountain Lab");

  const cameraEntity = root.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 1.0;
  camera.farClipPlane = 12000;
  camera.fieldOfView = 48;
  camera.enableHDR = true;
  camera.enablePostProcess = true;

  const post = root.addComponent(PostProcess);
  const bloom = post.addEffect(BloomEffect)!;
  bloom.threshold.value = 0.95;
  bloom.intensity.value = 0.16;
  bloom.scatter.value = 0.5;
  const tonemapping = post.addEffect(TonemappingEffect)!;
  tonemapping.mode.value = TonemappingMode.Neutral;

  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.minDistance = 40;
  orbit.maxDistance = 3800;

  function resetCameraView(mode: "overview" | "valley" | "top" = "overview") {
    if (mode === "valley") {
      cameraEntity.transform.setPosition(-25, 215, 480);
      orbit.target.set(0, 105, -260);
    } else if (mode === "top") {
      cameraEntity.transform.setPosition(0, 1450, 40);
      orbit.target.set(0, 80, 0);
    } else {
      cameraEntity.transform.setPosition(-240, 340, 660);
      orbit.target.set(0, 120, -140);
    }
  }
  resetCameraView("overview");

  const vista = createColdSmokeVista(engine, scene, root);
  const detailTex = createDetailTexture(engine);
  const snowTex = createSnowTexture(engine);
  const noiseTex = createNoiseTexture(engine);

  const surfaceShader =
    Shader.find("WorldGallery/ColdSmokeMountainSurface") ?? Shader.create(COLD_SMOKE_MOUNTAIN_SHADER);
  const surfaceMaterial = new Material(engine, surfaceShader);
  const surfaceData = surfaceMaterial.shaderData;
  surfaceData.setTexture("material_DetailTex", detailTex);
  surfaceData.setTexture("material_SnowTex", snowTex);
  surfaceData.setTexture("material_NoiseTex", noiseTex);
  const shaderParams = new Vector4(64, 1, 0, 0.00045);
  const animParams = new Vector4(0, 0.65, 1.0, 0);
  const brushCursor = new Vector4(0, 0, 90, 0);
  surfaceData.setVector4("material_Params", shaderParams);
  surfaceData.setVector4("material_AnimParams", animParams);
  surfaceData.setVector4("material_BrushCursor", brushCursor);

  const terrainEntity = root.createChild("TerrainSurface");
  const terrainRenderer = terrainEntity.addComponent(MeshRenderer);
  terrainRenderer.setMaterial(surfaceMaterial);
  terrainRenderer.receiveShadows = true;
  terrainRenderer.castShadows = true;

  // Outer neighboring mountain massif skirt ring (1.2 km out to 4.4 km)
  const outerSkirtEntity = root.createChild("OuterMountainSkirt");
  const outerSkirtRenderer = outerSkirtEntity.addComponent(MeshRenderer);
  outerSkirtRenderer.setMaterial(surfaceMaterial);
  outerSkirtRenderer.receiveShadows = true;
  outerSkirtRenderer.castShadows = false;

  // Procedural 3D spruce forest batch
  const forestMaterial = new PBRMaterial(engine);
  forestMaterial.baseColor.set(1, 1, 1, 1);
  forestMaterial.metallic = 0;
  forestMaterial.roughness = 0.92;
  const sprucePrototypes = Array.from({ length: 5 }, (_, v) => makeSprucePrototype(v));
  let forestEntity: Entity | undefined;

  const lineShader = Shader.find("WorldGallery/ColdSmokeGuideLine") ?? Shader.create(OVERLAY_LINE_SHADER);
  let overlayEntity: Entity | undefined;
  let currentResult: ColdSmokeMountainResult | undefined;
  let activeRecipe: ColdSmokeMountainRecipe | undefined;
  let startTime = performance.now() * 0.001;

  class MountainFrameAnimator extends Script {
    override onUpdate(): void {
      const nowSec = performance.now() * 0.001 - startTime;
      animParams.x = nowSec;
      surfaceData.setVector4("material_AnimParams", animParams);
      if (activeRecipe) {
        vista.update(activeRecipe.vista, nowSec);
      }
    }
  }
  root.addComponent(MountainFrameAnimator);

  function setBrushCursor(x: number, z: number, radius: number, active: boolean) {
    brushCursor.set(x, z, radius, 0);
    animParams.w = active ? 1 : 0;
    surfaceData.setVector4("material_BrushCursor", brushCursor);
    surfaceData.setVector4("material_AnimParams", animParams);
  }

  function setOrbitEnabled(enabled: boolean) {
    orbit.enabled = enabled;
  }

  function syncAtmosphere(recipe: ColdSmokeMountainRecipe) {
    activeRecipe = recipe;
    const atmo = vista.update(recipe.vista, performance.now() * 0.001 - startTime);
    surfaceData.setVector3("material_SunDir", atmo.sunDirection);
    surfaceData.setVector3("material_SunColor", atmo.sunColor);
    surfaceData.setVector3("material_AmbSky", atmo.ambSky);
    surfaceData.setVector3("material_AmbGnd", atmo.ambGnd);
    surfaceData.setVector3("material_HorizonColor", atmo.horizonColor);
    surfaceData.setVector3("material_ZenithColor", atmo.zenithColor);
    shaderParams.set(
      recipe.strata.bedThickness,
      recipe.strata.foldStrength,
      ROCK_MODE_INDEX[recipe.strata.rockMode] ?? 0,
      recipe.vista.fogDensity
    );
    surfaceData.setVector4("material_Params", shaderParams);
  }

  function buildOuterSkirtMesh(recipe: ColdSmokeMountainRecipe) {
    const oldMesh = outerSkirtRenderer.mesh as ModelMesh | undefined;
    const evaluator = createMountainEvaluator(recipe);
    const innerHalf = recipe.domain.width * 0.5;
    const outerHalf = 2200;
    const gridN = 81;
    const step = (outerHalf * 2) / (gridN - 1);

    const posArray: Vector3[] = [];
    const normArray: Vector3[] = [];
    const colArray: Color[] = [];
    const uvArray: Vector2[] = [];
    const indices: number[] = [];

    for (let r = 0; r < gridN; r++) {
      const z = -outerHalf + r * step;
      for (let c = 0; c < gridN; c++) {
        const x = -outerHalf + c * step;
        const s0 = evaluator.evaluateAt(x, z);
        const sR = evaluator.evaluateAt(x + 18, z);
        const sD = evaluator.evaluateAt(x, z + 18);
        const sx = (sR.height - s0.height) / 18;
        const sz = (sD.height - s0.height) / 18;
        const invL = 1 / Math.hypot(sx, 1, sz);
        // Slightly depress inside the inner domain so the high-res inner mesh sits cleanly on top
        const insideInner = Math.abs(x) < innerHalf - 20 && Math.abs(z) < innerHalf - 20;
        const y = insideInner ? s0.height - 35 : s0.height;
        posArray.push(new Vector3(x, y, z));
        normArray.push(new Vector3(-sx * invL, invL, -sz * invL));
        colArray.push(new Color(s0.mountainWeight, 0, 0.9, 0.05));
        uvArray.push(new Vector2(sx, sz));
      }
    }

    for (let r = 0; r < gridN - 1; r++) {
      for (let c = 0; c < gridN - 1; c++) {
        const x = -outerHalf + (c + 0.5) * step;
        const z = -outerHalf + (r + 0.5) * step;
        if (Math.abs(x) < innerHalf - step && Math.abs(z) < innerHalf - step) continue;
        const a = r * gridN + c;
        const b = a + gridN;
        const c1 = a + 1;
        const d = b + 1;
        indices.push(a, b, c1, c1, b, d);
      }
    }

    const mesh = new ModelMesh(engine, "OuterMountainSkirtMesh");
    mesh.setPositions(posArray);
    mesh.setNormals(normArray);
    mesh.setColors(colArray);
    mesh.setUVs(uvArray);
    mesh.setIndices(Uint32Array.from(indices));
    BoundingBox.fromPoints(posArray, mesh.bounds);
    mesh.uploadData(true);
    mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
    outerSkirtRenderer.mesh = mesh;
    if (oldMesh) oldMesh.destroy();
  }

  function rebuildSpruceForest(result: ColdSmokeMountainResult) {
    if (forestEntity) {
      forestEntity.destroy();
      forestEntity = undefined;
    }
    const forestCfg = result.recipe.forest ?? { enabled: true, density: 1.0, treeLineHeight: 165 };
    if (!forestCfg.enabled || forestCfg.density <= 0.01) return;

    const { domain, seed, corridor } = result.recipe;
    const cellSpacing = 22;
    const cols = Math.floor(domain.width / cellSpacing);
    const rows = Math.floor(domain.depth / cellSpacing);

    const positions: Vector3[] = [];
    const normals: Vector3[] = [];
    const colors: Color[] = [];
    const indices: number[] = [];

    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        const h1 = hash2U(c * 13 + seed, r * 29 + seed);
        const h2 = hashU(h1 ^ 0x85ebca6b);
        const jx = ((h1 & 0xffff) / 65536 - 0.5) * cellSpacing * 0.78;
        const jz = (((h1 >>> 16) & 0xffff) / 65536 - 0.5) * cellSpacing * 0.78;
        const x = domain.minX + (c + 0.5) * cellSpacing + jx;
        const z = domain.minZ + (r + 0.5) * cellSpacing + jz;

        const u = clamp(((x - domain.minX) / domain.width) * (domain.resolution - 1), 0, domain.resolution - 1);
        const v = clamp(((z - domain.minZ) / domain.depth) * (domain.resolution - 1), 0, domain.resolution - 1);
        const ic = Math.floor(u);
        const ir = Math.floor(v);
        const idx = ir * domain.resolution + ic;

        // Keep open ski-valley floor clear while populating valley aprons and lower mountain shoulders
        const mw = result.channels[idx * 4];
        if (corridor.enabled && mw < 0.04) continue;

        const y = result.heights[idx];
        const maxTreeY = forestCfg.treeLineHeight + 55;
        if (y > maxTreeY) continue;

        const sx = result.slopes[idx * 2];
        const sz = result.slopes[idx * 2 + 1];
        const slope = Math.hypot(sx, sz);
        if (slope > 1.05) continue; // Too steep for trees

        const conc = result.channels[idx * 4 + 1];
        if (conc > 0.45) continue; // Keep deep avalanche gullies/couloirs clear of trees

        const treeLineFade = smooth(maxTreeY, maxTreeY - 85, y);
        const slopeFade = smooth(1.05, 0.48, slope);
        const patch = 0.5 + 0.5 * Math.sin(x * 0.025 + z * 0.019) * Math.cos(x * 0.017 - z * 0.023);
        const prob = forestCfg.density * 0.68 * treeLineFade * slopeFade * (0.4 + 0.6 * patch);
        if ((h2 & 0xffff) / 65536 > prob) continue;

        const variant = h2 % 5;
        const proto = sprucePrototypes[variant];
        const treeHeight = 11 + ((h2 >>> 16) & 0xff) / 255 * 11;
        const treeRadius = treeHeight * 0.24;
        const rot = ((h1 & 0xfff) / 4096) * Math.PI * 2;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const baseVertex = positions.length;

        for (let k = 0; k < proto.positions.length; k++) {
          const [px, py, pz] = proto.positions[k];
          const [nx, ny, nz] = proto.normals[k];
          positions.push(
            new Vector3(
              x + (px * cosR - pz * sinR) * treeRadius,
              y + (py < 0 ? -0.4 : py * treeHeight),
              z + (px * sinR + pz * cosR) * treeRadius
            )
          );
          normals.push(new Vector3(nx * cosR - nz * sinR, ny, nx * sinR + nz * cosR).normalize());
          colors.push(proto.colors[k]);
        }
        for (let k = 0; k < proto.indices.length; k++) {
          indices.push(baseVertex + proto.indices[k]);
        }
        if (positions.length > 58000) break;
      }
      if (positions.length > 58000) break;
    }

    if (!indices.length) return;
    forestEntity = root.createChild("AlpineSpruceForest");
    const mesh = new ModelMesh(engine, "AlpineSpruceForestMesh");
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(Uint32Array.from(indices));
    BoundingBox.fromPoints(positions, mesh.bounds);
    mesh.uploadData(true);
    mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
    const r = forestEntity.addComponent(MeshRenderer);
    r.mesh = mesh;
    r.setMaterial(forestMaterial);
    r.enableVertexColor = true;
    r.receiveShadows = true;
    r.castShadows = true;
  }

  function updateTerrainMesh(result: ColdSmokeMountainResult) {
    currentResult = result;
    const oldMesh = terrainRenderer.mesh as ModelMesh | undefined;
    const vertexCount = result.positions.length / 3;
    const mesh = new ModelMesh(engine, "ColdSmokeMountainMesh");

    const posArray: Vector3[] = new Array(vertexCount);
    const normArray: Vector3[] = new Array(vertexCount);
    const colArray: Color[] = new Array(vertexCount);
    const uvArray: Vector2[] = new Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const p3 = i * 3;
      const c4 = i * 4;
      const s2 = i * 2;
      posArray[i] = new Vector3(result.positions[p3], result.positions[p3 + 1], result.positions[p3 + 2]);
      normArray[i] = new Vector3(result.normals[p3], result.normals[p3 + 1], result.normals[p3 + 2]);
      colArray[i] = new Color(
        result.channels[c4],
        result.channels[c4 + 1],
        result.channels[c4 + 2],
        result.channels[c4 + 3]
      );
      uvArray[i] = new Vector2(result.slopes[s2], result.slopes[s2 + 1]);
    }

    mesh.setPositions(posArray);
    mesh.setNormals(normArray);
    mesh.setColors(colArray);
    mesh.setUVs(uvArray);
    mesh.setIndices(result.indices);
    BoundingBox.fromPoints(posArray, mesh.bounds);
    mesh.uploadData(false);
    mesh.addSubMesh(0, result.indices.length, MeshTopology.Triangles);
    terrainRenderer.mesh = mesh;
    if (oldMesh) oldMesh.destroy();

    buildOuterSkirtMesh(result.recipe);
    rebuildSpruceForest(result);
    syncAtmosphere(result.recipe);
  }

  function addLineMesh(
    parent: Entity,
    name: string,
    points: Vector3[],
    indices: Uint16Array,
    rgba: [number, number, number, number]
  ) {
    if (!points.length || !indices.length) return;
    const entity = parent.createChild(name);
    const mesh = new ModelMesh(engine, name);
    mesh.setPositions(points);
    mesh.setIndices(indices);
    BoundingBox.fromPoints(points, mesh.bounds);
    mesh.uploadData(true);
    mesh.addSubMesh(0, indices.length, MeshTopology.Lines);
    const mat = new Material(engine, lineShader);
    mat.shaderData.setVector4("material_LineColor", new Vector4(...rgba));
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(mat);
  }

  function sampleHeightAt(x: number, z: number): number {
    if (!currentResult) return 0;
    const { domain } = currentResult.recipe;
    const n = domain.resolution;
    const u = clamp(((x - domain.minX) / domain.width) * (n - 1), 0, n - 1);
    const v = clamp(((z - domain.minZ) / domain.depth) * (n - 1), 0, n - 1);
    const ic = Math.min(n - 2, Math.floor(u));
    const ir = Math.min(n - 2, Math.floor(v));
    const fx = u - ic;
    const fz = v - ir;
    const H = currentResult.heights;
    return lerp(
      lerp(H[ir * n + ic], H[ir * n + ic + 1], fx),
      lerp(H[(ir + 1) * n + ic], H[(ir + 1) * n + ic + 1], fx),
      fz
    );
  }

  function updateOverlays(
    recipe: ColdSmokeMountainRecipe,
    options: {
      showGuides: boolean;
      showFeatures: boolean;
      selectedGuideId?: string;
      selectedFeatureId?: string;
    }
  ) {
    if (overlayEntity) {
      overlayEntity.destroy();
      overlayEntity = undefined;
    }
    if (!options.showGuides && !options.showFeatures) return;
    overlayEntity = root.createChild("GuideAndFeatureOverlays");

    if (options.showGuides) {
      const boxEdges = new Uint16Array([
        0, 1, 1, 2, 2, 3, 3, 0,
        4, 5, 5, 6, 6, 7, 7, 4,
        0, 4, 1, 5, 2, 6, 3, 7
      ]);

      for (const guide of recipe.guides) {
        if (!guide.enabled) continue;
        const selected = guide.id === options.selectedGuideId;
        const rad = (guide.yawDegrees * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const hw = guide.size[0] * 0.5;
        const hh = guide.size[1];
        const hd = guide.size[2] * 0.5;
        const baseGround = sampleHeightAt(guide.center[0], guide.center[2]) * 0.25 + guide.center[1];
        const y0 = guide.role === "basin" ? baseGround - hh : baseGround;
        const y1 = guide.role === "basin" ? baseGround + 18 : baseGround + hh;

        const cornersLocal: [number, number, number][] = [
          [-hw, y0, -hd],
          [hw, y0, -hd],
          [hw, y0, hd],
          [-hw, y0, hd],
          [-hw, y1, -hd],
          [hw, y1, -hd],
          [hw, y1, hd],
          [-hw, y1, hd]
        ];
        const cornersWorld = cornersLocal.map(
          ([lx, ly, lz]) =>
            new Vector3(guide.center[0] + lx * c + lz * s, ly + 2.5, guide.center[2] - lx * s + lz * c)
        );

        const roleColor: Record<MountainGuideOBB["role"], [number, number, number, number]> = {
          massif: [0.98, 0.76, 0.25, 0.9],
          wall: [0.32, 0.86, 0.96, 0.9],
          ridge: [1.0, 0.48, 0.28, 0.9],
          basin: [0.46, 0.68, 1.0, 0.9]
        };
        const color: [number, number, number, number] = selected
          ? [1.0, 0.98, 0.45, 1.0]
          : roleColor[guide.role];

        addLineMesh(overlayEntity, `guide-${guide.id}`, cornersWorld, boxEdges, color);
      }
    }

    if (options.showFeatures) {
      const SEGMENTS = 40;
      for (const feature of recipe.features) {
        if (!feature.enabled) continue;
        const selected = feature.id === options.selectedFeatureId;
        const pts: Vector3[] = [];
        const indices: number[] = [];

        for (let i = 0; i <= SEGMENTS; i++) {
          const [x, z] = shapeCurvePoint(feature.points, i / SEGMENTS);
          const y = sampleHeightAt(x, z) + (selected ? 6.5 : 4.5);
          pts.push(new Vector3(x, y, z));
          if (i < SEGMENTS) indices.push(i, i + 1);
        }

        // 3D diamond control handles at Start (0), Bend (1), End (2)
        for (let cp = 0; cp < 3; cp++) {
          const [cx, cz] = feature.points[cp];
          const cy = sampleHeightAt(cx, cz) + 9.0;
          const r = selected ? 18 : 11;
          const baseIdx = pts.length;
          pts.push(
            new Vector3(cx - r, cy, cz),
            new Vector3(cx, cy, cz - r),
            new Vector3(cx + r, cy, cz),
            new Vector3(cx, cy, cz + r),
            new Vector3(cx, cy + r, cz)
          );
          indices.push(
            baseIdx, baseIdx + 1, baseIdx + 1, baseIdx + 2, baseIdx + 2, baseIdx + 3, baseIdx + 3, baseIdx,
            baseIdx, baseIdx + 4, baseIdx + 1, baseIdx + 4, baseIdx + 2, baseIdx + 4, baseIdx + 3, baseIdx + 4
          );
        }

        const kindColor: Record<GullyValleyFeature["kind"], [number, number, number, number]> = {
          gully: [0.16, 0.92, 1.0, 0.95],
          valley: [0.34, 0.96, 0.56, 0.95],
          ridge: [1.0, 0.44, 0.24, 0.95]
        };
        const color: [number, number, number, number] = selected
          ? [1.0, 1.0, 0.35, 1.0]
          : kindColor[feature.kind];

        addLineMesh(overlayEntity, `feature-${feature.id}`, pts, new Uint16Array(indices), color);
      }
    }
  }

  function pickScene(
    clientX: number,
    clientY: number,
    recipe: ColdSmokeMountainRecipe,
    preferTerrain = false
  ): PickHit | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const xRatio = ((clientX - rect.left) / rect.width) * engine.canvas.width;
    const yRatio = ((clientY - rect.top) / rect.height) * engine.canvas.height;
    const ray = new Ray();
    camera.screenPointToRay(new Vector2(xRatio, yRatio), ray);

    const origin: V3 = [ray.origin.x, ray.origin.y, ray.origin.z];
    const dir: V3 = [ray.direction.x, ray.direction.y, ray.direction.z];

    if (!preferTerrain) {
      // 1. Check Gully / Valley / Ridge 3D curve control points first (radius 26 m)
      let bestPointT = Infinity;
      let hitFeatureId: string | undefined;
      let hitPointIndex: 0 | 1 | 2 | undefined;
      let hitPointPos: V3 | undefined;

      for (const feature of recipe.features) {
        if (!feature.enabled) continue;
        for (let cp = 0; cp < 3; cp++) {
          const [cx, cz] = feature.points[cp as 0 | 1 | 2];
          const cy = sampleHeightAt(cx, cz) + 9.0;
          const ox = cx - origin[0];
          const oy = cy - origin[1];
          const oz = cz - origin[2];
          const tProj = ox * dir[0] + oy * dir[1] + oz * dir[2];
          if (tProj <= 0) continue;
          const distSq = ox * ox + oy * oy + oz * oz - tProj * tProj;
          if (distSq < 26 * 26 && tProj < bestPointT) {
            bestPointT = tProj;
            hitFeatureId = feature.id;
            hitPointIndex = cp as 0 | 1 | 2;
            hitPointPos = [cx, cy, cz];
          }
        }
      }
      if (hitFeatureId && hitPointIndex !== undefined && hitPointPos) {
        return {
          kind: "feature-point",
          featureId: hitFeatureId,
          pointIndex: hitPointIndex,
          point: hitPointPos
        };
      }

      // 2. Check Guide OBBs
      let bestGuideT = Infinity;
      let bestGuideId: string | undefined;
      for (const guide of recipe.guides) {
        if (!guide.enabled) continue;
        const rad = (guide.yawDegrees * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const ox = origin[0] - guide.center[0];
        const oz = origin[2] - guide.center[2];
        const baseY = sampleHeightAt(guide.center[0], guide.center[2]) * 0.25 + guide.center[1];
        const minY = guide.role === "basin" ? baseY - guide.size[1] : baseY;
        const maxY = guide.role === "basin" ? baseY + 18 : baseY + guide.size[1];

        const localOrigin: V3 = [ox * c - oz * s, origin[1], ox * s + oz * c];
        const localDir: V3 = [dir[0] * c - dir[2] * s, dir[1], dir[0] * s + dir[2] * c];
        const minB: V3 = [-guide.size[0] * 0.5, minY, -guide.size[2] * 0.5];
        const maxB: V3 = [guide.size[0] * 0.5, maxY, guide.size[2] * 0.5];

        let tMin = 0;
        let tMax = Infinity;
        let hit = true;
        for (let axis = 0; axis < 3; axis++) {
          const d = localDir[axis];
          if (Math.abs(d) < 1e-7) {
            if (localOrigin[axis] < minB[axis] || localOrigin[axis] > maxB[axis]) {
              hit = false;
              break;
            }
          } else {
            let t1 = (minB[axis] - localOrigin[axis]) / d;
            let t2 = (maxB[axis] - localOrigin[axis]) / d;
            if (t1 > t2) {
              const tmp = t1;
              t1 = t2;
              t2 = tmp;
            }
            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) {
              hit = false;
              break;
            }
          }
        }
        if (hit && tMin < bestGuideT) {
          bestGuideT = tMin;
          bestGuideId = guide.id;
        }
      }
      if (bestGuideId) {
        return {
          kind: "guide",
          guideId: bestGuideId,
          point: [
            origin[0] + dir[0] * bestGuideT,
            origin[1] + dir[1] * bestGuideT,
            origin[2] + dir[2] * bestGuideT
          ]
        };
      }
    }

    // 3. Ray-march against the heightfield surface
    const { domain } = recipe;
    let prevT = 10;
    let prevAbove =
      origin[1] + dir[1] * prevT - sampleHeightAt(origin[0] + dir[0] * prevT, origin[2] + dir[2] * prevT);
    for (let t = 20; t <= 4200; t += 12) {
      const px = origin[0] + dir[0] * t;
      const py = origin[1] + dir[1] * t;
      const pz = origin[2] + dir[2] * t;
      if (
        px < domain.minX ||
        px > domain.minX + domain.width ||
        pz < domain.minZ ||
        pz > domain.minZ + domain.depth
      ) {
        prevT = t;
        continue;
      }
      const h = sampleHeightAt(px, pz);
      const above = py - h;
      if (above <= 0 && prevAbove >= 0) {
        let a = prevT;
        let b = t;
        for (let iter = 0; iter < 8; iter++) {
          const mid = 0.5 * (a + b);
          const mx = origin[0] + dir[0] * mid;
          const my = origin[1] + dir[1] * mid;
          const mz = origin[2] + dir[2] * mid;
          if (my - sampleHeightAt(mx, mz) > 0) a = mid;
          else b = mid;
        }
        const hitT = 0.5 * (a + b);
        const hx = origin[0] + dir[0] * hitT;
        const hz = origin[2] + dir[2] * hitT;
        return {
          kind: "terrain",
          point: [hx, sampleHeightAt(hx, hz), hz]
        };
      }
      prevT = t;
      prevAbove = above;
    }

    return null;
  }

  engine.run();

  return {
    engine,
    updateTerrainMesh,
    updateOverlays,
    syncAtmosphere,
    pickScene,
    resetCameraView,
    setBrushCursor,
    setOrbitEnabled
  };
}
