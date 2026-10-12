import { describe, it, expect } from 'vitest';
import { GestureEngine, measure, mapPoint, type Point, type Detection } from '../src/gestures';
import { GESTURE } from '../src/config';
function hand(cx=.5,scale=1,ratio=1):Detection {
  const p:Point[]=Array.from({length:21},()=>({x:.5,y:.7}));
  p[0]={x:.5,y:.8};
  for(const [mcp,x]of [[5,.44],[9,.5],[13,.56],[17,.62]]){
    p[mcp]={x,y:.64};p[mcp+1]={x,y:.52};p[mcp+2]={x,y:.43};p[mcp+3]={x,y:.34};
  }
  p[1]={x:.4,y:.72};p[2]={x:.35,y:.65};p[3]={x:.3,y:.6};
  const size=measure(p).size;p[4]={x:p[8].x+ratio*size,y:p[8].y};
  return {landmarks:p.map(v=>({x:cx+(v.x-.5)*scale,y:.5+(v.y-.5)*scale})),label:'Left',confidence:.95};
}
function settle(e:GestureEngine,d:Detection[],start=0){for(let t=start;t<=start+300;t+=30){e.update(d,t,1,1);e.tick(.03,t);}return e.frame;}
describe('hand measurements and coordinate mapping',()=>{
  it('normalizes pinch against hand size at multiple camera distances',()=>{
    for(const scale of [.4,.8,1.3]){expect(measure(hand(.5,scale,.25).landmarks).ratio).toBeCloseTo(.25,6);const e=new GestureEngine();expect(settle(e,[hand(.5,scale,.25)]).hands[0].mode).toBe('pinch');}
  });
  it('recognizes an extended palm and avoids a curled palm',()=>{
    const d=hand();expect(measure(d.landmarks).openness).toBeGreaterThan(.95);
    for(const tip of [8,12,16,20])d.landmarks[tip]={...d.landmarks[tip-3],y:.76};
    expect(measure(d.landmarks).openness).toBeLessThan(.2);
  });
  it('mirrors and contains the video consistently in a wider viewport',()=>{
    expect(mapPoint({x:0,y:0},4/3,16/9)).toEqual({x:.875,y:0});
    expect(mapPoint({x:1,y:1},4/3,16/9)).toEqual({x:.125,y:1});
    expect(mapPoint({x:0,y:0},16/9,1)).toEqual({x:1,y:.21875});
  });
});
describe('gesture state and arbitration',()=>{
  it('holds pinch through its hysteresis band, then releases immediately for a fully open palm',()=>{
    const e=new GestureEngine();settle(e,[hand(.5,1,.25)]);
    settle(e,[hand(.5,1,.40)],330);expect(e.frame.hands[0].mode).toBe('pinch');
    e.update([hand(.5,1,.6)],660,1,1);expect(e.frame.hands[0].mode).toBe('open');
    settle(e,[hand(.5,1,.6)],690);expect(e.frame.hands[0].mode).toBe('open');
  });
  it('keeps the stability window for a partially extended palm after pinch',()=>{
    const e=new GestureEngine();settle(e,[hand(.5,1,.2)]);
    const partial=hand(.5,1,.6);for(const i of [8,12,16,20])partial.landmarks[i].y=.436;
    expect(measure(partial.landmarks).openness).toBeLessThan(GESTURE.fastOpenEnter);
    e.update([partial],330,1,1);expect(e.frame.hands[0].mode).toBe('pinch');
  });
  it('does not switch for a brief pinch flicker',()=>{
    const e=new GestureEngine();settle(e,[hand()]);e.update([hand(.5,1,.2)],330,1,1);e.update([hand()],360,1,1);expect(e.frame.hands[0].mode).toBe('open');
  });
  it('keeps open mode through its hysteresis band',()=>{
    const e=new GestureEngine();settle(e,[hand()]);
    // Intermediate openness is below enter but above exit.
    const d=hand();for(const i of [8,12,16,20])d.landmarks[i].y=.436;
    const m=measure(d.landmarks);expect(m.openness).toBeGreaterThan(GESTURE.openExit);expect(m.openness).toBeLessThan(GESTURE.openEnter);
    settle(e,[d],330);expect(e.frame.hands[0].mode).toBe('open');
  });
  it('captures a two-hand baseline without an activation jump and scales apart',()=>{
    const e=new GestureEngine();settle(e,[hand(.38),{...hand(.62),label:'Right'}]);expect(e.frame.two.active).toBe(true);expect(e.frame.two.scale).toBeCloseTo(1);
    settle(e,[hand(.26),{...hand(.74),label:'Right'}],330);expect(e.frame.two.scale).toBeGreaterThan(1.5);expect(e.frame.two.scale).toBeLessThanOrEqual(GESTURE.twoMaxScale);
    settle(e,[],660);expect(e.frame.two.active).toBe(false);
  });
  it('matches stable identities when detection order changes',()=>{
    const e=new GestureEngine();settle(e,[hand(.3),{...hand(.7),label:'Right'}]);const ids=e.frame.hands.map(h=>h.id);
    e.update([{...hand(.7),label:'Right'},hand(.3)],330,1,1);expect(e.frame.hands.map(h=>h.id)).toEqual(ids);
    expect(e.frame.hands[0].label).toBe('Left');
  });
  it('fades lost tracking and clears stale pinch before reacquisition',()=>{
    const e=new GestureEngine();settle(e,[hand(.5,1,.2)]);const id=e.frame.hands[0].id;
    e.update([],1200,1,1);e.tick(.03,1200);expect(e.frame.hands[0].weight).toBeGreaterThan(0);expect(e.frame.hands[0].mode).toBe('trail');
    e.update([hand()],1230,1,1);const fresh=e.frame.hands.find(h=>h.lastSeen===1230)!;expect(fresh.id).not.toBe(id);expect(fresh.mode).toBe('open');
    for(let t=1260;t<3200;t+=30)e.tick(.03,t);expect(e.frame.hands).toHaveLength(0);
  });
  it('emits directional swipes with a cooldown and suppresses pinching swipes',()=>{
    const e=new GestureEngine();settle(e,[hand(.7)]);
    const first=e.update([hand(.42)],330,1,1).waves;expect(first).toHaveLength(1);expect(first[0].dx).toBeGreaterThan(.9);
    expect(e.update([hand(.2)],360,1,1).waves).toHaveLength(0);
    expect(e.frame.hands[0].lastSwipe).toBe(330);
    settle(e,[hand(.5,1,.2)],400);expect(e.frame.hands[0].mode).toBe('pinch');
    expect(e.update([hand(.25,1,.2)],730,1,1).waves).toHaveLength(0);
    // A new deliberate swipe after the cooldown may fire again.
    settle(e,[hand(.6)],1000);expect(e.update([hand(.32)],1330,1,1).waves).toHaveLength(1);
  });
});
describe('closed palm and dropped tracking frames',()=>{
  it('recognizes a closed palm independently of thumb/index pinch',()=>{
    const e=new GestureEngine(),d=hand();
    for(const tip of [8,12,16,20])d.landmarks[tip]={...d.landmarks[tip-3],y:.76};
    d.landmarks[4]={x:.25,y:.55};
    settle(e,[d]);expect(e.frame.hands[0].mode).toBe('closed');
    e.update([hand()],330,1,1);expect(e.frame.hands[0].mode).toBe('open');
  });
  it('preserves an open gesture across a short missing frame and assigns a new identity after real loss',()=>{
    const e=new GestureEngine();settle(e,[hand()]);const id=e.frame.hands[0].id;
    e.update([],330,1,1);e.tick(.03,330);e.update([hand()],390,1,1);
    expect(e.frame.hands[0].id).toBe(id);expect(e.frame.hands[0].mode).toBe('open');
    e.tick(.03,1600);e.update([hand()],1630,1,1);
    const current=e.frame.hands.find(h=>h.lastSeen===1630)!;expect(current.id).not.toBe(id);expect(current.mode).toBe('open');
  });
});
describe('release events at slow inference rates',()=>{
  it('keeps hand identity and confirmed pinch at 5 Hz even with one dropped inference frame',()=>{
    const e=new GestureEngine();let now=0,id=0;
    for(let frame=0;frame<8;frame++){
      if(frame!==5){e.update([hand(.5,1,.2)],now,1,1);id ||= e.frame.hands[0].id;expect(e.frame.hands.filter(h=>e.isPresent(h,now)).map(h=>h.id)).toEqual([id]);}
      for(let i=0;i<12;i++){now+=1000/60;e.tick(1/60,now);}
    }
    expect(e.frame.hands[0].mode).toBe('pinch');
    const open=hand();open.landmarks[20]={...open.landmarks[17],y:.76};
    expect(measure(open.landmarks).openness).toBeCloseTo(.75);
    e.update([open],now,1,1);expect(e.frame.hands[0].id).toBe(id);expect(e.frame.hands[0].mode).toBe('open');expect(e.frame.hands[0].releaseSerial).toBe(1);
    e.update([open],now+200,1,1);expect(e.frame.hands[0].releaseSerial).toBe(1);
  });
  it('preserves a confirmed release through an intermediate hand pose, but disarms on true tracking loss',()=>{
    const e=new GestureEngine();settle(e,[hand(.5,1,.2)]);
    const partial=hand();for(const i of [8,12,16,20])partial.landmarks[i].y=.455;
    settle(e,[partial],330);expect(e.frame.hands[0].mode).toBe('trail');
    e.update([hand()],660,1,1);expect(e.frame.hands[0].releaseSerial).toBe(1);
    settle(e,[hand(.5,1,.2)],690);e.tick(.03,2000);
    e.update([hand()],2030,1,1);expect(e.frame.hands.find(h=>h.lastSeen===2030)!.releaseSerial).toBe(0);
  });
});
