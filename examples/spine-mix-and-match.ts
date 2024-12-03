/**
 * @title Spine Mix And Match
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Logger, Script, Vector3, WebGLEngine } from "@galacean/engine";
import { Skin, SpineAnimationRenderer } from "@galacean/engine-spine";
import * as dat from "dat.gui";

const gui = new dat.GUI();

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 100);
  camera.nearClipPlane = 0.001;
  camera.farClipPlane = 20000;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/24ejL92gvbWxsXRi/mix-and-match/mix-and-match.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.transform.setPosition(0, -18, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.scale = 0.05;
      spine.defaultState.skinName = 'full-skins/girl';
      spine.defaultState.animationName = 'idle';
      const mixAndMatch = spineEntity.addComponent(MixAndMatch);
      rootEntity.addChild(spineEntity);
      const { state } = spine;
      const info = {
        Eyes: mixAndMatch.eyesSkins[0],
        Hair: mixAndMatch.hairSkins[0],
        Nose: mixAndMatch.noseSkins[0],
        Bag: mixAndMatch.bagSkins[0],
        Hat: mixAndMatch.hatSkins[0],
        Pants: mixAndMatch.pantsSkins[0],
        Cloth: mixAndMatch.clothesSkins[0],
      };
      gui
        .add(info, "Eyes", mixAndMatch.eyesSkins)
        .onChange((eyesSkinName) => {
          mixAndMatch.eyesSkin = eyesSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.setAnimation(1, 'blink', false);
          state.addEmptyAnimation(1, 0.3, 0);
        });
      
      gui
        .add(info, "Hair", mixAndMatch.hairSkins)
        .onChange((hairSkinName) => {
          mixAndMatch.hairSkin = hairSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.2;
          state.setAnimation(0, 'aware', false);
          state.addAnimation(0, 'idle', true, 0);
        });

      gui
        .add(info, "Nose", mixAndMatch.noseSkins)
        .onChange((noseSkinName) => {
          mixAndMatch.noseSkin = noseSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.2;
          state.setAnimation(1, 'blink', false);
          state.addEmptyAnimation(1, 0.3, 0);
        });
      
      gui
        .add(info, "Bag", mixAndMatch.bagSkins)
        .onChange((bagSkinName) => {
          mixAndMatch.bagSkin = bagSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.3;
          if (bagSkinName) {
            state.setAnimation(0, 'dance', true);
            state.addAnimation(0, 'idle', true, 1);
          }
        });
      
      gui
        .add(info, "Hat", mixAndMatch.hatSkins)
        .onChange((hatSkinName) => {
          mixAndMatch.hatSkin = hatSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.2;
          state.setAnimation(0, 'aware', false);
          state.addAnimation(0, 'idle', true, 0);
        });
        
      gui
        .add(info, "Pants", mixAndMatch.pantsSkins)
        .onChange((pantsSkinName) => {
          mixAndMatch.pantsSkin = pantsSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.2;
          state.setAnimation(0, 'dress-up', false);
          state.addAnimation(0, 'idle', true, 0);
        });
      
      gui
        .add(info, "Cloth", mixAndMatch.clothesSkins)
        .onChange((clothSkinName) => {
          mixAndMatch.clothesSkin = clothSkinName;
          mixAndMatch.updateCharacterSkin();
          mixAndMatch.updateCombinedSkin();
          state.data.defaultMix = 0.2;
          state.setAnimation(0, 'dress-up', false);
          state.addAnimation(0, 'idle', true, 0);
        });

    });

  engine.run();
});

enum ItemType {
  Cloth,
  Pants,
  Bag,
  Hat
}

class MixAndMatch extends Script {
  noseSkin = "nose/short";
  eyesSkin = "eyes/violet";
  hairSkin = "hair/brown";
  bagSkin = "";
  baseSkin = "skin-base";
  eyelidsSkin = 'eyelids/girly';
  clothesSkin = "clothes/hoodie-orange";
  pantsSkin = "legs/pants-jeans";
  hatSkin = "accessories/hat-red-yellow";
  spine: SpineAnimationRenderer;
  characterSkin: Skin;

  eyesSkins = ["eyes/violet", "eyes/green", "eyes/yellow"];
  hairSkins = ["hair/brown", "hair/blue", "hair/pink", "hair/short-red", "hair/long-blue-with-scarf"];
  noseSkins = ["nose/short", "nose/long"];
  bagSkins = ["", "accessories/bag", "accessories/backpack"];
  hatSkins = ["accessories/hat-red-yellow", "accessories/hat-pointy-blue-yellow"];
  pantsSkins = ["legs/pants-jeans", "legs/pants-green"];
  clothesSkins = ["clothes/hoodie-orange", "clothes/dress-blue", "clothes/dress-green", "clothes/hoodie-blue-and-scarf"];

  onAwake(): void {
    this.spine = this.entity.getComponent(SpineAnimationRenderer)!;
  }

  onStart(): void {
    this.updateCharacterSkin();
    this.updateCombinedSkin();
  }

  updateCharacterSkin() {
    const skeletonAnimation = this.spine;
    const skeleton = skeletonAnimation.skeleton;
    const skeletonData = skeleton.data;
    const skin = new Skin("character-base");
    skin.addSkin(skeletonData.findSkin(this.baseSkin)!);
    skin.addSkin(skeletonData.findSkin(this.noseSkin)!);
    skin.addSkin(skeletonData.findSkin(this.eyelidsSkin)!);
    skin.addSkin(skeletonData.findSkin(this.eyesSkin)!);
    skin.addSkin(skeletonData.findSkin(this.hairSkin)!);
    this.characterSkin = skin;
  }

  updateCombinedSkin() {
    const skeletonAnimation = this.spine;
    const skeleton = skeletonAnimation.skeleton;
    const resultCombinedSkin = new Skin("character-combined");

    resultCombinedSkin.addSkin(this.characterSkin);
    this.addEquipmentSkinsTo(resultCombinedSkin);

    skeleton.setSkin(resultCombinedSkin);
    skeleton.setSlotsToSetupPose();
  }

  addEquipmentSkinsTo(combinedSkin: Skin) {
    const skeleton = this.spine.skeleton;
    const skeletonData = skeleton.data;
    combinedSkin.addSkin(skeletonData.findSkin(this.clothesSkin)!);
    combinedSkin.addSkin(skeletonData.findSkin(this.pantsSkin)!);
    if (this.bagSkin) {
      combinedSkin.addSkin(skeletonData.findSkin(this.bagSkin)!);
    }
    if (this.hatSkin) {
      combinedSkin.addSkin(skeletonData.findSkin(this.hatSkin)!);
    }
  }
}



