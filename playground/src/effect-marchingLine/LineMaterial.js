import { UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/o3-base';
import { Material, RenderTecnique } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';

export function createLineMaterial(loader) {
 let newMtl = new Material('line_mtl');
 newMtl.technique = requireShapeTechnique(loader);
 newMtl.setValue('uTime', 1);
 return newMtl;
}

function requireShapeTechnique(loader) {
 /** Technique 对象的资源名称 */
 const TECH_NAME = 'center_tech';

 //-- 创建一个新的 Technique
 const VERT_SHADER = `

        uniform mat4 matModelViewProjection;
        attribute vec3 a_position;

        #define GLSLIFY 1
  
        uniform float uTime;
 
        void main() {
          gl_Position = matModelViewProjection * vec4( a_position, 1.0 );
          gl_PointSize = 35.0 / (gl_Position.z);
        }
 `;

 const FRAG_SHADER = `
        precision highp float;
        precision highp int;
        
        uniform float uTime;
        uniform float uRadius;
        uniform vec4  uColor;
 
        void main(void) {
          float t = uTime * 0.24;
          float x = (sin(t) + sin(2.2 * t+5.52) + sin(2.9 * t+0.93) + sin(4.6 * t+8.94)) / 4.0;
 
          float len = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (len > 0.5) {
            discard;
          }
          float alpha = step(0.5, len);
          // len = clamp(len, 0.0, 0.6);
          // float alpha = (0.6 - len) * 2.0; 
          vec4 color = vec4(0.8, 0.8, 0.8, 1.0);
          gl_FragColor = color; // mix(vec4(0.0), color,  alpha); //

        }`;

 const TECH_CONFIG = {
  name: TECH_NAME,
  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    }
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    uTime: {
      name: 'uTime',
      type: DataType.FLOAT,
    },
    uRadius: {
      name: 'uRadius',
      type: DataType.FLOAT,
    },
    uColor: {
      name: 'uColor',
      type: DataType.FLOAT_VEC4,
    }
  }
 };

 const techRes = new Resource(TECH_NAME, {
 type: 'technique',
 data: {
 technique: TECH_CONFIG,
 vertexShader: VERT_SHADER,
 fragmentShader: FRAG_SHADER,
 }
 });

 loader.load(techRes);

 return techRes.asset;

}
