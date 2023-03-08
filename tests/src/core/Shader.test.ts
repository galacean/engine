import { Shader, ShaderTag } from "@oasis-engine/core";
import chai, { expect } from "chai";
import spies from "chai-spies";
import { ShaderProperty } from "packages/core/src";
import { ShaderMacro } from "packages/core/src/shader/ShaderMacro";

chai.use(spies);

describe("Shader", () => {
  describe("Custom Shader", () => {
    it("Shader", () => {
      const customShader = Shader.create("custom", customVS, customFS);
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
      expect(customMacro.name).to.equal("CUSTOM_MACRO");

      // Compile variant
    });

    it("SubShader", () => {
      const customShader = Shader.find("custom");
      const subShader = customShader.subShaders[0];

      // Add tag by name
      subShader.setTag("customTagKey", "customTagValue");
      let getTag = subShader.getTagValue("customTagKey");
      expect(getTag.name).to.equal("customTagValue");

      // Delete tag by name
      subShader.deleteTag("customTagKey");
      getTag = subShader.getTagValue("customTagKey");
      expect(getTag).to.undefined;

      // Add tag
      subShader.setTag(ShaderTag.getByName("customTagKey"), ShaderTag.getByName("customTagValue"));
      getTag = subShader.getTagValue(ShaderTag.getByName("customTagKey"));
      expect(getTag).to.equal(ShaderTag.getByName("customTagValue"));

      // Delete tag
      subShader.deleteTag(ShaderTag.getByName("customTagKey"));
      getTag = subShader.getTagValue(ShaderTag.getByName("customTagKey"));
      expect(getTag).to.undefined;
    });

    it("PassShader", () => {
      const customShader = Shader.find("custom");
      const shaderPass = customShader.subShaders[0].passes[0];

      // Add tag by name
      shaderPass.setTag("customTagKey", "customTagValue");
      let getTag = shaderPass.getTagValue("customTagKey");
      expect(getTag.name).to.equal("customTagValue");

      // Delete tag by name
      shaderPass.deleteTag("customTagKey");
      getTag = shaderPass.getTagValue("customTagKey");
      expect(getTag).to.undefined;

      // Add tag
      shaderPass.setTag(ShaderTag.getByName("customTagKey"), ShaderTag.getByName("customTagValue"));
      getTag = shaderPass.getTagValue(ShaderTag.getByName("customTagKey"));
      expect(getTag).to.equal(ShaderTag.getByName("customTagValue"));

      // Delete tag
      shaderPass.deleteTag(ShaderTag.getByName("customTagKey"));
      getTag = shaderPass.getTagValue(ShaderTag.getByName("customTagKey"));
      expect(getTag).to.undefined;
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

uniform vec4 u_baseColor;
uniform float u_alphaCutoff;

#ifdef BASETEXTURE
    uniform sampler2D u_baseTexture;
#endif

void main() {
     vec4 baseColor = u_baseColor;

    #ifdef BASETEXTURE
        vec4 textureColor = texture2D(u_baseTexture, v_uv);
        #ifndef OASIS_COLORSPACE_GAMMA
            textureColor = gammaToLinear(textureColor);
        #endif
        baseColor *= textureColor;
    #endif

    #ifdef ALPHA_CUTOFF
        if( baseColor.a < u_alphaCutoff ) {
            discard;
        }
    #endif

    gl_FragColor = baseColor;

    #ifndef OASIS_TRANSPARENT
        gl_FragColor.a = 1.0;
    #endif

    #include <FogFragment>

     #ifndef OASIS_COLORSPACE_GAMMA
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}
`;
