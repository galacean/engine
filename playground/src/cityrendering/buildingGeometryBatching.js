import { vec3,vec4} from '@alipay/r3-math';
import { BufferUsage } from '@alipay/r3-base';
import { IndexBufferGeometry,BufferGeometry} from '@alipay/r3-geometry';
import '@alipay/r3-engine-stats';
import { DataType } from '@alipay/r3-base';
import {FIXHEIGHT} from './constant';


export default function createBuildingGeometryBatching(cityMap){
  let buildingNumber = cityMap.features.length;

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;
    //non-top faces + top face
    let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
    let modebase = 2*vertexNumber;

    //fill in index value，set up the non-top faces
    for(let j = 0;j < vertexNumber; ++j){
      indexValues[6*j] = 2*j + vertexNumberSum;
      indexValues[6*j + 1] = (2*j + 2)%(modebase) + vertexNumberSum;
      indexValues[6*j + 2] = 2*j + 1 + vertexNumberSum;
      indexValues[6*j + 3] = 2*j + 1 + vertexNumberSum;
      indexValues[6*j + 4] = (2*j + 2)%(modebase) + vertexNumberSum;
      indexValues[6*j + 5] = (2*j + 3)%(modebase) + vertexNumberSum;
    }

    //set up the top face
    let offset = 6 * vertexNumber;
    for (let j = 0; j < vertexNumber - 2; ++j) {
      indexValues[offset + 3 * j] = 2 * vertexNumber - 1 + vertexNumberSum;
      indexValues[offset + 3 * j + 1] = 2 * j + 3 + vertexNumberSum;
      indexValues[offset + 3 * j + 2] = 2 * j + 1 + vertexNumberSum;
    }

    indexValuesGroup = indexValuesGroup.concat(indexValues);

    for(let j = 0;j < 2 * vertexNumber; ++j){
      let s = Math.floor(j/2);
      var values = {
        'POSITION':[coords[s][0],coords[s][1],floorNumber * (j%2) * FIXHEIGHT],
        'COLOR':[1,0,0]
      }
      vertexArray.push(values);
    }

    //-- calculate the sum of vertex number
    vertexNumberSum += 2*vertexNumber;
  }

  let geometry = new IndexBufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], vertexNumberSum, indexValuesGroup, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;

}

//-- vec3 init from array
function vec3Init(a_in){
  return vec3.fromValues(a_in[0],a_in[1],a_in[2]);
}

