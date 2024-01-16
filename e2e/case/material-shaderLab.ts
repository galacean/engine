/**
 * @title ShaderLab Basic
 * @category Material
 */

import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Color,
  Logger,
  Material,
  MeshRenderer,
  Shader,
  VertexElement,
  VertexElementFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shader-lab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { E2E_CONFIG } from "../config";

const shaderLab = new ShaderLab();

const normalShaderSource = `Shader "Triangle" {
  SubShader "Default" {
    Pass "0" {
      mat4 renderer_MVPMat;
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      }

      struct v2f {
        vec3 v_color;
      }

      VertexShader = vert;
      FragmentShader = frag;

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      void frag(v2f i) {
        gl_FragColor = vec4(i.v_color, 1.0);
      }
    }
  }
}`;

function createPlaneMesh(engine: WebGLEngine) {
  const mesh = new BufferMesh(engine);
  const vertices = new Float32Array([-1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1]);
  const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
  mesh.setVertexBufferBinding(vertexBuffer, 12);
  mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
  mesh.addSubMesh(0, 6);
  return mesh;
}

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const shaderMap = {
    normal: Shader.create(normalShaderSource)
  };

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("cameraNode");
  cameraEntity.transform.setPosition(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);

  // create plane
  const triangle = rootEntity.createChild("plane");
  const renderer = triangle.addComponent(MeshRenderer);
  renderer.mesh = createPlaneMesh(engine);
  const shader = shaderMap.normal;
  const material = new Material(engine, shader);
  material.shaderData.setColor("u_color", new Color(1.0, 1.0, 0));
  renderer.setMaterial(material);

  updateForE2E(engine);

  initScreenshot(engine, camera);
});
