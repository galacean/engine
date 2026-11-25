import { AudioClip, AudioManager, AudioSource, WebGLEngine } from "@galacean/engine";
import { expect, it, vi } from "vitest";

it("keeps a decoded clip stopped when the playback context is unavailable", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const source = engine.sceneManager.activeScene.createRootEntity().addComponent(AudioSource);
    const clip = new AudioClip(engine);
    clip._setAudioSource(new AudioBuffer({ length: 48000, sampleRate: 48000 }));
    source.clip = clip;
    vi.stubGlobal("AudioContext", undefined);

    await expect(AudioManager.resume()).rejects.toBeInstanceOf(TypeError);
    expect(() => source.play()).not.toThrow();
    expect(source.isPlaying).toBe(false);
    expect(source.time).toBe(0);
  } finally {
    vi.unstubAllGlobals();
    engine.destroy();
  }
});
