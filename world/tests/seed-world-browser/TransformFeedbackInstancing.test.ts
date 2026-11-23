import { expect, it } from "vitest";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  MeshTopology,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  Texture2D,
  TextureFormat,
  TransformFeedbackSimulator,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat,
  WebGLEngine
} from "@galacean/engine";

it("captures every instance at the requested output offset and preserves ordinary TF draws", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const pass = new ShaderPass(
    "InstancedFeedbackTest",
    [
      [
        0,
        "in float a_Base; out float v_Value; void main() { v_Value = a_Base + float(gl_VertexID); gl_Position = vec4(0.0); }"
      ]
    ],
    [[0, "precision highp float; out vec4 color; void main() { color = vec4(0.0); }"]],
    ShaderLanguage.GLSLES300
  );
  const simulator = new TransformFeedbackSimulator(engine, 4, 16, pass, ["v_Value"]);
  const generator = new TransformFeedbackSimulator(engine, 4, 16, pass, ["v_Value"], "output-only");
  const input = new Buffer(engine, BufferBindFlag.VertexBuffer, new Float32Array([10, 20]), BufferUsage.Static);
  const shaderData = new (ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData)(
    ShaderDataGroup.Renderer
  );
  const bindings = [new VertexBufferBinding(input, 4)];
  const elements = [new VertexElement("a_Base", 0, VertexElementFormat.Float, 0, 2)];
  try {
    expect(simulator.beginUpdate(shaderData, [], bindings, elements)).toBe(true);
    simulator.draw(MeshTopology.Points, 1, 3, 4);
    simulator.endUpdate();
    const values = new Float32Array(16);
    simulator.readBinding.buffer.getData(values);
    expect(Array.from(values)).toEqual([0, 11, 12, 13, 11, 12, 13, 21, 22, 23, 21, 22, 23, 0, 0, 0]);

    const previousFrame = simulator.readBinding;
    // The next update uses the other VAO and the default one-instance call.
    expect(simulator.beginUpdate(shaderData, [], bindings, elements)).toBe(true);
    simulator.draw(MeshTopology.Points, 0, 2);
    simulator.endUpdate();
    expect(simulator.readBinding).not.toBe(previousFrame);
    simulator.readBinding.buffer.getData(values);
    expect(Array.from(values.slice(0, 2))).toEqual([10, 11]);

    // Resizing invalidates the VAOs; ordinary attributes must retain a zero divisor.
    simulator.resize(32, []);
    const ordinaryBindings = [new VertexBufferBinding(input, 4)];
    const ordinaryElements = [new VertexElement("a_Base", 0, VertexElementFormat.Float, 0)];
    expect(simulator.beginUpdate(shaderData, [], ordinaryBindings, ordinaryElements)).toBe(true);
    simulator.draw(MeshTopology.Points, 0, 2);
    simulator.endUpdate();
    simulator.readBinding.buffer.getData(values);
    expect(Array.from(values.slice(0, 2))).toEqual([10, 21]);
    const original = generator.readBinding;
    for (let frame = 0; frame < 3; frame++) {
      expect(generator.beginUpdate(shaderData, [], ordinaryBindings, ordinaryElements)).toBe(true);
      generator.draw(MeshTopology.Points, 0, 2);
      generator.endUpdate();
      expect(generator.readBinding).toBe(original);
      original.buffer.getData(values);
      expect(Array.from(values.slice(0, 2))).toEqual([10, 21]);
    }
    expect(() => generator.beginUpdate(shaderData, ordinaryElements, [], [])).toThrow("independent vertex inputs");
    generator.resize(32, [{ sourceStart: 1, targetStart: 2, count: 1 }]);
    expect(generator.readBinding).not.toBe(original);
    expect(original.buffer.destroyed).toBe(true);
    generator.readBinding.buffer.getData(values);
    expect(values[2]).toBe(21);
    expect(canvas.getContext("webgl2")!.getError()).toBe(0);
  } finally {
    generator.destroy();
    simulator.destroy();
    input.destroy();
    engine.destroy();
  }
});

it("copies a tightly packed GL buffer prefix across texture rows and restores pixel unpack state", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const gl = canvas.getContext("webgl2")!;
  const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, new Uint8Array([1, 2, 3, 4, 5]), BufferUsage.Static, false);
  const texture = new Texture2D(engine, 3, 2, TextureFormat.R8_UNorm, false);
  const previous = gl.createBuffer();
  try {
    texture.setPixelBuffer(new Uint8Array(6));
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previous);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    engine._hardwareRenderer.copyBufferToTexture(buffer, texture, 5);
    expect(gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING)).toBe(previous);
    expect(gl.getParameter(gl.UNPACK_ALIGNMENT)).toBe(8);
    expect(() => engine._hardwareRenderer.copyBufferToTexture(buffer, texture, 6)).toThrow(RangeError);
    const out = new Uint8Array(6);
    texture.getPixelBuffer(out);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    gl.deleteBuffer(previous);
    texture.destroy(true);
    buffer.destroy(true);
    engine.destroy();
  }
});
