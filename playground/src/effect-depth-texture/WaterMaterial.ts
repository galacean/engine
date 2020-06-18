import { DataType } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";

//-- 创建一个新的 Technique
const VERT_SHADER = `
  uniform mat4 u_MVPMat;
  attribute vec3 a_position;
  attribute vec2 a_uv;
  attribute vec3 a_normal;
  
  varying vec2 v_uv;
  varying vec3 v_position;
  varying vec4 v_cam_position;
  varying vec3 v_normal;

  uniform float uTime;

  void main() {
  
    gl_Position = u_MVPMat  *  vec4( a_position, 1.0 );
    v_uv = a_uv;
    v_normal = a_normal;
    v_position = a_position;
    v_cam_position = gl_Position; 
  }
`;

const FRAG_SHADER = `
varying vec2 v_uv;
varying vec3 v_position;
varying vec3 v_normal;
varying vec4 v_cam_position;

uniform float u_time;
uniform sampler2D u_texture;
uniform sampler2D u_depthTexture;
uniform vec3 u_cameraPos;

#define EPS 0.001
#define MAX_ITR 100
#define MAX_DIS 100.0

#define WATER_SPEED 1.
#define WATER_SCALE 0.5
#define ROTATE_SPEED 1.0

#define rgb(r, g, b) vec3(float(r)/255., float(g)/255., float(b)/255.)

//Distance Functions
float sd_sph(vec3 p, float r) { return length(p) - r; }
float sd_box( vec3 p, vec3 b ) 
{ 
  vec3 d = abs(p) - b; 
  return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0)); 
}

float sdPlane( vec3 p, vec4 n )
{
  // n must be normalized
  return dot(p,n.xyz) + n.w;
}

// Distance Map
float map(vec3 p, vec2 sc)
{    
  float l = cos(length(p * 2.0));
  vec2 u = vec2(l, sc.y);
  vec2 um = u * 0.3;
  um.x += u_time * 0.1 * WATER_SPEED;
  um.y += -u_time * 0.025 * WATER_SPEED;
  um.x += (um.y) * 2.0;    
  float a1 = texture2D(u_texture, (p.yz  *  .4 + um) * WATER_SCALE).x;
  float a2 = texture2D(u_texture, (p.zx  *  .4 + um) * WATER_SCALE).x;
  float a3 = texture2D(u_texture, (p.xy  *  .4 + um) * WATER_SCALE).x;
  
  float t1 = a1 + a2 + a3;
  t1 /= 15.0 * WATER_SCALE;
  
  float b1 = texture2D(u_texture, (p.yz  *  1. + u) * WATER_SCALE).x;
  float b2 = texture2D(u_texture, (p.zx  *  1. + u) * WATER_SCALE).x;
  float b3 = texture2D(u_texture, (p.xy  *  1. + u) * WATER_SCALE).x;
  
  float t2 = b1 + b2 + b3;
  t2 /= 15.0  *  WATER_SCALE;
  
  float comb = t1 * 0.4 + t2 * 0.1 * (1.0 - t1);
  
  return comb + sdPlane(p, vec4(0., 0., 1.0, 0.)); // sd_sph(p, 3.); // sd_box(p, vec3(1., 1., 1.)) + 
}

//Lighting Utils
float fresnel(float bias, float scale, float power, vec3 I, vec3 N)
{
    return bias + scale  *  pow(1.0 + dot(I, N), power);
}

float getDepth(vec4 pos) 
{
  vec3 depthCoord = (pos.xyz/pos.w)/2.0 + 0.5;
  float z = texture2D(u_depthTexture, depthCoord.xy).r;
  float n = 0.1;
  float f = 30.0;
  return (2.0 * n) / (f + n - z*(f-n));
}

void main (void) {
    vec3 pos = v_position; 
    
    vec2 uv = vec2(v_uv.x * 0.5, v_uv.y * 0.5);//  / iResolution.xy;
    
    vec3  lig = normalize(vec3(-1., -3, -4.5));// * 0.8;
    vec2 eps = vec2(0.0, EPS);
    vec3 normal = normalize(vec3(
        map(pos + eps.yxx, uv) - map(pos - eps.yxx, uv),
        map(pos + eps.xyx, uv) - map(pos - eps.xyx, uv),
        map(pos + eps.xxy, uv) - map(pos - eps.xxy, uv)
    ));

    // vec4 diffuse = u_diffuse;   
    float d = max(0.0, dot(lig, -normal)) / 1.0;
              
    vec3 diffuse = rgb(84, 118, 145) * d;
    float specular = pow(d, 256.);   

    vec3 I = normalize(pos - u_cameraPos);
    float R = fresnel(0.1, 1.4, 2.0, I, normal);
    
    // vec3 r = texture(iChannel1, reflect(raydir, normal)).rgb;
    vec3 col = vec3(R * 0.5 + specular * 0.1) + diffuse.rgb;  
    
    float depth = getDepth(v_cam_position);
    col *= 1.0 - (gl_FragCoord.z - depth); 
    
    gl_FragColor = vec4(col,1.0);
}
`;

export class WaterMaterial extends Material {
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique() {
    //--
    const tech = new RenderTechnique("water_tech");
    tech.isValid = true;
    tech.uniforms = this.getUniforms();
    tech.attributes = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    this._technique = tech;
  }

  /**
   * 重写基类方法
   * @private
   */
  prepareDrawing(camera, component, primitive?) {
    if (this._technique === null) {
      this._generateTechnique();
    }

    super.prepareDrawing(camera, component, primitive);
  }

  getUniforms() {
    let uniforms = {
      u_texture: {
        name: "u_texture",
        type: DataType.SAMPLER_2D
      },
      u_depthTexture: {
        name: "u_depthTexture",
        type: DataType.SAMPLER_2D
      }
    };

    return uniforms;
  }
}
