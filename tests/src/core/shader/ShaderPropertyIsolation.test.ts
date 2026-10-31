import {
  Camera,
  Color,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderFactory,
  ShaderProperty,
  ShaderPropertyType,
  Texture2D,
  TextureFormat,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const shaderCompiler = new ShaderCompiler();
const size = 64;

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

interface QuadDesc {
  x: number;
  y: number;
  material: Material;
  setup?: (renderer: MeshRenderer) => void;
}

describe("ShaderProperty isolation across shaders and groups", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    engine = await WebGLEngine.create({ canvas, shaderCompiler });
  });

  afterAll(() => {
    engine.destroy();
  });

  // Renders quads in a 2x2 world grid and returns a reader of the color at a world position
  function renderQuads(quads: QuadDesc[], frames = 1): (x: number, y: number) => number[] {
    const root = engine.sceneManager.activeScene.createRootEntity("IsolationRoot");
    const camEntity = root.createChild("Camera");
    camEntity.transform.setPosition(0, 0, 10);
    const camera = camEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 2;
    const colorTex = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rt = new RenderTarget(engine, size, size, colorTex);
    camera.renderTarget = rt;
    const mesh = PrimitiveMesh.createPlane(engine, 1.5, 1.5);

    for (let i = 0; i < quads.length; i++) {
      const { x, y, material, setup } = quads[i];
      const entity = root.createChild(`Quad${i}`);
      entity.transform.setPosition(x, y, 0);
      entity.transform.setRotation(90, 0, 0);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      setup?.(renderer);
    }

    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    while (gl.getError() !== gl.NO_ERROR);
    for (let i = 0; i < frames; i++) {
      camera.render();
    }
    expect(gl.getError()).toBe(gl.NO_ERROR);

    const pixels = new Uint8Array(size * size * 4);
    colorTex.getPixelBuffer(pixels);
    camera.renderTarget = null;
    rt.destroy(true);
    root.destroy();
    mesh.destroy();

    // Offscreen readback rows grow downward in world space
    return (x: number, y: number) => {
      const idx = ((size / 2 - y * 16) * size + (size / 2 + x * 16)) * 4;
      return [pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]];
    };
  }

  it("renders shaders that use the same name with different types and groups", () => {
    const floatShader = createShader(
      "IsolationFloatHalo",
      "float material_Halo;",
      "vec4(material_Halo, 0.0, 0.0, 1.0)"
    );
    const vec4Shader = createShader("IsolationVec4Halo", "vec4 material_Halo;", "material_Halo");
    const rendererShader = createShader("IsolationRendererShared", "vec4 u_SharedValue;", "u_SharedValue");
    const materialShader = createShader(
      "IsolationMaterialShared",
      "float u_SharedValue;",
      "vec4(0.0, 0.0, u_SharedValue, 1.0)"
    );

    const floatMat = new Material(engine, floatShader);
    floatMat.shaderData.setFloat("material_Halo", 1);
    const vec4Mat = new Material(engine, vec4Shader);
    vec4Mat.shaderData.setColor("material_Halo", new Color(0, 1, 0, 1));
    const rendererMat = new Material(engine, rendererShader);
    const materialMat = new Material(engine, materialShader);
    materialMat.shaderData.setFloat("u_SharedValue", 1);

    const read = renderQuads([
      { x: -1, y: 1, material: floatMat },
      { x: 1, y: 1, material: vec4Mat },
      {
        x: -1,
        y: -1,
        material: rendererMat,
        setup: (renderer) => renderer.shaderData.setVector4("u_SharedValue", new Vector4(1, 1, 0, 1))
      },
      { x: 1, y: -1, material: materialMat }
    ]);

    expect(read(-1, 1)).toEqual([255, 0, 0, 255]);
    expect(read(1, 1)).toEqual([0, 255, 0, 255]);
    expect(read(-1, -1)).toEqual([255, 255, 0, 255]);
    expect(read(1, -1)).toEqual([0, 0, 255, 255]);
    [floatMat, vec4Mat, rendererMat, materialMat].forEach((material) => material.destroy());
  });

  it("resolves a name set in different groups by objects of the same shader per draw", () => {
    const shader = createShader("IsolationPerObjectGroup", "vec4 u_PerObjectColor;", "u_PerObjectColor");
    const materialOwned = new Material(engine, shader);
    materialOwned.shaderData.setColor("u_PerObjectColor", new Color(0, 1, 0, 1));
    const rendererOwned = new Material(engine, shader);

    const read = renderQuads([
      { x: -1, y: 0, material: materialOwned },
      {
        x: 1,
        y: 0,
        material: rendererOwned,
        setup: (renderer) => renderer.shaderData.setColor("u_PerObjectColor", new Color(0, 0, 1, 1))
      }
    ]);

    expect(read(-1, 0)).toEqual([0, 255, 0, 255]);
    expect(read(1, 0)).toEqual([0, 0, 255, 255]);
    materialOwned.destroy();
    rendererOwned.destroy();
  });

  it("regroups a uniform whose name becomes shared by another group after first draw", () => {
    const shader = createShader("IsolationLateConflict", "vec4 u_LateConflict;", "u_LateConflict");
    const material = new Material(engine, shader);
    material.shaderData.setColor("u_LateConflict", new Color(1, 0, 1, 1));
    expect(renderQuads([{ x: 0, y: 0, material }])(0, 0)).toEqual([255, 0, 255, 255]);

    const rendererOwned = new Material(engine, shader);
    const read = renderQuads([
      { x: -1, y: 0, material },
      {
        x: 1,
        y: 0,
        material: rendererOwned,
        setup: (renderer) => renderer.shaderData.setColor("u_LateConflict", new Color(0, 1, 1, 1))
      }
    ]);

    expect(read(-1, 0)).toEqual([255, 0, 255, 255]);
    expect(read(1, 0)).toEqual([0, 255, 255, 255]);
    material.destroy();
    rendererOwned.destroy();
  });

  it("keeps a renderer_ named property set on a material in the material group", () => {
    const shader = createShader(
      "IsolationRendererNameOnMaterial",
      "vec4 renderer_CustomOnMaterial;",
      "renderer_CustomOnMaterial"
    );
    const material = new Material(engine, shader);
    material.shaderData.setColor("renderer_CustomOnMaterial", new Color(1, 1, 0, 1));

    expect(renderQuads([{ x: 0, y: 0, material }])(0, 0)).toEqual([255, 255, 0, 255]);

    const injected = ShaderFactory.injectInstanceUBO(
      engine,
      `in vec3 POSITION;
      uniform mat4 renderer_MVPMat;
      uniform vec4 renderer_CustomOnMaterial;
      out vec4 v_color;
      void main() {
        gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
        v_color = renderer_CustomOnMaterial;
      }`,
      `in vec4 v_color;
      out vec4 fragColor;
      void main() {
        fragColor = v_color;
      }`
    );
    const fieldNames = injected.instanceLayout!.instanceFields.map((field) => field.property.name);
    expect(fieldNames).not.toContain("renderer_CustomOnMaterial");
    material.destroy();
  });

  it("handles type overwrites on the same ShaderData without leaking refs, batch fields or crashing", () => {
    const propName = "u_OverwriteSameData";
    const scene = engine.sceneManager.activeScene;
    const owner = scene.createRootEntity("OverwriteOwner");
    const renderer = owner.addComponent(MeshRenderer);
    const material = new Material(engine, Shader.find("Unlit"));
    renderer.setMaterial(material);
    const texA = new Texture2D(engine, 1, 1);
    const texB = new Texture2D(engine, 1, 1);

    material.shaderData.setTexture(propName, texA);
    expect(ShaderProperty.getByName(propName).types).toBe(ShaderPropertyType.Texture);
    expect(texA.refCount).toBe(1);
    material.shaderData.setFloat(propName, 2.5);
    expect(ShaderProperty.getByName(propName).types).toBe(ShaderPropertyType.Texture | ShaderPropertyType.Float);
    expect(texA.refCount).toBe(0);
    expect(material.shaderData.getFloat(propName)).toBe(2.5);
    material.shaderData.setTextureArray(propName, [texA, texB]);
    expect(texA.refCount).toBe(1);
    expect(texB.refCount).toBe(1);
    material.shaderData.setVector4(propName, new Vector4(1, 2, 3, 4));
    expect(texA.refCount).toBe(0);
    expect(texB.refCount).toBe(0);

    // Batch shared fields follow texture and scalar transitions
    const other = scene.createRootEntity("OverwriteOther").addComponent(MeshRenderer);
    renderer.shaderData.setTexture(propName, texA);
    expect(renderer.shaderData._matchesRendererBatchShared(other.shaderData)).toBe(false);
    renderer.shaderData.setFloat(propName, 42);
    expect(renderer.shaderData._matchesRendererBatchShared(other.shaderData)).toBe(true);
    other.entity.destroy();

    // cloneTo replaces a value of another type instead of copying into it
    const target = new Material(engine, Shader.find("Unlit"));
    target.shaderData.setVector3(propName, new Vector3(9, 8, 7));
    material.shaderData.cloneTo(target.shaderData);
    const cloned = target.shaderData.getVector4(propName);
    expect(cloned).toBeInstanceOf(Vector4);
    expect([cloned.x, cloned.y, cloned.z, cloned.w]).toEqual([1, 2, 3, 4]);
    target.destroy();

    // A stale non-texture value under a sampler falls back to the default white texture
    const samplerShader = createShader(
      "IsolationStaleSampler",
      "sampler2D material_StaleSampler;",
      "texture2D(material_StaleSampler, v.v_uv)"
    );
    const staleMat = new Material(engine, samplerShader);
    staleMat.shaderData.setFloat("material_StaleSampler", 0.5);
    expect(renderQuads([{ x: 0, y: 0, material: staleMat }])(0, 0)).toEqual([255, 255, 255, 255]);

    staleMat.destroy();
    owner.destroy();
    material.destroy();
    texA.destroy();
    texB.destroy();
  });

  it("packs custom uniforms set only in the renderer group into the instance UBO", () => {
    const renderer = engine.sceneManager.activeScene.createRootEntity("InstanceOwner").addComponent(MeshRenderer);
    renderer.shaderData.setColor("u_InstanceOnlyColor", new Color(1, 0, 0, 1));

    const injected = ShaderFactory.injectInstanceUBO(
      engine,
      `in vec3 POSITION;
      uniform mat4 renderer_MVPMat;
      uniform vec4 u_InstanceOnlyColor;
      out vec4 v_color;
      void main() {
        gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
        v_color = u_InstanceOnlyColor;
      }`,
      `in vec4 v_color;
      out vec4 fragColor;
      void main() {
        fragColor = v_color;
      }`
    );
    const fieldNames = injected.instanceLayout!.instanceFields.map((field) => field.property.name);
    expect(fieldNames).toContain("u_InstanceOnlyColor");
    renderer.entity.destroy();
  });
});
