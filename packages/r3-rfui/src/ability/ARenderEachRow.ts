'use strict';
import { NodeAbility } from '@alipay/r3-core';

export class ARenderEachRow extends NodeAbility {

  public geometry;
  public hCount;
  public vCount;
  public index;
  public vIndexList;
  public speed;
  private _time;

  constructor( node, props ) {

    super( node );
    this.geometry = props.geometry;
    this.vCount = this.geometry._parameters.verticalSegments;
    this.hCount = this.geometry._parameters.horizontalSegments;
    this.index = this.geometry.getAllIndex().slice( 0 );
    this.vIndexList = [];
    for( let i = 0; i < this.vCount; i++ ) {

      this.vIndexList.push( this.index.slice( this.hCount * 6 * i, this.hCount * 6 * ( i + 1 ) ) );

    }

    this._time = 0;
    this.speed = 10;
    this['switch'] = false;
    this.geometry.setAllIndex( this.index.slice( 0 ).fill( 0 ) );

  }

  update( deltaTime ) {

    if( this['switch'] ) {

      this._time += deltaTime / 1000;
      this.setValues();

    }

  }

  start() {

    this['switch'] = true;
    this._time = 0;

  }

  stop() {

    this['switch'] = false;

  }

  setValues() {

    let index = [];

    const count = Math.floor( this._time * this.speed ) % ( this.index.length / 6 ) + 1;
    const y = this.vCount - Math.ceil( count / this.hCount );
    const x = ( count - 1 ) % ( this.hCount );
    const vIndexList = [];
    for( let i = 0; i < this.vCount; i++ ) {

      if( i < y ) {

        vIndexList[i] = this.vIndexList[i].slice( 0 ).fill( 0 );

      } else if( i === y ){

        vIndexList[i] = this.vIndexList[i].slice( 0 ).fill( 0, x * 6 );

      } else {

        vIndexList[i] = this.vIndexList[i].slice( 0 );

      }

    }

    vIndexList.forEach( ( vIndex ) => {

      index = concatenate( Uint16Array, index, vIndex );

    } );

    this.geometry.setAllIndex( index );
    if( y === 0 && x === ( this.hCount - 1 ) ){

      this.stop();

    }

  }

}

function concatenate( resultConstructor, ...arrays ) {

  let totalLength = 0;
  for ( const arr of arrays ) {

    totalLength += arr.length;

  }
  const result = new resultConstructor( totalLength );
  let offset = 0;
  for ( const arr of arrays ) {

    result.set( arr, offset );
    offset += arr.length;

  }
  return result;

}
