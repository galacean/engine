import { describe, expect, it, vi } from "vitest";

const guiState = vi.hoisted(() => ({
  options: [] as string[],
  onChange: undefined as ((label: string) => void) | undefined
}));

vi.mock("dat.gui", () => ({
  GUI: class {
    add(_config: unknown, _property: string, options: string[]) {
      guiState.options = options;
      return new (class {
        name() {
          return this;
        }

        onChange(callback: (label: string) => void) {
          guiState.onChange = callback;
          return this;
        }
      })();
    }
  }
}));

interface MacroScenario {
  label: string;
  snippet: string;
  diagnosticCount: number;
  diagnostic?: string;
  severity?: "error" | "warning";
}

const MACRO_SCENARIOS: readonly MacroScenario[] = [
  { label: "宏定义 / 对象式 #define", snippet: "#define BRANCH_SCALE", diagnosticCount: 0 },
  { label: "宏定义 / 函数式 #define", snippet: "#define APPLY_SCALE", diagnosticCount: 0 },
  { label: "宏分支 / #ifdef / #else 互斥", snippet: "#ifdef USE_BRANCH_VALUE", diagnosticCount: 0 },
  {
    label: "宏分支 / #ifdef / #elif 完整互补",
    snippet: "#elif !defined(USE_BRANCH_VALUE)",
    diagnosticCount: 0
  },
  {
    label: "宏分支 / #ifdef / #elif 同条件不可达",
    snippet: "#elif defined(USE_BRANCH_VALUE)",
    diagnosticCount: 1,
    diagnostic: "UseBeforeDeclaration",
    severity: "error"
  },
  { label: "宏分支 / #ifndef / #else 互斥", snippet: "#ifndef DISABLE_BRANCH_VALUE", diagnosticCount: 0 },
  {
    label: "宏分支 / #ifndef / #elif 存在遗漏",
    snippet: "#elif A",
    diagnosticCount: 1,
    diagnostic: "UseBeforeDeclaration",
    severity: "error"
  },
  { label: "宏分支 / #ifndef / #elif 完整互补", snippet: "#elif defined(DISABLE_BRANCH_VALUE)", diagnosticCount: 0 },
  { label: "宏分支 / #if / #elif / #else 互斥", snippet: "#if MODE == 1", diagnosticCount: 0 },
  { label: "宏分支 / 嵌套互斥分支", snippet: "#ifdef OUTER", diagnosticCount: 0 },
  {
    label: "宏分支 / 独立宏的全局重定义",
    snippet: "#ifdef FIRST_SOURCE",
    diagnosticCount: 1,
    diagnostic: "Redefinition",
    severity: "error"
  },
  { label: "宏分支 / canonical include guard 重复", snippet: "#ifndef BRANCH_SAMPLE_INCLUDED", diagnosticCount: 0 },
  {
    label: "宏分支 / #undef 重新打开 guard",
    snippet: "#undef RESETTABLE_INCLUDED",
    diagnosticCount: 1,
    diagnostic: "Redefinition",
    severity: "error"
  },
  { label: "宏分支 / 局部声明由调用方宏约束", snippet: "#ifdef CALLER_A", diagnosticCount: 0 },
  {
    label: "宏分支 / 同一 arm 重复",
    snippet: "#ifdef BROKEN_ARM",
    diagnosticCount: 1,
    diagnostic: "Redefinition",
    severity: "error"
  },
  {
    label: "宏分支 / struct 成员分歧",
    snippet: "#ifdef HAS_VALUE",
    diagnosticCount: 1,
    diagnostic: "AmbiguousMacroBranchResolution",
    severity: "error"
  },
  {
    label: "符号 / AmbiguousMacroBranchType",
    snippet: "#ifdef USE_VEC3",
    diagnosticCount: 1,
    diagnostic: "AmbiguousMacroBranchType",
    severity: "error"
  },
  {
    label: "符号 / AmbiguousMacroBranchResolution",
    snippet: "#ifdef USE_CONST_SIZE",
    diagnosticCount: 1,
    diagnostic: "AmbiguousMacroBranchResolution",
    severity: "error"
  },
  {
    label: "宏分支 / 未定义宏按零参与比较",
    snippet: "#if !defined(MODE)",
    diagnosticCount: 1,
    diagnostic: "Redefinition",
    severity: "error"
  },
  { label: "宏分支 / 条件 #undef 未执行", snippet: "#undef CONDITIONAL_GUARD", diagnosticCount: 0 },
  { label: "宏分支 / 定义后的嵌套检查", snippet: "#define G", diagnosticCount: 0 },
  {
    label: "宏分支 / 声明未覆盖引用",
    snippet: "#ifdef B",
    diagnosticCount: 1,
    diagnostic: "UseBeforeDeclaration",
    severity: "error"
  },
  { label: "宏分支 / #if 0 死分支", snippet: "#if 0", diagnosticCount: 0 },
  { label: "宏分支 / #elif 继承前置否定", snippet: "#elif B", diagnosticCount: 0 }
] as const;

describe("shader playground", () => {
  it("renders every macro branch preset after a dropdown change", async () => {
    await import("../../../examples/src/shader-playground");

    const editor = document.querySelector<HTMLTextAreaElement>("#ed");
    const output = document.querySelector<HTMLDivElement>("#out");
    expect(editor).not.toBeNull();
    expect(output).not.toBeNull();

    expect(guiState.onChange).toBeTypeOf("function");
    for (const scenario of MACRO_SCENARIOS) {
      expect(guiState.options).to.include(scenario.label);
      guiState.onChange!(scenario.label);

      expect(editor!.value).to.contain(scenario.snippet);
      expect(output!.textContent).to.contain(`Diagnostics (${scenario.diagnosticCount})`);

      if (scenario.diagnostic) {
        expect(output!.textContent).to.contain(scenario.diagnostic);
        expect(output!.querySelector(`.diag.${scenario.severity}`)).not.toBeNull();
      } else {
        expect(output!.textContent).to.contain("No diagnostics");
      }
      expect(output!.textContent).not.to.contain("NonConstArraySize");
    }
  });
});
