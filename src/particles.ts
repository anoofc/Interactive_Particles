import { MAX_PARTICLES, SCATTER } from './config';
import type { GestureFrame, Hand, Mode, Wave } from './gestures';
export class ParticleSimulation {
  positions=new Float32Array(MAX_PARTICLES*3);
  velocities=new Float32Array(MAX_PARTICLES*3);
  seeds=new Float32Array(MAX_PARTICLES);
  trails=new Float32Array(MAX_PARTICLES*9);
  private scatterTargets=new Float32Array(MAX_PARTICLES*3);
  private scatterRemaining=new Float32Array(MAX_PARTICLES);
  private handModes=new Map<number,Mode>();
  private gatherCentres=new Map<number,{x:number;y:number}>();
  count=8000; width=16; height=9;
  strength=1; mouseScale=1; scale=1;waves:Wave[]=[];
  constructor(){for(let i=0;i<MAX_PARTICLES;i++)this.seeds[i]=Math.random();this.reset();}
  reset(){
    this.velocities.fill(0);this.waves=[];this.scatterRemaining.fill(0);
    this.handModes.clear();this.gatherCentres.clear();
    for(let i=0;i<MAX_PARTICLES;i++){
      const t=Math.random()*Math.PI*2,r=Math.pow(Math.random(),.65)*4.6;
      this.positions[i*3]=Math.cos(t)*r*1.6;
      this.positions[i*3+1]=Math.sin(t)*r*.72;
      this.positions[i*3+2]=(Math.random()-.5)*4;
    }
    this.scatterTargets.set(this.positions);
    for(let k=0;k<3;k++)this.trails.set(this.positions,k*MAX_PARTICLES*3);
  }
  burst(wave:Wave){this.waves.push({...wave});if(this.waves.length>10)this.waves.shift();}
  private scatter(hand:Hand){
    // Use the last gather centre: the palm and pinch midpoint are not the same point.
    const centre=this.gatherCentres.get(hand.id)??hand;
    const hx=(centre.x-.5)*this.width,hy=(.5-centre.y)*this.height;
    for(let i=0;i<this.count;i++){
      const j=i*3,dx=this.positions[j]-hx,dy=this.positions[j+1]-hy,z=this.positions[j+2];
      if(dx*dx+dy*dy+z*z>SCATTER.radius*SCATTER.radius)continue;
      this.scatterRemaining[i]=SCATTER.duration;
      // Independent original positions break up a dense clump, even at exact overlap.
      const tx=this.scatterTargets[j]-this.positions[j],ty=this.scatterTargets[j+1]-this.positions[j+1],tz=this.scatterTargets[j+2]-z;
      const length=Math.hypot(tx,ty,tz);
      if(length>.001){const speed=Math.min(SCATTER.speed,length*SCATTER.targetPull);this.velocities[j]=tx/length*speed;this.velocities[j+1]=ty/length*speed;this.velocities[j+2]=tz/length*speed;}
    }
    this.gatherCentres.delete(hand.id);
  }
  step(dt:number,time:number,frame:GestureFrame){
    const p=this.positions,v=this.velocities;
    for(const h of frame.hands){
      if(h.weight<=.1)continue;
      if(h.mode==='pinch')this.gatherCentres.set(h.id,{x:h.pinchPoint.x,y:h.pinchPoint.y});
      if(h.mode==='open'&&this.handModes.get(h.id)!=='open'&&(!frame.two.active||this.gatherCentres.has(h.id)))this.scatter(h);
      this.handModes.set(h.id,h.mode);
    }
    for(const id of this.handModes.keys())if(!frame.hands.some(h=>h.id===id&&h.weight>.1)){this.handModes.delete(id);this.gatherCentres.delete(id);}
    const target=frame.two.weight>.01?1+(frame.two.scale-1)*frame.two.weight:this.mouseScale;
    const oldScale=this.scale;this.scale+=(target-this.scale)*(1-Math.exp(-dt*5));
    const scaleFlow=(this.scale-oldScale)/Math.max(.001,dt*oldScale)*2.5;
    const damp=Math.exp(-dt*1.3), maxSpeed=12;
    for(const w of this.waves)w.age+=dt;
    this.waves=this.waves.filter(w=>w.age<1.1);
    const cx=(frame.two.x-.5)*this.width*frame.two.weight,cy=(.5-frame.two.y)*this.height*frame.two.weight;
    for(let i=0;i<this.count;i++){
      const j=i*3,x=p[j],y=p[j+1],z=p[j+2],seed=this.seeds[i];
      const scattering=this.scatterRemaining[i]>0;
      const radius=Math.sqrt((x-cx)*(x-cx)/2.56+(y-cy)*(y-cy)*2);
      // Curl-like drifting filaments, with a soft elliptical restoring field.
      let fx=-y*.22+Math.sin(y*.7+z*.6+time*.23)*.42;
      let fy=x*.09+Math.cos(x*.6-z*.5+time*.19)*.34;
      let fz=Math.sin(x*.3+y*.4+time*.3+seed*6)*.18-z*.06;
      const desired=(1.5+seed*3.2)*this.scale;
      const spring=(desired-radius)*.35;
      fx+=(x-cx)*scaleFlow;fy+=(y-cy)*scaleFlow;
      fx+=(x-cx)/Math.max(.4,radius)*spring;fy+=(y-cy)/Math.max(.4,radius)*spring;
      for(const h of frame.hands){
        // Brief release wins over lingering attraction and two-hand blend-out forces.
        if(scattering)continue;
        const mode=h.mode,pt=mode==='pinch'?h.pinchPoint:h;
        const hx=(pt.x-.5)*this.width,hy=(.5-pt.y)*this.height;
        const dx=hx-x,dy=hy-y,dz=-z*.65,d2=dx*dx+dy*dy+dz*dz;
        const influence=Math.exp(-d2/(mode==='pinch'?15:6))*h.weight*this.strength*(1-frame.two.weight);
        if(mode==='pinch'){
          const d=Math.sqrt(d2)+.001,orbit=.22+seed*.24;
          const attraction=(d-orbit)*9*h.pinch;
          fx+=(dx/d*attraction-dy*.7)*influence;fy+=(dy/d*attraction+dx*.7)*influence;fz+=dz*5*influence;
        } else if(mode==='open'){
          const force=11*h.openness/Math.sqrt(d2+.3);
          fx-=dx*force*influence;fy-=dy*force*influence;fz-=dz*force*.4*influence;
        }else{
          fx+=(dx*2+h.vx*this.width*2)*influence;
          fy+=(dy*2-h.vy*this.height*2)*influence;fz+=dz*influence;
        }
      }
      for(const w of this.waves){
        const dx=x-(w.x-.5)*this.width,dy=y-(.5-w.y)*this.height;
        const forward=dx*w.dx-dy*w.dy;
        const lateral=dx*w.dy+dy*w.dx;
        const wave=Math.exp(-Math.pow(forward-w.age*11,2)*.7-lateral*lateral*.16-z*z*.15)*(1-w.age/1.1)*w.strength*16*this.strength;
        fx+=w.dx*wave;fy-=w.dy*wave;
      }
      if(scattering){
        this.scatterRemaining[i]=Math.max(0,this.scatterRemaining[i]-dt);
        const blend=1-Math.exp(-dt*SCATTER.response);
        const tx=(this.scatterTargets[j]-x)*SCATTER.targetPull,ty=(this.scatterTargets[j+1]-y)*SCATTER.targetPull,tz=(this.scatterTargets[j+2]-z)*SCATTER.targetPull;
        const limit=Math.min(1,SCATTER.speed/Math.max(.001,Math.hypot(tx,ty,tz)));
        v[j]+=(tx*limit-v[j])*blend;v[j+1]+=(ty*limit-v[j+1])*blend;v[j+2]+=(tz*limit-v[j+2])*blend;
      }else{
        v[j]=(v[j]+Math.max(-45,Math.min(45,fx))*dt)*damp;
        v[j+1]=(v[j+1]+Math.max(-45,Math.min(45,fy))*dt)*damp;
        v[j+2]=(v[j+2]+Math.max(-30,Math.min(30,fz))*dt)*damp;
      }
      const speedLimit=scattering?SCATTER.speed:maxSpeed;
      const speed=Math.hypot(v[j],v[j+1],v[j+2]);if(speed>speedLimit){const s=speedLimit/speed;v[j]*=s;v[j+1]*=s;v[j+2]*=s;}
      p[j]+=v[j]*dt;p[j+1]+=v[j+1]*dt;p[j+2]+=v[j+2]*dt;
      // Wrapping takes place beyond the visible edges; tails reset to avoid long streaks.
      const bx=Math.max(12,this.width*.7),by=Math.max(8,this.height*.8);
      let wrapped=false;
      if(Math.abs(p[j])>bx){p[j]*=-.94;wrapped=true;}if(Math.abs(p[j+1])>by){p[j+1]*=-.94;wrapped=true;}if(Math.abs(p[j+2])>5){p[j+2]*=-.95;wrapped=true;}
      for(let k=2;k>=0;k--){const offset=k*MAX_PARTICLES*3+j;const prior=k?offset-MAX_PARTICLES*3:j;
        const src=k?this.trails:p;
        for(let a=0;a<3;a++)this.trails[offset+a]=wrapped?p[j+a]:this.trails[offset+a]+(src[prior+a]-this.trails[offset+a])*Math.min(1,dt*16);
      }
    }
  }
}
