/**
 * @title ShaderLab 02 - 渲染状态控制
 * @category Shader 教程
 * @thumbnail https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*cKkoT57kv5kAAAAAQYAAAAgAeuuHAQ/original
 */
import {
  Camera,
  Color,
  Engine,
  Entity,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";

// 不透明物体的着色器
const opaqueShaderSource = `
Shader "Tutorial/02-Opaque" {
  SubShader "Default" {
    Pass "Forward" {
      // 渲染状态：不透明物体的标准设置
      BlendState customBlendState {
        Enabled = false;           // 关闭混合
      }
      
      DepthState customDepthState {
        WriteEnabled = true;       // 开启深度写入
        CompareFunction = CompareFunction.LessEqual; // 深度测试函数
      }
      
      BlendState = customBlendState;
      DepthState = customDepthState;
      RenderQueueType = Opaque;
      
      mat4 renderer_MVPMat;
      vec4 material_BaseColor;
      
      struct Attributes {
        vec4 POSITION;
      };
      
      VertexShader = vert;
      FragmentShader = frag;
      
      
      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * attr.POSITION;
      }
      
      void frag() {
        gl_FragColor = material_BaseColor;
      }
    }
  }
}`;

// 透明物体的着色器
const transparentShaderSource = `
Shader "Tutorial/02-Transparent" {
  SubShader "Default" {
    Pass "Forward" {
      // 渲染状态：透明物体的标准设置
      BlendState customBlendState {
        Enabled = true;                    // 开启混合
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      
      DepthState customDepthState {
        WriteEnabled = false;        // 关闭深度写入（透明物体通常不写深度）
        CompareFunction = CompareFunction.LessEqual;       // 但仍然进行深度测试
      }

      BlendState = customBlendState;
      DepthState = customDepthState;
      RenderQueueType = Transparent;
      
      mat4 renderer_MVPMat;
      vec4 material_BaseColor;
      float material_Alpha;
      
      struct Attributes {
        vec4 POSITION;
      };
      
      VertexShader = vert;
      FragmentShader = frag;
      
      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * attr.POSITION;
      }
      
      void frag() {
        vec4 color = material_BaseColor;
        color.a = material_Alpha; // 使用自定义的透明度
        gl_FragColor = color;
      }
    }
  }
}`;

// 创建平面的辅助函数
function createPlane(engine: Engine, name: string, position: Vector3): Entity {
  const entity = engine.sceneManager.activeScene.createRootEntity(name);
  entity.transform.position = position;
  entity.transform.setRotation(90, 0, 0);

  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);

  return entity;
}

// 主程序
Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // 设置相机
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 6);
  const camera = cameraEntity.addComponent(Camera);

  // 创建不透明着色器和材质
  const opaqueShader = Shader.create(opaqueShaderSource);
  const opaqueMaterial = new Material(engine, opaqueShader);
  opaqueMaterial.shaderData.setColor("material_BaseColor", new Color(0.2, 0.8, 0.2, 1.0));

  // 创建透明着色器和材质
  const transparentShader = Shader.create(transparentShaderSource);
  const transparentMaterial = new Material(engine, transparentShader);
  transparentMaterial.shaderData.setColor("material_BaseColor", new Color(0.8, 0.2, 0.2, 1.0));
  transparentMaterial.shaderData.setFloat("material_Alpha", 0.5);

  // 创建两个平面
  const opaquePlane = createPlane(engine, "opaque", new Vector3(-0.5, 0, -1));
  const transparentPlane = createPlane(engine, "transparent", new Vector3(0.5, 0, 0));

  // 应用材质
  opaquePlane.getComponent(MeshRenderer).setMaterial(opaqueMaterial);
  transparentPlane.getComponent(MeshRenderer).setMaterial(transparentMaterial);

  // 添加动画效果
  engine.run();

  let time = 0;
  const animate = () => {
    time += 0.016;

    // 动态调整透明度
    const alpha = 0.3 + 0.4 * Math.sin(time * 2);
    transparentMaterial.shaderData.setFloat("material_Alpha", alpha);

    requestAnimationFrame(animate);
  };
  animate();

  console.log("ShaderLab 02 - 渲染状态控制");
  console.log("- 左侧绿色平面：不透明渲染状态（关闭混合，开启深度写入）");
  console.log("- 右侧红色平面：透明渲染状态（开启混合，关闭深度写入）");
  console.log("- 展示了 BlendState 和 DepthState 的配置");
  console.log("- 透明度会动态变化，观察混合效果");
});
