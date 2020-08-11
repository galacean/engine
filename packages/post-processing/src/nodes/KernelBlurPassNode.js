import { DataType, RenderState } from '@alipay/o3-core';
import { Vector2 } from '@alipay/o3-math';
import { PostEffectNode } from '../PostEffectNode';
import { Material, RenderTechnique } from '@alipay/o3-material';

const SHADER_CONFIG = {

  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    u_delta: {
      name: 'u_delta',
      type: DataType.FLOAT_VEC2,
    },
  },
  states: {
    disable: [
      RenderState.CULL_FACE,
      RenderState.DEPTH_TEST
    ],
    functions: {
      depthMask: [ false ]
    }
  }

};

/**
 * @private
 */
export class KernelBlurPassNode extends PostEffectNode {

  /**
   * Bloom Reset 版模糊 Pass
   * @private
   */
  constructor( name, renderTarget, parent ) {

    super( name, renderTarget, parent );

    this.direction = [ 1, 0 ];
    this._kernel = 89;
    this._lastKernel = 0;
    this.material = new Material();

  }

  get kernel() {

    return this._kernel;

  }

  set kernel( v ) {

    if( this._lastKernel === v ) return;
    v = Math.max( v, 1 );
    this._lastKernel = v;
    this._kernel = this._nearestBestKernel( v );
    this._needUpdateMaterial = true;

  }

  get direction() {

    return this._direction;

  }

  set direction( v ) {

    this._direction = v;
    const sourceRT = this.getSourceRenderTarget();
    const { width, height } = sourceRT;
    this._delta = new Vector2(1 / width * this._direction[0], 1 / height * this._direction[1]);
    if( this.material )
      this.material.setValue( 'u_delta', this._delta );

  }

  setupMaterial( camera ) {

    if( this._kernel !== this._lastKernel || this._needUpdateMaterial ) {

      this._generateMaterial( camera );
      this._lastKernel = this.kernel;
      this.direction = this.direction;
      this._needUpdateMaterial = false;

    }

    super.setupMaterial( camera );

  }

  _generateMaterial( camera ) {

    const { vertexShader, fragmentShader } = this._generateShader( camera );
    const tech = new RenderTechnique( 'kernel_' + this._kernel );
    tech.isValid = true;
    tech.uniforms = SHADER_CONFIG.uniforms;
    tech.vertexShader = vertexShader;
    tech.fragmentShader = fragmentShader;
    tech.attributes = SHADER_CONFIG.attributes;
    tech.states = SHADER_CONFIG.states;

    this.material = new Material( 'kernel' );
    this.material._technique = tech;

  }

  _nearestBestKernel( idealKernel ) {

    const v = Math.round( idealKernel );
    for ( const k of [ v, v - 1, v + 1, v - 2, v + 2 ] ) {

      if ( ( ( k % 2 ) !== 0 ) && ( ( Math.floor( k / 2 ) % 2 ) === 0 ) && k > 0 ) {

        return Math.max( k, 3 );

      }

    }
    return Math.max( v, 3 );

  }