export function createBuildingGeometryBatchingSmoothNormal(cityMap){
  let buildingNumber = cityMap.features.length;

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;
    //non-top faces + top face
    let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
    let modebase = 2*vertexNumber;

    //fill in index value，set up the non-top faces
    for(let j = 0;j < vertexNumber; ++j){
      indexValues[6*j] = 2*j + vertexNumberSum;
      indexValues[6*j + 1] = (2*j + 2)%(modebase) + vertexNumberSum;
      indexValues[6*j + 2] = 2*j + 1 + vertexNumberSum;
      indexValues[6*j + 3] = 2*j + 1 + vertexNumberSum;
      indexValues[6*j + 4] = (2*j + 2)%(modebase) + vertexNumberSum;
      indexValues[6*j + 5] = (2*j + 3)%(modebase) + vertexNumberSum;
    }

    //set up the top face
    let offset = 6 * vertexNumber;
    for (let j = 0; j < vertexNumber - 2; ++j) {
      indexValues[offset + 3 * j] = 2 * vertexNumber - 1 + vertexNumberSum;
      indexValues[offset + 3 * j + 1] = 2 * j + 3 + vertexNumberSum;
      indexValues[offset + 3 * j + 2] = 2 * j + 1 + vertexNumberSum;
    }

    indexValuesGroup = indexValuesGroup.concat(indexValues);

    for(let j = 0;j < 2 * vertexNumber; ++j){
      let s = Math.floor(j/2);
      var values = {
        'POSITION':[coords[s][0],coords[s][1],floorNumber * (j%2) * FIXHEIGHT],
        'COLOR':[1,0,0]
      }
      vertexArray.push(values);
    }

    //-- calculate the sum of vertex number
    vertexNumberSum += 2*vertexNumber;
  }

  let faceNumber = indexValuesGroup.length/3;
  console.log(faceNumber);

  //-- calculate normal
  let normalArray = Array(vertexNumberSum).fill(vec3.create());
  for(let i = 0;i < faceNumber; ++i){

    let i1 = indexValuesGroup[3*i];
    let i2 = indexValuesGroup[3*i + 1];
    let i3 = indexValuesGroup[3*i + 2];

    let v1 = vec3Init(vertexArray[i1]['POSITION']);
    let v2 = vec3Init(vertexArray[i2]['POSITION']);
    let v3 = vec3Init(vertexArray[i3]['POSITION']);

   // console.log(v1 instanceof vec3);
    //console.log();
    let normal = vec3.create();
    let e1 = vec3.create();
    let e2 = vec3.create();
    vec3.subtract(e1,v2,v1);
    vec3.subtract(e2,v3,v1);

    console.log('e1,e2: '+e1 +' '+ e2 );

    vec3.cross(normal, e1, e2);
    console.log('cross product: '+normal );
    vec3.normalize(normal,normal);
    vec3.add(normalArray[i1],normalArray[i1],normal);
    vec3.add(normalArray[i2],normalArray[i2],normal);
    vec3.add(normalArray[i3],normalArray[i3],normal);
  }

  //normalize the normals manually
  for(let i = 0;i < vertexArray.length;++i){
    vec3.normalize(normalArray[i],normalArray[i]);
    console.log(normalArray[i]);
  }

  for(let i = 0;i < vertexArray.length;++i){
    vertexArray[i]['NORMAL'] = normalArray[i];
  }

  let geometry = new IndexBufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'NORMAL', size: 3,type: DataType.FLOAT, normalized: true}
  ], vertexNumberSum, indexValuesGroup, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

//-- normal debug
  for(let i = 0;i < vertexArray.length;++i){

  }

  console.log(geometry);

  return geometry;

}

export function createBuildingGeometryBatchingFlatNormal(cityMap){
  let buildingNumber = cityMap.features.length;

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;
    //non-top faces + top face
    let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
    let modebase = 2*vertexNumber;

    //-- push the non-top face vertex in
    for(let j = 0;j < vertexNumber; ++j){

      let v = Array(6);

      v[0] = vec3.fromValues(coords[j][0], coords[j][1], 0);
      v[1] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[2] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);
      v[3] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[4] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], floorNumber * FIXHEIGHT);
      v[5] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);

      let normal = vec3.create();
      let e1 = vec3.create();
      let e2 = vec3.create();
      vec3.subtract(e1, v[1], v[0]);
      vec3.subtract(e2, v[2], v[0]);
      vec3.cross(normal, e1, e2);
      //console.log('cross product: '+normal );
      vec3.normalize(normal, normal);
      console.log(normal);

      for (let t = 0; t < 6; ++t) {
        var values = {
          'POSITION': v[t],
          'COLOR': [1, 0, 0],
          'NORMAL': normal
        }
        vertexArray.push(values);

      }
    }

    //-- fill in the top face vertex
    var valuesLastVertex = {
      'POSITION':[coords[vertexNumber-1][0],coords[vertexNumber-1][1],floorNumber * FIXHEIGHT],
      'COLOR':[1,0,0],
      'NORMAL':[0,0,1]
    }
    for(let j = 0;j < vertexNumber - 2;++j){

      for(let s = 0; s < 2; ++s){
        var values = {
          'POSITION':[coords[j+s][0],coords[j+s][1],floorNumber * FIXHEIGHT],
          'COLOR':[1,0,0],
          'NORMAL':[0,0,1]
        }
        vertexArray.push(values);
      }
      vertexArray.push(valuesLastVertex);
    }

    //-- calculate the sum of vertex number
    vertexNumberSum += (9*vertexNumber - 6);
  }

  console.log(vertexNumberSum);
  //fill in index value，set up the non-top faces
  for(let j = 0;j < vertexNumberSum; ++j){
    indexValuesGroup[j] = j;
  }

  console.log(indexValuesGroup);
  console.log(vertexArray);

  let geometry = new BufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'NORMAL', size: 3,type: DataType.FLOAT, normalized: true}
  ], vertexNumberSum, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;

}

