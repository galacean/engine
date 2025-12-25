# Animator System

## Overview
`Animator` is the runtime animation controller component in the Galacean engine. It plays animation clips through an `AnimatorController`, evaluates state machines, blends layers, and exposes parameter-driven control to gameplay code. Each Animator instance lives on an entity and can share controller assets with other animators.

## Core Architecture
- **Animator**: Component that evaluates animation layers every frame and writes animated values back to components.
- **AnimatorController** (`ReferResource`): Asset containing animation parameters and layers.
- **AnimatorControllerLayer**: Holds an `AnimatorStateMachine` plus blending settings for that layer.
- **AnimatorStateMachine**: State graph that references `AnimatorState` objects and transition collections.
- **AnimatorState**: Wraps an `AnimationClip`, exposes per‑state playback settings, transitions, and `StateMachineScript` hooks.
- **AnimatorStateTransition**: Edge in the state machine; can be created from states, entry, or AnyState collections.
- **AnimatorControllerParameter**: Named parameter (float, int, bool, trigger, string, etc.) stored on the controller and driven per Animator instance.

## Animator API

### Key Properties
```typescript
animator.animatorController: AnimatorController | undefined;
animator.layers: Readonly<AnimatorControllerLayer[]>;
animator.parameters: Readonly<AnimatorControllerParameter[]>;
animator.speed: number; // Default 1.0
animator.cullingMode: AnimatorCullingMode; // Default AnimatorCullingMode.None
```
- Setting `animatorController` registers change flags; the Animator automatically resets when the asset changes or when the component is enabled.
- `layers` and `parameters` proxy through to the controller for quick inspection.
- `speed` scales playback globally for all layers.
- `cullingMode` determines whether evaluation is skipped when all controlled renderers are culled.

### Playback & Queries
```typescript
animator.play(stateName: string, layerIndex: number = -1, normalizedTimeOffset: number = 0): void;
animator.crossFade(stateName: string, normalizedDuration: number, layerIndex: number = -1, normalizedTimeOffset: number = 0): void;
animator.crossFadeInFixedDuration(stateName: string, fixedDuration: number, layerIndex: number = -1, normalizedTimeOffset: number = 0): void;
animator.update(deltaTime: number): void; // Usually driven by the engine
```
- `layerIndex = -1` tells the animator to search all layers for the first matching state name.
- `crossFade` interprets the duration as a normalized ratio of the destination clip length; `crossFadeInFixedDuration` uses seconds.
- When `play` or `crossFade*` is called from script, the Animator internally plays the first frame with `deltaTime = 0` to avoid skipping.

#### State & Layer Lookup
```typescript
animator.getCurrentAnimatorState(layerIndex: number): AnimatorState | undefined;
animator.findAnimatorState(stateName: string, layerIndex: number = -1): AnimatorState | undefined;
animator.findLayerByName(name: string): AnimatorControllerLayer | undefined;
animator.getParameter(name: string): AnimatorControllerParameter | null;
```

### Parameter Control
```typescript
animator.getParameterValue(name: string): AnimatorControllerParameterValue | undefined;
animator.setParameterValue(name: string, value: AnimatorControllerParameterValue): void;
animator.activateTriggerParameter(name: string): void;
animator.deactivateTriggerParameter(name: string): void;
```
- Triggers are just boolean parameters flagged as trigger; `activateTriggerParameter` writes `true`, `deactivateTriggerParameter` resets it to `false`.
- Use `setParameterValue` for all numeric, boolean, string, or reference parameters.

## AnimatorController API
```typescript
const controller = new AnimatorController(engine);
controller.addParameter(name: string, defaultValue?: AnimatorControllerParameterValue): AnimatorControllerParameter;
controller.addTriggerParameter(name: string): AnimatorControllerParameter;
controller.removeParameter(name: string): void;
controller.clearParameters(): void;
controller.getParameter(name: string): AnimatorControllerParameter | null;

const layer = new AnimatorControllerLayer('UpperBody');
controller.addLayer(layer);
controller.removeLayer(index: number): void;
controller.clearLayers(): void;
controller.findLayerByName(name: string): AnimatorControllerLayer | undefined;
```
- `AnimatorControllerLayer` exposes `weight`, `blendingMode`, `mask`, and its embedded `stateMachine`.
- Adding or removing layers/parameters invalidates change flags so active Animators reload state.

