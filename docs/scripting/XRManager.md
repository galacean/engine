# XR Manager - LLM Documentation

## System Overview

The XR Manager provides comprehensive Extended Reality (AR/VR) capabilities for the Galacean 3D engine, enabling immersive experiences across different XR platforms. It features session management, feature-based architecture, platform abstraction, and seamless integration with the engine's component system for building cross-platform XR applications.

## Core Architecture

### XR Manager Structure
```typescript
// Base XR Manager (located in core package - stub implementation)
const xrManager = engine.xrManager;

// Check XR availability
if (xrManager) {
  console.log("XR capabilities available");
} else {
  console.log("XR not supported in this build");
}

// XR Manager Extended (full implementation in xr package)
// Automatically replaces base XR Manager through mixin pattern
```

### XR Session Manager (Core XR Lifecycle)
```typescript
// Access session manager
const sessionManager = xrManager.sessionManager;

// Check session state
console.log(`Session State: ${sessionManager.state}`);
console.log(`Session Mode: ${sessionManager.mode}`);

// Session state monitoring
sessionManager.addStateChangedListener((state: XRSessionState) => {
  switch (state) {
    case XRSessionState.None:
      console.log("XR session not initialized");
      break;
    case XRSessionState.Initializing:
      console.log("XR session initializing...");
      break;
    case XRSessionState.Initialized:
      console.log("XR session ready");
      break;
    case XRSessionState.Running:
      console.log("XR session active");
      break;
    case XRSessionState.Paused:
      console.log("XR session paused");
      break;
  }
});
```

### XR Feature System (Modular XR Capabilities)
```typescript
// Check if feature is supported before adding
if (xrManager.isSupportedFeature(XRHandTracking)) {
  // Add hand tracking feature
  const handTracking = xrManager.addFeature(XRHandTracking, {
    handedness: "both",
    jointRadius: 0.01
  });
  
  if (handTracking) {
    console.log("Hand tracking feature added successfully");
  }
} else {
  console.log("Hand tracking not supported on this platform");
}

// Get existing feature
const cameraManager = xrManager.getFeature(XRCameraManager);
if (cameraManager) {
  // Configure camera settings
  cameraManager.enabled = true;
}
```

## XR Session Management

### Session Initialization and Lifecycle
```typescript
class XRController extends Script {
  private xrManager: XRManager;
  private originEntity: Entity;
  
  onAwake() {
    this.xrManager = this.engine.xrManager;
    
    // Create XR origin entity (connection between virtual and real world)
    this.originEntity = this.entity.createChild("XROrigin");
    this.xrManager.origin = this.originEntity;
  }
  
  // Enter AR mode
  async enterAR() {
    try {
      // Check if AR is supported
      await this.xrManager.sessionManager.isSupportedMode(XRSessionMode.ImmersiveAR);
      
      // Enter XR with automatic session start
      await this.xrManager.enterXR(XRSessionMode.ImmersiveAR, true);
      console.log("AR session started successfully");
      
    } catch (error) {
      console.error("Failed to start AR session:", error);
    }
  }
  
  // Enter VR mode
  async enterVR() {
    try {
      await this.xrManager.sessionManager.isSupportedMode(XRSessionMode.ImmersiveVR);
      await this.xrManager.enterXR(XRSessionMode.ImmersiveVR, true);
      console.log("VR session started successfully");
      
    } catch (error) {
      console.error("Failed to start VR session:", error);
    }
  }
  
  // Manual session control
  async enterXRWithManualControl() {
    try {
      // Enter XR without auto-starting
      await this.xrManager.enterXR(XRSessionMode.ImmersiveVR, false);
      
      // Manual session start when ready
      this.xrManager.sessionManager.run();
      
    } catch (error) {
      console.error("XR initialization failed:", error);
    }
  }
  
  // Exit XR session
  async exitXR() {
    try {
      await this.xrManager.exitXR();
      console.log("XR session ended");
    } catch (error) {
      console.error("Failed to exit XR:", error);
    }
  }
}
```

