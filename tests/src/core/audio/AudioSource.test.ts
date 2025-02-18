import { AssetType, AudioClip, AudioManager, AudioSource, Engine } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";
import { sound } from "../model/sound";

describe("AudioSource", () => {
  const canvas = document.createElement("canvas");

  let engine: Engine;
  let url: string;
  let clip: AudioClip;
  let audioSource: AudioSource;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvas });
    const blob = await fetch(sound).then((res) => res.blob());
    url = URL.createObjectURL(blob) + "#.ogg";

    engine.run();
  });

  it("load", async () => {
    clip = await engine.resourceManager.load<AudioClip>({
      url: url,
      type: AssetType.Audio
    });

    expect(clip.duration).to.be.above(0);

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    const audioEntity = rootEntity.createChild();

    audioSource = audioEntity.addComponent(AudioSource);
    audioSource.clip = clip;

    audioSource.volume = 2.0;
    expect(audioSource.volume).to.be.equal(1.0);

    audioSource.playbackRate = 0.6;
    expect(audioSource.playbackRate).to.be.equal(0.6);

    audioSource.loop = false;
    expect(audioSource.loop).to.be.equal(false);

    audioSource.mute = false;
    expect(audioSource.mute).to.be.false;
    audioSource.mute = true;
    expect(audioSource.mute).to.be.true;

    expect(audioSource.time).to.be.equal(0);

    audioSource.stop();
    audioSource.play();

    if (AudioManager.isAudioContextRunning()) {
      expect(audioSource.isPlaying).to.be.true;
    } else {
      // Because the audio play should interaction
      expect(audioSource.isPlaying).to.be.false;
    }
  });
});
