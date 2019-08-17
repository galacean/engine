'use strict';

import { NodeAbility } from '@alipay/o3-core';

export default class AIndexUpdate extends NodeAbility {
  constructor(node, props) {
    super(node);
    this.geometry = props.geometry;
    this.vCount = this.geometry._parameters.verticalSegments;
    this.hCount = this.geometry._parameters.horizontalSegments;
    this.index = this.geometry.getAllIndex().slice(0);
    this.vIndexList = [];
    for(let i = 0; i < this.vCount; i++ ) {
      this.vIndexList.push(this.index.slice(this.hCount * 6 * i, this.hCount * 6 * (i+1)));
    }

    this._time = 0;
  }

  update(deltaTime) {
    this._time += deltaTime / 50;
    this.setValues();
  }

  setValues() {
    const geometry = this.geometry;
    let index =[];

    const count = Math.floor(this._time) % (this.index.length / 6) + 1;
    let y = this.vCount - Math.ceil(count / this.hCount);
    let x = (count - 1) % (this.hCount);
    let vIndexList = []
    for(let i = 0; i < this.vCount; i++) {
      if(i < y) {
        vIndexList[i] = this.vIndexList[i].slice(0).fill(0);
      } else if(i === y){
        vIndexList[i] = this.vIndexList[i].slice(0).fill(0, x * 6);
      } else {
        vIndexList[i] = this.vIndexList[i].slice(0);
      }
    }
    if(y === 0 && x === (this.hCount-1)){
      console.log(x)
    }

    vIndexList.forEach((vIndex) => {
      index = concatenate(Uint16Array,index, vIndex);
    });

    this.geometry.setAllIndex(index);
  }


}

function concatenate(resultConstructor, ...arrays) {
  let totalLength = 0;
  for (let arr of arrays) {
    totalLength += arr.length;
  }
  let result = new resultConstructor(totalLength);
  let offset = 0;
  for (let arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
