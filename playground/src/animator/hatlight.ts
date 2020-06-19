import { DataType, UniformSemantic, RenderState, BlendFunc } from "@alipay/o3-base";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { PlaneGeometry } from "@alipay/o3-geometry-shape";
import { Material } from "@alipay/o3-material";
import { Resource, ResourceLoader } from "@alipay/o3-loader";

function createShapeMaterial(loader) {
  let newMtl = new Material("shape_mtl");
  newMtl.technique = requireShapeTechnique(loader) as any;
  return newMtl;
}

function requireShapeTechnique(loader) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = "shape_tech";

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
    precision highp float;
    precision highp int;
  
    uniform mat4 matModelViewProjection;
  
    attribute vec3 a_position; 
    attribute vec3 a_normal;    
    attribute vec2 a_uv;
  
    varying vec2 v_uv;
  
    void main() {
      v_uv = a_uv;
      gl_Position = matModelViewProjection * vec4(a_position, 1.0);
    }
    `;

  const FRAG_SHADER = `
    precision mediump float;
    precision mediump int;
    uniform sampler2D tMask;
    uniform sampler2D tLight;
    uniform float uAngle;
    varying vec2 v_uv;
    
    void main() {
      float sin_factor = sin(uAngle);
      float cos_factor = cos(uAngle);
      vec2 coord = vec2(v_uv.x- 0.5, v_uv.y - 0.5) * mat2(cos_factor, -sin_factor, sin_factor, cos_factor) + 0.5;
      vec4 color = texture2D(tLight, coord);
      float mask = texture2D(tMask, v_uv).r;
      gl_FragColor = vec4(color.rgb, color.a * mask);
    }
    `;

  const TECH_CONFIG = {
    name: TECH_NAME,
    attributes: {
      a_position: {
        name: "a_position",
        semantic: "POSITION",
        type: DataType.FLOAT_VEC3
      },
      a_normal: {
        name: "a_normal",
        semantic: "NORMAL",
        type: DataType.FLOAT_VEC3
      },
      a_uv: {
        name: "a_uv",
        semantic: "TEXCOORD_0",
        type: DataType.FLOAT_VEC2
      },
      a_startTime: {
        name: "a_startTime",
        semantic: "STARTTIME",
        type: DataType.FLOAT
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: "matModelViewProjection",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4
      },
      uTime: {
        name: "uTime",
        type: DataType.FLOAT
      },
      tMask: {
        name: "tMask",
        type: DataType.SAMPLER_2D
      },
      tLight: {
        name: "tLight",
        type: DataType.SAMPLER_2D
      },
      uAngle: {
        name: "uAngle",
        type: DataType.FLOAT
      }
    },
    states: {
      enable: [RenderState.BLEND, RenderState.DEPTH_TEST],
      functions: {
        blendFuncSeparate: [
          BlendFunc.SRC_ALPHA,
          BlendFunc.ONE_MINUS_SRC_ALPHA,
          BlendFunc.ONE,
          BlendFunc.ONE_MINUS_SRC_ALPHA
        ],
        // todo question
        depthMask: [false]
      }
    }
  };

  const techRes = new Resource(TECH_NAME, {
    type: "technique",
    data: {
      technique: TECH_CONFIG,
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER
    }
  });

  loader.load(techRes);

  return techRes.asset;
}

class CustomAbility extends AGeometryRenderer {
  public scale: any;
  public angle: any;
  public animType: any;
  static attributes = {};

  constructor(node, props) {
    super(node);
    this.scale = 1;
    this.angle = Math.PI * 2;
    this.animType = props.animType;
    this.geometry = new PlaneGeometry(7, 7, 1, 1);
    const resourceLoader = new ResourceLoader(node.engine);
    const textures = [
      new Resource("texture", {
        type: "texture",
        url: "https://gw.alipayobjects.com/mdn/rms_40d266/afts/img/A*keO2Qqo69V8AAAAAAAAAAABkARQnAQ"
      }),
      new Resource("texture", {
        type: "texture",
        url: "https://gw.alipayobjects.com/mdn/rms_40d266/afts/img/A*opFaQ4b__-8AAAAAAAAAAABkARQnAQ"
      })
    ];

    resourceLoader.batchLoad(textures, (err, res) => {
      const mtl = createShapeMaterial(resourceLoader);
      mtl.setValue("tMask", res[0].assets[0]);
      mtl.setValue("tLight", res[1].assets[0]);
      mtl.setValue("uAngle", this.angle);
      this.setMaterial(mtl);
      this.material = mtl;
    });
  }

  rotateAnim() {
    this.angle -= 0.02;
    if (this.angle < 0) {
      this.angle = Math.PI * 2;
    }
    if (this.material) {
      this.material.setValue("uAngle", this.angle);
    }
  }

  scaleAnim() {
    this.scale *= 0.95;
    if (this.scale < 0.1) {
      this.scale = 1;
    }
    this.node.scale = [this.scale, this.scale, 1];
  }

  animUpdate() {
    if (this.animType === "rotate") {
      this.rotateAnim();
    }
    if (this.animType === "scale") {
      this.scaleAnim();
    }
  }
}

export default CustomAbility;
