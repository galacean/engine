Shader "Water/ContactEffects" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = { WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      mat4 renderer_ModelMat;
      mat4 camera_ViewMat;
      mat4 camera_ProjMat;
      mat4 camera_ViewInvMat;
      sampler2D camera_DepthTexture;
      sampler2D material_EffectAtlas;
      sampler2D material_ContactSurfaceMask;
      vec4 material_ContactMaskBounds;
      vec4 material_EffectColor;
      vec4 material_EffectShape;
      vec4 material_EffectMotion;
      vec4 material_EffectAtlasInfo;
      vec3 material_EffectVelocity;
      vec3 material_EffectNormal;
      float material_EffectTime;
      float material_EffectActivation;
      float material_EffectSeed;
      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 uv; vec2 quadUv; vec2 worldXZ; float alpha; float eyeDepth; vec4 screenPosition; };
      Varyings vert(Attributes a) {
        Varyings v;
        float random = fract(a.POSITION.x * 0.6180339 + material_EffectSeed * 0.01371);
        float age = fract(material_EffectTime / material_EffectMotion.x + a.POSITION.x / 24.0 + material_EffectSeed * 0.071);
        float elapsed = age * material_EffectMotion.x;
        vec3 flow = material_EffectVelocity;
        float speed = length(flow);
        vec3 downstream = speed > 0.0001 ? flow / speed : vec3(0.0,0.0,1.0);
        vec3 normal = normalize(material_EffectNormal);
        vec3 tangent = downstream - normal * dot(downstream, normal);
        if (dot(tangent,tangent) < 0.00001) tangent = cross(normal, abs(normal.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0));
        downstream = normalize(tangent);
        vec3 across = normalize(cross(downstream, normal));
        vec3 center = renderer_ModelMat[3].xyz;
        center += across * (random - 0.5) * material_EffectShape.w;
        center += downstream * elapsed * min(speed,3.0) * material_EffectMotion.w;
        float kind = material_EffectAtlasInfo.z;
        if (kind < 0.5) center += vec3(0.0, material_EffectMotion.y * elapsed - 1.8 * elapsed * elapsed, 0.0);
        else if (kind < 1.5) center += vec3(0.0,material_EffectMotion.y * elapsed,0.0);
        center += across * (random - 0.5) * age * material_EffectMotion.z;
        vec2 corner = a.TEXCOORD_0 - 0.5;
        float size = material_EffectShape.x * mix(0.75,1.2,random) * mix(0.65,1.4,age);
        vec3 right = camera_ViewInvMat[0].xyz;
        vec3 up = camera_ViewInvMat[1].xyz;
        if (kind > 1.5) { right = across; up = downstream; center += normal * 0.08; }
        center += (right * corner.x + up * corner.y) * size;
        vec4 view = camera_ViewMat * vec4(center,1.0);
        gl_Position = camera_ProjMat * view;
        v.screenPosition = gl_Position;
        v.quadUv = a.TEXCOORD_0;
        v.worldXZ = center.xz;
        v.eyeDepth = -view.z;
        vec2 grid = material_EffectAtlasInfo.xy;
        float frame = min(floor(age * grid.x * grid.y), grid.x * grid.y - 1.0);
        // Unity flipbooks advance from the top-left; inset prevents adjacent-cell bleeding.
        vec2 cell = vec2(mod(frame,grid.x),grid.y - 1.0 - floor(frame/grid.x));
        v.uv = (cell + mix(vec2(0.015),vec2(0.985),a.TEXCOORD_0)) / grid;
        v.alpha = smoothstep(0.0,0.12,age) * (1.0-smoothstep(0.55,1.0,age))
          * material_EffectShape.y * material_EffectActivation
          * step(a.POSITION.x / 24.0, material_EffectShape.z);
        return v;
      }
      void frag(Varyings v) {
        vec2 screenUv = v.screenPosition.xy / v.screenPosition.w * 0.5 + 0.5;
        float sceneDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture,screenUv).r);
        float soft = saturate((sceneDepth-v.eyeDepth)/0.35);
        // The scene depth excludes transparent water. Its published macro surface supplies
        // the missing contact distance, using UE DepthFade's signed-distance opacity principle.
        if (material_EffectAtlasInfo.z > 1.5) {
          vec2 uv = (v.worldXZ - material_ContactMaskBounds.xy) / (2.0 * material_ContactMaskBounds.z) + 0.5;
          float resolution = material_ContactMaskBounds.w;
          vec2 sampleUv = (uv * (resolution - 1.0) + 0.5) / resolution;
          vec4 field = texture2D(material_ContactSurfaceMask, sampleUv);
          float distance = (dot(field.rg, vec2(256.0, 1.0)) * (255.0 / 65535.0) * 2.0 - 1.0) * 32.0;
          float contact = smoothstep(0.0, 0.08, distance) * (1.0 - smoothstep(0.2, 0.8, distance));
          vec2 rim = min(uv, 1.0-uv);
          soft *= field.a * contact * smoothstep(0.8,1.0,field.b) * smoothstep(0.0,0.05,min(rim.x,rim.y));
          vec2 edge = min(v.quadUv, 1.0-v.quadUv);
          soft *= smoothstep(0.0, 0.15, min(edge.x,edge.y));
        }
        vec4 texel = texture2DSRGB(material_EffectAtlas,v.uv);
        gl_FragColor = outputSRGBCorrection(vec4(texel.rgb * material_EffectColor.rgb,texel.a * v.alpha * soft));
      }
    }
  }
}
