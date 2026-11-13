import { AnimationStateData } from "./AnimationStateData";
import { IntSet, Pool, Utils, MathUtils } from "./Utils";
import { Skeleton } from "./Skeleton";
import {
  MixBlend,
  AttachmentTimeline,
  MixDirection,
  RotateTimeline,
  DrawOrderTimeline,
  Timeline,
  EventTimeline
} from "./Animation";
import { Slot } from "./Slot";
import { Animation } from "./Animation";
import { Event } from "./Event";

/** Applies animations over time, queues animations for later playback, mixes (crossfading) between animations, and applies
 * multiple animations on top of each other (layering).
 *
 * See [Applying Animations](http://esotericsoftware.com/spine-applying-animations/) in the Spine Runtimes Guide. */
export class AnimationState {
  static emptyAnimation = new Animation("<empty>", [], 0);

  /** 1. A previously applied timeline has set this property.
   *
   * Result: Mix from the current pose to the timeline pose. */
  static SUBSEQUENT = 0;
  /** 1. This is the first timeline to set this property.
   * 2. The next track entry applied after this one does not have a timeline to set this property.
   *
   * Result: Mix from the setup pose to the timeline pose. */
  static FIRST = 1;
  /** 1) A previously applied timeline has set this property.<br>
   * 2) The next track entry to be applied does have a timeline to set this property.<br>
   * 3) The next track entry after that one does not have a timeline to set this property.<br>
   * Result: Mix from the current pose to the timeline pose, but do not mix out. This avoids "dipping" when crossfading
   * animations that key the same property. A subsequent timeline will set this property using a mix. */
  static HOLD_SUBSEQUENT = 2;
  /** 1) This is the first timeline to set this property.<br>
   * 2) The next track entry to be applied does have a timeline to set this property.<br>
   * 3) The next track entry after that one does not have a timeline to set this property.<br>
   * Result: Mix from the setup pose to the timeline pose, but do not mix out. This avoids "dipping" when crossfading animations
   * that key the same property. A subsequent timeline will set this property using a mix. */
  static HOLD_FIRST = 3;
  /** 1. This is the first timeline to set this property.
   * 2. The next track entry to be applied does have a timeline to set this property.
   * 3. The next track entry after that one does have a timeline to set this property.
   * 4. timelineHoldMix stores the first subsequent track entry that does not have a timeline to set this property.
   *
   * Result: The same as HOLD except the mix percentage from the timelineHoldMix track entry is used. This handles when more than
   * 2 track entries in a row have a timeline that sets the same property.
   *
   * Eg, A -> B -> C -> D where A, B, and C have a timeline setting same property, but D does not. When A is applied, to avoid
   * "dipping" A is not mixed out, however D (the first entry that doesn't set the property) mixing in is used to mix out A
   * (which affects B and C). Without using D to mix out, A would be applied fully until mixing completes, then snap into
   * place. */
  static HOLD_MIX = 4;

  static SETUP = 1;
  static CURRENT = 2;

  /** The AnimationStateData to look up mix durations. */
  data: AnimationStateData;

  /** The list of tracks that currently have animations, which may contain null entries. */
  tracks = new Array<TrackEntry>();

  /** Multiplier for the delta time when the animation state is updated, causing time for all animations and mixes to play slower
   * or faster. Defaults to 1.
   *
   * See TrackEntry {@link TrackEntry#timeScale} for affecting a single animation. */
  timeScale = 1;
  unkeyedState = 0;

  events = new Array<Event>();
  listeners = new Array<AnimationStateListener>();
  queue = new EventQueue(this);
  propertyIDs = new IntSet();
  animationsChanged = false;

  trackEntryPool = new Pool<TrackEntry>(() => new TrackEntry());

  constructor(data: AnimationStateData) {
    this.data = data;
  }

  /** Increments each track entry {@link TrackEntry#trackTime()}, setting queued animations as current if needed. */
  update(delta: number) {
    delta *= this.timeScale;
    const tracks = this.tracks;
    for (let i = 0, n = tracks.length; i < n; i++) {
      const current = tracks[i];
      if (current == null) continue;

      current.animationLast = current.nextAnimationLast;
      current.trackLast = current.nextTrackLast;

      let currentDelta = delta * current.timeScale;

      if (current.delay > 0) {
        current.delay -= currentDelta;
        if (current.delay > 0) continue;
        currentDelta = -current.delay;
        current.delay = 0;
      }

      let next = current.next;
      if (next != null) {
        // When the next entry's delay is passed, change to the next entry, preserving leftover time.
        const nextTime = current.trackLast - next.delay;
        if (nextTime >= 0) {
          next.delay = 0;
          next.trackTime += current.timeScale == 0 ? 0 : (nextTime / current.timeScale + delta) * next.timeScale;
          current.trackTime += currentDelta;
          this.setCurrent(i, next, true);
          while (next.mixingFrom != null) {
            next.mixTime += delta;
            next = next.mixingFrom;
          }
          continue;
        }
      } else if (current.trackLast >= current.trackEnd && current.mixingFrom == null) {
        tracks[i] = null;
        this.queue.end(current);
        this.disposeNext(current);
        continue;
      }
      if (current.mixingFrom != null && this.updateMixingFrom(current, delta)) {
        // End mixing from entries once all have completed.
        let from = current.mixingFrom;
        current.mixingFrom = null;
        if (from != null) from.mixingTo = null;
        while (from != null) {
          this.queue.end(from);
          from = from.mixingFrom;
        }
      }

      current.trackTime += currentDelta;
    }

    this.queue.drain();
  }