### Session State Management
```typescript
class XRSessionController extends Script {
  private sessionManager: XRSessionManager;
  
  onAwake() {
    this.sessionManager = this.engine.xrManager.sessionManager;
    
    // Listen for session state changes
    this.sessionManager.addStateChangedListener(this.onSessionStateChanged.bind(this));
  }
  
  onSessionStateChanged(state: XRSessionState) {
    switch (state) {
      case XRSessionState.Initializing:
        this.showLoadingUI();
        break;
        
      case XRSessionState.Initialized:
        this.hideLoadingUI();
        this.setupXRScene();
        break;
        
      case XRSessionState.Running:
        this.enableXRInteractions();
        this.startXRRendering();
        break;
        
      case XRSessionState.Paused:
        this.pauseXRInteractions();
        break;
        
      case XRSessionState.None:
        this.cleanupXRScene();
        break;
    }
  }
  
  // Manual session control
  pauseSession() {
    if (this.sessionManager.state === XRSessionState.Running) {
      this.sessionManager.stop();
    }
  }
  
  resumeSession() {
    if (this.sessionManager.state === XRSessionState.Paused) {
      this.sessionManager.run();
    }
  }
  
  // Session information
  getSessionInfo() {
    return {
      mode: this.sessionManager.mode,
      state: this.sessionManager.state,
      frameRate: this.sessionManager.frameRate,
      supportedFrameRates: this.sessionManager.supportedFrameRate
    };
  }
}
```

## XR Feature Management

### Feature Registration and Usage
```typescript
// Custom XR feature implementation
@registerXRFeature(XRFeatureType.CustomFeature)
class CustomXRFeature extends XRFeature {
  private customData: any;
  
  constructor(xrManager: XRManagerExtended, config: any) {
    super(xrManager);
    this.customData = config;
  }
  
  _onSessionInit(): void {
    console.log("Custom XR feature initializing");
    // Initialize feature-specific resources
  }
  
  _onSessionStart(): void {
    console.log("Custom XR feature starting");
    // Start feature operation
  }
  
  _onUpdate(): void {
    // Per-frame feature updates
    if (this.enabled) {
      this.updateCustomLogic();
    }
  }
  
  _onSessionStop(): void {
    console.log("Custom XR feature stopping");
    // Pause feature operation
  }
  
  _onSessionExit(): void {
    console.log("Custom XR feature exiting");
    // Cleanup feature resources
  }
  
  private updateCustomLogic() {
    // Feature-specific update logic
  }
}

// Feature management in application
class XRFeatureManager extends Script {
  private features: Map<string, XRFeature> = new Map();
  
  async initializeXRFeatures() {
    const xrManager = this.engine.xrManager;
    
    // Add multiple features
    const featureConfigs = [
      { type: XRHandTracking, name: "handTracking", config: { jointRadius: 0.01 } },
      { type: XRPlaneDetection, name: "planeDetection", config: { orientation: "horizontal" } },
      { type: CustomXRFeature, name: "customFeature", config: { customParam: "value" } }
    ];
    
    for (const { type, name, config } of featureConfigs) {
      if (xrManager.isSupportedFeature(type)) {
        const feature = xrManager.addFeature(type, config);
        if (feature) {
          this.features.set(name, feature);
          console.log(`${name} feature added successfully`);
        }
      } else {
        console.warn(`${name} feature not supported on this platform`);
      }
    }
  }
  
  toggleFeature(featureName: string, enabled: boolean) {
    const feature = this.features.get(featureName);
    if (feature) {
      feature.enabled = enabled;
      console.log(`${featureName} feature ${enabled ? 'enabled' : 'disabled'}`);
    }
  }
  
  getFeatureStatus() {
    const status = {};
    this.features.forEach((feature, name) => {
      status[name] = {
        enabled: feature.enabled,
        supported: this.engine.xrManager.isSupportedFeature(feature.constructor)
      };
    });
    return status;
  }
}
```

## XR Input Management

### XR Input Integration
```typescript
class XRInputController extends Script {
  private inputManager: XRInputManager;
  private handEntities: Map<string, Entity> = new Map();
  
  onAwake() {
    this.inputManager = this.engine.xrManager.inputManager;
  }
  
  onUpdate() {
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      this.updateXRInput();
    }
  }
  
  private updateXRInput() {
    // Process XR controllers
    const controllers = this.inputManager.getControllers();
    controllers.forEach((controller, index) => {
      if (controller.connected) {
        this.updateController(controller, index);
      }
    });
    
    // Process hand tracking
    const hands = this.inputManager.getHands();
    hands.forEach((hand, handedness) => {
      if (hand.tracked) {
        this.updateHandTracking(hand, handedness);
      }
    });
  }
  
  private updateController(controller: XRController, index: number) {
    // Get controller pose
    const pose = controller.pose;
    if (pose) {
      // Update controller entity position/rotation
      const controllerEntity = this.getControllerEntity(index);
      controllerEntity.transform.position = pose.position;
      controllerEntity.transform.rotationQuaternion = pose.rotation;
    }
    
    // Handle controller input
    if (controller.selectPressed) {
      this.onControllerSelect(controller, index);
    }
    
    if (controller.squeezePressed) {
      this.onControllerSqueeze(controller, index);
    }
  }
  
  private updateHandTracking(hand: XRHand, handedness: string) {
    // Update hand joint positions
    const handEntity = this.getHandEntity(handedness);
    hand.joints.forEach((joint, jointName) => {
      const jointEntity = handEntity.findByName(jointName);
      if (jointEntity && joint.pose) {
        jointEntity.transform.position = joint.pose.position;
        jointEntity.transform.rotationQuaternion = joint.pose.rotation;
      }
    });
    
    // Gesture recognition
    if (this.isGrabGesture(hand)) {
      this.onGrabGesture(handedness);
    }
    
    if (this.isPinchGesture(hand)) {
      this.onPinchGesture(handedness);
    }
  }
}
```

