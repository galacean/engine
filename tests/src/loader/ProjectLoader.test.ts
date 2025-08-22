import { AssetType, Engine, AssetPromise } from "@galacean/engine-core";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { registerIncludes } from "@galacean/engine-shader-shaderlab";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ProjectLoader } from "@galacean/engine-loader";

const mock_project_data = {
  plugins: [],
  scene: "/Scene",
  engineVersion: "1.4.5",
  files: [
    {
      md5: "3d028bd4548c6c524ab7aa1cfbdac2fb",
      id: "0000200",
      virtualPath: "/Internal/Material/DefaultMat",
      type: "Material",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*qlcgSIWrvkwAAAAAAAAAAAAADkp5AQ/DefaultMat.json"
    },
    {
      md5: "419012a412fe6e73e689956df34048ff",
      id: "0000201",
      virtualPath: "/Internal/Material/SkyMat",
      type: "Material",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*VO7mSqz8fW4AAAAAAAAAAAAADkp5AQ/SkyMat.json"
    },
    {
      md5: "b3c3e29dc7dae7cdffa72d717ae41aca",
      id: "0000202",
      virtualPath: "/Internal/Material/ParticleMat",
      type: "Material",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*LjpQRqEnxo4AAAAAAAAAAAAADkp5AQ/ParticleMat.json"
    },
    {
      md5: "9d44bc43e5364915c39f7c26dab22663",
      id: "0000100",
      virtualPath: "/Internal/Mesh/Cuboid",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*QvyDTKHpDXQAAAAAAAAAAAAADkp5AQ/Cuboid.json"
    },
    {
      md5: "25efbe52f1c09a6dc4f027d900597d29",
      id: "0000101",
      virtualPath: "/Internal/Mesh/Sphere",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*cGCwRJ6dyI8AAAAAAAAAAAAADkp5AQ/Sphere.json"
    },
    {
      md5: "e3add7c7c6f8bb9af3791083ffb66a89",
      id: "0000102",
      virtualPath: "/Internal/Mesh/Plane",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*6x_eSqg1EtkAAAAAAAAAAAAADkp5AQ/Plane.json"
    },
    {
      md5: "8b6fa7acc7dbebb71953d503eaafd132",
      id: "0000103",
      virtualPath: "/Internal/Mesh/Cylinder",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Mz59Qq2KRHoAAAAAAAAAAAAADkp5AQ/Cylinder.json"
    },
    {
      md5: "a84cccc3d29f355ee185086ea9fbff68",
      id: "0000104",
      virtualPath: "/Internal/Mesh/Capsule",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*wrYRQrZ3250AAAAAAAAAAAAADkp5AQ/Capsule.json"
    },
    {
      md5: "971138dcb4dc4b3829ad5ec9d5e23f4c",
      id: "0000107",
      virtualPath: "/Internal/Mesh/Cone",
      type: "PrimitiveMesh",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*JrChTLSZM1MAAAAAAAAAAAAADkp5AQ/Cone.json"
    },
    {
      md5: "4b97463ea558d6a583e0b3c761b8e770",
      id: "0000300",
      virtualPath: "/Internal/Bake/ambient",
      type: "Environment",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*QDsWQqStUxMAAAAAAAAAAAAADkp5AQ/ambient.json"
    },
    {
      md5: "27a089ba14a138106f7e5755dd585377",
      id: "0000301",
      virtualPath: "/Internal/Material/DefaultTexture",
      type: "EditorTexture2D",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*o3FVSpukgZYAAAAAAAAAAAAAekp5AQ/DefaultTexture.json"
    },
    {
      md5: "6f243180f4acb42c79bc0b70f08e9a48",
      id: "0000000",
      virtualPath: "/Scene",
      type: "Scene",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*DTzZRaFz6CEAAAAAAAAAAAAAekp5AQ/Scene.json"
    },
    {
      md5: "d9bde65688a49cd48b7573cd60516bab",
      id: "4fae1c4c-2438-44b9-bffd-eac5ea3b7fed",
      virtualPath: "/Internal/Shader/Advanced/Thin/Iridescence.gs",
      type: "Shader",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*96e-RpyPTS4AAAAAAAAAAAAADkp5AQ/Iridescence.gs"
    },
    {
      md5: "0498af076c24fb521bb39c80ffd3ea73",
      id: "dc9492f7-50be-4fab-b655-a52f126beec6",
      virtualPath: "/Internal/Shader/Advanced/Thin/IridescenceFunction.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*uL8ORa1IhsUAAAAAAAAAAAAADkp5AQ/IridescenceFunction.glsl"
    },
    {
      md5: "7c5f7a5fe968b43ea4715d5630e11985",
      id: "75216443-0ee5-46ad-b9a3-bd46b1670687",
      virtualPath: "/Internal/Shader/Advanced/Thin/IridescencedirectLight.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*CFx9TIVljjAAAAAAAAAAAAAADkp5AQ/IridescencedirectLight.glsl"
    },
    {
      md5: "d14c74066e59005def99171a6fc55561",
      id: "146b2042-952f-49b2-b760-093c7eb94ec1",
      virtualPath: "/Internal/Shader/Advanced/Thin/IridescenceIndirectLight.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*nd3LSYJFiswAAAAAAAAAAAAADkp5AQ/IridescenceIndirectLight.glsl"
    },
    {
      md5: "73aae7d76048cea5f886b84c90eda62f",
      id: "961d8370-c9f3-4717-b2c7-f4f36d63942f",
      virtualPath: "/Internal/Shader/Advanced/Thin/IridescenceForwardPass.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*oDfdSK800rQAAAAAAAAAAAAADkp5AQ/IridescenceForwardPass.glsl"
    },
    {
      md5: "792ed65c462dd3b2fcce309f2ed99778",
      id: "5b70961f-93c7-4858-8610-ac6b92a4a161",
      virtualPath: "/Internal/Shader/DigtalHuman/Eye/Eye.gs",
      type: "Shader",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*JQCHTYEDpT4AAAAAAAAAAAAADkp5AQ/Eye.gs"
    },
    {
      md5: "a836641216488c7ddba5948823a07ee9",
      id: "4476eabf-88e2-40f8-bb84-00078b6062f6",
      virtualPath: "/Internal/Shader/DigtalHuman/Eye/EyeForwardPass.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*X2f8ToCJ5RYAAAAAAAAAAAAADkp5AQ/EyeForwardPass.glsl"
    },
    {
      md5: "2cdfbf5fa2f41ed9172ed184e72c674f",
      id: "de36074e-1ab0-44ff-b8f8-cfec4e0962f5",
      virtualPath: "/Internal/Shader/DigtalHuman/Eye/EyeFunction.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Cz-aTo9YQpYAAAAAAAAAAAAADkp5AQ/EyeFunction.glsl"
    },
    {
      md5: "8a39911b830acee8ee68ae5220987d59",
      id: "8fc1ade6-18bf-4b83-8f25-8305f84f5217",
      virtualPath: "/Internal/Shader/DigtalHuman/Hair/Hair.gs",
      type: "Shader",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*WNf_SbnLhqUAAAAAAAAAAAAADkp5AQ/Hair.gs"
    },
    {
      md5: "a7f76533ced66f25eb0efc5b9ef49224",
      id: "939089da-ad7f-4ee8-8fc7-2d2e6a1da3ec",
      virtualPath: "/Internal/Shader/DigtalHuman/Hair/HairForwardPass.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*1TuVQbTbiIMAAAAAAAAAAAAADkp5AQ/HairForwardPass.glsl"
    },
    {
      md5: "8cd580eba19cee22b1317cbc051d45ac",
      id: "eca3ae2a-7709-4548-bfeb-8e17cec6eb3e",
      virtualPath: "/Internal/Shader/DigtalHuman/Hair/HairFunction.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*3ktcR6UThEQAAAAAAAAAAAAADkp5AQ/HairFunction.glsl"
    },
    {
      md5: "ba657a69a555a42354e2f45eff3c7748",
      id: "81d968ad-dbab-4096-81a8-44b35f9f4865",
      virtualPath: "/Internal/Shader/DigtalHuman/Hair/HairLightDirect.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*poDwR6RODu8AAAAAAAAAAAAADkp5AQ/HairLightDirect.glsl"
    },
    {
      md5: "c0fe4a0dbbdd36f86b22c0841d1e999e",
      id: "07e4a0db-5e77-40aa-973d-87c90cc50fb2",
      virtualPath: "/Internal/Shader/DigtalHuman/SSS/SSS.gs",
      type: "Shader",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*fOUZR7TOzXkAAAAAAAAAAAAADkp5AQ/SSS.gs"
    },
    {
      md5: "db4a62c7c7f430fb768c72a8ebe80b49",
      id: "bba1e8c3-8a9f-428e-9e16-237d2e61830f",
      virtualPath: "/Internal/Shader/DigtalHuman/SSS/SSSForwardPass.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*vC4MTbli9JwAAAAAAAAAAAAADkp5AQ/SSSForwardPass.glsl"
    },
    {
      md5: "f309a7e47a07d6953646f116e3fa45ff",
      id: "1d5473bf-b1f5-4674-a7dc-c8a54f12abb0",
      virtualPath: "/Internal/Shader/DigtalHuman/SSS/SSSFunction.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*_33fSYPl6q4AAAAAAAAAAAAADkp5AQ/SSSFunction.glsl"
    },
    {
      md5: "793bef78362a000c04a40ea4979f8d8c",
      id: "fa9034df-98cd-4733-9d73-e8e15673e36a",
      virtualPath: "/Internal/Shader/DigtalHuman/SSS/SSSLightDirect.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*-Z_XRbtU8tMAAAAAAAAAAAAADkp5AQ/SSSLightDirect.glsl"
    },
    {
      md5: "16d099e357e014aa4c268dac760a33c3",
      id: "e0462757-0f81-4dce-a7ca-7af4fa871f11",
      virtualPath: "/shader/PBRShader.gs",
      type: "Shader",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*_FEnQq66qtcAAAAAAAAAAAAAekp5AQ/PBRShader.gs"
    },
    {
      md5: "976917b0434fcda46f0dee36d58111bb",
      id: "bcb3ee22-8d5a-4c5b-8cd3-b7fef8da2d5f",
      virtualPath: "/ibl/Material",
      type: "Material",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*0ZgxS7WKiFIAAAAAAAAAAAAAekp5AQ/Material.json"
    },
    {
      md5: "50ffefd5bcbedc016fdc6f2d43260fb0",
      id: "471ef4df-604f-4e39-8840-bb2a1bb3095a",
      virtualPath: "/Internal/Bake/ambient.bin",
      type: "Environment",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*RtOxT71TSIYAAAAAAAAAAAAAekp5AQ/ambient.bin"
    },
    {
      md5: "704f73d920179213cc7e4cbfaf8699e9",
      id: "aee6c35a-9e86-4942-aae5-3f72dea3f6cd",
      virtualPath: "/refraction/DragonAttenuation.glb",
      type: "GLTF",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*44lZT6XvMhgAAAAAAAAAAAAAekp5AQ/DragonAttenuation.glb"
    },
    {
      md5: "fc9d5bfc0b17c120f5988180e360f35a",
      id: "ee6c93d8-4db4-4fe1-9bf9-2b712b718e6e",
      virtualPath: "/ibl/royal_esplanade_2k.hdr",
      type: "HDR",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*tqq0Q6EX7QgAAAAAAAAAAAAAekp5AQ/royal_esplanade_2k.hdr"
    },
    {
      md5: "58ef13f78e7f03230d0b66b2d7ffbea5",
      id: "66ffd228-7de0-413a-880c-b1b9fd9076ea",
      virtualPath: "/refraction/Dragon with Attenuation-copied",
      type: "Material",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*AWqoR4ObvZoAAAAAAAAAAAAAekp5AQ/Dragon with Attenuation-copied.json"
    },
    {
      md5: "65f8f139ea2c4c13f8092bb3b0cbc162",
      id: "33228485-1d80-4524-9f81-1c45c3dfb8c6",
      virtualPath: "/refraction/animation/AnimatorController",
      type: "AnimatorController",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*pCZ1Qo-e7YkAAAAAAAAAAAAAekp5AQ/AnimatorController.json"
    },
    {
      md5: "ea58ebf4e1b4bbf4f30d4a52d5c188e8",
      id: "089746c2-729e-420a-9234-e972fb103e49",
      virtualPath: "/refraction/animation/AnimationClip",
      type: "AnimationClip",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*ThygRrYszgUAAAAAAAAAAAAAekp5AQ/AnimationClip.json"
    },
    {
      md5: "a8a34a95df0102d4dfb3cd531bb873c9",
      id: "S000001",
      virtualPath: "/Internal/Shader/Library/BlendShape.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*CIy9TJnLyUsAAAAAAAAAAAAADkp5AQ/BlendShape.glsl"
    },
    {
      md5: "457294c59b98c6ee6691acc95c1676f1",
      id: "S000002",
      virtualPath: "/Internal/Shader/Library/Common.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*jmLsTbTlWKIAAAAAAAAAAAAAekp5AQ/Common.glsl"
    },
    {
      md5: "de101a250071b48dfd797758edf2ab1e",
      id: "S000003",
      virtualPath: "/Internal/Shader/Library/Fog.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*yx-LRqDV2W8AAAAAAAAAAAAADkp5AQ/Fog.glsl"
    },
    {
      md5: "5707c7431f4c962a14b04ea1a63dfe81",
      id: "S000004",
      virtualPath: "/Internal/Shader/Library/Light.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eFL_S7wvwXcAAAAAAAAAAAAADkp5AQ/Light.glsl"
    },
    {
      md5: "ad43d45cf9e1c7971bf3247ad818d69f",
      id: "S000005",
      virtualPath: "/Internal/Shader/Library/Normal.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*-aa5TLNE1SMAAAAAAAAAAAAADkp5AQ/Normal.glsl"
    },
    {
      md5: "b1c1f44432ac7a298cc7a175e3b39be0",
      id: "S000006",
      virtualPath: "/Internal/Shader/Library/ShadowSampleTent.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Nov8QKV-SysAAAAAAAAAAAAADkp5AQ/ShadowSampleTent.glsl"
    },
    {
      md5: "cb8ab95fd9dd97d67a5084fb15935146",
      id: "S000007",
      virtualPath: "/Internal/Shader/Library/Shadow.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*_wKbSKoyzbsAAAAAAAAAAAAADkp5AQ/Shadow.glsl"
    },
    {
      md5: "494af8531b6371032ccc358ee48da869",
      id: "S000008",
      virtualPath: "/Internal/Shader/Library/Transform.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*PUIdSYmWI3cAAAAAAAAAAAAADkp5AQ/Transform.glsl"
    },
    {
      md5: "77b824ad8b917f31786b16489eb6fbad",
      id: "S000009",
      virtualPath: "/Internal/Shader/Library/Skin.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*HdkETq4zqUkAAAAAAAAAAAAADkp5AQ/Skin.glsl"
    },
    {
      md5: "76d42ed801b879df0bd53c0ea064e1ba",
      id: "S000010",
      virtualPath: "/Internal/Shader/Library/shadingPBR/ForwardPassPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*ulTGRoP54KEAAAAAAAAAAAAAekp5AQ/ForwardPassPBR.glsl"
    },
    {
      md5: "83ac4da1b9adb4611463ce40528c0764",
      id: "S000011",
      virtualPath: "/Internal/Shader/Library/shadingPBR/AttributesPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*dy7iQLha38cAAAAAAAAAAAAADkp5AQ/AttributesPBR.glsl"
    },
    {
      md5: "4d2b34e75564778ed901862ac2dd1df1",
      id: "S000012",
      virtualPath: "/Internal/Shader/Library/shadingPBR/VaryingsPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*9Z94R5XB4d0AAAAAAAAAAAAADkp5AQ/VaryingsPBR.glsl"
    },
    {
      md5: "948e12d26b1b719ee2e38ba6315d4637",
      id: "S000013",
      virtualPath: "/Internal/Shader/Library/shadingPBR/FragmentPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*1MbwSaojFggAAAAAAAAAAAAAekp5AQ/FragmentPBR.glsl"
    },
    {
      md5: "30cdbdcb6ed9f513c762fb54176a5229",
      id: "S000014",
      virtualPath: "/Internal/Shader/Library/shadingPBR/LightDirectPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*pu7rSbm5958AAAAAAAAAAAAADkp5AQ/LightDirectPBR.glsl"
    },
    {
      md5: "ae347ca4d83b7a32b7112ec4c1d94bff",
      id: "S000015",
      virtualPath: "/Internal/Shader/Library/shadingPBR/LightIndirectPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*vdksT7xXyzgAAAAAAAAAAAAAekp5AQ/LightIndirectPBR.glsl"
    },
    {
      md5: "8fba9ab8892050762babd551da2823e5",
      id: "S000016",
      virtualPath: "/Internal/Shader/Library/shadingPBR/VertexPBR.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*SJNqRpoBt-4AAAAAAAAAAAAADkp5AQ/VertexPBR.glsl"
    },
    {
      md5: "9a30d19e4ea1f6691b9e5fd2dbf61662",
      id: "S000017",
      virtualPath: "/Internal/Shader/Library/shadingPBR/BRDF.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*dUVZTJMVleYAAAAAAAAAAAAADkp5AQ/BRDF.glsl"
    },
    {
      md5: "1448244504171e8403cd8b65ee464c4a",
      id: "S000018",
      virtualPath: "/Internal/Shader/Library/shadingPBR/LightIndirectFunctions.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Z9XCR5oKLMcAAAAAAAAAAAAAekp5AQ/LightIndirectFunctions.glsl"
    },
    {
      md5: "fd61f10373c95fc5d4fc2db2fa1248d9",
      id: "S000019",
      virtualPath: "/Internal/Shader/Library/shadingPBR/ReflectionLobe.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*vXgsT7CBGK0AAAAAAAAAAAAADkp5AQ/ReflectionLobe.glsl"
    },
    {
      md5: "b05df89c0fe450d8111b621fc2088ee5",
      id: "S000020",
      virtualPath: "/Internal/Shader/Library/Refraction.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Ql4ASJi_P6MAAAAAAAAAAAAADkp5AQ/Refraction.glsl"
    },
    {
      md5: "705024b95fdfbd28426d997b85f88234",
      id: "S000021",
      virtualPath: "/Internal/Shader/Library/BTDF.glsl",
      type: "ShaderChunk",
      path: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*UtI_QaLAQvkAAAAAAAAAAAAAekp5AQ/BTDF.glsl"
    }
  ]
};

