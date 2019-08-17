import { UniformSemantic, DataType, RenderState, FrontFace } from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';
import { Resource } from '@alipay/o3-loader';
import { vec3,vec4} from '@alipay/o3-math';

export class BuildingMaterial4Fun extends Material {
  constructor(name, diffuseMap=null, glossiness=0.0) {
    super(name);

    let tech = new RenderTechnique('buildingRendering4Fun');
    tech.isValid = true;
    tech.vertexShader = BuildingMaterial4Fun.vertexShader;
    tech.fragmentShader = BuildingMaterial4Fun.fragmentShader;
    tech.attributes = BuildingMaterial4Fun.attributes;
    tech.uniforms = { ...BuildingMaterial4Fun.uniforms };
    tech.states = {
      disable: [RenderState.CULL_FACE]
    };
    this._technique = tech;

    this.diffuseMap = diffuseMap;
    this.glossiness = glossiness;
    this.cubemap = null;
    this.highlightMap = null;
  }
  prepareDrawing(camera, component, primitive) {
    this.setValue('u_diffuseMap', this.diffuseMap);
    this.setValue('u_glossiness', this.glossiness);
    if (this.cubemap != null) {
      this.setValue('u_cubemap', this.cubemap);
    }
    if (this.highlightMap != null) {
      this.setValue('u_highlightMap', this.highlightMap);
    }
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(BuildingMaterial4Fun, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec2 a_uv;
  attribute vec2 a_center;
  attribute vec3 a_position;
  attribute vec3 a_normal;
  attribute vec3 a_color;

  uniform mat4 matModelViewProjection;
  uniform mat4 matModelView;
  uniform mat4 u_modelMat;
  uniform sampler2D u_highlightMap;

  varying vec2 v_uv;
  varying vec3 v_light;
  varying vec3 v_color;
  varying float v_height;
  varying float v_cameraDistance;
  varying vec3 v_refdir;
  varying vec4 v_highlight;

  vec3 lightDir = normalize(vec3(0.3, -0.2, 0.4));
  vec3 lightColor = vec3(1.0,1.0,1.0);

  void main() {
    v_uv = a_uv;
    v_height = a_position.y;
    vec3 cameraSpaceNormal = (matModelView * vec4(a_normal, 0.0)).xyz;
    vec3 cameraSpaceLightDir = (matModelView * vec4(lightDir, 0.0)).xyz;
    vec4 cameraSpacePos = matModelView * vec4(a_position, 1.0);
    vec3 worldSpacePos = (u_modelMat * vec4(a_center.x, 0.0, a_center.y, 1.0)).xyz;
    vec2 uvHighlight = (worldSpacePos.xz+400.0) / 800.0;
    v_light = max(0.25, abs(dot(cameraSpaceNormal, cameraSpaceLightDir))) * lightColor;
    v_color = a_color;
    v_cameraDistance = cameraSpacePos.z;
    v_highlight = texture2D(u_highlightMap, uvHighlight);

    vec3 offset = vec3(0.0, v_highlight.a, 0.0) * 5.0;
    v_refdir = reflect(normalize(cameraSpacePos.xyz), cameraSpaceNormal);
    gl_Position = matModelViewProjection * vec4(a_position+offset, 1.0);
  }`,

  fragmentShader: `
  precision mediump float;
  precision mediump int;

  uniform sampler2D u_diffuseMap;
  uniform samplerCube u_cubemap;
  uniform float u_glossiness;

  varying vec2 v_uv;
  varying vec3 v_light;
  varying vec3 v_color;
  varying float v_height;
  varying float v_cameraDistance;
  varying vec3 v_refdir;
  varying vec4 v_highlight;

  void main() {
    float darken = clamp((4.0-v_height)/4.0, 0.6, 1.1) + 0.7 + clamp((-100.0-v_cameraDistance)/200.0, -0.3, 0.2);
    gl_FragColor = texture2D(u_diffuseMap, v_uv, -2.0) * darken * vec4(v_light,1.0);
    gl_FragColor.rgb += clamp(((2.0-v_height)/5.0+0.2)*vec3(0.3, 0.2, 0.0), 0.0, 1.0);

    vec3 ref = textureCube(u_cubemap, v_refdir*vec3(-1.0,1.0,1.0)).rgb;
    gl_FragColor.rgb += ref * u_glossiness * 0.4 * clamp(dot(v_refdir, vec3(0.0,0.0,-1.0)), 0.1, 1.0);
    gl_FragColor.rgb *= (v_highlight.rgb+1.0);

    gl_FragColor.a = 1.0;

    // DEBUG FUNCTIONS:

    // gl_FragColor.rgb += clamp(((2.0-v_height)/5.0+0.2)*vec3(0.3, 0.3, 0.3), 0.0, 1.0);
    // gl_FragColor.rgb = 1.0-gl_FragColor.rgb;
    // gl_FragColor.rgb = 0.5 * (1.0+v_refdir*0.5);
    // gl_FragColor.rgb = ref * clamp(dot(v_refdir, vec3(0.0,0.0,-1.0)), 0.0, 1.0);
    // gl_FragColor = (0.1*darken) * vec4(v_light,1.0);
    // gl_FragColor = vec4(vec3(1.0,1.0,1.0)*darken, 1.0);
    // gl_FragColor = vec4(v_uv.x, 0.0, 0.0, 1.0) + vec4(v_color, 0.0);
  }`,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_center: {
      name: 'a_center',
      semantic: 'TEXCOORD_1',
      type: DataType.FLOAT_VEC2
    },
    a_normal: {
      name: 'a_normal',
      semantic: 'NORMAL',
      type: DataType.FLOAT_VEC3
    },
    a_color: {
      name: 'a_color',
      semantic: 'COLOR',
      type: DataType.FLOAT_VEC3
    },
    a_uv: {
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    matModelView: {
      name: 'matModelView',
      semantic: UniformSemantic.MODELVIEW,
      type: DataType.FLOAT_MAT4,
    },
    u_diffuseMap : {
      name: 'u_diffuseMap',
      type: DataType.SAMPLER_2D
    },
    u_cubemap: {
      name: 'u_cubemap',
      type: DataType.SAMPLER_CUBE
    },
    u_glossiness : {
      name: 'u_glossiness',
      type: DataType.FLOAT
    },
    u_highlightMap: {
      name: 'u_highlightMap',
      type: DataType.SAMPLER_2D,
    }
  },
});

export class SkyMaterial extends Material {
  constructor(name, color1=vec3.fromValues(0.0,0.0,0.0), color2=vec3.fromValues(0.0,0.05,0.1)) {
    super(name);

    let tech = new RenderTechnique('buildingRendering4Fun');
    tech.isValid = true;
    tech.vertexShader = SkyMaterial.vertexShader;
    tech.fragmentShader = SkyMaterial.fragmentShader;
    tech.attributes = SkyMaterial.attributes;
    tech.uniforms = { ...SkyMaterial.uniforms };
    tech.states = {
      functions: {
        frontFace: FrontFace.CW
      }
    };
    this._technique = tech;

    this.color1 = color1;
    this.color2 = color2;
    this.exponent = 2.0;
    this.intensity = 1.0;
    this.cubemap = null;
  }
  prepareDrawing(camera, component, primitive) {
    this.setValue('u_color1', this.color1);
    this.setValue('u_color2', this.color2);
    this.setValue('u_intensity', this.intensity);
    this.setValue('u_exponent', this.exponent);
    this.setValue('u_cubemap', this.cubemap);
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(SkyMaterial, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec2 a_uv;
  attribute vec3 a_position;
  attribute vec3 a_color;

  uniform mat4 matModelViewProjection;
  varying vec3 v_pos;
  varying vec2 v_uv;

  void main() {
    v_uv = a_uv;
    v_pos = a_position;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }`,

  fragmentShader: `
  precision mediump float;
  precision mediump int;

  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform float u_exponent;
  uniform float u_intensity;
  uniform samplerCube u_cubemap;

  varying vec2 v_uv;
  varying vec3 v_pos;

  void main() {
    float d = 1.0-(v_uv.y-0.5)*2.0;
    d = d*d + 0.5;
    // gl_FragColor.rgb = mix(u_color1, u_color2, pow(d, u_exponent)) * u_intensity;
    gl_FragColor.rgb = textureCube(u_cubemap, normalize(normalize(v_pos)*vec3(1.0,1.0,1.0))).rgb;
    gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.rgb * 0.45;
    gl_FragColor.a = 1.0;
  }`,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_uv: {
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    u_color1: {
      name: 'u_color1',
      type: DataType.FLOAT_VEC3
    },
    u_color2: {
      name: 'u_color2',
      type: DataType.FLOAT_VEC3
    },
    u_exponent: {
      name: 'u_exponent',
      type: DataType.FLOAT
    },
    u_intensity: {
      name: 'u_intensity',
      type: DataType.FLOAT
    },
    u_cubemap: {
      name: 'u_cubemap',
      type: DataType.SAMPLER_CUBE
    }
  }
});


export class BillboardMaterial extends Material {
  constructor(name, color1=vec3.fromValues(0.0,0.0,0.0), color2=vec3.fromValues(0.0,0.05,0.1)) {
    super(name);

    let tech = new RenderTechnique('buildingRendering4Fun');
    tech.isValid = true;
    tech.vertexShader = BillboardMaterial.vertexShader;
    tech.fragmentShader = BillboardMaterial.fragmentShader;
    tech.attributes = BillboardMaterial.attributes;
    tech.uniforms = { ...BillboardMaterial.uniforms };
    tech.states = {
      functions: {
        frontFace: FrontFace.CW
      }
    };
    this._technique = tech;
  }
  prepareDrawing(camera, component, primitive) {
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(BillboardMaterial, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec2 a_uv;
  attribute vec3 a_position; 
  attribute vec3 a_color;

  uniform mat4 matModelViewProjection;
  varying vec2 v_uv;

  void main() {
    v_uv = a_uv;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }`,

  fragmentShader: `
  /*
  http://www.iquilezles.org/www/articles/palettes/palettes.htm
  */

  uniform float u_time;
  varying vec2  v_uv;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
  {
    return a + b*cos( 6.28318*(c*t+d) );
  }

  void main()
  {
    gl_FragColor.rgb = 0.8*pal((v_uv.x+u_time/3.0), vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67));
    gl_FragColor /= 2.1;
    gl_FragColor += 0.45;
    gl_FragColor.a = 1.0;
  }
  `,

  // https://www.shadertoy.com/view/Mt3cWr
  __fragmentShader: `
  precision mediump float;
  precision mediump int;

  uniform float u_time;
  varying vec2 v_uv;
  
  void main() {
    float t = u_time, k;
    vec2 u = v_uv+0.1, v;
    vec3 c;
    for (int i = 0; i < 3; i++) {
        t += .1;
        k = 1. / length(u.x);
        v = u * k + vec2(k + t, 0.);
        c[i] = (1. - cos(u.x * 9.)) *
                cos(v.y * 9.) *
                sin(v.x * 9.);
    }
    gl_FragColor = vec4(c, 1.);
  }`,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_normal: {
      name: 'a_normal',
      semantic: 'NORMAL',
      type: DataType.FLOAT_VEC3
    },
    a_uv: {
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    u_time: {
      name: 'u_time',
      semantic: UniformSemantic.TIME,
      type: DataType.FLOAT,
    }
  }
});

export class RoadMaterial extends Material {
  constructor(name, color1=vec3.fromValues(0.0,0.0,0.0), color2=vec3.fromValues(0.0,0.05,0.1)) {
    super(name);

    let tech = new RenderTechnique('buildingRendering4Fun');
    tech.isValid = true;
    tech.vertexShader = RoadMaterial.vertexShader;
    tech.fragmentShader = RoadMaterial.fragmentShader;
    tech.attributes = RoadMaterial.attributes;
    tech.uniforms = { ...RoadMaterial.uniforms };
    tech.states = {
      disable: [
        RenderState.CULL_FACE
      ]
    };
    this._technique = tech;
    this.highlightMap = null;
  }
  prepareDrawing(camera, component, primitive) {
    if (this.highlightMap != null) {
      this.setValue('u_highlightMap', this.highlightMap);
    }
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(RoadMaterial, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec3 a_position;
  varying vec4 v_highlight;

  uniform mat4 matModelViewProjection;
  uniform mat4 u_modelMat;
  uniform sampler2D u_highlightMap;

  void main() {
    vec3 worldSpacePos = (u_modelMat * vec4(a_position, 1.0)).xyz;
    vec2 uvHighlight = (worldSpacePos.xz+400.0) / 800.0;
    v_highlight = texture2D(u_highlightMap, uvHighlight);
    vec3 offset = vec3(0.0, v_highlight.a, 0.0);
    gl_Position = matModelViewProjection * vec4(a_position+offset, 1.0);
  }`,

  fragmentShader: `
  uniform float u_time;

  varying vec4 v_highlight;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
  {
    return a + b*cos( 6.28318*(c*t+d) );
  }

  void main()
  {
    // gl_FragColor.rgb = 0.8*pal((v_uv.x+u_time/3.0), vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67));
    // gl_FragColor /= 2.1;
    // gl_FragColor += 0.45;
    gl_FragColor.rgb = vec3(1.0, 0.8, 0.4);
    if( length(v_highlight.rgb)>0.4 )
      gl_FragColor.rgb = vec3(0.8, 0.8, 1.0);
    gl_FragColor.a = 1.0;
  } `,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    u_time: {
      name: 'u_time',
      semantic: UniformSemantic.TIME,
      type: DataType.FLOAT,
    },
    u_highlightMap: {
      name: 'u_highlightMap',
      type: DataType.SAMPLER_2D,
    }
  }
});

