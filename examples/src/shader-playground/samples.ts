import {
  DiagnosticType,
  DiagnosticCategory,
  DIAGNOSTIC_CATEGORY,
  type AnalyzerOptions
} from "@galacean/engine-shader-analyzer";

/** Editable shader source with its independently specified diagnostic expectation. */
export interface PlaygroundSample {
  source: string;
  options?: AnalyzerOptions;
  expectedCodes: readonly DiagnosticType[];
  note: string;
}

function pass(body: string): string {
  return `Shader "playground" {\n  SubShader "Default" {\n    Pass "p" {\n${body}\n    }\n  }\n}`;
}

function fragmentPass(body: string): string {
  return pass(`      void vert() { gl_Position = vec4(0.0); }\n${body}\n      VertexShader = vert;`);
}

function renderStatePass(body: string): string {
  return pass(
    `${body}\n      void vert() { gl_Position = vec4(0.0); }\n      void frag() { gl_FragColor = vec4(1.0); }\n      VertexShader = vert; FragmentShader = frag;`
  );
}

const MULTIPLE_ERRORS_LABEL = "Multiple errors";
const RELATIVE_INCLUDE_LABEL = "Include / 项目相对 sourceFile";
const ABSOLUTE_INCLUDE_LABEL = "Include / 绝对 sourceFile URL";
const SCENARIO_LABELS = [RELATIVE_INCLUDE_LABEL, ABSOLUTE_INCLUDE_LABEL] as const;

