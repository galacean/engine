/**
 * @title ShaderLab Basic
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*C7Y1RaI_ZJEAAAAAAAAAAAAADiR2AQ/original
 */

import { GUI } from 'dat.gui';
import { OrbitControl } from '@galacean/engine-toolkit-controls';
import {
  BufferMesh,
  Camera,
  Logger,
  WebGLEngine,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexElement,
  VertexElementFormat,
  MeshRenderer,
  Shader,
  Material,
  Color,
} from '@galacean/engine';
import { ShaderLab } from '@galacean/engine-shader-lab';

const shaderLab = new ShaderLab();

const normalShaderSource = `Shader "Triangle" {
  SubShader "Default" {
    Pass "0" {
      mat4 renderer_MVPMat;
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      };

      struct v2f {
        vec3 v_color;
      };

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

const linesShaderSource = `
Shader "Lines" {
  SubShader "Default" {
    Pass "0" {
      mat4 renderer_MVPMat;
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      };

      struct v2f {
        vec4 v_pos;
        vec3 v_color;
      };

      VertexShader = vert;
      FragmentShader = frag;

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        o.v_pos = v.POSITION;
        return o;
      }

      #define S smoothstep
      vec4 scene_ElapsedTime;

      vec4 Line(vec2 uv, float speed, float height, vec3 col) {
        uv.y += S(1.0, 0.0, abs(uv.x)) * sin(scene_ElapsedTime.x * speed + uv.x * height) * 0.2;
        return vec4(S(0.06 * S(0.2, 0.9, abs(uv.x)), 0.0, abs(uv.y) - 0.004) * col, 1.0) * S(1.0, 0.3, abs(uv.x));
      } 
    
      void frag(v2f i) {
        vec2 uv = i.v_pos.xy;
        vec4 color = vec4(0.0);
        for (float i = 0.0; i <= 5.; i += 1.0) {
          float t = i / 5.0;
          color += Line(uv, 1.0 + t, 4.0 + t, vec3(0.2 + t * 0.7, 0.2 + t * 0.4, 0.3));
        }
        gl_FragColor = color;
      }
    }
  }
}`;

function createPlaneMesh(engine: WebGLEngine) {
  const mesh = new BufferMesh(engine);
  const vertices = new Float32Array([
    -1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1,
  ]);
  const vertexBuffer = new Buffer(
    engine,
    BufferBindFlag.VertexBuffer,
    vertices,
    BufferUsage.Static
  );
  mesh.setVertexBufferBinding(vertexBuffer, 12);
  mesh.setVertexElements([
    new VertexElement('POSITION', 0, VertexElementFormat.Vector3, 0),
  ]);
  mesh.addSubMesh(0, 6);
  return mesh;
}

Logger.enable();
WebGLEngine.create({ canvas: 'canvas', shaderLab }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const shaderMap = {
    normal: Shader.create(normalShaderSource),
    lines: Shader.create(linesShaderSource),
  };

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild('cameraNode');
  cameraEntity.transform.setPosition(0, 0, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // create plane
  const triangle = rootEntity.createChild('plane');
  const renderer = triangle.addComponent(MeshRenderer);
  renderer.mesh = createPlaneMesh(engine);
  const shader = shaderMap.lines;
  const material = new Material(engine, shader);
  material.shaderData.setColor('u_color', new Color(1.0, 1.0, 0));
  renderer.setMaterial(material);

  engine.run();

  const state = {
    shader: 'lines',
  };

  function addGUI() {
    const gui = new GUI({ name: 'Switch Shader' });
    gui.add(state, 'shader', Object.keys(shaderMap)).onChange((v) => {
      material.shader = shaderMap[v];
    });
  }

  addGUI();
});
