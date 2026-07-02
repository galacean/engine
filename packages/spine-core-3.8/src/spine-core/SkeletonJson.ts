import { AttachmentLoader } from "./attachments/AttachmentLoader";
import { SkeletonData } from "./SkeletonData";
import { BoneData, TransformMode } from "./BoneData";
import { SlotData } from "./SlotData";
import { Color, Utils, ArrayLike } from "./Utils";
import { IkConstraintData } from "./IkConstraintData";
import { TransformConstraintData } from "./TransformConstraintData";
import { PathConstraintData, PositionMode, SpacingMode, RotateMode } from "./PathConstraintData";
import { Skin } from "./Skin";
import { VertexAttachment, Attachment } from "./attachments/Attachment";
import { MeshAttachment } from "./attachments/MeshAttachment";
import { EventData } from "./EventData";
import {
  Timeline,
  AttachmentTimeline,
  ColorTimeline,
  TwoColorTimeline,
  RotateTimeline,
  TranslateTimeline,
  ScaleTimeline,
  ShearTimeline,
  IkConstraintTimeline,
  TransformConstraintTimeline,
  PathConstraintPositionTimeline,
  PathConstraintSpacingTimeline,
  PathConstraintMixTimeline,
  DeformTimeline,
  DrawOrderTimeline,
  EventTimeline,
  CurveTimeline
} from "./Animation";
import { BlendMode } from "./BlendMode";
import { Event } from "./Event";
import { Animation } from "./Animation";

/** Loads skeleton data in the Spine JSON format.
 *
 * See [Spine JSON format](http://esotericsoftware.com/spine-json-format) and
 * [JSON and binary data](http://esotericsoftware.com/spine-loading-skeleton-data#JSON-and-binary-data) in the Spine
 * Runtimes Guide. */
export class SkeletonJson {
  attachmentLoader: AttachmentLoader;

  /** Scales bone positions, image sizes, and translations as they are loaded. This allows different size images to be used at
   * runtime than were used in Spine.
   *
   * See [Scaling](http://esotericsoftware.com/spine-loading-skeleton-data#Scaling) in the Spine Runtimes Guide. */
  scale = 1;
  private linkedMeshes = new Array<LinkedMesh>();

  constructor(attachmentLoader: AttachmentLoader) {
    this.attachmentLoader = attachmentLoader;
  }