  /** Returns true when all mixing from entries are complete. */
  updateMixingFrom(to: TrackEntry, delta: number): boolean {
    const from = to.mixingFrom;
    if (from == null) return true;

    const finished = this.updateMixingFrom(from, delta);

    from.animationLast = from.nextAnimationLast;
    from.trackLast = from.nextTrackLast;

    // Require mixTime > 0 to ensure the mixing from entry was applied at least once.
    if (to.mixTime > 0 && to.mixTime >= to.mixDuration) {
      // Require totalAlpha == 0 to ensure mixing is complete, unless mixDuration == 0 (the transition is a single frame).
      if (from.totalAlpha == 0 || to.mixDuration == 0) {
        to.mixingFrom = from.mixingFrom;
        if (from.mixingFrom != null) from.mixingFrom.mixingTo = to;
        to.interruptAlpha = from.interruptAlpha;
        this.queue.end(from);
      }
      return finished;
    }

    from.trackTime += delta * from.timeScale;
    to.mixTime += delta;
    return false;
  }

  /** Poses the skeleton using the track entry animations. There are no side effects other than invoking listeners, so the
   * animation state can be applied to multiple skeletons to pose them identically.
   * @returns True if any animations were applied. */
  apply(skeleton: Skeleton): boolean {
    if (skeleton == null) throw new Error("skeleton cannot be null.");
    if (this.animationsChanged) this._animationsChanged();

    const events = this.events;
    const tracks = this.tracks;
    let applied = false;

    for (let i = 0, n = tracks.length; i < n; i++) {
      const current = tracks[i];
      if (current == null || current.delay > 0) continue;
      applied = true;
      const blend: MixBlend = i == 0 ? MixBlend.first : current.mixBlend;

      // Apply mixing from entries first.
      let mix = current.alpha;
      if (current.mixingFrom != null) mix *= this.applyMixingFrom(current, skeleton, blend);
      else if (current.trackTime >= current.trackEnd && current.next == null) mix = 0;

      // Apply current entry.
      const animationLast = current.animationLast,
        animationTime = current.getAnimationTime();
      const timelineCount = current.animation.timelines.length;
      const timelines = current.animation.timelines;
      if ((i == 0 && mix == 1) || blend == MixBlend.add) {
        for (let ii = 0; ii < timelineCount; ii++) {
          // Fixes issue #302 on IOS9 where mix, blend sometimes became undefined and caused assets
          // to sometimes stop rendering when using color correction, as their RGBA values become NaN.
          // (https://github.com/pixijs/pixi-spine/issues/302)
          Utils.webkit602BugfixHelper(mix, blend);
          const timeline = timelines[ii];
          if (timeline instanceof AttachmentTimeline)
            this.applyAttachmentTimeline(timeline, skeleton, animationTime, blend, true);
          else timeline.apply(skeleton, animationLast, animationTime, events, mix, blend, MixDirection.mixIn);
        }
      } else {
        const timelineMode = current.timelineMode;

        const firstFrame = current.timelinesRotation.length == 0;
        if (firstFrame) Utils.setArraySize(current.timelinesRotation, timelineCount << 1, null);
        const timelinesRotation = current.timelinesRotation;

        for (let ii = 0; ii < timelineCount; ii++) {
          const timeline = timelines[ii];
          const timelineBlend = timelineMode[ii] == AnimationState.SUBSEQUENT ? blend : MixBlend.setup;
          if (timeline instanceof RotateTimeline) {
            this.applyRotateTimeline(
              timeline,
              skeleton,
              animationTime,
              mix,
              timelineBlend,
              timelinesRotation,
              ii << 1,
              firstFrame
            );
          } else if (timeline instanceof AttachmentTimeline) {
            this.applyAttachmentTimeline(timeline, skeleton, animationTime, blend, true);
          } else {
            // This fixes the WebKit 602 specific issue described at http://esotericsoftware.com/forum/iOS-10-disappearing-graphics-10109
            Utils.webkit602BugfixHelper(mix, blend);
            timeline.apply(skeleton, animationLast, animationTime, events, mix, timelineBlend, MixDirection.mixIn);
          }
        }
      }
      this.queueEvents(current, animationTime);
      events.length = 0;
      current.nextAnimationLast = animationTime;
      current.nextTrackLast = current.trackTime;
    }

    // Set slots attachments to the setup pose, if needed. This occurs if an animation that is mixing out sets attachments so
    // subsequent timelines see any deform, but the subsequent timelines don't set an attachment (eg they are also mixing out or
    // the time is before the first key).
    const setupState = this.unkeyedState + AnimationState.SETUP;
    const slots = skeleton.slots;
    for (let i = 0, n = skeleton.slots.length; i < n; i++) {
      const slot = slots[i];
      if (slot.attachmentState == setupState) {
        const attachmentName = slot.data.attachmentName;
        slot.attachment = attachmentName == null ? null : skeleton.getAttachment(slot.data.index, attachmentName);
      }
    }
    this.unkeyedState += 2; // Increasing after each use avoids the need to reset attachmentState for every slot.

    this.queue.drain();
    return applied;
  }