////////////////////////////////////////////

export class TopMaterial extends Material {
  constructor(name, color1=vec3.fromValues(0.0,0.0,0.0), color2=vec3.fromValues(0.0,0.05,0.1)) {
    super(name);

    let tech = new RenderTechnique('top-technique');
    tech.isValid = true;
    tech.vertexShader = TopMaterial.vertexShader;
    tech.fragmentShader = TopMaterial.fragmentShader;
    tech.attributes = TopMaterial.attributes;
    tech.uniforms = { ...TopMaterial.uniforms };
    tech.states = {
      disable: [
        RenderState.CULL_FACE
      ]
    };
    this._technique = tech;
    this.highlightMap = null;
  }
  prepareDrawing(camera, component, primitive) {
    if (this.highlightMap != null) {
      this.setValue('u_highlightMap', this.highlightMap);
    }
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(TopMaterial, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec2 a_uv;
  attribute vec2 a_center;
  attribute vec3 a_position;
  varying vec4 v_highlight;

  uniform mat4 matModelViewProjection;
  uniform mat4 u_modelMat;
  uniform sampler2D u_highlightMap;

  void main() {
    vec3 worldSpacePos = (u_modelMat * vec4(a_center.x, 0.0, a_center.y, 1.0)).xyz;
    vec2 uvHighlight = (worldSpacePos.xz+400.0) / 800.0;
    v_highlight = texture2D(u_highlightMap, uvHighlight);
    vec3 offset = vec3(0.0, v_highlight.a, 0.0)*5.0;
    gl_Position = matModelViewProjection * vec4(a_position+offset, 1.0);
  }`,

  fragmentShader: `
  uniform float u_time;

  varying vec4 v_highlight;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
  {
    return a + b*cos( 6.28318*(c*t+d) );
  }

  void main()
  {
    // gl_FragColor.rgb = 0.8*pal((v_uv.x+u_time/3.0), vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67));
    // gl_FragColor /= 2.1;
    // gl_FragColor += 0.45;
    gl_FragColor.rgb = v_highlight.rgb*v_highlight.rgb*0.4;
    gl_FragColor.a = 1.0;
  } `,

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_center: {
      name: 'a_center',
      semantic: 'TEXCOORD_1',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    matModelViewProjection: {
      name: 'matModelViewProjection',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    u_time: {
      name: 'u_time',
      semantic: UniformSemantic.TIME,
      type: DataType.FLOAT,
    },
    u_highlightMap: {
      name: 'u_highlightMap',
      type: DataType.SAMPLER_2D,
    }
  }
});

////////////////////////////////////////////////////////////

export  function createBuildingMaterialWireFrame(loader) {
  console.log('create building material');

  let newMtl = new Material('building_wireframe_mtl');
  newMtl.technique = requireBuildingWireFrameTechnique(loader);
  const RENDER_STATES = {
    disable: [
      RenderState.CULL_FACE
    ]
  };

  newMtl.technique.states = RENDER_STATES;
  return newMtl;
}

function requireBuildingWireFrameTechnique(loader) {
  /** Technique 对象的资源名称 */
  console.log('building wire frame tech');
  const TECH_NAME = 'building_wireframe_tech';

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position; 
  attribute vec3 a_color;    
  attribute vec3 a_barycentric;

  uniform mat4 matModelViewProjection;

  varying vec3 v_color;
  varying vec3 v_bc;

  void main() {
    v_color = a_color;
    v_bc = a_barycentric;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  varying vec3 v_color;
  varying vec3 v_bc;


  void main() {
    if(any(lessThan(v_bc, vec3(0.02)))){
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
    else{
      gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
    }
  }
  `;

  const TECH_CONFIG = {
    name: TECH_NAME,
    attributes: {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      },
      a_color: {
        name: 'a_color',
        semantic: 'COLOR',
        type: DataType.FLOAT_VEC3
      },
      a_barycentric:{
        name: 'a_barycentric',
        semantic: 'BARYCENTRIC',
        type:DataType.FLOAT_VEC3
      }
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      }
    },
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
