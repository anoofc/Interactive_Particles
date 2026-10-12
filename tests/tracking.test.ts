import {afterEach,it,expect,vi} from 'vitest';
import {HandTracking} from '../src/tracking';
class WorkerStub {
  static latest:WorkerStub;
  onmessage?: (event:{data:unknown})=>void;onerror?:unknown;
  terminate=vi.fn();
  constructor(){WorkerStub.latest=this;}
  postMessage(message:{type:string}){if(message.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('timestamps detections on delivery instead of expiring them by their capture timestamp',async()=>{
  vi.useFakeTimers({toFake:['performance','setTimeout','clearTimeout']});
  vi.stubGlobal('window',globalThis);vi.stubGlobal('Worker',WorkerStub);
  vi.stubGlobal('createImageBitmap',vi.fn());vi.stubGlobal('location',{href:'http://localhost:5173/'});
  const result=vi.fn(),error=vi.fn();
  const tracking=new HandTracking({} as HTMLVideoElement,result,error);await tracking.init();
  await vi.advanceTimersByTimeAsync(350);
  const detection={landmarks:[],handedness:[],worldLandmarks:[]};
  WorkerStub.latest.onmessage?.({data:{type:'result',result:detection,timestamp:25}});
  expect(result).toHaveBeenCalledWith(detection,350);expect(tracking.latency).toBe(325);expect(error).not.toHaveBeenCalled();
  tracking.dispose();expect(WorkerStub.latest.terminate).toHaveBeenCalledOnce();
});
