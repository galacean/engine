---
order: 1
title: Main Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[MainModule](/apis/core/MainModule) is the main module of `ParticleGeneratorModule`, containing the most basic particle generation parameters. These properties are mostly used to control the initial state of newly created particles.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*JUjgTLfiz7kAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

<playground src="particle-mainModule.ts"></playground>

You can debug each property one by one in the provided example to help you better understand and control the main particle module, thereby achieving various complex and beautiful visual effects.

Duration [duration](/apis/core/MainModule#duration) determines how long the particle generator runs, in seconds. A longer duration means the particle system will generate more particles, creating a continuous effect.

Is Loop [isLoop](/apis/core/MainModule#isLoop) if set to true, the particle generator will automatically restart after the duration ends, forming a continuous effect, such as smoke or flowing water.

Start Delay [startDelay](/apis/core/MainModule#startDelay) determines the delay time before the particle generator starts emitting after being activated, which is useful for effects that require a time difference, such as fireworks.

Start Lifetime [startLifetime](/apis/core/MainModule#startLifetime) determines how long each particle can live before disappearing. A longer lifetime means particles will stay on the screen longer.

Start Speed [startSpeed](/apis/core/MainModule#startSpeed) determines the speed at which particles are emitted. Higher initial speed will cause particles to spread quickly, like an explosion effect; lower speed will make particles drift slowly, like a smoke effect.

Start Size 3D [startSize3D](/apis/core/MainModule#startSize3D) allows setting different sizes for the x, y, z axes of the particles to achieve anisotropic particle effects, such as elongated flames. The initial size of particles when the particle generator first generates particles [startSize](/apis/core/MainModule#startSize) controls the size of each particle. Larger initial size is suitable for simulating large clouds of smoke or flames, while smaller size is suitable for fine dust or splashes. For specific axis initial size, the initial size along the x-axis [startSizeX](/apis/core/MainModule#startSizeX), along the y-axis [startSizeY](/apis/core/MainModule#startSizeY), and along the z-axis [startSizeZ](/apis/core/MainModule#startSizeZ) respectively control the size of particles on the x, y, z axes, making the particle shapes more diverse and delicate.

Start Rotation 3D [startRotation3D](/apis/core/MainModule#startRotation3D) allows particles to rotate in 3D space, increasing the three-dimensionality and complexity of particles, such as falling leaves in three-dimensional space. The initial rotation of particles when the particle generator first generates particles (startRotation) sets the rotation angle of particles when emitted, suitable for effects where particles need to move in a specific direction, such as directional flames. The initial rotation along the x-axis [startRotationX](/apis/core/MainModule#startRotationX), along the y-axis [startRotationY](/apis/core/MainModule#startRotationY), and along the z-axis [startRotationZ](/apis/core/MainModule#startRotationZ) respectively control the rotation of particles on the x, y, z axes, increasing the freedom of particle movement. Flip Rotation [flipRotation](/apis/core/MainModule#flipRotation) ranges from 0 to 1, making some particles rotate in the opposite direction, increasing the randomness and naturalness of the particle system, suitable for simulating complex motion trajectories.

Start Color [startColor](/apis/core/MainModule#startColor) determines the color of particles, which can be used to simulate different material effects, such as the red-orange color of flames or the gray-white color of smoke.

Gravity Modifier [gravityModifier](/apis/core/MainModule#gravityModifier) adjusts the degree to which particles are affected by gravity, making particles look more realistic, such as falling raindrops or rising smoke.

选择模拟粒子的空间 [simulationSpace](/apis/core/MainModule#simulationSpace) 决定了粒子是相对于世界还是相对于生成器自身运动。世界空间适合固定位置的效果，如烟雾；本地空间适合随对象移动的效果，如火焰尾迹。

模拟速度 [simulationSpeed](/apis/core/MainModule#simulationSpeed) 可整体加快或减慢粒子的运动速度，适用于时间慢动作或加速效果。

缩放模式 [scalingMode](/apis/core/MainModule#scalingMode) 决定了粒子生成器在发射粒子时，如何处理位置、旋转和缩放等变换操作。使用 scalingMode 能确保粒子生成器和粒子之间的变换关系符合预期。scalingMode 有以下几种模式：

- Local：粒子会继承粒子生成器的局部变换，即粒子的变换是在生成器的本地坐标系中进行的。

- World：粒子会继承粒子生成器的全局变换，即粒子的变换是在世界坐标系中进行的。

- Hierarchy：粒子会继承整个变换层级中的变换，即粒子会考虑到生成器的父级及更上级的变换。

如果设置为 true，粒子生成器将在启动时自动开始播放 [playOnEnabled](/apis/core/MainModule#playOnEnabled) 。开启这个选项会确保粒子系统一启动就开始发射粒子，适用于需要立即显示效果的场景。

最大粒子数 [maxParticles](/apis/core/MainModule#maxParticles) 限制了粒子系统的最大粒子数，以防止性能问题。较大的值适用于需要大量粒子的效果，如浓烟。