describe("ProjectLoader", () => {
  let engine: Engine;

  beforeAll(async () => {
    const canvasDOM = document.createElement("canvas");
    canvasDOM.width = 1024;
    canvasDOM.height = 1024;
    const shaderLab = new ShaderLab();
    registerIncludes();

    engine = await WebGLEngine.create({
      canvas: canvasDOM,
      shaderLab: shaderLab
    });
  });

  afterAll(() => {
    engine?.destroy();
  });

  it("should track loading progress for all project files", async () => {
    const progressCallbacks: Array<{ loaded: number; total: number }> = [];
    const detailCallbacks: Array<{ url: string; loaded: number; total: number }> = [];

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(mock_project_data)], { type: "application/json;charset=utf-8" })
    );

    const promise = engine.resourceManager.load({
      url: url.toString(),
      type: AssetType.Project
    });

    promise
      .onProgress(
        (loaded: number, total: number) => {
          console.log("loaded:", loaded, "total:", total);
          progressCallbacks.push({ loaded, total });
        },
        (url: string, loaded: number, total: number) => {
          console.log("url:", url, "loaded:", loaded, "total:", total);
          detailCallbacks.push({ url, loaded, total });
        }
      )
      .catch((error) => {
        console.error(error);
      });

    await promise;

    expect(progressCallbacks[0]).toEqual({ loaded: 0, total: 1 });

    expect(progressCallbacks[progressCallbacks.length - 1]).toEqual({
      loaded: mock_project_data.files.length + 1,
      total: mock_project_data.files.length + 1
    });
  });
});
