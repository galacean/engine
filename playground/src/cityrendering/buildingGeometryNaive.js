
import { BufferUsage } from '@alipay/r3-base';
import { vec3,vec4} from '@alipay/r3-math';
import { IndexBufferGeometry,BufferGeometry } from '@alipay/r3-geometry';
import '@alipay/r3-engine-stats';
import { DataType } from '@alipay/r3-base';
import {FIXHEIGHT} from './constant';

export default function createBuildingGeometryNaive(feature){
  let coords = feature.geometry.coordinates[0];
  let vertexNumber = coords.length;
  let floorNumber = feature.properties.floor;
  //non-top faces + top face
  let indexValues = Array(6*vertexNumber + 3*(vertexNumber - 2));
  let modebase = 2*vertexNumber;

  //fill in index value，set up the non-top faces
  for(let i = 0;i < vertexNumber; ++i){
    indexValues[6*i] = 2*i;
    indexValues[6*i + 1] = (2*i + 2)%(modebase);
    indexValues[6*i + 2] = 2*i + 1;
    indexValues[6*i + 3] = 2*i + 1;
    indexValues[6*i + 4] = (2*i + 2)%(modebase);
    indexValues[6*i + 5] = (2*i + 3)%(modebase);
  }

  //set up the top face
  let offset = 6*vertexNumber;
  for(let i = 0;i < vertexNumber - 2; ++i){
    indexValues[offset + 3*i] = 2*vertexNumber - 1;
    indexValues[offset + 3*i + 1]  = 2*i + 3;
    indexValues[offset + 3*i + 2] = 2*i + 1;
  }

  var geometry = new IndexBufferGeometry('buildingIndexGeometry');

  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], 2*vertexNumber, indexValues, BufferUsage.STATIC_DRAW);

  //fill in veretx data
  let debugVertex = [];
  for(let i = 0;i < 2 * vertexNumber; ++i){
    let j = Math.floor(i/2);
    var values = {
      'POSITION':[coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]],
      'COLOR':[1,0,0]
    }
    geometry.setVertexValues(i,values);
    debugVertex.push([coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]]);
  }

  return geometry;

}

export function createBuildingGeometryNonTop(feature){
  let coords = feature.geometry.coordinates[0];
  let vertexNumber = coords.length - 1;
  let floorNumber = feature.properties.floor;
  //non-top faces + top face
  let indexValues = Array(6*vertexNumber);
  let modebase = 2*vertexNumber;
  //fill in index value，set up the non-top faces
  for(let i = 0;i < vertexNumber; ++i){
    indexValues[6*i] = 2*i;
    indexValues[6*i + 1] = (2*i + 2)%(modebase);
    indexValues[6*i + 2] = 2*i + 1;
    indexValues[6*i + 3] = 2*i + 1;
    indexValues[6*i + 4] = (2*i + 2)%(modebase);
    indexValues[6*i + 5] = (2*i + 3)%(modebase);
  }

  var geometry = new IndexBufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], 2*vertexNumber, indexValues, BufferUsage.STATIC_DRAW);

  //fill in veretx data
  for(let i = 0;i < 2 * vertexNumber; ++i){
    let j = Math.floor(i/2);
    var values = {
      'POSITION':[coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]],
      'COLOR':[1,0,0]
    }
    geometry.setVertexValues(i,values);
  }
  return geometry;

}

export function createBuildingGeometryTopOnly(feature){
  let coords = feature.geometry.coordinates[0];

  let vertexNumber = coords.length - 1;
  let floorNumber = feature.properties.floor;
  let indexValues = Array(3*(vertexNumber - 2));
  let modebase = 2*vertexNumber;

  //set up the top face
  let offset = 6*vertexNumber;
  offset = 0;
  for(let i = 0;i < vertexNumber - 2; ++i){
    indexValues[offset + 3*i] = 2*vertexNumber - 1;
    indexValues[offset + 3*i + 1]  = 2*i + 3;
    indexValues[offset + 3*i + 2] = 2*i + 1;
  }

  var geometry = new IndexBufferGeometry('buildingIndexGeometry');

  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false},
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false}
  ], 2*vertexNumber, indexValues, BufferUsage.STATIC_DRAW);

  //fill in veretx data
  for(let i = 0;i < 2 * vertexNumber; ++i){
    let j = Math.floor(i/2);
    var values = {
      'POSITION':[coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]],
      'COLOR':[1,0,0]
    }
    geometry.setVertexValues(i,values);
  }
  return geometry;
}

