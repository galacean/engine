import { TextureFilter, TextureWrapMode } from '@alipay/o3-base';
import { Resource } from '@alipay/o3-loader';

// 参考图片：http://szzljy.com/data/29/night-city-hd-wallpapers/night-city-hd-wallpapers-001.jpg

// 写字楼立面
// 特点：
//    主要是窗户
//    每层楼内的明度、色相比较接近
//    亮灯的窗户大多是连续的
//    经常整层楼不亮
export function generateOfficeBuildingSide(ctx, params) {
  const width = params.width || 256;
  const height = params.height || 256;
  const geowidth = params.geowidth || width;
  const geoheight = params.geoheight || height;
  const busyFloorPercent = params.busyFloorPercent || 0.7; // 亮灯楼层比例
  const busyRoomPercent = params.busyRoomPercent || 0.8;   // 亮灯楼层中亮灯房间的比例
  const numFloors = params.numFloors || 10;
  const withLightRing = params.withLightRing || false;

  const bottomHeight = params.bottomHeight || 0;
  const topHeight = params.topHeight || 0;

  const darkColor = params.darkColor || 'rgb(8,8,8)';
  const hue = params.hue || 200;
  const saturation = params.saturation || 5;
  const lightness = params.lightness || 60;

  const floorHeight = (height-topHeight-bottomHeight) / numFloors;
  const roomWidth = params.roomWidth || floorHeight - floorHeight*0.2 + floorHeight*0.4*Math.random();
  const roomMargin = params.roomMargin || 0;
  const numRooms = Math.floor(width / roomWidth);
  const xPadding = (width-numRooms*roomWidth)/2.0;
  const floorMargin = params.floorMargin || 1;

  ctx.fillStyle = darkColor;
  ctx.fillRect(0,0,width,height);


  for (let i=0; i<numFloors; ++i) {
	  ctx.fillStyle = 'black';
  	ctx.fillRect(xPadding, i*floorHeight+bottomHeight, width-xPadding*2, floorHeight-floorMargin);
    if (Math.random()<busyFloorPercent) {
      const y = i * floorHeight;
      const floorIllum = Math.random()*0.6+0.4;
      const nBusyRooms = Math.floor(numRooms * busyRoomPercent) - 10 + Math.floor(10*Math.random());
      const nSplits = Math.floor(Math.random() * 3) + 1;

      const splits = Array(nSplits);
      let roomsLeft = nBusyRooms;
      for (let s=1; s<nSplits; ++s) {
      	splits[s] = Math.floor(Math.random()*roomsLeft);
      	roomsLeft -= splits[s];
      }
      splits[0] = roomsLeft;

      const spaces = Array(nSplits);
      let spacesLeft = numRooms - nBusyRooms;
      for (let s=1; s<nSplits; ++s) {
      	spaces[s] = Math.floor(Math.random()*spacesLeft);
      	spacesLeft -= spaces[s];
      }
      spaces[0] = Math.floor(Math.random()*spacesLeft);

      let x = 0;
      const h = hue - 30 + 60*Math.random(); // one hue per floor
      for (let j=0; j<spaces.length; ++j) {
      	x += spaces[j] * roomWidth;

      	// 画窗户
      	for (let r=0; r<splits[j]; ++r) {
          const s = saturation - 10 + 20*Math.random();
          const l = lightness - 10 + 10*Math.random()*floorIllum;
          const hslStr = h+','+s+'%,'+l+'%';
          const windowX = x+r*roomWidth + xPadding+1 + roomMargin;
          const windowY = i*floorHeight+bottomHeight+1;
          const windowW = roomWidth - 2 - roomMargin*2;
          const windowH = floorHeight-floorMargin-2;
          let gradient = ctx.createRadialGradient(windowX+windowW/2, windowY+windowH/2, windowX/3,
          																				windowX+windowW/2, windowY+windowH/2, (windowX+windowY)/2+10);
        	gradient.addColorStop(0, 'hsl('+hslStr+')');
        	gradient.addColorStop(1, 'hsl('+h+','+s+'%,'+l*0.35+'%)');
          ctx.fillStyle = gradient;
          ctx.fillRect(windowX, windowY, windowW, windowH);
          // 随便画点剪影
          for (let gr=0, ngr=Math.floor(Math.random()*5); gr<ngr; ++gr) {
          	const randomX = windowX + Math.random()*windowW;
          	const randomY = windowY + Math.random()*windowH*0.5;
          	const randomR = Math.random()*2;
          	const randomD = Math.random()*15+5;
          	const max = (x,y) => (x>y? x:y);
          	const min = (x,y) => (x>y? y:x);
          	const alpha = Math.random()*0.5+0.3;
          	let gradient = ctx.createRadialGradient(randomX, randomY, randomR, randomX, randomY, randomR+randomD);
          	gradient.addColorStop(0, 'hsla('+h+','+s+'%,'+l*0.2+'%,'+alpha+')');
          	gradient.addColorStop(1, 'hsla('+hslStr+',0)');
          	ctx.fillStyle = gradient;
          	//ctx.fillRect(max(randomX-randomR-randomD, windowX), max(randomY-randomR-randomD, windowY),
          	//						 min(randomX+randomR+randomD-windowX, windowW), min(randomY+randomR+randomD-windowY, windowH));
          	ctx.fillRect(windowX, windowY, windowW, windowH);
          }
        }
        x += splits[j] * roomWidth;
      }
    }
  }
  // if (withLightRing) {
  //   const h = hue - 30 + 60*Math.random();
  //   const s = saturation - 10 + 20*Math.random();
  //   const l = Math.random()*20+75;

  // 	let linearGradient = ctx.createLinearGradient(0, height-2, 0, height-topHeight-18);
  // 	linearGradient.addColorStop(0, 'hsl('+h+','+s+'%,'+l+'%)');
  // 	linearGradient.addColorStop(1, darkColor);
  // 	ctx.fillStyle = linearGradient;
  // 	ctx.fillRect(0, height-2, width, Math.max(topHeight-2, 16));
  // }

  ctx.fillStyle = darkColor;
  ctx.fillRect(0, height-8, width, 8);
  ctx.fillStyle = '#ffffdd';
  ctx.fillRect(0, height-6, width, 5);
}


