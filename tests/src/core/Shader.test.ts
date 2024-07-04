import { Vector2, Vector3, Vector4, Color } from "@galacean/engine-math";
import {
  BlendFactor,
  BlendOperation,
  BlinnPhongMaterial,
  Camera,
  CompareFunction,
  CullMode,
  DirectLight,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderQueueType,
  RenderStateDataKey,
  Shader,
  ShaderFactory,
  ShaderMacro,
  ShaderPass,
  ShaderProperty,
  ShaderTagKey,
  StencilOperation,
  SubShader
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { ShaderLab } from "@galacean/engine-shader-lab";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

const shaderLab = new ShaderLab(
  // @ts-ignore
  RenderStateDataKey,
  {
    RenderQueueType,
    CompareFunction,
    StencilOperation,
    BlendOperation,
    BlendFactor,
    CullMode
  },
  Color
);

describe("Shader", () => {
  describe("Custom Shader", () => {
    it("Shader", () => {
      // Create shader
      let customShader = Shader.create("customByStringCreate", customVS, customFS);
      customShader = Shader.create("customByPassCreate", [new ShaderPass(customVS, customFS)]);
      customShader = Shader.create("custom", [new SubShader("Default", [new ShaderPass(customVS, customFS)])]);

      // Create same name shader
      const errorSpy = chai.spy.on(console, "error");
      Shader.create("custom", [new SubShader("Default", [new ShaderPass(customVS, customFS)])]);
      expect(errorSpy).to.have.been.called.with('Shader named "custom" already exists.');
      chai.spy.restore(console, "error");

      // Create shader by empty SubShader array
      expect(() => {
        Shader.create("customByEmptySubShader", []);
      }).to.throw();

      // Create shader by empty string
      expect(() => {
        Shader.create("customByEmptyString", "", "");
      }).to.throw();

      // Create shader by empty pass
      expect(() => {
        Shader.create("customByEmptyPass", [new SubShader("Default", [])]);
      }).to.throw();

      // Base struct created by Shader.create
      expect(customShader.subShaders).length(1);
      expect(customShader.subShaders[0].passes).length(1);

      // Shader find
      expect(customShader).equal(Shader.find("custom"));

      // Shader property
      const customProperty = ShaderProperty.getByName("customProperty");
      expect(customProperty.name).to.equal("customProperty");

      // Shader macro
      const customMacro = ShaderMacro.getByName("CUSTOM_MACRO");

      // Shader macro with value
      const customMacroValue = ShaderMacro.getByName("CUSTOM_MACRO", "Value");
      expect(customMacro.name).to.equal("CUSTOM_MACRO");
      expect(customMacroValue.name).to.equal("CUSTOM_MACRO");
      expect(customMacroValue.value).to.equal("Value");

      // Compile variant
    });

    it("SubShader", () => {
      const customShader = Shader.find("custom");
      const subShader = customShader.subShaders[0];

      // Add tag by name
      subShader.setTag("customTagKey", "customTagValue");
      let getTag = subShader.getTagValue("customTagKey");
      expect(getTag).to.equal("customTagValue");

      // Delete tag by name
      subShader.deleteTag("customTagKey");
      getTag = subShader.getTagValue("customTagKey");
      expect(getTag).to.undefined;

      // Add tag
      subShader.setTag(ShaderTagKey.getByName("customTagKey"), "customTagValue");
      getTag = subShader.getTagValue(ShaderTagKey.getByName("customTagKey"));
      expect(getTag).to.equal("customTagValue");

      // Delete tag
      subShader.deleteTag(ShaderTagKey.getByName("customTagKey"));
      getTag = subShader.getTagValue(ShaderTagKey.getByName("customTagKey"));
      expect(getTag).to.undefined;
    });

    it("PassShader", () => {
      const customShader = Shader.find("custom");
      const shaderPass = customShader.subShaders[0].passes[0];

      // Add tag by name
      shaderPass.setTag("customTagKey", "customTagValue");
      let getTag = shaderPass.getTagValue("customTagKey");
      expect(getTag).to.equal("customTagValue");

      // Delete tag by name
      shaderPass.deleteTag("customTagKey");
      getTag = shaderPass.getTagValue("customTagKey");
      expect(getTag).to.undefined;

      // Add tag
      shaderPass.setTag(ShaderTagKey.getByName("customTagKey"), "customTagValue");
      getTag = shaderPass.getTagValue(ShaderTagKey.getByName("customTagKey"));
      expect(getTag).to.equal("customTagValue");

      // Delete tag
      shaderPass.deleteTag(ShaderTagKey.getByName("customTagKey"));
      getTag = shaderPass.getTagValue(ShaderTagKey.getByName("customTagKey"));
      expect(getTag).to.undefined;
    });

    it("Render and compile", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      // Get scene and create root entity
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("Root");

      // Create light
      const lightEntity = rootEntity.createChild("Light");
      const directLight = lightEntity.addComponent(DirectLight);
      lightEntity.transform.setRotation(-45, -45, 0);
      directLight.intensity = 0.4;

      // Create camera
      const cameraEntity = rootEntity.createChild("Camera");
      cameraEntity.addComponent(Camera);
      cameraEntity.transform.setPosition(0, 0, 12);

      // Create sphere
      const meshEntity = rootEntity.createChild("Sphere");
      const meshRenderer = meshEntity.addComponent(MeshRenderer);
      const material = new BlinnPhongMaterial(engine);
      meshRenderer.setMaterial(material);
      meshRenderer.mesh = PrimitiveMesh.createSphere(engine, 1);

      // Call update will compile shader internally
      engine.update();
    });

    it("ShaderLab", async function () {
      const engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        shaderLab
      });

      // Test that shader created successfully, if use shaderLab.
      let shader = Shader.create(testShaderLabCode);
      expect(shader).to.be.an.instanceOf(Shader);
      expect(shader.subShaders.length).to.equal(1);
      expect(shader.subShaders[0].passes.length).to.equal(3);
      expect(shader.subShaders[0].getTagValue("ReplacementTag")).to.equal("transparent");

      // Test that throw error, if shader was created with same name in shaderLab.
      // expect(() => {
      //   Shader.create(testShaderLabCode);
      // }).throw();

      const scene = engine.sceneManager.activeScene;
      const cameraEntity = scene.createRootEntity("camera");
      const camera = cameraEntity.addComponent(Camera);
      cameraEntity.transform.setPosition(0, 0, 10);

      const lightEntity = scene.createRootEntity("light");
      const directLight = lightEntity.addComponent(DirectLight);
      lightEntity.transform.setRotation(-45, -45, 0);

      const meshEntity = scene.createRootEntity("mesh");
      const mr = meshEntity.addComponent(MeshRenderer);
      mr.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      mr.setMaterial(new Material(engine, shader));

      // Test that shader compile variant successfully, if use shaderLab.
      expect(shader.compileVariant(engine, ["SET_TEXTURE_GRAY"])).to.be.equal(true);
      const macro = ShaderMacro.getByName("SET_TEXTURE_GRAY");

      mr.shaderData.enableMacro("SET_TEXTURE_GRAY");
      expect(mr.shaderData["_macroCollection"].isEnable(macro)).to.be.equal(true);

      engine.update();

      mr.shaderData.disableMacro("SET_TEXTURE_GRAY");
      expect(mr.shaderData["_macroCollection"].isEnable(macro)).to.be.equal(false);

      engine.update();

      // Test get macro is same as ShaderMacro.getByName
      expect(Shader.getMacroByName("SET_TEXTURE_GRAY")).to.be.equal(macro);
    });
  });

  describe("GLSL Convert test", () => {
    it("Shader api vertex replace test", async () => {
      expect(
        ShaderFactory.convertTo300(
          `
        attribute vec3 POSITION;
        attribute vec2 TEXCOORD_0;
        varying vec2 v_uv;
        uniform sampler2D u_texture;
        uniform samplerCube u_textureCube;

        void main(){
          gl_Position = vec4(POSITION, 1.0);
          v_uv = TEXCOORD_0;
          vec4 color1 = texture2D(u_texture, TEXCOORD_0);
          vec4 color2 = textureCube(u_textureCube, POSITION);
          vec4 color3 = texture2DProj(u_texture, POSITION);
        }
    `
        )
      ).to.be.equal(`
        in vec3 POSITION;
        in vec2 TEXCOORD_0;
        out vec2 v_uv;
        uniform sampler2D u_texture;
        uniform samplerCube u_textureCube;

        void main(){
          gl_Position = vec4(POSITION, 1.0);
          v_uv = TEXCOORD_0;
          vec4 color1 = texture(u_texture, TEXCOORD_0);
          vec4 color2 = texture(u_textureCube, POSITION);
          vec4 color3 = textureProj(u_texture, POSITION);
        }
    `);
    });

    it("Shader api fragment replace test", async () => {
      expect(
        ShaderFactory.convertTo300(
          `
        varying vec2 v_uv; 
        uniform sampler2D u_texture;
        uniform samplerCube u_textureCube;

        void main(){
          gl_FragColor = texture2D(u_texture, v_uv);
          vec4 color1 = textureCube(u_textureCube, vec3(1));
          vec4 color2 = texture2DProj(u_textureCube, vec3(1));
          vec4 color3 = texture2DLodEXT(u_texture, v_uv, 1.0);
          vec4 color4 = textureCubeLodEXT(u_textureCube, vec3(1), 1.0);
          vec4 color5 = texture2DGradEXT(u_texture, v_uv, vec2(1), vec2(1));
          vec4 color6 = textureCubeGradEXT(u_textureCube, v_uv, vec2(1), vec2(1));
          vec4 color7 = texture2DProjGradEXT(u_texture, vec3(1), vec2(1), vec2(1));
          vec4 color8 = texture2DProjLodEXT(u_texture, vec3(1), 1.0);
          gl_FragDepthEXT = 0.5;
        }
    `,
          true
        )
      ).to.be.equal(
        `
        in vec2 v_uv; 
        uniform sampler2D u_texture;
        uniform samplerCube u_textureCube;\n
        out vec4 glFragColor;\nvoid main(){
          glFragColor = texture(u_texture, v_uv);
          vec4 color1 = texture(u_textureCube, vec3(1));
          vec4 color2 = textureProj(u_textureCube, vec3(1));
          vec4 color3 = textureLod(u_texture, v_uv, 1.0);
          vec4 color4 = textureLod(u_textureCube, vec3(1), 1.0);
          vec4 color5 = textureGrad(u_texture, v_uv, vec2(1), vec2(1));
          vec4 color6 = textureGrad(u_textureCube, v_uv, vec2(1), vec2(1));
          vec4 color7 = textureProjGrad(u_texture, vec3(1), vec2(1), vec2(1));
          vec4 color8 = textureProjLod(u_texture, vec3(1), 1.0);
          gl_FragDepth = 0.5;
        }
    `
      );
    });

    it("Shader api fragment layout test", async () => {
      // original shader has out
      expect(
        ShaderFactory.convertTo300(
          `
        varying vec2 v_uv; 
        uniform sampler2D u_texture;

        out vec4 color;
        void main(){
          color = texture2D(u_texture, v_uv);
        }
    `,
          true
        )
      ).to.be.equal(
        `
        in vec2 v_uv; 
        uniform sampler2D u_texture;

        out vec4 color;
        void main(){
          color = texture(u_texture, v_uv);
        }
    `
      );

      // mrt
      expect(
        ShaderFactory.convertTo300(
          `
        varying vec2 v_uv; 
        uniform sampler2D u_texture;

        void main(){
          gl_FragData[0] = texture2D(u_texture, v_uv);
          gl_FragColor.rgb += vec3(0.1);
          gl_FragData[1] = texture2D(u_texture, v_uv);
          gl_FragData[2] = texture2D(u_texture, v_uv);
        }
    `,
          true
        )
      ).to.be.equal(
        `
        in vec2 v_uv; 
        uniform sampler2D u_texture;\n
        layout(location=0) out vec4 fragOutColor0;\nlayout(location=1) out vec4 fragOutColor1;\nlayout(location=2) out vec4 fragOutColor2;\nvoid main(){
          fragOutColor0 = texture(u_texture, v_uv);
          fragOutColor0.rgb += vec3(0.1);
          fragOutColor1 = texture(u_texture, v_uv);
          fragOutColor2 = texture(u_texture, v_uv);
        }
    `
      );
    });
  });
});

