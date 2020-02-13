import { vec2, vec4 } from '@alipay/o3-math';
import { NodeAbility } from '@alipay/o3-core';
import { MeshBatcher } from '../core/MeshBatcher';
import { spine } from '@alipay/spine-core';

var lastFrameTime = Date.now() / 1000;

export class ASpineRenderer extends NodeAbility {
  skeleton;
  state;
  zOffset: number = 0.1;
  renderMode;
  renderable;

  private batches = new Array();
  private nextBatchIndex = 0;
  private vertexCount;

  static QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
  static VERTEX_SIZE = 2 + 2 + 4;

  vertices = new Float32Array(1024);
  private tempColor = vec4.create();

  /**
   * 构造函数
   * @param {Node} node
   * @param {Sprite} sprite
   */
  constructor(node, skeletonData) {
    super(node);

    const { Skeleton, AnimationStateData, AnimationState } = spine;
    this.skeleton = new Skeleton(skeletonData);
    const animData = new AnimationStateData(skeletonData);
    this.state = new AnimationState(animData);
    this.getVertexCount();
    //-- Ability属性
    this.renderable = true;
  }
  
  getVertexCount() {
    let drawOrder = this.skeleton.drawOrder;
    let vertexCount = 0;
    for (let i = 0, n = drawOrder.length; i < n; i++) {
      let slot = drawOrder[i];
      if (!slot.bone.active) continue;
      let attachment = slot.getAttachment();
      if (!attachment) {
        continue;
      } else if (attachment.constructor.name === "RegionAttachment") {
        vertexCount += ASpineRenderer.QUAD_TRIANGLES.length;
      } else if (attachment.constructor.name === "MeshAttachment") {
        let mesh = attachment;
        vertexCount += mesh.triangles.length;
      } else continue;
    }
    this.vertexCount = vertexCount;
  }

  render() {}

  update() {
    let now = Date.now() / 1000;
    let delta = now - lastFrameTime;
    lastFrameTime = now;
    this.updateState(delta);
  }

  updateState(deltaTime) {
    let state = this.state;
    let skeleton = this.skeleton;

    state.update(deltaTime);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    this.updateGeometry();
  }

  clearBatches() {
    for (var i = 0; i < this.batches.length; i++) {
      this.batches[i].clear();
      this.batches[i].enabled = false;
    }
    this.nextBatchIndex = 0;
  }

  nextBatch() {
    if (this.batches.length == this.nextBatchIndex) {
      const batchNode = this.node.createChild('batch');
      const batch = batchNode.createAbility(MeshBatcher, { maxVertices: this.vertexCount });
      this.batches.push(batch);
    }
    let batch = this.batches[this.nextBatchIndex++];
    batch.enabled = true;
    return batch;
  }

  updateGeometry() {
    this.clearBatches();

    let vertices: ArrayLike<number> = this.vertices;
    let triangles: Array<number> = null;
    let uvs: ArrayLike<number> = null;
    let drawOrder = this.skeleton.drawOrder;
    let batch = this.nextBatch();
    batch.begin();
    let z = 0;
    let zOffset = this.zOffset;
    for (let i = 0, n = drawOrder.length; i < n; i++) {
      let vertexSize = ASpineRenderer.VERTEX_SIZE;
      let slot = drawOrder[i];
      if (!slot.bone.active) continue;
      let attachment = slot.getAttachment();
      let attachmentColor = null;
      let texture = null;
      let numFloats = 0;
      if (!attachment) {
        continue;
      } else if (attachment.constructor.name === "RegionAttachment") {
        let region = attachment;
        attachmentColor = region.color;
        vertices = this.vertices;
        numFloats = vertexSize * 4;
        region.computeWorldVertices(slot.bone, vertices, 0, vertexSize);
        triangles = ASpineRenderer.QUAD_TRIANGLES;
        uvs = region.uvs;
        texture = region.region.renderObject.texture;
      } else if (attachment.constructor.name === "MeshAttachment") {
        let mesh = attachment;
        attachmentColor = mesh.color;
        vertices = this.vertices;
        numFloats = (mesh.worldVerticesLength >> 1) * vertexSize;
        if (numFloats > vertices.length) {
          vertices = this.vertices = spine.Utils.newFloatArray(numFloats);
        }
        mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, vertexSize);
        triangles = mesh.triangles;
        uvs = mesh.uvs;
        texture = mesh.region.renderObject.texture;
      } else continue;
      
      if (texture != null) {
        let skeleton = slot.bone.skeleton;
        let skeletonColor = skeleton.color;
        let slotColor = slot.color;
        let alpha = skeletonColor.a * slotColor.a * attachmentColor.a;
        let color = this.tempColor;
        color = [
          skeletonColor.r * slotColor.r * attachmentColor.r,
          skeletonColor.g * slotColor.g * attachmentColor.g,
          skeletonColor.b * slotColor.b * attachmentColor.b,
          alpha,
        ];

        let finalVertices: ArrayLike<number>;
        let finalVerticesLength: number;
        let finalIndices: ArrayLike<number>;
        let finalIndicesLength: number;

        let verts = vertices;
        for (let v = 2, u = 0, n = numFloats; v < n; v += vertexSize, u += 2) {
          verts[v] = color[0];
          verts[v + 1] = color[1];
          verts[v + 2] = color[2];
          verts[v + 3] = color[3];
          verts[v + 4] = uvs[u];
          verts[v + 5] = uvs[u + 1];
        }
        finalVertices = vertices;
        finalVerticesLength = numFloats;
        finalIndices = triangles;
        finalIndicesLength = triangles.length;

        if (finalVerticesLength == 0 || finalIndicesLength == 0)
          continue;

        // Start new batch if this one can't hold vertices/indices
        if (!batch.canBatch(finalVerticesLength, finalIndicesLength)) {
          batch.end();
          batch = this.nextBatch();
          batch.begin();
        }

        // FIXME per slot blending would require multiple material support
        //let slotBlendMode = slot.data.blendMode;
        //if (slotBlendMode != blendMode) {
        //	blendMode = slotBlendMode;
        //	batcher.setBlendMode(getSourceGLBlendMode(this._gl, blendMode, premultipliedAlpha), getDestGLBlendMode(this._gl, blendMode));
        //}

        let batchMaterial = batch.material;
        if (batchMaterial.map == null) {
          batchMaterial.map = texture.texture;
        }
        if (batchMaterial.map != texture.texture) {
          batch.end();
          batch = this.nextBatch();
          batch.begin();
          batchMaterial = batch.material;
          batchMaterial.map = texture.texture;
        }
        batch.batch(finalVertices, finalVerticesLength, finalIndices, finalIndicesLength, z);
        z += zOffset;
      }
    }
    batch.end();
  }
  
}
