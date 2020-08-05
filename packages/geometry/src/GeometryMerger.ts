import { BufferGeometry } from "./BufferGeometry";
import { getVertexDataTypeSize, getVertexDataTypeDataView } from "./Constant";
import { DataType, BufferUsage } from "@alipay/o3-core";

/**
 * GeometryMerger 用于合并相同材质的静态 Geometry, 减少 draw call 开销
 *
 * 示例：
 *
 *   let geometries = [];
 *   for (...) {
 *     geometries.push(generateGeometry(...)); // 这里需要给 geometry.primitive.material 赋值
 *   }
 *
 *   let mergedGeometry = new GeometryMerger(geometries).merge(); // 这样用
 *
 *   for (let geometry of mergedGeometry) { // add to scene
 *     let renderer = rootNode.createChild('node_name').addComponent(GeometryRenderer);
 *     renderer.geometry = geometry;
 *     renderer.setMaterial(geometry.primitive.material);
 *   }
 *
 */
export class GeometryMerger {
  private _geometryList;

  private _mergedGeometry;
  /**
   * 初始化
   * @param {Geometry[]} geometries 想要合并的 geometry 列表
   *
   * 为了正确分类请确保:
   * 1. **所有使用相同材质的 geometry 有完全相同的顶点 layout** (非常重要)
   * 2. geometry.primitive.material 已正确设置（否则所有传入的 geometry 都会合并在一起）
   */
  constructor(geometries) {
    this._geometryList = geometries || [];
    this._mergedGeometry = [];
  }

  /**
   * 添加 geometry
   * @param {Geometry} geometry 在已初始化的基础上继续添加 geometry
   *
   * 限制条件与构造函数相同
   * @sa constructor
   */
  add(geometry) {
    if (geometry instanceof Array) this._geometryList.concat(geometry);
    else this._geometryList.push(geometry);
  }

  /**
   * 执行合并操作
   * @return {Geometry[]}
   *
   * 返回 Geometry 列表 -
   * * 已合并的 geometry 每个材质对应一个 geometry;
   * * 动态物件或不支持合并的 geometry 会保持原样返回
   */
  merge() {
    const bufferGeos = [];
    const indexBufferGeos = [];
    const untouchedGeos = [];

    for (const geo of this._geometryList) {
      // 只合并静态物件
      const isStatic = this._isStatic(geo.primitive);
      if (!isStatic) {
        untouchedGeos.push(geo);
        continue;
      }
      if (geo instanceof BufferGeometry) {
        if (this._isIndexBufferGeometry(geo)) {
          indexBufferGeos.push(geo);
        } else {
          bufferGeos.push(geo);
        }
      } else {
        untouchedGeos.push(geo);
        console.assert(false, "unknown geometry type");
      }
    }

    const mergedBufferGeos = [];
    const mergedIndexBufferGeos = [];

    this._mergeBufferGeometry(mergedBufferGeos, bufferGeos);
    this._mergeIndexBufferGeometry(mergedIndexBufferGeos, indexBufferGeos);
    return [...mergedBufferGeos, ...mergedIndexBufferGeos, ...untouchedGeos];
  }

  _isStatic(primitive) {
    const { attributes } = primitive;
    const semanticList = Object.keys(attributes);
    let isStatic = true;
    for (let i = 0; i < semanticList.length; i += 1) {
      const semantic = semanticList[i];
      const attribute = attributes[semantic];
      if (attribute.usage === BufferUsage.DYNAMIC_DRAW) {
        isStatic = false;
      }
    }
    return isStatic;
  }

  _isIndexBufferGeometry(geo) {
    if (geo.primitive.indexBuffers.length === 0) {
      return false;
    }
    return true;
  }