## XR Camera Management

### Camera Configuration for XR
```typescript
class XRCameraController extends Script {
  private cameraManager: XRCameraManager;
  private mainCamera: Camera;
  
  onAwake() {
    this.cameraManager = this.engine.xrManager.cameraManager;
    this.mainCamera = this.entity.getComponent(Camera);
  }
  
  setupXRCameras() {
    // XR Camera automatically handles stereo rendering
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      // Configure camera for XR
      this.mainCamera.clearFlags = this.getXRClearFlags();
      
      // Disable standard camera updates (XR handles this)
      this.mainCamera.enabled = false;
      
      // XR camera manager takes over rendering
      console.log("XR camera configuration applied");
    }
  }
  
  private getXRClearFlags(): CameraClearFlags {
    // Get appropriate clear flags for XR mode
    return this.cameraManager.getIgnoreClearFlags(this.mainCamera.cameraType);
  }
  
  restoreStandardCamera() {
    // Restore normal camera operation when exiting XR
    this.mainCamera.enabled = true;
    this.mainCamera.clearFlags = CameraClearFlags.All;
  }
  
  // Custom XR camera effects
  applyXRPostProcessing() {
    // Add XR-specific post-processing effects
    const postProcess = this.mainCamera.entity.getComponent(PostProcessPass);
    if (postProcess) {
      // Configure for XR rendering
      postProcess.enabled = true;
    }
  }
}
```

## Advanced XR Patterns

### XR Object Interaction System
```typescript
class XRInteractionSystem extends Script {
  private interactableObjects: Set<Entity> = new Set();
  private raycastLayer = Layer.Layer1;
  
  addInteractableObject(entity: Entity) {
    // Add interaction capabilities to object
    entity.layer = this.raycastLayer;
    
    // Add visual feedback component
    const interactionFeedback = entity.addComponent(XRInteractionFeedback);
    interactionFeedback.highlightColor = new Color(0, 1, 0, 0.5);
    
    this.interactableObjects.add(entity);
  }
  
  onUpdate() {
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      this.processXRInteractions();
    }
  }
  
  private processXRInteractions() {
    const controllers = this.engine.xrManager.inputManager.getControllers();
    
    controllers.forEach((controller, index) => {
      if (controller.connected && controller.pose) {
        // Perform raycast from controller
        const ray = this.createControllerRay(controller);
        const hitResult = this.engine.physicsManager.raycast(
          ray.origin,
          ray.direction,
          Number.MAX_VALUE,
          this.raycastLayer
        );
        
        if (hitResult.entity) {
          this.highlightObject(hitResult.entity);
          
          // Handle interaction input
          if (controller.selectPressed) {
            this.interactWithObject(hitResult.entity, controller);
          }
        }
      }
    });
  }
  
  private createControllerRay(controller: XRController): { origin: Vector3, direction: Vector3 } {
    const transform = controller.pose;
    return {
      origin: transform.position,
      direction: Vector3.transformByQuat(Vector3.forward, transform.rotation)
    };
  }
  
  private interactWithObject(entity: Entity, controller: XRController) {
    // Trigger interaction events
    const interactable = entity.getComponent(XRInteractable);
    if (interactable) {
      interactable.onInteract(controller);
    }
  }
}

// Custom XR interaction component
class XRInteractable extends Component {
  @property()
  interactionType: "grab" | "touch" | "activate" = "activate";
  
  @property()
  hapticFeedback = true;
  
  onInteract(controller: XRController) {
    switch (this.interactionType) {
      case "grab":
        this.startGrab(controller);
        break;
      case "touch":
        this.onTouch(controller);
        break;
      case "activate":
        this.onActivate(controller);
        break;
    }
    
    if (this.hapticFeedback) {
      this.triggerHaptics(controller);
    }
  }
  
  private startGrab(controller: XRController) {
    // Implement grab interaction
    const grabComponent = this.entity.getComponent(XRGrabbable);
    if (grabComponent) {
      grabComponent.attachToController(controller);
    }
  }
  
  private triggerHaptics(controller: XRController) {
    // Trigger haptic feedback
    controller.triggerHaptic(0.5, 100); // intensity, duration
  }
}
```

