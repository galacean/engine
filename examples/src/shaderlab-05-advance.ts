/**
 * @title ShaderLab 05 - 引入内置shader片段实现骨骼动画
 * @category Shader 教程
 * @thumbnail https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*YPhHTr6_96AAAAAAQ-AAAAgAeuuHAQ/original
 */
import {
  Animator,
  AssetType,
  Camera,
  GLTFResource,
  Logger,
  Shader,
  SkinnedMeshRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { registerIncludes } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";

// 使用引擎内置Shader片段的骨骼动画Unlit着色器
const skinnedUnlitShaderSource = `
Shader "Tutorial/05-SkinnedUnlit" {
  SubShader "Default" {
    Pass "Forward" {
      // 引擎内置变量和矩阵
      #include "Transform.glsl"
      
      // 材质属性
      vec4 material_BaseColor;
      sampler2D material_BaseTexture;
      
      struct Attributes {
        vec4 POSITION;
        vec2 TEXCOORD_0;
        #ifdef RENDERER_HAS_SKIN
          vec4 JOINTS_0;    // 骨骼索引
          vec4 WEIGHTS_0;   // 骨骼权重
        #endif
      };
      
      struct Varyings {
        vec2 uv;
      };
      
      // 引用引擎内置的骨骼动画代码片段
      #include "Skin.glsl"

      VertexShader = vert;
      FragmentShader = frag;
      
      Varyings vert(Attributes attr) {
        Varyings output;
        
        // 使用引擎内置函数进行骨骼变换
        // getSkinMatrix 函数来自 Skin.glsl
        mat4 skinMatrix = getSkinMatrix(attr);
        
        // 应用骨骼变换
        vec4 skinnedPosition = skinMatrix * attr.POSITION;
        
        // MVP 变换
        gl_Position = renderer_MVPMat * skinnedPosition;
        
        // 传递UV坐标
        output.uv = attr.TEXCOORD_0;
        
        return output;
      }
      
      void frag(Varyings varying) {
        // 简单的 Unlit 着色
        vec4 texColor = texture2D(material_BaseTexture, varying.uv);
        vec4 finalColor = texColor * material_BaseColor;
        
        gl_FragColor = finalColor;
      }
    }
  }
}`;

// 主程序
Logger.enable();

// 注册引擎内置的Shader代码片段
registerIncludes();

WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();

  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(1, 1, 2);
  cameraEntity.transform.lookAt(new Vector3(0, 0.3, 0));
  const camera = cameraEntity.addComponent(Camera);

  try {
    console.log("正在创建骨骼动画演示...");

    // 创建自定义的骨骼动画着色器
    const customShader = Shader.create(skinnedUnlitShaderSource);

    const gltfResource = await engine.resourceManager.load<GLTFResource>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/f40ef8dd-4c94-41d4-8fac-c1d2301b6e47.glb",
      type: AssetType.GLTF
    });

    const modelEntity = gltfResource.instantiateSceneRoot();
    modelEntity.transform.setScale(0.01, 0.01, 0.01);
    rootEntity.addChild(modelEntity);

    // 应用自定义骨骼动画材质
    const renderers = modelEntity.getComponentsIncludeChildren(SkinnedMeshRenderer, []);
    renderers.forEach((renderer) => {
      const material = renderer.getMaterial();
      material.shader = customShader;
    });

    // 播放动画
    const animator = modelEntity.getComponent(Animator);
    if (animator && gltfResource.animations.length > 0) {
      animator.play(gltfResource.animations[0].name);
    }
  } catch (error) {
    console.warn("无法加载骨骼动画模型，展示着色器语法结构:", error);
  }

  // 运行引擎
  engine.run();

  // 展示着色器代码的关键特性
  console.log("\n=== 着色器关键特性解析 ===");
  console.log('1. #include "Skin.glsl" - 引用引擎内置骨骼动画代码');
  console.log("3. getSkinMatrix(Attributes) - 内置函数，计算骨骼变换矩阵");

  console.log("\n=== 引擎内置Shader片段的优势 ===");
  console.log("- 代码复用：避免重复编写复杂的骨骼动画逻辑");
  console.log("- 性能优化：引擎团队优化过的高效实现");
  console.log("- 兼容性：确保在不同平台上的一致性");
  console.log("- 维护性：引擎更新时自动获得改进");
});