  _mergeBufferGeometry(merged, raw) {
    const matMap = new Map(); // material->geometry map
    for (const g of raw) {
      const prim = g.primitive;
      if (!matMap.has(prim.material)) {
        matMap.set(prim.material, [g]);
      } else {
        matMap.get(prim.material).push(g);
      }
    }
    matMap.forEach((iter) => {
      const mat = iter[0];
      const m = iter[1];
      if (m.length == 1) {
        merged.push(m[0]);
      } else {
        console.assert(
          m.every(function (g: any) {
            return (
              g.primitive.mode == m[0].primitive.mode &&
              g.primitive.targets.length == 0 &&
              g.primitive.indexBuffers.length == 0 &&
              g.stride == m[0].stride
            );
          })
        );

        const newGeo = new BufferGeometry("merged-geometry");
        const vertexCount = m.reduce((s, g) => s + g.primitive.vertexCount, 0);
        // newGeo.initialize(m[0].attributes, vertexCount);
        newGeo.primitive.material = mat;
        newGeo.primitive.vertexBuffers[0] = new ArrayBuffer(
          m.reduce((s, g) => s + g.primitive.vertexBuffers[0].byteLength, 0)
        );
        let sumBytes = 0;
        for (const g of m) {
          const origView = new Uint8Array(g.primitive.vertexBuffers[0]);
          const len = g.primitive.vertexBuffers[0].byteLength;
          const newView = new Uint8Array(newGeo.primitive.vertexBuffers[0], sumBytes);
          // 直接memcpy到尾部
          newView.set(origView);
          sumBytes += len;
        }
        merged.push(newGeo);
      }
    });
  }

  _mergeIndexBufferGeometry(merged, raw) {
    const matMap = new Map<any, any>(); // material->geometry map
    for (const g of raw) {
      const prim = g.primitive;
      if (!matMap.has(prim.material)) {
        matMap.set(prim.material, [g]);
      } else {
        matMap.get(prim.material).push(g);
      }
    }
    matMap.forEach((iter) => {
      const mat = iter[0];
      const m = iter[1];
      if (m.length == 1) {
        merged.push(m[0]);
      } else {
        console.assert(
          m.every(function (g) {
            return (
              g.primitive.mode == m[0].primitive.mode &&
              g.primitive.targets.length == 0 &&
              g.primitive.indexBuffer != null &&
              g.stride == m[0].stride
            );
          })
        );

        const sumVertexCount = m.reduce((s, g) => s + g.primitive.vertexCount, 0);
        const sumIndexCount = m.reduce((s, g) => s + g.primitive.indexCount, 0);
        const indexType = sumVertexCount > 0xffff ? DataType.UNSIGNED_INT : DataType.UNSIGNED_SHORT;
        const indexStride = getVertexDataTypeSize(indexType);
        const origIndexConstructor = getVertexDataTypeDataView(m[0].primitive.indexType);
        const indexConstructor = getVertexDataTypeDataView(indexType);
        const sumVertexByteLength = m.reduce((s, g) => s + g.primitive.vertexBuffers[0].byteLength, 0);

        const vb = new ArrayBuffer(sumVertexByteLength);
        const ib = new ArrayBuffer(sumIndexCount * indexStride);

        let indexOffset = 0;
        let vbByteOffset = 0;
        let ibByteOffset = 0;
        for (const g of m) {
          const origVBView = new Uint8Array(g.primitive.vertexBuffers[0]);
          const byteLen = g.primitive.vertexBuffers[0].byteLength;
          const newVBView = new Uint8Array(vb, vbByteOffset);
          newVBView.set(origVBView);

          const origIBView = new origIndexConstructor(g.primitive.indexBuffer);
          const newIBView = new indexConstructor(ib, ibByteOffset);
          if (origIndexConstructor == indexConstructor) {
            newIBView.set(origIBView.map((x) => x + indexOffset));
          } else {
            // 在 origIBView 上面计算16位整数会有可能溢出

            newIBView.set(origIBView);
            newIBView.set(newIBView.map((x) => x + indexOffset));
          }

          vbByteOffset += byteLen;
          ibByteOffset += g.primitive.indexCount * indexStride;
          indexOffset += g.primitive.vertexCount;
        }
        const newGeo = new BufferGeometry("merged-index-geometry");
        // newGeo.initialize(m[0].attributes, sumVertexCount, [], m[0].usage);
        newGeo.primitive.material = mat;
        newGeo.primitive.vertexBuffers[0] = vb;
        // newGeo.primitive.indexBuffer = ib;
        // newGeo.primitive.indexCount = sumIndexCount;

        merged.push(newGeo);
      }
    });
  }
}
