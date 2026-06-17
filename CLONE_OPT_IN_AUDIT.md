# Clone Opt-in Migration Audit

Capture-audit for the opt-out → opt-in (`@property`) flip. Goal: find every field that is
**currently cloned but undecorated**, which would silently stop cloning once only `@property`
fields are walked.

## Status

- ✅ Mechanism: `CloneManager` flipped to opt-in (walks the `@property` field set; HOW type-driven).
  `@property` added; `@deepClone`/`@assignmentClone` are temporary bridges to it, `@ignoreClone` a
  no-op bridge — so all 64 existing files keep compiling during migration.
- ✅ Field pass: 143 `@property` added (per-file counts match this audit exactly; no stacked
  decorators). `Skin.name` converted from ctor-param to a `@property` field + parameterless ctor.
- ✅ Invariants verified: every object-typed `@assignmentClone` is Assignment-default (Font /
  AnimatorController / AudioClip / SubFont = ReferResource); no object-typed `@deepClone` is on an
  Assignment/Remap type → the type-driven HOW flip is behavior-exact. Decision D auto-satisfied
  (`_camera` = Remap, `_renderTarget` = Assignment via type default — no special handling needed).
- ✅ `tsc` clean (only pre-existing module-resolution noise), prettier clean.
- ⏳ Runtime verification: needs `pnpm build` + clone tests (can't run on this src-checkout worktree).
- ✅ Cosmetic cleanup DONE: 63 files converted (`@deepClone`/`@assignmentClone` → `@property`,
  `@ignoreClone` deleted); bridge decorators + `CloneMode.Ignore` removed. Source compiles clean,
  prettier clean. 313 `@property` decorators total.
- ✅ Spec tests rewritten for opt-in: `CloneUtils.test.ts` + `Transform.test.ts` fixtures now mark
  fields `@property`; the "undecorated/type-inference" + "decorator-wins" blocks were replaced with an
  "Opt-in: marked vs unmarked fields" block (incl. "unmarked field is NOT cloned"); the redundant
  "Undecorated array/object" blocks were dropped; titles updated. 0 legacy decorator references remain.
- ✅ Runtime verified: `pnpm build` + browser tests — **986 passing, 0 failing** (core 826 incl.
  physics/postprocess/materials/particle/all components; ui 64; loader 96 incl. PrefabResource +
  SceneFormatV2). Run per-dir/per-file: the vitest browser runner hits a websocket payload cap
  (`WS_ERR_UNSUPPORTED_MESSAGE_LENGTH`) if too many browser test files run in one process — infra, not a
  failure. (It also surfaces if a clone assertion fails on Entity/Component objects → huge diff overflows
  the socket; that's how the UIInteractive Transition gap first showed up.)
- ✅ `PrefabResource.test.ts` (prefab `instantiate()` = `_root.clone()`): 3 fixture scripts used
  undecorated fields → didn't carry on instantiate. Decorated `DiceScript.skinMesh/numMesh`,
  `OverrideCallScript.value/receivedArgs`, `EntityRefScript.target`. Reinforces the unified rule: a field
  serialized into a prefab is by definition `@property`.

## Gap-fill (post-audit; found via the test suite + a static `@property`-field-type sweep)

The first audit discovered files **by their decorators**, so cloneable classes with *only undecorated*
state (relying on opt-out auto-clone) were invisible. Closed:
- **Decorator-less Component subclasses:** physics shapes (`Sphere`/`Capsule`/`Mesh`ColliderShape),
  joints (`SpringJoint`; `FixedJoint`/`StaticCollider` have no own state), `PointLight.distance`,
  `Probe`, particle shapes (`Sphere`/`Cone`/`Circle`/`Hemisphere`Shape).
- **Plain deep-clone targets** reached via now-`@property` object fields: `PhysicsMaterial`,
  `PostProcessEffect`(+`Bloom`/`Tonemapping`) and `PostProcessEffectParameter` (the value wrapper),
  `Transition`(+ `_target`/`_interactive` — a sub-object whose owner `UIInteractive` never re-links it).
- **Confirmed dormant (no action):** `DepthState`/`StencilState`/`RasterState`/`RenderTargetBlendState`
  — only held by `ShaderPass` (asset) / `Engine` (singleton), never reached from a `@property` field.
- **Pre-existing, out of scope (flagged):** `MeshColliderShape` clone doesn't rebuild its native shape /
  has an unbalanced `_mesh` refcount (present under opt-out too); `ShaderData` deep-clone copies nothing
  (all fields were `@ignoreClone`; behavior preserved).

## Model

- **Today (opt-out):** `ComponentCloner` does `for (k in source) cloneProperty(...)` — EVERY
  enumerable instance field is cloned unless `@ignoreClone`. `@deepClone`/`@assignmentClone` only
  pick HOW.
- **Target (opt-in):** only `@property` fields are cloned. HOW stays type-driven
  (`type + @defaultCloneMode`): Entity/Component → Remap, ReferResource/flyweights → Assignment,
  else → Deep.

## Mechanical conversion rules

1. `@ignoreClone` → **delete** the decorator (unmarked = not cloned; behavior preserved). ~347 sites.
2. `@deepClone` / `@assignmentClone` → **`@property`** (still cloned; HOW now type-driven). ~171 sites.
3. Undecorated-but-cloned fields holding real state → **add `@property`** (the regression risks
   below). ~141 sites.
4. Undecorated transient/derived/back-pointer fields → leave unmarked (safe to drop).

`_cloneTo` always runs after the field walk, so fields it re-establishes (e.g. `MeshRenderer._mesh`,
`SpriteRenderer._sprite`, `UICanvas._renderMode`, `UITransform._size/_pivot`) need NO `@property`.

The deep-clone Construct stage calls `new ctor()`, so constructors DO run on clones — function-typed
fields (bound handlers) are re-established by the ctor and correctly skipped by the function fast-path.

---

## REGRESSION RISKS — undecorated fields that need `@property` (≈141)

### core
**Camera** (19): `enableFrustumCulling`, `clearFlags`, `cullingMask`, `postProcessMask`,
`depthTextureMode`, `opaqueTextureDownsampling`, `antiAliasing`, `isAlphaOutputRequired`, `_priority`,
`_isCustomViewMatrix`, `_isCustomProjectionMatrix`, `_fieldOfView`, `_orthographicSize`,
`_customAspectRatio`, `_opaqueTextureEnabled`, `_enableHDR`, `_enablePostProcess`, `_msaaSamples`,
`_renderTarget` *(see Decision D — also breaks `_cloneTo` refcount if dropped)*
**VirtualCamera** (3): `isOrthographic`, `nearClipPlane`, `farClipPlane`
**Renderer** (1): `castShadows`

### lighting + mesh
**Light** (6): `cullingMask`, `shadowType`, `shadowBias`, `shadowNormalBias`, `shadowNearPlane`,
`_shadowStrength`
**DirectLight** (1): `shadowNearPlaneOffset`
**SpotLight** (3): `distance`, `angle`, `penumbra`
**MeshRenderer** (1): `_enableVertexColor`
**Skin** (3): `_rootBone`, `name` *(ctor-param prop — see Decision A)*, `joints` (deprecated)

### physics
**Collider** (1): `_collisionLayerIndex`
**DynamicCollider** (13): `_linearDamping`, `_angularDamping`, `_mass`, `_maxAngularVelocity`,
`_maxDepenetrationVelocity`, `_solverIterations`, `_useGravity`, `_isKinematic`, `_constraints`,
`_collisionDetectionMode`, `_sleepThreshold`, `_automaticCenterOfMass`, `_automaticInertiaTensor`
**CharacterController** (3): `_stepOffset`, `_nonWalkableMode`, `_slopeLimit`
**Joint** (3): `_force`, `_torque`, `_automaticConnectedAnchor`
**JointColliderInfo** (3): `collider` *(UNCERTAIN — see below)*, `massScale`, `inertiaScale`
**HingeJoint** (2): `_hingeFlags`, `_useSpring`
**JointLimits** (5): `_max`, `_min`, `_contactDistance`, `_stiffness`, `_damping`
**JointMotor** (4): `_targetVelocity`, `_forceLimit`, `_gearRatio`, `_freeSpin`
**ColliderShape** (4): `_material`, `_isTrigger`, `_contactOffset`, `isSceneQuery`

### particle
**ParticleRenderer** (4): `velocityScale`, `lengthScale`, `_renderMode`, `_mesh`
**ParticleGenerator** (1): `useAutoRandomSeed`  *(+ `_randomSeed` UNCERTAIN — Decision C)*
**MainModule** (9): `duration`, `isLoop`, `startRotation3D`, `flipRotation`, `simulationSpeed`,
`scalingMode`, `playOnEnabled`, `_startSize3D`, `_simulationSpace`
**Burst** (3): `time`, `_cycles`, `_repeatInterval` *(+ `count` already @deepClone; see Decision A)*
**ForceOverLifetimeModule** (1): `_space`
**LimitVelocityOverLifetimeModule** (5): `_separateAxes`, `_dampen`, `_multiplyDragByParticleSize`,
`_multiplyDragByParticleVelocity`, `_space`
**NoiseModule** (6): `_scrollSpeed`, `_separateAxes`, `_frequency`, `_octaveCount`,
`_octaveIntensityMultiplier`, `_octaveFrequencyMultiplier`
**RotationOverLifetimeModule** (1): `separateAxes`
**SizeOverLifetimeModule** (1): `_separateAxes`
**VelocityOverLifetimeModule** (1): `_space`
**TextureSheetAnimationModule** (2): `type`, `cycleCount`
**ParticleCompositeCurve** (3): `_mode`, `_constantMin`, `_constantMax`
**ParticleCompositeGradient** (1): `mode`
**CurveKey** (2): `_time`, `_value`
**GradientColorKey** (2): `_time`, `_color` *(undecorated → currently shallow-shared; should be deep)*
**GradientAlphaKey** (2): `_time`, `_alpha`
**ParticleGeneratorModule** (1): `_enabled` ← **base class; the per-module on/off flag — affects ALL modules**
**BaseShape** (2): `_enabled`, `_randomDirectionAmount`

### shader-state / post / trail
**BlendState** (1): `alphaToCoverage`
**RenderState** (1): `renderQueueType`
**PostProcess** (4): `layer`, `blendDistance`, `_priority`, `_isGlobal`
**TrailRenderer** (3): `emitting`, `minVertexDistance`, `_time`

### animation
**Animator** (1): `cullingMode`

### ui
**UICanvas** (1): `_camera` *(see Decision D — currently deep-cloned, NOT handled by `_cloneTo`)*
**UITransform** (8): `_alignLeft`, `_alignRight`, `_alignCenter`, `_alignTop`, `_alignBottom`,
`_alignMiddle`, `_horizontalAlignment`, `_verticalAlignment`

---

## Undecorated fields safe to DROP (transient / derived / back-pointer)

- **core:** `Component._entity`, `EngineObject._pendingDestroy`, `EngineObject._destroyed`,
  `Transform._parentTransformCache`, `Camera._isProjectionDirty`, `Camera._isInvProjMatDirty`,
  `Renderer._transformEntity`
- **particle:** `ParticleRenderer._currentRenderModeMacro`, `ParticleRenderer._supportInstancedArrays`,
  `ParticleGenerator._currentParticleCount`, `ParticleGenerator._renderer`, `MainModule._tempVector40`,
  `EmissionModule._frameRateTime`, `EmissionModule._currentBurstIndex`, `HingeJoint._angle`,
  `HingeJoint._velocity`, `ParticleCurve._typeArrayDirty`, `ParticleGradient._colorTypeArrayDirty`,
  `ParticleGradient._alphaTypeArrayDirty`, `GradientColorKey._onValueChanged`,
  `GradientAlphaKey._onValueChanged`
- **physics:** `ColliderShape._collider`
- **ui (back-pointers, lazy-resolved):** `UICanvas._rootCanvas`, `UICanvas._cameraObserver`,
  `UIGroup._group`, `UIGroup._rootCanvas`, `UIRenderer._rootCanvas`, `UIRenderer._group`,
  `UIInteractive._rootCanvas`, `UIInteractive._group`

(All other transient fields already carry `@ignoreClone` → just delete the decorator.)

---

## Decisions needed

**A. Parameterless-constructor contract violated by `Burst`.**
Clone Construct does `new ctor()`. `Burst` only has `constructor(time, count)`. Today the field-walk
backfills, but the clone is constructed with `undefined` args first. Recommend: make ctor params
optional so every cloneable class is parameterless-constructible (the contract we documented). Same
check for any other arg-required cloneable class (`Skin(name)` is similar).

**B. Particle "value types" have NO `copyFrom`.**
`ParticleCompositeCurve` / `ParticleCurve` / `ParticleGradient` / `ParticleCompositeGradient` /
`CurveKey` / gradient keys are field-cloned, not copyFrom-cloned. So all their state fields need
`@property` (listed above). No fork — just noting they're not the value-type fast path.

**C. `ParticleGenerator._randomSeed`.**
Moot when `useAutoRandomSeed` (re-randomized on play), but a user-set custom seed is authored state.
Recommend KEEP (`@property`) for reproducibility.

**D. References currently DEEP-cloned by accident: `UICanvas._camera`, `Camera._renderTarget`.**
Undecorated today → deep-cloned, which is wrong for a Camera/RenderTarget reference. The flip is the
chance to fix HOW: a Camera reference should Remap (or share), a RenderTarget should share (Assignment)
— not deep-clone. Recommend `@property` + correct type-driven HOW, not preserve the buggy deep clone.
`Camera._renderTarget` must be kept (its `_cloneTo` refcount depends on the reference being present).

**E. ReferResource scope (`Sprite` etc.).**
`Sprite` is a `ReferResource`, NOT walked by `ComponentCloner` — it has its own manual `clone()`. Its
undecorated fields are moot for the component flip. Recommend: scope opt-in to Component clone now;
unify ReferResource serialization later.

**F. UI back-pointers undecorated (not even `@ignoreClone`).**
`_rootCanvas`/`_group` on UICanvas/UIGroup/UIRenderer/UIInteractive are cloned today (wastefully) but
safe to drop (lazy re-resolve). Minor pre-existing sloppiness; the flip fixes it for free.

---

## Suggested staging

1. **Mechanism:** add `@property` decorator; generalize the per-class registry into a property-field
   set; switch `cloneComponent`/`cloneProperty` to iterate the set instead of `for k in source`.
2. **Migrate, package by package** (core → physics → particle → 2d/anim → shader/post/trail → ui),
   verifying after each: convert `@deep`/`@assign` → `@property`, add `@property` to the risk fields
   above, delete `@ignoreClone`.
3. **Verify:** instrument the cloner to diff the runtime-cloned (class, field) set before vs after — it
   must match except the intentional drops.