  readSkeletonData(json: string | any): SkeletonData {
    const scale = this.scale;
    const skeletonData = new SkeletonData();
    const root = typeof json === "string" ? JSON.parse(json) : json;

    // Skeleton
    const skeletonMap = root.skeleton;
    if (skeletonMap != null) {
      skeletonData.hash = skeletonMap.hash;
      skeletonData.version = skeletonMap.spine;
      if ("3.8.75" == skeletonData.version)
        throw new Error("Unsupported skeleton data, please export with a newer version of Spine.");
      skeletonData.x = skeletonMap.x;
      skeletonData.y = skeletonMap.y;
      skeletonData.width = skeletonMap.width;
      skeletonData.height = skeletonMap.height;
      skeletonData.fps = skeletonMap.fps;
      skeletonData.imagesPath = skeletonMap.images;
    }

    // Bones
    if (root.bones) {
      for (let i = 0; i < root.bones.length; i++) {
        const boneMap = root.bones[i];

        let parent: BoneData = null;
        const parentName: string = this.getValue(boneMap, "parent", null);
        if (parentName != null) {
          parent = skeletonData.findBone(parentName);
          if (parent == null) throw new Error("Parent bone not found: " + parentName);
        }
        const data = new BoneData(skeletonData.bones.length, boneMap.name, parent);
        data.length = this.getValue(boneMap, "length", 0) * scale;
        data.x = this.getValue(boneMap, "x", 0) * scale;
        data.y = this.getValue(boneMap, "y", 0) * scale;
        data.rotation = this.getValue(boneMap, "rotation", 0);
        data.scaleX = this.getValue(boneMap, "scaleX", 1);
        data.scaleY = this.getValue(boneMap, "scaleY", 1);
        data.shearX = this.getValue(boneMap, "shearX", 0);
        data.shearY = this.getValue(boneMap, "shearY", 0);
        data.transformMode = SkeletonJson.transformModeFromString(this.getValue(boneMap, "transform", "normal"));
        data.skinRequired = this.getValue(boneMap, "skin", false);

        skeletonData.bones.push(data);
      }
    }

    // Slots.
    if (root.slots) {
      for (let i = 0; i < root.slots.length; i++) {
        const slotMap = root.slots[i];
        const slotName: string = slotMap.name;
        const boneName: string = slotMap.bone;
        const boneData = skeletonData.findBone(boneName);
        if (boneData == null) throw new Error("Slot bone not found: " + boneName);
        const data = new SlotData(skeletonData.slots.length, slotName, boneData);

        const color: string = this.getValue(slotMap, "color", null);
        if (color != null) data.color.setFromString(color);

        const dark: string = this.getValue(slotMap, "dark", null);
        if (dark != null) {
          data.darkColor = new Color(1, 1, 1, 1);
          data.darkColor.setFromString(dark);
        }

        data.attachmentName = this.getValue(slotMap, "attachment", null);
        data.blendMode = SkeletonJson.blendModeFromString(this.getValue(slotMap, "blend", "normal"));
        skeletonData.slots.push(data);
      }
    }

    // IK constraints
    if (root.ik) {
      for (let i = 0; i < root.ik.length; i++) {
        const constraintMap = root.ik[i];
        const data = new IkConstraintData(constraintMap.name);
        data.order = this.getValue(constraintMap, "order", 0);
        data.skinRequired = this.getValue(constraintMap, "skin", false);

        for (let j = 0; j < constraintMap.bones.length; j++) {
          const boneName = constraintMap.bones[j];
          const bone = skeletonData.findBone(boneName);
          if (bone == null) throw new Error("IK bone not found: " + boneName);
          data.bones.push(bone);
        }

        const targetName: string = constraintMap.target;
        data.target = skeletonData.findBone(targetName);
        if (data.target == null) throw new Error("IK target bone not found: " + targetName);

        data.mix = this.getValue(constraintMap, "mix", 1);
        data.softness = this.getValue(constraintMap, "softness", 0) * scale;
        data.bendDirection = this.getValue(constraintMap, "bendPositive", true) ? 1 : -1;
        data.compress = this.getValue(constraintMap, "compress", false);
        data.stretch = this.getValue(constraintMap, "stretch", false);
        data.uniform = this.getValue(constraintMap, "uniform", false);

        skeletonData.ikConstraints.push(data);
      }
    }

    // Transform constraints.
    if (root.transform) {
      for (let i = 0; i < root.transform.length; i++) {
        const constraintMap = root.transform[i];
        const data = new TransformConstraintData(constraintMap.name);
        data.order = this.getValue(constraintMap, "order", 0);
        data.skinRequired = this.getValue(constraintMap, "skin", false);

        for (let j = 0; j < constraintMap.bones.length; j++) {
          const boneName = constraintMap.bones[j];
          const bone = skeletonData.findBone(boneName);
          if (bone == null) throw new Error("Transform constraint bone not found: " + boneName);
          data.bones.push(bone);
        }

        const targetName: string = constraintMap.target;
        data.target = skeletonData.findBone(targetName);
        if (data.target == null) throw new Error("Transform constraint target bone not found: " + targetName);

        data.local = this.getValue(constraintMap, "local", false);
        data.relative = this.getValue(constraintMap, "relative", false);
        data.offsetRotation = this.getValue(constraintMap, "rotation", 0);
        data.offsetX = this.getValue(constraintMap, "x", 0) * scale;
        data.offsetY = this.getValue(constraintMap, "y", 0) * scale;
        data.offsetScaleX = this.getValue(constraintMap, "scaleX", 0);
        data.offsetScaleY = this.getValue(constraintMap, "scaleY", 0);
        data.offsetShearY = this.getValue(constraintMap, "shearY", 0);

        data.rotateMix = this.getValue(constraintMap, "rotateMix", 1);
        data.translateMix = this.getValue(constraintMap, "translateMix", 1);
        data.scaleMix = this.getValue(constraintMap, "scaleMix", 1);
        data.shearMix = this.getValue(constraintMap, "shearMix", 1);

        skeletonData.transformConstraints.push(data);
      }
    }

    // Path constraints.
    if (root.path) {
      for (let i = 0; i < root.path.length; i++) {
        const constraintMap = root.path[i];
        const data = new PathConstraintData(constraintMap.name);
        data.order = this.getValue(constraintMap, "order", 0);
        data.skinRequired = this.getValue(constraintMap, "skin", false);

        for (let j = 0; j < constraintMap.bones.length; j++) {
          const boneName = constraintMap.bones[j];
          const bone = skeletonData.findBone(boneName);
          if (bone == null) throw new Error("Transform constraint bone not found: " + boneName);
          data.bones.push(bone);
        }

        const targetName: string = constraintMap.target;
        data.target = skeletonData.findSlot(targetName);
        if (data.target == null) throw new Error("Path target slot not found: " + targetName);

        data.positionMode = SkeletonJson.positionModeFromString(
          this.getValue(constraintMap, "positionMode", "percent")
        );
        data.spacingMode = SkeletonJson.spacingModeFromString(this.getValue(constraintMap, "spacingMode", "length"));
        data.rotateMode = SkeletonJson.rotateModeFromString(this.getValue(constraintMap, "rotateMode", "tangent"));
        data.offsetRotation = this.getValue(constraintMap, "rotation", 0);
        data.position = this.getValue(constraintMap, "position", 0);
        if (data.positionMode == PositionMode.Fixed) data.position *= scale;
        data.spacing = this.getValue(constraintMap, "spacing", 0);
        if (data.spacingMode == SpacingMode.Length || data.spacingMode == SpacingMode.Fixed) data.spacing *= scale;
        data.rotateMix = this.getValue(constraintMap, "rotateMix", 1);
        data.translateMix = this.getValue(constraintMap, "translateMix", 1);

        skeletonData.pathConstraints.push(data);
      }
    }

    // Skins.
    if (root.skins) {
      for (let i = 0; i < root.skins.length; i++) {
        const skinMap = root.skins[i];
        const skin = new Skin(skinMap.name);

        if (skinMap.bones) {
          for (let ii = 0; ii < skinMap.bones.length; ii++) {
            const bone = skeletonData.findBone(skinMap.bones[ii]);
            if (bone == null) throw new Error("Skin bone not found: " + skinMap.bones[i]);
            skin.bones.push(bone);
          }
        }

        if (skinMap.ik) {
          for (let ii = 0; ii < skinMap.ik.length; ii++) {
            const constraint = skeletonData.findIkConstraint(skinMap.ik[ii]);
            if (constraint == null) throw new Error("Skin IK constraint not found: " + skinMap.ik[i]);
            skin.constraints.push(constraint);
          }
        }

        if (skinMap.transform) {
          for (let ii = 0; ii < skinMap.transform.length; ii++) {
            const constraint = skeletonData.findTransformConstraint(skinMap.transform[ii]);
            if (constraint == null) throw new Error("Skin transform constraint not found: " + skinMap.transform[i]);
            skin.constraints.push(constraint);
          }
        }

        if (skinMap.path) {
          for (let ii = 0; ii < skinMap.path.length; ii++) {
            const constraint = skeletonData.findPathConstraint(skinMap.path[ii]);
            if (constraint == null) throw new Error("Skin path constraint not found: " + skinMap.path[i]);
            skin.constraints.push(constraint);
          }
        }

        for (const slotName in skinMap.attachments) {
          const slot = skeletonData.findSlot(slotName);
          if (slot == null) throw new Error("Slot not found: " + slotName);
          const slotMap = skinMap.attachments[slotName];
          for (const entryName in slotMap) {
            const attachment = this.readAttachment(slotMap[entryName], skin, slot.index, entryName, skeletonData);
            if (attachment != null) skin.setAttachment(slot.index, entryName, attachment);
          }
        }
        skeletonData.skins.push(skin);
        if (skin.name == "default") skeletonData.defaultSkin = skin;
      }
    }

    // Linked meshes.
    for (let i = 0, n = this.linkedMeshes.length; i < n; i++) {
      const linkedMesh = this.linkedMeshes[i];
      const skin = linkedMesh.skin == null ? skeletonData.defaultSkin : skeletonData.findSkin(linkedMesh.skin);
      if (skin == null) throw new Error("Skin not found: " + linkedMesh.skin);
      const parent = skin.getAttachment(linkedMesh.slotIndex, linkedMesh.parent);
      if (parent == null) throw new Error("Parent mesh not found: " + linkedMesh.parent);
      linkedMesh.mesh.deformAttachment = linkedMesh.inheritDeform
        ? <VertexAttachment>parent
        : <VertexAttachment>linkedMesh.mesh;
      linkedMesh.mesh.setParentMesh(<MeshAttachment>parent);
      linkedMesh.mesh.updateUVs();
    }
    this.linkedMeshes.length = 0;

    // Events.
    if (root.events) {
      for (const eventName in root.events) {
        const eventMap = root.events[eventName];
        const data = new EventData(eventName);
        data.intValue = this.getValue(eventMap, "int", 0);
        data.floatValue = this.getValue(eventMap, "float", 0);
        data.stringValue = this.getValue(eventMap, "string", "");
        data.audioPath = this.getValue(eventMap, "audio", null);
        if (data.audioPath != null) {
          data.volume = this.getValue(eventMap, "volume", 1);
          data.balance = this.getValue(eventMap, "balance", 0);
        }
        skeletonData.events.push(data);
      }
    }

    // Animations.
    if (root.animations) {
      for (const animationName in root.animations) {
        const animationMap = root.animations[animationName];
        this.readAnimation(animationMap, animationName, skeletonData);
      }
    }

    return skeletonData;
  }

