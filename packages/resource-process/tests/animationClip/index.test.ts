import { AnimationClipDecoder } from '../../src/resources/animationClip/AnimationClipDecoder';
import { BufferReader } from '../../src/utils/BufferReader';
import { WebGLEngine } from '../../../rhi-webgl/src/WebGLEngine';
import { BufferWriter } from '../../src/utils/BufferWriter';
import { AnimationClipEncoder } from '../../src/resources/animationClip/AnimationClipEncoder';
import testData from './animationClip.json'
describe("AnimationClipEncoderAndDecoder Test", () => {
  it("parser", async () => {
    const engine = new WebGLEngine(document.createElement("canvas"));
    const buffer = new ArrayBuffer(10000);
    const bufferWriter = new BufferWriter(buffer);
    const bufferReader = new BufferReader(buffer);
    AnimationClipEncoder.encode(bufferWriter, testData);
    const clip = await AnimationClipDecoder.decode(engine, bufferReader)
    expect(clip.name).toEqual('animation_AnimatedCube');
    expect(clip.events.length).toEqual(1);
    expect(clip.events[0].time).toEqual(0.5);
    expect(clip.events[0].parameter).toEqual('param');
    expect(clip.events[0].functionName).toEqual('test');
    expect(clip.curveBindings.length).toEqual(1);
    expect(clip.curveBindings[0].relativePath).toEqual('');
    expect(clip.curveBindings[0].property).toEqual(1);
    expect(clip.curveBindings[0].curve.keys.length).toEqual(3);
  });
});
