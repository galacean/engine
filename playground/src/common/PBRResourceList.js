import { TextureFilter } from '../../../packages/r3-base/dist/main';
import { Resource } from '../../../packages/r3-loader/dist/main';

let diffuseMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    '../assets/env/papermill/diffuse/diffuse_right_0.jpg',
    '../assets/env/papermill/diffuse/diffuse_left_0.jpg',
    '../assets/env/papermill/diffuse/diffuse_top_0.jpg',
    '../assets/env/papermill/diffuse/diffuse_bottom_0.jpg',
    '../assets/env/papermill/diffuse/diffuse_front_0.jpg',
    '../assets/env/papermill/diffuse/diffuse_back_0.jpg',
  ],
});

let environmentMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    '../assets/env/papermill/environment/environment_right_0.jpg',
    '../assets/env/papermill/environment/environment_left_0.jpg',
    '../assets/env/papermill/environment/environment_top_0.jpg',
    '../assets/env/papermill/environment/environment_bottom_0.jpg',
    '../assets/env/papermill/environment/environment_front_0.jpg',
    '../assets/env/papermill/environment/environment_back_0.jpg',
  ],
});

let specularMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    [
      '../assets/env/papermill/specular/specular_right_0.jpg',
      '../assets/env/papermill/specular/specular_left_0.jpg',
      '../assets/env/papermill/specular/specular_top_0.jpg',
      '../assets/env/papermill/specular/specular_bottom_0.jpg',
      '../assets/env/papermill/specular/specular_front_0.jpg',
      '../assets/env/papermill/specular/specular_back_0.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_1.jpg',
      '../assets/env/papermill/specular/specular_left_1.jpg',
      '../assets/env/papermill/specular/specular_top_1.jpg',
      '../assets/env/papermill/specular/specular_bottom_1.jpg',
      '../assets/env/papermill/specular/specular_front_1.jpg',
      '../assets/env/papermill/specular/specular_back_1.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_2.jpg',
      '../assets/env/papermill/specular/specular_left_2.jpg',
      '../assets/env/papermill/specular/specular_top_2.jpg',
      '../assets/env/papermill/specular/specular_bottom_2.jpg',
      '../assets/env/papermill/specular/specular_front_2.jpg',
      '../assets/env/papermill/specular/specular_back_2.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_3.jpg',
      '../assets/env/papermill/specular/specular_left_3.jpg',
      '../assets/env/papermill/specular/specular_top_3.jpg',
      '../assets/env/papermill/specular/specular_bottom_3.jpg',
      '../assets/env/papermill/specular/specular_front_3.jpg',
      '../assets/env/papermill/specular/specular_back_3.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_4.jpg',
      '../assets/env/papermill/specular/specular_left_4.jpg',
      '../assets/env/papermill/specular/specular_top_4.jpg',
      '../assets/env/papermill/specular/specular_bottom_4.jpg',
      '../assets/env/papermill/specular/specular_front_4.jpg',
      '../assets/env/papermill/specular/specular_back_4.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_5.jpg',
      '../assets/env/papermill/specular/specular_left_5.jpg',
      '../assets/env/papermill/specular/specular_top_5.jpg',
      '../assets/env/papermill/specular/specular_bottom_5.jpg',
      '../assets/env/papermill/specular/specular_front_5.jpg',
      '../assets/env/papermill/specular/specular_back_5.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_6.jpg',
      '../assets/env/papermill/specular/specular_left_6.jpg',
      '../assets/env/papermill/specular/specular_top_6.jpg',
      '../assets/env/papermill/specular/specular_bottom_6.jpg',
      '../assets/env/papermill/specular/specular_front_6.jpg',
      '../assets/env/papermill/specular/specular_back_6.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_7.jpg',
      '../assets/env/papermill/specular/specular_left_7.jpg',
      '../assets/env/papermill/specular/specular_top_7.jpg',
      '../assets/env/papermill/specular/specular_bottom_7.jpg',
      '../assets/env/papermill/specular/specular_front_7.jpg',
      '../assets/env/papermill/specular/specular_back_7.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_8.jpg',
      '../assets/env/papermill/specular/specular_left_8.jpg',
      '../assets/env/papermill/specular/specular_top_8.jpg',
      '../assets/env/papermill/specular/specular_bottom_8.jpg',
      '../assets/env/papermill/specular/specular_front_8.jpg',
      '../assets/env/papermill/specular/specular_back_8.jpg',
    ],
    [
      '../assets/env/papermill/specular/specular_right_9.jpg',
      '../assets/env/papermill/specular/specular_left_9.jpg',
      '../assets/env/papermill/specular/specular_top_9.jpg',
      '../assets/env/papermill/specular/specular_bottom_9.jpg',
      '../assets/env/papermill/specular/specular_front_9.jpg',
      '../assets/env/papermill/specular/specular_back_9.jpg',
    ],

  ],
  config: {
    magFilter: TextureFilter.LINEAR,
    minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
  }
});

const helmetGLTF = new Resource('helmet', {
  type: 'gltf',
  url: '../assets/DamangedHelmet/DamagedHelmet.gltf',
});

const chessGLTF = new Resource('chess', {
  type: 'gltf',
  url: '../assets/chess/chess.gltf',
});

const lutRes = new Resource('lut', {
  type: 'texture',
  url: '../assets/env/brdfLUT.png',
});

const rampTexture = new Resource('ramp', {
  type: 'texture',
  url: '../assets/FxColorRamp.png',
});

export var ResourceList = [helmetGLTF, lutRes, diffuseMapRes, specularMapRes, environmentMapRes, rampTexture, chessGLTF];
