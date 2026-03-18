/**
 * @title ShaderLab DevTools - 预编译调试
 * @category Shader 教程
 */
import {
  Camera,
  Color,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { registerIncludes } from "@galacean/engine-shader";
import { ShaderLab } from "@galacean/engine-shaderlab";

// --- Default test shader ---
const defaultShaderSource = `
Shader "DevTools/TestShader" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;
      vec4 material_BaseColor;

      struct Attributes {
        vec4 POSITION;
      };

      struct Varyings {
        vec3 worldPos;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * attr.POSITION;
        output.worldPos = attr.POSITION.xyz;
        return output;
      }

      void frag(Varyings varying) {
        gl_FragColor = material_BaseColor * vec4(varying.worldPos * 0.5 + 0.5, 1.0);
      }
    }
  }
}`;

// --- UI Setup ---
function createUI() {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;display:flex;font-family:monospace;font-size:13px;z-index:1000;background:#1e1e1e;color:#d4d4d4;";

  // Left panel
  const leftPanel = document.createElement("div");
  leftPanel.style.cssText = "width:50%;display:flex;flex-direction:column;border-right:1px solid #333;";

  const leftHeader = document.createElement("div");
  leftHeader.style.cssText = "padding:8px 12px;background:#252526;border-bottom:1px solid #333;font-weight:bold;";
  leftHeader.textContent = "ShaderLab Source (Edit & Compile)";

  const sourceEditor = document.createElement("textarea");
  sourceEditor.style.cssText =
    "flex:1;background:#1e1e1e;color:#d4d4d4;border:none;padding:12px;resize:none;font-family:monospace;font-size:13px;tab-size:2;outline:none;";
  sourceEditor.value = defaultShaderSource;
  sourceEditor.spellcheck = false;

  const buttonBar = document.createElement("div");
  buttonBar.style.cssText = "padding:8px 12px;background:#252526;display:flex;gap:8px;border-top:1px solid #333;";

  const btnCompile = document.createElement("button");
  btnCompile.textContent = "Compile (Live)";
  btnCompile.style.cssText = "padding:6px 16px;background:#0e639c;color:white;border:none;cursor:pointer;border-radius:3px;";

  const btnPrecompile = document.createElement("button");
  btnPrecompile.textContent = "Precompile (.gsb)";
  btnPrecompile.style.cssText = "padding:6px 16px;background:#388a34;color:white;border:none;cursor:pointer;border-radius:3px;";

  const btnDownload = document.createElement("button");
  btnDownload.textContent = "Download .gsb";
  btnDownload.style.cssText = "padding:6px 16px;background:#6c6c6c;color:white;border:none;cursor:pointer;border-radius:3px;";
  btnDownload.disabled = true;

  buttonBar.append(btnCompile, btnPrecompile, btnDownload);

  const statsPanel = document.createElement("pre");
  statsPanel.style.cssText =
    "padding:8px 12px;background:#1a1a1a;max-height:120px;overflow:auto;margin:0;border-top:1px solid #333;font-size:12px;white-space:pre-wrap;";
  statsPanel.textContent = "Ready. Click Compile or Precompile.";

  const precompiledView = document.createElement("pre");
  precompiledView.style.cssText =
    "padding:8px 12px;background:#1a1a1a;max-height:200px;overflow:auto;margin:0;border-top:1px solid #333;font-size:11px;white-space:pre-wrap;display:none;";

  leftPanel.append(leftHeader, sourceEditor, buttonBar, statsPanel, precompiledView);

  // Right panel
  const rightPanel = document.createElement("div");
  rightPanel.style.cssText = "width:50%;display:flex;flex-direction:column;";

  const rightHeader = document.createElement("div");
  rightHeader.style.cssText = "padding:8px 12px;background:#252526;border-bottom:1px solid #333;font-weight:bold;";
  rightHeader.textContent = "Compiled GLSL Output";

  const tabBar = document.createElement("div");
  tabBar.style.cssText = "display:flex;background:#252526;border-bottom:1px solid #333;";

  const tabVertex = document.createElement("button");
  tabVertex.textContent = "Vertex";
  tabVertex.style.cssText = "padding:6px 16px;background:#1e1e1e;color:#d4d4d4;border:none;cursor:pointer;border-bottom:2px solid #0e639c;";

  const tabFragment = document.createElement("button");
  tabFragment.textContent = "Fragment";
  tabFragment.style.cssText = "padding:6px 16px;background:#252526;color:#888;border:none;cursor:pointer;border-bottom:2px solid transparent;";

  const tabDiff = document.createElement("button");
  tabDiff.textContent = "Diff (Live vs Precompiled)";
  tabDiff.style.cssText = "padding:6px 16px;background:#252526;color:#888;border:none;cursor:pointer;border-bottom:2px solid transparent;";

  tabBar.append(tabVertex, tabFragment, tabDiff);

  const glslOutput = document.createElement("pre");
  glslOutput.style.cssText =
    "flex:1;padding:12px;overflow:auto;margin:0;font-size:12px;white-space:pre-wrap;background:#1e1e1e;";
  glslOutput.textContent = "No compilation result yet.";

  // Macro selector
  const macroBar = document.createElement("div");
  macroBar.style.cssText = "padding:8px 12px;background:#252526;border-top:1px solid #333;";
  macroBar.innerHTML = '<span style="color:#888">Runtime Macros: </span>';

  const macroNames = ["GRAPHICS_API_WEBGL2", "HAS_TEX_LOD", "HAS_DERIVATIVES"];
  const macroCheckboxes: Record<string, HTMLInputElement> = {};
  macroNames.forEach((name) => {
    const label = document.createElement("label");
    label.style.cssText = "margin-right:12px;cursor:pointer;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.cssText = "margin-right:4px;";
    macroCheckboxes[name] = cb;
    label.append(cb, name);
    macroBar.append(label);
  });

  const macroExpandedOutput = document.createElement("pre");
  macroExpandedOutput.style.cssText =
    "max-height:200px;padding:8px 12px;overflow:auto;margin:0;font-size:11px;white-space:pre-wrap;background:#1a1a1a;border-top:1px solid #333;display:none;";

  // Render preview
  const previewContainer = document.createElement("div");
  previewContainer.style.cssText = "height:250px;border-top:1px solid #333;position:relative;";
  const previewLabel = document.createElement("div");
  previewLabel.style.cssText = "position:absolute;top:4px;left:8px;font-size:11px;color:#888;z-index:1;";
  previewLabel.textContent = "WebGL Render Preview";
  const previewCanvas = document.createElement("canvas");
  previewCanvas.id = "canvas";
  previewCanvas.style.cssText = "width:100%;height:100%;";
  previewContainer.append(previewLabel, previewCanvas);

  rightPanel.append(rightHeader, tabBar, glslOutput, macroBar, macroExpandedOutput, previewContainer);

  container.append(leftPanel, rightPanel);
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.prepend(container);

  return {
    sourceEditor,
    btnCompile,
    btnPrecompile,
    btnDownload,
    statsPanel,
    precompiledView,
    glslOutput,
    macroExpandedOutput,
    tabVertex,
    tabFragment,
    tabDiff,
    macroCheckboxes,
    previewCanvas
  };
}

// --- Main ---
const ui = createUI();
const shaderLab = new ShaderLab();

registerIncludes();

let lastLiveVertex = "";
let lastLiveFragment = "";
let lastPrecompiledVertex = "";
let lastPrecompiledFragment = "";
let lastGsbBuffer: ArrayBuffer | null = null;
let currentTab = "vertex";

// Tab switching
function setActiveTab(tab: string) {
  currentTab = tab;
  const tabs = [
    { el: ui.tabVertex, name: "vertex" },
    { el: ui.tabFragment, name: "fragment" },
    { el: ui.tabDiff, name: "diff" }
  ];
  tabs.forEach(({ el, name }) => {
    if (name === tab) {
      el.style.background = "#1e1e1e";
      el.style.color = "#d4d4d4";
      el.style.borderBottom = "2px solid #0e639c";
    } else {
      el.style.background = "#252526";
      el.style.color = "#888";
      el.style.borderBottom = "2px solid transparent";
    }
  });
  updateOutput();
}

ui.tabVertex.onclick = () => setActiveTab("vertex");
ui.tabFragment.onclick = () => setActiveTab("fragment");
ui.tabDiff.onclick = () => setActiveTab("diff");

function updateOutput() {
  if (currentTab === "vertex") {
    ui.glslOutput.textContent = lastLiveVertex || "No vertex output.";
  } else if (currentTab === "fragment") {
    ui.glslOutput.textContent = lastLiveFragment || "No fragment output.";
  } else {
    // Simple diff
    const liveV = lastLiveVertex;
    const preV = lastPrecompiledVertex;
    if (!liveV || !preV) {
      ui.glslOutput.textContent = "Run both Compile and Precompile to see diff.";
    } else if (liveV === preV && lastLiveFragment === lastPrecompiledFragment) {
      ui.glslOutput.innerHTML = '<span style="color:#4ec9b0;">MATCH - Live and Precompiled outputs are identical.</span>';
    } else {
      const lines: string[] = [];
      if (liveV !== preV) lines.push("VERTEX: MISMATCH");
      else lines.push("VERTEX: Match");
      if (lastLiveFragment !== lastPrecompiledFragment) lines.push("FRAGMENT: MISMATCH");
      else lines.push("FRAGMENT: Match");
      ui.glslOutput.innerHTML = `<span style="color:#f44747;">${lines.join("\n")}</span>`;
    }
  }
}

// Compile (live)
ui.btnCompile.onclick = () => {
  const source = ui.sourceEditor.value;
  try {
    const startTotal = performance.now();

    const shaderSource = shaderLab._parseShaderSource(source);
    const parseTime = performance.now() - startTotal;

    const basePath = new URL("", ShaderPass._shaderRootPath).href;

    let vertex = "";
    let fragment = "";
    let codegenTime = 0;

    shaderSource.subShaders.forEach((sub) => {
      sub.passes.forEach((pass) => {
        if (pass.isUsePass) return;
        const cgStart = performance.now();
        const result = shaderLab._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          ShaderLanguage.GLSLES100,
          basePath
        );
        codegenTime += performance.now() - cgStart;
        if (result) {
          vertex = result.vertex;
          fragment = result.fragment;
        }
      });
    });

    const totalTime = performance.now() - startTotal;

    lastLiveVertex = vertex;
    lastLiveFragment = fragment;

    ui.statsPanel.textContent = [
      `[Live Compile]`,
      `  Parse source: ${parseTime.toFixed(2)}ms`,
      `  Parse pass (Preprocess + Lex + Parse + CodeGen): ${codegenTime.toFixed(2)}ms`,
      `  Total: ${totalTime.toFixed(2)}ms`,
      `  Vertex length: ${vertex.length} chars`,
      `  Fragment length: ${fragment.length} chars`
    ].join("\n");

    updateOutput();
  } catch (e) {
    ui.statsPanel.textContent = `[Error] ${e}`;
    ui.statsPanel.style.color = "#f44747";
    setTimeout(() => (ui.statsPanel.style.color = "#d4d4d4"), 3000);
  }
};