### XR Scene Anchoring and Persistence
```typescript
class XRSceneAnchorManager extends Script {
  private anchors: Map<string, XRAnchor> = new Map();
  private persistentObjects: Map<string, Entity> = new Map();
  
  async createAnchor(position: Vector3, rotation: Quaternion, id: string): Promise<XRAnchor | null> {
    try {
      const anchor = await this.engine.xrManager.sessionManager.createAnchor(position, rotation);
      if (anchor) {
        this.anchors.set(id, anchor);
        console.log(`Anchor ${id} created successfully`);
        return anchor;
      }
    } catch (error) {
      console.error(`Failed to create anchor ${id}:`, error);
    }
    return null;
  }
  
  async placePersistentObject(entity: Entity, anchorId: string) {
    const anchor = this.anchors.get(anchorId);
    if (anchor) {
      // Attach entity to anchor
      entity.transform.position = anchor.pose.position;
      entity.transform.rotationQuaternion = anchor.pose.rotation;
      
      // Mark as persistent
      this.persistentObjects.set(anchorId, entity);
      
      // Save to persistent storage
      await this.savePersistentScene();
    }
  }
  
  async loadPersistentScene() {
    try {
      // Load saved anchor data
      const savedAnchors = await this.loadAnchorData();
      
      for (const [id, anchorData] of Object.entries(savedAnchors)) {
        // Recreate anchors
        const anchor = await this.createAnchor(
          anchorData.position,
          anchorData.rotation,
          id
        );
        
        if (anchor) {
          // Recreate associated objects
          await this.recreateObject(id, anchorData.objectData);
        }
      }
    } catch (error) {
      console.error("Failed to load persistent scene:", error);
    }
  }
  
  private async savePersistentScene() {
    const sceneData = {};
    
    this.persistentObjects.forEach((entity, anchorId) => {
      const anchor = this.anchors.get(anchorId);
      if (anchor) {
        sceneData[anchorId] = {
          position: anchor.pose.position,
          rotation: anchor.pose.rotation,
          objectData: this.serializeEntity(entity)
        };
      }
    });
    
    // Save to browser storage or cloud
    localStorage.setItem('xrPersistentScene', JSON.stringify(sceneData));
  }
  
  onUpdate() {
    // Update anchor poses if they change
    this.anchors.forEach((anchor, id) => {
      const entity = this.persistentObjects.get(id);
      if (entity && anchor.isTracked) {
        entity.transform.position = anchor.pose.position;
        entity.transform.rotationQuaternion = anchor.pose.rotation;
      }
    });
  }
}
```

