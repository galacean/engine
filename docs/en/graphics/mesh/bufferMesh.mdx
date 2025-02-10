---
order: 2
title: Buffer Mesh
type: Graphics
group: Mesh
label: Graphics/Mesh
---

[BufferMesh](/apis/core/#BufferMesh) allows free manipulation of vertex buffers and index buffer data, as well as some instructions related to geometry drawing. It is efficient, flexible, and concise. Developers who want to efficiently and flexibly implement custom geometries can use this class.

## Diagram

Let's first overview the diagram of `BufferMesh`.

![image.png](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*piB3Q4501loAAAAAAAAAAAAAARQnAQ)

`BufferMesh` has three core elements:

| Name                                                  | Description                                                              |
| :---------------------------------------------------- | :----------------------------------------------------------------------- |
| [VertexBufferBinding](/apis/core/#VertexBufferBinding) | Vertex buffer binding, used to package vertex buffers and vertex strides (bytes). |
| [VertexElement](/apis/core/#VertexElement)             | Vertex element, used to describe vertex semantics, vertex offsets, vertex formats, and vertex buffer binding indices. |
| [IndexBufferBinding](/apis/core/#IndexBufferBinding)   | Index buffer binding (optional), used to package index buffers and index formats. |

Among them, [IndexBufferBinding](/apis/core/#IndexBufferBinding) is optional, which means that there are only two necessary core elements, set through the [setVertexBufferBindings()](/apis/core/#BufferMesh-setVertexBufferBindings) interface and the [setVertexElements()](/apis/core/#BufferMesh-setVertexElements) interface. The final step is to add sub [SubMesh](/apis/core/#SubMesh) through [addSubMesh](/apis/core/#BufferMesh-addSubMesh) and set the number of vertices or indices to draw. [SubMesh](/apis/core/#SubMesh) contains three properties: start drawing offset, drawing count, and primitive topology. Developers can add multiple [SubMesh](/apis/core/#SubMesh), each sub-geometry can correspond to an independent material.

## Common Cases

Here are some common use cases of [MeshRenderer](/apis/core/#MeshRenderer) and [BufferMesh](/apis/core/#BufferMesh). Because this class is low-level and flexible, detailed code examples are provided.

### Interleaved Vertex Buffer

<playground src="buffer-mesh-interleaved.ts"></playground>

A common method, such as custom Mesh, Particle implementation, has the advantages of compact video memory and fewer CPU data uploads to the GPU per frame. The main feature of this case is that multiple [VertexElement](/apis/core/#VertexElement) correspond to one *VertexBuffer* ([Buffer](/apis/core/#Buffer)), and only one *VertexBuffer* is used to associate different vertex elements with the Shader.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer(vertexByteCount);

// create vertexBuffer and upload vertices.
const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices);

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBinding(vertexBuffer, 16);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 12, VertexElementFormat.NormalizedUByte4, 0),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

### Independent Vertex Buffer

<playground src="buffer-mesh-independent.ts"></playground>

It has advantages when mixing dynamic vertex buffers and static vertex buffers, such as _position_ being static but _color_ being dynamic. Independent vertex buffers can update only the color data to the GPU. The main feature of this case is that one [VertexElement](/apis/core/#VertexElement) corresponds to one _VertexBuffer_, and the [setData](/apis/core/#Buffer-setData) method of the [Buffer](/apis/core/#Buffer) object can be called separately to update the data independently.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const positions = new Float32Array(vertexCount);
const colors = new Uint8Array(vertexCount);

// create vertexBuffer and upload vertices.
const positionBuffer = new Buffer(
  engine,
  BufferBindFlag.VertexBuffer,
  positions
);
const colorBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, colors);

// bind vertexBuffer with stride,stride is every vertex byte length,so the value is 12.
mesh.setVertexBufferBindings([
  new VertexBufferBinding(positionBuffer, 12),
  new VertexBufferBinding(colorBuffer, 4),
]);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 0, VertexElementFormat.NormalizedUByte4, 1),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

### Instance Rendering

<playground src="buffer-mesh-instance.ts"></playground>

GPU Instance rendering is a common technique in 3D engines. For example, it allows rendering objects with the same geometric shape at different positions in one go, significantly improving rendering performance. The main feature of this example is the use of the instance functionality of [VertexElement](/apis/core/#VertexElement). The last parameter of its constructor indicates the instance step rate (the number of instances drawn per vertex advance in the buffer, non-instance elements must be 0). The [instanceCount](/apis/core/#BufferMesh-instanceCount) of [BufferMesh](/apis/core/#BufferMesh) indicates the number of instances.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer( vertexByteLength );

// create instance data.
const instances = new Float32Array( instanceDataLength );

// create vertexBuffer and upload vertex data.
const vertexBuffer = new Buffer( engine, BufferBindFlag.VertexBuffer, vertices );

// create instance buffer and upload instance data.
const instanceBuffer = new Buffer( engine, BufferBindFlag.VertexBuffer, instances );

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBindings([new VertexBufferBinding( vertexBuffer, 16 ),
                                  new VertexBufferBinding( instanceBuffer, 12 )]);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([new VertexElement( "POSITION", 0, VertexElementFormat.Vector3, 0 ),
                            new VertexElement( "COLOR", 12, VertexElementFormat.NormalizedUByte4, 0 ),
                            new VertexElement( "INSTANCE_OFFSET", 0, VertexElementFormat.Vector3, 1 , 1 ),
                            new VertexElement( "INSTANCE_ROTATION", 12, VertexElementFormat.Vector3, 1 , 1 )]]);

// add one sub mesh and set how many vertex you want to render, here is full vertexCount.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```

## Index Buffer

Using an index buffer allows reusing vertices in the vertex buffer, thereby saving video memory. Its usage is straightforward, just adding an index buffer object on top of the original setup. The following code is modified based on the first **Interleaved Vertex Buffer** example.

```typescript
// add MeshRenderer component
const renderer = entity.addComponent(MeshRenderer);

// create mesh
const mesh = new BufferMesh(engine);

// create vertices.
const vertices = new ArrayBuffer(vertexByteCount);

// create indices.
const indices = new Uint16Array(indexCount);

// create vertexBuffer and upload vertices.
const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices);

// create indexBuffer and upload indices.
const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices);

// bind vertexBuffer with stride, stride is every vertex byte length,so the value is 16.
mesh.setVertexBufferBinding(vertexBuffer, 16);

// bind vertexBuffer with format.
mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);

// add vertexElement to tell GPU how to read vertex from vertexBuffer.
mesh.setVertexElements([
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR", 12, VertexElementFormat.NormalizedUByte4, 0),
]);

// add one subMesh and set how many vertex you want to render.
mesh.addSubMesh(0, vertexCount);

// set mesh
renderer.mesh = mesh;
```
