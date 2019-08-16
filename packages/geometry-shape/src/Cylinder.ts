import { DataType, FrontFace } from '@alipay/r3-base';
import { vec3 } from '@alipay/r3-math';
import { BufferGeometry } from '@alipay/r3-geometry';

/**
 * SphereGeometry 球体创建类
 * @extends BufferGeometry
 */
export class CylinderGeometry extends BufferGeometry {

  public FrontFace;
  public index;
  public indexArray;
  public halfHeight;
  private _parameters;
  private _indexs;
  private _verts;
  private _normals;
  private _uvs;

  /**
   * @constructor
   * @param {number} radiusTop 顶部圆柱的半径。 默认值为1。
   * @param {number} radiusBottom 底部圆柱的半径。 默认值为1。
   * @param {number} 高度 圆柱的高度。 默认值为1。
   * @param {number} radialSegments 圆柱体圆周周围的分割面数。 默认值为8
   * @param {number} heightSegments 沿圆柱高度的面的行数。 默认值为1。
   * @param {boolean} openEnded 一个布尔值，指示圆柱的末端是打开还是加盖。 默认值为false，表示上限。
   * @param {number} thetaStart 第一段的起始角度，默认= 0（三点钟位置）。
   * @param {number} thetaLength 圆形扇区的中心角，通常称为theta。 默认值为2 * Pi，这样可以获得完整的柱面。
   */
  constructor( radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength, frontFace ) {

    super();
    this.FrontFace = frontFace || FrontFace.CCW;
    this._parameters = {
      radiusTop: radiusTop || 1,
      radiusBottom: radiusBottom || 1,
      height: height || 1,
      radialSegments: radialSegments || 8,
      heightSegments: heightSegments || 1,
      openEnded: openEnded || false,
      thetaStart: thetaStart || 0,
      thetaLength: thetaLength || 2 * Math.PI
    };
    this.initialize();

  }

  /**
   * 构造圆柱体数据
   * @private
   */
  initialize() {

    this._indexs = [];
    this._verts = [];
    this._normals = [];
    this._uvs = [];

    this.index = 0;
    this.indexArray = [];
    this.halfHeight = this._parameters.height / 2;

    this.generateTorso();

    if ( this._parameters.openEnded === false ) {

      if ( this._parameters.radiusTop > 0 ) this.generateCap( true );
      if ( this._parameters.radiusBottom > 0 ) this.generateCap( false );

    }

    super.initialize( [
      { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
      { semantic: 'NORMAL', size: 3, type: DataType.FLOAT, normalized: true },
      { semantic: 'TEXCOORD_0', size: 2, type: DataType.FLOAT, normalized: true }
    ], this._indexs.length );

    this._indexs.forEach( ( vertIndex, i )=> {

      this.setVertexValues( i, {
        'POSITION': this._verts[vertIndex],
        'NORMAL': this._normals[vertIndex],
        'TEXCOORD_0': this._uvs[vertIndex],
      } );

    } );

  }

  generateTorso() {

    let x, y;
    const normal = vec3.create();
    const slope = ( this._parameters.radiusBottom - this._parameters.radiusTop ) / this._parameters.height;
    for ( y = 0; y <= this._parameters.heightSegments; y ++ ) {

      const indexRow = [];
      const v = y / this._parameters.heightSegments;
      const radius = v * ( this._parameters.radiusBottom - this._parameters.radiusTop ) + this._parameters.radiusTop;
      for ( x = 0; x <= this._parameters.radialSegments; x ++ ) {

        const u = x / this._parameters.radialSegments;
        const theta = u * this._parameters.thetaLength + this._parameters.thetaStart;
        const sinTheta = Math.sin( theta );
        const cosTheta = Math.cos( theta );

        // vertex
        const vertX = radius * sinTheta;
        const vertY = - v * this._parameters.height + this.halfHeight;
        const vertZ = radius * cosTheta;
        this._verts.push( [ vertX, vertY, vertZ ] );

        // normal
        vec3.set( normal, sinTheta, slope, cosTheta );
        vec3.normalize( normal, normal );
        this._normals.push( [ normal[0], normal[1], normal[2] ] );

        // uv
        if( this.FrontFace === FrontFace.CCW ) {

          this._uvs.push( [ u, v ] );

        } else {

          this._uvs.push( [ 1 - u, v ] );

        }

        indexRow.push( this.index ++ );

      }

      this.indexArray.push( indexRow );

    }

    for ( x = 0; x < this._parameters.radialSegments; x ++ ) {

      for ( y = 0; y < this._parameters.heightSegments; y ++ ) {

        var a = this.indexArray[ y ][ x ];
        var b = this.indexArray[ y + 1 ][ x ];
        var c = this.indexArray[ y + 1 ][ x + 1 ];
        var d = this.indexArray[ y ][ x + 1 ];

        // faces
        this._indexs.push( a, b, d );
        this._indexs.push( b, c, d );

      }

    }

  }



  generateCap( isTop ) {

    let x;
    const radius = ( isTop === true ) ?  this._parameters.radiusTop :  this._parameters.radiusBottom;
    const sign = ( isTop === true ) ? 1 : - 1;
    const centerIndexStart = this.index;

    for ( x = 1; x <=  this._parameters.radialSegments; x ++ ) {

      // vertex
      this._verts.push( [ 0, this.halfHeight * sign, 0 ] );

      // normal
      this._normals.push( [ 0, sign, 0 ] );

      // uv
      this._uvs.push( [ 0.5, 0.5 ] );

      // increase index
      this.index ++;

    }
    const centerIndexEnd = this.index;

    for ( x = 0; x <=  this._parameters.radialSegments; x ++ ) {

      const u = x /  this._parameters.radialSegments;
      const theta = u *  this._parameters.thetaLength +  this._parameters.thetaStart;
      const cosTheta = Math.cos( theta );
      const sinTheta = Math.sin( theta );

      // vertex
      const vertexX = radius * sinTheta;
      const vertexY = this.halfHeight * sign;
      const vertexZ = radius * cosTheta;
      this._verts.push( [ vertexX, vertexY, vertexZ ] );

      // normal
      this._normals.push( [ 0, sign, 0 ] );

      // uv
      const uvX = ( cosTheta * 0.5 ) + 0.5;
      const uvY = ( sinTheta * 0.5 * sign ) + 0.5;
      this._uvs.push( [ uvX, uvY ] );

      // increase index
      this.index ++;

    }

    for ( x = 0; x < this._parameters.radialSegments; x ++ ) {

      var c = centerIndexStart + x;
      var i = centerIndexEnd + x;
      if ( isTop === true ) {

        // face top
        this._indexs.push( i, i + 1, c );

      } else {

        // face bottom
        this._indexs.push( i + 1, i, c );

      }

    }

  }

}
