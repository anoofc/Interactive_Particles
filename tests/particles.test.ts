import {it,expect} from 'vitest';
import {ParticleSimulation} from '../src/particles';
import type {GestureFrame,Hand} from '../src/gestures';
const frame:GestureFrame={hands:[],waves:[],two:{active:false,weight:0,x:.5,y:.5,scale:1}};
it('stays finite and speed-limited under sustained strong interaction',()=>{
  const sim=new ParticleSimulation();sim.count=1000;sim.strength=2.5;
  const h={x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode:'pinch',pinch:1,weight:1,vx:3,vy:2,openness:1} as Hand;
  const f={...frame,hands:[h]};sim.burst({x:.5,y:.5,dx:1,dy:0,strength:3,age:0});
  for(let i=0;i<240;i++)sim.step(1/60,i/60,f);
  for(let i=0;i<sim.count;i++){const j=i*3;expect(Number.isFinite(sim.positions[j])).toBe(true);expect(Math.hypot(sim.velocities[j],sim.velocities[j+1],sim.velocities[j+2])).toBeLessThanOrEqual(12.00001);}
});
it('pinch attraction and palm repulsion drive actual opposite particle motion',()=>{
  function run(mode:'pinch'|'open') {const sim=new ParticleSimulation();sim.count=1;sim.positions.set([1,0,0]);sim.velocities.fill(0);sim.step(.03,0,{...frame,hands:[{x:.5,y:.5,pinchPoint:{x:.5,y:.5},mode,pinch:1,weight:1,vx:0,vy:0,openness:1} as Hand]});return sim.velocities[0];}
  expect(run('pinch')).toBeLessThan(0);expect(run('open')).toBeGreaterThan(0);
});
