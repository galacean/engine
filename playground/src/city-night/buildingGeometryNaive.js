
import { BufferUsage } from '@alipay/r3-base';
import { vec2,vec3,vec4} from '@alipay/r3-math';
import { IndexBufferGeometry,BufferGeometry } from '@alipay/r3-geometry';
import '@alipay/r3-engine-stats';
import { DataType } from '@alipay/r3-base';
import {FIXHEIGHT} from './constant';

export default function createBuildingGeometryNaive(feature){
  let coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;
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
  let coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;
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
    let values = {
      'POSITION':[coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]],
      'COLOR':[1,0,0]
    };
    geometry.setVertexValues(i,values);
  }
  return geometry;

}

export function createBuildingGeometryTopOnly(feature){
  let coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;

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
  for(let i = 0;i < 2 * vertexNumber; ++i) {
    let j = Math.floor(i/2);
    var values = {
      'POSITION':[coords[j][0],floorNumber * (i%2) * FIXHEIGHT,coords[j][1]],
      'COLOR':[1,0,0]
    };
    geometry.setVertexValues(i,values);
  }
  return geometry;
}

export function createBuildingGeometryNaiveFlatNormalDelaunator(feature){
  let coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;
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
    vec3.cross(normal, e2, e1);
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
  const coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;

  const vertexNumber = coords.length - 1;
  const floorNumber = feature.properties.floor;
  const bcArray = [[1,0,0],[0,1,0],[0,0,1]];
  const uvArray = [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
  let uvLoopArray = Array(vertexNumber);
  let vertexArray = [];
  let perimeter = 0; // 周长
  let segLength = Array(vertexNumber);
  let center = vec3.create(); // 中心
  if (vertexNumber>0) {
    const getLength = (idx1, idx2) => vec2.distance(
                                        vec2.fromValues(coords[idx1][0], coords[idx1][1]),
                                        vec2.fromValues(coords[idx2][0], coords[idx2][1]));
    for (let i=0; i<vertexNumber-1; ++i) {
      segLength[i] = getLength(i, i+1);
      perimeter += segLength[i];
    }
    segLength[vertexNumber-1] = getLength(0, vertexNumber-1);
  }
  {
    const whRatio = perimeter / (floorNumber*FIXHEIGHT); // 长宽比
    const uvMultiply = Math.round(whRatio+0.5);
    let lengthSum = 0.0;
    for (let i = 0; i<vertexNumber; ++i) {
      const u1 = lengthSum/perimeter * uvMultiply;
      const u2 = (lengthSum+segLength[i])/perimeter * uvMultiply;
      uvLoopArray[i] = [[u1, 0], [u2, 0], [u1,1], [u2, 0], [u2,1], [u1,1]];
      lengthSum += segLength[i];
      vec3.add(center, center, vec3.fromValues(coords[i][0], floorNumber*FIXHEIGHT, coords[i][1]));
    }
  }
  vec3.mul(center, center, vec3.fromValues(1.0/vertexNumber,1.0/vertexNumber,1.0/vertexNumber));

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
    vec3.cross(normal, e2, e1);
    //console.log('cross product: '+normal );
    vec3.normalize(normal, normal);
    // const uv = vertexNumber <= 6 ? uvArray : uvLoopArray[j];
    const uv = uvLoopArray[j];

    for (let t = 0; t < 6; ++t) {
      var values = {
        'POSITION': v[t],
        'COLOR': vertexNumber>20?[0, 0, 1]:[0, 0, 0],
        'NORMAL': normal,
        'TEXCOORD_0':uv[t],
        'TEXCOORD_1':[center[0], center[2]],
        //'BARYCENTRIC':bcArray[t%3]

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
    //{ semantic: 'BARYCENTRIC', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true },
    { semantic: 'TEXCOORD_1', size: 2, type: DataType.FLOAT, normalized: false },
  ], vertexNumberAll, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;
}

export function createTopGeometry(feature){
  //return createBuildingGeometryTopOnly(feature);
  let coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;

  let floorNumber = feature.properties.floor;
  let bcArray = [[1,0,0],[0,1,0],[0,0,1]];
  let vertexArray = [];

  const vertexNumber = coords.length-1;
  let center = vec3.create(); // 中心
  for (let i=0; i<vertexNumber; ++i) {
    vec3.add(center, center, vec3.fromValues(coords[i][0], floorNumber*FIXHEIGHT, coords[i][1]));
  }
  vec3.mul(center, center, vec3.fromValues(1.0/vertexNumber,1.0/vertexNumber,1.0/vertexNumber));

  //-- do the 2d polygon triangulation
  let earcut = require('./earcut.js');
  var data = earcut.flatten([coords]);
  var triangles = earcut(data.vertices.slice(0,-2), data.holes, data.dimensions);
  // console.log('data ',data.vertices);
  // console.log('triangles ',triangles);

  //push the top face vertex
  for(let j = 0;j < triangles.length; ++j){
    let ic = triangles[j];
    var values = {
      'POSITION': [coords[ic][0], floorNumber * FIXHEIGHT, coords[ic][1]],
      'COLOR': [1, 0, 0],
      'NORMAL': [0, 1, 0],
      'TEXCOORD_0':[coords[ic][0],coords[ic][1]],
      'TEXCOORD_1':[center[0], center[2]],
      //'BARYCENTRIC': bcArray[j % 3]
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
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true},
    { semantic: 'TEXCOORD_1', size: 2, type: DataType.FLOAT, normalized: false},
  ], vertexNumberAll, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertexArray);

  return geometry;
}

export function createBillboardGeometry(feature) {
  const coords = feature.geometry.type == "Polygon" ?
                 feature.geometry.coordinates[0] :
                 feature.geometry.type == "MultiPolygon" ?
                  feature.geometry.coordinates[0][0]:
                  null;

  const vertexNumber = coords.length-1;
  const floorNumber = feature.properties.floor;
  if (floorNumber<10)
    return null;
  let center = vec3.create(); // 中心
  let dir = vec3.create(); // 最长边的方向
  let longestSeg = 0;      // 最长边长度
  for (let i=0; i<vertexNumber; ++i) {
    vec3.add(center, center, vec3.fromValues(coords[i][0], floorNumber*FIXHEIGHT, coords[i][1]));
    const a = vec3.fromValues(coords[i][0], floorNumber*FIXHEIGHT, coords[i][1]);
    const b = vec3.fromValues(coords[i+1][0], floorNumber*FIXHEIGHT, coords[i+1][1]);
    const len = vec3.distance(a,b);
    if (len>longestSeg) {
      longestSeg = len;
      dir = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), a, b));
    }
  }
  let points = [
    vec3.create(), vec3.create(), vec3.create(), vec3.create()
  ];
  vec3.mul(center, center, vec3.fromValues(1.0/vertexNumber,1.0/vertexNumber,1.0/vertexNumber));
  longestSeg /= 2.2;
  const halfExt = vec3.mul(vec3.create(), dir, vec3.fromValues(longestSeg, 0, longestSeg));
  center[1] += Math.random()*0.1+0.02;
  vec3.add(points[0], center, halfExt);
  vec3.sub(points[1], center, halfExt);
  center[1] += Math.min(longestSeg, 0.8);
  vec3.add(points[2], center, halfExt);
  vec3.sub(points[3], center, halfExt);
  const normal = vec3.normalize(vec3.create(),
                  vec3.cross(vec3.create(),
                    vec3.subtract(vec3.create(), points[0], points[1]),
                    vec3.subtract(vec3.create(), points[0], points[2])));
  const negnormal = vec3.negate(vec3.create(), normal);

  let vertices = [
    {'POSITION': points[0], 'TEXCOORD_0': [0,1], 'NORMAL': normal},
    {'POSITION': points[1], 'TEXCOORD_0': [1,1], 'NORMAL': normal},
    {'POSITION': points[2], 'TEXCOORD_0': [0,0], 'NORMAL': normal},
    {'POSITION': points[3], 'TEXCOORD_0': [1,0], 'NORMAL': normal},
    {'POSITION': points[2], 'TEXCOORD_0': [0,0], 'NORMAL': normal},
    {'POSITION': points[1], 'TEXCOORD_0': [1,1], 'NORMAL': normal},

    {'POSITION': points[0], 'TEXCOORD_0': [1,1], 'NORMAL': negnormal},
    {'POSITION': points[2], 'TEXCOORD_0': [1,0], 'NORMAL': negnormal},
    {'POSITION': points[1], 'TEXCOORD_0': [0,1], 'NORMAL': negnormal},
    {'POSITION': points[1], 'TEXCOORD_0': [0,1], 'NORMAL': negnormal},
    {'POSITION': points[2], 'TEXCOORD_0': [1,0], 'NORMAL': negnormal},
    {'POSITION': points[3], 'TEXCOORD_0': [0,0], 'NORMAL': negnormal},
  ];

  let geometry = new BufferGeometry('billboard_geometry');
  geometry.initialize([
    { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
    { semantic: 'NORMAL', size: 3, type: DataType.FLOAT, normalized: true },
    { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true}
  ], 12, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertices);

  return geometry;
}

export function createRoadGeometry(vertices) {
  let geometry = new BufferGeometry('road_geometry')
  geometry.initialize([
    { semantic: 'POSITION', size:3, type: DataType.FLOAT, normalized: false }
  ], vertices.length, BufferUsage.STATIC_DRAW);
  geometry.setAllVertexValues(vertices);
  return geometry;
}
