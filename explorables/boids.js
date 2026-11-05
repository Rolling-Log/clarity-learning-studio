export function boidsScene(c){
 const {THREE:T,$,$$,scene,mat,mesh,line,text,cameraTo,actionIcon,metric,select}=c;
 const COUNT=96,LIMIT=3.6,RNG_SEED=3917;let randomState=RNG_SEED;
 function random(){randomState=(randomState*1664525+1013904223)>>>0;return randomState/4294967296;}
 let agents=[],rule=[true,true,true],radius=1.25,follow=true,elapsed=0,accumulator=0,order=0,neighbors=[],selected=0,frame=0;
 const normal=mat(0xaca0c0,.5,.35),highlight=mat(0x6354a5,.35,.3);
 const geometry=new T.ConeGeometry(.052,.19,3);geometry.rotateX(Math.PI/2);
 const flock=new T.InstancedMesh(geometry,normal,COUNT);flock.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(flock);
 const focusMesh=mesh(geometry,highlight);
 const halo=mesh(new T.SphereGeometry(1,24,16),new T.MeshBasicMaterial({color:0xa293c6,wireframe:true,transparent:true,opacity:.065,depthWrite:false}));
 const links=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x8a74b7,transparent:true,opacity:.23}));scene.add(links);
 const velocityArrow=new T.ArrowHelper(new T.Vector3(1,0,0),new T.Vector3(),.5,0x6354a5,.1,.05);scene.add(velocityArrow);
 const bounds=new T.Box3(new T.Vector3(-LIMIT,-LIMIT*.58,-LIMIT),new T.Vector3(LIMIT,LIMIT*.58,LIMIT));const box=new T.Box3Helper(bounds,0xc8bdd7);box.material.transparent=true;box.material.opacity=.3;scene.add(box);
 for(let i=-3;i<=3;i++){line([[-LIMIT,-LIMIT*.58,i],[LIMIT,-LIMIT*.58,i]],0xcdbfdb,scene,.25);line([[i,-LIMIT*.58,-LIMIT],[i,-LIMIT*.58,LIMIT]],0xcdbfdb,scene,.25);}
 function reset(){randomState=RNG_SEED;agents=Array.from({length:COUNT},()=>({p:new T.Vector3((random()-.5)*5.2,(random()-.5)*2.8,(random()-.5)*5.2),v:new T.Vector3(random()-.5,(random()-.5)*.55,random()-.5).normalize().multiplyScalar(.85)}));elapsed=0;accumulator=0;draw();}
 const glyphs=[
   'M9 12H3m3-3-3 3 3 3m9-3h6m-3-3 3 3-3 3',
   'M4 6h14m-2-2 2 2-2 2M6 12h14m-2-2 2 2-2 2M4 18h14m-2-2 2 2-2 2',
   'M3 12h6m-3-3 3 3-3 3m15-3h-6m3-3-3 3 3 3'
 ];
 const names=[['Separation','分离'],['Alignment','对齐'],['Cohesion','聚合']];
 $('#controls-area').innerHTML=`
   <div class="boids-lab">
     <div>
       <div class="rule-controls">${names.map((name,i)=>`
         <button type="button" class="rule-control" data-rule="${i}" aria-pressed="true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${glyphs[i]}"/></svg>
           <strong>${text(...name)}</strong><i class="rule-switch" aria-hidden="true"></i>
         </button>`).join('')}
       </div>
       <label class="label-row" for="perception-radius">${text('Perception radius','感知半径')}<output id="radius-value"></output></label>
       <input class="range" id="perception-radius" type="range" min=".45" max="2.5" value="1.25" step=".05">
       <div class="agent-legend"><span><i class="selected"></i>${text('Selected agent','选中个体')}</span><span><i></i>${text('Local neighbors','局部邻居')}</span></div>
     </div>
     <div class="metrics boids-metrics">${metric('order','heading agreement · 0–1','方向一致度 · 0–1')}${metric('neighbor-count','Neighbors','邻居')}${metric('agent-count','Agents','个体')}</div>
   </div>`;
 function ruleSet(index){rule[index]=!rule[index];$$('[data-rule]').forEach(b=>b.setAttribute('aria-pressed',String(rule[Number(b.dataset.rule)])));select('b'+(index+1),true);}
 $$('[data-rule]').forEach(b=>b.onclick=()=>ruleSet(Number(b.dataset.rule)));
 $('#perception-radius').oninput=e=>{radius=Number(e.target.value);select('b4',true);draw();};
 $('#view-options').innerHTML=`<button type="button" id="follow-agent" aria-pressed="true">${text('Inspect an agent','观察一个个体')}</button><button type="button" id="flock-view" aria-pressed="false">${text('Whole flock','整个群体')}</button>`;
 $('#follow-agent').onclick=()=>{follow=true;$('#follow-agent').setAttribute('aria-pressed','true');$('#flock-view').setAttribute('aria-pressed','false');select('b4',true);draw();};
 $('#flock-view').onclick=()=>{follow=false;$('#follow-agent').setAttribute('aria-pressed','false');$('#flock-view').setAttribute('aria-pressed','true');draw();};
 $('#reset-camera').insertAdjacentHTML('beforebegin',`<button class="round-button" type="button" id="reset-flock" aria-label="Reset flock">${actionIcon('reset')}</button><button class="round-button" type="button" id="step-flock" aria-label="Advance one step">${actionIcon('step')}</button>`);
 $('#reset-flock').onclick=reset;$('#step-flock').onclick=()=>{step(1/60);draw();};
 function displacement(a,b){const d=b.clone().sub(a);for(const axis of ['x','y','z']){const limit=axis==='y'?LIMIT*.58:LIMIT;if(d[axis]>limit)d[axis]-=limit*2;if(d[axis]<-limit)d[axis]+=limit*2;}return d;}
 function seen(a,b){const d=displacement(a.p,b.p),distance=d.length();return distance>0&&distance<radius&&a.v.dot(d)/(a.v.length()*distance)>-.70710678?{d,distance}:null;}
 const maxSpeed=1.25,maxForce=1.7;
 function steering(vector,velocity){if(!vector.lengthSq())return vector;return vector.normalize().multiplyScalar(maxSpeed).sub(velocity).clampLength(0,maxForce);}
 function step(dt){const accelerations=agents.map((a,i)=>{const separation=new T.Vector3(),alignment=new T.Vector3(),cohesion=new T.Vector3();let count=0;for(let j=0;j<agents.length;j++){if(j===i)continue;const n=seen(a,agents[j]);if(!n)continue;count++;alignment.add(agents[j].v);cohesion.add(n.d);if(n.distance<.52)separation.addScaledVector(n.d,-1/(n.distance*n.distance));}const force=new T.Vector3();if(count){if(rule[0])force.addScaledVector(steering(separation,a.v),1.8);if(rule[1])force.addScaledVector(steering(alignment.divideScalar(count),a.v),.8);if(rule[2])force.addScaledVector(steering(cohesion.divideScalar(count),a.v),.7);}return force.clampLength(0,maxForce*2);});agents.forEach((a,i)=>{a.v.addScaledVector(accelerations[i],dt);if(a.v.length()<.52)a.v.setLength(.52);if(a.v.length()>maxSpeed)a.v.setLength(maxSpeed);a.p.addScaledVector(a.v,dt);for(const axis of ['x','y','z']){const limit=axis==='y'?LIMIT*.58:LIMIT;if(a.p[axis]>limit)a.p[axis]-=limit*2;if(a.p[axis]<-limit)a.p[axis]+=limit*2;}});elapsed+=dt;}
 const dummy=new T.Object3D(),fwd=new T.Vector3(0,0,1),mean=new T.Vector3();let fallbackCanvas=null,fallbackContext=null;
 function draw(){if(!agents.length)return;const a=agents[selected];neighbors=[];const linkPositions=[];mean.set(0,0,0);agents.forEach((b,i)=>{dummy.position.copy(b.p);dummy.quaternion.setFromUnitVectors(fwd,b.v.clone().normalize());dummy.updateMatrix();flock.setMatrixAt(i,dummy.matrix);const neighbor=i!==selected&&seen(a,b);if(neighbor){neighbors.push(i);const end=a.p.clone().add(neighbor.d);linkPositions.push(...a.p.toArray(),...end.toArray());}flock.setColorAt(i,new T.Color(follow?(i===selected?0x6354a5:neighbor?0x9782b9:0xc5bdd0):0xa495ba));mean.add(b.v.clone().normalize());});order=mean.length()/COUNT;flock.instanceMatrix.needsUpdate=true;if(flock.instanceColor)flock.instanceColor.needsUpdate=true;focusMesh.position.copy(a.p);focusMesh.quaternion.setFromUnitVectors(fwd,a.v.clone().normalize());focusMesh.visible=follow;halo.visible=links.visible=velocityArrow.visible=follow;halo.position.copy(a.p);halo.scale.setScalar(radius);const old=links.geometry;links.geometry=new T.BufferGeometry();links.geometry.setAttribute('position',new T.Float32BufferAttribute(linkPositions,3));old.dispose();velocityArrow.position.copy(a.p);velocityArrow.setDirection(a.v.clone().normalize());$('#order').textContent=order.toFixed(2);$('#neighbor-count').textContent=String(neighbors.length);$('#agent-count').textContent=String(COUNT);$('#radius-value').textContent=radius.toFixed(2);c.root.dataset.order=order.toFixed(6);c.root.dataset.elapsed=elapsed.toFixed(3);if(fallbackContext)drawFallback();}
 function resetCamera(){cameraTo([6.6,4.2,8.5],[0,0,0]);}
 function update(dt){accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps<3){step(1/60);accumulator-=1/60;steps++;}if(steps||frame++%3===0)draw();}
 const ray=new T.Raycaster();let start=null;
 if(c.renderer){const el=c.renderer.domElement;el.addEventListener('pointerdown',e=>{start=[e.clientX,e.clientY]});el.addEventListener('pointerup',e=>{if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>4)return;const rect=el.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),c.camera);const hit=ray.intersectObject(flock)[0];if(hit&&hit.instanceId!==undefined){selected=hit.instanceId;follow=true;$('#follow-agent').setAttribute('aria-pressed','true');$('#flock-view').setAttribute('aria-pressed','false');select('b4',true);draw();}});}
 function translate(){draw();$('#reset-flock').title=$('#reset-flock').ariaLabel=c.t('Reset flock','重置群体');$('#step-flock').title=$('#step-flock').ariaLabel=c.t('Advance one step','前进一步');}
 function fallback(){fallbackCanvas=document.createElement('canvas');fallbackCanvas.className='fallback-art';fallbackCanvas.width=800;fallbackCanvas.height=420;fallbackContext=fallbackCanvas.getContext('2d');$('#viewport').append(fallbackCanvas);draw();}
 function drawFallback(){const g=fallbackContext;g.clearRect(0,0,800,420);agents.forEach((a,i)=>{const x=400+a.p.x*80,y=220+a.p.z*39;g.save();g.translate(x,y);g.rotate(Math.atan2(a.v.z,a.v.x));g.beginPath();g.moveTo(7,0);g.lineTo(-4,-3);g.lineTo(-4,3);g.closePath();g.fillStyle=i===selected?'#6354a5':'#ac9abd';g.fill();g.restore();});}
 reset();resetCamera();translate();
 return {update,resetCamera,reset,translate,fallback,state:()=>({rule:[...rule],radius,neighbors:[...neighbors],order,elapsed,selected,follow,positions:agents.map(a=>a.p.toArray()),velocities:agents.map(a=>a.v.toArray())})};
}
