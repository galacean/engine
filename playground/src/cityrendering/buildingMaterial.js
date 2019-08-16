import { UniformSemantic, DataType,RenderState } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';
import { Resource } from '@alipay/r3-loader';

export class BuildingMaterial4Fun extends Material {
  constructor(name, diffuseMap=null) {
    super(name);

    let tech = new RenderTechnique('buildingRendering4Fun');
    tech.isValid = true;
    tech.vertexShader = BuildingMaterial4Fun.vertexShader;
    tech.fragmentShader = BuildingMaterial4Fun.fragmentShader;
    tech.attributes = BuildingMaterial4Fun.attributes;
    tech.uniforms = { ...BuildingMaterial4Fun.uniforms };
    tech.states = {
      disable: [RenderState.CULL_FACE]
    }
    this._technique = tech;

    this.diffuseMap = diffuseMap;
    
  }
  prepareDrawing(camera, component, primitive) {
    this.setValue('u_diffuseMap', this.diffuseMap)
    super.prepareDrawing(camera, component, primitive);
  }
};

Object.assign(BuildingMaterial4Fun, {
  vertexShader: `
  precision highp float;
  precision highp int;

  attribute vec2 a_uv;
  attribute vec3 a_position; 
  attribute vec3 a_color;    

  uniform mat4 matModelViewProjection;
  uniform mat4 matModelView;

  varying vec2 v_uv;
  varying vec3 v_color;
  varying float v_height;
  varying float v_cameraDistance;

  void main() {
    v_uv = a_uv;
    v_color = a_color;
    v_height = a_position.y;
    vec4 cameraSpacePos = matModelView * vec4(a_position, 1.0);
    v_cameraDistance = cameraSpacePos.z;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }`,

  fragmentShader: `
  precision mediump float;
  precision mediump int;

  uniform sampler2D u_diffuseMap;

  varying vec2 v_uv;
  varying vec3 v_color;
  varying float v_height;
  varying float v_cameraDistance;
  
  void main() {
    float darken = clamp((3.5-v_height)/2.0, 0.5, 1.2) + 0.3 - v_cameraDistance/100.0;
    gl_FragColor = texture2D(u_diffuseMap, vec2(v_uv.x/2.0, v_height/7.0)) * darken;
    gl_FragColor.a = 1.0;
    // gl_FragColor = vec4(vec3(1.0,1.0,1.0)*darken, 1.0);
  }`,

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
    }
  },
  renderStates: {
    disable: [RenderState.CULL_FACE]
  }
});

export default function createBuildingMaterial(loader) {
  let newMtl = new Material('building_mtl');
  newMtl.technique = requireBuildingTechnique(loader);
  const RENDER_STATES = {
    disable: [
      RenderState.CULL_FACE
    ]
  };

  newMtl.technique.states = RENDER_STATES;
  return newMtl;
}

function requireBuildingTechnique(loader) {
  /** Technique 对象的资源名称 */
  const TECH_NAME = 'building_tech';

  //-- 创建一个新的 Technique
  const VERT_SHADER = `
  precision highp float;
  precision highp int;

  attribute vec3 a_position; 
  attribute vec3 a_color;    

  uniform mat4 matModelViewProjection;

  varying vec3 v_color;

  void main() {
    v_color = a_color;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
  `;

  const FRAG_SHADER = `
  precision mediump float;
  precision mediump int;

  varying vec3 v_color;
  
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
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
    },
    uniforms: {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
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