export function createBuildingGeometryBatchingFlatNormalWireFrame(cityMap){
  let buildingNumber = cityMap.features.length;

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;

  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;
    //non-top faces + top face
    let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
    let modebase = 2*vertexNumber;

    //-- push the non-top face vertex in
    for(let j = 0;j < vertexNumber; ++j){

      let v = Array(6);

      v[0] = vec3.fromValues(coords[j][0], coords[j][1], 0);
      v[1] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[2] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);
      v[3] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[4] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], floorNumber * FIXHEIGHT);
      v[5] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);

      let normal = vec3.create();
      let e1 = vec3.create();
      let e2 = vec3.create();
      vec3.subtract(e1, v[1], v[0]);
      vec3.subtract(e2, v[2], v[0]);
      vec3.cross(normal, e1, e2);
      //console.log('cross product: '+normal );
      vec3.normalize(normal, normal);

      for (let t = 0; t < 6; ++t) {
        var values = {
          'POSITION': v[t],
          'COLOR': [1, 0, 0],
          'NORMAL': normal,
          'BARYCENTRIC':bcArray[t%3]
        }
        vertexArray.push(values);

      }
    }

    //-- fill in the top face vertex
    var valuesLastVertex = {
      'POSITION':[coords[vertexNumber-1][0],coords[vertexNumber-1][1],floorNumber * FIXHEIGHT],
      'COLOR':[1,0,0],
      'NORMAL':[0,0,1],
      'BARYCENTRIC':bcArray[2]
    }
    for(let j = 0;j < vertexNumber - 2;++j){

      for(let s = 0; s < 2; ++s){
        var values = {
          'POSITION':[coords[j+s][0],coords[j+s][1],floorNumber * FIXHEIGHT],
          'COLOR':[1,0,0],
          'NORMAL':[0,0,1],
          'BARYCENTRIC':bcArray[s]
        }
        vertexArray.push(values);
      }
      vertexArray.push(valuesLastVertex);
    }

    //-- calculate the sum of vertex number
    vertexNumberSum += (9*vertexNumber - 6);
  }

  console.log(vertexNumberSum);
  //fill in index value，set up the non-top faces
  for(let j = 0;j < vertexNumberSum; ++j){
    indexValuesGroup[j] = j;
  }


  let geometry = new BufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'NORMAL', size: 3,type: DataType.FLOAT, normalized: true},
    { semantic: 'BARYCENTRIC', size: 3,type: DataType.FLOAT, normalized: false}
  ], vertexNumberSum, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;

}


