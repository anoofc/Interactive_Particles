import {it,expect} from 'vitest';
import {ParticleSimulation} from '../src/particles';
import type {GestureFrame,Hand} from '../src/gestures';
const frame:GestureFrame={hands:[],waves:[],two:{active:false,weight:0,x:.5,y:.5,scale:1}};
it('stays finite and speed-limited under sustained strong interaction',()=>{
  const sim=new ParticleSimulation();sim.count=1000;sim.strength=2.5;
  const h={id:0,x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode:'pinch',pinch:1,weight:1,vx:3,vy:2,openness:1} as Hand;
  const f={...frame,hands:[h]};sim.burst({x:.5,y:.5,dx:1,dy:0,strength:3,age:0});
  for(let i=0;i<240;i++)sim.step(1/60,i/60,f);
  for(let i=0;i<sim.count;i++){const j=i*3;expect(Number.isFinite(sim.positions[j])).toBe(true);expect(Math.hypot(sim.velocities[j],sim.velocities[j+1],sim.velocities[j+2])).toBeLessThanOrEqual(12.00001);}
});
it('pinch attraction and palm repulsion drive actual opposite particle motion',()=>{
  function run(mode:'pinch'|'open') {const sim=new ParticleSimulation();sim.count=0;sim.step(.01,0,{...frame,hands:[{id:0,x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode,pinch:1,weight:1,vx:0,vy:0,openness:1} as Hand]});sim.count=1;sim.positions.set([1,0,0]);sim.velocities.fill(0);sim.step(.03,0,{...frame,hands:[{id:0,x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode,pinch:1,weight:1,vx:0,vy:0,openness:1} as Hand]});return sim.velocities[0];}
  expect(run('pinch')).toBeLessThan(0);expect(run('open')).toBeGreaterThan(0);
});
function releaseHand(id=1):Hand{return {id,x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode:'pinch',pinch:1,weight:1,vx:0,vy:0,openness:1} as Hand;}
function spread(sim:ParticleSimulation){let sum=0;for(let i=0;i<sim.count*3;i++)sum+=sim.positions[i]*sim.positions[i];return Math.sqrt(sum/sim.count);}
it('accelerates an overlapping cluster into a broad fluid scatter within 350ms',()=>{
  const sim=new ParticleSimulation();sim.count=500;
  const initial=spread(sim),h=releaseHand(),f={...frame,hands:[h]};
  sim.step(1/60,0,f);sim.positions.fill(0);sim.velocities.fill(0);
  h.mode='open';sim.step(1/60,.016,f);
  expect(spread(sim)).toBeGreaterThan(.001);
  expect(spread(sim)).toBeLessThan(.1);
  for(let i=1;i<21;i++)sim.step(1/60,i/60,f);
  expect(spread(sim)).toBeGreaterThan(initial*.7);
  for(let i=0;i<sim.count;i++)expect(Math.hypot(...sim.velocities.subarray(i*3,i*3+3))).toBeLessThanOrEqual(24.00001);
});
it('does not repeat a scatter while the palm stays open',()=>{
  const sim=new ParticleSimulation();sim.count=1;const h=releaseHand(),f={...frame,hands:[h]};
  sim.step(1/60,0,f);h.mode='open';
  for(let i=0;i<50;i++)sim.step(1/60,i/60,f);
  sim.positions.set([0,0,0]);sim.velocities.fill(0);
  sim.step(1/60,1,f);expect(spread(sim)).toBeLessThan(.01);
});
it('releases from the previous pinch location even when the palm centre is displaced',()=>{
  const sim=new ParticleSimulation();sim.count=500;const initial=spread(sim),h=releaseHand(),f={...frame,hands:[h]};
  h.pinchPoint.x=.85;sim.step(1/60,0,f);
  for(let i=0;i<sim.count;i++)sim.positions.set([5.6,0,0],i*3);
  sim.velocities.fill(0);h.x=.1;h.mode='open';
  for(let i=0;i<21;i++)sim.step(1/60,i/60,f);
  expect(spread(sim)).toBeGreaterThan(initial*.7);
  let meanX=0;for(let i=0;i<sim.count;i++)meanX+=sim.positions[i*3]/sim.count;
  expect(Math.abs(meanX-5.6)).toBeLessThan(.5);
  let variance=0;for(let i=0;i<sim.count;i++)variance+=(sim.positions[i*3]-meanX)**2/sim.count;
  expect(variance).toBeGreaterThan(2);
});
it('scatter still takes effect when both pinched hands open into two-hand control',()=>{
  const sim=new ParticleSimulation();sim.count=500;const initial=spread(sim),a=releaseHand(1),b=releaseHand(2);
  const f={...frame,hands:[a,b],two:{...frame.two}};sim.step(1/60,0,f);
  sim.positions.fill(0);sim.velocities.fill(0);a.mode='open';b.mode='open';f.two.active=true;f.two.weight=1;
  for(let i=0;i<21;i++)sim.step(1/60,i/60,f);
  expect(spread(sim)).toBeGreaterThan(initial*.7);
});
it('never bursts on initial open-palm acquisition or ordinary trail-to-open',()=>{
  for(const previous of [undefined,'trail'] as const){
    const sim=new ParticleSimulation();sim.count=500;const h=releaseHand(),f={...frame,hands:[h]};
    if(previous){h.mode=previous;sim.step(1/60,0,f);}
    sim.positions.fill(0);sim.velocities.fill(0);h.mode='open';sim.step(1/60,.1,f);
    expect(spread(sim)).toBeLessThan(.01);
  }
});
it('never releases after tracking loss or a fresh hand identity',()=>{
  for(const freshIdentity of [false,true]){
    const sim=new ParticleSimulation();sim.count=500;const h=releaseHand(),f={...frame,hands:[h]};
    sim.step(1/60,0,f);
    if(freshIdentity){f.hands=[];sim.step(1/60,.5,f);h.id=2;f.hands=[h];}
    else{h.mode='trail';sim.step(1/60,.5,f);}
    sim.positions.fill(0);sim.velocities.fill(0);h.mode='open';sim.step(1/60,.6,f);
    expect(spread(sim)).toBeLessThan(.01);
  }
});
it('releases a closed palm, with positions and velocity continuous at activation',()=>{
  const sim=new ParticleSimulation();sim.count=500;const h=releaseHand(),f={...frame,hands:[h]};
  h.mode='closed';sim.step(1/60,0,f);sim.positions.fill(0);sim.velocities.fill(0);
  h.mode='open';sim.step(1/60,.1,f);
  expect(spread(sim)).toBeGreaterThan(.001);expect(spread(sim)).toBeLessThan(.1);
  for(let i=0;i<20;i++)sim.step(1/60,.1+i/60,f);
  expect(spread(sim)).toBeGreaterThan(3);
});
it('varies successive releases instead of snapping to reusable home positions',()=>{
  const sim=new ParticleSimulation();sim.count=500;const h=releaseHand(),f={...frame,hands:[h]};
  function release(){sim.reset();h.mode='pinch';sim.step(1/60,0,f);sim.positions.fill(0);sim.velocities.fill(0);h.mode='open';for(let i=0;i<21;i++)sim.step(1/60,i/60,f);return sim.positions.slice(0,1500);}
  const first=release(),second=release();let difference=0;
  for(let i=0;i<first.length;i++)difference+=(first[i]-second[i])**2;
  expect(Math.sqrt(difference/sim.count)).toBeGreaterThan(1);
});