// Precompile
ui.btnPrecompile.onclick = () => {
  const source = ui.sourceEditor.value;
  try {
    const basePath = new URL("", ShaderPass._shaderRootPath).href;

    const startTotal = performance.now();
    const precompiled = shaderLab._precompile(source, ShaderLanguage.GLSLES100, basePath);
    const precompileTime = performance.now() - startTotal;

    // Encode to binary
    const jsonStr = JSON.stringify(precompiled);
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(jsonStr);
    const buffer = new ArrayBuffer(8 + jsonBytes.byteLength);
    const view = new DataView(buffer);
    view.setUint32(0, 0x00425347, true); // "GSB\0"
    view.setUint16(4, precompiled.version, true);
    view.setUint16(6, 0, true);
    new Uint8Array(buffer, 8).set(jsonBytes);

    const encodeTime = performance.now() - startTotal - precompileTime;
    lastGsbBuffer = buffer;

    // Extract vertex/fragment and hasMacros info from precompiled
    lastPrecompiledVertex = "";
    lastPrecompiledFragment = "";
    let vertexHasMacros = false;
    let fragmentHasMacros = false;
    precompiled.subShaders.forEach((sub) => {
      sub.passes.forEach((pass) => {
        if (!pass.isUsePass && pass.vertexSource) {
          lastPrecompiledVertex = pass.vertexSource;
          lastPrecompiledFragment = pass.fragmentSource || "";
          vertexHasMacros = pass.vertexHasMacros || false;
          fragmentHasMacros = pass.fragmentHasMacros || false;
        }
      });
    });

    // Measure decode time
    const decodeStart = performance.now();
    const decoder = new TextDecoder();
    const decoded = JSON.parse(decoder.decode(new Uint8Array(buffer, 8)));
    const decodeTime = performance.now() - decodeStart;

    ui.statsPanel.textContent = [
      `[Precompile]`,
      `  Compile + serialize: ${precompileTime.toFixed(2)}ms`,
      `  .gsb size: ${buffer.byteLength} bytes (${(buffer.byteLength / 1024).toFixed(1)} KB)`,
      `  Decode time: ${decodeTime.toFixed(2)}ms`,
      `  JSON payload size: ${jsonStr.length} chars`,
      `  vertexHasMacros: ${vertexHasMacros}${!vertexHasMacros ? " (runtime _parseMacros will be SKIPPED)" : ""}`,
      `  fragmentHasMacros: ${fragmentHasMacros}${!fragmentHasMacros ? " (runtime _parseMacros will be SKIPPED)" : ""}`
    ].join("\n");

    // Show precompiled JSON (truncated)
    ui.precompiledView.style.display = "block";
    const preview = JSON.stringify(precompiled, null, 2);
    ui.precompiledView.textContent = preview.length > 3000 ? preview.substring(0, 3000) + "\n... (truncated)" : preview;

    ui.btnDownload.disabled = false;
    updateOutput();
  } catch (e) {
    ui.statsPanel.textContent = `[Error] ${e}`;
    ui.statsPanel.style.color = "#f44747";
    setTimeout(() => (ui.statsPanel.style.color = "#d4d4d4"), 3000);
  }
};