export function createBuildingGeometryBatchingFlatNormalDelaunator(cityMap){
  let buildingNumber = cityMap.features.length;
  console.log('delaunator');

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;

    //-- push the non-top face vertex in
    for(let j = 0;j < vertexNumber; ++j){

      let v = Array(6);

      v[0] = vec3.fromValues(coords[j][0], coords[j][1], 0);
      v[1] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[2] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);
      v[3] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[4] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], floorNumber * FIXHEIGHT);
      v[5] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);

      let normal = vec3.create();
      let e1 = vec3.create();
      let e2 = vec3.create();
      vec3.subtract(e1, v[1], v[0]);
      vec3.subtract(e2, v[2], v[0]);
      vec3.cross(normal, e1, e2);
      //console.log('cross product: '+normal );
      vec3.normalize(normal, normal);
      console.log(normal);

      for (let t = 0; t < 6; ++t) {
        var values = {
          'POSITION': v[t],
          'COLOR': [1, 0, 0],
          'NORMAL': normal
        }
        vertexArray.push(values);

      }
    }
    //-- do the 2d triangulation
    let delaunay = Delaunator.from(coords);
    console.log(delaunay);

    //push the top face vertex
    for(let j = 0;j < delaunay.triangles.length/3; ++j){

      //-- index temp
      let it = Array(3);
      for(let s = 0;s < 3; ++s){
        it[s] = delaunay.triangles[3*j + s];
        console.log('its + ',it[s]);
        var values = {
          'POSITION':[coords[it[s]][0],coords[it[s]][1],floorNumber * FIXHEIGHT],
          'COLOR':[1,0,0],
          'NORMAL':[0,0,1]
        }
        vertexArray.push(values);
      }

    }

    //-- calculate the sum of vertex number
    vertexNumberSum += 6*vertexNumber + delaunay.triangles.length;
  }

  console.log(vertexNumberSum);
  //fill in index value，set up the non-top faces
  for(let j = 0;j < vertexNumberSum; ++j){
    indexValuesGroup[j] = j;
  }

  console.log(vertexArray);

  let geometry = new BufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'NORMAL', size: 3,type: DataType.FLOAT, normalized: true}
  ], vertexNumberSum, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;

}

export function createBuildingGeometryBatchingFlatNormalWireFrameDelaunator(cityMap,scale){

  let buildingNumber = cityMap.features.length;

  let indexValuesGroup = [];
  let vertexArray = [];
  let vertexNumberSum = 0;
  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];

  for(let i = 0;i < buildingNumber; ++i){

    let feature = cityMap.features[i];
    let coords = feature.geometry.coordinates[0];
    let vertexNumber = coords.length - 1;

    let floorNumber = feature.properties.floor;
    //non-top faces + top face
    let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
    let modebase = 2*vertexNumber;

    //-- push the non-top face vertex in
    for(let j = 0;j < vertexNumber; ++j){

      let v = Array(6);

      v[0] = vec3.fromValues(coords[j][0], coords[j][1], 0);
      v[1] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[2] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);
      v[3] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], 0);
      v[4] = vec3.fromValues(coords[j + 1][0], coords[j + 1][1], floorNumber * FIXHEIGHT);
      v[5] = vec3.fromValues(coords[j][0], coords[j][1], floorNumber * FIXHEIGHT);

      let normal = vec3.create();
      let e1 = vec3.create();
      let e2 = vec3.create();
      vec3.subtract(e1, v[1], v[0]);
      vec3.subtract(e2, v[2], v[0]);
      vec3.cross(normal, e2, e1);
      //console.log('cross product: '+normal );
      vec3.normalize(normal, normal);

      for (let t = 0; t < 6; ++t) {
        var values = {
          'POSITION': v[t],
          'COLOR': [1, 0, 0],
          'NORMAL': normal,
          'BARYCENTRIC':bcArray[t%3]

        }
        vertexArray.push(values);

      }
    }
    //-- do the 2d polygon triangulation
    let earcut = require('./earcut.js');
    var data = earcut.flatten(feature.geometry.coordinates);
    var triangles = earcut(data.vertices.slice(0,-2), data.holes, data.dimensions);
    console.log('data ',data.vertices);
    console.log('triangles ',triangles);

    //push the top face vertex
    for(let j = 0;j < triangles.length; ++j){
      let ic = triangles[j];
      var values = {
        'POSITION': [coords[ic][0], coords[ic][1], floorNumber * FIXHEIGHT],
        'COLOR': [1, 0, 0],
        'NORMAL': [0, 0, 1],
        'BARYCENTRIC': bcArray[j % 3]
      }
      vertexArray.push(values);

    }

    //-- calculate the sum of vertex number
    vertexNumberSum += 6*vertexNumber + triangles.length;
  }

  let geometry = new BufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'NORMAL', size: 3,type: DataType.FLOAT, normalized: true},
    { semantic: 'BARYCENTRIC', size: 3,type: DataType.FLOAT, normalized: false}
  ], vertexNumberSum, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;

}



