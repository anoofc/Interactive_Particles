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
  it('holds pinch through its hysteresis band, then releases after stability',()=>{
    const e=new GestureEngine();settle(e,[hand(.5,1,.25)]);
    settle(e,[hand(.5,1,.40)],330);expect(e.frame.hands[0].mode).toBe('pinch');
    e.update([hand(.5,1,.6)],660,1,1);expect(e.frame.hands[0].mode).toBe('pinch');
    settle(e,[hand(.5,1,.6)],690);expect(e.frame.hands[0].mode).toBe('open');
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
    e.update([],600,1,1);e.tick(.03,600);expect(e.frame.hands[0].weight).toBeGreaterThan(0);expect(e.frame.hands[0].mode).toBe('trail');
    e.update([hand()],630,1,1);const fresh=e.frame.hands.find(h=>h.lastSeen===630)!;expect(fresh.id).not.toBe(id);expect(fresh.mode).toBe('trail');
    for(let t=660;t<1700;t+=30)e.tick(.03,t);expect(e.frame.hands).toHaveLength(0);
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