## AnimatorStateMachine & AnimatorState
```typescript
// State machine
const state = layer.stateMachine.addState('idle');
layer.stateMachine.defaultState = state;
layer.stateMachine.removeState(state);
layer.stateMachine.findStateByName('walk');
layer.stateMachine.makeUniqueStateName('idle');
layer.stateMachine.addEntryStateTransition(targetState);
layer.stateMachine.addAnyStateTransition(targetState);
layer.stateMachine.removeEntryStateTransition(transition);
layer.stateMachine.clearAnyStateTransitions();

// AnimatorState
state.clip = idleClip;
state.speed = 1.0;
state.wrapMode = WrapMode.Loop;
state.clipStartTime = 0;
state.clipEndTime = 1;
const transition = state.addTransition(otherState);
state.addExitTransition(0.9);
state.removeTransition(transition);
state.clearTransitions();
state.addStateMachineScript(AttackScript);
```
- `addTransition` and `addEntryStateTransition`/`addAnyStateTransition` accept either an existing `AnimatorStateTransition` instance or a destination `AnimatorState`.
- `clipStartTime`/`clipEndTime` restrict the normalized playback range inside the clip.
- `StateMachineScript` subclasses receive `onStateEnter`, `onStateUpdate`, `onStateExit` callbacks.

## Usage Example
```typescript
import { Animator, AnimatorController, AnimatorControllerLayer, AnimatorLayerBlendingMode } from '@galacean/engine';

// Setup controller
const controller = new AnimatorController(engine);
const baseLayer = new AnimatorControllerLayer('Base');
controller.addLayer(baseLayer);

const idle = baseLayer.stateMachine.addState('idle');
const walk = baseLayer.stateMachine.addState('walk');
idle.clip = idleClip;
walk.clip = walkClip;
baseLayer.stateMachine.defaultState = idle;

const speedParam = controller.addParameter('speed', 0);
const idleToWalk = idle.addTransition(walk);
idleToWalk.addCondition(AnimatorConditionMode.Greater, speedParam.name, 0.1);

const upperLayer = new AnimatorControllerLayer('Upper');
upperLayer.blendingMode = AnimatorLayerBlendingMode.Override;
controller.addLayer(upperLayer);
const shoot = upperLayer.stateMachine.addState('shoot');
shoot.clip = shootClip;

// Attach to entity
const animator = entity.addComponent(Animator);
animator.animatorController = controller;
animator.play('idle');

// Drive parameters at runtime
animator.setParameterValue('speed', inputValue);
if (pressedFire) {
  animator.activateTriggerParameter('fire');
}
```

## Best Practices
- **Organize layers**: Keep base locomotion in layer 0 and additive/override adjustments in separate layers with appropriate masks.
- **Reuse clips**: Share `AnimationClip` instances across states to reduce memory usage.
- **Update parameters sparingly**: Avoid writing parameter values every frame if nothing has changed.
- **Define default states**: Always configure `stateMachine.defaultState` so the Animator has a deterministic starting point.
- **Reset triggers**: After handling one-shot triggers in gameplay code, call `deactivateTriggerParameter` if the transition logic doesn’t auto-reset it.

## Notes
- Animators are evaluated on the main thread; `update` is called automatically by the engine, but manual invocation is available for custom sequencing.
- Culling: when `cullingMode` is `AnimatorCullingMode.Complete`, the Animator skips evaluation while all controlled renderers are culled.
- `AnimatorController` and `AnimationClip` assets are reference-counted; releasing them when unused avoids leaks.
- `StateMachineScript` instances are created per state and persisted until removed; dispose of them if you dynamically unload states.

## Advanced Animation Features

### AnimatorStateMachine Deep Dive

The `AnimatorStateMachine` is the core state management system that controls animation flow through states and transitions:

```typescript
import {
  AnimatorStateMachine,
  AnimatorState,
  AnimatorStateTransition,
  AnimatorConditionMode
} from "@galacean/engine";

// Create and configure state machine
const stateMachine = new AnimatorStateMachine();

// Add states
const idleState = stateMachine.addState("idle");
const walkState = stateMachine.addState("walk");
const runState = stateMachine.addState("run");
const jumpState = stateMachine.addState("jump");

// Set default state (auto-plays when controller starts)
stateMachine.defaultState = idleState;

// Configure state properties
idleState.clip = idleClip;
idleState.speed = 1.0;
idleState.wrapMode = WrapMode.Loop;

walkState.clip = walkClip;
walkState.speed = 1.2; // Play 20% faster
walkState.wrapMode = WrapMode.Loop;
```

#### State Transitions with Conditions