  applyMixingFrom(to: TrackEntry, skeleton: Skeleton, blend: MixBlend) {
    const from = to.mixingFrom;
    if (from.mixingFrom != null) this.applyMixingFrom(from, skeleton, blend);

    let mix = 0;
    if (to.mixDuration == 0) {
      // Single frame mix to undo mixingFrom changes.
      mix = 1;
      if (blend == MixBlend.first) blend = MixBlend.setup;
    } else {
      mix = to.mixTime / to.mixDuration;
      if (mix > 1) mix = 1;
      if (blend != MixBlend.first) blend = from.mixBlend;
    }

    const events = mix < from.eventThreshold ? this.events : null;
    const attachments = mix < from.attachmentThreshold,
      drawOrder = mix < from.drawOrderThreshold;
    const animationLast = from.animationLast,
      animationTime = from.getAnimationTime();
    const timelineCount = from.animation.timelines.length;
    const timelines = from.animation.timelines;
    const alphaHold = from.alpha * to.interruptAlpha,
      alphaMix = alphaHold * (1 - mix);
    if (blend == MixBlend.add) {
      for (let i = 0; i < timelineCount; i++)
        timelines[i].apply(skeleton, animationLast, animationTime, events, alphaMix, blend, MixDirection.mixOut);
    } else {
      const timelineMode = from.timelineMode;
      const timelineHoldMix = from.timelineHoldMix;

      const firstFrame = from.timelinesRotation.length == 0;
      if (firstFrame) Utils.setArraySize(from.timelinesRotation, timelineCount << 1, null);
      const timelinesRotation = from.timelinesRotation;

      from.totalAlpha = 0;
      for (let i = 0; i < timelineCount; i++) {
        const timeline = timelines[i];
        let direction = MixDirection.mixOut;
        let timelineBlend: MixBlend;
        let alpha = 0;
        switch (timelineMode[i]) {
          case AnimationState.SUBSEQUENT:
            if (!drawOrder && timeline instanceof DrawOrderTimeline) continue;
            timelineBlend = blend;
            alpha = alphaMix;
            break;
          case AnimationState.FIRST:
            timelineBlend = MixBlend.setup;
            alpha = alphaMix;
            break;
          case AnimationState.HOLD_SUBSEQUENT:
            timelineBlend = blend;
            alpha = alphaHold;
            break;
          case AnimationState.HOLD_FIRST:
            timelineBlend = MixBlend.setup;
            alpha = alphaHold;
            break;
          default:
            timelineBlend = MixBlend.setup;
            const holdMix = timelineHoldMix[i];
            alpha = alphaHold * Math.max(0, 1 - holdMix.mixTime / holdMix.mixDuration);
            break;
        }
        from.totalAlpha += alpha;

        if (timeline instanceof RotateTimeline)
          this.applyRotateTimeline(
            timeline,
            skeleton,
            animationTime,
            alpha,
            timelineBlend,
            timelinesRotation,
            i << 1,
            firstFrame
          );
        else if (timeline instanceof AttachmentTimeline)
          this.applyAttachmentTimeline(timeline, skeleton, animationTime, timelineBlend, attachments);
        else {
          // This fixes the WebKit 602 specific issue described at http://esotericsoftware.com/forum/iOS-10-disappearing-graphics-10109
          Utils.webkit602BugfixHelper(alpha, blend);
          if (drawOrder && timeline instanceof DrawOrderTimeline && timelineBlend == MixBlend.setup)
            direction = MixDirection.mixIn;
          timeline.apply(skeleton, animationLast, animationTime, events, alpha, timelineBlend, direction);
        }
      }
    }

    if (to.mixDuration > 0) this.queueEvents(from, animationTime);
    this.events.length = 0;
    from.nextAnimationLast = animationTime;
    from.nextTrackLast = from.trackTime;

    return mix;
  }

  applyAttachmentTimeline(
    timeline: AttachmentTimeline,
    skeleton: Skeleton,
    time: number,
    blend: MixBlend,
    attachments: boolean
  ) {
    const slot = skeleton.slots[timeline.slotIndex];
    if (!slot.bone.active) return;

    const frames = timeline.frames;
    if (time < frames[0]) {
      // Time is before first frame.
      if (blend == MixBlend.setup || blend == MixBlend.first)
        this.setAttachment(skeleton, slot, slot.data.attachmentName, attachments);
    } else {
      let frameIndex;
      if (time >= frames[frames.length - 1])
        // Time is after last frame.
        frameIndex = frames.length - 1;
      else frameIndex = Animation.binarySearch(frames, time) - 1;
      this.setAttachment(skeleton, slot, timeline.attachmentNames[frameIndex], attachments);
    }

    // If an attachment wasn't set (ie before the first frame or attachments is false), set the setup attachment later.
    if (slot.attachmentState <= this.unkeyedState) slot.attachmentState = this.unkeyedState + AnimationState.SETUP;
  }

  setAttachment(skeleton: Skeleton, slot: Slot, attachmentName: string, attachments: boolean) {
    slot.attachment = attachmentName == null ? null : skeleton.getAttachment(slot.data.index, attachmentName);
    if (attachments) slot.attachmentState = this.unkeyedState + AnimationState.CURRENT;
  }

