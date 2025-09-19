/**
 * @title ShaderLab 01 - 基础着色器语法
 * @category Shader 教程
 * @thumbnail https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*Ykx2T7IuiAIAAAAAT0AAAAgAeuuHAQ/original
 */
import {
  Camera,
  Color,
  Engine,
  Entity,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";

// ShaderLab 基础语法示例
const shaderSource = `
Shader "Tutorial/01-BasicShader" {
  SubShader "Default" {
    // Pass 是渲染通道，定义具体的渲染逻辑
    Pass "Forward" {
      // 引擎内置的 MVP 矩阵，用于顶点变换
      mat4 renderer_MVPMat;
      
      // 自定义的材质属性
      vec4 material_BaseColor;
      sampler2D material_BaseTexture;
      
      // 顶点着色器输入结构体 (Attributes)
      struct Attributes {
        vec4 POSITION;    // 顶点位置
        vec2 TEXCOORD_0;  // UV 坐标
      };
      
      // 顶点着色器输出 / 片元着色器输入结构体 (Varyings)
      struct Varyings {
        vec2 uv;          // 传递给片元着色器的 UV 坐标
      };
      
      // 指定着色器入口函数
      VertexShader = vert;
      FragmentShader = frag;
      
      // 顶点着色器：处理顶点变换和数据传递
      Varyings vert(Attributes attr) {
        Varyings output;
        
        // 将顶点从模型空间变换到裁剪空间
        gl_Position = renderer_MVPMat * attr.POSITION;
        
        // 传递 UV 坐标给片元着色器
        output.uv = attr.TEXCOORD_0;
        
        return output;
      }
      
      // 片元着色器：计算每个像素的最终颜色
      void frag(Varyings varying) {
        // 从纹理中采样颜色
        vec4 texColor = texture2D(material_BaseTexture, varying.uv);
        
        // 与材质基础颜色相乘
        vec4 finalColor = texColor * material_BaseColor;
        
        // 输出最终颜色
        gl_FragColor = finalColor;
      }
    }
  }
}`;

// 创建几何体的辅助函数
function createQuad(engine: Engine): Entity {
  const entity = engine.sceneManager.activeScene.createRootEntity("quad");
  const renderer = entity.addComponent(MeshRenderer);
  
  // 使用内置的平面网格
  renderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);

  entity.transform.setRotation(90,0,0);
  
  return entity;
}

// 创建纹理的辅助函数
function createTexture(engine: Engine): Promise<Texture2D> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    
    // 创建一个简单的棋盘格纹理
    const tileSize = 32;
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#ff6b6b";
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
    
    const texture = new Texture2D(engine, canvas.width, canvas.height);
    texture.setImageSource(canvas);
    texture.generateMipmaps();
    
    resolve(texture);
  });
}

// 主程序
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  
  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  
  // 设置相机
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 2, 3);
  cameraEntity.transform.lookAt(new Vector3(0))
  cameraEntity.addComponent(Camera);
  
  // 创建着色器和材质
  const shader = Shader.create(shaderSource);
  const material = new Material(engine, shader);
  
  // 创建纹理并设置材质属性
  const texture = await createTexture(engine);
  material.shaderData.setTexture("material_BaseTexture", texture);
  material.shaderData.setColor("material_BaseColor", new Color(1, 1, 1, 1));
  
  // 创建渲染对象
  const quadEntity = createQuad(engine);
  const renderer = quadEntity.getComponent(MeshRenderer);
  renderer.setMaterial(material);
  
  // 添加旋转动画
  engine.run();
  
  let time = 0;
  const animate = () => {
    time += 0.016;
    quadEntity.transform.setRotation(0, time * 30, 0);
    
    requestAnimationFrame(animate);
  };
  animate();
  
  console.log("ShaderLab 01 - 基础着色器语法");
  console.log("- 展示了 Shader/SubShader/Pass 的基本结构");
  console.log("- 演示了顶点着色器的 MVP 变换");
  console.log("- 展示了 UV 坐标的传递和纹理采样");
  console.log("- 使用了材质属性进行颜色调制");
});