/**
 * @title LUT Test
 * @category Material
 */
import { Camera, Material, MeshRenderer, PrimitiveMesh, Shader, Vector3, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

const shaderCompiler = new ShaderCompiler();

const shaderSource = `Shader "LUT-test" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
      };

      mat4 renderer_MVPMat;
      sampler2D scene_PrefilteredDFG;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.uv = attr.TEXCOORD_0;
        return v;
      }

      vec4 frag(Varyings v) {
        return texture2D(scene_PrefilteredDFG, v.uv);
      }
    }
  }
}`;

// Create engine
WebGLEngine.create({ canvas: "canvas", shaderCompiler })
  .then((engine) => {
    engine.canvas.resizeByClientSize(2);

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();

    // Create camera
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 3);
    const camera = cameraEntity.addComponent(Camera);

    const entity = rootEntity.createChild("Entity");
    entity.transform.setRotation(90, 0, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createPlane(engine, 1, 1);

    const shader = Shader.create(shaderSource);
    const material = new Material(engine, shader);
    renderer.setMaterial(material);
    updateForE2E(engine);
    initScreenshot(engine, camera);
  })
  .catch((e) => {
    console.log(e);
  });
