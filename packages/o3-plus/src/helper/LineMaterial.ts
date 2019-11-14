import * as r3 from "@alipay/o3";

export class LineMaterial extends r3.Material {
  private _emission = [1.0, 0.0, 0.0, 1.0];
  private _size: number = 1;
  private state = {
    depthTest: {
      semantic: r3.RenderState.DEPTH_TEST,
      value: false
    },
    cullFace: {
      semantic: r3.RenderState.CULL_FACE,
      value: false
    },
    blend: {
      semantic: r3.RenderState.BLEND,
      value: false
    }
  };

  get size(): number {
    return this._size;
  }

  set size(value: number) {
    this._size = value;
    this.setValue("u_pointSize", value);
  }

  get doubleSided(): boolean {
    return !this.state.cullFace.value;
  }

  set doubleSided(value: boolean) {
    this.state.cullFace.value = !value;
    this._updateTechnique();
  }

  get emission(): number[] {
    return this._emission;
  }

  set emission(value: number[]) {
    this._emission = value;
    this.setValue("u_color", value);
  }

  get depthTest(): boolean {
    return this.state.depthTest.value;
  }

  set depthTest(value: boolean) {
    this.state.depthTest.value = value;
    this._updateTechnique();
  }

  get blend(): boolean {
    return this.state.blend.value;
  }

  set blend(value: boolean) {
    this.state.blend.value = value;
    this._updateTechnique();
  }

  constructor(name) {
    super(name);
    this._internalGenerate(name);
  }

  private _updateTechnique() {
    const enable = [];
    const disable = [];

    const states = Object.keys(this.state).map(key => this.state[key]);
    states.forEach(state => {
      const arr = state.value ? enable : disable;
      arr.push(state.semantic);
    });

    this.technique.states.enable = enable;
    this.technique.states.disable = disable;
  }

  /**
   * 生成内部的 Technique 对象
   * @private
   */
  private _internalGenerate(name) {
    // 顶点着色器
    const VERT_SHADER = `
      uniform mat4 matModelViewProjection;
      uniform float u_pointSize;

      attribute vec3 a_position;

      void main() {
        gl_Position = matModelViewProjection * vec4(a_position, 1.0);
        gl_PointSize = 10.0;
      }
    `;

    // 片元着色器
    const FRAG_SHADER = `
      uniform vec4 u_color;
      
      void main() {
        gl_FragColor = u_color;
      }
    `;

    // Technique 配置信息
    const cfg = {
      attributes: {
        a_position: {
          name: "a_position",
          semantic: "POSITION",
          type: r3.DataType.FLOAT_VEC3
        }
      },
      uniforms: {
        matModelViewProjection: {
          name: "matModelViewProjection",
          semantic: r3.UniformSemantic.MODELVIEWPROJECTION,
          type: r3.DataType.FLOAT_MAT4
        },
        pointSize: {
          name: "u_pointSize",
          semantic: "SIZE",
          type: r3.DataType.FLOAT
        },
        u_color: {
          name: "u_color",
          semantic: "COLOR",
          type: r3.DataType.FLOAT_VEC4
        }
      }
    };

    // 创建 Technique
    const tech = new r3.RenderTechnique(name);
    tech.isValid = true;
    tech.uniforms = cfg.uniforms;
    tech.attributes = cfg.attributes;
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      enable: [r3.RenderState.DEPTH_TEST, r3.RenderState.BLEND],
      disable: [],
      functions: {
        blendFunc: [r3.BlendFunc.SRC_ALPHA, r3.BlendFunc.ONE_MINUS_SRC_ALPHA],
        depthMask: [false]
      }
    };
    this.technique = tech;
  }
}
