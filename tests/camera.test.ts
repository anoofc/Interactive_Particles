import { afterEach, it, expect, vi } from 'vitest';
import { Camera, cameraError } from '../src/camera';
function video(){return {readyState:1,srcObject:null,pause:vi.fn(),play:vi.fn().mockResolvedValue(undefined)} as unknown as HTMLVideoElement;}
function media(){const stop=vi.fn();return {stream:{getTracks:()=>[{stop}]} as unknown as MediaStream,stop};}
afterEach(()=>vi.unstubAllGlobals());
it('requests video only on explicit start and stops all tracks',async()=>{
  const m=media(),getUserMedia=vi.fn().mockResolvedValue(m.stream);
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
  const v=video(),camera=new Camera(v);expect(getUserMedia).not.toHaveBeenCalled();
  await camera.start();expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({audio:false,video:expect.any(Object)}));expect(v.srcObject).toBe(m.stream);
  camera.stop();expect(m.stop).toHaveBeenCalledOnce();expect(v.srcObject).toBeNull();
});
it('releases a late camera permission result after cancellation',async()=>{
  const m=media();let resolve!:(v:MediaStream)=>void;
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(r=>{resolve=r;})}});
  const camera=new Camera(video()),pending=camera.start();camera.stop();resolve(m.stream);
  await expect(pending).rejects.toThrow('Cancelled');expect(m.stop).toHaveBeenCalledOnce();
});
it('rejects insecure origins before requesting permission',async()=>{
  const getUserMedia=vi.fn();vi.stubGlobal('isSecureContext',false);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
  await expect(new Camera(video()).start()).rejects.toThrow('HTTPS or localhost');expect(getUserMedia).not.toHaveBeenCalled();
});
it('explains denied, missing, and busy camera failures',()=>{
  expect(cameraError(new DOMException('','NotAllowedError'))).toContain('permission');
  expect(cameraError(new DOMException('','NotFoundError'))).toContain('No available camera');
  expect(cameraError(new DOMException('','NotReadableError'))).toContain('other apps');
});
