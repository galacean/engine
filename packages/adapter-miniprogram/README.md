# o3-adapter-miniprogram

## 小程序中的用法
```$xslt

// 小程序不支持读取package.json中的main,所以引入时需要补全后缀

import * as O3 from '@alipay/o3/dist/miniprogram';
import {  registerCanvas,
          dispatchTouchStart,
          dispatchTouchMove,
          dispatchTouchEnd
} from '@alipay/o3-adapter-miniprogram/dist/miniprogram';
       
Page({
    onTouchStart(e) {
         dispatchTouchStart(e);
    },
    onTouchMove(e) {
        dispatchTouchMove(e);
    },
    onTouchEnd(e) {
        dispatchTouchEnd(e);
    },
    onReady() {
     my._createCanvas({
           id: 'canvas',
           success: (canvas) => {
             /**绑定适配层*/
             registerCanvas(canvas);
           
             let engine = new O3.Engine();
             // run
             engine.run();
             
             // ... 
     
     
           }
         });
    },
});       
```

## 小程序axml
```$xslt
/** 小程序70版本的canvas多指触摸事件有问题，暂时先将事件绑定到view */

<view>
  <view class="full"
      onTouchStart="onTouchStart"
      onTouchMove="onTouchMove"
      onTouchEnd="onTouchEnd"
  >
    <canvas
    class="full"
    id="canvas"
    type="webgl"
    >
    </canvas>
  </view>
</view>

```

## 小程序acss
```
.full{
    width:100%;
    height:100%;
}
```
