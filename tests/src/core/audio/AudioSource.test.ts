import { AssetType, AudioClip, AudioSource, Engine,AudioListener} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";
import { sound } from "../model/sound";

describe("AudioSource", () => {
    const canvas = document.createElement("canvas");
  
    let engine: Engine;
    let url:string
    let clip:AudioClip
    let audioSource: AudioSource

    before(async function () {
      engine = await WebGLEngine.create({ canvas: canvas });
      const blob = await fetch(sound).then((res) => res.blob());
      url = URL.createObjectURL(blob) + "#.ogg";

      engine.run();
    });


      it('load', async () => {
      clip = await engine.resourceManager.load<AudioClip>(
          {
            url: url,
            type: AssetType.Audio,
          }
        );

        expect(clip.duration).to.be.above(0);
    });
  

      it('start play', async () => {
        const scene = engine.sceneManager.activeScene;
        const rootEntity = scene.createRootEntity();
        const audioEntity = rootEntity.createChild()
        const listenEntity = rootEntity.createChild("listen");

        listenEntity.addComponent(AudioListener);
        audioSource = audioEntity.addComponent(AudioSource)
        audioSource.clip = clip
        
        audioSource.stop();
        audioSource.play();
        expect(audioSource.isPlaying).to.be.true;
        expect(audioSource.time).to.be.equal(0)
    });
   
})