  applyRotateTimeline(
    timeline: Timeline,
    skeleton: Skeleton,
    time: number,
    alpha: number,
    blend: MixBlend,
    timelinesRotation: Array<number>,
    i: number,
    firstFrame: boolean
  ) {
    if (firstFrame) timelinesRotation[i] = 0;

    if (alpha == 1) {
      timeline.apply(skeleton, 0, time, null, 1, blend, MixDirection.mixIn);
      return;
    }

    const rotateTimeline = timeline as RotateTimeline;
    const frames = rotateTimeline.frames;
    const bone = skeleton.bones[rotateTimeline.boneIndex];
    if (!bone.active) return;
    let r1 = 0,
      r2 = 0;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          bone.rotation = bone.data.rotation;
        default:
          return;
        case MixBlend.first:
          r1 = bone.rotation;
          r2 = bone.data.rotation;
      }
    } else {
      r1 = blend == MixBlend.setup ? bone.data.rotation : bone.rotation;
      if (time >= frames[frames.length - RotateTimeline.ENTRIES])
        // Time is after last frame.
        r2 = bone.data.rotation + frames[frames.length + RotateTimeline.PREV_ROTATION];
      else {
        // Interpolate between the previous frame and the current frame.
        const frame = Animation.binarySearch(frames, time, RotateTimeline.ENTRIES);
        const prevRotation = frames[frame + RotateTimeline.PREV_ROTATION];
        const frameTime = frames[frame];
        const percent = rotateTimeline.getCurvePercent(
          (frame >> 1) - 1,
          1 - (time - frameTime) / (frames[frame + RotateTimeline.PREV_TIME] - frameTime)
        );

        r2 = frames[frame + RotateTimeline.ROTATION] - prevRotation;
        r2 -= (16384 - ((16384.499999999996 - r2 / 360) | 0)) * 360;
        r2 = prevRotation + r2 * percent + bone.data.rotation;
        r2 -= (16384 - ((16384.499999999996 - r2 / 360) | 0)) * 360;
      }
    }

    // Mix between rotations using the direction of the shortest route on the first frame while detecting crosses.
    let total = 0,
      diff = r2 - r1;
    diff -= (16384 - ((16384.499999999996 - diff / 360) | 0)) * 360;
    if (diff == 0) {
      total = timelinesRotation[i];
    } else {
      let lastTotal = 0,
        lastDiff = 0;
      if (firstFrame) {
        lastTotal = 0;
        lastDiff = diff;
      } else {
        lastTotal = timelinesRotation[i]; // Angle and direction of mix, including loops.
        lastDiff = timelinesRotation[i + 1]; // Difference between bones.
      }
      let current = diff > 0,
        dir = lastTotal >= 0;
      // Detect cross at 0 (not 180).
      if (MathUtils.signum(lastDiff) != MathUtils.signum(diff) && Math.abs(lastDiff) <= 90) {
        // A cross after a 360 rotation is a loop.
        if (Math.abs(lastTotal) > 180) lastTotal += 360 * MathUtils.signum(lastTotal);
        dir = current;
      }
      total = diff + lastTotal - (lastTotal % 360); // Store loops as part of lastTotal.
      if (dir != current) total += 360 * MathUtils.signum(lastTotal);
      timelinesRotation[i] = total;
    }
    timelinesRotation[i + 1] = diff;
    r1 += total * alpha;
    bone.rotation = r1 - (16384 - ((16384.499999999996 - r1 / 360) | 0)) * 360;
  }

  queueEvents(entry: TrackEntry, animationTime: number) {
    const animationStart = entry.animationStart,
      animationEnd = entry.animationEnd;
    const duration = animationEnd - animationStart;
    const trackLastWrapped = entry.trackLast % duration;

    // Queue events before complete.
    const events = this.events;
    let i = 0,
      n = events.length;
    for (; i < n; i++) {
      const event = events[i];
      if (event.time < trackLastWrapped) break;
      if (event.time > animationEnd) continue; // Discard events outside animation start/end.
      this.queue.event(entry, event);
    }

    // Queue complete if completed a loop iteration or the animation.
    let complete = false;
    if (entry.loop) complete = duration == 0 || trackLastWrapped > entry.trackTime % duration;
    else complete = animationTime >= animationEnd && entry.animationLast < animationEnd;
    if (complete) this.queue.complete(entry);

    // Queue events after complete.
    for (; i < n; i++) {
      const event = events[i];
      if (event.time < animationStart) continue; // Discard events outside animation start/end.
      this.queue.event(entry, events[i]);
    }
  }

  /** Removes all animations from all tracks, leaving skeletons in their current pose.
   *
   * It may be desired to use {@link AnimationState#setEmptyAnimation()} to mix the skeletons back to the setup pose,
   * rather than leaving them in their current pose. */
  clearTracks() {
    const oldDrainDisabled = this.queue.drainDisabled;
    this.queue.drainDisabled = true;
    for (let i = 0, n = this.tracks.length; i < n; i++) this.clearTrack(i);
    this.tracks.length = 0;
    this.queue.drainDisabled = oldDrainDisabled;
    this.queue.drain();
  }

  /** Removes all animations from the track, leaving skeletons in their current pose.
   *
   * It may be desired to use {@link AnimationState#setEmptyAnimation()} to mix the skeletons back to the setup pose,
   * rather than leaving them in their current pose. */
  clearTrack(trackIndex: number) {
    if (trackIndex >= this.tracks.length) return;
    const current = this.tracks[trackIndex];
    if (current == null) return;

    this.queue.end(current);

    this.disposeNext(current);

    let entry = current;
    while (true) {
      const from = entry.mixingFrom;
      if (from == null) break;
      this.queue.end(from);
      entry.mixingFrom = null;
      entry.mixingTo = null;
      entry = from;
    }

    this.tracks[current.trackIndex] = null;

    this.queue.drain();
  }

  setCurrent(index: number, current: TrackEntry, interrupt: boolean) {
    const from = this.expandToIndex(index);
    this.tracks[index] = current;

    if (from != null) {
      if (interrupt) this.queue.interrupt(from);
      current.mixingFrom = from;
      from.mixingTo = current;
      current.mixTime = 0;

      // Store the interrupted mix percentage.
      if (from.mixingFrom != null && from.mixDuration > 0)
        current.interruptAlpha *= Math.min(1, from.mixTime / from.mixDuration);

      from.timelinesRotation.length = 0; // Reset rotation for mixing out, in case entry was mixed in.
    }

    this.queue.start(current);
  }

  /** Sets an animation by name.
   *
   * {@link #setAnimationWith(}. */
  setAnimation(trackIndex: number, animationName: string, loop: boolean) {
    const animation = this.data.skeletonData.findAnimation(animationName);
    if (animation == null) throw new Error("Animation not found: " + animationName);
    return this.setAnimationWith(trackIndex, animation, loop);
  }

  /** Sets the current animation for a track, discarding any queued animations. If the formerly current track entry was never
   * applied to a skeleton, it is replaced (not mixed from).
   * @param loop If true, the animation will repeat. If false it will not, instead its last frame is applied if played beyond its
   *           duration. In either case {@link TrackEntry#trackEnd} determines when the track is cleared.
   * @returns A track entry to allow further customization of animation playback. References to the track entry must not be kept
   *         after the {@link AnimationStateListener#dispose()} event occurs. */
  setAnimationWith(trackIndex: number, animation: Animation, loop: boolean) {
    if (animation == null) throw new Error("animation cannot be null.");
    let interrupt = true;
    let current = this.expandToIndex(trackIndex);
    if (current != null) {
      if (current.nextTrackLast == -1) {
        // Don't mix from an entry that was never applied.
        this.tracks[trackIndex] = current.mixingFrom;
        this.queue.interrupt(current);
        this.queue.end(current);
        this.disposeNext(current);
        current = current.mixingFrom;
        interrupt = false;
      } else this.disposeNext(current);
    }
    const entry = this.trackEntry(trackIndex, animation, loop, current);
    this.setCurrent(trackIndex, entry, interrupt);
    this.queue.drain();
    return entry;
  }

  /** Queues an animation by name.
   *
   * See {@link #addAnimationWith()}. */
  addAnimation(trackIndex: number, animationName: string, loop: boolean, delay: number) {
    const animation = this.data.skeletonData.findAnimation(animationName);
    if (animation == null) throw new Error("Animation not found: " + animationName);
    return this.addAnimationWith(trackIndex, animation, loop, delay);
  }

  /** Adds an animation to be played after the current or last queued animation for a track. If the track is empty, it is
   * equivalent to calling {@link #setAnimationWith()}.
   * @param delay If > 0, sets {@link TrackEntry#delay}. If <= 0, the delay set is the duration of the previous track entry
   *           minus any mix duration (from the {@link AnimationStateData}) plus the specified `delay` (ie the mix
   *           ends at (`delay` = 0) or before (`delay` < 0) the previous track entry duration). If the
   *           previous entry is looping, its next loop completion is used instead of its duration.
   * @returns A track entry to allow further customization of animation playback. References to the track entry must not be kept
   *         after the {@link AnimationStateListener#dispose()} event occurs. */
  addAnimationWith(trackIndex: number, animation: Animation, loop: boolean, delay: number) {
    if (animation == null) throw new Error("animation cannot be null.");

    let last = this.expandToIndex(trackIndex);
    if (last != null) {
      while (last.next != null) last = last.next;
    }

    const entry = this.trackEntry(trackIndex, animation, loop, last);

    if (last == null) {
      this.setCurrent(trackIndex, entry, true);
      this.queue.drain();
    } else {
      last.next = entry;
      if (delay <= 0) {
        const duration = last.animationEnd - last.animationStart;
        if (duration != 0) {
          if (last.loop) delay += duration * (1 + ((last.trackTime / duration) | 0));
          else delay += Math.max(duration, last.trackTime);
          delay -= this.data.getMix(last.animation, animation);
        } else delay = last.trackTime;
      }
    }

    entry.delay = delay;
    return entry;
  }

  /** Sets an empty animation for a track, discarding any queued animations, and sets the track entry's
   * {@link TrackEntry#mixduration}. An empty animation has no timelines and serves as a placeholder for mixing in or out.
   *
   * Mixing out is done by setting an empty animation with a mix duration using either {@link #setEmptyAnimation()},
   * {@link #setEmptyAnimations()}, or {@link #addEmptyAnimation()}. Mixing to an empty animation causes
   * the previous animation to be applied less and less over the mix duration. Properties keyed in the previous animation
   * transition to the value from lower tracks or to the setup pose value if no lower tracks key the property. A mix duration of
   * 0 still mixes out over one frame.
   *
   * Mixing in is done by first setting an empty animation, then adding an animation using
   * {@link #addAnimation()} and on the returned track entry, set the
   * {@link TrackEntry#setMixDuration()}. Mixing from an empty animation causes the new animation to be applied more and
   * more over the mix duration. Properties keyed in the new animation transition from the value from lower tracks or from the
   * setup pose value if no lower tracks key the property to the value keyed in the new animation. */
  setEmptyAnimation(trackIndex: number, mixDuration: number) {
    const entry = this.setAnimationWith(trackIndex, AnimationState.emptyAnimation, false);
    entry.mixDuration = mixDuration;
    entry.trackEnd = mixDuration;
    return entry;
  }

  /** Adds an empty animation to be played after the current or last queued animation for a track, and sets the track entry's
   * {@link TrackEntry#mixDuration}. If the track is empty, it is equivalent to calling
   * {@link #setEmptyAnimation()}.
   *
   * See {@link #setEmptyAnimation()}.
   * @param delay If > 0, sets {@link TrackEntry#delay}. If <= 0, the delay set is the duration of the previous track entry
   *           minus any mix duration plus the specified `delay` (ie the mix ends at (`delay` = 0) or
   *           before (`delay` < 0) the previous track entry duration). If the previous entry is looping, its next
   *           loop completion is used instead of its duration.
   * @return A track entry to allow further customization of animation playback. References to the track entry must not be kept
   *         after the {@link AnimationStateListener#dispose()} event occurs. */
  addEmptyAnimation(trackIndex: number, mixDuration: number, delay: number) {
    if (delay <= 0) delay -= mixDuration;
    const entry = this.addAnimationWith(trackIndex, AnimationState.emptyAnimation, false, delay);
    entry.mixDuration = mixDuration;
    entry.trackEnd = mixDuration;
    return entry;
  }

  /** Sets an empty animation for every track, discarding any queued animations, and mixes to it over the specified mix
   * duration. */
  setEmptyAnimations(mixDuration: number) {
    const oldDrainDisabled = this.queue.drainDisabled;
    this.queue.drainDisabled = true;
    for (let i = 0, n = this.tracks.length; i < n; i++) {
      const current = this.tracks[i];
      if (current != null) this.setEmptyAnimation(current.trackIndex, mixDuration);
    }
    this.queue.drainDisabled = oldDrainDisabled;
    this.queue.drain();
  }

  expandToIndex(index: number) {
    if (index < this.tracks.length) return this.tracks[index];
    Utils.ensureArrayCapacity(this.tracks, index + 1, null);
    this.tracks.length = index + 1;
    return null;
  }

  /** @param last May be null. */
  trackEntry(trackIndex: number, animation: Animation, loop: boolean, last: TrackEntry) {
    const entry = this.trackEntryPool.obtain();
    entry.trackIndex = trackIndex;
    entry.animation = animation;
    entry.loop = loop;
    entry.holdPrevious = false;

    entry.eventThreshold = 0;
    entry.attachmentThreshold = 0;
    entry.drawOrderThreshold = 0;

    entry.animationStart = 0;
    entry.animationEnd = animation.duration;
    entry.animationLast = -1;
    entry.nextAnimationLast = -1;

    entry.delay = 0;
    entry.trackTime = 0;
    entry.trackLast = -1;
    entry.nextTrackLast = -1;
    entry.trackEnd = Number.MAX_VALUE;
    entry.timeScale = 1;

    entry.alpha = 1;
    entry.interruptAlpha = 1;
    entry.mixTime = 0;
    entry.mixDuration = last == null ? 0 : this.data.getMix(last.animation, animation);
    entry.mixBlend = MixBlend.replace;
    return entry;
  }

  disposeNext(entry: TrackEntry) {
    let next = entry.next;
    while (next != null) {
      this.queue.dispose(next);
      next = next.next;
    }
    entry.next = null;
  }

  _animationsChanged() {
    this.animationsChanged = false;

    this.propertyIDs.clear();

    for (let i = 0, n = this.tracks.length; i < n; i++) {
      let entry = this.tracks[i];
      if (entry == null) continue;
      while (entry.mixingFrom != null) entry = entry.mixingFrom;

      do {
        if (entry.mixingFrom == null || entry.mixBlend != MixBlend.add) this.computeHold(entry);
        entry = entry.mixingTo;
      } while (entry != null);
    }
  }

  computeHold(entry: TrackEntry) {
    const to = entry.mixingTo;
    const timelines = entry.animation.timelines;
    const timelinesCount = entry.animation.timelines.length;
    const timelineMode = Utils.setArraySize(entry.timelineMode, timelinesCount);
    entry.timelineHoldMix.length = 0;
    const timelineDipMix = Utils.setArraySize(entry.timelineHoldMix, timelinesCount);
    const propertyIDs = this.propertyIDs;

    if (to != null && to.holdPrevious) {
      for (let i = 0; i < timelinesCount; i++) {
        timelineMode[i] = propertyIDs.add(timelines[i].getPropertyId())
          ? AnimationState.HOLD_FIRST
          : AnimationState.HOLD_SUBSEQUENT;
      }
      return;
    }

    outer: for (let i = 0; i < timelinesCount; i++) {
      const timeline = timelines[i];
      const id = timeline.getPropertyId();
      if (!propertyIDs.add(id)) timelineMode[i] = AnimationState.SUBSEQUENT;
      else if (
        to == null ||
        timeline instanceof AttachmentTimeline ||
        timeline instanceof DrawOrderTimeline ||
        timeline instanceof EventTimeline ||
        !to.animation.hasTimeline(id)
      ) {
        timelineMode[i] = AnimationState.FIRST;
      } else {
        for (let next = to.mixingTo; next != null; next = next.mixingTo) {
          if (next.animation.hasTimeline(id)) continue;
          if (entry.mixDuration > 0) {
            timelineMode[i] = AnimationState.HOLD_MIX;
            timelineDipMix[i] = next;
            continue outer;
          }
          break;
        }
        timelineMode[i] = AnimationState.HOLD_FIRST;
      }
    }
  }

  /** Returns the track entry for the animation currently playing on the track, or null if no animation is currently playing. */
  getCurrent(trackIndex: number) {
    if (trackIndex >= this.tracks.length) return null;
    return this.tracks[trackIndex];
  }

  /** Adds a listener to receive events for all track entries. */
  addListener(listener: AnimationStateListener) {
    if (listener == null) throw new Error("listener cannot be null.");
    this.listeners.push(listener);
  }

  /** Removes the listener added with {@link #addListener()}. */
  removeListener(listener: AnimationStateListener) {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  }

  /** Removes all listeners added with {@link #addListener()}. */
  clearListeners() {
    this.listeners.length = 0;
  }

  /** Discards all listener notifications that have not yet been delivered. This can be useful to call from an
   * {@link AnimationStateListener} when it is known that further notifications that may have been already queued for delivery
   * are not wanted because new animations are being set. */
  clearListenerNotifications() {
    this.queue.clear();
  }
}