```typescript
// Create transition from idle to walk
const idleToWalk = new AnimatorStateTransition();
idleToWalk.destinationState = walkState;
idleToWalk.duration = 0.3;        // 0.3 second blend duration
idleToWalk.exitTime = 0.8;        // Start transition at 80% of idle animation
idleToWalk.hasExitTime = true;    // Require exit time condition
idleToWalk.offset = 0.1;          // Start walk animation 10% in

// Add parameter-based conditions
idleToWalk.addCondition("speed", AnimatorConditionMode.Greater, 0.1);
idleToWalk.addCondition("isGrounded", AnimatorConditionMode.If, true);

// Add transition to state
idleState.addTransition(idleToWalk);

// Complex multi-condition transition
const walkToRun = new AnimatorStateTransition();
walkToRun.destinationState = runState;
walkToRun.duration = 0.2;
walkToRun.hasExitTime = false;    // Immediate transition when conditions met

// Multiple conditions (ALL must be true)
walkToRun.addCondition("speed", AnimatorConditionMode.Greater, 0.5);
walkToRun.addCondition("stamina", AnimatorConditionMode.Greater, 20);
walkToRun.addCondition("canRun", AnimatorConditionMode.If, true);

walkState.addTransition(walkToRun);
```

#### Exit Transitions and Any State

```typescript
// Exit transition (returns to entry point)
const jumpToExit = jumpState.addExitTransition();
jumpToExit.duration = 0.1;
jumpToExit.addCondition("jumpFinished", AnimatorConditionMode.If, true);

// Any State transitions (can trigger from any current state)
const anyStateToJump = stateMachine.addAnyStateTransition(jumpState);
anyStateToJump.duration = 0.05;  // Quick transition for responsive jump
anyStateToJump.addCondition("jumpTrigger", AnimatorConditionMode.If, true);

// Entry state transitions (auto-play specific states)
stateMachine.addEntryStateTransition(idleState);
```

### AnimatorController Advanced Configuration

#### Multi-Layer Animation System

```typescript
const controller = new AnimatorController(engine);

// Base layer - full body locomotion
const baseLayer = new AnimatorControllerLayer("Base");
baseLayer.weight = 1.0;
baseLayer.blendingMode = AnimatorLayerBlendingMode.Override;
controller.addLayer(baseLayer);

// Upper body layer - additive arm animations
const upperBodyLayer = new AnimatorControllerLayer("UpperBody");
upperBodyLayer.weight = 0.8;
upperBodyLayer.blendingMode = AnimatorLayerBlendingMode.Additive;
controller.addLayer(upperBodyLayer);

// Face layer - override facial expressions
const faceLayer = new AnimatorControllerLayer("Face");
faceLayer.weight = 1.0;
faceLayer.blendingMode = AnimatorLayerBlendingMode.Override;
controller.addLayer(faceLayer);
```

#### Layer Masking System

```typescript
// Create layer mask to isolate specific bones
const upperBodyMask = AnimatorLayerMask.createByEntity(characterEntity);

// Enable/disable specific bone paths
upperBodyMask.setPathMaskActive("Root/Spine/Spine1", true, true);  // Include children
upperBodyMask.setPathMaskActive("Root/Spine/Spine1/LeftArm", true, true);
upperBodyMask.setPathMaskActive("Root/Spine/Spine1/RightArm", true, true);
upperBodyMask.setPathMaskActive("Root/Hips", false, true);         // Exclude hips and children

// Apply mask to layer
upperBodyLayer.mask = upperBodyMask;
```

#### Parameter Management System

```typescript
// Add different parameter types
const speedParam = controller.addParameter("speed", 0.0);           // Float
const isGroundedParam = controller.addParameter("isGrounded", true); // Boolean
const jumpTrigger = controller.addTriggerParameter("jump");          // Trigger
const stateIndex = controller.addParameter("currentState", 0);       // Integer

// Runtime parameter control
animator.setParameterValue("speed", inputMagnitude);
animator.setParameterValue("isGrounded", isOnGround);
animator.setParameterValue("currentState", 2);

// Trigger parameters (auto-reset after use)
if (jumpPressed) {
  animator.activateTriggerParameter("jump");
}

// Parameter queries
const currentSpeed = animator.getParameterValue("speed");
const canJump = animator.getParameterValue("isGrounded");
```

### Animation Events System

Animation events allow you to trigger script functions at specific times during animation playback:

