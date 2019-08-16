import { Engine } from '../src/Engine';
import { Scene } from '../src/Scene';
import { SceneFeature } from '../src/SceneFeature';

describe('Scene', function () {

  it('scene feature', function (done) {
    let engine = new Engine();

    let calledCount = 0, calledNames = "";
    function called(name) {
      calledCount ++;
      calledNames += name;
      if(calledCount === 2) {
        if(calledNames === "preUpdatepostUpdate") {
          done();
        }
        else {
          done(Error("Callback methods of SceneFeature object is not called in correct order."));
        }
        engine.shutdown();
      }
    }


    class MyFeature extends SceneFeature {
      preUpdate (scene) {
        called("preUpdate");
      }

      postUpdate (scene) {
        called("postUpdate");
      }
    }

    Scene.registerFeature(MyFeature);

    engine.run();
  });

});