const MACRO_SAMPLES = {
  "宏定义 / 对象式 #define": pass(`      #define BRANCH_SCALE 0.5
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(BRANCH_SCALE); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏定义 / 函数式 #define": pass(`      #define APPLY_SCALE(value) ((value) * 0.5)
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(APPLY_SCALE(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifdef / #else 互斥": pass(`      #ifdef USE_BRANCH_VALUE
        float u_branchValue;
      #else
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifdef / #elif 完整互补": pass(`      #ifdef USE_BRANCH_VALUE
        float u_branchValue;
      #elif !defined(USE_BRANCH_VALUE)
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifdef / #elif !宏值 互补": pass(`      #ifdef USE_BRANCH_VALUE
        float u_branchValue;
      #elif !USE_BRANCH_VALUE
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifdef / #elif 同条件不可达": pass(`      #ifdef USE_BRANCH_VALUE
        float u_branchValue;
      #elif defined(USE_BRANCH_VALUE)
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 非法 #elif 表达式": pass(`      #ifdef USE_BRANCH_VALUE
        float u_branchValue;
      #elif 123 defined(USE_BRANCH_VALUE)
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifndef / #else 互斥": pass(`      #ifndef DISABLE_BRANCH_VALUE
        float u_branchValue;
      #else
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifndef / #elif 存在遗漏": pass(`      #ifndef DISABLE_BRANCH_VALUE
        float u_branchValue;
      #elif A
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #ifndef / #elif 完整互补": pass(`      #ifndef DISABLE_BRANCH_VALUE
        float u_branchValue;
      #elif defined(DISABLE_BRANCH_VALUE)
        float u_branchValue;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_branchValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #if / #elif / #else 互斥": pass(`      #if MODE == 1
        float u_mode;
      #elif MODE == 2
        float u_mode;
      #else
        float u_mode;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_mode); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 复杂算术条件完整覆盖": pass(`      #if A + B > 1
        float u_complex;
      #else
        float u_complex;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_complex); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 复杂算术条件覆盖未知": pass(`      #if A + B > 1
        float u_complex;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_complex); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 复杂算术条件互斥声明": pass(`      #if A + B > 1
        float u_complex;
      #endif
      #if A + B <= 1
        float u_complex;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 嵌套互斥分支": pass(`      #ifdef OUTER
        #ifdef INNER
          float u_nested;
        #else
          float u_nested;
        #endif
      #else
        float u_nested;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_nested); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 独立宏的全局重定义": pass(`      #ifdef FIRST_SOURCE
        float u_conflict;
      #endif
      #ifdef SECOND_SOURCE
        float u_conflict;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_conflict); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / canonical include guard 重复": pass(`      #ifndef BRANCH_SAMPLE_INCLUDED
        #define BRANCH_SAMPLE_INCLUDED
        float u_guarded;
      #endif
      #ifndef BRANCH_SAMPLE_INCLUDED
        #define BRANCH_SAMPLE_INCLUDED
        float u_guarded;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_guarded); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #undef 重新打开 guard": pass(`      #ifndef RESETTABLE_INCLUDED
        #define RESETTABLE_INCLUDED
        float u_resettable;
      #endif
      #undef RESETTABLE_INCLUDED
      #ifndef RESETTABLE_INCLUDED
        #define RESETTABLE_INCLUDED
        float u_resettable;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_resettable); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 独立局部宏可能并存": pass(`      void vert() { gl_Position = vec4(0.0); }
      void frag() {
        #ifdef CALLER_A
          float localValue = 0.0;
        #endif
        #ifdef CALLER_B
          float localValue = 1.0;
        #endif
        gl_FragColor = vec4(0.0);
      }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 同一 arm 重复": pass(`      #ifdef BROKEN_ARM
        float u_duplicate;
        float u_duplicate;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / struct 成员分歧": pass(`      #ifdef HAS_VALUE
        struct BranchData { float value; };
      #else
        struct BranchData { float other; };
      #endif
      BranchData data;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(data.value); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 未定义宏按零参与比较": pass(`      #if !defined(MODE)
        float u_value;
      #endif
      #if MODE == 0
        float u_value;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 条件 #undef 未执行": pass(`      #ifndef CONDITIONAL_GUARD
        #define CONDITIONAL_GUARD
        float u_value;
      #endif
      #if !defined(CONDITIONAL_GUARD)
        #undef CONDITIONAL_GUARD
      #endif
      #ifndef CONDITIONAL_GUARD
        #define CONDITIONAL_GUARD
        float u_value;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_value); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 定义后的嵌套检查": pass(`      #ifndef G
        #define G
        #ifdef G
          float u_value;
        #endif
        void frag() { gl_FragColor = vec4(u_value); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / 声明未覆盖引用": pass(`      #ifdef A
        #ifdef B
          float u_value;
        #endif
        void frag() { gl_FragColor = vec4(u_value); }
      #endif
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #if 0 死分支": pass(`      #if 0
        float u_value;
      #endif
      #if 0
        float u_value;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  "宏分支 / #elif 继承前置否定": pass(`      #if A
        float u_first;
      #elif B
        float u_value;
      #endif
      #if A
        float u_value;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
} as const;

const DIAGNOSTIC_SAMPLES = {
  [DiagnosticType.SyntaxError]: fragmentPass(`      void frag() { vec3 = ; }
      FragmentShader = frag;`),

  [DiagnosticType.NoMatchingOverload]: fragmentPass(`      float f(float a) { return a; }
      void frag() { gl_FragColor = vec4(f(vec3(0.0))); }
      FragmentShader = frag;`),

  [DiagnosticType.RecursiveFunction]: pass(`      struct Attributes { vec3 POSITION; };
      float fib(float x) { return fib(x); }                 // direct recursion
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(fib(1.0)); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.Redefinition]: pass(`      float u_a;
      float u_a;                                          // Redefinition (variable, same scope)
      float f(float x) { return x; }
      float f(float x) { return x * 2.0; }                // Redefinition (function, same signature)
      float f(vec2 x) { return x.x; }                     // OK — overload (different signature)
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_a + f(1.0) + f(vec2(0.0))); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.AmbiguousMacroBranchResolution]: pass(`      void frag() {
        #ifdef USE_CONST_SIZE
          const int N = 2;
        #else
          int N = 2;
        #endif
        float values[N];                                  // branch-dependent const qualification
        gl_FragColor = vec4(values[0]);
      }
      void vert() { gl_Position = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.AssignTypeMismatch]: pass(`      struct A { vec3 v; };
      struct B { vec3 v; };
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = 1.0;
        vec3 b = vec3(0.0);
        a = b;                                            // vec3 -> float
        A x; B y;
        x = y;                                            // struct A -> struct B
        gl_FragColor = vec4(a, a, a, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.ConstDivideByZero]: fragmentPass(`      void frag() { int x = 1 / 0; gl_FragColor = vec4(float(x)); }
      FragmentShader = frag;`),

  [DiagnosticType.ConstructorArgCount]: fragmentPass(`      void frag() {
        vec3 v = vec3(1.0, 2.0);                          // too few (need 3, got 2)
        vec4 w = vec4(1.0, 2.0, 3.0, 4.0, 5.0);           // too many (need 4, got 5)
        mat3 m = mat3(1.0, 2.0, 3.0, 4.0, 5.0);           // matrix too few (need 9, got 5)
        gl_FragColor = vec4(v, 1.0) + w + vec4(m[0], 1.0);
      }
      FragmentShader = frag;`),

  [DiagnosticType.ConstructorArgType]: fragmentPass(`      mediump sampler2D u_tex;
      void frag() { vec2 v = vec2(u_tex, 1.0); gl_FragColor = vec4(v, 0.0, 1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.ExpectedSampler]: fragmentPass(
    `      void frag() { vec2 uv = vec2(0.0); vec4 c = texture(uv, uv); gl_FragColor = c; }
      FragmentShader = frag;`
  ),

  [DiagnosticType.IndexOutOfBounds]: fragmentPass(
    `      void frag() { vec3 v = vec3(0.0); float y = v[5]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.InvalidBinaryOperands]: fragmentPass(
    `      void frag() { bool b = true; float x = b + 1.0; gl_FragColor = vec4(x); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.InvalidSwizzle]: pass(`      vec2 u_uv;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_uv.z, 0.0, 0.0, 1.0); }   // vec2 has no .z
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidUnaryOperand]: fragmentPass(
    `      void frag() { float u_f = 1.0; bool ok = !u_f; gl_FragColor = vec4(0.0); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonIndexableType]: fragmentPass(
    `      void frag() { float f = 1.0; float y = f[0]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonIntegerIndex]: fragmentPass(
    `      void frag() { vec3 v = vec3(0.0); float y = v[1.5]; gl_FragColor = vec4(y); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.ShiftOutOfRange]: fragmentPass(`      void frag() { int x = 1 << 40; gl_FragColor = vec4(float(x)); }
      FragmentShader = frag;`),

  [DiagnosticType.UndeclaredStructMember]: pass(`      struct Varyings { vec4 v; };
      Varyings vert() { Varyings o; gl_Position = vec4(0.0); o.v = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.notAField; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NonConstArraySize]: fragmentPass(
    `      void frag() { int n = 3; float a[n]; gl_FragColor = vec4(a[0]); }
      FragmentShader = frag;`
  ),

  [DiagnosticType.NonConstInitializer]: fragmentPass(`      float u_scale;
      void frag() {
        const float ok1 = 1.0 + 2.0;                        // OK — literal fold
        const float ok2 = sin(0.5);                         // OK — builtin on const
        const float bad = u_scale + sin(0.5);               // NonConstInitializer (uniform mixed in)
        gl_FragColor = vec4(ok1 + ok2 + bad);
      }
      FragmentShader = frag;`),

  [DiagnosticType.NonConstructibleReturnType]: pass(`      mediump sampler2D u_tex;
      sampler2D getTex() { return u_tex; }                  // sampler return — illegal
      struct Material { mediump sampler2D tex; };
      Material u_m;
      Material getMat() { return u_m; }                     // struct containing sampler — illegal
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = texture2D(getMat().tex, vec2(0.0)); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidEntryReturnType]: pass(`      struct Attributes { vec3 POSITION; };
      float vert(Attributes attr) { gl_Position = vec4(0.0); return 1.0; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidReturnType]: pass(`      struct Attributes { vec3 POSITION; };
      vec3 getColor() { return 1.0; }                     // float vs vec3
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getColor(), 1.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.MisplacedControlFlow]: fragmentPass(`      void frag() { gl_FragColor = vec4(0.0); break; }
      FragmentShader = frag;`),

  [DiagnosticType.MissingReturn]: fragmentPass(`      float getX() { float a = 1.0; }
      void frag() { gl_FragColor = vec4(getX()); }
      FragmentShader = frag;`),

  [DiagnosticType.NonBoolCondition]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a = 1.0; if (a) { gl_FragColor = vec4(0.0); } }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.DuplicateEntryAssignment]: pass(`      float u_a;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void vert2(Attributes attr) { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(u_a); }
      VertexShader = vert;
      VertexShader = vert2;                               // DuplicateEntryAssignment (first wins)
      FragmentShader = frag;`),

  [DiagnosticType.EntryNotFound]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vrt;                                 // 'vrt' is not a function
      FragmentShader = frag;`),

  [DiagnosticType.AmbiguousEntryPoint]: pass(`      void vert(float value) { gl_Position = vec4(value); }
      void vert(vec2 value) { gl_Position = vec4(value, 0.0, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;                                // two overloads coexist
      FragmentShader = frag;`),

  [DiagnosticType.GlFragColorWithMrt]: pass(`      struct MRT { layout(location = 0) vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidMrtOutput]: pass(`      struct MRT { vec4 colorWithoutLocation; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT outputValue; return outputValue; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.InvalidIOStruct]: pass(`      struct Attributes { vec3 POSITION; };
      Varyings vert(Attributes attr) { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.MissingEntry]: pass(`      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;`),

  [DiagnosticType.MissingVertexPosition]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NestedIOStruct]: pass(`      struct Attributes { vec3 POSITION; };
      struct Inner { vec4 v; };
      struct Varyings { Inner nested; };
      Varyings vert(Attributes attr) { Varyings o; gl_Position = vec4(0.0); o.nested.v = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.nested.v; }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.NonFlatIntegerVarying]: pass(`      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 pos; int id; };
      Varyings vert(Attributes attr) { Varyings o; o.pos = vec4(attr.POSITION, 1.0); o.id = 0; gl_Position = o.pos; return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.id)); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.StructRoleConflict]: pass(`      struct IO { vec4 v; };
      IO vert(IO attr) { IO o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.BitwiseOrOnNonBitmask]: renderStatePass(
    `      BlendState bs { SourceColorBlendFactor = BlendFactor.One | BlendFactor.Zero; }`
  ),

  [DiagnosticType.InvalidEnumValue]: renderStatePass(
    `      BlendState bs { SourceColorBlendFactor = BlendFactor.NotReal; }`
  ),

  [DiagnosticType.InvalidRenderQueueVariable]: renderStatePass(`      RenderQueueType = undefinedQueueVar;`),

  [DiagnosticType.InvalidRenderStateProperty]: renderStatePass(`      BlendState bs { NotARealProperty = true; }`),

  [DiagnosticType.InvalidRenderStateVariable]: renderStatePass(`      DepthState = undefinedDepthVar;`),

  [DiagnosticType.MixedEnumTypes]: renderStatePass(
    `      BlendState bs { ColorWriteMask = ColorWriteMask.Red | CullMode.Front; }`
  ),

  [DiagnosticType.DerivativeInVertexShader]: pass(`      struct Attributes { vec3 POSITION; };
      float helper(float x) { return dFdx(x); }           // called from vert transitively — illegal
      void vert(Attributes attr) {
        float d = dFdx(attr.POSITION.x);                  // direct dFdx in vertex — illegal
        gl_Position = vec4(attr.POSITION, d + helper(attr.POSITION.y));
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`),

  [DiagnosticType.NonFloatDerivativeArg]: fragmentPass(`      void frag() {
        int x = 3;
        float d = dFdx(x);
        gl_FragColor = vec4(d);
      }
      FragmentShader = frag;`),

  [DiagnosticType.InvalidArraySize]: pass(`      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a[0]; float b[4]; gl_FragColor = vec4(a[0] + b[0]); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [DiagnosticType.EmptyStruct]: pass(`      struct Empty {
        #ifdef EMPTY_MEMBER
        #endif
      };
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`),

  [DiagnosticType.PreprocessorError]: fragmentPass(`      #if 123 defined(MODE)
      #endif
      void frag() { gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.UseBeforeDeclaration]: fragmentPass(`      #ifdef HAS_VALUE
      float value;
      #endif
      void frag() { gl_FragColor = vec4(value); }
      FragmentShader = frag;`),

  [DiagnosticType.LocalFunctionPrototype]: fragmentPass(`      void frag() { int g(); gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.InvalidAssignmentTarget]: fragmentPass(`      void frag() { 1 = 2; gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.InvalidVoidVariable]: fragmentPass(`      void frag() { void value; gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.LegacyFragmentOutputConflict]:
    fragmentPass(`      void frag() { gl_FragColor = vec4(1.0); gl_FragData[0] = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.BareGlFragData]: fragmentPass(`      void frag() { gl_FragData = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.NonConstFragmentOutputIndex]:
    fragmentPass(`      void frag() { int target = 0; gl_FragData[target] = vec4(1.0); }
      FragmentShader = frag;`),

  [DiagnosticType.InvalidBuiltinStage]: `Shader "playground" {
SubShader "Default" { Pass "p" {
void vert() { gl_Position = gl_FragCoord; }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`
} satisfies Record<DiagnosticType, string>;

const SCENARIO_SAMPLES = {
  [MULTIPLE_ERRORS_LABEL]: pass(`      mat4 renderer_MVPMat;
      vec2 u_uv;
      float u_a;
      float u_a;                                          // Redefinition
      struct Attributes { vec3 POSITION; };
      vec3 getColor() { return 1.0; }                     // InvalidReturnType
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        float a = u_uv.z;                                 // InvalidSwizzle
        gl_FragColor = vec4(a, 0.0, 0.0, 1.0);
      }
      VertexShader = vert;
      FragmentShader = frag;`),

  [RELATIVE_INCLUDE_LABEL]: pass(`      #include "./Broken.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(includedValue); }
      VertexShader = vert;
      FragmentShader = frag;`),

  [ABSOLUTE_INCLUDE_LABEL]: pass(`      #include "./Broken.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(includedValue); }
      VertexShader = vert;
      FragmentShader = frag;`)
} as const;

const SAMPLE_OPTIONS: Partial<Record<string, AnalyzerOptions>> = {
  [RELATIVE_INCLUDE_LABEL]: {
    sourceFile: "Assets/Shaders/Playground.shader",
    includeMap: {
      "Assets/Shaders/Broken.glsl": "float includedValue;\nfloat includedValue;"
    }
  },
  [ABSOLUTE_INCLUDE_LABEL]: {
    sourceFile: "file:///project/Assets/Shaders/Playground.shader",
    includeMap: {
      "file:///project/Assets/Shaders/Broken.glsl": "float includedValue;\nfloat includedValue;"
    }
  }
};

const CATEGORY_LABEL: Record<DiagnosticCategory, string> = {
  [DiagnosticCategory.Syntax]: "语法",
  [DiagnosticCategory.Symbol]: "符号",
  [DiagnosticCategory.Type]: "类型",
  [DiagnosticCategory.Constant]: "常量",
  [DiagnosticCategory.ControlFlow]: "控制流",
  [DiagnosticCategory.PipelineIO]: "管线 IO",
  [DiagnosticCategory.RenderState]: "RenderState"
};

const CATEGORY_ORDER = Object.values(DiagnosticCategory);
const CLASSIC_P1_SAMPLES: Record<string, PlaygroundSample> = {
  "经典回归 / 正例：Varyings 字段与局部变量同名": {
    source: pass(`      struct Varyings { float a; };
      Varyings vert() { Varyings v; float a = 1.0; v.a = 2.0; v.a = a; gl_Position = vec4(0.0); return v; }
      void frag(Varyings v) { gl_FragColor = vec4(v.a); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "局部变量 a 与字段 v.a 可以共存；无诊断不代表已验证变量改名后的 codegen 或 GPU 输出。"
  },
  "经典回归 / 正例：宏展开后可写的左值": {
    source: fragmentPass(`      #define WRITE value.x
      void frag() { vec2 value = vec2(0.0); WRITE = 1.0; gl_FragColor = vec4(value, 0.0, 1.0); }
      FragmentShader = frag;`),
    expectedCodes: [],
    note: "WRITE 展开为合法分量左值；不能仅因左侧是宏而报 InvalidAssignmentTarget。"
  },
  "经典回归 / 反例：重复分量不可写": {
    source: fragmentPass(`      void frag() { vec2 v = vec2(0.0); v.xx = vec2(1.0); gl_FragColor = vec4(v, 0.0, 1.0); }
      FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.InvalidAssignmentTarget],
    note: "v.xx 含重复分量，不能作为写入目标；这是分析器可以确定的左值错误。"
  },
  "经典回归 / 反例：读取 gl_Position 不等于写入": {
    source: pass(`      void vert() { vec4 value = gl_Position; }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.MissingVertexPosition],
    note: "读取顶点位置不能满足顶点阶段必须写入位置的要求。"
  },
  "经典回归 / 正例：helper 写入 gl_Position": {
    source: pass(`      void writePosition() { gl_Position = vec4(float(gl_VertexID)); }
      void vert() { writePosition(); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "顶点阶段可读取 gl_VertexID，并由可达 helper 写入位置；无诊断不等于已验证实际绘制。"
  },
  "经典回归 / 反例：继承覆盖存在缺口": {
    source: `Shader "playground" {
#ifdef A
vec4 color() { return vec4(0.25); }
#endif
SubShader "Default" { Pass "p" {
#if defined(A) && defined(B)
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [DiagnosticType.Redefinition],
    note: "Shader 的 A 条件不能被 Pass 的 A && B 完整覆盖，保留既有 authoring 拒绝契约。"
  },
  "经典回归 / 正例：if else 联合覆盖祖先": {
    source: `Shader "playground" {
vec4 color() { return vec4(0.25); }
SubShader "Default" { Pass "p" {
#ifdef A
vec4 color() { return vec4(0.5); }
#else
vec4 color() { return vec4(0.75); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [],
    note: "Pass 的完整 if/else 联合覆盖祖先声明；是否只生成最终实现仍需 codegen 与驱动验证。"
  },
  "经典回归 / 正例：12 宏位掩码等价覆盖": {
    source: `Shader "playground" {
#if ((defined(F0) << 0) + (defined(F1) << 1) + (defined(F2) << 2) + (defined(F3) << 3) + (defined(F4) << 4) + (defined(F5) << 5) + (defined(F6) << 6) + (defined(F7) << 7) + (defined(F8) << 8) + (defined(F9) << 9) + (defined(F10) << 10) + (defined(F11) << 11)) != 0
vec4 color() { return vec4(0.25); }
#endif
SubShader "Default" { Pass "p" {
#if defined(F0) || defined(F1) || defined(F2) || defined(F3) || defined(F4) || defined(F5) || defined(F6) || defined(F7) || defined(F8) || defined(F9) || defined(F10) || defined(F11)
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() {
#if defined(F0) || defined(F1) || defined(F2) || defined(F3) || defined(F4) || defined(F5) || defined(F6) || defined(F7) || defined(F8) || defined(F9) || defined(F10) || defined(F11)
gl_FragColor = color();
#else
gl_FragColor = vec4(0.75);
#endif
 }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [],
    note: "位掩码非零与任意宏已定义等价。静态证明预算不足时也不能据此制造诊断；最终声明选择属于 codegen/runtime 契约。"
  },
  "经典回归 / 正例：旧 helper 捕获已声明 struct": {
    source: `Shader "playground" {
struct Payload { vec4 value; };
Payload copy(Payload value) { return value; }
SubShader "Default" { Pass "p" {
struct Payload { vec4 value; };
vec4 color() { Payload value; value.value = vec4(0.5); return copy(value).value; }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [],
    note: "后续覆盖 struct 不会抹去旧 helper 引用时类型已声明的事实；输出排序仍需后端验证。"
  },
  "经典回归 / 反例：struct 在引用之后才声明": {
    source: fragmentPass(`      Payload copy(Payload value) { return value; }
      struct Payload { vec4 value; };
      void frag() { gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.UseBeforeDeclaration],
    note: "没有此前可见声明的类型引用仍是 UseBeforeDeclaration，不能被后面的同名类型掩盖。"
  },
  "经典回归 / 反例：活动预处理条件除零": {
    source: fragmentPass(`      #if 1 / 0
      float impossible;
      #endif
      void frag() { gl_FragColor = vec4(1.0); }
      FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.PreprocessorError],
    note: "确定执行的 #if 1 / 0 是预处理求值错误；不能作为真假未知而静默忽略。"
  },
  "经典回归 / 正例：vec4 片元入口提前返回": {
    source: pass(`      void vert() { gl_Position = vec4(0.0); }
      vec4 frag() { if (gl_FragCoord.x < 0.0) return vec4(0.25); return vec4(0.5); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "vec4 片元入口及提前返回受当前中性 IR 支持；无诊断不等于已验证降低后的控制流或像素。"
  },
  "经典回归 / 反例：顶点阶段 discard": {
    source: `Shader "playground" {
SubShader "Default" { Pass "p" {
void vert() { gl_Position = vec4(0.0); discard; }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [DiagnosticType.MisplacedControlFlow],
    note: "discard 只能在片元阶段执行；顶点入口直接调用时必须诊断。"
  },
  "经典回归 / 正例：片元阶段 discard": {
    source: `Shader "playground" {
SubShader "Default" { Pass "p" {
void vert() { gl_Position = vec4(0.0); }
void frag() { if (gl_FragCoord.x < 0.0) discard; gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [],
    note: "片元阶段允许读取 gl_FragCoord 和执行 discard；此处只验证静态诊断。"
  },
  "经典回归 / 反例：片元阶段读取 gl_VertexID": {
    source: `Shader "playground" {
SubShader "Default" { Pass "p" {
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(float(gl_VertexID)); }
VertexShader = vert; FragmentShader = frag;
} } }`,
    expectedCodes: [DiagnosticType.InvalidBuiltinStage],
    note: "gl_VertexID 属于顶点阶段；在片元入口读取必须报告阶段不匹配。"
  },
  "宏展开阶段 / 正例：IGNORE 丢弃内建变量实参": {
    source: pass(`      #define IGNORE(x) 1.0
      void vert() { gl_Position = vec4(IGNORE(gl_FragCoord)); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "IGNORE 展开为 1.0，gl_FragCoord 实参没有进入最终表达式；不能按未展开的实参误报阶段错误。"
  },
  "宏展开阶段 / 正例：IGNORE 丢弃导数实参": {
    source: pass(`      #define IGNORE(x) 1.0
      void vert() { gl_Position = vec4(IGNORE(dFdx(1.0))); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "IGNORE 没有使用实参，展开结果中不存在 dFdx 调用；不能按原始实参误报顶点导数错误。"
  },
  "宏展开阶段 / 正例：未知外部宏保留实参语义未知": {
    source: pass(`      void vert() {
        vec4 value = EXTERNAL_COORD(gl_FragCoord);
        gl_Position = value + vec4(EXTERNAL_DERIVATIVE(dFdx(1.0)));
      }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "runtime 可提供 EXTERNAL_COORD(x)=vec4(0.0) 与 EXTERNAL_DERIVATIVE(x)=1.0 并丢弃实参。静态分析应保留未知；无诊断不表示缺失宏的源文本能直接通过驱动编译。"
  },
  "宏展开阶段 / 反例：ID 保留片元内建变量": {
    source: pass(`      #define ID(x) x
      void vert() { gl_Position = vec4(ID(gl_FragCoord)); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.InvalidBuiltinStage],
    note: "ID 展开后仍读取 gl_FragCoord，顶点阶段必须报告错误；宏调用与实参不应重复报告同一个问题。"
  },
  "宏展开阶段 / 反例：ADD 保留片元内建变量": {
    source: pass(`      #define ADD(x) (x + 1.0)
      void vert() { gl_Position = vec4(ADD(gl_FragCoord)); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.InvalidBuiltinStage],
    note: "ADD 的算术替换仍保留 gl_FragCoord 引用；即使宏不是简单别名，也应检查展开后的阶段限制。"
  },
  "宏展开阶段 / 反例：顶点 KILL 展开为 discard": {
    source: pass(`      #define KILL discard
      void vert() { KILL; gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.MisplacedControlFlow],
    note: "KILL 在顶点入口展开为 discard，应在宏调用位置报告阶段控制流错误。"
  },
  "宏展开阶段 / 正例：片元 KILL 展开为 discard": {
    source: pass(`      #define KILL discard
      void vert() { gl_Position = vec4(0.0); }
      void frag() { KILL; }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [],
    note: "相同 KILL 宏在片元入口展开为合法 discard；定义宏本身不会触发顶点阶段诊断。"
  },
  "宏展开阶段 / 反例：顶点 DX 展开为导数调用": {
    source: pass(`      #define DX(x) dFdx(x)
      void vert() { gl_Position = vec4(DX(1.0)); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert; FragmentShader = frag;`),
    expectedCodes: [DiagnosticType.DerivativeInVertexShader],
    note: "DX 展开后的 dFdx 属于片元阶段；继续使用既有 DerivativeInVertexShader 诊断，不另报内建变量阶段错误。"
  }
};

const DIAGNOSTIC_NOTES = {
  SyntaxError: "无效声明语法，错误标记指向无法继续解析的 token。",
  PreprocessorError: "非法 #if 表达式，应标出 defined token；不把求值错误当成条件未知。",
  NoMatchingOverload: "实参类型与所有已声明重载不匹配。",
  Redefinition: "同一作用域中的同名变量和同签名函数重定义；合法不同参数重载保留。",
  UseBeforeDeclaration: "宏分支未覆盖引用位置，标出可能没有声明的 value。",
  LocalFunctionPrototype: "函数体内的原型声明非法；不能因此误报已存在的顶点入口。",
  AmbiguousMacroBranchResolution: "不同宏分支对同一符号的 const 限定存在分歧。",
  InvalidSwizzle: "分量超出向量维数，标记非法分量。",
  UndeclaredStructMember: "结构体中不存在该成员；顶点位置已正确写入。",
  AssignTypeMismatch: "赋值两侧标量、向量或结构体类型不兼容。",
  InvalidAssignmentTarget: "字面量不能作为可写的赋值目标。",
  ConstDivideByZero: "常量整数除以零是确定错误。",
  ShiftOutOfRange: "移位位数超出32位整数允许范围。",
  IndexOutOfBounds: "常量下标超出已知向量或数组大小。",
  NonIntegerIndex: "下标必须为整数。",
  NonIndexableType: "标量不能像数组或向量一样索引。",
  ExpectedSampler: "纹理函数的首个参数必须是采样器。",
  InvalidUnaryOperand: "逻辑非不能用于浮点操作数。",
  InvalidBinaryOperands: "二元运算不支持这里的布尔与浮点组合。",
  ConstructorArgType: "采样器不能作为数值向量构造参数。",
  ConstructorArgCount: "向量与矩阵构造参数数量错误；同类诊断可出现多次。",
  NonConstInitializer: "const 初始化表达式不能依赖 uniform。",
  NonConstArraySize: "数组大小必须是常量整数表达式。",
  EmptyStruct: "没有有效字段的结构体非法。",
  InvalidArraySize: "零长度数组非法，随后访问 a[0] 还会触发越界诊断。",
  InvalidVoidVariable: "变量不能声明为 void 类型。",
  NonFloatDerivativeArg: "导数函数要求浮点参数；整数调用同时没有匹配的重载。",
  InvalidReturnType: "函数返回值与声明的返回类型不符。",
  MissingReturn: "非 void 函数缺少返回值。",
  NonBoolCondition: "if 条件必须是布尔表达式。",
  RecursiveFunction: "GLSL 不允许递归函数调用。",
  NonConstructibleReturnType: "采样器或含采样器的结构体不能作为函数返回类型。",
  MisplacedControlFlow: "break 没有位于循环体内。",
  DerivativeInVertexShader: "顶点阶段直接或通过 helper 调用导数函数都非法。",
  InvalidIOStruct: "入口引用的 IO 类型没有有效定义。",
  InvalidEntryReturnType: "顶点入口不能返回普通 float。",
  StructRoleConflict: "同一结构体不能同时承担不兼容的 IO 角色。",
  DuplicateEntryAssignment: "同一 Pass 重复绑定 VertexShader，保留第一项并报告错误。",
  MissingEntry: "Pass 缺少 FragmentShader 绑定；范围可表示缺失项的插入位置。",
  EntryNotFound: "绑定名称对应的入口函数不存在。",
  AmbiguousEntryPoint: "同一个入口名存在多个同时可用的重载。",
  GlFragColorWithMrt: "MRT 片元入口不能同时写 gl_FragColor。",
  LegacyFragmentOutputConflict: "同一片元配置不能混用 gl_FragColor 与 gl_FragData。",
  InvalidMrtOutput: "MRT 字段必须有合法输出 location。",
  BareGlFragData: "gl_FragData 必须带下标；直接赋值还会报告数组与 vec4 类型不匹配。",
  NonConstFragmentOutputIndex: "片元输出位置必须为常量整数。",
  NestedIOStruct: "阶段 IO 结构体不支持嵌套结构体字段。",
  MissingVertexPosition: "顶点入口及其可达 helper 都没有写入 gl_Position。",
  NonFlatIntegerVarying: "整数 varying 必须使用 flat 插值限定。",
  InvalidBuiltinStage: "gl_FragCoord 属于片元阶段，不能在顶点入口读取。",
  InvalidRenderStateProperty: "渲染状态中不存在该属性。",
  InvalidEnumValue: "枚举成员名称不存在。",
  BitwiseOrOnNonBitmask: "非位掩码枚举不支持按位组合。",
  MixedEnumTypes: "不能混用不同枚举类型。",
  InvalidRenderStateVariable: "绑定的渲染状态变量没有声明。",
  InvalidRenderQueueVariable: "绑定的渲染队列变量没有声明。"
} satisfies Record<DiagnosticType, string>;

const DIAGNOSTIC_EXPECTATIONS: Partial<Record<DiagnosticType, readonly DiagnosticType[]>> = {
  [DiagnosticType.NonFloatDerivativeArg]: [DiagnosticType.NoMatchingOverload, DiagnosticType.NonFloatDerivativeArg],
  [DiagnosticType.InvalidArraySize]: [DiagnosticType.InvalidArraySize, DiagnosticType.IndexOutOfBounds],
  [DiagnosticType.BareGlFragData]: [DiagnosticType.AssignTypeMismatch, DiagnosticType.BareGlFragData]
};

const MACRO_EXPECTATIONS: Record<keyof typeof MACRO_SAMPLES, readonly DiagnosticType[]> = {
  "宏定义 / 对象式 #define": [],
  "宏定义 / 函数式 #define": [],
  "宏分支 / #ifdef / #else 互斥": [],
  "宏分支 / #ifdef / #elif 完整互补": [],
  "宏分支 / #ifdef / #elif !宏值 互补": [],
  "宏分支 / #ifdef / #elif 同条件不可达": [DiagnosticType.UseBeforeDeclaration],
  "宏分支 / 非法 #elif 表达式": [DiagnosticType.PreprocessorError],
  "宏分支 / #ifndef / #else 互斥": [],
  "宏分支 / #ifndef / #elif 存在遗漏": [DiagnosticType.UseBeforeDeclaration],
  "宏分支 / #ifndef / #elif 完整互补": [],
  "宏分支 / #if / #elif / #else 互斥": [],
  "宏分支 / 复杂算术条件完整覆盖": [],
  "宏分支 / 复杂算术条件覆盖未知": [],
  "宏分支 / 复杂算术条件互斥声明": [],
  "宏分支 / 嵌套互斥分支": [],
  "宏分支 / 独立宏的全局重定义": [DiagnosticType.Redefinition],
  "宏分支 / canonical include guard 重复": [],
  "宏分支 / #undef 重新打开 guard": [DiagnosticType.Redefinition],
  "宏分支 / 独立局部宏可能并存": [DiagnosticType.Redefinition],
  "宏分支 / 同一 arm 重复": [DiagnosticType.Redefinition],
  "宏分支 / struct 成员分歧": [DiagnosticType.AmbiguousMacroBranchResolution],
  "宏分支 / 未定义宏按零参与比较": [DiagnosticType.Redefinition],
  "宏分支 / 条件 #undef 未执行": [],
  "宏分支 / 定义后的嵌套检查": [],
  "宏分支 / 声明未覆盖引用": [DiagnosticType.UseBeforeDeclaration],
  "宏分支 / #if 0 死分支": [],
  "宏分支 / #elif 继承前置否定": []
};

const STATIC_ONLY_NOTE = "这里只核对静态诊断；无诊断不证明所有宏变体、生成的 GLSL 或 GPU 输出正确。";

/** Shared diagnostic fixtures consumed by the playground and its regression tests. */
export const PLAYGROUND_SAMPLES: Record<string, PlaygroundSample> = {
  [MULTIPLE_ERRORS_LABEL]: {
    source: SCENARIO_SAMPLES[MULTIPLE_ERRORS_LABEL],
    expectedCodes: [DiagnosticType.Redefinition, DiagnosticType.InvalidReturnType, DiagnosticType.InvalidSwizzle],
    note: "同时演示重定义、返回类型不匹配与非法分量三类错误。"
  },
  ...CLASSIC_P1_SAMPLES
};
for (const code of Object.keys(DIAGNOSTIC_SAMPLES) as DiagnosticType[]) {
  PLAYGROUND_SAMPLES[code] = {
    source: DIAGNOSTIC_SAMPLES[code],
    expectedCodes: DIAGNOSTIC_EXPECTATIONS[code] ?? [code],
    note: DIAGNOSTIC_NOTES[code]
  };
}
for (const label of SCENARIO_LABELS) {
  PLAYGROUND_SAMPLES[label] = {
    source: SCENARIO_SAMPLES[label],
    options: SAMPLE_OPTIONS[label],
    expectedCodes: [DiagnosticType.Redefinition],
    note: "错误来自 Broken.glsl 的第二条声明；显示 include 文件位置和片段，不归因到调用方。"
  };
}
for (const [label, source] of Object.entries(MACRO_SAMPLES)) {
  const expectedCodes = MACRO_EXPECTATIONS[label];
  PLAYGROUND_SAMPLES[label] = {
    source,
    expectedCodes,
    note: expectedCodes.length
      ? `此宏场景预期 ${expectedCodes.join("、")}。${STATIC_ONLY_NOTE}`
      : label.includes("覆盖未知")
        ? `复杂条件的覆盖关系未知时保留未知，不制造错误。${STATIC_ONLY_NOTE}`
        : `当前宏定义、互斥或覆盖关系不会产生静态诊断。${STATIC_ONLY_NOTE}`
  };
}

/** Display labels mapped to stable fixture keys. */
export const PLAYGROUND_SAMPLE_LABELS: Record<string, string> = { [MULTIPLE_ERRORS_LABEL]: MULTIPLE_ERRORS_LABEL };
for (const label of [...SCENARIO_LABELS, ...Object.keys(MACRO_SAMPLES), ...Object.keys(CLASSIC_P1_SAMPLES)]) {
  PLAYGROUND_SAMPLE_LABELS[label] = label;
}
const diagnosticKeys = Object.keys(DIAGNOSTIC_SAMPLES) as DiagnosticType[];
diagnosticKeys.sort((a, b) => {
  const left = CATEGORY_ORDER.indexOf(DIAGNOSTIC_CATEGORY[a]);
  const right = CATEGORY_ORDER.indexOf(DIAGNOSTIC_CATEGORY[b]);
  return left !== right ? left - right : a.localeCompare(b);
});
for (const code of diagnosticKeys) {
  PLAYGROUND_SAMPLE_LABELS[`${CATEGORY_LABEL[DIAGNOSTIC_CATEGORY[code]]} / ${code}`] = code;
}
/** Fixture shown when the playground opens. */
export const DEFAULT_PLAYGROUND_SAMPLE = MULTIPLE_ERRORS_LABEL;