// 居民楼立面
//    水泥材质为主
//    房间颜色/亮度比较随机
//    经常有竖条水泥
//    窗户长宽比不固定
export function generateLiveBuildingSide(ctx, params) {
  const width = params.width || 256;
  const height = params.height || 256;
  const geowidth = params.geowidth || width;
  const geoheight = params.geoheight || height;
  const busyFloorPercent = params.busyFloorPercent || 0.7; // 亮灯楼层比例
  const busyRoomPercent = busyFloorPercent * (params.busyRoomPercent || 0.8);   // 亮灯楼层中亮灯房间的比例
  const numFloors = params.numFloors || 8;
  const withLightRing = params.withLightRing || false;

  const bottomHeight = params.bottomHeight || 0;
  const topHeight = params.topHeight || 0;

  const darkColor = params.darkColor || '#4d2600';
  const hue = params.hue || 30;
  const saturation = 10+params.saturation || 5;
  const lightness = params.lightness || 60;

  const floorHeight = (height-topHeight-bottomHeight) / numFloors;
  const roomWidth = params.roomWidth || floorHeight - floorHeight*0.2 + floorHeight*0.4*Math.random();
  const roomMargin = params.roomMargin || 0;
  const numRooms = Math.floor(width / roomWidth);
  const xPadding = (width-numRooms*roomWidth)/2.0;
  const floorMargin = params.floorMargin || 1;

  ctx.fillStyle = darkColor;
  ctx.fillRect(0,0,width,height);
  const bgRGB = [...ctx.getImageData(0,0,1,1).data];
  const brighterBG = [bgRGB[0]*1.8, bgRGB[1]*1.8, bgRGB[2]*1.8];
  const brighterBGStr = 'rgb('+brighterBG[0]+','+brighterBG[1]+','+brighterBG[2]+')';
  const darkerBG = [bgRGB[0]/1.4, bgRGB[1]/1.4, bgRGB[2]/1.4];
  const darkerBGStr = 'rgb('+darkerBG[0]+','+darkerBG[1]+','+darkerBG[2]+')';

  for (let room=0; room<numRooms; ++room) {
    if (Math.random()<0.4) { // 部分垂直区域跳过, 随便画点条纹
      if (Math.random() < 0.5) {
        ctx.fillStyle = brighterBGStr;
        const x = room * roomWidth + xPadding + 5 + roomMargin;
        const w = roomWidth - 5;
        ctx.fillRect(x, 0, w, height);

        if (Math.random() < 0.4) {
          ctx.lineWidth = 8;
          ctx.strokeStyle = darkerBGStr;
          ctx.strokeRect(x, -8, w-ctx.lineWidth*2, height+8);
        }
      }
      continue;
    }

    const smallWindow = Math.random() < 0.2; // 部分窗子可能比较小
    let offsetX = 0;
    let shrinkX = 1;
    let offsetY = 0;
    let shrinkY = 1;
    if (smallWindow) {
      offsetX = Math.random()*2.0 - 1;
      offsetY = Math.random()*2.0 - 1;
      shrinkX = Math.random()*0.3 + 0.5;
      shrinkY = Math.random()*0.3 + 0.5;
    }

    for (let floor=0; floor<numFloors; ++floor) {
      let h = hue - 30 + 60*Math.random();
      if (h<0) {h+=360;}
      else if(h>360) {h-=360;}
      const s = saturation - 10 + 20*Math.random();
      const l = lightness - 10 + 20*Math.random();
      const hslStr = h+','+s+'%,'+l+'%';
      const windowX = room*roomWidth + xPadding+1 + roomMargin + offsetX;
      const windowY = floor*floorHeight+bottomHeight+1 + offsetY;
      const windowW = (roomWidth - 2 - roomMargin*2)*shrinkX;
      const windowH = (floorHeight-floorMargin-2)*shrinkY;

      if (Math.random() >= busyRoomPercent) {
        // 熄灯
        ctx.fillStyle = 'black';
        ctx.fillRect(windowX, windowY, windowW, windowH);
      } else {
        // 亮灯
        let gradient = ctx.createRadialGradient(windowX+windowW/2, windowY+windowH/2, windowX/3,
          windowX+windowW/2, windowY+windowH/2, (windowX+windowY)/2+10);
        gradient.addColorStop(0, 'hsl('+hslStr+')');
        gradient.addColorStop(1, 'hsl('+h+','+s+'%,'+l*0.35+'%)');
        ctx.fillStyle = gradient;
        ctx.fillRect(windowX, windowY, windowW, windowH);
        // 随便画点剪影
        for (let gr=0, ngr=Math.floor(Math.random()*5); gr<ngr; ++gr) {
          const randomX = windowX + Math.random()*windowW;
          const randomY = windowY + Math.random()*windowH*0.5;
          const randomR = Math.random()*2;
          const randomD = Math.random()*15+5;
          const max = (x,y) => (x>y? x:y);
          const min = (x,y) => (x>y? y:x);
          const alpha = Math.random()*0.5+0.3;
          let gradient = ctx.createRadialGradient(randomX, randomY, randomR, randomX, randomY, randomR+randomD);
          gradient.addColorStop(0, 'hsla('+h+','+s+'%,'+l*0.2+'%,'+alpha+')');
          gradient.addColorStop(1, 'hsla('+hslStr+',0)');
          ctx.fillStyle = gradient;
          //ctx.fillRect(max(randomX-randomR-randomD, windowX), max(randomY-randomR-randomD, windowY),
          //						 min(randomX+randomR+randomD-windowX, windowW), min(randomY+randomR+randomD-windowY, windowH));
          ctx.fillRect(windowX, windowY, windowW, windowH);
        }
      }
    }
  }
}
