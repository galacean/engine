import { AnimationClipDecoder } from './../../src/resources/animationClip/AnimationClipDecoder';
import { AnimationClipEncoder } from './../../src/resources/animationClip/AnimationClipEncoder';
import { AnimatorControllerDecoder } from './../../src/resources/animatorController/AnimatorControllerDecoder';
import { AnimatorControllerEncoder } from './../../src/resources/animatorController/AnimatorControllerEncoder';
import { BufferReader } from '../../src/utils/BufferReader';
import { WebGLEngine } from '../../../rhi-webgl/src/WebGLEngine';
import { BufferWriter } from '../../src/utils/BufferWriter';
import testClipData from '../animationClip/animationClip.json'
import testControllerData from './animatorController.json'
describe("AnimatorControllerEncoderAndDecoder Test", () => {
  it("parser", async () => {
    const engine = new WebGLEngine(document.createElement("canvas"));
    const clipBuffer = new ArrayBuffer(10000);
    const clipBufferWriter = new BufferWriter(clipBuffer);
    const clipBufferReader = new BufferReader(clipBuffer);
    AnimationClipEncoder.encode(clipBufferWriter, testClipData);
    await AnimationClipDecoder.decode(engine, clipBufferReader)
    const controllerBuffer = new ArrayBuffer(10000);
    const controllerBufferWriter = new BufferWriter(controllerBuffer);
    const controllerBufferReader = new BufferReader(controllerBuffer);
   
    AnimatorControllerEncoder.encode(controllerBufferWriter, testControllerData);
    const controller = await AnimatorControllerDecoder.decode(engine, controllerBufferReader)
    const { clip } = controller.layers[0].stateMachine.states[0]
    expect(controller.layers.length).toEqual(1);
    expect(controller.layers[0].name).toEqual('Base');
    expect(controller.layers[0].blendingMode).toEqual(0);
    expect(controller.layers[0].weight).toEqual(1);
    expect(controller.layers[0].stateMachine.states.length).toEqual(1);
    expect(controller.layers[0].stateMachine.states[0].name).toEqual('animation_AnimatedCube');
    expect(controller.layers[0].stateMachine.states[0].clip.name).toEqual('animation_AnimatedCube');
    expect(controller.layers[0].stateMachine.states[0].wrapMode).toEqual(1);
    expect(controller.layers[0].stateMachine.states[0].clipStartTime).toEqual(0);
    expect(controller.layers[0].stateMachine.states[0].clipEndTime).toEqual(clip.length);
    expect(controller.layers[0].stateMachine.states[0].transitions.length).toEqual(0);
  });
});
