
import { Engine } from '@oasis-engine/core';
import { vec3 } from '@oasis-engine/math';
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

    let ALight = lightNode.addComponent(AmbientLighting, lightCfg);

    expect(ALight != null).to.be.true;
    expect(ALight._name === 'ambientLight').to.be.true;
    expect(ALight.color === lightCfg.color).to.be.true;
    expect(ALight.intensity === lightCfg.intensity).to.be.true;
  });

});
