import { Tween, doTransform } from '@alipay/r3-tween';
import { Engine, EngineFeature } from '@alipay/r3-core';
import { DataType } from '@alipay/r3-base';

export const tween = new Tween();

class TweenFeature extends EngineFeature {

  preTick( engine, currentScene ) {

    tween.update( engine._time._deltaTime );

  }

}

Engine.registerFeature( TweenFeature );

const defaultParam = {
  duration: 300
};

export function translate( node, position, param ) {

  return doTransform.Translate( node, position, param.duration || defaultParam.duration, param ).start( tween );

}

export function scale( node, scale, param ) {

  return doTransform.Scale( node, scale, param.duration || defaultParam.duration, param ).start( tween );

}

export function rotate( node, rotation, param ) {

  return doTransform.Rotate( node, rotation, param.duration || defaultParam.duration, param ).start( tween );

}

export function fade( start, setter, end, param ) {

  return doTransform.DataType( start, setter, end, param.duration || defaultParam.duration, param ).start( tween );

}

export function slide( start, setter, end, param ) {

  param.dataType = DataType.FLOAT_VEC2;
  return doTransform.DataType( start, setter, end, param.duration || defaultParam.duration, param ).start( tween );

}
