/**
 * @title Spine Hack Slot Texture
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*_wfjSYhksRYAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  Logger,
  Vector3,
  WebGLEngine,
  Entity,
  AssetType,
  LoadItem,
} from "@galacean/engine";
import { SpineRenderer } from "@galacean/engine-spine";
import * as dat from "dat.gui";

Logger.enable();

const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 60);

  const resource = generateSkinResource();
  const spineResource = {
    urls: [
      "https://gw.alipayobjects.com/os/OasisHub/e675c9e1-2b19-4940-b8ed-474792e613d7/1629603245094.json",
      "https://gw.alipayobjects.com/os/OasisHub/994dfadc-c498-4210-b9ba-0c3deed61fc5/1629603245095.atlas",
      "https://gw.alipayobjects.com/zos/OasisHub/b52768b0-0374-4c64-a1bd-763b1a37ee5f/1629603245095.png",
    ],
    type: "spine",
  };
  resource.unshift(spineResource);
  engine.resourceManager.load(resource).then((res: any) => {
    const spineResource = res[0];
    const spineEntity = rootEntity.createChild("spine");
    spineEntity.transform.setPosition(0, -12, 0);
    rootEntity.addChild(spineEntity);
    const spineRenderer = spineEntity.addComponent(SpineRenderer);
    spineRenderer.resource = spineResource
    spineRenderer.skinName = "skin1";
    spineRenderer.animationName = "02_walk";
    const { spineAnimation } = spineRenderer;
    spineAnimation.scale = 0.07;
    spineAnimation.addSeparateSlot("defult/head_hair");
    spineAnimation.addSeparateSlot("defult/arm_rigth_weapon");
    spineAnimation.addSeparateSlot("defult/Sleeveless_01");

    const textures = [];
    for (let i = 1; i < res.length; i += 1) {
      textures.push(res[i]);
    }
    const info = {
      换头饰: "hair_0",
      换衣服: "clothes_0",
      换武器: "weapon_0",
    };

    const hatConfig = [];
    const clothConfig = [];
    const weaponConfig = [];
    for (let i = 0; i < resource.length; i++) {
      hatConfig.push(`hair_${i}`);
      clothConfig.push(`clothes_${i}`);
      weaponConfig.push(`weapon_${i}`);
    }
    gui.add(info, "换头饰", hatConfig).onChange((v) => {
      changeSlotTexture(v, textures, spineAnimation);
    });
    gui.add(info, "换衣服", clothConfig).onChange((v) => {
      changeSlotTexture(v, textures, spineAnimation);
    });
    gui.add(info, "换武器", weaponConfig).onChange((v) => {
      changeSlotTexture(v, textures, spineAnimation);
    });
  });

  engine.run();

  function generateSkinResource(): LoadItem[] {
    const skinImgs = [
      "https://gw.alicdn.com/imgextra/i4/O1CN01NVzIQ61Hf7DT0jDWS_!!6000000000784-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01g3HnB21FPQPnjavP3_!!6000000000479-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01CvmDQl1gRFcWeh3Na_!!6000000004138-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01BviZcq1Rc2iTh127L_!!6000000002131-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01mkkLpR1ihrDHyYr1H_!!6000000004445-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i2/O1CN019ENsCO2992jTG9RGD_!!6000000008024-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i4/O1CN01fzyJFg1cNoBGRLSCI_!!6000000003589-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i4/O1CN01duImZL1J8iQk2YzEj_!!6000000000984-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i2/O1CN01b23DDj1QD1SoNL7ua_!!6000000001941-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01powK3y29HHrZCBnbg_!!6000000008042-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01n7R3dE1IRfCVUgvhE_!!6000000000890-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01t0nsyV24AoBFhIfyZ_!!6000000007351-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i4/O1CN01mYwBUD1eBYp2rE0qV_!!6000000003833-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01ks7zZs1mbgKwBjlFS_!!6000000004973-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01mgFHl5262gO0L0JeR_!!6000000007604-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01SJbFkU1udWrRhXPbd_!!6000000006060-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01VGL8pe26qbYegHClp_!!6000000007713-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i2/O1CN01EeZs6N1auCy4QbXiY_!!6000000003389-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01DOfF5J1UTkOMHSnwV_!!6000000002519-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01iWGD1h1G0ytSTLs67_!!6000000000561-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01xjhSTG245JQVrtEhL_!!6000000007339-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01NJAp7c22RdV8PC1Dq_!!6000000007117-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i1/O1CN01A2Mdh01INXdP46W6B_!!6000000000881-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01AqHn4524RIRMTuuNH_!!6000000007387-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i4/O1CN01yU8Z771SPVUUS0Die_!!6000000002239-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01orLkIg1JOkIFur5Fj_!!6000000001019-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i3/O1CN01jRRXrV1b4HgOXGqov_!!6000000003411-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i2/O1CN01XOchrA1Mh0wFgddGl_!!6000000001465-2-tps-802-256.png",
      "https://gw.alicdn.com/imgextra/i2/O1CN01zPPHrD1pIOVHtvDqD_!!6000000005337-2-tps-802-256.png",
    ];
    return skinImgs.map((item) => {
      return {
        type: AssetType.Texture2D,
        url: item,
      };
    });
  }

  function changeSlotTexture(selectItem, textures, spineAnimation) {
    const slotNameMap = {
      hair: "defult/head_hair",
      weapon: "defult/arm_rigth_weapon",
      clothes: "defult/Sleeveless_01",
    };
    const slotKey = selectItem.split("_")[0];
    const slotName = slotNameMap[slotKey];
    const index = selectItem.split("_")[1];
    spineAnimation.hackSeparateSlotTexture(slotName, textures[index]);
  }
});
