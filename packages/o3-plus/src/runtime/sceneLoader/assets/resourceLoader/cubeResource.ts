import * as o3 from '@alipay/o3';

/**
 * group素材加载
 * @param assets
 * @param assetCache
 */
let groupAssets = {};

export async function loadCubeResources(resourceLoader, assets, assetCache) {
  let promises = [];
  Object.values(assets).filter((value: any) => value.type === 'cubeTexture').forEach((asset: any) => {
    promises.push(new Promise((resolve, reject) => {
      let { name, dirId, dirName } = asset;
      let index = null;

      name = name.slice(0, name.lastIndexOf('.'));

      switch (name) {
        case 'px':
          index = 0;
          break;
        case 'nx':
          index = 1;
          break;
        case 'py':
          index = 2;
          break;
        case 'ny':
          index = 3;
          break;
        case 'pz':
          index = 4;
          break;
        case 'nz':
          index = 5;
          break;
      }

      if (index === null) {
        resolve(index);
        return;
      }

      if (!groupAssets[dirId]) {
        groupAssets[dirId] = [];
      }
      if (!groupAssets[dirId][index]) {
        groupAssets[dirId][index] = asset;
      }
      let px = groupAssets[dirId][0];
      let nx = groupAssets[dirId][1];
      let py = groupAssets[dirId][2];
      let ny = groupAssets[dirId][3];
      let pz = groupAssets[dirId][4];
      let nz = groupAssets[dirId][5];
      if (px && nx && py && ny && pz && nz) {
        const resource = new o3.Resource(dirName, {
          type: 'cubemap', urls: [px.url, nx.url, py.url, ny.url, pz.url, nz.url],
        });
        resourceLoader.load(resource, (err, res) => {
          if (err) {
            reject(err);
          } else {
            assetCache[px.id] = res;
            assetCache[nx.id] = res;
            assetCache[py.id] = res;
            assetCache[ny.id] = res;
            assetCache[pz.id] = res;
            assetCache[nz.id] = res;
            resolve(res);
          }
        });
      } else {
        resolve('loading...');
      }

    }));
  });
  return Promise.all(promises);
}