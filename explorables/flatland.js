export function flatlandScene(c){
 const {THREE:T,$,$$,scene,mat,mesh,line,rod,text,views,cameraTo,metric,select}=c;
 let height=.45,time=.45,auto=false,view='space',section=1,focus='f1';
 const planeMaterial=new T.MeshStandardMaterial({color:0xd8cfe9,roughness:.8,side:T.DoubleSide,transparent:true,opacity:.46,depthWrite:false});
 const plane=mesh(new T.PlaneGeometry(5.5,3.8),planeMaterial);plane.rotation.x=-Math.PI/2;
 for(let i=-5;i<=5;i++)line([[-2.75,.003,i*.34],[2.75,.003,i*.34]],0xc7bbd9,scene,.3);
 for(let i=-8;i<=8;i++)line([[i*.34,.003,-1.85],[i*.34,.003,1.85]],0xc7bbd9,scene,.3);
 const sphereGroup=new T.Group();sphereGroup.position.x=.35;scene.add(sphereGroup);
 const glass=new T.MeshStandardMaterial({color:0xa99bd0,roughness:.3,metalness:.18,transparent:true,opacity:.27,side:T.FrontSide,depthWrite:false});
 const sphere=mesh(new T.SphereGeometry(1,48,32),glass,sphereGroup);
 const wireMat=new T.LineBasicMaterial({color:0x9b87be,transparent:true,opacity:.38});
 for(let latitude=-2;latitude<=2;latitude++){const h=latitude*.33,r=Math.sqrt(1-h*h),p=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;p.push(new T.Vector3(Math.cos(a)*r,h,Math.sin(a)*r));}sphereGroup.add(new T.Line(new T.BufferGeometry().setFromPoints(p),wireMat));}
 for(let longitude=0;longitude<5;longitude++){const angle=longitude/5*Math.PI,p=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;p.push(new T.Vector3(Math.cos(a)*Math.cos(angle),Math.sin(a),Math.cos(a)*Math.sin(angle)));}sphereGroup.add(new T.Line(new T.BufferGeometry().setFromPoints(p),wireMat));}
 const intersection=mesh(new T.CircleGeometry(1,96),new T.MeshBasicMaterial({color:0x8c72bc,transparent:true,opacity:.24,side:T.DoubleSide,depthWrite:false}),scene,[.35,.013,0]);intersection.rotation.x=-Math.PI/2;
 const outline=mesh(new T.TorusGeometry(1,.012,8,96),mat(0x6354a5,.4,.2),scene,[.35,.018,0]);outline.rotation.x=Math.PI/2;
 const pole=line([[.35,-1.5,0],[.35,1.9,0]],0xb5a6c9,scene,.4);
 const center=mesh(new T.SphereGeometry(.027,12,8),mat(0x6354a5),sphereGroup);
 const resident=mesh(new T.BoxGeometry(.38,.025,.38),mat(0x66568d,.5,.15),scene,[-1.4,.025,.5]);resident.rotation.y=Math.PI/5;
 const eye=mesh(new T.SphereGeometry(.045,14,8),mat(0xf7f3ff),scene,[-1.2,.05,.58]);
 line([[-1.18,.025,.58],[.35,.025,0]],0x9b8ab6,scene,.5);
 const social=new T.Group();scene.add(social);social.visible=false;
 for(let j=0;j<5;j++){const n=[3,4,5,6,40][j],shape=new T.Shape();for(let k=0;k<=n;k++){const a=k/n*Math.PI*2,x=Math.cos(a)*.23,y=Math.sin(a)*.23;if(k===0)shape.moveTo(x,y);else shape.lineTo(x,y);}const m=mesh(new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false}),mat(j===4?0x6354a5:0x9c8cb8),social,[-1.8+j*.9,.04,1.25]);m.rotation.x=-Math.PI/2;}
 $('#viewport').insertAdjacentHTML('afterend',`<div class="flatland-observation"><strong>${text('Inside the plane','在平面内观察')}</strong><svg viewBox="0 0 150 65" aria-hidden="true"><path d="M10 39h130" stroke="#d8cee5" stroke-width="1"/><path id="resident-line" d="M36 37h78" stroke="#6354a5" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="37" r="3" fill="#8d7aaa"/><path d="m16 31 9 6-9 6" stroke="#b7a7cb" fill="none"/></svg></div>`);
 $('#controls-area').innerHTML=`<div class="lab-grid"><div><label class="label-row" for="sphere-height"><span>${text('Sphere height · h','球心高度 · h')}</span><output id="height-value"></output></label><input class="range" id="sphere-height" type="range" min="-1.35" max="1.35" value=".45" step=".01"><div class="range-labels"><span>−1.35</span><span>0</span><span>+1.35</span></div><button type="button" id="cross-plane" class="source-pill" style="margin-top:12px">${text('▶ Move through the plane','▶ 穿过平面')}</button></div><div class="metrics">${metric('section-radius','section radius · r','截面半径 · r')}${metric('section-equation','r² + h² = 1 · |h| ≤ 1','r² + h² = 1 · |h| ≤ 1')}</div></div>`;
 $('#book-details').innerHTML=`<details class="book-index" id="book-index"><summary>${text('The whole book · 22 sections','整本书 · 22 节')}</summary><div class="section-grid">${c.data.sections.map(s=>`<button type="button" data-section="${s.number}" aria-pressed="${s.number===1}"><span>${String(s.number).padStart(2,'0')}</span>${text(s.title,s.zh)}</button>`).join('')}</div><p class="section-preview" id="section-preview"></p></details>`;
 function updateValues(){const r=Math.sqrt(Math.max(0,1-height*height)),visible=Math.abs(height)<=1;sphereGroup.position.y=height;intersection.visible=outline.visible=visible;intersection.scale.setScalar(Math.max(r,.001));outline.scale.setScalar(Math.max(r,.001));$('#height-value').textContent=(height>=0?'+':'')+height.toFixed(2);$('#sphere-height').value=height;$('#section-radius').textContent=visible?r.toFixed(3):'—';$('#section-equation').textContent=visible?`${r.toFixed(2)}² + ${height.toFixed(2)}²`:c.t('No intersection','没有交集');const width=visible?r*96:0;$('#resident-line').setAttribute('d',`M${85-width/2} 37h${width}`);c.root.dataset.height=height.toFixed(4);c.root.dataset.radius=r.toFixed(6);}
 $('#sphere-height').oninput=e=>{height=Number(e.target.value);auto=false;updateValues();select('f4',true);};
 $('#cross-plane').onclick=()=>{auto=!auto;time=-Math.PI/2;if(auto)c.play();select('f4',true);$('#cross-plane').setAttribute('aria-pressed',String(auto));};
 function updateViewButtons(){$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
 function setView(id){view=id;if(id==='section')cameraTo([.35,5.2,.002],[.35,0,0]);else if(id==='eye')cameraTo([-1.9,.07,3.5],[.1,.04,0]);else resetCamera();sphereGroup.visible=id!=='section';updateViewButtons();}
 views([['space','3D world','三维世界'],['section','2D section','二维截面'],['eye','Eye level','平面内']],setView);
 function sectionFocus(n,notify=false){section=n;$$('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.section)===n)));const id=n<=2?'f1':n<=12?'f2':n<=14?'f3':n<=17?'f4':n<=20?'f5':'f6';if(notify)select(id,true);const s=c.data.sections[n-1];$('#section-preview').innerHTML=`${text('Section','第')} ${n} · ${text(s.title,s.zh)} <button type="button" id="read-section">${text('Read section ↗','阅读本节 ↗')}</button>`;$('#read-section').onclick=()=>window.sendPrompt?.(JSON.stringify({action:'section',section:n}));}
 $$('[data-section]').forEach(b=>b.onclick=()=>sectionFocus(Number(b.dataset.section),true));
 function resetCamera(){cameraTo([3,2.6,4.6],[0,.22,0]);}
 function update(dt){if(auto&&dt){time+=dt*.64;height=Math.sin(time)*1.34;updateValues();if(time>=Math.PI/2){auto=false;$('#cross-plane').setAttribute('aria-pressed','false');}}}
 function choose(id){focus=id;social.visible=id==='f2';resident.visible=id!=='f2';if(id==='f3')setView('eye');else if(view==='eye'&&id!=='f1')setView('space');}
 function translate(){updateValues();sectionFocus(section);updateViewButtons();}
 function fallback(){const d=document.createElement('div');d.className='fallback-art';d.innerHTML='<svg viewBox="0 0 600 420" style="width:100%;height:100%"><path d="m70 264 252-64 224 65-254 69Z" stroke="#b6a5ca" fill="#e4dcec"/><circle cx="308" cy="180" r="95" fill="#bcb0d650" stroke="#a392c0"/><ellipse cx="308" cy="267" rx="85" ry="24" fill="#9b85c080" stroke="#6354a5"/></svg>';$('#viewport').append(d);}
 sectionFocus(1);updateValues();setView('space');
 return {resetCamera,update,select:choose,translate,fallback,state:()=>({height,radius:Math.sqrt(Math.max(0,1-height*height)),intersects:Math.abs(height)<=1,view,section,focus,auto})};
}
