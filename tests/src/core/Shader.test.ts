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
  SubShader
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

describe("Shader", () => {
  describe("Custom Shader", () => {
    it("Shader", () => {
      // Create shader
      let customShader = Shader.create("customByStringCreate", customVS, customFS);
      customShader = Shader.create("customByPassCreate", [new ShaderPass(customVS, customFS)]);
      customShader = Shader.create("custom", [new SubShader("Default", [new ShaderPass(customVS, customFS)])]);

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
