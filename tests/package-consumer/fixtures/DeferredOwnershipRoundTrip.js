// Injected after CJS/ESM package imports by the installed-consumer harness.
const weighted = `(${Array.from({ length: 20 }, (_, index) => `(defined(F${index}) << ${index})`).join(" + ")})`;
const outer = `(${weighted} % 3) == 1`;
const inner = `((${weighted} + 3) % 3) == 1`;
const source = `Shader "deferred-roundtrip" {
#if ${outer}
vec4 selectedColor() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
#if ${inner}
vec4 selectedColor() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() {
#if ${inner}
gl_FragColor = selectedColor();
#else
gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;

function assertSerializable(value) {
  if (typeof value === "string") return assert.ok(!value.includes("\0"), "Private emission marker escaped the encoder");
  if (value == null || typeof value === "number" || typeof value === "boolean") return;
  assert.equal(typeof value, "object");
  if (Array.isArray(value)) return value.forEach(assertSerializable);
  const prototype = Object.getPrototypeOf(value);
  assert.ok(prototype === Object.prototype || prototype === null, "Serialized data retained a parser instance");
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!["astNode", "branchSignature", "sourceArm", "symbolTable", "parent"].includes(key), key);
    assertSerializable(item);
  }
}

function roundTrip(artifact, filename) {
  assertSerializable(artifact);
  // .shaderc is UTF-8 JSON; Buffer IO exercises the exact installed bundler storage format.
  const bytes = Buffer.from(JSON.stringify(artifact), "utf8");
  assert.ok(!bytes.toString("utf8").includes("\\u0000"));
  writeFileSync(filename, bytes);
  const decoded = JSON.parse(readFileSync(filename).toString("utf8"));
  assert.deepEqual(Buffer.from(JSON.stringify(decoded), "utf8"), bytes);
  return decoded;
}

function finalSource(pass, target, macros) {
  const data = new ShaderData();
  for (const macro of macros) data.enableMacro(macro, "0");
  // ShaderMacroProcessor is package-private; the exported ShaderPass exercises the installed
  // evaluator through its existing internal variant entry without requiring a browser or deep import.
  return new ShaderPass(
    "p",
    pass.vertexShaderInstructions,
    pass.fragmentShaderInstructions,
    target
  )._compileShaderSource(
    { _hardwareRenderer: { isWebGL2: target === ShaderLanguage.GLSLES300, canIUse: () => false } },
    data._macroCollection,
    false
  );
}

const analysis = ShaderAnalyzer.analyze(source);
assert.deepEqual(analysis.diagnostics, []);
const results = [];
for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
  const generated = new ShaderCompiler().generate(analysis.passes[0], target);
  assert.ok(generated);
  assertSerializable(generated);
  const offline = new ShaderPrecompiler().precompile(source, target);
  const shared = {
    name: "deferred-roundtrip",
    platformTarget: target,
    subShaders: [
      {
        name: "s",
        passes: [
          {
            name: "p",
            isUsePass: false,
            renderStates: { constantMap: {}, variableMap: {} },
            vertexShaderInstructions: generated.vertexShaderInstructions,
            fragmentShaderInstructions: generated.fragmentShaderInstructions
          }
        ]
      }
    ]
  };
  for (const [path, artifact] of [
    ["analyzer", shared],
    ["offline", offline]
  ]) {
    const original = artifact.subShaders[0].passes[0];
    const decoded = roundTrip(artifact, `${path}-${target}.shaderc`).subShaders[0].passes[0];
    for (const mask of [0, 1, 2, 4, 1 << 19, (1 << 19) + 2]) {
      const macros = Array.from({ length: 20 }, (_, index) => index)
        .filter((index) => mask & (1 << index))
        .map((index) => `F${index}`);
      const expected = mask % 3 === 1;
      const before = finalSource(original, target, macros);
      const after = finalSource(decoded, target, macros);
      assert.deepEqual(after, before);
      assertSerializable(after);
      const bodies = (after.fragmentSource.match(/vec4\s+selectedColor\s*\([^)]*\)\s*\{/g) || []).length;
      assert.equal(bodies, expected ? 1 : 0);
      assert.ok(!after.fragmentSource.includes("0.25"));
      assert.ok(after.fragmentSource.includes(expected ? "0.5" : "0.75"));
      results.push({ path, target, mask, bodies });
    }
  }

  // Frozen pre-ownership instruction tuples: old numeric opcodes and jump offsets remain intact.
  const legacy = {
    name: "legacy",
    platformTarget: target,
    subShaders: [
      {
        name: "s",
        passes: [
          {
            name: "p",
            isUsePass: false,
            renderStates: { constantMap: {}, variableMap: {} },
            vertexShaderInstructions: [[0, "void main() { gl_Position = vec4(0.0); }"]],
            fragmentShaderInstructions: [
              [1, "LEGACY", 3],
              [0, "void main() { gl_FragColor = vec4(0.375); }"],
              [5, 5],
              [0, "void main() { gl_FragColor = vec4(0.625); }"],
              [6]
            ]
          }
        ]
      }
    ]
  };
  const decodedLegacy = roundTrip(legacy, `legacy-${target}.shaderc`);
  assert.deepEqual(decodedLegacy, legacy);
  for (const macros of [[], ["LEGACY"]]) {
    const result = finalSource(decodedLegacy.subShaders[0].passes[0], target, macros);
    assert.deepEqual(result, finalSource(legacy.subShaders[0].passes[0], target, macros));
    assert.ok(result.fragmentSource.includes(macros.length ? "0.375" : "0.625"));
  }
}
process.stdout.write("OWNERSHIP_ROUNDTRIP_RESULT:" + JSON.stringify(results));