```typescript
// Add events to animation clips
const walkClip = walkState.clip;

// Method 1: Direct event creation
const footstepEvent = new AnimationEvent();
footstepEvent.functionName = "onFootstep";
footstepEvent.time = 0.3;  // 30% through animation
footstepEvent.parameter = { foot: "left", volume: 0.8 };
walkClip.addEvent(footstepEvent);

// Method 2: Simplified event creation
walkClip.addEvent("onFootstep", 0.7, { foot: "right", volume: 0.8 });
walkClip.addEvent("onAnimationLoop", walkClip.length, null);

// Event handler script
class CharacterController extends Script {
  onFootstep(eventData: any): void {
    console.log(`Footstep: ${eventData.foot} foot, volume: ${eventData.volume}`);
    // Play footstep sound, spawn dust particles, etc.
    this.playFootstepSound(eventData.foot, eventData.volume);
  }

  onAnimationLoop(): void {
    console.log("Walk animation completed one loop");
    // Update step counter, check for animation changes, etc.
  }

  private playFootstepSound(foot: string, volume: number): void {
    // Implementation for playing footstep audio
  }
}
```

#### Event Management

```typescript
// Clear all events from a clip
walkClip.clearEvents();

// Events are automatically sorted by time when added
walkClip.addEvent("earlyEvent", 0.1, null);
walkClip.addEvent("lateEvent", 0.9, null);
walkClip.addEvent("middleEvent", 0.5, null);
// Events will fire in chronological order: earlyEvent -> middleEvent -> lateEvent

// Events with parameters
const attackClip = attackState.clip;
attackClip.addEvent("onAttackStart", 0.0, { attackType: "slash" });
attackClip.addEvent("onAttackHit", 0.6, { damage: 50, hitType: "critical" });
attackClip.addEvent("onAttackEnd", 1.0, { cooldown: 2.0 });
```

### StateMachineScript System

StateMachineScript provides lifecycle callbacks for animation states:

```typescript
// Custom state machine script
class CombatStateScript extends StateMachineScript {
  private weaponTrail: TrailRenderer;
  private hasTriggeredHit = false;

  onStateEnter(animator: Animator, state: AnimatorState, layerIndex: number): void {
    console.log(`Entering combat state: ${state.name}`);

    // Enable weapon trail effect
    this.weaponTrail = animator.entity.getComponent(TrailRenderer);
    if (this.weaponTrail) {
      this.weaponTrail.enabled = true;
    }

    // Set combat parameters
    animator.setParameterValue("inCombat", true);
    this.hasTriggeredHit = false;
  }

  onStateUpdate(animator: Animator, state: AnimatorState, layerIndex: number): void {
    // Called every frame while in this state
    const stateInfo = animator.getCurrentStateInfo(layerIndex);
    const normalizedTime = stateInfo.normalizedTime;

    // Trigger attack hit detection at 60% through animation
    if (normalizedTime >= 0.6 && !this.hasTriggeredHit) {
      this.triggerAttackHit();
      this.hasTriggeredHit = true;
    }

    // Dynamic parameter updates based on animation progress
    const attackIntensity = Math.sin(normalizedTime * Math.PI);
    animator.setParameterValue("attackIntensity", attackIntensity);
  }

  onStateExit(animator: Animator, state: AnimatorState, layerIndex: number): void {
    console.log(`Exiting combat state: ${state.name}`);

    // Disable weapon trail effect
    if (this.weaponTrail) {
      this.weaponTrail.enabled = false;
    }

    // Reset combat parameters
    animator.setParameterValue("inCombat", false);
    animator.setParameterValue("attackIntensity", 0);
  }

  private triggerAttackHit(): void {
    // Implementation for attack hit detection
    console.log("Attack hit triggered!");
  }
}

// Add script to animation state
const attackState = stateMachine.addState("attack");
attackState.addStateMachineScript(CombatStateScript);
```

#### Multiple Scripts per State

```typescript
// Add multiple scripts to handle different aspects
class EffectsScript extends StateMachineScript {
  onStateEnter(animator: Animator, state: AnimatorState, layerIndex: number): void {
    // Handle visual effects
    this.startParticleEffects();
  }

  onStateExit(animator: Animator, state: AnimatorState, layerIndex: number): void {
    // Clean up effects
    this.stopParticleEffects();
  }

  private startParticleEffects(): void { /* ... */ }
  private stopParticleEffects(): void { /* ... */ }
}

class AudioScript extends StateMachineScript {
  onStateEnter(animator: Animator, state: AnimatorState, layerIndex: number): void {
    // Handle audio
    this.playStateAudio();
  }

  private playStateAudio(): void { /* ... */ }
}

// Add both scripts to the same state
attackState.addStateMachineScript(CombatStateScript);
attackState.addStateMachineScript(EffectsScript);
attackState.addStateMachineScript(AudioScript);
```
