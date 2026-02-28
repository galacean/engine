/**
 * @title ShaderLab 04 - 多Pass渲染（描边效果）
 * @category Shader 教程
 * @thumbnail https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*h7mASJQZe5wAAAAATUAAAAgAeuuHAQ/original
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

// 多Pass描边着色器
const outlineShaderSource = `
Shader "Tutorial/04-Outline" {
  SubShader "Default" {
    // Pass 1: 描边Pass - 先渲染放大的背面
    Pass "Outline" {
      // 渲染状态：只渲染正面，用于描边
      RasterState customRasterState {
        CullMode = CullMode.Front;  // 剔除正面，只渲染背面
      }
      
      DepthState customDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }

      RasterState = customRasterState;
      DepthState = customDepthState;

      
      mat4 renderer_MVPMat;
      vec4 material_OutlineColor;
      float material_OutlineWidth;
      
      struct a2v {
        vec4 POSITION;
        vec3 NORMAL;
      };
      
      VertexShader = outlineVert;
      FragmentShader = outlineFrag;
      
      // 描边顶点着色器：沿法线方向扩展顶点
      void outlineVert(a2v input) {
        // 将顶点沿法线方向外扩
        vec4 pos = input.POSITION;
        pos.xyz += input.NORMAL * material_OutlineWidth;
        
        gl_Position = renderer_MVPMat * pos;
      }
      
      // 描边片元着色器：输出描边颜色
      void outlineFrag() {
        gl_FragColor = material_OutlineColor;
      }
    }
    
    // Pass 2: 主体Pass - 渲染物体本身
    Pass "Main" {
      // 渲染状态：正常渲染背面
      RasterState customRasterState {
        CullMode = CullMode.Back;   // 剔除背面，渲染正面
      }
      
      DepthState customDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      
      RasterState = customRasterState;
      DepthState = customDepthState;

      mat4 renderer_MVPMat;
      vec4 material_BaseColor;
      vec3 camera_Position;
      
      struct a2v {
        vec4 POSITION;
        vec3 NORMAL;
      };
      
      struct v2f {
        vec3 worldNormal;
        vec3 worldPos;
      };
      
      VertexShader = mainVert;
      FragmentShader = mainFrag;
      
      // 主体顶点着色器
      v2f mainVert(a2v input) {
        v2f output;
        
        gl_Position = renderer_MVPMat * input.POSITION;
        
        // 传递世界空间法线和位置（简化处理）
        output.worldNormal = input.NORMAL;
        output.worldPos = input.POSITION.xyz;
        
        return output;
      }
      
      // 主体片元着色器：简单的Lambert光照
      void mainFrag(v2f input) {
        vec3 normal = normalize(input.worldNormal);
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0)); // 固定光源方向
        
        // Lambert漫反射
        float NdotL = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = material_BaseColor.rgb * NdotL;
        
        // 添加环境光
        vec3 ambient = material_BaseColor.rgb * 0.3;
        
        gl_FragColor = vec4(diffuse + ambient, material_BaseColor.a);
      }
    }
  }
}`;

// 创建球体
function createSphere(engine: Engine, name: string, position: Vector3): Entity {
  const entity = engine.sceneManager.activeScene.createRootEntity(name);
  entity.transform.position=position;
  
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, 0.8, 64);
  
  return entity;
}

// 主程序
Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  
  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 2, 8);
  cameraEntity.transform.lookAt(new Vector3(0));
  const camera = cameraEntity.addComponent(Camera);
  
  // 创建描边着色器和材质
  const outlineShader = Shader.create(outlineShaderSource);
  const outlineMaterial = new Material(engine, outlineShader);
  
  // 设置描边材质属性
  outlineMaterial.shaderData.setColor("material_OutlineColor", new Color(0, 0, 0, 1)); // 黑色描边
  outlineMaterial.shaderData.setFloat("material_OutlineWidth", 0.05);
  outlineMaterial.shaderData.setColor("material_BaseColor", new Color(0.8, 0.3, 0.3, 1)); // 红色主体
  
  // 创建多个球体展示不同的描边效果
  const sphere1 = createSphere(engine, "sphere1", new Vector3(-2, 0, 0));
  const sphere2 = createSphere(engine, "sphere2", new Vector3(0, 0, 0));
  const sphere3 = createSphere(engine, "sphere3", new Vector3(2, 0, 0));
  
  // 为每个球体创建不同的颜色
  const material1 = outlineMaterial.clone();
  material1.shaderData.setColor("material_BaseColor", new Color(0.8, 0.3, 0.3, 1));
  material1.shaderData.setColor("material_OutlineColor", new Color(0, 0, 0, 1));
  material1.shaderData.setFloat("material_OutlineWidth", 0.03);
  
  const material2 = outlineMaterial.clone();
  material2.shaderData.setColor("material_BaseColor", new Color(0.3, 0.8, 0.3, 1));
  material2.shaderData.setColor("material_OutlineColor", new Color(0.2, 0.2, 0.8, 1));
  material2.shaderData.setFloat("material_OutlineWidth", 0.05);
  
  const material3 = outlineMaterial.clone();
  material3.shaderData.setColor("material_BaseColor", new Color(0.3, 0.3, 0.8, 1));
  material3.shaderData.setColor("material_OutlineColor", new Color(0.8, 0.8, 0.2, 1));
  material3.shaderData.setFloat("material_OutlineWidth", 0.08);
  
  // 应用材质
  sphere1.getComponent(MeshRenderer).setMaterial(material1);
  sphere2.getComponent(MeshRenderer).setMaterial(material2);
  sphere3.getComponent(MeshRenderer).setMaterial(material3);
  
  // 运行引擎
  engine.run();
  
  // 添加旋转动画
  let time = 0;
  const animate = () => {
    time += 0.016;
    
    // 旋转球体
    sphere1.transform.setRotation(time * 20, time * 30, 0);
    sphere2.transform.setRotation(0, time * 40, time * 25);
    sphere3.transform.setRotation(time * 15, 0, time * 35);
    
    // 动态调整描边宽度
    const outlineWidth1 = 0.02 + 0.03 * Math.sin(time * 2);
    const outlineWidth2 = 0.03 + 0.04 * Math.sin(time * 1.5 + 1);
    const outlineWidth3 = 0.04 + 0.05 * Math.sin(time * 1.8 + 2);
    
    material1.shaderData.setFloat("material_OutlineWidth", outlineWidth1);
    material2.shaderData.setFloat("material_OutlineWidth", outlineWidth2);
    material3.shaderData.setFloat("material_OutlineWidth", outlineWidth3);
    
    requestAnimationFrame(animate);
  };
  animate();
  
  console.log("ShaderLab 04 - 多Pass渲染（描边效果）");
  console.log("- 第一个Pass：描边Pass，剔除正面，沿法线扩展顶点");
  console.log("- 第二个Pass：主体Pass，正常渲染物体表面");
  console.log("- 展示了不同的 RasterState CullMode 设置");
  console.log("- 演示了多Pass渲染的执行顺序和深度测试");
  console.log("- 三个球体展示不同颜色和宽度的描边效果");
});