/**
 * @title ShaderLab 性能测试
 * @category Shader 教程
 */
import { Camera, Logger, Shader, ShaderMacro, Vector3, WebGLEngine } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { registerIncludes, PBRSource } from "@galacean/engine-shader";

// 启用 Logger 以查看编译耗时
Logger.enable();

// 性能测试结果存储
interface PerformanceResult {
  phase: string;
  time: number;
}

const performanceResults: PerformanceResult[] = [];

// 拦截 Logger.info 来收集性能数据
const originalLoggerInfo = Logger.info;
Logger.info = function (...args: any[]) {
  const message = args[0];
  if (typeof message === "string" && message.includes("cost time")) {
    const match = message.match(/\[Task - (.+?)\] cost time[:\s]+([0-9.]+)ms/);
    if (match) {
      performanceResults.push({
        phase: match[1],
        time: parseFloat(match[2])
      });
    }
  }
  originalLoggerInfo.apply(Logger, args);
};

// 创建性能统计面板
function createStatsPanel(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: #0f0;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    padding: 15px;
    border-radius: 5px;
    min-width: 350px;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 1000;
  `;
  document.body.appendChild(panel);
  return panel;
}

function updateStatsPanel(panel: HTMLDivElement, results: PerformanceResult[]) {
  let html = '<div style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">ShaderLab 编译性能统计</div>';

  if (results.length === 0) {
    html += '<div style="color: #888;">等待编译...</div>';
  } else {
    // 按阶段分组
    const phases = ["Pre processor", "CodeGen", "Total compilation", "parse macros"];

    phases.forEach((phase) => {
      const phaseResults = results.filter((r) => r.phase === phase);
      if (phaseResults.length > 0) {
        html += `<div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 5px;">`;
        html += `<div style="color: #ff0; font-weight: bold;">${phase}</div>`;

        phaseResults.forEach((result, index) => {
          html += `<div style="margin-left: 10px;">`;
          html += `  第 ${index + 1} 次: <span style="c#0ff;">${result.time.toFixed(2)}ms</span>`;
          html += `</div>`;
        });

        if (phaseResults.length > 1) {
          const avg = phaseResults.reduce((sum, r) => sum + r.time, 0) / phaseResults.length;
          const min = Math.min(...phaseResults.map((r) => r.time));
          const max = Math.max(...phaseResults.map((r) => r.time));
          html += `<div style="margin-left: 10px; color: #888;">`;
          html += `  平均: ${avg.toFixed(2)}ms | 最小: ${min.toFixed(2)}ms | 最大: ${max.toFixed(2)}ms`;
          html += `</div>`;
        }
        html += `</div>`;
      }
    });

    // 统计 parse macros 的次数
    const macroParses = results.filter((r) => r.phase === "parse macros");
    if (macroParses.length > 0) {
      html += `<div style="margin-top: 15px; padding-top: 10px; border-top: 2px solid #555;">`;
      html += `<div style="color: #f0f; font-weight: bold;">变种编译统计</div>`;
      html += `<div style="margin-left: 10px;">总变种数: <span style="color: #0ff;">${macroParses.length}</span></div>`;
      html += `</div>`;
    }
  }

  panel.innerHTML = html;
}

