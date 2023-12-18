import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  ShaderMacro,
  ShaderPass,
  ShaderProperty,
  ShaderTagKey,
  SubShader,
  RenderQueueType,
  Material,
  Engine
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { ShaderLab } from "@galacean/engine-shader-lab";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

describe("Shader", () => {
  let engine: Engine;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), shaderLab: new ShaderLab() });
  });

  describe("Custom Shader", () => {
    it("Shader", () => {
      // Create shader
      let customShader = Shader.create(engine, "customByStringCreate", customVS, customFS);
      customShader = Shader.create(engine, "customByPassCreate", [new ShaderPass(engine, customVS, customFS)]);
      customShader = Shader.create(engine, "custom", [
        new SubShader(engine, "Default", [new ShaderPass(engine, customVS, customFS)])
      ]);

      // Create same name shader
      expect(() => {
        Shader.create(engine, "custom", [
          new SubShader(engine, "Default", [new ShaderPass(engine, customVS, customFS)])
        ]);
      }).throw();

      // Create shader by empty SubShader array
      expect(() => {
        Shader.create(engine, "customByEmptySubShader", []);
      }).to.throw();

      // Create shader by empty string
      expect(() => {
        Shader.create(engine, "customByEmptyString", "", "");
      }).to.throw();

      // Create shader by empty pass
      expect(() => {
        Shader.create(engine, "customByEmptyPass", [new SubShader(engine, "Default", [])]);
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
      // Test that shader created successfully, if use shaderLab.
      let shader = Shader.create(engine, testShaderLabCode);
      expect(shader).to.be.an.instanceOf(Shader);
      expect(shader.subShaders.length).to.equal(1);
      expect(shader.subShaders[0].passes.length).to.equal(3);
      expect(shader.subShaders[0].getTagValue("RenderType")).to.equal("transparent");
      expect(shader.subShaders[0].passes[1].getTagValue("MyCustomTag")).to.equal("MyCustomValue");
      expect(shader.subShaders[0].passes[2].getTagValue("MyCustomTag2")).to.equal("MyCustomValue2");

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
      Tags { RenderType = "transparent" }

      UsePass "pbr-specular/Default/Forward"

      Pass "test" {
        Tags { MyCustomTag = "MyCustomValue" }

        RenderQueueType = RenderQueueType.Opaque;

        mat4 renderer_MVPMat;

        struct a2v {
          vec4 POSITION;
        }

        struct v2f {
          vec2 uv;
        }

        VertexShader = vert;
        FragmentShader = frag;

        v2f vert(a2v v) {
          gl_Position = renderer_MVPMat * v.POSITION;
          v2f o;
          o.uv = v.POSITION.xy * 0.5 + 0.7;
          return o;
        }

        void frag(v2f i) {
          gl_FragColor = mix(gl_FragColor, vec4(i.uv, 0, 1), 0.5);
        }
      }
      Pass "1" {
        Tags { MyCustomTag2 = "MyCustomValue2" }

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
          BlendColor = vec4(1, 1, 1, 0);
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
        }

        struct v2f {
          vec2 uv;
        }

        VertexShader = vert;
        FragmentShader = frag;

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
      }
    }
  }
`;
