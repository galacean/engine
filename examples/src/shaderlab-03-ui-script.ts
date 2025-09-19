/**
 * @title ShaderLab 03 - UIScript 交互
 * @category Shader 教程
 * @thumbnail https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*5WoAR7VBZtcAAAAAS9AAAAgAeuuHAQ/original
 */
import {
  Camera,
  Color,
  Engine,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";

// 带有 Editor 属性和UIScript 的着色器（注意：属性面板和 UIScript 仅在编辑器中生效）
    // 实际的 UIScript 文件内容如下：
    /*
    export class UIScriptDemo extends ShaderUIScript {
      constructor() {
        super();
        
        // 当 UseTexture 改变时的回调
        this.onPropertyChanged("material_UseTexture", (value) => {
          const { material: { shaderData } } = this;
          
          if (value) {
            shaderData.enableMacro("USE_TEXTURE");
            // 显示纹理相关属性
            this.setPropertyVisible("material_BaseTexture", true);
          } else {
            shaderData.disableMacro("USE_TEXTURE");
            // 隐藏纹理相关属性
            this.setPropertyVisible("material_BaseTexture", false);
          }
        });
        
        // 当 EnableAnimation 改变时的回调
        this.onPropertyChanged("material_EnableAnimation", (value) => {
          const { material: { shaderData } } = this;
          
          if (value) {
            shaderData.enableMacro("ENABLE_ANIMATION");
            this.setPropertyVisible("material_AnimSpeed", true);
          } else {
            shaderData.disableMacro("ENABLE_ANIMATION");
            this.setPropertyVisible("material_AnimSpeed", false);
          }
        });
      }
    }
    */
const shaderSource = `
Shader "Tutorial/03-UIScript" {
  // Editor 模块定义材质面板的属性和交互
  Editor {
    Properties {
      // 基础属性
      material_BaseColor("Base Color", Color) = (1, 1, 1, 1);
      material_BaseTexture("Base Texture", Texture2D);
      
      // 分组显示
      Header("Effects") {
        material_UseTexture("Use Texture", Boolean) = true;
        material_Brightness("Brightness", Range(0, 2, 0.01)) = 1.0;
        material_Contrast("Contrast", Range(0, 2, 0.01)) = 1.0;
      }
      
      Header("Animation") {
        material_EnableAnimation("Enable Animation", Boolean) = false;
        material_AnimSpeed("Animation Speed", Range(0, 5, 0.1)) = 1.0;
      }
    }
  }
  
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;
      float renderer_Time;
      
      vec4 material_BaseColor;
      sampler2D material_BaseTexture;
      float material_Brightness;
      float material_Contrast;
      float material_AnimSpeed;
      
      struct a2v {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };
      
      struct v2f {
        vec2 uv;
      };
      
      VertexShader = vert;
      FragmentShader = frag;
      
      v2f vert(a2v input) {
        v2f output;
        
        vec4 pos = input.POSITION;
        
        // 如果启用动画，添加顶点动画效果
        #ifdef ENABLE_ANIMATION
          pos.y += sin(pos.x * 3.0 + renderer_Time * material_AnimSpeed) * 0.2;
        #endif
        
        gl_Position = renderer_MVPMat * pos;
        output.uv = input.TEXCOORD_0;
        
        return output;
      }
      
      void frag(v2f input) {
        vec4 color = material_BaseColor;
        
        // 如果启用纹理，进行纹理采样
        #ifdef USE_TEXTURE
          vec4 texColor = texture2D(material_BaseTexture, input.uv);
          color *= texColor;
        #endif
        
        // 应用亮度和对比度调整
        color.rgb *= material_Brightness;
        color.rgb = (color.rgb - 0.5) * material_Contrast + 0.5;
        
        gl_FragColor = color;
      }
    }
  }
}`;

// 创建棋盘格纹理
function createCheckerTexture(engine: Engine): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  
  const tileSize = 32;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#4a90e2" : "#f39c12";
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  
  const texture = new Texture2D(engine, canvas.width, canvas.height);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  
  return texture;
}

// 主程序
Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  
  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 2, 5);
  cameraEntity.transform.lookAt(new Vector3(0))
  const camera = cameraEntity.addComponent(Camera);
  
  // 创建着色器和材质
  const shader = Shader.create(shaderSource);
  const material = new Material(engine, shader);
  
  // 设置材质属性
  const texture = createCheckerTexture(engine);
  material.shaderData.setTexture("material_BaseTexture", texture);
  material.shaderData.setColor("material_BaseColor", new Color(1, 1, 1, 1));
  material.shaderData.setFloat("material_Brightness", 1.0);
  material.shaderData.setFloat("material_Contrast", 1.0);
  material.shaderData.setFloat("material_AnimSpeed", 1.0);
  
  // 模拟 UIScript 的行为（在运行时手动控制宏）
  material.shaderData.enableMacro("USE_TEXTURE");
  material.shaderData.enableMacro("ENABLE_ANIMATION");
  
  // 创建平面
  const planeEntity = rootEntity.createChild("plane");
  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 3, 3, 20, 20); // 增加细分以显示顶点动画
  renderer.setMaterial(material);
  
  // 运行引擎
  engine.run();
  
  // 模拟属性变化的交互
  let time = 0;
  let toggleTimer = 0;
  let useTexture = true;
  let enableAnimation = true;
  
  const animate = () => {
    time += 0.016;
    toggleTimer += 0.016;
    
    // 每3秒切换一次纹理开关
    if (toggleTimer > 3.0) {
      toggleTimer = 0;
      useTexture = !useTexture;
      
      if (useTexture) {
        material.shaderData.enableMacro("USE_TEXTURE");
        console.log("✓ 启用纹理");
      } else {
        material.shaderData.disableMacro("USE_TEXTURE");
        console.log("✗ 禁用纹理");
      }
    }
    
    // 每6秒切换一次动画开关
    if (Math.floor(time) % 6 === 0 && Math.floor(time) !== Math.floor(time - 0.016)) {
      enableAnimation = !enableAnimation;
      
      if (enableAnimation) {
        material.shaderData.enableMacro("ENABLE_ANIMATION");
        console.log("✓ 启用动画");
      } else {
        material.shaderData.disableMacro("ENABLE_ANIMATION");
        console.log("✗ 禁用动画");
      }
    }
    
    // 动态调整亮度和对比度
    const brightness = 0.8 + 0.4 * Math.sin(time * 0.5);
    const contrast = 0.8 + 0.4 * Math.cos(time * 0.3);
    material.shaderData.setFloat("material_Brightness", brightness);
    material.shaderData.setFloat("material_Contrast", contrast);
    
    requestAnimationFrame(animate);
  };
  animate();
  
  console.log("ShaderLab 03 - UIScript 交互");
  console.log("- 展示了 Editor Properties 的定义和分组");
  console.log("- 演示了宏定义的条件编译（#ifdef USE_TEXTURE, ENABLE_ANIMATION）");
  console.log("- 模拟了 UIScript 中的属性联动逻辑");
  console.log("- 注意：真正的 UIScript 仅在编辑器中生效");
  console.log("- 观察纹理和动画的开关效果，以及亮度对比度的动态变化");
});