### XR Performance Optimization
```typescript
class XRPerformanceManager extends Script {
  private frameRateTarget = 90; // Target frame rate for VR
  private performanceMetrics = {
    frameTime: 0,
    cpuTime: 0,
    gpuTime: 0,
    droppedFrames: 0
  };
  
  onUpdate() {
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      this.monitorPerformance();
      this.optimizeRendering();
    }
  }
  
  private monitorPerformance() {
    const currentFrameRate = this.engine.xrManager.sessionManager.frameRate;
    
    // Detect performance issues
    if (currentFrameRate < this.frameRateTarget * 0.85) {
      console.warn(`Frame rate below target: ${currentFrameRate}/${this.frameRateTarget}`);
      this.applyPerformanceOptimizations();
    }
    
    // Update metrics
    this.performanceMetrics.frameTime = 1000 / currentFrameRate;
  }
  
  private applyPerformanceOptimizations() {
    // Reduce rendering quality
    this.adjustRenderingQuality();
    
    // Optimize object LOD
    this.updateLevelOfDetail();
    
    // Disable non-essential features
    this.disableNonEssentialFeatures();
  }
  
  private adjustRenderingQuality() {
    // Reduce shadow resolution
    const shadowManager = this.engine.shadowManager;
    if (shadowManager.shadowMapSize > 512) {
      shadowManager.shadowMapSize = 512;
    }
    
    // Reduce anti-aliasing
    const camera = this.engine.sceneManager.activeScene.findEntityByName("XRCamera");
    if (camera) {
      const cameraComponent = camera.getComponent(Camera);
      cameraComponent.msaaSamples = Math.max(1, cameraComponent.msaaSamples / 2);
    }
  }
  
  private updateLevelOfDetail() {
    // Implement distance-based LOD for XR
    const xrOrigin = this.engine.xrManager.origin;
    if (!xrOrigin) return;
    
    const entities = this.engine.sceneManager.activeScene.rootEntities;
    this.processEntitiesForLOD(entities, xrOrigin.transform.worldPosition);
  }
  
  private processEntitiesForLOD(entities: readonly Entity[], viewerPosition: Vector3) {
    entities.forEach(entity => {
      const distance = Vector3.distance(entity.transform.worldPosition, viewerPosition);
      
      // Adjust mesh detail based on distance
      const meshRenderer = entity.getComponent(MeshRenderer);
      if (meshRenderer) {
        if (distance > 50) {
          // Use low-poly mesh for distant objects
          meshRenderer.enabled = false;
        } else if (distance > 20) {
          // Use medium-poly mesh
          this.setMeshLOD(meshRenderer, 1);
        } else {
          // Use high-poly mesh for close objects
          this.setMeshLOD(meshRenderer, 0);
        }
      }
      
      // Process children recursively
      if (entity.children.length > 0) {
        this.processEntitiesForLOD(entity.children, viewerPosition);
      }
    });
  }
  
  getPerformanceReport() {
    return {
      ...this.performanceMetrics,
      targetFrameRate: this.frameRateTarget,
      currentFrameRate: this.engine.xrManager.sessionManager.frameRate,
      sessionMode: this.engine.xrManager.sessionManager.mode,
      activeFeatures: this.engine.xrManager.features.filter(f => f.enabled).length
    };
  }
}
```

## XR Event System and Lifecycle Integration

### Complete XR Application Framework
```typescript
class XRApplication extends Script {
  private xrManager: XRManager;
  private xrUI: XRUIManager;
  private xrAudio: XRAudioManager;
  
  onAwake() {
    this.xrManager = this.engine.xrManager;
    this.setupXRApplication();
  }
  
  private async setupXRApplication() {
    // Initialize XR origin
    const origin = this.entity.createChild("XROrigin");
    this.xrManager.origin = origin;
    
    // Setup XR features
    await this.initializeXRFeatures();
    
    // Setup XR UI
    this.xrUI = new XRUIManager(this.engine);
    
    // Setup spatial audio for XR
    this.xrAudio = new XRAudioManager(this.engine);
    
    // Register event listeners
    this.registerXREventListeners();
  }
  
  private async initializeXRFeatures() {
    const features = [
      { type: XRHandTracking, config: { jointRadius: 0.01 } },
      { type: XRPlaneDetection, config: { orientation: "both" } },
      { type: XRHitTest, config: { entityTypes: ["plane", "point"] } }
    ];
    
    for (const { type, config } of features) {
      if (this.xrManager.isSupportedFeature(type)) {
        this.xrManager.addFeature(type, config);
      }
    }
  }
  
  private registerXREventListeners() {
    const sessionManager = this.xrManager.sessionManager;
    
    sessionManager.addStateChangedListener((state) => {
      switch (state) {
        case XRSessionState.Initializing:
          this.onXRInitializing();
          break;
        case XRSessionState.Running:
          this.onXRStarted();
          break;
        case XRSessionState.Paused:
          this.onXRPaused();
          break;
        case XRSessionState.None:
          this.onXREnded();
          break;
      }
    });
  }
  
  private onXRInitializing() {
    console.log("XR initializing - show loading screen");
    this.xrUI.showLoadingScreen();
  }
  
  private onXRStarted() {
    console.log("XR session started - enable XR interactions");
    this.xrUI.hideLoadingScreen();
    this.xrUI.showXRInterface();
    this.xrAudio.enableSpatialAudio();
  }
  
  private onXRPaused() {
    console.log("XR session paused");
    this.xrUI.showPauseScreen();
  }
  
  private onXREnded() {
    console.log("XR session ended - cleanup");
    this.xrUI.hideXRInterface();
    this.xrAudio.disableSpatialAudio();
  }
  
  // Public API for starting XR experiences
  async startARExperience() {
    try {
      await this.xrManager.enterXR(XRSessionMode.ImmersiveAR);
    } catch (error) {
      this.xrUI.showErrorMessage("AR not supported or failed to start");
    }
  }
  
  async startVRExperience() {
    try {
      await this.xrManager.enterXR(XRSessionMode.ImmersiveVR);
    } catch (error) {
      this.xrUI.showErrorMessage("VR not supported or failed to start");
    }
  }
  
  async exitXRExperience() {
    await this.xrManager.exitXR();
  }
}
```