// 主程序
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();

  // 注册内置 shader includes
  registerIncludes();

  // 创建统计面板
  const statsPanel = createStatsPanel();
  updateStatsPanel(statsPanel, performanceResults);

  // 创建场景和相机
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 5);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(Camera);

  console.log("=".repeat(80));
  console.log("开始测试 PBR Shader 编译性能");
  console.log("=".repeat(80));

  // 测试 1: 首次编译 PBR Shader
  console.log("\n[测试 1] 首次编译 PBR Shader (包含 ForwardPassPBR.glsl)");
  performanceResults.length = 0;

  const startTime = performance.now();
  const pbrShader = Shader.create(PBRSource);
  const createTime = performance.now() - startTime;

  console.log(`Shader.create() 总耗时: ${createTime.toFixed(2)}ms`);
  updateStatsPanel(statsPanel, performanceResults);

  // 等待一下让用户看到结果
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 测试 2: 直接调用 _parseMacros 测试变种编译性能
  console.log("\n[测试 2] 测试不同宏组合的 _parseMacros 性能");

  // 获取 ShaderPass 的 _vertexSource 和 _fragmentSource（CodeGen 输出的保留宏分支的代码）
  const shaderPass = pbrShader.subShaders[0].passes[0];
  const vertexSource = (shaderPass as any)._vertexSource as string;
  const fragmentSource = (shaderPass as any)._fragmentSource as string;

  console.log(`vertexSource 长度: ${vertexSource.length} 字符`);
  console.log(`fragmentSource 长度: ${fragmentSource.length} 字符`);

  // 获取 shaderLab 实例
  const shaderLab = Shader._shaderLab;

  // 定义不同的宏组合（模拟 PBR 材质的不同配置）
  const macroVariants: ShaderMacro[][] = [
    [],
    [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE")],
    [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"), ShaderMacro.getByName("MATERIAL_HAS_NORMALTEXTURE")],
    [
      ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE")
    ],
    [
      ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_NORMALTEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_EMISSIVE_TEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_OCCLUSION_TEXTURE")
    ],
    [
      ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"),
      ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT"),
      ShaderMacro.getByName("MATERIAL_HAS_CLEAR_COAT_TEXTURE")
    ],
    [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"), ShaderMacro.getByName("MATERIAL_ENABLE_ANISOTROPY")],
    [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"), ShaderMacro.getByName("MATERIAL_ENABLE_SHEEN")],
    [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"), ShaderMacro.getByName("MATERIAL_ENABLE_TRANSMISSION")],
    [
      ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_NORMALTEXTURE"),
      ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT"),
      ShaderMacro.getByName("MATERIAL_ENABLE_ANISOTROPY"),
      ShaderMacro.getByName("SCENE_DIRECT_LIGHT_COUNT", "2")
    ],
    [
      ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_NORMALTEXTURE"),
      ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE"),
      ShaderMacro.getByName("MATERIAL_ENABLE_SHEEN"),
      ShaderMacro.getByName("MATERIAL_ENABLE_TRANSMISSION"),
      ShaderMacro.getByName("SCENE_USE_SH"),
      ShaderMacro.getByName("SCENE_USE_SPECULAR_ENV")
    ]
  ];

  console.log(`准备测试 ${macroVariants.length} 个宏变种...`);

  // 保留编译阶段数据
  const compilationResults = [...performanceResults];

  for (let i = 0; i < macroVariants.length; i++) {
    const macros = macroVariants[i];
    const macroNames = macros.map((m) => (m.value ? `${m.name}=${m.value}` : m.name)).join(", ") || "(无宏)";
    console.log(`\n变种 ${i + 1}/${macroVariants.length}: ${macroNames}`);

    const t0 = performance.now();
    const parsedVertex = shaderLab._parseMacros(vertexSource, macros);
    const vertexTime = performance.now() - t0;

    const t1 = performance.now();
    const parsedFragment = shaderLab._parseMacros(fragmentSource, macros);
    const fragmentTime = performance.now() - t1;

    console.log(`  vertex _parseMacros: ${vertexTime.toFixed(2)}ms (输出 ${parsedVertex.length} 字符)`);
    console.log(`  fragment _parseMacros: ${fragmentTime.toFixed(2)}ms (输出 ${parsedFragment.length} 字符)`);
    console.log(`  合计: ${(vertexTime + fragmentTime).toFixed(2)}ms`);

    updateStatsPanel(statsPanel, performanceResults);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // 最终统计
  console.log("\n" + "=".repeat(80));
  console.log("性能测试完成");
  console.log("=".repeat(80));

  const macroParseResults = performanceResults.filter((r) => r.phase.trim() === "parse macros");
  console.log(`\n编译阶段:`);
  compilationResults.forEach((r) => console.log(`  ${r.phase}: ${r.time.toFixed(2)}ms`));

  if (macroParseResults.length > 0) {
    const times = macroParseResults.map((r) => r.time);
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    console.log(`\n变种 _parseMacros 统计 (${times.length} 次):`);
    console.log(`  平均: ${avg.toFixed(2)}ms`);
    console.log(`  最小: ${Math.min(...times).toFixed(2)}ms`);
    console.log(`  最大: ${Math.max(...times).toFixed(2)}ms`);
    console.log(`  总计: ${times.reduce((s, t) => s + t, 0).toFixed(2)}ms`);
  }

  updateStatsPanel(statsPanel, performanceResults);
  engine.run();
});
