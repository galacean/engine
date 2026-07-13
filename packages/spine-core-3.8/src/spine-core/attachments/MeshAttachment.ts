import { VertexAttachment, Attachment } from "./Attachment";
import { TextureRegion } from "../Texture";
import { Color, Utils, ArrayLike } from "../Utils";
import { TextureAtlasRegion } from "../TextureAtlas";

/** An attachment that displays a textured mesh. A mesh has hull vertices and internal vertices within the hull. Holes are not
 * supported. Each vertex has UVs (texture coordinates) and triangles are used to map an image on to the mesh.
 *
 * See [Mesh attachments](http://esotericsoftware.com/spine-meshes) in the Spine User Guide. */
export class MeshAttachment extends VertexAttachment {
  region: TextureRegion;

  /** The name of the texture region for this attachment. */
  path: string;

  /** The UV pair for each vertex, normalized within the texture region. */
  regionUVs: ArrayLike<number>;

  /** The UV pair for each vertex, normalized within the entire texture.
   *
   * See {@link #updateUVs}. */
  uvs: ArrayLike<number>;

  /** Triplets of vertex indices which describe the mesh's triangulation. */
  triangles: Array<number>;

  /** The color to tint the mesh. */
  color = new Color(1, 1, 1, 1);

  /** The width of the mesh's image. Available only when nonessential data was exported. */
  width: number;

  /** The height of the mesh's image. Available only when nonessential data was exported. */
  height: number;

  /** The number of entries at the beginning of {@link #vertices} that make up the mesh hull. */
  hullLength: number;

  /** Vertex index pairs describing edges for controling triangulation. Mesh triangles will never cross edges. Only available if
   * nonessential data was exported. Triangulation is not performed at runtime. */
  edges: Array<number>;

  private parentMesh: MeshAttachment;
  tempColor = new Color(0, 0, 0, 0);

  constructor(name: string) {
    super(name);
  }

  /** Calculates {@link #uvs} using {@link #regionUVs} and the {@link #region}. Must be called after changing the region UVs or
   * region. */
  updateUVs() {
    const regionUVs = this.regionUVs;
    if (this.uvs == null || this.uvs.length != regionUVs.length) this.uvs = Utils.newFloatArray(regionUVs.length);
    const uvs = this.uvs;
    const n = this.uvs.length;
    let u = this.region.u,
      v = this.region.v,
      width = 0,
      height = 0;
    if (this.region instanceof TextureAtlasRegion) {
      const region = this.region;
      const textureWidth = region.texture.width,
        textureHeight = region.texture.height;
      switch (region.degrees) {
        case 90:
          u -= (region.originalHeight - region.offsetY - region.height) / textureWidth;
          v -= (region.originalWidth - region.offsetX - region.width) / textureHeight;
          width = region.originalHeight / textureWidth;
          height = region.originalWidth / textureHeight;
          for (let i = 0; i < n; i += 2) {
            uvs[i] = u + regionUVs[i + 1] * width;
            uvs[i + 1] = v + (1 - regionUVs[i]) * height;
          }
          return;
        case 180:
          u -= (region.originalWidth - region.offsetX - region.width) / textureWidth;
          v -= region.offsetY / textureHeight;
          width = region.originalWidth / textureWidth;
          height = region.originalHeight / textureHeight;
          for (let i = 0; i < n; i += 2) {
            uvs[i] = u + (1 - regionUVs[i]) * width;
            uvs[i + 1] = v + (1 - regionUVs[i + 1]) * height;
          }
          return;
        case 270:
          u -= region.offsetY / textureWidth;
          v -= region.offsetX / textureHeight;
          width = region.originalHeight / textureWidth;
          height = region.originalWidth / textureHeight;
          for (let i = 0; i < n; i += 2) {
            uvs[i] = u + (1 - regionUVs[i + 1]) * width;
            uvs[i + 1] = v + regionUVs[i] * height;
          }
          return;
      }
      u -= region.offsetX / textureWidth;
      v -= (region.originalHeight - region.offsetY - region.height) / textureHeight;
      width = region.originalWidth / textureWidth;
      height = region.originalHeight / textureHeight;
    } else if (this.region == null) {
      u = v = 0;
      width = height = 1;
    } else {
      width = this.region.u2 - u;
      height = this.region.v2 - v;
    }

    for (let i = 0; i < n; i += 2) {
      uvs[i] = u + regionUVs[i] * width;
      uvs[i + 1] = v + regionUVs[i + 1] * height;
    }
  }

  /** The parent mesh if this is a linked mesh, else null. A linked mesh shares the {@link #bones}, {@link #vertices},
   * {@link #regionUVs}, {@link #triangles}, {@link #hullLength}, {@link #edges}, {@link #width}, and {@link #height} with the
   * parent mesh, but may have a different {@link #name} or {@link #path} (and therefore a different texture). */
  getParentMesh() {
    return this.parentMesh;
  }

  /** @param parentMesh May be null. */
  setParentMesh(parentMesh: MeshAttachment) {
    this.parentMesh = parentMesh;
    if (parentMesh != null) {
      this.bones = parentMesh.bones;
      this.vertices = parentMesh.vertices;
      this.worldVerticesLength = parentMesh.worldVerticesLength;
      this.regionUVs = parentMesh.regionUVs;
      this.triangles = parentMesh.triangles;
      this.hullLength = parentMesh.hullLength;
      this.worldVerticesLength = parentMesh.worldVerticesLength;
    }
  }

  copy(): Attachment {
    if (this.parentMesh != null) return this.newLinkedMesh();

    const copy = new MeshAttachment(this.name);
    copy.region = this.region;
    copy.path = this.path;
    copy.color.setFromColor(this.color);

    this.copyTo(copy);
    copy.regionUVs = new Array<number>(this.regionUVs.length);
    Utils.arrayCopy(this.regionUVs, 0, copy.regionUVs, 0, this.regionUVs.length);
    copy.uvs = new Array<number>(this.uvs.length);
    Utils.arrayCopy(this.uvs, 0, copy.uvs, 0, this.uvs.length);
    copy.triangles = new Array<number>(this.triangles.length);
    Utils.arrayCopy(this.triangles, 0, copy.triangles, 0, this.triangles.length);
    copy.hullLength = this.hullLength;

    // Nonessential.
    if (this.edges != null) {
      copy.edges = new Array<number>(this.edges.length);
      Utils.arrayCopy(this.edges, 0, copy.edges, 0, this.edges.length);
    }
    copy.width = this.width;
    copy.height = this.height;

    return copy;
  }

  /** Returns a new mesh with the {@link #parentMesh} set to this mesh's parent mesh, if any, else to this mesh. **/
  newLinkedMesh(): MeshAttachment {
    const copy = new MeshAttachment(this.name);
    copy.region = this.region;
    copy.path = this.path;
    copy.color.setFromColor(this.color);
    copy.deformAttachment = this.deformAttachment;
    copy.setParentMesh(this.parentMesh != null ? this.parentMesh : this);
    copy.updateUVs();
    return copy;
  }
}
