import CardUIC from './CardUIC';
import { Engine, EngineFeature } from '@alipay/r3-core';
import { Tween, Easing, doTransform } from '@alipay/r3-tween';

new CardUIC({
  name:'card',
  id:'r3-demo',
  imgUrl: {
    'pic1':'https://gw.alipayobjects.com/zos/rmsportal/ztBRTwpFgfQpOTckJvFB.png',
    'pic2': 'https://gw.alipayobjects.com/zos/rmsportal/POsJmbPDJRLhChUiJYGd.png',
    'pic3': 'https://private-alipayobjects.alipay.com/alipay-rmsdeploy-image/rmsportal/qXIZHziyCJWgNbkLFLFP.jpg'
  },
  onComplete:(cardUIC) => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'd') {
        const position = cardUIC.cardWrapper.position;
        animate(cardUIC.cardWrapper, [position[0] - cardUIC.deltaX, position[1], position[2]]);
        // cardUIC.cardWrapper.position = position;
      }
    }, false);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'a') {
        const position = cardUIC.cardWrapper.position;
        animate(cardUIC.cardWrapper, [position[0] + cardUIC.deltaX, position[1], position[2]]);
        // cardUIC.cardWrapper.position = position;
      }
    }, false);
  }
});
class TweenFeature extends EngineFeature {
  preTick(engine, currentScene) {
    tween.update(engine._time._deltaTime);
  }
}

Engine.registerFeature(TweenFeature);

const tween = new Tween();

function animate(node, position) {
  doTransform.Translate(node, position, 500, {
    easing: Easing.easeOutQuad,
  }).start(tween);
}
