import { Engine } from '../src/Engine.js';
import { EngineFeature } from '../src/EngineFeature';

describe('Engine', () => {
  describe("Engine instance", () => {
    it('constructor', () => {
      let engine = new Engine();

      expect(engine.currentScene).is.not.null;
      expect(engine.isPasued).is.false;
    });

    it('event run', (done) => {
      let engine = new Engine();

      engine.addEventListener('run', function (e) {
        done();
        engine.shutdown();
      });

      engine.run();
    });

    it('event shutdown', (done) => {
      let engine = new Engine();

      engine.addEventListener('shutdown', function (e) {
        done();
      });

      engine.addEventListener('run', function (e) {
        engine.shutdown();
      });

      engine.run();
    });
  });

  describe("Engine Feature", () => {
    it("Engine Feature worked!", done=>{
      let engine = new Engine();

      let calledCount = 0, calledNames = "";
      function called(name) {
        calledCount++;
        calledNames += name;
        if (calledCount === 3) {
          if (calledNames === "preLoad;preTick;postTick;") {
            done();
          }
          else {
            done(Error("Callback methods of EngineFeature object is not called in correct order."));
          }
          engine.shutdown();
        }
      }
  
  
      class MyFeature extends EngineFeature {
        preLoad() {
          called("preLoad;");
        }
  
        preTick() {
          called("preTick;");
        }
  
        postTick() {
          called("postTick;");
        }
      }
  
      Engine.registerFeature(MyFeature);
  
      engine.run();
    });
  });
});