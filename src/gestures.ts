import { GESTURE as C } from './config';
export interface Point {x:number; y:number; z?:number}
export type Mode = 'trail'|'pinch'|'open';
export interface Detection {landmarks:Point[]; label:string; confidence:number}
export interface Hand {
  id:number; x:number; y:number; index:Point; thumb:Point; pinchPoint:Point;
  vx:number; vy:number; openness:number; pinch:number; mode:Mode;
  confidence:number; label:string; lastSeen:number; weight:number;
  candidate:Mode; candidateSince:number; lastSwipe:number;
}
export interface Wave {x:number;y:number;dx:number;dy:number;strength:number;age:number}
export interface GestureFrame {hands:Hand[]; waves:Wave[]; two:{active:boolean;weight:number;x:number;y:number;scale:number}}
export const clamp = (v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const distance=(a:Point,b:Point,aspect=1)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
/** Camera is mirrored and letterboxed (contain), never cropped, on both interaction and preview. */
export function mapPoint(p:Point, videoAspect:number, viewportAspect:number):Point {
  const sx=Math.min(1,videoAspect/viewportAspect), sy=Math.min(1,viewportAspect/videoAspect);
  return {x:0.5+(0.5-p.x)*sx,y:0.5+(p.y-0.5)*sy};
}
export function measure(points:Point[],aspect=1) {
  const palm={x:0,y:0};
  for(const i of [0,5,9,13,17]) {palm.x+=points[i].x/5;palm.y+=points[i].y/5;}
  const size=Math.max(0.015,(distance(points[0],points[9],aspect)+distance(points[5],points[17],aspect))/2);
  const ratio=distance(points[4],points[8],aspect)/size;
  let openness=0;
  for(const [tip,pip,mcp] of [[8,6,5],[12,10,9],[16,14,13],[20,18,17]]) {
    // A straight finger has a tip well beyond its PIP and a nearly straight joint.
    const a=distance(points[mcp],points[pip],aspect),b=distance(points[pip],points[tip],aspect);
    const straight=distance(points[mcp],points[tip],aspect)/Math.max(0.001,a+b);
    const reach=distance(points[tip],points[0],aspect)/Math.max(0.001,distance(points[pip],points[0],aspect));
    openness+=clamp((straight-0.72)/0.25)*clamp((reach-1.05)/0.32)/4;
  }
  return {palm,size,ratio,pinch:clamp(1-ratio/0.65),openness};
}
export class GestureEngine {
  frame:GestureFrame={hands:[],waves:[],two:{active:false,weight:0,x:.5,y:.5,scale:1}};
  private nextId=1;
  private baseline=0;
  private baseScale=1;
  private pair='';
  private lastTime=0;
  reset() {this.frame.hands=[];this.frame.waves=[];this.frame.two.active=false;this.frame.two.weight=0;this.frame.two.scale=1;this.frame.two.x=.5;this.frame.two.y=.5;this.baseline=0;this.pair='';this.lastTime=0;}
  update(detections:Detection[],now:number,videoAspect=4/3,viewportAspect=16/9) {
    const dt=clamp((now-this.lastTime)/1000,.008,.1);this.lastTime=now;
    const alpha=1-Math.exp(-dt/C.smoothingSeconds);
    // Never reuse stale identities or gestures after tracking loss.
    this.frame.hands=this.frame.hands.filter(h=>now-h.lastSeen<C.lostMs||h.weight>.015);
    const measurements=detections.slice(0,2).map(d=>({d,m:measure(d.landmarks,videoAspect),p:mapPoint(measure(d.landmarks,videoAspect).palm,videoAspect,viewportAspect)}));
    const old=this.frame.hands;
    // Globally compare the two permutations: detection order is not hand identity.
    let assignment:number[]=[];let best=Infinity;
    const visit=(i:number,used:Set<number>,indices:number[],cost:number)=>{
      if(i===measurements.length) {if(cost<best){best=cost;assignment=indices.slice();}return;}
      visit(i+1,used,[...indices,-1],cost+C.matchDistance);
      old.forEach((h,j)=>{if(used.has(j)||now-h.lastSeen>=C.lostMs)return;const p=measurements[i].p;const d=Math.hypot(h.x-p.x,h.y-p.y)+(h.label!==measurements[i].d.label?0.025:0);if(d<C.matchDistance){used.add(j);visit(i+1,used,[...indices,j],cost+d);used.delete(j);}});
    };
    visit(0,new Set(),[],0);
    this.frame.waves=[];
    measurements.forEach(({d,m,p},i)=>{
      let h=assignment[i]>=0?old[assignment[i]]:undefined;
      const fresh=!h;
      if(!h) {h={id:this.nextId++,x:p.x,y:p.y,index:p,thumb:p,pinchPoint:p,vx:0,vy:0,openness:m.openness,pinch:m.pinch,mode:'trail',confidence:d.confidence,label:d.label,lastSeen:now,weight:0,candidate:'trail',candidateSince:now,lastSwipe:-Infinity};old.push(h);}
      const step=clamp((now-h.lastSeen)/1000,.015,.12);
      const nx=h.x+(p.x-h.x)*alpha,ny=h.y+(p.y-h.y)*alpha;
      h.vx=fresh?0:h.vx+(clamp((nx-h.x)/step,-5,5)-h.vx)*.6;
      h.vy=fresh?0:h.vy+(clamp((ny-h.y)/step,-5,5)-h.vy)*.6;
      h.x=nx;h.y=ny;h.lastSeen=now;h.confidence=d.confidence;h.label=d.label;
      h.openness+=(m.openness-h.openness)*alpha;h.pinch+=(m.pinch-h.pinch)*alpha;
      const index=mapPoint(d.landmarks[8],videoAspect,viewportAspect),thumb=mapPoint(d.landmarks[4],videoAspect,viewportAspect);
      h.index={x:h.index.x+(index.x-h.index.x)*alpha,y:h.index.y+(index.y-h.index.y)*alpha};
      h.thumb={x:h.thumb.x+(thumb.x-h.thumb.x)*alpha,y:h.thumb.y+(thumb.y-h.thumb.y)*alpha};
      h.pinchPoint={x:(h.index.x+h.thumb.x)/2,y:(h.index.y+h.thumb.y)/2};
      const pinch=m.ratio<(h.mode==='pinch'?C.pinchExit:C.pinchEnter);
      const fastOpen=!pinch&&m.openness>=C.fastOpenEnter;
      const open=fastOpen||h.openness>(h.mode==='open'?C.openExit:C.openEnter);
      const desired:Mode=pinch?'pinch':open?'open':'trail';
      if(h.candidate!==desired){h.candidate=desired;h.candidateSince=now;}
      if(fastOpen||now-h.candidateSince>=C.stabilityMs)h.mode=desired;
      const speed=Math.hypot(h.vx,h.vy);
      if(h.mode!=='pinch'&&!pinch&&speed>C.swipeSpeed&&now-h.lastSwipe>C.swipeCooldownMs) {
        this.frame.waves.push({x:h.x,y:h.y,dx:h.vx/speed,dy:h.vy/speed,strength:clamp(speed/C.swipeSpeed,1,3),age:0});h.lastSwipe=now;
      }
    });
    const live=old.filter(h=>h.lastSeen===now);
    const qualifies=live.length===2&&live.every(h=>h.mode==='open');
    const two=this.frame.two;
    if(qualifies) {
      const [a,b]=live;const d=Math.hypot((a.x-b.x)*viewportAspect,a.y-b.y);const pair=live.map(h=>h.id).sort().join(',');
      if(!two.active||pair!==this.pair){this.baseline=Math.max(.08,d);this.baseScale=two.scale;this.pair=pair;}
      two.x=(a.x+b.x)/2;two.y=(a.y+b.y)/2;
      const target=clamp(this.baseScale*d/this.baseline,C.twoMinScale,C.twoMaxScale);
      two.scale+=(target-two.scale)*alpha;
    }
    two.active=qualifies;
    return this.frame;
  }
  tick(dt:number,now:number) {
    const two=this.frame.two;if(two.active&&this.frame.hands.filter(h=>now-h.lastSeen<C.lostMs&&h.mode==='open').length!==2)two.active=false;two.weight+=((two.active?1:0)-two.weight)*(1-Math.exp(-dt*8));
    if(!two.active)two.scale+=(1-two.scale)*(1-Math.exp(-dt*1.3));
    for(const h of this.frame.hands){const present=now-h.lastSeen<C.lostMs;h.weight+=((present?1:0)-h.weight)*(1-Math.exp(-dt*(present?12:7)));if(!present){h.mode='trail';h.vx*=.9;h.vy*=.9;}}
    this.frame.hands=this.frame.hands.filter(h=>now-h.lastSeen<C.lostMs||h.weight>.015);
  }
}
