import { DataType } from '@alipay/r3-base';
import { PostEffectNode } from '../PostEffectNode';
import fs from '../shaders/BloomMerge.glsl';

const SHADER_CONFIG = {

  source: fs,
  uniforms: {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    u_blurSampler: {
      name: 'u_blurSampler',
      type: DataType.SAMPLER_2D,
    },
    u_weight: {
      name: 'u_weight',
      type: DataType.FLOAT,
    },
    u_tintColor: {
      name: 'u_tintColor',
      type: DataType.FLOAT_VEC3,
    }
  }

};

/**
 * @private
 */
export class BloomMergePassNode extends PostEffectNode {

  /**
   * Bloom Reset 版合并图层 Pass
   * @private
   */
  constructor( name, renderTarget, parent ) {

    super( name, renderTarget, parent, SHADER_CONFIG );

    this.weight = 0.8;
    this.tintColor = [ 1, 1, 1 ];

  }

  get weight() {

    return this._weight;

  }

  set weight( v ) {

    this._weight = v;
    this.material.setValue( 'u_weight', this._weight );

  }

  get tintColor() {

    return this._tintCorlor;

  }

  set tintColor( v ) {

    this._tintCorlor = v;
    this.material.setValue( 'u_tintColor', this._tintCorlor );

  }

  setBlurRenderTarget( rt ) {

    this.material.setValue( 'u_blurSampler', rt.texture );

  }

}
