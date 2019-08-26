Page({
  onO3Load(O3, canvas) {
    let {
      Logger,
      RegistExtension,
      Engine,
      ADefaultCamera,
      PBRMaterial,
      APointLight,
      ResourceLoader,
      Resource,
      AOrbitControls,
    } = O3;

    Logger.enable();
    RegistExtension({PBRMaterial});

    let engine = new Engine();
    let scene = engine.currentScene;
    let rootNode = scene.root;

    let cameraNode = rootNode.createChild('camera_node');
    let camera = cameraNode.createAbility(ADefaultCamera, {
      canvas, position: [0, 10, 200],
      clearParam: [1, 1, 0, 1],
      attributes: {
        antialias: false
      }
    });
    // control
    this.controler = cameraNode.createAbility(AOrbitControls)

    // light
    let pointLightNode1 = rootNode.createChild('point_light1');
    let pointLightNode2 = rootNode.createChild('point_light2');
    let pointLight1 = pointLightNode1.createAbility(APointLight, {
      color: [1, 1, 1],
      intensity: 0.5,
    });
    let pointLight2 = pointLightNode2.createAbility(APointLight, {
      color: [1, 1, 1],
      intensity: 0.5,
    });
    pointLightNode1.position = [0, 0, 20];
    pointLightNode2.position = [0, 0, -20];

    //resource
    let resourceLoader = new ResourceLoader(engine, null);
    let gltfRes = new Resource('card', {
      url: 'https://gw.alipayobjects.com/os/basement_prod/55132237-92fb-4ecf-8643-56641651c4d5.gltf',
      type: 'gltf'
    });
    let baseColorTextureRes = new Resource('baseColor', {
      type: 'texture',
      url: 'https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*wV2eQbxrB5wAAAAAAAAAAABkARQnAQ',
    });
    let normalTextureRes = new Resource('normal', {
      type: 'texture',
      url: 'https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*WPtwSKCyMV8AAAAAAAAAAABkARQnAQ',
    });
    let roughnessTextureRes = new Resource('roughness', {
      type: 'texture',
      url: 'https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*jkSFR4HLZlQAAAAAAAAAAABkARQnAQ',
    });
    resourceLoader.batchLoad([gltfRes, baseColorTextureRes, normalTextureRes, roughnessTextureRes], (err, reses) => {
      // resourceLoader.batchLoad([gltfRes], (err, reses) => {
      console.log(err, reses)
      if (!err) {
        let gltf = reses[0].asset;
        let mat = gltf.meshes[0].primitives[0].material;
        mat.baseColorTexture = reses[1].asset;
        mat.normalTexture = reses[2].asset;
        mat.metallicRoughnessTexture = reses[3].asset;
        gltf.rootScene.nodes.forEach(n => {
          n.rotateByAngles(90, 0, 90);
          rootNode.addChild(n)
        });
      }

    });

    // run
    engine.run();
  }
});
