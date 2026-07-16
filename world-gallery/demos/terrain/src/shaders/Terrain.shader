// Terrain rendering shader.
//   Renderer uniforms (renderer_*): per-tile heightmap/controlmap + tile geometry.
//   Material uniforms (material_*): global layer-library arrays + debug switches.
//
// Vertex   — sample heightmap → displace flat plane vertex Y; central-difference world normal.
// Fragment — sample controlmap → floatBitsToUint bitfield decode → 2-layer Texture2DArray mix with
//            a 4-neighbour detiled sampler that hides the periodic tile grid.
// Autoshader (T3D variant): texels with controlmap bit 0 = 1 let the shader recompute BLEND from
// world normal Y at render time; base/overlay layer ids always come from controlmap. Painted texels
// (bit 0 = 0) use baked blend verbatim.
// Bit layout matches design.md §3.2 / T3D controlmap_format.md.

Shader "Terrain" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      struct Attributes { vec3 POSITION; };
      struct Varyings {
        vec3 v_worldPos;
        vec3 v_worldNormal;
        vec2 v_terrainUV;
      };

      mat4 renderer_ModelMat;
      mat4 renderer_MVPMat;
      vec3 camera_Position;

      highp sampler2D renderer_HeightMap;
      highp sampler2D renderer_ControlMap;
      vec2 renderer_HeightRange;
      float renderer_TileSize;
      float renderer_HeightTexelSize;

      highp sampler2DArray material_LayerAlbedoArray;
      highp sampler2DArray material_LayerNormalArray;
      float material_LayerUvScales[8];
      float material_LayerNormalIntensities[8];

      // Autoshader (variant of T3D auto_shader.glsl): texels with controlmap bit 0 = 1 let the
      // shader recompute BLEND from world normal Y. Base / overlay layer ids stay whatever the
      // baker wrote into controlmap (bit 31-27 / 26-22) — no material-level base/overlay override,
      // since that data is already carried by controlmap. Painters clear bit 0 to lock blend too.
      float material_AutoSlope;
      float material_AutoHeightReduction;

      // Debug view mode + layer id. 0 = off, others → see TerrainDebugMode enum.
      int material_DebugMode;
      int material_DebugLayerId;

      VertexShader = vert;
      FragmentShader = frag;

      // R16F heightmap stores unorm [0, 1]. Rescale to metres via HeightRange — the min/max
      // uniforms can be edited live and vertex Y follows without reuploading the texture.
      float decodeHeight(vec4 texel) {
        return mix(renderer_HeightRange.x, renderer_HeightRange.y, texel.r);
      }
      float sampleHeightAt(vec2 uv) { return decodeHeight(texture(renderer_HeightMap, uv)); }

      vec3 computeNormal(vec2 uv, float sizeMetres) {
        float ts = renderer_HeightTexelSize;
        float texelWorld = sizeMetres * ts;
        float hL = sampleHeightAt(uv - vec2(ts, 0.0));
        float hR = sampleHeightAt(uv + vec2(ts, 0.0));
        float hD = sampleHeightAt(uv - vec2(0.0, ts));
        float hU = sampleHeightAt(uv + vec2(0.0, ts));
        return normalize(vec3(hL - hR, 2.0 * texelWorld, hD - hU));
      }

      Varyings vert(Attributes attr) {
        Varyings v;
        vec2 uv = attr.POSITION.xz + 0.5;
        v.v_terrainUV = uv;

        float h = sampleHeightAt(uv);
        vec3 posLocal = vec3(attr.POSITION.x * renderer_TileSize, h, attr.POSITION.z * renderer_TileSize);
        v.v_worldPos = (renderer_ModelMat * vec4(posLocal, 1.0)).xyz;
        v.v_worldNormal = computeNormal(uv, renderer_TileSize);

        gl_Position = renderer_MVPMat * vec4(posLocal, 1.0);
        return v;
      }

      // ControlMap 32-bit layout. Encode/decode formulas from T3D controlmap_format.md (their
      // "Bit #s" column uses a different origin and is misleading — trust the formulas).
      //   bit 31-27 base id | 26-22 overlay id | 21-14 blend | 13-11 uv rot | 10-8 uv scale
      //   bit 2 hole | bit 1 navigation | bit 0 autoshader-opt-in
      #define DECODE_BASE(c)   int((c >> 27u) & 0x1Fu)
      #define DECODE_OVER(c)   int((c >> 22u) & 0x1Fu)
      #define DECODE_BLEND(c)  (float((c >> 14u) & 0xFFu) / 255.0)
      #define DECODE_HOLE(c)   (((c) >> 2u) & 0x1u)
      #define DECODE_NAV(c)    (((c) >> 1u) & 0x1u)
      #define DECODE_AUTO(c)   ((c) & 0x1u)
      #define DECODE_UV_ROT(c) int((c >> 11u) & 0xFu)
      #define DECODE_UV_SCL(c) int((c >> 8u) & 0x7u)

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      vec2 rotateUvByCell(vec2 scaledUv, vec2 cell, int layerId) {
        float angle = hash21(cell + vec2(float(layerId) * 17.3)) * 6.2831853;
        float s = sin(angle);
        float c = cos(angle);
        vec2 pivot = scaledUv - cell - 0.5;
        vec2 rot = vec2(c * pivot.x - s * pivot.y, s * pivot.x + c * pivot.y);
        return cell + rot + 0.5;
      }

      vec4 sampleLayerDetiled(vec2 uv, float scale, int layerId) {
        vec2 scaled = uv * scale;
        vec2 baseDx = dFdx(scaled);
        vec2 baseDy = dFdy(scaled);
        vec2 cell = floor(scaled);
        vec2 f = scaled - cell;
        vec2 w = f * f * (3.0 - 2.0 * f);
        vec2 uv00 = rotateUvByCell(scaled, cell + vec2(0.0, 0.0), layerId);
        vec2 uv10 = rotateUvByCell(scaled, cell + vec2(1.0, 0.0), layerId);
        vec2 uv01 = rotateUvByCell(scaled, cell + vec2(0.0, 1.0), layerId);
        vec2 uv11 = rotateUvByCell(scaled, cell + vec2(1.0, 1.0), layerId);
        vec4 c00 = textureGrad(material_LayerAlbedoArray, vec3(uv00, float(layerId)), baseDx, baseDy);
        vec4 c10 = textureGrad(material_LayerAlbedoArray, vec3(uv10, float(layerId)), baseDx, baseDy);
        vec4 c01 = textureGrad(material_LayerAlbedoArray, vec3(uv01, float(layerId)), baseDx, baseDy);
        vec4 c11 = textureGrad(material_LayerAlbedoArray, vec3(uv11, float(layerId)), baseDx, baseDy);
        return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
      }

      void frag(Varyings v) {
        vec4 controlTexel = texture(renderer_ControlMap, v.v_terrainUV);
        uint control = floatBitsToUint(controlTexel.r);

        // Hole discard only in the normal render pass; debug views draw everything so users can see
        // what the hole bit actually looks like on the tile.
        if (DECODE_HOLE(control) == 1u && material_DebugMode == 0) {
          discard;
        }

        int baseId = DECODE_BASE(control);
        int overId = DECODE_OVER(control);
        float blend = DECODE_BLEND(control);
        vec3 N = normalize(v.v_worldNormal);

        // Snapshot raw (baker-written) values BEFORE autoshader override so LayerMask / BlendWeight
        // debug modes visualise what the baker actually wrote, not what the autoshader computed.
        int rawBaseId = baseId;
        int rawOverId = overId;
        float rawBlend = blend;

        // Autoshader (T3D variant): when bit 0 = 1, recompute BLEND only from world normal Y —
        // base/overlay ids stay as baker wrote them in controlmap. auto_blend = 1 on flat ground
        // (base only) → 0 on cliffs (all overlay); flip via 1 - auto_blend so `blend` still
        // means "amount of overlay" in the mix() below.
        if (DECODE_AUTO(control) == 1u) {
          float autoBlend = clamp(
            material_AutoSlope * 2.0 * (N.y - 1.0) + 1.0
              - material_AutoHeightReduction * 0.01 * v.v_worldPos.y,
            0.0, 1.0
          );
          blend = 1.0 - autoBlend;
        }

        vec4 outColor;
        if (material_DebugMode == 1) {
          // LayerMask — highlight texels whose RAW baked base OR overlay equals DebugLayerId.
          // Reading raw values means the autoshader override doesn't collapse the mask into a
          // single layer everywhere bit 0 = 1.
          float mask = (rawBaseId == material_DebugLayerId || rawOverId == material_DebugLayerId) ? 1.0 : 0.0;
          outColor = vec4(vec3(mask), 1.0);
        } else if (material_DebugMode == 2) {
          outColor = vec4(vec3(float(DECODE_HOLE(control))), 1.0);
        } else if (material_DebugMode == 3) {
          outColor = vec4(vec3(float(DECODE_NAV(control))), 1.0);
        } else if (material_DebugMode == 4) {
          outColor = vec4(vec3(rawBlend), 1.0);
        } else if (material_DebugMode == 5) {
          outColor = vec4(vec3(float(DECODE_UV_ROT(control)) / 15.0), 1.0);
        } else if (material_DebugMode == 6) {
          outColor = vec4(vec3(float(DECODE_UV_SCL(control)) / 7.0), 1.0);
        } else if (material_DebugMode == 7) {
          float hMetres = decodeHeight(texture(renderer_HeightMap, v.v_terrainUV));
          float t = clamp((hMetres - renderer_HeightRange.x) / max(1e-3, renderer_HeightRange.y - renderer_HeightRange.x), 0.0, 1.0);
          outColor = vec4(vec3(t), 1.0);
        } else if (material_DebugMode == 8) {
          outColor = vec4(vec3(float(DECODE_AUTO(control))), 1.0);
        } else if (material_DebugMode == 9) {
          outColor = vec4(vec3(float(rawBaseId) / 31.0), 1.0);
        } else if (material_DebugMode == 10) {
          outColor = vec4(vec3(float(rawOverId) / 31.0), 1.0);
        } else {
          vec2 uv = v.v_terrainUV;
          float baseScale = material_LayerUvScales[baseId];
          float overScale = material_LayerUvScales[overId];
          vec3 baseAlbedo = sampleLayerDetiled(uv, baseScale, baseId).rgb;
          vec3 overAlbedo = sampleLayerDetiled(uv, overScale, overId).rgb;
          vec3 albedo = mix(baseAlbedo, overAlbedo, blend);
          vec3 L = normalize(vec3(0.4, 0.9, 0.3));
          float NdotL = max(dot(N, L), 0.0);
          vec3 lit = albedo * (0.35 + 0.65 * NdotL);
          outColor = vec4(lit, 1.0);
        }
        gl_FragColor = outColor;
      }
    }
  }
}
