import './style.css';
import { $, createUI, setStatus, showError, hideControls } from './ui';
import { ParticleSimulation } from './particles';
import { ParticleRenderer } from './renderer';
import { Camera, cameraError } from './camera';
import { HandTracking } from './tracking';
import { GestureEngine, clamp, type Hand, type GestureFrame } from './gestures';
import { QUALITY, PALETTES, type Quality, type Palette } from './config';
createUI();
if(innerWidth<=800)hideControls(true);
const events=new AbortController();const signal=events.signal;
const sim=new ParticleSimulation();const engine=new GestureEngine();
let renderer:ParticleRenderer|undefined;
try {renderer=new ParticleRenderer(sim,$('stage'));}
catch {showError('WebGL rendering is unavailable. Enable hardware acceleration and use a recent browser that supports WebGL 2.');$('notice-title').textContent='WebGL unavailable';for(const id of ['start','mouse','camera-control','retry','error-mouse'])$(id).setAttribute('disabled','');}
const video=$<HTMLVideoElement>('video'), camera=new Camera(video);
let tracking:HandTracking|undefined,mode:'idle'|'mouse'|'camera'='idle',loading=false,generation=0,quality:Quality='Auto';
let raf=0,lastFrame=0,time=0,fps=60,poorSeconds=0,autoCooldown=0,lastUI=0;
let pointerDown=false,shift=false,lastPointer=0,lastPointerX=.5,lastPointerY=.5,mouseActive=false;
const mouse:Hand={id:0,x:.5,y:.5,index:{x:.5,y:.5},thumb:{x:.5,y:.5},pinchPoint:{x:.5,y:.5},vx:0,vy:0,openness:1,pinch:1,mode:'trail',confidence:1,label:'Mouse',lastSeen:0,weight:0,candidate:'trail',candidateSince:0,lastSwipe:0};
const mouseFrame:GestureFrame={hands:[mouse],waves:[],two:{active:false,weight:0,x:.5,y:.5,scale:1}};
const rings=Array.from(document.querySelectorAll<HTMLElement>('.ring'));
function on(target:EventTarget,type:string,callback:EventListener){target.addEventListener(type,callback,{signal});}
function countUI(){ $<HTMLInputElement>('count').value=String(sim.count);$('count-label').textContent=sim.count.toLocaleString();}
function previewUI(){$('preview').hidden=mode!=='camera'||!$<HTMLInputElement>('preview-toggle').checked;}
function stopCamera(){
  generation++;loading=false;tracking?.dispose();tracking=undefined;camera.stop();engine.reset();
  if(mode==='camera')mode='idle';
  $('start').removeAttribute('disabled');$('camera-control').removeAttribute('disabled');$('camera-control').querySelector('span')!.textContent='Start Camera';$('start').querySelector('span')!.textContent='Start Camera';
  $('camera-select-wrap').hidden=true;previewUI();
}
function idle(){mode='idle';document.body.classList.remove('playing');$('mode-tag').textContent='IDLE FLOW';$('burst').hidden=true;setStatus('Camera off');}
function useMouse(){
  stopCamera();mode='mouse';lastPointer=0;mouseActive=false;pointerDown=false;mouse.weight=0;sim.mouseScale=1;
  document.body.classList.add('playing');$('notice').hidden=true;$('mode-tag').textContent='MOUSE MODE';$('burst').hidden=false;
  if(innerWidth<=800)hideControls(true);
  setStatus('Mouse mode · move to play',true);
}
async function startCamera(deviceId?:string){
  if(!renderer||loading)return;
  stopCamera();mode='idle';loading=true;const token=generation;
  $('notice').hidden=true;$('burst').hidden=true;$('start').setAttribute('disabled','');$('start').querySelector('span')!.textContent='Opening camera…';
  $('camera-control').querySelector('span')!.textContent='Cancel';setStatus('Requesting camera access');
  try{
    const stream=await camera.start(deviceId);if(token!==generation)return;
    setStatus('Loading tracking');$('start').querySelector('span')!.textContent='Loading tracking…';
    const pipeline=new HandTracking(video,(r,t)=>{
      if(token!==generation||mode!=='camera')return;
      const frame=engine.update(r.landmarks.map((landmarks,i)=>({landmarks,label:r.handedness[i]?.[0]?.categoryName??'',confidence:r.handedness[i]?.[0]?.score??0})),t,video.videoWidth/video.videoHeight,innerWidth/innerHeight);
      for(const wave of frame.waves)sim.burst(wave);
      drawLandmarks(r.landmarks);
    },e=>{
      if(token!==generation)return;
      stopCamera();idle();showError(`Hand tracking stopped. ${e.message}`);
    });
    tracking=pipeline;await pipeline.init();if(token!==generation){pipeline.dispose();return;}
    mode='camera';loading=false;engine.reset();sim.mouseScale=1;pipeline.start();
    stream.getVideoTracks().forEach(track=>on(track,'ended',()=>{if(token===generation){stopCamera();idle();showError('The camera disconnected. Reconnect it, then retry.');}}));
    $('start').removeAttribute('disabled');$('start').querySelector('span')!.textContent='Start Camera';$('camera-control').querySelector('span')!.textContent='Stop Camera';
    document.body.classList.add('playing');if(innerWidth<=800)hideControls(true);$('mode-tag').textContent='HAND CONTROL';setStatus('No hands detected',true);previewUI();
    $('preview').style.aspectRatio=String(video.videoWidth/video.videoHeight);
    try{const devices=await camera.devices();if(token!==generation)return;const select=$<HTMLSelectElement>('camera-select');select.replaceChildren();devices.forEach((d,i)=>{const option=new Option(d.label||`Camera ${i+1}`,d.deviceId);select.add(option);});select.value=stream.getVideoTracks()[0].getSettings().deviceId??'';$('camera-select-wrap').hidden=devices.length<2;}catch{/* Optional selector; active camera remains usable. */}
  }catch(e){if(token!==generation)return;stopCamera();idle();showError(cameraError(e));}
}
function drawLandmarks(hands: {x:number;y:number}[][]){
  const canvas=$<HTMLCanvasElement>('landmarks');canvas.hidden=!$<HTMLInputElement>('debug-toggle').checked;
  if(canvas.hidden)return;
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#8affe9';ctx.fillStyle='#ceabff';ctx.lineWidth=2;
  const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  for(const hand of hands){ctx.beginPath();for(const [a,b]of edges){ctx.moveTo((1-hand[a].x)*canvas.width,hand[a].y*canvas.height);ctx.lineTo((1-hand[b].x)*canvas.width,hand[b].y*canvas.height);}ctx.stroke();for(const p of hand){ctx.beginPath();ctx.arc((1-p.x)*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}}
}
function applyQuality(q:Quality){quality=q;const config=QUALITY[q==='Auto'?'Medium':q];sim.count=config.count;if(renderer){renderer.ratio=config.ratio;renderer.useBloom=config.bloom;renderer.resize();}poorSeconds=0;autoCooldown=0;countUI();}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{showError('Fullscreen is unavailable in this browser window. You can still play in the current window.');$('notice-title').textContent='Fullscreen unavailable';}}
for(const id of ['start','retry'])on($(id),'click',()=>{void startCamera();});
for(const id of ['mouse','error-mouse'])on($(id),'click',useMouse);
on($('camera-control'),'click',()=>{if(mode==='camera'||loading){stopCamera();idle();}else void startCamera();});
on($('camera-select'),'change',()=>{void startCamera($<HTMLSelectElement>('camera-select').value);});
on($('dismiss'),'click',()=>{$('notice').hidden=true;});
on($('palette'),'change',()=>{const p=$<HTMLSelectElement>('palette').value as Palette;renderer?.setPalette(p);$('palette-name').textContent=p;document.querySelectorAll<HTMLElement>('.palette-preview i').forEach((el,i)=>{el.style.background=`#${PALETTES[p][i].toString(16)}`;});});
on($('quality'),'change',()=>applyQuality($<HTMLSelectElement>('quality').value as Quality));
on($('count'),'input',()=>{sim.count=Number($<HTMLInputElement>('count').value);countUI();});
on($('strength'),'input',()=>{sim.strength=Number($<HTMLInputElement>('strength').value);$('strength-label').textContent=`${sim.strength.toFixed(1)}×`;});
on($('bloom'),'input',()=>{const value=Number($<HTMLInputElement>('bloom').value);if(renderer)renderer.bloomIntensity=value;$('bloom-label').textContent=`${Math.round(value*100)}%`;});
on($('preview-toggle'),'change',previewUI);
on($('indicator-toggle'),'change',()=>{$('rings').hidden=!$<HTMLInputElement>('indicator-toggle').checked;});
on($('debug-toggle'),'change',()=>{$('debug').hidden=!$<HTMLInputElement>('debug-toggle').checked;$('landmarks').hidden=$('debug').hidden;});
on($('reset'),'click',()=>{sim.reset();sim.mouseScale=1;engine.reset();});
on($('fullscreen'),'click',()=>{void fullscreen();});
on($('hide'),'click',()=>hideControls(true));on($('show'),'click',()=>hideControls(!$('controls').hidden));
function burst(){let dx=mouse.vx,dy=mouse.vy;const length=Math.hypot(dx,dy);if(length<.05){dx=1;dy=0;}else{dx/=length;dy/=length;}sim.burst({x:mouse.x,y:mouse.y,dx,dy,strength:2,age:0});}
on($('burst'),'click',burst);
const stage=$('stage');
on(stage,'pointermove',event=>{
  if(mode!=='mouse')return;const e=event as PointerEvent;const now=performance.now(),x=e.clientX/innerWidth,y=e.clientY/innerHeight;
  const dt=clamp((now-lastPointer)/1000,.016,.12);
  mouse.vx=lastPointer?clamp((x-lastPointerX)/dt,-4,4):0;mouse.vy=lastPointer?clamp((y-lastPointerY)/dt,-4,4):0;
  lastPointer=now;lastPointerX=x;lastPointerY=y;mouse.x=x;mouse.y=y;mouse.pinchPoint.x=x;mouse.pinchPoint.y=y;mouseActive=true;
});
on(stage,'pointerdown',event=>{if(mode!=='mouse')return;const e=event as PointerEvent;pointerDown=true;shift=e.shiftKey;mouseActive=true;mouse.x=e.clientX/innerWidth;mouse.y=e.clientY/innerHeight;mouse.pinchPoint.x=mouse.x;mouse.pinchPoint.y=mouse.y;stage.setPointerCapture(e.pointerId);});
on(window,'pointerup',()=>{pointerDown=false;});on(stage,'pointercancel',()=>{pointerDown=false;});on(stage,'pointerleave',()=>{if(!pointerDown)mouseActive=false;});
stage.addEventListener('wheel',event=>{if(mode!=='mouse')return;event.preventDefault();sim.mouseScale=clamp(sim.mouseScale*Math.exp(-event.deltaY*.001),.55,1.85);},{passive:false,signal});
on(window,'keydown',event=>{
  const e=event as KeyboardEvent;shift=e.shiftKey;
  if(e.target instanceof HTMLElement&&(e.target.matches('input,select,textarea')||e.target.isContentEditable))return;
  if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  switch(e.key.toLowerCase()) {case'f':void fullscreen();break;case'h':hideControls(!$('controls').hidden);break;case'r':sim.reset();sim.mouseScale=1;engine.reset();break;case'escape':hideControls(false);break;}
});
on(window,'keyup',event=>{shift=(event as KeyboardEvent).shiftKey;});
on(window,'blur',()=>{pointerDown=false;shift=false;mouseActive=false;});
on(window,'resize',()=>renderer?.resize());
on(document,'visibilitychange',()=>{lastFrame=0;engine.reset();pointerDown=false;mouse.vx=0;mouse.vy=0;});
function loop(now:number){
  raf=requestAnimationFrame(loop);if(!renderer||document.hidden)return;
  const dt=lastFrame?clamp((now-lastFrame)/1000,.001,.033):.016;const realDt=lastFrame?(now-lastFrame)/1000:.016;lastFrame=now;time+=dt;fps+=(1/Math.max(.001,realDt)-fps)*.035;
  engine.tick(dt,now);
  let frame=engine.frame;
  if(mode==='mouse'){
    mouse.weight+=((mouseActive?1:0)-mouse.weight)*(1-Math.exp(-dt*10));
    mouse.mode=pointerDown?(shift?'open':'pinch'):'trail';mouse.lastSeen=now;
    mouse.vx*=Math.exp(-dt*4);mouse.vy*=Math.exp(-dt*4);frame=mouseFrame;
  }
  sim.step(dt,time,frame);renderer.render();
  rings.forEach((ring,i)=>{const h=frame.hands[i];if(!h){ring.style.opacity='0';return;}const p=h.mode==='pinch'?h.pinchPoint:h;ring.style.left=`${p.x*100}%`;ring.style.top=`${p.y*100}%`;ring.style.opacity=String(h.weight*.7*(1-frame.two.weight));ring.className=`ring ${h.mode}`;});
  if(quality==='Auto'){
    autoCooldown=Math.max(0,autoCooldown-dt);poorSeconds=fps<35?poorSeconds+dt:Math.max(0,poorSeconds-dt*.5);
    if(poorSeconds>6&&autoCooldown===0){sim.count=Math.max(2000,Math.round(sim.count*.78/500)*500);renderer.ratio=Math.max(.75,renderer.ratio-.15);if(renderer.ratio<=1)renderer.useBloom=false;renderer.resize();countUI();poorSeconds=0;autoCooldown=8;}
  }
  if(now-lastUI>300){
    lastUI=now;
    if(mode==='camera') {const n=engine.frame.hands.filter(h=>engine.isPresent(h,now)).length;setStatus(n===0?'No hands detected':n===1?'One hand detected':'Two hands detected',true);}
    if(!$('debug').hidden){const hands=frame.hands.filter(h=>h.weight>.1);$('debug').textContent=`FPS ${Math.round(fps)} · Particles ${sim.count.toLocaleString()}\nInference ${tracking?.rate.toFixed(1)??'0'} Hz · ${tracking?.backend??mode}\nLatency ${tracking?.latency.toFixed(0)??'0'} ms · Tracking grace ${engine.lossTimeoutMs.toFixed(0)} ms\n${frame.two.active?'Two hands: scale '+frame.two.scale.toFixed(2)+'×\n':''}${hands.map(h=>`${h.label} #${h.id}: ${h.mode} · handedness ${(h.confidence*100).toFixed(0)}%\nOpen ${h.openness.toFixed(2)} · Pinch ${h.pinch.toFixed(2)}`).join('\n')}\nConfidence is handedness classification, not landmark certainty.`;}
  }
}
if(renderer){applyQuality('Auto');raf=requestAnimationFrame(loop);}
function dispose(){cancelAnimationFrame(raf);stopCamera();events.abort();renderer?.dispose();}
on(window,'pagehide',dispose);
if(import.meta.hot)import.meta.hot.dispose(dispose);
