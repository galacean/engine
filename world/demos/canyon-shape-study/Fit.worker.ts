import {referenceContours} from './ReferenceContours.ts';
import {fitPolygon,fitDefaults} from './FitPolygon.ts';
import {measureCoverage} from './PolygonCoverage.ts';
self.onmessage=()=>{
 try {
  const start=performance.now();
  const results=referenceContours.map(region=>{
   const boxes=fitPolygon(region.outline);
   return {...region,boxes,metrics:measureCoverage(region.outline,boxes)};
  });
  self.postMessage({options:fitDefaults,results,elapsedMs:performance.now()-start});
 }catch(error){self.postMessage({error:String(error)});}
};