  _generateShader( camera ) {

    const N = this._kernel;
    const centerIndex = ( N - 1 ) / 2;

    // Generate Gaussian sampling weights over kernel
    let offsets = [];
    let weights = [];
    let totalWeight = 0;
    for ( let i = 0; i < N; i++ ) {

      const u = i / ( N - 1 );
      const w = this._gaussianWeight( u * 2.0 - 1 );
      offsets[i] = ( i - centerIndex );
      weights[i] = w;
      totalWeight += w;

    }

    // Normalize weights
    for ( let i = 0; i < weights.length; i++ ) {

      weights[i] /= totalWeight;

    }

    // Walk from left to center, combining pairs (symmetrically)
    const linearSamplingWeights = [];
    const linearSamplingOffsets = [];

    const linearSamplingMap = [];

    for ( let i = 0; i <= centerIndex; i += 2 ) {

      const j = Math.min( i + 1, Math.floor( centerIndex ) );

      const singleCenterSample = i === j;

      if ( singleCenterSample ) {

        linearSamplingMap.push( { o: offsets[i], w: weights[i] } );

      } else {

        const sharedCell = j === centerIndex;

        const weightLinear = ( weights[i] + weights[j] * ( sharedCell ? .5 : 1. ) );
        const offsetLinear = offsets[i] + 1 / ( 1 + weights[i] / weights[j] );

        if ( offsetLinear === 0 ) {

          linearSamplingMap.push( { o: offsets[i], w: weights[i] } );
          linearSamplingMap.push( { o: offsets[i + 1], w: weights[i + 1] } );

        } else {

          linearSamplingMap.push( { o: offsetLinear, w: weightLinear } );
          linearSamplingMap.push( { o: -offsetLinear, w: weightLinear } );

        }

      }

    }

    for ( let i = 0; i < linearSamplingMap.length; i++ ) {

      linearSamplingOffsets[i] = linearSamplingMap[i].o;
      linearSamplingWeights[i] = linearSamplingMap[i].w;

    }

    // Replace with optimized
    offsets = linearSamplingOffsets;
    weights = linearSamplingWeights;

    // generate
    const gl = camera.renderHardware.gl;
    const maxVaryingRows = gl.getParameter( gl.MAX_VARYING_VECTORS );
    const freeVaryingVec2 = Math.max( maxVaryingRows, 0. ) - 1; // Because of sampleCenter

    const varyingCount = Math.min( offsets.length, freeVaryingVec2 );
    let defines = '';
    for ( let i = 0; i < varyingCount; i++ ) {

      defines += `#define KERNEL_OFFSET${i} ${this._glslFloat( offsets[i] )}\r\n`;
      defines += `#define KERNEL_WEIGHT${i} ${this._glslFloat( weights[i] )}\r\n`;

    }
    let depCount = 0;
    for ( let i = freeVaryingVec2; i < offsets.length; i++ ) {

      defines += `#define KERNEL_DEP_OFFSET${depCount} ${this._glslFloat( offsets[i] )}\r\n`;
      defines += `#define KERNEL_DEP_WEIGHT${depCount} ${this._glslFloat( weights[i] )}\r\n`;
      depCount++;

    }

    let varyings = 'varying vec2 v_sampleCenter;\r\n';
    for( let i = 0; i < varyingCount; i ++ )
      varyings += `varying vec2 v_sampleCoord${i};\r\n`;

    let vertexShader = defines + `precision highp float;
attribute vec2 a_position;
uniform vec2 u_delta;
` + varyings + `const vec2 madd = vec2(0.5, 0.5);

void main() {

    v_sampleCenter  = a_position * madd + madd;
`;

    for( let i = 0; i < varyingCount; i ++ )
      vertexShader += `    v_sampleCoord${i} = v_sampleCenter + u_delta * KERNEL_OFFSET${i};\r\n`;
    vertexShader += `
    gl_Position = vec4( a_position, 0.0, 1.0 );

}
`;

    let fragmentShader = defines + `
precision highp float;

uniform sampler2D s_sourceRT;
uniform vec2 u_delta;
` + varyings + `
void main() {

    vec4 blend = vec4(0.0);
`;
    for( let i = 0; i < varyingCount; i ++ )
      fragmentShader += `    blend += texture2D( s_sourceRT, v_sampleCoord${i} ) * KERNEL_WEIGHT${i};\r\n`;

    depCount = 0;
    for ( let i = freeVaryingVec2; i < offsets.length; i++ ) {

      fragmentShader += `blend += texture2D( s_sourceRT, v_sampleCenter + u_delta * KERNEL_DEP_OFFSET${depCount} ) * KERNEL_DEP_WEIGHT${depCount};\r\n`;
      depCount++;

    }

    fragmentShader += `
    gl_FragColor = blend;

}
`;

    return { vertexShader, fragmentShader };

  }

  _gaussianWeight( x ) {

    //reference: Engine/ImageProcessingBlur.cpp #dcc760
    // We are evaluating the Gaussian (normal) distribution over a kernel parameter space of [-1,1],
    // so we truncate at three standard deviations by setting stddev (sigma) to 1/3.
    // The choice of 3-sigma truncation is common but arbitrary, and means that the signal is
    // truncated at around 1.3% of peak strength.
    //the distribution is scaled to account for the difference between the actual kernel size and the requested kernel size
    const sigma = ( 1 / 3 );
    const denominator = Math.sqrt( 2.0 * Math.PI ) * sigma;
    const exponent = -( ( x * x ) / ( 2.0 * sigma * sigma ) );
    const weight = ( 1.0 / denominator ) * Math.exp( exponent );
    return weight;

  }

  _glslFloat( x, decimalFigures = 8 ) {

    return x.toFixed( decimalFigures ).replace( /0+$/, '' );

  }

}
