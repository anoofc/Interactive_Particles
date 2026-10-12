import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
export class HandTracking {
  private initTimer=0;private worker?:Worker;private tracker?:HandLandmarker;private timer=0;private busy=false;private lastVideo=-1;private disposed=false;private initReject?: (e:Error)=>void;
  rate=0;backend='';private lastResult=0;
  constructor(private video:HTMLVideoElement,private onResult:(r:HandLandmarkerResult,time:number)=>void,private onError:(e:Error)=>void){}
  async init(){
    const wasm=new URL(`${import.meta.env.BASE_URL}wasm/`,location.href).href;
    const model=new URL(`${import.meta.env.BASE_URL}models/hand_landmarker.task`,location.href).href;
    try{
      if(!('Worker' in window)||!('createImageBitmap' in window))throw new Error('Worker image frames unsupported');
      this.worker=new Worker(new URL('./tracking.worker.ts',import.meta.url),{type:'module'});
      await new Promise<void>((resolve,reject)=>{
        this.initReject=reject;
        const timeout=this.initTimer=window.setTimeout(()=>reject(new Error('Worker initialization timed out')),25000);
        this.worker!.onerror=(e)=>{clearTimeout(timeout);reject(new Error(e.message||'Tracking worker failed'));};
        this.worker!.onmessage=({data})=>{
          if(data.type==='ready'){clearTimeout(timeout);resolve();}
          if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}
        };
        this.worker!.postMessage({type:'init',wasm,model});
      });
      if(this.disposed)throw new Error('Cancelled');
      this.initReject=undefined;this.backend='Worker / CPU';
      this.worker!.onmessage=({data})=>{this.busy=false;if(this.disposed)return;if(data.type==='result')this.result(data.result,data.timestamp);else this.onError(new Error(data.message));};
      this.worker!.onerror=e=>{this.busy=false;this.onError(new Error(e.message||'Tracking worker failed'));};
    }catch(e){
      this.worker?.terminate();this.worker=undefined;
      if(this.disposed)throw new Error('Cancelled');
      // Explicit compatibility fallback: at most 20 synchronous inferences/second.
      this.backend='Main thread / CPU';
      try{
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
        const files=await FilesetResolver.forVisionTasks(wasm);
        const tracker=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:model,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.55});
        if(this.disposed){tracker.close();throw new Error('Cancelled');}this.tracker=tracker;
      }catch(error){throw new Error(`Tracking assets could not load. Run npm run assets and retry. ${String(error)}`);}
    }
  }
  start(){this.timer=window.setInterval(()=>{void this.infer();},this.worker?33:50);}
  private result(r:HandLandmarkerResult,time:number){const now=performance.now();this.rate=this.lastResult?this.rate*.7+1000/(now-this.lastResult)*.3:0;this.lastResult=now;this.onResult(r,time);}
  private async infer(){
    if(this.disposed||document.hidden||this.busy||this.video.readyState<2||this.video.currentTime===this.lastVideo)return;
    this.lastVideo=this.video.currentTime;this.busy=true;const timestamp=performance.now();
    try{
      if(this.worker){const bitmap=await createImageBitmap(this.video);if(this.disposed||document.hidden){bitmap.close();this.busy=false;return;}this.worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);}
      else {this.result(this.tracker!.detectForVideo(this.video,timestamp),timestamp);this.busy=false;}
    }catch(e){this.busy=false;if(!this.disposed)this.onError(new Error(String(e)));}
  }
  dispose(){this.disposed=true;clearTimeout(this.initTimer);clearInterval(this.timer);this.initReject?.(new Error('Cancelled'));this.worker?.terminate();this.tracker?.close();this.rate=0;}
}
