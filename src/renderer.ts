import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SavePass } from 'three/addons/postprocessing/SavePass.js';
import { MAX_PARTICLES, PALETTES, type Palette } from './config';
import { ParticleSimulation } from './particles';
const vertex=`attribute float seed; varying vec3 vColor; uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform float ratio;uniform float opacity;varying float vOpacity;
void main(){float t=seed*2.;vColor=t<1.?mix(c0,c1,t):mix(c1,c2,t-1.);vOpacity=opacity;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((2.8+seed*3.2)*ratio*(16./-mv.z),1.8,16.);}`;
const fragment=`varying vec3 vColor;varying float vOpacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float glow=exp(-d*d*5.)*(1.-smoothstep(.75,1.,d));gl_FragColor=vec4(vColor,glow*vOpacity);}`;
// Composite the unchanged PNG beneath the particles using their pre-bloom coverage.
// Sample unconditionally: branching at UV edges makes mipmap derivatives undefined and can draw seams.
const logoCompositeFragment=`uniform sampler2D tDiffuse;uniform sampler2D particleCoverage;uniform sampler2D logoMap;uniform vec2 logoSize;uniform vec3 background;varying vec2 vUv;
void main(){vec2 logoUv=(vUv-.5)/logoSize+.5;vec4 logo=texture2D(logoMap,logoUv);vec2 inside=step(vec2(0.),logoUv)*step(logoUv,vec2(1.));logo.a*=inside.x*inside.y;vec3 base=mix(background,logo.rgb,logo.a);vec3 particles=texture2D(tDiffuse,vUv).rgb;float coverage=clamp(texture2D(particleCoverage,vUv).a,0.,1.);gl_FragColor=vec4(base*(1.-coverage)+particles,1.);}`;
export class ParticleRenderer {
  webgl:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,.1,100);
  geometry=new THREE.BufferGeometry();tailGeometry=new THREE.BufferGeometry();material:THREE.ShaderMaterial;tailMaterial:THREE.ShaderMaterial;
  composer:EffectComposer;bloom:UnrealBloomPass;useBloom=true; ratio=1.35;bloomIntensity=.5;
  private tails:THREE.Points[]=[];
  private logoTexture:THREE.Texture;
  private logoComposite:ShaderPass;
  constructor(public sim:ParticleSimulation,host:HTMLElement){
    this.webgl=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    this.webgl.setClearColor(0x05080f);this.webgl.domElement.setAttribute('aria-label','Interactive glowing particle field');host.prepend(this.webgl.domElement);
    this.camera.position.z=16;
    this.logoTexture=new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}images/eis-logo.png`);
    this.logoTexture.colorSpace=THREE.SRGBColorSpace;
    this.geometry.setAttribute('position',new THREE.BufferAttribute(sim.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('seed',new THREE.BufferAttribute(sim.seeds,1));
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{c0:{value:new THREE.Color()},c1:{value:new THREE.Color()},c2:{value:new THREE.Color()},ratio:{value:this.ratio},opacity:{value:.62}},transparent:true,depthWrite:false,
      // Add luminous RGB while accumulating ordinary foreground opacity separately.
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneFactor,
      blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor,
    });
    const points=new THREE.Points(this.geometry,this.material);points.frustumCulled=false;this.scene.add(points);
    this.tailMaterial=this.material.clone();this.tailMaterial.uniforms.opacity.value=.085;
    for(let k=0;k<3;k++){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(sim.trails.subarray(k*MAX_PARTICLES*3,(k+1)*MAX_PARTICLES*3),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('seed',new THREE.BufferAttribute(sim.seeds,1));
      const t=new THREE.Points(g,this.tailMaterial);t.frustumCulled=false;this.tails.push(t);this.scene.add(t);
    }
    this.composer=new EffectComposer(this.webgl);
    const particlePass=new RenderPass(this.scene,this.camera);
    particlePass.clearColor=new THREE.Color(0x000000);particlePass.clearAlpha=0;
    this.composer.addPass(particlePass);
    // Bloom changes alpha, so preserve actual point/trail coverage before processing it.
    const coveragePass=new SavePass(new THREE.WebGLRenderTarget(1,1,{depthBuffer:false}));
    this.composer.addPass(coveragePass);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(640,360),.5,.5,.48);this.composer.addPass(this.bloom);
    this.logoComposite=new ShaderPass(new THREE.ShaderMaterial({
      uniforms:{tDiffuse:{value:null},particleCoverage:{value:coveragePass.renderTarget.texture},logoMap:{value:this.logoTexture},logoSize:{value:new THREE.Vector2(1,1)},background:{value:new THREE.Color(0x05080f)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:logoCompositeFragment,depthTest:false,depthWrite:false,
    }));
    this.composer.addPass(this.logoComposite);this.composer.addPass(new OutputPass());
    this.setPalette('Aurora');this.resize();
  }
  setPalette(p:Palette){const c=PALETTES[p];for(const m of [this.material,this.tailMaterial])c.forEach((v,i)=>m.uniforms[`c${i}`].value.setHex(v));}
  resize(){
    const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.sim.height=2*Math.tan(THREE.MathUtils.degToRad(21))*16;this.sim.width=this.sim.height*w/h;
    // Account for the supplied 1920×1080 PNG's transparent margins; preserve aspect.
    const logoAspect=1920/1080;
    const logoPixels=Math.min(w*.72,h*.65*logoAspect,Math.max(320,Math.min(560,w*.32)));
    this.logoComposite.uniforms.logoSize.value.set(logoPixels/w,logoPixels/logoAspect/h);
    const ratio=Math.min(devicePixelRatio,this.ratio);this.webgl.setPixelRatio(ratio);this.webgl.setSize(w,h);this.composer.setPixelRatio(ratio);this.composer.setSize(w,h);
    this.material.uniforms.ratio.value=ratio;this.tailMaterial.uniforms.ratio.value=ratio;
  }
  render(){
    this.geometry.setDrawRange(0,this.sim.count);this.geometry.attributes.position.needsUpdate=true;
    for(const t of this.tails){t.geometry.setDrawRange(0,this.sim.count);t.geometry.attributes.position.needsUpdate=true;}
    this.bloom.strength=this.bloomIntensity;
    this.bloom.enabled=this.useBloom&&this.bloomIntensity>.01;
    // Same logo compositing/color conversion at every quality and bloom setting.
    this.composer.render();
  }
  dispose(){this.logoTexture.dispose();this.geometry.dispose();this.tailGeometry.dispose();for(const t of this.tails)t.geometry.dispose();this.material.dispose();this.tailMaterial.dispose();for(const pass of this.composer.passes)pass.dispose();this.composer.dispose();this.webgl.dispose();this.webgl.domElement.remove();}
}
