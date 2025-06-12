import {
  BlendOperation,
  CompareFunction,
  CullMode,
  RenderStateDataKey,
  ShaderPlatformTarget
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { ShaderLab as ShaderLabVerbose, GSError } from "@galacean/engine-shaderlab/verbose";
import { ShaderLab as ShaderLabRelease } from "@galacean/engine-shaderlab";
import { glslValidate, shaderParse } from "./ShaderValidate";
import { registerIncludes } from "@galacean/engine-shader-shaderlab";

import { IShaderSource } from "@galacean/engine-design";
import { describe, beforeAll, expect, assert, it } from "vitest";
import { server } from "@vitest/browser/context";
const { readFile } = server.commands;

const demoShader = await readFile("./shaders/demo.shader");

const commonMacros = [
  { name: "RENDERER_IS_RECEIVE_SHADOWS" },
  { name: "MATERIAL_IS_TRANSPARENT" },
  { name: "RENDERER_HAS_UV" },
  { name: "RENDERER_HAS_NORMAL" },
  { name: "RENDERER_HAS_TANGENT" },
  { name: "SCENE_FOG_MODE", value: "0" },
  { name: "SCENE_SHADOW_CASCADED_COUNT", value: "1" },
  { name: "CAMERA_ORTHOGRAPHIC" },
  { name: "MATERIAL_NEED_WORLD_POS" },
  { name: "MATERIAL_NEED_TILING_OFFSET" },
  { name: "SCENE_DIRECT_LIGHT_COUNT", value: "1" },
  { name: "MATERIAL_ENABLE_SS_REFRACTION" },
  { name: "MATERIAL_HAS_TRANSMISSION" },
  { name: "MATERIAL_HAS_THICKNESS" },
  { name: "MATERIAL_HAS_ABSORPTION" },
  { name: "MATERIAL_HAS_TRANSMISSION_TEXTURE" },
  { name: "REFRACTION_SPHERE" }
]
  .map((item) => `#define ${item.name} ${item.value ?? ""}`)
  .join("\n");

function toString(v: Color): string {
  return `Color(${v.r}, ${v.g}, ${v.b}, ${v.a})`;
}

const commonSource = `#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618
#define EPSILON 1e-6
#define LOG2 1.442695

#define saturate( a ) clamp( a, 0.0, 1.0 )

float pow2(float x ) {
    return x * x;
}

vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
}

vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
}

 vec4 camera_DepthBufferParams;

#ifdef GRAPHICS_API_WEBGL2
	#define INVERSE_MAT(mat) inverse(mat)
#else
	mat2 inverseMat(mat2 m) {
		return mat2(m[1][1],-m[0][1],
				-m[1][0], m[0][0]) / (m[0][0]*m[1][1] - m[0][1]*m[1][0]);
	}
	mat3 inverseMat(mat3 m) {
		float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2];
		float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2];
		float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2];

		float b01 = a22 * a11 - a12 * a21;
		float b11 = -a22 * a10 + a12 * a20;
		float b21 = a21 * a10 - a11 * a20;

		float det = a00 * b01 + a01 * b11 + a02 * b21;

		return mat3(b01, (-a22 * a01 + a02 * a21), (a12 * a01 - a02 * a11),
					b11, (a22 * a00 - a02 * a20), (-a12 * a00 + a02 * a10),
					b21, (-a21 * a00 + a01 * a20), (a11 * a00 - a01 * a10)) / det;
	}
	mat4 inverseMat(mat4 m) {
		float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
			a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
			a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
			a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

			b00 = a00 * a11 - a01 * a10,
			b01 = a00 * a12 - a02 * a10,
			b02 = a00 * a13 - a03 * a10,
			b03 = a01 * a12 - a02 * a11,
			b04 = a01 * a13 - a03 * a11,
			b05 = a02 * a13 - a03 * a12,
			b06 = a20 * a31 - a21 * a30,
			b07 = a20 * a32 - a22 * a30,
			b08 = a20 * a33 - a23 * a30,
			b09 = a21 * a32 - a22 * a31,
			b10 = a21 * a33 - a23 * a31,
			b11 = a22 * a33 - a23 * a32,

			det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

		return mat4(
			a11 * b11 - a12 * b10 + a13 * b09,
			a02 * b10 - a01 * b11 - a03 * b09,
			a31 * b05 - a32 * b04 + a33 * b03,
			a22 * b04 - a21 * b05 - a23 * b03,
			a12 * b08 - a10 * b11 - a13 * b07,
			a00 * b11 - a02 * b08 + a03 * b07,
			a32 * b02 - a30 * b05 - a33 * b01,
			a20 * b05 - a22 * b02 + a23 * b01,
			a10 * b10 - a11 * b08 + a13 * b06,
			a01 * b08 - a00 * b10 - a03 * b06,
			a30 * b04 - a31 * b02 + a33 * b00,
			a21 * b02 - a20 * b04 - a23 * b00,
			a11 * b07 - a10 * b09 - a12 * b06,
			a00 * b09 - a01 * b07 + a02 * b06,
			a31 * b01 - a30 * b03 - a32 * b00,
			a20 * b03 - a21 * b01 + a22 * b00) / det;
	}

	#define INVERSE_MAT(mat) inverseMat(mat)
#endif
`;

const shaderLabVerbose = new ShaderLabVerbose();
const shaderLabRelease = new ShaderLabRelease();

describe("ShaderLab", () => {
  let shader: IShaderSource;
  let subShader: IShaderSource["subShaders"][number];
  let passList: IShaderSource["subShaders"][number]["passes"];
  let pass1: IShaderSource["subShaders"][number]["passes"][number];

  beforeAll(() => {
    shader = shaderLabVerbose._parseShaderSource(demoShader);
    subShader = shader.subShaders[0];
    passList = subShader.passes;
    expect(passList[0].isUsePass).to.be.true;
    expect(passList[0].name).eq("pbr/Default/Forward");
    pass1 = passList[1];
    registerIncludes();
  });

  it("builtin-function", async () => {
    let shaderSource = await readFile("./shaders/builtin-function.shader");
    shaderSource = shaderSource.replace("__$$insert_maros$$__", commonMacros);
    glslValidate(shaderSource, shaderLabVerbose, {});
  });

  it("create shaderLab", async () => {
    expect(shaderLabVerbose).not.be.null;
  });

  it("shader name", () => {
    expect(shader.name).to.equal("Water");
    expect(subShader.name).to.equal("subname");
    expect(pass1.name).to.equal("default");
    expect(passList.length).to.eq(3);
    expect(passList[2].name).to.equal("blinn-phong/Default/Forward");
  });

  it("render state", () => {
    expect(pass1.renderStates).not.be.null;

    const { constantMap, variableMap } = pass1.renderStates;
    expect(Object.values(variableMap).includes("customRenderQueue"));

    expect(constantMap).not.be.null;

    expect(toString(constantMap[RenderStateDataKey.BlendStateBlendColor] as Color)).eq("Color(1, 1, 1, 1)");

    expect(constantMap).include({
      // Stencil State
      [RenderStateDataKey.StencilStateEnabled]: true,
      [RenderStateDataKey.StencilStateReferenceValue]: 2,
      [RenderStateDataKey.StencilStateMask]: 1.3,
      [RenderStateDataKey.StencilStateWriteMask]: 0.32,
      [RenderStateDataKey.StencilStateCompareFunctionFront]: CompareFunction.Less,
      // Blend State
      [RenderStateDataKey.BlendStateEnabled0]: true,
      [RenderStateDataKey.BlendStateColorWriteMask0]: 0.8,
      [RenderStateDataKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max,

      // Depth State
      [RenderStateDataKey.DepthStateEnabled]: true,
      [RenderStateDataKey.DepthStateWriteEnabled]: false,
      [RenderStateDataKey.DepthStateCompareFunction]: CompareFunction.Greater,

      // Raster State
      [RenderStateDataKey.RasterStateCullMode]: CullMode.Front,
      [RenderStateDataKey.RasterStateDepthBias]: 0.1,
      [RenderStateDataKey.RasterStateSlopeScaledDepthBias]: 0.8
    });

    expect(variableMap).include({
      [RenderStateDataKey.BlendStateSourceAlphaBlendFactor0]: "material_SrcBlend"
    });

    expect(shaderLabVerbose.errors.length).to.eq(1);
    expect(shaderLabVerbose.errors[0].message).contains("Invalid RenderQueueType variable: Unknown");
  });

  it("shader tags", () => {
    expect(subShader.tags).not.be.undefined;
    expect(subShader.tags).include({
      LightMode: "ForwardBase"
    });
    expect(pass1.tags).include({
      ReplacementTag: "Opaque",
      pipelineStage: "DepthOnly"
    });
  });

  it("engine shader", async () => {
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("include", async () => {
    const demoShader = await readFile("./shaders/unlit.shader");
    glslValidate(demoShader, shaderLabVerbose, { test_common: commonSource });
  });

  it("planarShadow shader", async () => {
    const demoShader = await readFile("./shaders/planarShadow.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("Empty macro shader", async () => {
    const demoShader = await readFile("./shaders/triangle.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("No frag shader args", async () => {
    const demoShader = await readFile("./shaders/noFragArgs.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("water full shader(complex)", async () => {
    const demoShader = await readFile("./shaders/waterfull.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("glass shader", async () => {
    const demoShader = await readFile("./shaders/glass.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("template shader", async () => {
    const demoShader = await readFile("./shaders/template.shader");
    glslValidate(demoShader, shaderLabVerbose);
    glslValidate(demoShader, shaderLabRelease);
  });

  it("multi-pass", async () => {
    const shaderSource = await readFile("./shaders/multi-pass.shader");
    glslValidate(shaderSource, shaderLabVerbose);
    glslValidate(shaderSource, shaderLabRelease);
  });

  it("macro-with-preprocessor", async () => {
    const shaderSource = await readFile("./shaders/macro-pre.shader");
    glslValidate(shaderSource, shaderLabVerbose);
    glslValidate(shaderSource, shaderLabRelease);
  });

  it("compilation-error", async () => {
    const errorShader = await readFile("./shaders/compilation-error.shader");
    shaderParse.bind(shaderLabVerbose)(errorShader);
    // @ts-ignore
    expect(shaderLabVerbose.errors.length).to.eq(3);
    // @ts-ignore
    assert.instanceOf(shaderLabVerbose.errors[0], GSError);
    // @ts-ignore
    assert.instanceOf(shaderLabVerbose.errors[1], GSError);
    // @ts-ignore
    assert.instanceOf(shaderLabVerbose.errors[2], GSError);

    // @ts-ignore
    for (const err of shaderLabVerbose.errors) {
      console.log(err.toString());
    }
  });

  it("mrt-normal", async () => {
    const shaderSource = await readFile("./shaders/mrt-normal.shader");
    glslValidate(shaderSource, shaderLabVerbose, {});
    glslValidate(shaderSource, shaderLabRelease, {});
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("./shaders/mrt-struct.shader");
    glslValidate(shaderSource, shaderLabVerbose, {});
    glslValidate(shaderSource, shaderLabVerbose, {});
  });

  it("mrt-error1", async () => {
    const shaderSource = await readFile("./shaders/mrt-error1.shader");
    shaderParse.bind(shaderLabVerbose)(shaderSource, [], ShaderPlatformTarget.GLES300);
    const errors = shaderLabVerbose.errors;
    expect(errors.length).to.eq(1);
    expect(errors[0]).to.be.a.instanceOf(GSError);
    expect(errors[0].toString()).include("cannot use both gl_FragData and gl_FragColor");
  });
});