/** Stores settings and other state for the playback of an animation on an {@link AnimationState} track.
 *
 * References to a track entry must not be kept after the {@link AnimationStateListener#dispose()} event occurs. */
export class TrackEntry {
  /** The animation to apply for this track entry. */
  animation: Animation;

  /** The animation queued to start after this animation, or null. `next` makes up a linked list. */
  next: TrackEntry;

  /** The track entry for the previous animation when mixing from the previous animation to this animation, or null if no
   * mixing is currently occuring. When mixing from multiple animations, `mixingFrom` makes up a linked list. */
  mixingFrom: TrackEntry;

  /** The track entry for the next animation when mixing from this animation to the next animation, or null if no mixing is
   * currently occuring. When mixing to multiple animations, `mixingTo` makes up a linked list. */
  mixingTo: TrackEntry;

  /** The listener for events generated by this track entry, or null.
   *
   * A track entry returned from {@link AnimationState#setAnimation()} is already the current animation
   * for the track, so the track entry listener {@link AnimationStateListener#start()} will not be called. */
  listener: AnimationStateListener;

  /** The index of the track where this track entry is either current or queued.
   *
   * See {@link AnimationState#getCurrent()}. */
  trackIndex: number;

  /** If true, the animation will repeat. If false it will not, instead its last frame is applied if played beyond its
   * duration. */
  loop: boolean;

