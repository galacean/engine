import { Resource } from "@alipay/o3-loader";

/**resources*/
const cubeTextureList = ["sky", "house", "sunnyDay", "minisampler"];
const textureList = ["luminance.jpg", "opacity_grid.png"];
const cubeTextureRes = cubeTextureList.map(
  name =>
    new Resource(name, {
      type: "cubemap",
      urls: [
        `/static/skybox/${name}/px.jpg`,
        `/static/skybox/${name}/nx.jpg`,
        `/static/skybox/${name}/py.jpg`,
        `/static/skybox/${name}/ny.jpg`,
        `/static/skybox/${name}/pz.jpg`,
        `/static/skybox/${name}/nz.jpg`
      ]
    })
);
const textureRes = textureList.map(
  name =>
    new Resource(name, {
      type: "texture",
      url: `/static/texture/${name}`
    })
);

const cubeTextures = {};
const textures = {};
export { cubeTextureList, textureList, cubeTextureRes, textureRes, cubeTextures, textures };
