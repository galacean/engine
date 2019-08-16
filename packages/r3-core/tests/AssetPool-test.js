import { AssetPool } from '../src/AssetPool';
import { AssetObject } from '../src/AssetObject';


describe('AssetPool', function () {

  it('AssetPool worked!', function () {
    let pool = new AssetPool();
    let asset1 = pool.requireAsset('asset1', AssetObject);

    expect(asset1).is.not.null;
    expect(pool.assetsCount).is.equal(1);

  });

});