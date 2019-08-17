import { RenderPass } from '@alipay/o3-renderer-basic';
import { ScreenQuad } from '@alipay/o3-post-processing';
import { Material, RenderTechnique } from '@alipay/o3-material';
import { UniformSemantic, DataType, RenderState, FrontFace } from '@alipay/o3-base';

class RippleMaterial extends Material {
  constructor() {
    super('RippleMaterial');

    let tech = new RenderTechnique('RippleMaterial');
    tech.isValid = true;
    tech.vertexShader = RippleMaterial.vertexShader;
    tech.fragmentShader = RippleMaterial.fragmentShader;
    tech.attributes = RippleMaterial.attributes;
    tech.uniforms = { ...RippleMaterial.uniforms };
    tech.states = {
    };
    this._technique = tech;
  }

  update(engine) {
    // super.prepareDrawing(camera, component, primitive);
    this.setValue('u_time', engine.time.timeSinceStartup * 0.001);
  }
}

Object.assign(RippleMaterial, {
  vertexShader: `
  precision highp float;

  attribute vec2 a_uv;
  attribute vec2 a_position;

  varying vec2 v_uv;

  void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
  `,

  fragmentShader: `
  precision mediump float;

  varying vec2 v_uv;
  uniform float u_time;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
  {
    return a + b*cos( 6.28318*(c*t+d) );
  }

  // ref: https://www.shadertoy.com/view/4lVXzK
  void main() {
    vec2 uv = v_uv;
    float a = 0.0;
    float iTime = u_time/20.0;
    float timer=mod(iTime, 3.0);
    float radius=2.0/timer;
    float width=timer*3.0;
    float ring=length(vec2(uv.x+0.2, uv.y))*radius*width-width;//(timer/4.0)-3.0;
    ring=min(2.0, abs(1.0/(10.0*ring)));
    ring=max(0.0, ring-timer);
    a = ring;
    vec3 rings=vec3(ring*0.3, ring+.05, ring-0.05);

    timer=mod(iTime*1.2+2.0, 3.0);
    radius=1.3/timer;
    width=2.0*timer;
    ring=length(vec2(uv.x-1.0, uv.y+0.2))*radius*width-width;//(timer/4.0)-3.0;
    ring=min(2.0, abs(1.0/(10.0*ring)));
    ring=max(0.0, ring-timer);
    a += ring;
    rings+=vec3(ring, ring*.4, ring*.5);

    gl_FragColor = vec4(rings, a);
  }
  `,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC2
    },
    a_uv: {
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    }
  },

  uniforms: {
    u_time: {
      name: 'u_time',
      semantic: UniformSemantic.TIME,
      type: DataType.FLOAT,
    }
  }
});

/**
 * 绘制波纹效果
 */
export class RipplePass extends RenderPass {
  constructor( renderTarget, engine ) {
    super('RIPPLE_PASS', -2, renderTarget, null, 0);
    this.renderOverride = true;
    this.screenQuad = new ScreenQuad();
    this.material = new RippleMaterial();
    this.engine = engine;
  }

  render( camera ) {
    const rhi = camera.renderHardware;

    this.material.update(this.engine);
    rhi.drawPrimitive(this.screenQuad.primitive, this.material);
  }
}