const customVS = `
#include <common>
#include <common_vert>
#include <blendShape_input>
#include <uv_share>
#include <FogVertexDeclaration>

void main() {

    #include <begin_position_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
    #include <uv_vert>
    #include <position_vert>

    #include <FogVertex>
}
`;

const customFS = `
#include <common>
#include <uv_share>
#include <FogFragmentDeclaration>

uniform vec4 material_BaseColor;
uniform float material_AlphaCutoff;

#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

void main() {
     vec4 baseColor = material_BaseColor;

    #ifdef MATERIAL_HAS_BASETEXTURE
        vec4 textureColor = texture2D(material_BaseTexture, v_uv);
        #ifndef ENGINE_IS_COLORSPACE_GAMMA
            textureColor = gammaToLinear(textureColor);
        #endif
        baseColor *= textureColor;
    #endif

    #ifdef MATERIAL_IS_ALPHA_CUTOFF
        if( baseColor.a < material_AlphaCutoff ) {
            discard;
        }
    #endif

    gl_FragColor = baseColor;

    #ifndef MATERIAL_IS_TRANSPARENT
        gl_FragColor.a = 1.0;
    #endif

    #include <FogFragment>

     #ifndef ENGINE_IS_COLORSPACE_GAMMA
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}
`;

const testShaderLabCode = `
  Shader "Test-Default" {
    SubShader "Default" {
      Tags { ReplacementTag = "transparent" }

      UsePass "pbr-specular/Default/Forward"

      Pass "test" {
        RenderQueueType = Opaque;

        mat4 renderer_MVPMat;

        struct a2v {
          vec4 POSITION;
        };

        struct v2f {
          vec2 uv;
        };

        v2f vert(a2v v) {
          gl_Position = renderer_MVPMat * v.POSITION;
          v2f o;
          o.uv = v.POSITION.xy * 0.5 + 0.7;
          return o;
        }

        void frag(v2f i) {
          gl_FragColor = mix(gl_FragColor, vec4(i.uv, 0, 1), 0.5);
        }

        VertexShader = vert;
        FragmentShader = frag;
      }
      Pass "1" {
        DepthState depthState {
          Enabled = true;
          WriteEnabled = true;
          CompareFunction = CompareFunction.LessEqual;
        }

        BlendState blendState {
          Enabled = true;
          ColorBlendOperation = BlendOperation.Add;
          AlphaBlendOperation = BlendOperation.Subtract;
          SourceColorBlendFactor = BlendFactor.SourceColor;
          SourceAlphaBlendFactor = BlendFactor.One;
          DestinationColorBlendFactor = BlendFactor.BlendColor;
          DestinationAlphaBlendFactor = BlendFactor.OneMinusBlendColor;
          ColorWriteMask = 16777130;
          BlendColor = Color(1, 1, 1, 0);
          AlphaToCoverage = true;
        }

        BlendState = blendState;

        StencilState stencilState {
          Enabled = true;
          Mask = 255;
          WriteMask = 255;
          ReferenceValue = 0;
          CompareFunctionFront = CompareFunction.Always;
          CompareFunctionBack = CompareFunction.Less;
          PassOperationFront = StencilOperation.Keep;
          PassOperationBack = StencilOperation.Keep;
          FailOperationFront = StencilOperation.Keep;
          FailOperationBack = StencilOperation.Keep;
          ZFailOperationFront = StencilOperation.Invert;
          ZFailOperationBack = StencilOperation.Invert;
        }

        RasterState rasterState {
          CullMode = CullMode.Back;
          DepthBias = 0.8;
          SlopeScaledDepthBias = 0.3;
        }

        mat4 renderer_MVPMat;

        sampler2D tex2d;

        struct a2v {
          vec4 POSITION;
          vec2 TEXCOORD_0;
        };

        struct v2f {
          vec2 uv;
        };

        v2f vert(a2v v) {
          gl_Position = renderer_MVPMat * (v.POSITION + vec4(0, 2, 0, 0));
          v2f o;
          o.uv = v.POSITION.xy * 0.5 + 0.7;
          return o;
        }

        void frag(v2f i) {
          #ifdef SET_TEXTURE_GRAY
            vec4 texColor = texture2D(tex2d, i.uv);
            float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
            gl_FragColor = vec4(gray, gray, gray, texColor.a);
          #else
            gl_FragColor = texture2D(tex2d, i.uv);
          #endif
        }

        VertexShader = vert;
        FragmentShader = frag;
      }
    }
  }
`;
