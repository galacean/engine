import {TextureFilter} from '@alipay/o3-base';
import {Resource} from '@alipay/o3-loader';

let diffuseMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    '/static/env/papermill/diffuse/diffuse_right_0.jpg',
    '/static/env/papermill/diffuse/diffuse_left_0.jpg',
    '/static/env/papermill/diffuse/diffuse_top_0.jpg',
    '/static/env/papermill/diffuse/diffuse_bottom_0.jpg',
    '/static/env/papermill/diffuse/diffuse_front_0.jpg',
    '/static/env/papermill/diffuse/diffuse_back_0.jpg',
  ],
});

let environmentMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    '/static/env/papermill/environment/environment_right_0.jpg',
    '/static/env/papermill/environment/environment_left_0.jpg',
    '/static/env/papermill/environment/environment_top_0.jpg',
    '/static/env/papermill/environment/environment_bottom_0.jpg',
    '/static/env/papermill/environment/environment_front_0.jpg',
    '/static/env/papermill/environment/environment_back_0.jpg',
  ],
});

let specularMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    [
      '/static/env/papermill/specular/specular_right_0.jpg',
      '/static/env/papermill/specular/specular_left_0.jpg',
      '/static/env/papermill/specular/specular_top_0.jpg',
      '/static/env/papermill/specular/specular_bottom_0.jpg',
      '/static/env/papermill/specular/specular_front_0.jpg',
      '/static/env/papermill/specular/specular_back_0.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_1.jpg',
      '/static/env/papermill/specular/specular_left_1.jpg',
      '/static/env/papermill/specular/specular_top_1.jpg',
      '/static/env/papermill/specular/specular_bottom_1.jpg',
      '/static/env/papermill/specular/specular_front_1.jpg',
      '/static/env/papermill/specular/specular_back_1.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_2.jpg',
      '/static/env/papermill/specular/specular_left_2.jpg',
      '/static/env/papermill/specular/specular_top_2.jpg',
      '/static/env/papermill/specular/specular_bottom_2.jpg',
      '/static/env/papermill/specular/specular_front_2.jpg',
      '/static/env/papermill/specular/specular_back_2.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_3.jpg',
      '/static/env/papermill/specular/specular_left_3.jpg',
      '/static/env/papermill/specular/specular_top_3.jpg',
      '/static/env/papermill/specular/specular_bottom_3.jpg',
      '/static/env/papermill/specular/specular_front_3.jpg',
      '/static/env/papermill/specular/specular_back_3.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_4.jpg',
      '/static/env/papermill/specular/specular_left_4.jpg',
      '/static/env/papermill/specular/specular_top_4.jpg',
      '/static/env/papermill/specular/specular_bottom_4.jpg',
      '/static/env/papermill/specular/specular_front_4.jpg',
      '/static/env/papermill/specular/specular_back_4.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_5.jpg',
      '/static/env/papermill/specular/specular_left_5.jpg',
      '/static/env/papermill/specular/specular_top_5.jpg',
      '/static/env/papermill/specular/specular_bottom_5.jpg',
      '/static/env/papermill/specular/specular_front_5.jpg',
      '/static/env/papermill/specular/specular_back_5.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_6.jpg',
      '/static/env/papermill/specular/specular_left_6.jpg',
      '/static/env/papermill/specular/specular_top_6.jpg',
      '/static/env/papermill/specular/specular_bottom_6.jpg',
      '/static/env/papermill/specular/specular_front_6.jpg',
      '/static/env/papermill/specular/specular_back_6.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_7.jpg',
      '/static/env/papermill/specular/specular_left_7.jpg',
      '/static/env/papermill/specular/specular_top_7.jpg',
      '/static/env/papermill/specular/specular_bottom_7.jpg',
      '/static/env/papermill/specular/specular_front_7.jpg',
      '/static/env/papermill/specular/specular_back_7.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_8.jpg',
      '/static/env/papermill/specular/specular_left_8.jpg',
      '/static/env/papermill/specular/specular_top_8.jpg',
      '/static/env/papermill/specular/specular_bottom_8.jpg',
      '/static/env/papermill/specular/specular_front_8.jpg',
      '/static/env/papermill/specular/specular_back_8.jpg',
    ],
    [
      '/static/env/papermill/specular/specular_right_9.jpg',
      '/static/env/papermill/specular/specular_left_9.jpg',
      '/static/env/papermill/specular/specular_top_9.jpg',
      '/static/env/papermill/specular/specular_bottom_9.jpg',
      '/static/env/papermill/specular/specular_front_9.jpg',
      '/static/env/papermill/specular/specular_back_9.jpg',
    ],

  ],
  config: {
    magFilter: TextureFilter.LINEAR,
    minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
  }
});

const gltfRes = new Resource('campaign_gltf', {
  type: 'gltf',
  url: '/static/model/DamangedHelmet/DamagedHelmet.gltf',
});

const lutRes = new Resource('lut', {
  type: 'texture',
  url: '/static/texture/brdfLUT.png',
});

export var ResourceList = [gltfRes, lutRes, diffuseMapRes, specularMapRes, environmentMapRes];
