import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {bicycleScene} from './bicycle.js';
import {flatlandScene} from './flatland.js';
import {boidsScene} from './boids.js';

const data=window.CLARITY_EXHIBIT, root=document.querySelector('#exhibit');
let language='en',selected=data.guide.nodes[0].id,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,zoom=1;
const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const translations={};
const t=(en,zh)=>{if(zh)translations[en]=zh;return language==='zh'?translations[en]||en:en;};
const text=(en,zh)=>`<span data-en="${esc(en)}" data-zh="${esc(zh)}">${t(en,zh)}</span>`;
function tell(action,id=selected){window.sendPrompt?.(JSON.stringify({action,id}));}
function select(id,notify=false){if(!data.guide.nodes.some(n=>n.id===id))return;selected=id;root.dataset.selected=id;$$('[data-node]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.node===id)));controller?.select?.(id);renderInsight();if(notify)tell('concept');}
function renderInsight(){const n=data.guide.nodes.find(n=>n.id===selected),i=data.guide.nodes.indexOf(n);$('#insight-num').textContent=String(i+1).padStart(2,'0');$('#insight-title').textContent=local(n.label);$('#insight-text').textContent=local(n.explanation);}
function local(str){return language==='zh'?(data.translations?.[str]||str):str;}
const titles={bicycle:['From pedal to pavement.','从脚踏到前进。'],flatland:['What if your world had one more dimension?','如果世界多一个维度？'],boids:['No leader. A shared direction.','没有领袖，也能同向。']};
const subtitles={bicycle:['Trace the mechanism. Change the gear.','看清传动过程，亲手改变挡位。'],flatland:['Explore the geometry — and the society that refuses to see it.','看见几何，也看见拒绝改变的社会。'],boids:['Change one local rule. Watch the whole flock respond.','改变一条局部规则，观察整个群体。']};
root.innerHTML=`<header class="exhibit-header"><div><h2>${text(...titles[data.id])}</h2><p>${text(...subtitles[data.id])}</p></div><button class="source-pill" id="exhibit-source" type="button">${text('Read source ↗','查看原文 ↗')}</button></header><div class="viewport-wrap"><div class="figure-top"><div class="segmented" id="view-options"></div><div class="figure-actions"><button class="round-button" id="reset-camera" type="button" aria-label="Reset view" title="Reset view">↺</button></div></div><div class="viewport" id="viewport" tabindex="0" role="img" aria-label="Interactive three-dimensional educational model"></div><div class="view-caption" id="view-caption"></div><div class="hotspots" id="hotspots"></div><div class="figure-bottom"><span>${text('DRAG TO ORBIT · SCROLL TO ZOOM','拖动旋转 · 滚轮缩放')}</span><button class="motion-button" id="motion-toggle" type="button"></button></div></div><div class="controls-area" id="controls-area"></div><nav class="story-rail" id="story-rail" aria-label="Guide chapters"></nav><div class="insight"><span class="insight-number" id="insight-num"></span><div><h3 id="insight-title"></h3><p id="insight-text"></p></div><button type="button" class="source-pill" id="insight-source">${text('Source ↗','原文 ↗')}</button></div><div id="after-insight"></div>`;
const view=$('#viewport'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.05,200);
camera.position.set(3,2.3,6);scene.add(new THREE.HemisphereLight(0xffffff,0xaca1bf,2.7));
const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(4,7,5);scene.add(key);
const rim=new THREE.DirectionalLight(0xb9b0dd,1.4);rim.position.set(-4,3,-4);scene.add(rim);
let renderer=null,controls=null;
try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;view.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=2.4;controls.maxDistance=15;controls.maxPolarAngle=Math.PI*.91;controls.target.set(0,0,0);root.dataset.renderer='webgl';}catch{root.dataset.renderer='diagram';}
function mat(color,roughness=.55,metalness=.15){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function mesh(geometry,material,parent=scene,position=[0,0,0]){const m=new THREE.Mesh(geometry,material);m.position.set(...position);parent.add(m);return m;}
function rod(a,b,r,material,parent=scene){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),material,parent);m.position.copy(va.add(vb).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
function line(points,color=0xa79ab8,parent=scene,opacity=.8){const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(m);return m;}
function cameraTo(pos,target=[0,0,0]){camera.position.set(...pos);if(controls){controls.target.set(...target);controls.update();}else camera.lookAt(...target);}
function views(items,onChange){$('#view-options').innerHTML=items.map(([id,en,zh],i)=>`<button type="button" data-view="${id}" aria-pressed="${i===0}">${text(en,zh)}</button>`).join('');$$('[data-view]').forEach(b=>b.onclick=()=>{$$('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));onChange(b.dataset.view);});}
function hotspot(id,point){const b=document.createElement('button');b.type='button';b.className='hotspot';b.dataset.node=id;b.textContent=String(data.guide.nodes.findIndex(n=>n.id===id)+1).padStart(2,'0');b.onclick=()=>select(id,true);$('#hotspots').append(b);return {id,point:new THREE.Vector3(...point),element:b};}
function info(en,zh){return `<details class="details-info"><summary aria-label="Model assumptions">i</summary><p>${text(en,zh)}</p></details>`;}
function metric(id,label,zh){return `<div class="metric"><strong id="${id}"></strong><small>${text(label,zh)}</small></div>`;}
let controller;
const ctx={THREE,data,root,$,$$,text,t,esc,scene,camera,renderer,controls,mat,mesh,rod,line,cameraTo,views,hotspot,info,metric,select,tell,play(){paused=false;updateMotion();},get language(){return language;},get paused(){return paused;},get zoom(){return zoom;}};
controller=({bicycle:bicycleScene,flatland:flatlandScene,boids:boidsScene}[data.id])(ctx);
$('#story-rail').innerHTML=data.guide.chapters.map((c,i)=>`<button type="button" data-node="${c.nodeIds[0]}"><b>${String(i+1).padStart(2,'0')}</b><span data-chapter="${i}"></span></button>`).join('');
$$('#story-rail button').forEach((b,index)=>b.onclick=()=>{select(b.dataset.node);window.sendPrompt?.(JSON.stringify({action:'chapter',index}));});
$('#exhibit-source').onclick=()=>tell('source');$('#insight-source').onclick=()=>tell('source');
$('#reset-camera').onclick=()=>controller.resetCamera();
function pause(){paused=!paused;updateMotion();}
function updateMotion(){$('#motion-toggle').textContent=paused?t('▶ Play model','▶ 播放模型'):t('Ⅱ Pause model','Ⅱ 暂停模型');$('#motion-toggle').setAttribute('aria-pressed',String(paused));root.dataset.paused=String(paused);}
$('#motion-toggle').onclick=pause;
function translate(){document.documentElement.lang=language==='zh'?'zh-CN':'en';$$('[data-en]').forEach(e=>e.textContent=language==='zh'?e.dataset.zh:e.dataset.en);$$('[data-chapter]').forEach(e=>e.textContent=local(data.guide.chapters[Number(e.dataset.chapter)].title));$$('.hotspot').forEach(b=>b.setAttribute('aria-label',local(data.guide.nodes.find(n=>n.id===b.dataset.node).label)));$('#reset-camera').setAttribute('aria-label',t('Reset view','重置视角'));$('#reset-camera').title=t('Reset view','重置视角');view.setAttribute('aria-label',t('Interactive 3D model. Drag or use arrow keys to orbit.','交互三维模型，可拖动或用方向键旋转。'));controller.translate?.();renderInsight();updateMotion();reportSize();}
let previousHeight=0;
function reportSize(){requestAnimationFrame(()=>{const height=Math.ceil(root.getBoundingClientRect().height)+5;if(height!==previousHeight){previousHeight=height;parent.postMessage({type:'clarity:guide-size',height},'*');}});}
function resize(){const width=view.clientWidth,height=view.clientHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer?.setSize(width,height);controller.resize?.(width,height);reportSize();}
new ResizeObserver(resize).observe(view);new ResizeObserver(reportSize).observe(root);
window.addEventListener('message',e=>{if(e.source!==parent)return;const d=e.data;if(d?.type==='clarity:select')select(d.id);if(d?.type==='clarity:language'){const next=d.language==='zh'?'zh':'en';if(next!==language){language=next;translate();}}if(d?.type==='clarity:zoom'&&Number.isFinite(d.zoom)){zoom=Math.max(.7,Math.min(1.6,d.zoom));camera.zoom=zoom;camera.updateProjectionMatrix();}});
view.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();pause();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const target=controls?.target||new THREE.Vector3();const delta=camera.position.clone().sub(target),s=new THREE.Spherical().setFromVector3(delta);s.theta+=(e.key==='ArrowLeft'?.12:e.key==='ArrowRight'?-.12:0);s.phi=Math.max(.15,Math.min(2.9,s.phi+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0)));camera.position.copy(new THREE.Vector3().setFromSpherical(s).add(target));camera.lookAt(target);controls?.update();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=root.querySelector('details[open]');if(open)open.open=false;else parent.postMessage({type:'clarity:escape'},'*');}});
let last=performance.now(),frameCount=0;
document.addEventListener('visibilitychange',()=>{last=performance.now();});
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;if(document.hidden)return;controls?.update();controller.update?.(paused?0:dt,now);controller.hotspots?.forEach(h=>{const p=h.point.clone().project(camera);h.element.style.left=((p.x+1)*50)+'%';h.element.style.top=((1-p.y)*50)+'%';h.element.hidden=!renderer||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;});renderer?.render(scene,camera);frameCount++;root.dataset.frames=String(frameCount);}
if(!renderer){const n=document.createElement('div');n.className='fallback-notice';n.innerHTML=text('3D unavailable · diagram view','三维不可用 · 图解视图');view.parentElement.append(n);controller.fallback?.();}
controller.resetCamera();select(selected);translate();resize();requestAnimationFrame(animate);
window.__CLARITY_MODEL__={id:data.id,get state(){return controller.state?.();},select,pause,reset:()=>controller.reset?.(),step:()=>controller.update?.(1/60,performance.now())};
