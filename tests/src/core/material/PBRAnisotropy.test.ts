import {
  AssetType,
  Camera,
  GLTFResource,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("PBR anisotropy", () => {
  let engine: WebGLEngine;
  let material: PBRMaterial;
  let texture: Texture2D;
  let output: Texture2D;
  let shader: Shader;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler()
    });

    // Read the production surface direction directly, independently of lighting and SSR.
    shader = Shader.create(`Shader "PBRAnisotropyDirection" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = PBRVertex;
        FragmentShader = inspectAnisotropy;
        #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
        vec4 inspectAnisotropy(Varyings v) {
          SurfaceData surface = getSurfaceData(v, v.uv, gl_FrontFacing);
          return vec4(surface.anisotropicT.xy * 0.5 + 0.5, surface.anisotropy, 1.0);
        }
      } }
    }`);
    const root = engine.sceneManager.activeScene!.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    // A linear render target avoids the canvas's final sRGB conversion.
    output = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8, false, false);
    camera.renderTarget = new RenderTarget(engine, 16, 16, output);
    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 1, 0)]);
    mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
    mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5, 1)]);
    mesh.setIndices(new Uint16Array([0, 1, 2]));
    mesh.addSubMesh(0, 3);
    mesh.bounds.min.set(-1, -1, 0);
    mesh.bounds.max.set(1, 1, 0);
    mesh.uploadData(false);
    const renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = mesh;
    material = new PBRMaterial(engine);
    material.shader = shader;
    material.anisotropy = 0.8;
    renderer.setMaterial(material);
    texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
  });

  afterAll(() => {
    engine?.destroy();
    shader?.destroy();
  });

  it.each([0, 45, 90])("rotates texture directions by %s degrees on the GPU", (rotation) => {
    material.anisotropyRotation = rotation;
    material.anisotropyTexture = texture;
    // The negative-X case also checks the rotation signs outside the first quadrant.
    for (const [r, g] of [
      [128, 255],
      [255, 128],
      [0, 128]
    ]) {
      texture.setPixelBuffer(new Uint8Array([r, g, 128, 255]));
      engine.update();
      const pixel = new Uint8Array(4);
      output.getPixelBuffer(8, 8, 1, 1, pixel);
      const direction = Math.atan2((2 * g) / 255 - 1, (2 * r) / 255 - 1) + (rotation * Math.PI) / 180;
      const expected = [
        (Math.cos(direction) * 0.5 + 0.5) * 255,
        (Math.sin(direction) * 0.5 + 0.5) * 255,
        0.8 * 128,
        255
      ];
      pixel.forEach((value, channel) => expect(Math.abs(value - expected[channel])).toBeLessThanOrEqual(2));
    }
  });

  it("preserves rotation and strength without a direction texture", () => {
    material.anisotropyTexture = null!;
    material.anisotropyRotation = 90;
    engine.update();
    const pixel = new Uint8Array(4);
    output.getPixelBuffer(8, 8, 1, 1, pixel);
    const expected = [128, 255, 204, 255];
    pixel.forEach((value, channel) => expect(Math.abs(value - expected[channel])).toBeLessThanOrEqual(2));
  });

  it("loads glTF radians as the equivalent material rotation in degrees", async () => {
    const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const expectedDegrees = [0, 90, 180, -90, 0];
    const extension = "KHR_materials_anisotropy";
    const glTF = {
      asset: { version: "2.0" },
      extensionsUsed: [extension],
      materials: [
        ...rotations.map((anisotropyRotation) => ({
          extensions: { [extension]: { anisotropyStrength: 0.8, anisotropyRotation } }
        })),
        { extensions: { [extension]: { anisotropyStrength: 0.8 } } }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(glTF)], { type: "model/gltf+json" }));
    let resource: GLTFResource | undefined;
    const manual = new PBRMaterial(engine);
    manual.anisotropy = 0.8;
    try {
      resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      expect(resource.materials).toHaveLength(expectedDegrees.length);
      resource.materials!.forEach((loaded: PBRMaterial, index) => {
        manual.anisotropyRotation = expectedDegrees[index];
        expect(loaded.anisotropyRotation).toBeCloseTo(expectedDegrees[index], 10);
        const actual = loaded.shaderData.getVector3("material_AnisotropyInfo");
        const expected = manual.shaderData.getVector3("material_AnisotropyInfo");
        expect(actual.x).toBeCloseTo(expected.x, 10);
        expect(actual.y).toBeCloseTo(expected.y, 10);
        expect(actual.z).toBe(expected.z);
        expect(loaded.anisotropyTexture).toBeUndefined();
      });
    } finally {
      manual.destroy();
      resource?.destroy();
      URL.revokeObjectURL(url);
    }
  });
});
