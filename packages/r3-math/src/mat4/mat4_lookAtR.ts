import { EPSILON } from '../MathUtil/MathUtil_EPSILON';
import { normalize } from '../vec3/vec3_normalize';
import { subtract } from '../vec3/vec3_subtract';
import { create } from '../vec3/vec3_create';
import { length } from '../vec3/vec3_length';
import { cross } from '../vec3/vec3_cross';

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */

const xAxis = create();
const yAxis = create();
const zAxis = create();
const makeSafe = create();

export function lookAtR( out, eye, target, up ) {

  subtract( zAxis, target, eye );
  if ( length( zAxis ) === 0 )
    zAxis[2] = 1;

  normalize( zAxis, zAxis );
  // make safe
  const l = length( subtract( makeSafe, normalize( up, up ), zAxis ) );
  if( l === 0  || l === 2 ) {

    zAxis[2] += EPSILON;
    normalize( zAxis, zAxis );

  }
  normalize( xAxis, cross( xAxis, up, zAxis ) );
  normalize( yAxis, cross( yAxis, zAxis, xAxis ) );

  out[ 0] = xAxis[0];
  out[ 1] = xAxis[1];
  out[ 2] = xAxis[2];
  out[ 3] = 0;
  out[ 4] = yAxis[0];
  out[ 5] = yAxis[1];
  out[ 6] = yAxis[2];
  out[ 7] = 0;
  out[ 8] = zAxis[0];
  out[ 9] = zAxis[1];
  out[10] = zAxis[2];
  out[11] = 0;
  out[12] = eye[0];
  out[13] = eye[1];
  out[14] = eye[2];
  out[15] = 1;

  return out;

}
