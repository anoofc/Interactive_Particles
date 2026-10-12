import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let tracker:HandLandmarker|undefined;
const scope=self as unknown as {postMessage:(value:unknown)=>void;onmessage:((event:MessageEvent)=>void)|null};
scope.onmessage=async ({data})=>{
  if(data.type==='init'){
    try {
      const files=await FilesetResolver.forVisionTasks(data.wasm,true);
      tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:data.model,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.55});
      scope.postMessage({type:'ready'});
    }catch(e){scope.postMessage({type:'error',message:String(e)});}
  }else if(data.type==='frame'){
    try{const result=tracker!.detectForVideo(data.bitmap,data.timestamp);scope.postMessage({type:'result',result,timestamp:data.timestamp});}
    catch(e){scope.postMessage({type:'error',message:String(e)});}
    finally{data.bitmap.close();}
  }
};