  /** If true, when mixing from the previous animation to this animation, the previous animation is applied as normal instead
   * of being mixed out.
   *
   * When mixing between animations that key the same property, if a lower track also keys that property then the value will
   * briefly dip toward the lower track value during the mix. This happens because the first animation mixes from 100% to 0%
   * while the second animation mixes from 0% to 100%. Setting `holdPrevious` to true applies the first animation
   * at 100% during the mix so the lower track value is overwritten. Such dipping does not occur on the lowest track which
   * keys the property, only when a higher track also keys the property.
   *
   * Snapping will occur if `holdPrevious` is true and this animation does not key all the same properties as the
   * previous animation. */
  holdPrevious: boolean;

  /** When the mix percentage ({@link #mixTime} / {@link #mixDuration}) is less than the
   * `eventThreshold`, event timelines are applied while this animation is being mixed out. Defaults to 0, so event
   * timelines are not applied while this animation is being mixed out. */
  eventThreshold: number;

  /** When the mix percentage ({@link #mixtime} / {@link #mixDuration}) is less than the
   * `attachmentThreshold`, attachment timelines are applied while this animation is being mixed out. Defaults to
   * 0, so attachment timelines are not applied while this animation is being mixed out. */
  attachmentThreshold: number;

  /** When the mix percentage ({@link #mixTime} / {@link #mixDuration}) is less than the
   * `drawOrderThreshold`, draw order timelines are applied while this animation is being mixed out. Defaults to 0,
   * so draw order timelines are not applied while this animation is being mixed out. */
  drawOrderThreshold: number;

