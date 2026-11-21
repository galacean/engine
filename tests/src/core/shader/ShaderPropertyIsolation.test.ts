import {
  Camera,
  Color,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderFactory,
  Texture2D,
  TextureFormat,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shaderCompiler = new ShaderCompiler();

function createShader(name: string, decl: string, fragOutput: string): Shader {
  return Shader.create(`
    Shader "${name}" {
      SubShader "Default" {
        Pass "Forward" {
          struct Attributes {
            vec3 POSITION;
          };
          struct Varyings {
            vec2 v_uv;
          };
          mat4 renderer_MVPMat;
          ${decl}
          VertexShader = vert;
          FragmentShader = frag;
          Varyings vert(Attributes attr) {
            Varyings v;
            gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
            v.v_uv = vec2(0.5);
            return v;
          }
          void frag(Varyings v) {
            gl_FragColor = ${fragOutput};
          }
        }
      }
    }
  `);
}

describe("ShaderProperty isolation across shaders and groups", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas, shaderCompiler });
  });

  afterAll(() => {
    engine.destroy();
  });

  it("renders different shaders using the same property name with different types and groups", () => {
    const propName = "material_Halo";
    const crossGroupName = "u_SharedIsolationValue";

    const floatShader = createShader("IsolationFloatHalo", `float ${propName};`, `vec4(${propName}, 0.0, 0.0, 1.0)`);
    const vec4Shader = createShader("IsolationVec4Halo", `vec4 ${propName};`, propName);
    const rendererGroupShader = createShader("IsolationRendererGroup", `vec4 ${crossGroupName};`, crossGroupName);
    const materialGroupShader = createShader(
      "IsolationMaterialGroup",
      `float ${crossGroupName};`,
      `vec4(0.0, 0.0, ${crossGroupName}, 1.0)`
    );

    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("IsolationRoot");
    const camEntity = root.createChild("Camera");
    camEntity.transform.setPosition(0, 0, 10);
    const camera = camEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 2;

    const colorTex = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rt = new RenderTarget(engine, 64, 64, colorTex);
    camera.renderTarget = rt;

    const mesh = PrimitiveMesh.createPlane(engine, 1.5, 1.5);
    const createQuad = (name: string, x: number, y: number, material: Material): MeshRenderer => {
      const e = root.createChild(name);
      e.transform.setPosition(x, y, 0);
      e.transform.setRotation(90, 0, 0);
      const r = e.addComponent(MeshRenderer);
      r.mesh = mesh;
      r.setMaterial(material);
      return r;
    };

    const matFloat = new Material(engine, floatShader);
    matFloat.shaderData.setFloat(propName, 1.0);
    createQuad("FloatQuad", -1, 1, matFloat);

    const matVec4 = new Material(engine, vec4Shader);
    matVec4.shaderData.setColor(propName, new Color(0, 1, 0, 1));
    createQuad("Vec4Quad", 1, 1, matVec4);

    const matRendererGroup = new Material(engine, rendererGroupShader);
    const rendererGroupMesh = createQuad("RendererGroupQuad", -1, -1, matRendererGroup);
    rendererGroupMesh.shaderData.setVector4(crossGroupName, new Vector4(1, 1, 0, 1));

    const matMaterialGroup = new Material(engine, materialGroupShader);
    matMaterialGroup.shaderData.setFloat(crossGroupName, 1.0);
    createQuad("MaterialGroupQuad", 1, -1, matMaterialGroup);

    try {
      const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      while (gl.getError() !== gl.NO_ERROR);
      camera.render();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const pixels = new Uint8Array(64 * 64 * 4);
      colorTex.getPixelBuffer(pixels);
      const read = (x: number, y: number) => {
        const idx = (y * 64 + x) * 4;
        return [pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]];
      };

      // Offscreen RenderTarget flips Y: world top (+1) maps to row 16, world bottom (-1) maps to row 48
      // Top-left (-1, +1) -> red from float material_Halo = 1.0
      expect(read(16, 16)).toEqual([255, 0, 0, 255]);
      // Top-right (+1, +1) -> green from vec4 material_Halo = (0, 1, 0, 1)
      expect(read(48, 16)).toEqual([0, 255, 0, 255]);
      // Bottom-left (-1, -1) -> yellow from renderer-group vec4 u_SharedIsolationValue
      expect(read(16, 48)).toEqual([255, 255, 0, 255]);
      // Bottom-right (+1, -1) -> blue from material-group float u_SharedIsolationValue
      expect(read(48, 48)).toEqual([0, 0, 255, 255]);
    } finally {
      camera.renderTarget = null;
      rt.destroy(true);
      root.destroy();
      matFloat.destroy();
      matVec4.destroy();
      matRendererGroup.destroy();
      matMaterialGroup.destroy();
      mesh.destroy();
    }
  });

  it("groups optional properties set only on a second draw within the same frame", () => {
    const propName = "material_OptionalSecondDraw";
    const shader = createShader("IsolationOptionalDraw", `vec4 ${propName};`, propName);

    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("OptionalRoot");
    const camEntity = root.createChild("Camera");
    camEntity.transform.setPosition(0, 0, 10);
    const camera = camEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 2;

    const colorTex = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rt = new RenderTarget(engine, 64, 64, colorTex);
    camera.renderTarget = rt;

    const mesh = PrimitiveMesh.createPlane(engine, 1.5, 1.5);
    const matUnset = new Material(engine, shader);
    const matSet = new Material(engine, shader);
    matSet.shaderData.setColor(propName, new Color(0, 1, 1, 1));

    const e1 = root.createChild("UnsetQuad");
    e1.transform.setPosition(-1, 0, 0);
    e1.transform.setRotation(90, 0, 0);
    const r1 = e1.addComponent(MeshRenderer);
    r1.mesh = mesh;
    r1.setMaterial(matUnset);

    const e2 = root.createChild("SetQuad");
    e2.transform.setPosition(1, 0, 0);
    e2.transform.setRotation(90, 0, 0);
    const r2 = e2.addComponent(MeshRenderer);
    r2.mesh = mesh;
    r2.setMaterial(matSet);

    try {
      camera.render();
      const pixels = new Uint8Array(64 * 64 * 4);
      colorTex.getPixelBuffer(pixels);
      const idx = (32 * 64 + 48) * 4;
      expect([pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]]).toEqual([0, 255, 255, 255]);
    } finally {
      camera.renderTarget = null;
      rt.destroy(true);
      root.destroy();
      matUnset.destroy();
      matSet.destroy();
      mesh.destroy();
    }
  });

  it("handles type overwrites on the same ShaderData without leaking texture refs, batch fields, or crashing cloneTo/render", () => {
    const propName = "u_OverwriteSameData";
    const scene = engine.sceneManager.activeScene;
    const owner = scene.createRootEntity("OverwriteOwner");
    const renderer = owner.addComponent(MeshRenderer);
    const material = new Material(engine, Shader.find("Unlit"));
    renderer.setMaterial(material);

    const texA = new Texture2D(engine, 1, 1);
    const texB = new Texture2D(engine, 1, 1);

    try {
      // Texture -> Float -> TextureArray -> Vector4 refCount balance
      material.shaderData.setTexture(propName, texA);
      expect(texA.refCount).toBe(1);

      material.shaderData.setFloat(propName, 2.5);
      expect(texA.refCount).toBe(0);
      expect(material.shaderData.getFloat(propName)).toBe(2.5);

      material.shaderData.setTextureArray(propName, [texA, texB]);
      expect(texA.refCount).toBe(1);
      expect(texB.refCount).toBe(1);

      material.shaderData.setVector4(propName, new Vector4(1, 2, 3, 4));
      expect(texA.refCount).toBe(0);
      expect(texB.refCount).toBe(0);

      // Renderer batch shared fields update cleanly across Texture <-> Float transitions
      const otherEntity = scene.createRootEntity("OverwriteOther");
      const otherRenderer = otherEntity.addComponent(MeshRenderer);
      renderer.shaderData.setTexture(propName, texA);
      expect(renderer.shaderData._matchesRendererBatchShared(otherRenderer.shaderData)).toBe(false);
      renderer.shaderData.setFloat(propName, 42);
      expect(renderer.shaderData._matchesRendererBatchShared(otherRenderer.shaderData)).toBe(true);
      otherEntity.destroy();

      // cloneTo safely replaces different property types instead of calling mismatched copyFrom
      const targetMaterial = new Material(engine, Shader.find("Unlit"));
      targetMaterial.shaderData.setVector3(propName, new Vector3(9, 8, 7));
      material.shaderData.cloneTo(targetMaterial.shaderData);
      const clonedV4 = targetMaterial.shaderData.getVector4(propName);
      expect(clonedV4).toBeInstanceOf(Vector4);
      expect([clonedV4.x, clonedV4.y, clonedV4.z, clonedV4.w]).toEqual([1, 2, 3, 4]);
      targetMaterial.destroy();

      // Stale non-texture property on a material switched to a sampler2D shader falls back to default texture cleanly
      const texProp = "material_SwitchedSampler";
      const samplerShader = createShader(
        "IsolationSwitchedSampler",
        `sampler2D ${texProp};`,
        `texture2D(${texProp}, v.v_uv)`
      );
      const switchMat = new Material(engine, samplerShader);
      switchMat.shaderData.setFloat(texProp, 0.5);

      const camEntity = scene.createRootEntity("SwitchCam");
      camEntity.transform.setPosition(0, 0, 10);
      const camera = camEntity.addComponent(Camera);
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      const colorTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
      const rt = new RenderTarget(engine, 16, 16, colorTex);
      camera.renderTarget = rt;

      const quad = scene.createRootEntity("SwitchQuad");
      quad.transform.setRotation(90, 0, 0);
      const mesh = PrimitiveMesh.createPlane(engine, 2, 2);
      const quadRenderer = quad.addComponent(MeshRenderer);
      quadRenderer.mesh = mesh;
      quadRenderer.setMaterial(switchMat);

      const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      while (gl.getError() !== gl.NO_ERROR);
      camera.render();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const pixels = new Uint8Array(16 * 16 * 4);
      colorTex.getPixelBuffer(pixels);
      const idx = (8 * 16 + 8) * 4;
      expect([pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]]).toEqual([255, 255, 255, 255]);

      camera.renderTarget = null;
      rt.destroy(true);
      camEntity.destroy();
      quad.destroy();
      switchMat.destroy();
      mesh.destroy();
    } finally {
      owner.destroy();
      material.destroy();
      texA.destroy();
      texB.destroy();
    }
  });

  it("includes renderer_-prefixed custom uniforms in GPU Instancing UBO regardless of set order", () => {
    const vertexSource = `
      in vec3 POSITION;
      uniform mat4 renderer_MVPMat;
      uniform vec4 renderer_PrecompileOnlyColor;
      out vec4 v_color;
      void main() {
        gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
        v_color = renderer_PrecompileOnlyColor;
      }
    `;
    const fragmentSource = `
      in vec4 v_color;
      out vec4 fragColor;
      void main() {
        fragColor = v_color;
      }
    `;

    const injected = ShaderFactory.injectInstanceUBO(engine, vertexSource, fragmentSource);
    expect(injected.instanceLayout).not.toBeNull();
    const fieldNames = injected.instanceLayout!.instanceFields.map((f) => f.property.name);
    expect(fieldNames).toContain("renderer_PrecompileOnlyColor");
  });
});
