import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Shader, ShaderProperty } from "../shader";
import { ParticleBillboardVertexAttribute } from "./enums/attributes/BillboardParticleVertexAttribute";
import { ParticleInstanceVertexAttribute } from "./enums/attributes/ParticleInstanceVertexAttribute";

/**
 * @internal
 */
export class ParticleBufferDefinition {
  static readonly billboardVertexElement = new VertexElement(
    ParticleBillboardVertexAttribute.cornerTextureCoordinate,
    0,
    VertexElementFormat.Vector4,
    0
  );

  static readonly instanceVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ShapePositionStartLifeTime, 0, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.DirectionTime, 16, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartColor, 32, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSize, 48, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartRotation0, 60, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSpeed, 72, VertexElementFormat.Float, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random0, 76, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random1, 92, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldPosition, 108, VertexElementFormat.Vector3, 1, 1), //TODO:local模式下可省去内存
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldRotation, 120, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationUV, 136, VertexElementFormat.Vector4, 1, 1)
  ];

  static readonly instanceVertexStride = 152;
  static readonly instanceVertexFloatStride = ParticleBufferDefinition.instanceVertexStride / 4;

  static readonly startLifeTimeOffset = 3;
  static readonly timeOffset = 7;
  static readonly simulationOffset = 34;

  static readonly billboardIndexCount = 6;

  static billboardVertexBufferBinding: VertexBufferBinding;
  static billboardIndexBufferBinding: IndexBufferBinding;

  //Base
  static _worldPositionProperty: ShaderProperty = ShaderProperty.getByName("u_WorldPosition");
  static _worldRotationProperty: ShaderProperty = ShaderProperty.getByName("u_WorldRotation");
  static _positionScaleProperty: ShaderProperty = ShaderProperty.getByName("u_PositionScale");
  static _sizeScaleProperty: ShaderProperty = ShaderProperty.getByName("u_SizeScale");
  static _scaleModeProperty: ShaderProperty = ShaderProperty.getByName("u_ScalingMode");
  static _gravityProperty: ShaderProperty = ShaderProperty.getByName("u_Gravity");
  static _startRotation3DProperty: ShaderProperty = ShaderProperty.getByName("u_ThreeDStartRotation");
  static _lengthScaleProperty: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardLengthScale");
  static _speedScaleProperty: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardSpeedScale");
  static _simulationSpaceProperty: ShaderProperty = ShaderProperty.getByName("u_SimulationSpace");
  static _currentTime: ShaderProperty = ShaderProperty.getByName("u_CurrentTime");

  //VelocityOverLifetime
  static VOLVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConst");
  static VOLVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientX");
  static VOLVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientY");
  static VOLVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientZ");
  static VOLVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConstMax");
  static VOLVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxX");
  static VOLVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxY");
  static VOLVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxZ");
  static VOLSPACETYPE: ShaderProperty = ShaderProperty.getByName("u_VOLSpaceType");

  //ColorOverLifetime
  static COLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName("u_ColorOverLifeGradientAlphas");
  static COLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName("u_ColorOverLifeGradientColors");
  static MAXCOLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName("u_MaxColorOverLifeGradientAlphas");
  static MAXCOLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName("u_MaxColorOverLifeGradientColors");

  //SizeOverLifetime
  static SOLSIZEGRADIENT: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradient");
  static SOLSIZEGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientX");
  static SOLSIZEGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientY");
  static SOLSizeGradientZ: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientZ");
  static SOLSizeGradientMax: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMax");
  static SOLSIZEGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxX");
  static SOLSIZEGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxY");
  static SOLSizeGradientZMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxZ");

  //RotationOverLifetime
  static ROLANGULARVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConst");
  static ROLANGULARVELOCITYCONSTSEPRARATE: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityConstSeprarate"
  );
  static ROLANGULARVELOCITYGRADIENT: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradient");
  static ROLANGULARVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientX");
  static ROLANGULARVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientY");
  static ROLANGULARVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientZ");
  static ROLANGULARVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConstMax");
  static ROLANGULARVELOCITYCONSTMAXSEPRARATE: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityConstMaxSeprarate"
  );
  static ROLANGULARVELOCITYGRADIENTMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMax");
  static ROLANGULARVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxX");
  static ROLANGULARVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxY");
  static ROLANGULARVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxZ");
  static ROLANGULARVELOCITYGRADIENTWMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxW");

  //TextureSheetAnimation
  static TEXTURESHEETANIMATIONCYCLES: ShaderProperty = ShaderProperty.getByName("u_TSACycles");
  static TEXTURESHEETANIMATIONSUBUVLENGTH: ShaderProperty = ShaderProperty.getByName("u_TSASubUVLength");
  static TEXTURESHEETANIMATIONGRADIENTUVS: ShaderProperty = ShaderProperty.getByName("u_TSAGradientUVs");
  static TEXTURESHEETANIMATIONGRADIENTMAXUVS: ShaderProperty = ShaderProperty.getByName("u_TSAMaxGradientUVs");

  static initialize(engine: Engine): void {
    const stride = 16;
    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, stride * 4, BufferUsage.Static, false);
    const billboardVertices = new Float32Array([-0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0]);
    vertexBuffer.setData(billboardVertices);
    ParticleBufferDefinition.billboardVertexBufferBinding = new VertexBufferBinding(vertexBuffer, stride);

    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      ParticleBufferDefinition.billboardIndexCount,
      BufferUsage.Static,
      false
    );
    const billboardIndices = new Uint8Array([0, 2, 1, 0, 3, 2]);
    indexBuffer.setData(billboardIndices);
    ParticleBufferDefinition.billboardIndexBufferBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt8);
  }
}