  /** Seconds when this animation starts, both initially and after looping. Defaults to 0.
   *
   * When changing the `animationStart` time, it often makes sense to set {@link #animationLast} to the same
   * value to prevent timeline keys before the start time from triggering. */
  animationStart: number;

  /** Seconds for the last frame of this animation. Non-looping animations won't play past this time. Looping animations will
   * loop back to {@link #animationStart} at this time. Defaults to the animation {@link Animation#duration}. */
  animationEnd: number;

  /** The time in seconds this animation was last applied. Some timelines use this for one-time triggers. Eg, when this
   * animation is applied, event timelines will fire all events between the `animationLast` time (exclusive) and
   * `animationTime` (inclusive). Defaults to -1 to ensure triggers on frame 0 happen the first time this animation
   * is applied. */
  animationLast: number;

  nextAnimationLast: number;

  /** Seconds to postpone playing the animation. When this track entry is the current track entry, `delay`
   * postpones incrementing the {@link #trackTime}. When this track entry is queued, `delay` is the time from
   * the start of the previous animation to when this track entry will become the current track entry (ie when the previous
   * track entry {@link TrackEntry#trackTime} >= this track entry's `delay`).
   *
   * {@link #timeScale} affects the delay. */
  delay: number;

  /** Current time in seconds this track entry has been the current track entry. The track time determines
   * {@link #animationTime}. The track time can be set to start the animation at a time other than 0, without affecting
   * looping. */
  trackTime: number;

  trackLast: number;
  nextTrackLast: number;

  /** The track time in seconds when this animation will be removed from the track. Defaults to the highest possible float
   * value, meaning the animation will be applied until a new animation is set or the track is cleared. If the track end time
   * is reached, no other animations are queued for playback, and mixing from any previous animations is complete, then the
   * properties keyed by the animation are set to the setup pose and the track is cleared.
   *
   * It may be desired to use {@link AnimationState#addEmptyAnimation()} rather than have the animation
   * abruptly cease being applied. */
  trackEnd: number;

  /** Multiplier for the delta time when this track entry is updated, causing time for this animation to pass slower or
   * faster. Defaults to 1.
   *
   * {@link #mixTime} is not affected by track entry time scale, so {@link #mixDuration} may need to be adjusted to
   * match the animation speed.
   *
   * When using {@link AnimationState#addAnimation()} with a `delay` <= 0, note the
   * {@link #delay} is set using the mix duration from the {@link AnimationStateData}, assuming time scale to be 1. If
   * the time scale is not 1, the delay may need to be adjusted.
   *
   * See AnimationState {@link AnimationState#timeScale} for affecting all animations. */
  timeScale: number;

  /** Values < 1 mix this animation with the skeleton's current pose (usually the pose resulting from lower tracks). Defaults
   * to 1, which overwrites the skeleton's current pose with this animation.
   *
   * Typically track 0 is used to completely pose the skeleton, then alpha is used on higher tracks. It doesn't make sense to
   * use alpha on track 0 if the skeleton pose is from the last frame render. */
  alpha: number;

  /** Seconds from 0 to the {@link #getMixDuration()} when mixing from the previous animation to this animation. May be
   * slightly more than `mixDuration` when the mix is complete. */
  mixTime: number;

  /** Seconds for mixing from the previous animation to this animation. Defaults to the value provided by AnimationStateData
   * {@link AnimationStateData#getMix()} based on the animation before this animation (if any).
   *
   * A mix duration of 0 still mixes out over one frame to provide the track entry being mixed out a chance to revert the
   * properties it was animating.
   *
   * The `mixDuration` can be set manually rather than use the value from
   * {@link AnimationStateData#getMix()}. In that case, the `mixDuration` can be set for a new
   * track entry only before {@link AnimationState#update(float)} is first called.
   *
   * When using {@link AnimationState#addAnimation()} with a `delay` <= 0, note the
   * {@link #delay} is set using the mix duration from the {@link AnimationStateData}, not a mix duration set
   * afterward. */
  mixDuration: number;
  interruptAlpha: number;
  totalAlpha: number;

  /** Controls how properties keyed in the animation are mixed with lower tracks. Defaults to {@link MixBlend#replace}, which
   * replaces the values from the lower tracks with the animation values. {@link MixBlend#add} adds the animation values to
   * the values from the lower tracks.
   *
   * The `mixBlend` can be set for a new track entry only before {@link AnimationState#apply()} is first
   * called. */
  mixBlend = MixBlend.replace;
  timelineMode = new Array<number>();
  timelineHoldMix = new Array<TrackEntry>();
  timelinesRotation = new Array<number>();