  readAttachment(map: any, skin: Skin, slotIndex: number, name: string, skeletonData: SkeletonData): Attachment {
    const scale = this.scale;
    name = this.getValue(map, "name", name);

    const type = this.getValue(map, "type", "region");

    switch (type) {
      case "region": {
        const path = this.getValue(map, "path", name);
        const region = this.attachmentLoader.newRegionAttachment(skin, name, path);
        if (region == null) return null;
        region.path = path;
        region.x = this.getValue(map, "x", 0) * scale;
        region.y = this.getValue(map, "y", 0) * scale;
        region.scaleX = this.getValue(map, "scaleX", 1);
        region.scaleY = this.getValue(map, "scaleY", 1);
        region.rotation = this.getValue(map, "rotation", 0);
        region.width = map.width * scale;
        region.height = map.height * scale;

        const color: string = this.getValue(map, "color", null);
        if (color != null) region.color.setFromString(color);

        region.updateOffset();
        return region;
      }
      case "boundingbox": {
        const box = this.attachmentLoader.newBoundingBoxAttachment(skin, name);
        if (box == null) return null;
        this.readVertices(map, box, map.vertexCount << 1);
        const color: string = this.getValue(map, "color", null);
        if (color != null) box.color.setFromString(color);
        return box;
      }
      case "mesh":
      case "linkedmesh": {
        const path = this.getValue(map, "path", name);
        const mesh = this.attachmentLoader.newMeshAttachment(skin, name, path);
        if (mesh == null) return null;
        mesh.path = path;

        const color = this.getValue(map, "color", null);
        if (color != null) mesh.color.setFromString(color);

        mesh.width = this.getValue(map, "width", 0) * scale;
        mesh.height = this.getValue(map, "height", 0) * scale;

        const parent: string = this.getValue(map, "parent", null);
        if (parent != null) {
          this.linkedMeshes.push(
            new LinkedMesh(
              mesh,
              <string>this.getValue(map, "skin", null),
              slotIndex,
              parent,
              this.getValue(map, "deform", true)
            )
          );
          return mesh;
        }

        const uvs: Array<number> = map.uvs;
        this.readVertices(map, mesh, uvs.length);
        mesh.triangles = map.triangles;
        mesh.regionUVs = uvs;
        mesh.updateUVs();

        mesh.edges = this.getValue(map, "edges", null);
        mesh.hullLength = this.getValue(map, "hull", 0) * 2;
        return mesh;
      }
      case "path": {
        const path = this.attachmentLoader.newPathAttachment(skin, name);
        if (path == null) return null;
        path.closed = this.getValue(map, "closed", false);
        path.constantSpeed = this.getValue(map, "constantSpeed", true);

        const vertexCount = map.vertexCount;
        this.readVertices(map, path, vertexCount << 1);

        const lengths: Array<number> = Utils.newArray(vertexCount / 3, 0);
        for (let i = 0; i < map.lengths.length; i++) lengths[i] = map.lengths[i] * scale;
        path.lengths = lengths;

        const color: string = this.getValue(map, "color", null);
        if (color != null) path.color.setFromString(color);
        return path;
      }
      case "point": {
        const point = this.attachmentLoader.newPointAttachment(skin, name);
        if (point == null) return null;
        point.x = this.getValue(map, "x", 0) * scale;
        point.y = this.getValue(map, "y", 0) * scale;
        point.rotation = this.getValue(map, "rotation", 0);

        const color = this.getValue(map, "color", null);
        if (color != null) point.color.setFromString(color);
        return point;
      }
      case "clipping": {
        const clip = this.attachmentLoader.newClippingAttachment(skin, name);
        if (clip == null) return null;

        const end = this.getValue(map, "end", null);
        if (end != null) {
          const slot = skeletonData.findSlot(end);
          if (slot == null) throw new Error("Clipping end slot not found: " + end);
          clip.endSlot = slot;
        }

        const vertexCount = map.vertexCount;
        this.readVertices(map, clip, vertexCount << 1);

        const color: string = this.getValue(map, "color", null);
        if (color != null) clip.color.setFromString(color);
        return clip;
      }
    }
    return null;
  }

