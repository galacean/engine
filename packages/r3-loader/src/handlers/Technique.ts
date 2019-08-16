import {UniformSemantic} from '@alipay/r3-base';
import {RenderTechnique} from '@alipay/r3-material';
import {Request, Prop, HandlerCb} from '../type';
import {Resource} from '../Resource';

/**
 * @private
 */
function b64DecodeUnicode(rstr: string): string {

  const str = rstr.replace(/data:.+?,/, '');
  // Going backwards: from bytestream, to percent-encoding, to original string.
  return decodeURIComponent(atob(str).split('').map(function (c) {

    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);

  }).join(''));

}

/**
 * @private
 */
export function openTechnique(cfg: Prop, vertexShader: string, fragmentShader: string): RenderTechnique {

  const tech = new RenderTechnique(cfg.name);

  let attributes = {};
  let uniforms = {};

  if ('parameters' in cfg) {

    /* 使用paramter数组，查找attribute和unifrom
        "parameters": {
          "position": {
            "semantic": "POSITION",
            "type": 35665
          },
          .....
        }
    */
    attributes = _parseAttributesParam(cfg);
    uniforms = _parseUniformParam(cfg);

  }
  else {

    attributes = cfg.attributes;
    uniforms = cfg.uniforms;

  }

  // states
  if ('states' in cfg) {

    tech.states = cfg.states;

  }

  //--
  tech.vertexShader = vertexShader;
  tech.fragmentShader = fragmentShader;
  tech.attributes = attributes;
  tech.uniforms = uniforms;
  tech.isValid = true;

  return tech;

}

/**
 * 从 glTF 1.0 标准的 parameters 数组中读取 attributes 数组
 * @param {object} cfg
 * @private
 */
function _parseAttributesParam(cfg: Prop): Prop {

  const attributes = {};
  const parameters = cfg.parameters;

  for (const name in cfg.attributes) {

    const paramName = cfg.attributes[name];
    attributes[name] = parameters[paramName];
    attributes[name].name = name;
    attributes[name].paramName = paramName;

  }

  return attributes;

}

/**
 * 从 glTF 1.0 标准的 parameters 数组中读取 uniforms 数组
 * @param {object} cfg
 * @private
 */
function _parseUniformParam(cfg: Prop): Prop {

  const uniforms = {};
  const parameters = cfg.parameters;

  // uniforms
  for (const name in cfg.uniforms) {

    const paramName = cfg.uniforms[name];
    uniforms[name] = parameters[paramName];
    uniforms[name].name = name;
    uniforms[name].paramName = paramName;

    const semantic = uniforms[name].semantic;
    if (UniformSemantic[semantic])
      uniforms[name].semantic = UniformSemantic[semantic];

  }

  return uniforms;

}

/**
 * @private
 */
export class TechniqueHandler {

  load(request: Request, props: Prop, callback: HandlerCb) {

    request.load('json', props, function (err, json) {

      if (!err) {

        callback(null, json);
        // analyse json to load shader file

      } else {

        callback('Error loading Texture from ' + props.url);

      }

    });

  }

  open(resource: Resource) {

    const configJSON = resource.data || {};

    const assets = [];

    // load technique shortcut
    if (configJSON.hasOwnProperty('technique')
      && configJSON.hasOwnProperty('fragmentShader')
      && configJSON.hasOwnProperty('vertexShader')) {

      const tech = openTechnique(configJSON.technique, configJSON.vertexShader, configJSON.fragmentShader);
      tech.type = resource.assetType;

      assets.push(tech);

    } else {

      // loop through technique
      configJSON.techniques && configJSON.techniques.forEach(technique => {

        const program = configJSON.programs[technique.program];

        // FIXME: ignore attributes?
        // TODO: parse online shader
        const vertCode = b64DecodeUnicode(configJSON.shaders[program.vertexShader].uri);
        const fragCode = b64DecodeUnicode(configJSON.shaders[program.fragmentShader].uri);

        const tech = openTechnique(technique, vertCode, fragCode);
        tech.type = resource.assetType;

        assets.push(tech);

      });

    }

    resource.assets = assets;

  }

}