// Download .gsb
ui.btnDownload.onclick = () => {
  if (!lastGsbBuffer) return;
  const blob = new Blob([lastGsbBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shader.gsb";
  a.click();
  URL.revokeObjectURL(url);
};

// Macro expansion
Object.entries(ui.macroCheckboxes).forEach(([name, cb]) => {
  cb.onchange = () => {
    if (!lastLiveVertex) return;

    const macros: ShaderMacro[] = [];
    Object.entries(ui.macroCheckboxes).forEach(([n, c]) => {
      if (c.checked) macros.push(ShaderMacro.getByName(n));
    });

    // Detect if sources have macro branches
    const hasMacroRegex = /^\s*#\s*(?:if|ifdef|ifndef)\b/m;
    const vHasMacros = hasMacroRegex.test(lastLiveVertex);
    const fHasMacros = hasMacroRegex.test(lastLiveFragment);

    const startTime = performance.now();
    const expandedVertex = vHasMacros ? shaderLab._parseMacros(lastLiveVertex, macros) : lastLiveVertex;
    const expandedFragment = fHasMacros ? shaderLab._parseMacros(lastLiveFragment, macros) : lastLiveFragment;
    const expandTime = performance.now() - startTime;

    const skipInfo: string[] = [];
    if (!vHasMacros) skipInfo.push("Vertex: no macro branches, _parseMacros SKIPPED");
    if (!fHasMacros) skipInfo.push("Fragment: no macro branches, _parseMacros SKIPPED");

    ui.macroExpandedOutput.style.display = "block";
    ui.macroExpandedOutput.textContent = [
      `[MacroParser] Expanded in ${expandTime.toFixed(2)}ms`,
      ...skipInfo,
      `--- Vertex (${expandedVertex.length} chars) ---`,
      expandedVertex.substring(0, 1500),
      expandedVertex.length > 1500 ? "\n... (truncated)" : "",
      `\n--- Fragment (${expandedFragment.length} chars) ---`,
      expandedFragment.substring(0, 1500),
      expandedFragment.length > 1500 ? "\n... (truncated)" : ""
    ].join("\n");
  };
});

// Initialize engine for render preview
WebGLEngine.create({ canvas: ui.previewCanvas, shaderLab: new ShaderLab() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(0, 1.5, 3);
  cameraEntity.transform.lookAt(new Vector3(0));
  cameraEntity.addComponent(Camera);

  // Create a sphere to preview shader
  const sphereEntity = root.createChild("sphere");
  const renderer = sphereEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, 1, 32);

  // Try to compile the default shader for preview
  try {
    const shader = Shader.create(defaultShaderSource);
    const material = new Material(engine, shader);
    material.shaderData.setColor("material_BaseColor", new Color(0.5, 0.8, 1.0, 1.0));
    renderer.setMaterial(material);
  } catch (e) {
    console.warn("Preview shader compile failed:", e);
  }

  engine.run();

  let time = 0;
  const animate = () => {
    time += 0.01;
    sphereEntity.transform.setRotation(0, time * 30, 0);
    requestAnimationFrame(animate);
  };
  animate();
});