  reset() {
    this.next = null;
    this.mixingFrom = null;
    this.mixingTo = null;
    this.animation = null;
    this.listener = null;
    this.timelineMode.length = 0;
    this.timelineHoldMix.length = 0;
    this.timelinesRotation.length = 0;
  }

  /** Uses {@link #trackTime} to compute the `animationTime`, which is between {@link #animationStart}
   * and {@link #animationEnd}. When the `trackTime` is 0, the `animationTime` is equal to the
   * `animationStart` time. */
  getAnimationTime() {
    if (this.loop) {
      const duration = this.animationEnd - this.animationStart;
      if (duration == 0) return this.animationStart;
      return (this.trackTime % duration) + this.animationStart;
    }
    return Math.min(this.trackTime + this.animationStart, this.animationEnd);
  }

  setAnimationLast(animationLast: number) {
    this.animationLast = animationLast;
    this.nextAnimationLast = animationLast;
  }

  /** Returns true if at least one loop has been completed.
   *
   * See {@link AnimationStateListener#complete()}. */
  isComplete() {
    return this.trackTime >= this.animationEnd - this.animationStart;
  }

  /** Resets the rotation directions for mixing this entry's rotate timelines. This can be useful to avoid bones rotating the
   * long way around when using {@link #alpha} and starting animations on other tracks.
   *
   * Mixing with {@link MixBlend#replace} involves finding a rotation between two others, which has two possible solutions:
   * the short way or the long way around. The two rotations likely change over time, so which direction is the short or long
   * way also changes. If the short way was always chosen, bones would flip to the other side when that direction became the
   * long way. TrackEntry chooses the short way the first time it is applied and remembers that direction. */
  resetRotationDirections() {
    this.timelinesRotation.length = 0;
  }
}

export class EventQueue {
  objects: Array<any> = [];
  drainDisabled = false;
  animState: AnimationState;

  constructor(animState: AnimationState) {
    this.animState = animState;
  }

  start(entry: TrackEntry) {
    this.objects.push(EventType.start);
    this.objects.push(entry);
    this.animState.animationsChanged = true;
  }

  interrupt(entry: TrackEntry) {
    this.objects.push(EventType.interrupt);
    this.objects.push(entry);
  }

  end(entry: TrackEntry) {
    this.objects.push(EventType.end);
    this.objects.push(entry);
    this.animState.animationsChanged = true;
  }

  dispose(entry: TrackEntry) {
    this.objects.push(EventType.dispose);
    this.objects.push(entry);
  }

  complete(entry: TrackEntry) {
    this.objects.push(EventType.complete);
    this.objects.push(entry);
  }

  event(entry: TrackEntry, event: Event) {
    this.objects.push(EventType.event);
    this.objects.push(entry);
    this.objects.push(event);
  }

  drain() {
    if (this.drainDisabled) return;
    this.drainDisabled = true;

    const objects = this.objects;
    const listeners = this.animState.listeners;

    for (let i = 0; i < objects.length; i += 2) {
      const type = objects[i] as EventType;
      const entry = objects[i + 1] as TrackEntry;
      switch (type) {
        case EventType.start:
          if (entry.listener != null && entry.listener.start) entry.listener.start(entry);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].start) listeners[ii].start(entry);
          break;
        case EventType.interrupt:
          if (entry.listener != null && entry.listener.interrupt) entry.listener.interrupt(entry);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].interrupt) listeners[ii].interrupt(entry);
          break;
        case EventType.end:
          if (entry.listener != null && entry.listener.end) entry.listener.end(entry);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].end) listeners[ii].end(entry);
        // Fall through.
        case EventType.dispose:
          if (entry.listener != null && entry.listener.dispose) entry.listener.dispose(entry);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].dispose) listeners[ii].dispose(entry);
          this.animState.trackEntryPool.free(entry);
          break;
        case EventType.complete:
          if (entry.listener != null && entry.listener.complete) entry.listener.complete(entry);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].complete) listeners[ii].complete(entry);
          break;
        case EventType.event:
          const event = objects[i++ + 2] as Event;
          if (entry.listener != null && entry.listener.event) entry.listener.event(entry, event);
          for (let ii = 0; ii < listeners.length; ii++) if (listeners[ii].event) listeners[ii].event(entry, event);
          break;
      }
    }
    this.clear();

    this.drainDisabled = false;
  }

  clear() {
    this.objects.length = 0;
  }
}

export enum EventType {
  start,
  interrupt,
  end,
  dispose,
  complete,
  event
}

/** The interface to implement for receiving TrackEntry events. It is always safe to call AnimationState methods when receiving
 * events.
 *
 * See TrackEntry {@link TrackEntry#listener} and AnimationState
 * {@link AnimationState#addListener()}. */
export interface AnimationStateListener {
  /** Invoked when this entry has been set as the current entry. */
  start(entry: TrackEntry): void;

  /** Invoked when another entry has replaced this entry as the current entry. This entry may continue being applied for
   * mixing. */
  interrupt(entry: TrackEntry): void;

  /** Invoked when this entry is no longer the current entry and will never be applied again. */
  end(entry: TrackEntry): void;

  /** Invoked when this entry will be disposed. This may occur without the entry ever being set as the current entry.
   * References to the entry should not be kept after dispose is called, as it may be destroyed or reused. */
  dispose(entry: TrackEntry): void;

  /** Invoked every time this entry's animation completes a loop. */
  complete(entry: TrackEntry): void;

  /** Invoked when this entry's animation triggers an event. */
  event(entry: TrackEntry, event: Event): void;
}

export abstract class AnimationStateAdapter implements AnimationStateListener {
  start(entry: TrackEntry) {}

  interrupt(entry: TrackEntry) {}

  end(entry: TrackEntry) {}

  dispose(entry: TrackEntry) {}

  complete(entry: TrackEntry) {}

  event(entry: TrackEntry, event: Event) {}
}
