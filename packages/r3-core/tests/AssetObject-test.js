import { AssetObject } from '../src/AssetObject';

describe("AssetObject", ()=>{
  it("AssetObject worked!", ()=>{
    let assetObject = new AssetObject("MyAsset");
    expect(assetObject).is.an("object");
    expect(assetObject.name).is.equal("MyAsset");
  });
});