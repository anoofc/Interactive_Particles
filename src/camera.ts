export function cameraError(e:unknown):string {
  const name=e instanceof DOMException?e.name:'';
  if(name==='NotAllowedError'||name==='SecurityError')return 'Camera permission was denied. Allow camera access in your browser’s site settings, then retry.';
  if(name==='NotFoundError'||name==='OverconstrainedError')return 'No available camera was found. Connect a camera or choose another device.';
  if(name==='NotReadableError'||name==='AbortError')return 'The camera could not start. Close other apps using it and retry.';
  return e instanceof Error?e.message:'The camera could not start. Please retry or use mouse mode.';
}
export class Camera {
  private metadataAbort?:AbortController;private stream?:MediaStream;private generation=0;
  constructor(public video:HTMLVideoElement){}
  async start(deviceId?:string){
    this.stop();const token=this.generation;
    if(!isSecureContext)throw new Error('Webcam access requires HTTPS or localhost. Open this app at http://localhost:5173 or use mouse mode.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access is unsupported in this browser. Try a recent Chrome, Edge, Firefox, or Safari, or use mouse mode.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:'user'})}});
    if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error('Cancelled');}
    this.stream=stream;this.video.srcObject=stream;
    await new Promise<void>((resolve,reject)=>{
      if(this.video.readyState>=1){resolve();return;}
      const aborter=this.metadataAbort=new AbortController();
      const cancelled=()=>{clean();reject(new Error('Cancelled'));};
      const timer=setTimeout(()=>{clean();reject(new Error('Camera did not provide video. Retry or choose a different camera.'));},10000);
      const clean=()=>{clearTimeout(timer);aborter.signal.removeEventListener('abort',cancelled);this.video.removeEventListener('loadedmetadata',ready);this.video.removeEventListener('error',fail);};
      const ready=()=>{clean();resolve();},fail=()=>{clean();reject(new Error('Camera video failed'));};
      aborter.signal.addEventListener('abort',cancelled,{once:true});
      this.video.addEventListener('loadedmetadata',ready);this.video.addEventListener('error',fail);
    });
    if(token!==this.generation)throw new Error('Cancelled');
    await this.video.play();return stream;
  }
  async devices(){return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');}
  stop(){this.generation++;this.metadataAbort?.abort();this.metadataAbort=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;this.video.pause();this.video.srcObject=null;}
}