## Integration with Engine Systems

### XR Component Integration
```typescript
// XR-aware Transform component extension
class XRTransform extends Script {
  private originalTransform: Transform;
  private xrOffset = new Vector3();
  
  onAwake() {
    this.originalTransform = this.entity.transform;
  }
  
  onUpdate() {
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      // Apply XR space transformation
      const xrOrigin = this.engine.xrManager.origin;
      if (xrOrigin) {
        const worldPosition = Vector3.add(this.originalTransform.position, this.xrOffset);
        this.entity.transform.position = Vector3.transformByMatrix(
          worldPosition,
          xrOrigin.transform.worldMatrix
        );
      }
    }
  }
  
  setXROffset(offset: Vector3) {
    this.xrOffset = offset;
  }
}

// XR Physics integration
class XRPhysicsManager extends Script {
  onUpdate() {
    if (this.engine.xrManager.sessionManager.state === XRSessionState.Running) {
      this.updateXRPhysics();
    }
  }
  
  private updateXRPhysics() {
    // Sync XR hand/controller colliders with physics
    const hands = this.engine.xrManager.inputManager.getHands();
    hands.forEach((hand, handedness) => {
      if (hand.tracked) {
        this.updateHandColliders(hand, handedness);
      }
    });
    
    // Sync controller colliders
    const controllers = this.engine.xrManager.inputManager.getControllers();
    controllers.forEach((controller, index) => {
      if (controller.connected) {
        this.updateControllerCollider(controller, index);
      }
    });
  }
  
  private updateHandColliders(hand: XRHand, handedness: string) {
    // Update physics colliders for hand joints
    hand.joints.forEach((joint, jointName) => {
      const collider = this.getJointCollider(handedness, jointName);
      if (collider && joint.pose) {
        collider.entity.transform.position = joint.pose.position;
        collider.entity.transform.rotationQuaternion = joint.pose.rotation;
      }
    });
  }
}
```

## Best Practices

1. **Session Management**: Always check session state before performing XR operations
2. **Feature Detection**: Test feature support before adding features to avoid runtime errors
3. **Performance Monitoring**: Continuously monitor frame rate and adjust quality for smooth XR experience
4. **Origin Management**: Properly set and manage XR origin for correct spatial alignment
5. **Graceful Degradation**: Provide fallbacks for unsupported XR features
6. **Resource Cleanup**: Properly cleanup XR resources when sessions end
7. **Error Handling**: Handle XR initialization failures gracefully with user feedback
8. **Cross-Platform Compatibility**: Test XR functionality across different devices and browsers

## Common Patterns and Solutions

### XR State Management
```typescript
class XRStateManager {
  private xrState = {
    isXRSupported: false,
    activeSession: null,
    currentMode: XRSessionMode.None,
    availableFeatures: [],
    userPreferences: {
      preferredMode: XRSessionMode.ImmersiveVR,
      enableHandTracking: true,
      hapticFeedback: true
    }
  };
  
  async initialize(engine: Engine) {
    const xrManager = engine.xrManager;
    
    // Check XR support
    this.xrState.isXRSupported = !!xrManager;
    
    if (this.xrState.isXRSupported) {
      // Detect available features
      this.detectAvailableFeatures(xrManager);
      
      // Load user preferences
      this.loadUserPreferences();
    }
  }
  
  private detectAvailableFeatures(xrManager: XRManager) {
    const featuresToTest = [
      XRHandTracking,
      XRPlaneDetection,
      XRHitTest,
      XRAnchorSupport
    ];
    
    this.xrState.availableFeatures = featuresToTest.filter(feature =>
      xrManager.isSupportedFeature(feature)
    );
  }
  
  getRecommendedConfiguration(): XRConfiguration {
    return {
      mode: this.selectOptimalMode(),
      features: this.selectOptimalFeatures(),
      performance: this.getPerformanceSettings()
    };
  }
}
```

This comprehensive XR Manager system provides robust Extended Reality capabilities with session management, feature-based architecture, input handling, and seamless integration with the Galacean 3D engine for building immersive AR/VR experiences across multiple platforms.