  readVertices(map: any, attachment: VertexAttachment, verticesLength: number) {
    const scale = this.scale;
    attachment.worldVerticesLength = verticesLength;
    const vertices: Array<number> = map.vertices;
    if (verticesLength == vertices.length) {
      const scaledVertices = Utils.toFloatArray(vertices);
      if (scale != 1) {
        for (let i = 0, n = vertices.length; i < n; i++) scaledVertices[i] *= scale;
      }
      attachment.vertices = scaledVertices;
      return;
    }
    const weights = new Array<number>();
    const bones = new Array<number>();
    for (let i = 0, n = vertices.length; i < n; ) {
      const boneCount = vertices[i++];
      bones.push(boneCount);
      for (let nn = i + boneCount * 4; i < nn; i += 4) {
        bones.push(vertices[i]);
        weights.push(vertices[i + 1] * scale);
        weights.push(vertices[i + 2] * scale);
        weights.push(vertices[i + 3]);
      }
    }
    attachment.bones = bones;
    attachment.vertices = Utils.toFloatArray(weights);
  }

  readAnimation(map: any, name: string, skeletonData: SkeletonData) {
    const scale = this.scale;
    const timelines = new Array<Timeline>();
    let duration = 0;

    // Slot timelines.
    if (map.slots) {
      for (const slotName in map.slots) {
        const slotMap = map.slots[slotName];
        const slotIndex = skeletonData.findSlotIndex(slotName);
        if (slotIndex == -1) throw new Error("Slot not found: " + slotName);
        for (const timelineName in slotMap) {
          const timelineMap = slotMap[timelineName];
          if (timelineName == "attachment") {
            const timeline = new AttachmentTimeline(timelineMap.length);
            timeline.slotIndex = slotIndex;

            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              timeline.setFrame(frameIndex++, this.getValue(valueMap, "time", 0), valueMap.name);
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
          } else if (timelineName == "color") {
            const timeline = new ColorTimeline(timelineMap.length);
            timeline.slotIndex = slotIndex;

            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              const color = new Color();
              color.setFromString(valueMap.color);
              timeline.setFrame(frameIndex, this.getValue(valueMap, "time", 0), color.r, color.g, color.b, color.a);
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * ColorTimeline.ENTRIES]);
          } else if (timelineName == "twoColor") {
            const timeline = new TwoColorTimeline(timelineMap.length);
            timeline.slotIndex = slotIndex;

            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              const light = new Color();
              const dark = new Color();
              light.setFromString(valueMap.light);
              dark.setFromString(valueMap.dark);
              timeline.setFrame(
                frameIndex,
                this.getValue(valueMap, "time", 0),
                light.r,
                light.g,
                light.b,
                light.a,
                dark.r,
                dark.g,
                dark.b
              );
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * TwoColorTimeline.ENTRIES]);
          } else throw new Error("Invalid timeline type for a slot: " + timelineName + " (" + slotName + ")");
        }
      }
    }

    // Bone timelines.
    if (map.bones) {
      for (const boneName in map.bones) {
        const boneMap = map.bones[boneName];
        const boneIndex = skeletonData.findBoneIndex(boneName);
        if (boneIndex == -1) throw new Error("Bone not found: " + boneName);
        for (const timelineName in boneMap) {
          const timelineMap = boneMap[timelineName];
          if (timelineName === "rotate") {
            const timeline = new RotateTimeline(timelineMap.length);
            timeline.boneIndex = boneIndex;

            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              timeline.setFrame(frameIndex, this.getValue(valueMap, "time", 0), this.getValue(valueMap, "angle", 0));
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * RotateTimeline.ENTRIES]);
          } else if (timelineName === "translate" || timelineName === "scale" || timelineName === "shear") {
            let timeline: TranslateTimeline = null;
            let timelineScale = 1,
              defaultValue = 0;
            if (timelineName === "scale") {
              timeline = new ScaleTimeline(timelineMap.length);
              defaultValue = 1;
            } else if (timelineName === "shear") timeline = new ShearTimeline(timelineMap.length);
            else {
              timeline = new TranslateTimeline(timelineMap.length);
              timelineScale = scale;
            }
            timeline.boneIndex = boneIndex;

            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              const x = this.getValue(valueMap, "x", defaultValue),
                y = this.getValue(valueMap, "y", defaultValue);
              timeline.setFrame(frameIndex, this.getValue(valueMap, "time", 0), x * timelineScale, y * timelineScale);
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * TranslateTimeline.ENTRIES]);
          } else throw new Error("Invalid timeline type for a bone: " + timelineName + " (" + boneName + ")");
        }
      }
    }

    // IK constraint timelines.
    if (map.ik) {
      for (const constraintName in map.ik) {
        const constraintMap = map.ik[constraintName];
        const constraint = skeletonData.findIkConstraint(constraintName);
        const timeline = new IkConstraintTimeline(constraintMap.length);
        timeline.ikConstraintIndex = skeletonData.ikConstraints.indexOf(constraint);
        let frameIndex = 0;
        for (let i = 0; i < constraintMap.length; i++) {
          const valueMap = constraintMap[i];
          timeline.setFrame(
            frameIndex,
            this.getValue(valueMap, "time", 0),
            this.getValue(valueMap, "mix", 1),
            this.getValue(valueMap, "softness", 0) * scale,
            this.getValue(valueMap, "bendPositive", true) ? 1 : -1,
            this.getValue(valueMap, "compress", false),
            this.getValue(valueMap, "stretch", false)
          );
          this.readCurve(valueMap, timeline, frameIndex);
          frameIndex++;
        }
        timelines.push(timeline);
        duration = Math.max(duration, timeline.frames[(timeline.getFrameCount() - 1) * IkConstraintTimeline.ENTRIES]);
      }
    }

    // Transform constraint timelines.
    if (map.transform) {
      for (const constraintName in map.transform) {
        const constraintMap = map.transform[constraintName];
        const constraint = skeletonData.findTransformConstraint(constraintName);
        const timeline = new TransformConstraintTimeline(constraintMap.length);
        timeline.transformConstraintIndex = skeletonData.transformConstraints.indexOf(constraint);
        let frameIndex = 0;
        for (let i = 0; i < constraintMap.length; i++) {
          const valueMap = constraintMap[i];
          timeline.setFrame(
            frameIndex,
            this.getValue(valueMap, "time", 0),
            this.getValue(valueMap, "rotateMix", 1),
            this.getValue(valueMap, "translateMix", 1),
            this.getValue(valueMap, "scaleMix", 1),
            this.getValue(valueMap, "shearMix", 1)
          );
          this.readCurve(valueMap, timeline, frameIndex);
          frameIndex++;
        }
        timelines.push(timeline);
        duration = Math.max(
          duration,
          timeline.frames[(timeline.getFrameCount() - 1) * TransformConstraintTimeline.ENTRIES]
        );
      }
    }

    // Path constraint timelines.
    if (map.path) {
      for (const constraintName in map.path) {
        const constraintMap = map.path[constraintName];
        const index = skeletonData.findPathConstraintIndex(constraintName);
        if (index == -1) throw new Error("Path constraint not found: " + constraintName);
        const data = skeletonData.pathConstraints[index];
        for (const timelineName in constraintMap) {
          const timelineMap = constraintMap[timelineName];
          if (timelineName === "position" || timelineName === "spacing") {
            let timeline: PathConstraintPositionTimeline = null;
            let timelineScale = 1;
            if (timelineName === "spacing") {
              timeline = new PathConstraintSpacingTimeline(timelineMap.length);
              if (data.spacingMode == SpacingMode.Length || data.spacingMode == SpacingMode.Fixed)
                timelineScale = scale;
            } else {
              timeline = new PathConstraintPositionTimeline(timelineMap.length);
              if (data.positionMode == PositionMode.Fixed) timelineScale = scale;
            }
            timeline.pathConstraintIndex = index;
            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              timeline.setFrame(
                frameIndex,
                this.getValue(valueMap, "time", 0),
                this.getValue(valueMap, timelineName, 0) * timelineScale
              );
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(
              duration,
              timeline.frames[(timeline.getFrameCount() - 1) * PathConstraintPositionTimeline.ENTRIES]
            );
          } else if (timelineName === "mix") {
            const timeline = new PathConstraintMixTimeline(timelineMap.length);
            timeline.pathConstraintIndex = index;
            let frameIndex = 0;
            for (let i = 0; i < timelineMap.length; i++) {
              const valueMap = timelineMap[i];
              timeline.setFrame(
                frameIndex,
                this.getValue(valueMap, "time", 0),
                this.getValue(valueMap, "rotateMix", 1),
                this.getValue(valueMap, "translateMix", 1)
              );
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(
              duration,
              timeline.frames[(timeline.getFrameCount() - 1) * PathConstraintMixTimeline.ENTRIES]
            );
          }
        }
      }
    }

    // Deform timelines.
    if (map.deform) {
      for (const deformName in map.deform) {
        const deformMap = map.deform[deformName];
        const skin = skeletonData.findSkin(deformName);
        if (skin == null) throw new Error("Skin not found: " + deformName);
        for (const slotName in deformMap) {
          const slotMap = deformMap[slotName];
          const slotIndex = skeletonData.findSlotIndex(slotName);
          if (slotIndex == -1) throw new Error("Slot not found: " + slotMap.name);
          for (const timelineName in slotMap) {
            const timelineMap = slotMap[timelineName];
            const attachment = <VertexAttachment>skin.getAttachment(slotIndex, timelineName);
            if (attachment == null) throw new Error("Deform attachment not found: " + timelineMap.name);
            const weighted = attachment.bones != null;
            const vertices = attachment.vertices;
            const deformLength = weighted ? (vertices.length / 3) * 2 : vertices.length;

            const timeline = new DeformTimeline(timelineMap.length);
            timeline.slotIndex = slotIndex;
            timeline.attachment = attachment;

            let frameIndex = 0;
            for (let j = 0; j < timelineMap.length; j++) {
              const valueMap = timelineMap[j];
              let deform: ArrayLike<number>;
              const verticesValue: Array<number> = this.getValue(valueMap, "vertices", null);
              if (verticesValue == null) deform = weighted ? Utils.newFloatArray(deformLength) : vertices;
              else {
                deform = Utils.newFloatArray(deformLength);
                const start = <number>this.getValue(valueMap, "offset", 0);
                Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length);
                if (scale != 1) {
                  for (let i = start, n = i + verticesValue.length; i < n; i++) deform[i] *= scale;
                }
                if (!weighted) {
                  for (let i = 0; i < deformLength; i++) deform[i] += vertices[i];
                }
              }

              timeline.setFrame(frameIndex, this.getValue(valueMap, "time", 0), deform);
              this.readCurve(valueMap, timeline, frameIndex);
              frameIndex++;
            }
            timelines.push(timeline);
            duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
          }
        }
      }
    }

    // Draw order timeline.
    let drawOrderNode = map.drawOrder;
    if (drawOrderNode == null) drawOrderNode = map.draworder;
    if (drawOrderNode != null) {
      const timeline = new DrawOrderTimeline(drawOrderNode.length);
      const slotCount = skeletonData.slots.length;
      let frameIndex = 0;
      for (let j = 0; j < drawOrderNode.length; j++) {
        const drawOrderMap = drawOrderNode[j];
        let drawOrder: Array<number> = null;
        const offsets = this.getValue(drawOrderMap, "offsets", null);
        if (offsets != null) {
          drawOrder = Utils.newArray<number>(slotCount, -1);
          const unchanged = Utils.newArray<number>(slotCount - offsets.length, 0);
          let originalIndex = 0,
            unchangedIndex = 0;
          for (let i = 0; i < offsets.length; i++) {
            const offsetMap = offsets[i];
            const slotIndex = skeletonData.findSlotIndex(offsetMap.slot);
            if (slotIndex == -1) throw new Error("Slot not found: " + offsetMap.slot);
            // Collect unchanged items.
            while (originalIndex != slotIndex) unchanged[unchangedIndex++] = originalIndex++;
            // Set changed items.
            drawOrder[originalIndex + offsetMap.offset] = originalIndex++;
          }
          // Collect remaining unchanged items.
          while (originalIndex < slotCount) unchanged[unchangedIndex++] = originalIndex++;
          // Fill in unchanged items.
          for (let i = slotCount - 1; i >= 0; i--) if (drawOrder[i] == -1) drawOrder[i] = unchanged[--unchangedIndex];
        }
        timeline.setFrame(frameIndex++, this.getValue(drawOrderMap, "time", 0), drawOrder);
      }
      timelines.push(timeline);
      duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
    }

    // Event timeline.
    if (map.events) {
      const timeline = new EventTimeline(map.events.length);
      let frameIndex = 0;
      for (let i = 0; i < map.events.length; i++) {
        const eventMap = map.events[i];
        const eventData = skeletonData.findEvent(eventMap.name);
        if (eventData == null) throw new Error("Event not found: " + eventMap.name);
        const event = new Event(Utils.toSinglePrecision(this.getValue(eventMap, "time", 0)), eventData);
        event.intValue = this.getValue(eventMap, "int", eventData.intValue);
        event.floatValue = this.getValue(eventMap, "float", eventData.floatValue);
        event.stringValue = this.getValue(eventMap, "string", eventData.stringValue);
        if (event.data.audioPath != null) {
          event.volume = this.getValue(eventMap, "volume", 1);
          event.balance = this.getValue(eventMap, "balance", 0);
        }
        timeline.setFrame(frameIndex++, event);
      }
      timelines.push(timeline);
      duration = Math.max(duration, timeline.frames[timeline.getFrameCount() - 1]);
    }

    if (isNaN(duration)) {
      throw new Error("Error while parsing animation, duration is NaN");
    }

    skeletonData.animations.push(new Animation(name, timelines, duration));
  }

  readCurve(map: any, timeline: CurveTimeline, frameIndex: number) {
    if (!map.hasOwnProperty("curve")) return;
    if (map.curve == "stepped") timeline.setStepped(frameIndex);
    else {
      const curve: number = map.curve;
      timeline.setCurve(
        frameIndex,
        curve,
        this.getValue(map, "c2", 0),
        this.getValue(map, "c3", 1),
        this.getValue(map, "c4", 1)
      );
    }
  }

  getValue(map: any, prop: string, defaultValue: any) {
    return map[prop] !== undefined ? map[prop] : defaultValue;
  }

  static blendModeFromString(str: string) {
    str = str.toLowerCase();
    if (str == "normal") return BlendMode.Normal;
    if (str == "additive") return BlendMode.Additive;
    if (str == "multiply") return BlendMode.Multiply;
    if (str == "screen") return BlendMode.Screen;
    throw new Error(`Unknown blend mode: ${str}`);
  }

  static positionModeFromString(str: string) {
    str = str.toLowerCase();
    if (str == "fixed") return PositionMode.Fixed;
    if (str == "percent") return PositionMode.Percent;
    throw new Error(`Unknown position mode: ${str}`);
  }

  static spacingModeFromString(str: string) {
    str = str.toLowerCase();
    if (str == "length") return SpacingMode.Length;
    if (str == "fixed") return SpacingMode.Fixed;
    if (str == "percent") return SpacingMode.Percent;
    throw new Error(`Unknown position mode: ${str}`);
  }

  static rotateModeFromString(str: string) {
    str = str.toLowerCase();
    if (str == "tangent") return RotateMode.Tangent;
    if (str == "chain") return RotateMode.Chain;
    if (str == "chainscale") return RotateMode.ChainScale;
    throw new Error(`Unknown rotate mode: ${str}`);
  }

  static transformModeFromString(str: string) {
    str = str.toLowerCase();
    if (str == "normal") return TransformMode.Normal;
    if (str == "onlytranslation") return TransformMode.OnlyTranslation;
    if (str == "norotationorreflection") return TransformMode.NoRotationOrReflection;
    if (str == "noscale") return TransformMode.NoScale;
    if (str == "noscaleorreflection") return TransformMode.NoScaleOrReflection;
    throw new Error(`Unknown transform mode: ${str}`);
  }
}

class LinkedMesh {
  parent: string;
  skin: string;
  slotIndex: number;
  mesh: MeshAttachment;
  inheritDeform: boolean;

  constructor(mesh: MeshAttachment, skin: string, slotIndex: number, parent: string, inheritDeform: boolean) {
    this.mesh = mesh;
    this.skin = skin;
    this.slotIndex = slotIndex;
    this.parent = parent;
    this.inheritDeform = inheritDeform;
  }
}
