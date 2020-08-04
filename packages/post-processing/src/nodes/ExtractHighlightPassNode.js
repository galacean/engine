import { DataType } from '@alipay/o3-core';
import { PostEffectNode } from '../PostEffectNode';
import fs from '../shaders/ExtractHighlight.glsl';

const SHADER_CONFIG = {

  source: fs,
  uniforms: {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    u_exposure: {
      name: 'u_exposure',
      type: DataType.FLOAT,
    },
    u_threshold: {
      name: 'u_threshold',
      type: DataType.FLOAT
    }
  }

};

/**
 * @private
 */
export class ExtractHighlightPassNode extends PostEffectNode {

  /**
   * Bloom Reset 版高光提取 Pass
   * @private
   */
  constructor( name, renderTarget, parent ) {

    super( name, renderTarget, parent, SHADER_CONFIG );

    this.exposure = 0.8;
    this.threshold = 0.7;

  }

  get exposure() {

    return this._exposure;

  }

  set exposure( v ) {

    this._exposure = v;
    this.material.setValue( 'u_exposure', this._exposure );

  }

  get threshold() {

    return this._threshold;

  }

  set threshold( v ) {

    this._threshold = v;
    this.material.setValue( 'u_threshold', this._threshold );

  }

}
