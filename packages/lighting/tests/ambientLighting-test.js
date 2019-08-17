
import { Engine } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';
import { AmbientLighting } from '../src/index';


describe('AmbientLighting', function () {
  var engine = new Engine();
  var scene = engine.currentScene;
  var rootNode = scene.root;
  var lightNode = rootNode.createChild("light");
  
  it('AmbientLighting create', function () {
    var lightCfg = {
      color: vec3.fromValues(1, 1, 0),
      intensity: 0.1
    }

    let ALight = lightNode.createAbility(AmbientLighting, lightCfg);

    expect(ALight != null).to.be.true;
    expect(ALight._name === 'ambientLight').to.be.true;
    expect(ALight.color === lightCfg.color).to.be.true;
    expect(ALight.intensity === lightCfg.intensity).to.be.true;
  });

});
