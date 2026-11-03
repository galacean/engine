import { viewConstants } from "../runtime/Camera.js";
import { resolveDocument } from "../runtime/PlacementDocument.js";
/** Offline comparison oracle for the original capture; never used by building runtime.
 * Owns its context/resources. No diagnostic readback is part of load or render.
 * Asset preparation is offline; source geometry is never expanded per instance.
 */
export class ResidentRenderer {
  constructor(canvas, { feedbackBridge } = {}) {
    this.canvas = canvas;
    this.feedbackBridge = feedbackBridge;
    const gl = (this.gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false }));
    if (!gl) throw Error("WebGL2 required");
    this.onLost = (e) => {
      e.preventDefault();
      this.running = false;
      this.metrics.contextLost = true;
      canvas.dispatchEvent(
        new CustomEvent("resident-error", { detail: "GPU 上下文丢失；请刷新页面恢复已保存的场景。" })
      );
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
    this.cache = new Map();
    this.programs = new Map();
    this.gpu = new Map();
    this.draws = [];
    this.owned = [];
    this.metrics = {
      fetchMs: 0,
      parseMs: 0,
      compileMs: 0,
      uploadMs: 0,
      firstSubmitMs: 0,
      uploadBytes: 0,
      frames: 0,
      auditReadbacks: 0
    };
    this.bptc = gl.getExtension("EXT_texture_compression_bptc");
    this.rgtc = gl.getExtension("EXT_texture_compression_rgtc");
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.queries = [];
    this.feedback = [];
  }
  async load(url) {
    const begin = performance.now(),
      res = await fetch(url);
    if (!res.ok) throw Error(`Scene ${res.status}`);
    const raw = await res.text(),
      parsed = performance.now();
    const scene = JSON.parse(raw);
    this.metrics.parseMs = performance.now() - parsed;
    this.base = new URL(".", new URL(url, location.href));
    this.sharedFiles = new Set(scene.sharedAssets?.files || []);
    this.sharedBase = scene.sharedAssets ? new URL(scene.sharedAssets.baseUrl, this.base) : this.base;
    const names = new Set();
    for (const d of scene.draws) {
      names.add(d.indices);
      if (d.instance_buffer) names.add(d.instance_buffer.file);
      for (const a of d.attributes) names.add(a.file);
      for (const r of Object.values(d.resources)) if (r.file) names.add(r.file);
    }
    for (const t of Object.values(scene.textures))
      for (const f of this.compressedFormat(t) ? t.compressed : t.levels) names.add(f);
    await Promise.all([...names].map((n) => this.bytes(n)));
    this.metrics.fetchMs = performance.now() - begin - this.metrics.parseMs;
    const engineStart = performance.now();
    if (scene.draws.some(d => d.instance_buffer?.feedback)) {
      const bridgeURL = new URL("./engine-feedback.js", import.meta.url).href;
      const bridge = this.feedbackBridge ?? await import(/* @vite-ignore */ bridgeURL);
      this.feedbackEngine = await bridge.createFeedbackEngine(this.canvas);
      this.Feedback = bridge.EngineRoofFeedback;
      if (this.feedbackEngine._hardwareRenderer.gl !== this.gl)
        throw Error("Feedback and rendering must use the same WebGL context");
    }
    this.metrics.engineInitMs = performance.now() - engineStart;
    this.metrics.pipeline = scene.pipeline || "resident-v1";
    const compile = performance.now();
    for (const [name, p] of Object.entries(scene.programs)) this.programs.set(name, this.program(p));
    this.metrics.compileMs = performance.now() - compile;
    const upload = performance.now();
    this.scene = scene;
    this.canvas.width = scene.width;
    this.canvas.height = scene.height;
    this.target();
    for (const d of scene.draws) this.draws.push(await this.prepare(d));
    this.metrics.uploadMs = performance.now() - upload;
    const t = performance.now();
    this.render();
    this.metrics.firstSubmitMs = performance.now() - t;
    const gpuError = this.gl.getError();
    if (gpuError !== this.gl.NO_ERROR) throw Error(`GPU resource preparation failed: ${gpuError}`);
    this.metrics.loadTotalMs = performance.now() - begin;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return this.metrics;
  }
  async bytes(name) {
    if (!this.cache.has(name))
      this.cache.set(
        name,
        fetch(new URL(name, this.sharedFiles.has(name) ? this.sharedBase : this.base)).then((r) => {
          if (!r.ok) throw Error(`Asset ${r.status}: ${name}`);
          return r.arrayBuffer();
        })
      );
    return this.cache.get(name);
  }
  own(type, value) {
    if (!value) throw Error(`GPU allocation: ${type}`);
    this.owned.push([type, value]);
    return value;
  }
  shader(type, source) {
    const gl = this.gl,
      s = this.own("Shader", gl.createShader(type));
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  program(p) {
    const gl = this.gl,
      v = this.shader(gl.VERTEX_SHADER, p.vert.source),
      f = this.shader(gl.FRAGMENT_SHADER, p.frag.source),
      program = this.own("Program", gl.createProgram());
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    return program;
  }
  target() {
    const gl = this.gl;
    this.fb = this.own("Framebuffer", gl.createFramebuffer());
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    for (const [format, attachment] of [
      [gl.RGBA8, gl.COLOR_ATTACHMENT0],
      [gl.DEPTH_COMPONENT32F, gl.DEPTH_ATTACHMENT]
    ]) {
      const t = this.own("Texture", gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, format, this.canvas.width, this.canvas.height);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, t, 0);
    }
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error("Incomplete target");
  }
  async buffer(file, target) {
    const key = `buffer:${target}:${file}`;
    if (this.gpu.has(key)) return this.gpu.get(key);
    const gl = this.gl,
      b = this.own("Buffer", gl.createBuffer()),
      bytes = await this.bytes(file);
    gl.bindBuffer(target, b);
    const padded =
      bytes.byteLength % 16 ? new Uint8Array(Math.ceil(bytes.byteLength / 16) * 16) : new Uint8Array(bytes);
    if (padded.buffer !== bytes) padded.set(new Uint8Array(bytes));
    gl.bufferData(target, padded, gl.STATIC_DRAW);
    this.metrics.uploadBytes += padded.byteLength;
    this.gpu.set(key, b);
    return b;
  }
  async storage(file, owner = "") {
    const key = "storage:" + file + ":" + owner;
    if (this.gpu.has(key)) return this.gpu.get(key);
    const gl = this.gl,
      raw = await this.bytes(file),
      words = new Uint32Array(raw),
      width = Math.min(1024, Math.max(1, Math.ceil(words.length / 4))),
      height = Math.max(1, Math.ceil(words.length / (width * 4))),
      data = new Uint32Array(width * height * 4);
    data.set(words);
    const t = this.own("Texture", gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.metrics.uploadBytes += data.byteLength;
    this.gpu.set(key, t);
    return t;
  }
  compressedFormat(t) {
    return t.vkFormat === 139 && this.rgtc
      ? this.rgtc.COMPRESSED_RED_RGTC1_EXT
      : (t.vkFormat === 145 || t.vkFormat === 146) && this.bptc
        ? t.srgb
          ? this.bptc.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT
          : this.bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT
        : null;
  }
  async texture(name, array) {
    const key = "texture:" + array + ":" + name;
    if (this.gpu.has(key)) return this.gpu.get(key);
    const gl = this.gl,
      r = this.scene.textures[name],
      target = array ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D,
      t = this.own("Texture", gl.createTexture());
    gl.bindTexture(target, t);
    const compressed = this.compressedFormat(r),
      levels = compressed ? r.compressed : r.levels,
      format = compressed || (r.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8);
    if (array) gl.texStorage3D(target, r.levels.length, format, r.width, r.height, r.layers);
    else gl.texStorage2D(target, r.levels.length, format, r.width, r.height);
    for (let mip = 0; mip < r.levels.length; mip++) {
      const data = new Uint8Array(await this.bytes(levels[mip]));
      gl.bindTexture(target, t);
      const w = Math.max(1, r.width >> mip),
        h = Math.max(1, r.height >> mip);
      if (compressed) {
        if (array) gl.compressedTexSubImage3D(target, mip, 0, 0, 0, w, h, r.layers, format, data);
        else gl.compressedTexSubImage2D(target, mip, 0, 0, w, h, format, data);
      } else if (array) gl.texSubImage3D(target, mip, 0, 0, 0, w, h, r.layers, gl.RGBA, gl.UNSIGNED_BYTE, data);
      else gl.texSubImage2D(target, mip, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.metrics.uploadBytes += data.byteLength;
    }
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso)
      gl.texParameterf(
        target,
        aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
      );
    this.gpu.set(key, t);
    return t;
  }
  async prepare(d) {
    const gl = this.gl,
      program = this.programs.get(d.program),
      vao = this.own("VertexArray", gl.createVertexArray());
    gl.bindVertexArray(vao);
    for (const a of d.attributes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, await this.buffer(a.file, gl.ARRAY_BUFFER));
      gl.enableVertexAttribArray(a.location);
      if (a.integer) gl.vertexAttribIPointer(a.location, a.size, gl.INT, a.stride, a.offset);
      else gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, a.stride, a.offset);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, await this.buffer(d.indices, gl.ELEMENT_ARRAY_BUFFER));
    let instanceBuffer = null, visibilityBuffer = null;
    if (d.instance_buffer) {
      if (d.instance_buffer.feedback) {
        const simulation = new this.Feedback(this.feedbackEngine, await this.bytes(d.instance_buffer.file));
        this.feedback.push(simulation);
        const query = this.timer ? gl.createQuery() : null;
        if (query) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
        try { simulation.run(d.instance_buffer.feedback.steps); }
        finally {
          if (query) {
            gl.endQuery(this.timer.TIME_ELAPSED_EXT);
            this.queries.push({ query, metric: "feedbackGpuMs" });
          }
        }
        // Borrow PR3071's current output. The simulator remains the resource owner.
        instanceBuffer = simulation.readBinding.buffer._platformBuffer._glBuffer;
        this.metrics.uploadBytes += simulation.metrics.uploadBytes;
        this.metrics.feedbackDispatches = (this.metrics.feedbackDispatches || 0) + simulation.metrics.dispatches;
        this.metrics.feedbackSubmitMs = (this.metrics.feedbackSubmitMs || 0) + simulation.metrics.submitMs;
      } else instanceBuffer = await this.buffer(d.instance_buffer.file, gl.ARRAY_BUFFER);
      gl.bindVertexArray(vao);
      this.bindInstanceBuffer(instanceBuffer);
      visibilityBuffer = this.own("Buffer", gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, visibilityBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(d.count).fill(1), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(12);
      gl.vertexAttribIPointer(12, 1, gl.UNSIGNED_BYTE, 1, 0);
      gl.vertexAttribDivisor(12, 1);
      this.metrics.uploadBytes += d.count;
    }
    let slot = 0,
      uboSlot = 0;
    const textures = [],
      uniforms = [];
    gl.useProgram(program);
    for (const [name, r] of Object.entries(d.resources)) {
      if (r.kind === "uniform") {
        const index = gl.getUniformBlockIndex(program, name);
        if (index !== gl.INVALID_INDEX) {
          const buffer = await this.buffer(r.file, gl.UNIFORM_BUFFER);
          gl.uniformBlockBinding(program, index, uboSlot);
          uniforms.push({ name, slot: uboSlot++, buffer });
        }
      } else {
        const location = gl.getUniformLocation(program, name);
        if (location === null) continue;
        const target = r.kind === "storage" || !r.array ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY,
          texture =
            r.kind === "storage"
              ? await this.storage(r.file, name === d.indirection ? d.id : "")
              : await this.texture(r.texture, r.array);
        gl.useProgram(program);
        gl.uniform1i(location, slot);
        textures.push({ name, slot: slot++, target, texture });
      }
    }
    if (slot > gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)) throw Error("Too many textures");
    return {
      ...d,
      program,
      vao,
      instanceBuffer,
      visibilityBuffer,
      textures,
      uniforms,
      visible: (!d.variant || d.variant === "roof_tile")
    };
  }
  bindInstanceBuffer(buffer) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(8 + i);
      gl.vertexAttribIPointer(8 + i, 4, gl.UNSIGNED_INT, 64, i * 16);
      gl.vertexAttribDivisor(8 + i, 1);
    }
  }
  render() {
    const gl = this.gl;
    if (!this.fb) return;
    const timer = this.timer;
    if (timer && this.metrics.frames === 0) {
      const q = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
      this.queries.push({ query: q, metric: "firstGpuMs" });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.GREATER);
    gl.depthMask(true);
    gl.clearDepth(0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const d of this.draws) {
      if (!d.visible) continue;
      gl.useProgram(d.program);
      gl.bindVertexArray(d.vao);
      for (const r of d.uniforms) gl.bindBufferBase(gl.UNIFORM_BUFFER, r.slot, r.buffer);
      for (const t of d.textures) {
        gl.activeTexture(gl.TEXTURE0 + t.slot);
        gl.bindTexture(t.target, t.texture);
      }
      gl.drawElementsInstanced(gl.TRIANGLES, d.indexCount, gl.UNSIGNED_INT, 0, d.instance_buffer ? d.count : (d.drawCount ?? d.count));
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
    if (timer && this.metrics.frames === 0) gl.endQuery(timer.TIME_ELAPSED_EXT);
    for (let i = this.queries.length - 1; i >= 0; i--) {
      const { query: q, metric } = this.queries[i];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT))
          this.metrics[metric] = (this.metrics[metric] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
        this.queries.splice(i, 1);
      }
    }
    this.metrics.frames++;
  }
  setCamera(camera) {
    const data = viewConstants(camera),
      gl = this.gl,
      buffers = new Set();
    for (const d of this.draws)
      for (const u of d.uniforms) if (u.name === "ViewConstants_natural") buffers.add(u.buffer);
    for (const b of buffers) {
      gl.bindBuffer(gl.UNIFORM_BUFFER, b);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
    }
    this.render();
    return Array.from(data.slice(96, 112));
  }
  applyDocument(document) {
    const begin = performance.now(),
      resolution = resolveDocument(this.scene, document),
      selections = resolution.selections,
      resolved = performance.now(),
      updates = [];
    for (const group of selections)
      for (const d of this.draws.filter((d) => d.group === group.group && d.variant)) {
        d.activeBindingId = group.binding_id;
        const ids = group.selections[d.variant];
        if (d.selection && ids.length === d.selection.length && ids.every((n, i) => n === d.selection[i])) continue;
        const width = Math.min(1024, Math.max(1, Math.ceil(d.count / 4))),
          height = Math.max(1, Math.ceil(d.count / (width * 4))),
          data = new Uint32Array(width * height * 4);
        data.set(ids);
        updates.push({ d, data, width, height, count: ids.length, ids });
      }
    const packed = performance.now(),
      gl = this.gl;
    let bytes = 0;
    for (const { d, data, width, height, count, ids } of updates) {
      if (d.visibilityBuffer) {
        const mask = new Uint8Array(d.count);
        for (const id of ids) mask[id] = 1;
        gl.bindBuffer(gl.ARRAY_BUFFER, d.visibilityBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, mask);
        bytes += mask.byteLength;
      } else {
        gl.bindTexture(gl.TEXTURE_2D, d.textures.find((t) => t.name === d.indirection).texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data);
        bytes += data.byteLength;
      }
      d.selection = ids;
      d.drawCount = count;
      d.selected = count > 0;
      d.visible = d.selected;
    }
    const submitted = performance.now();
    this.resolvedCells = resolution.cells;
    this.render();
    this.metrics.lastEdit = {
      resolveMs: resolved - begin,
      packMs: packed - resolved,
      uploadSubmitMs: submitted - packed,
      renderSubmitMs: performance.now() - submitted,
      uploadBytes: bytes,
      instances: resolution.cells.filter((c) => !c.hidden).length,
      updatedGroups: updates.length
    };
    return this.metrics.lastEdit;
  }
  setLayers(enabled) {
    for (const d of this.draws)
      d.visible =
        (d.selected ?? (!d.variant || d.variant === "roof_tile")) &&
        enabled.has(
          d.binding_id
            ? "binding:" + (d.activeBindingId || d.binding_id)
            : { brick: "brick", roof: "roof", plaster: "plaster" }[d.family] || "detail"
        );
    this.render();
  }
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const { query } of this.queries) this.gl.deleteQuery(query);
    this.queries = [];
    for (const [type, r] of this.owned.reverse()) this.gl["delete" + type](r);
    for (const simulation of this.feedback) simulation.destroy();
    this.feedback = [];
    this.feedbackEngine?.destroy();
    this.feedbackEngine = null;
    this.owned = [];
    this.draws = [];
    this.cache.clear();
    this.gpu.clear();
  }
}
