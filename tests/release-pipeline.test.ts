import {it,expect} from 'vitest';
import {GestureEngine,type Detection,type Point} from '../src/gestures';
import {ParticleSimulation} from '../src/particles';
function input(pinch:boolean):Detection{
  const p:Point[]=Array.from({length:21},()=>({x:.5,y:.7}));p[0]={x:.5,y:.8};
  for(const [mcp,x]of [[5,.44],[9,.5],[13,.56],[17,.62]]){p[mcp]={x,y:.64};p[mcp+1]={x,y:.52};p[mcp+2]={x,y:.43};p[mcp+3]={x,y:.34};}
  p[4]=pinch?{x:.46,y:.34}:{x:.2,y:.55};
  // A real palm may have one foreshortened finger instead of four perfect fingers.
  if(!pinch)p[20]={...p[17],y:.76};
  return {landmarks:p,label:'Right',confidence:.95};
}
function variance(sim:ParticleSimulation){let mx=0,my=0;for(let i=0;i<sim.count;i++){mx+=sim.positions[i*3]/sim.count;my+=sim.positions[i*3+1]/sim.count;}let v=0;for(let i=0;i<sim.count;i++)v+=(sim.positions[i*3]-mx)**2+(sim.positions[i*3+1]-my)**2;return Math.sqrt(v/sim.count);}
it('actually disperses a gathered ball through landmarks → slow inference → gestures → 60Hz simulation',()=>{
  const e=new GestureEngine(),sim=new ParticleSimulation();sim.count=500;sim.strength=2;
  let next=0,collapsed=false,identity=0;
  for(let tick=0;tick<150;tick++){
    const now=tick*1000/60;
    if(now+.001>=next){
      if(next!==1200){e.update([input(next<1600)],now,1,1);identity ||= e.frame.hands[0].id;expect(e.frame.hands[0].id).toBe(identity);}
      next+=200;
    }
    e.tick(1/60,now);
    if(now>=1500&&!collapsed){const h=e.frame.hands[0];for(let i=0;i<sim.count;i++)sim.positions.set([(h.pinchPoint.x-.5)*sim.width,(.5-h.pinchPoint.y)*sim.height,0],i*3);sim.velocities.fill(0);collapsed=true;}
    sim.step(1/60,now/1000,e.frame);
    if(Math.abs(now-1950)<1)expect(variance(sim)).toBeGreaterThan(3);
  }
  expect(e.frame.hands[0].releaseSerial).toBe(1);expect(variance(sim)).toBeGreaterThan(5);
});
it('opening an already open hand after a long outage does not create a release event or burst',()=>{
  const e=new GestureEngine(),sim=new ParticleSimulation();sim.count=500;
  e.update([input(false)],0,1,1);e.tick(.03,0);sim.step(.03,0,e.frame);
  e.tick(.03,2000);sim.step(.03,2,e.frame);e.update([input(false)],2030,1,1);e.tick(.03,2030);
  const current=e.frame.hands.find(h=>h.lastSeen===2030)!;
  expect(current.releaseSerial).toBe(0);sim.positions.fill(0);sim.velocities.fill(0);sim.step(1/60,2.03,e.frame);
  expect(variance(sim)).toBeLessThan(.01);
});