export function createBuildingGeometryNaiveFlatNormalDelaunator(feature){
  let coords = feature.geometry.coordinates[0];
  let vertexNumber = coords.length - 1;
  let floorNumber = feature.properties.floor;
  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];
  let uvArray = [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
  let vertexArray = [];
  let vertexNumberSum = 0;

  //-- push the non-top face vertex in
  for (let j = 0; j < vertexNumber; ++j) {

    let v = Array(6);

    v[0] = vec3.fromValues(coords[j][0], 0, coords[j][1]);
    v[1] = vec3.fromValues(coords[j + 1][0], 0, coords[j + 1][1]);
    v[2] = vec3.fromValues(coords[j][0], floorNumber * FIXHEIGHT, coords[j][1]);
    v[3] = vec3.fromValues(coords[j + 1][0], 0, coords[j + 1][1]);
    v[4] = vec3.fromValues(coords[j + 1][0], floorNumber * FIXHEIGHT, coords[j + 1][1]);
    v[5] = vec3.fromValues(coords[j][0], floorNumber * FIXHEIGHT, coords[j][1]);

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
        'TEXCOORD_0':uvArray[t],
        // 'BARYCENTRIC':bcArray[t%3]
      };
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
      'POSITION': [coords[ic][0], floorNumber * FIXHEIGHT, coords[ic][1]],
      'COLOR': [1, 0, 0],
      'NORMAL': [0, 0, 1],
      'TEXCOORD_0':[coords[ic][0],coords[ic][1]],
      // 'BARYCENTRIC': bcArray[j % 3]
    };
    vertexArray.push(values);
  }
  //-- calculate the sum of vertex number
  vertexNumberSum = 6 * vertexNumber + triangles.length;


  let geometry = new BufferGeometry('buildingIndexGeometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'NORMAL', size: 3, type: DataType.FLOAT, normalized: true },
    // { semantic: 'BARYCENTRIC', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true}
  ], vertexNumberSum, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;
}

export function createSideGeometry(feature){
  let coords = feature.geometry.coordinates[0];
  let vertexNumber = coords.length - 1;
  let floorNumber = feature.properties.floor;
  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];
  let uvArray = [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
  let vertexArray = [];

  //-- push the non-top face vertex in
  for (let j = 0; j < vertexNumber; ++j) {

    let v = Array(6);
    v[0] = vec3.fromValues(coords[j][0], 0, coords[j][1]);
    v[1] = vec3.fromValues(coords[j + 1][0], 0, coords[j + 1][1]);
    v[2] = vec3.fromValues(coords[j][0], floorNumber * FIXHEIGHT, coords[j][1]);
    v[3] = vec3.fromValues(coords[j + 1][0], 0, coords[j + 1][1]);
    v[4] = vec3.fromValues(coords[j + 1][0], floorNumber * FIXHEIGHT, coords[j + 1][1]);
    v[5] = vec3.fromValues(coords[j][0], floorNumber * FIXHEIGHT, coords[j][1]);

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
        'TEXCOORD_0':uvArray[t],
        // 'BARYCENTRIC':bcArray[t%3]
      };
      vertexArray.push(values);
    }
  }

  //-- calculate the sum of vertex number
  let vertexNumberAll = 6 * vertexNumber;

  let geometry = new BufferGeometry('side_buffer_geometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'NORMAL', size: 3, type: DataType.FLOAT, normalized: true },
    // { semantic: 'BARYCENTRIC', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true}
  ], vertexNumberAll, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;
}

export function createTopGeometry(feature){
  let coords = feature.geometry.coordinates[0];
  let floorNumber = feature.properties.floor;
  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];
  let vertexArray = [];

  //-- do the 2d polygon triangulation
  let earcut = require('./earcut.js');
  var data = earcut.flatten(feature.geometry.coordinates);
  var triangles = earcut(data.vertices.slice(0,-2), data.holes, data.dimensions);
  // console.log('data ',data.vertices);
  // console.log('triangles ',triangles);

  //push the top face vertex
  for(let j = 0;j < triangles.length; ++j){
    let ic = triangles[j];
    var values = {
      'POSITION': [coords[ic][0], floorNumber * FIXHEIGHT, coords[ic][1]],
      'COLOR': [1, 0, 0],
      'NORMAL': [0, 0, 1],
      'TEXCOORD_0':[coords[ic][0],coords[ic][1]],
      // 'BARYCENTRIC': bcArray[j % 3]
    };
    vertexArray.push(values);
  }

  let vertexNumberAll = triangles.length;

  let geometry = new BufferGeometry('top_buffer_geometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'COLOR', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'NORMAL', size: 3, type: DataType.FLOAT, normalized: true },
    // { semantic: 'BARYCENTRIC', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true}
  ], vertexNumberAll, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;
}
