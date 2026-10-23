// Barrel for the vendored spine 3.8 runtime. There is no `@esotericsoftware/spine-core` npm
// release for the 3.8 line (npm starts at 4.0.1), so this directory vendors the runtime source
// instead of depending on a package; this file is the re-export surface the 4.2 package gets for
// free from `export * from "@esotericsoftware/spine-core"`.
import "./polyfills";

export * from "./Animation";
export * from "./AnimationState";
export * from "./AnimationStateData";
export * from "./AtlasAttachmentLoader";
export * from "./BlendMode";
export * from "./Bone";
export * from "./BoneData";
export * from "./ConstraintData";
export * from "./Event";
export * from "./EventData";
export * from "./IkConstraint";
export * from "./IkConstraintData";
export * from "./PathConstraint";
export * from "./PathConstraintData";
export * from "./Skeleton";
export * from "./SkeletonBinary";
export * from "./SkeletonBounds";
export * from "./SkeletonClipping";
export * from "./SkeletonData";
export * from "./SkeletonJson";
export * from "./Skin";
export * from "./Slot";
export * from "./SlotData";
export * from "./Texture";
export * from "./TextureAtlas";
export * from "./TransformConstraint";
export * from "./TransformConstraintData";
export * from "./Triangulator";
export * from "./Updatable";
export * from "./Utils";
export * from "./VertexEffect";

export * from "./attachments/Attachment";
export * from "./attachments/AttachmentLoader";
export * from "./attachments/AttachmentType";
export * from "./attachments/BoundingBoxAttachment";
export * from "./attachments/ClippingAttachment";
export * from "./attachments/MeshAttachment";
export * from "./attachments/PathAttachment";
export * from "./attachments/PointAttachment";
export * from "./attachments/RegionAttachment";

export * from "./vertexeffects/JitterEffect";
export * from "./vertexeffects/SwirlEffect";
