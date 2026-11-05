export function bicycleScene(c){
 const {THREE:T,$,$$,text,scene,mat,mesh,rod,line,cameraTo,views,hotspot,info,metric,select}=c;
 const model=new T.Group();scene.add(model);
 const paint=mat(0x7763ac,.36,.35),metal=mat(0xc6c0cc,.3,.75),dark=mat(0x45404e,.68,.1),rubber=mat(0x39353f,.9,0),saddle=mat(0x4c435a,.6,.05),accent=mat(0x8c72c2,.4,.35);
 const frame=new T.Group(),drive=new T.Group(),controls=new T.Group();model.add(frame,drive,controls);
 const rear=[-1.14,-.33,0],front=[1.14,-.33,0],bb=[-.25,-.38,0],seat=[-.47,.68,0],head=[.63,.64,0],lower=[.75,.27,0];
 function wheel(position){const g=new T.Group();g.position.set(...position);model.add(g);mesh(new T.TorusGeometry(.708,.034,9,80),rubber,g);mesh(new T.TorusGeometry(.67,.013,7,80),metal,g);mesh(new T.TorusGeometry(.716,.003,5,80),dark,g);const hub=mesh(new T.CylinderGeometry(.053,.053,.19,16),metal,g);hub.rotation.x=Math.PI/2;for(let i=0;i<28;i++){const a=i*Math.PI*2/28;rod([0,0,(i%2?1:-1)*.065],[Math.cos(a)*.661,Math.sin(a)*.661,0],.0031,metal,g);}return g;}
 const rw=wheel(rear),fw=wheel(front);
 [[seat,head],[seat,bb],[bb,lower],[head,lower]].forEach(([a,b])=>rod(a,b,.045,paint,frame));
 for(const z of [-.12,.12]){rod([rear[0],rear[1],z],[bb[0],bb[1],z*.3],.024,paint,frame);rod([rear[0],rear[1],z],seat,.023,paint,frame);rod([lower[0],lower[1],z*.7],[front[0],front[1],z],.029,paint,frame);}
 rod([-.47,.68,0],[-.51,.88,0],.025,metal,frame);const seatMesh=mesh(new T.SphereGeometry(1,24,12),saddle,frame,[-.54,.9,0]);seatMesh.scale.set(.25,.05,.12);
 rod(head,[.57,.88,0],.024,metal,controls);rod([.57,.88,0],[.81,.91,0],.023,dark,controls);rod([.81,.91,-.32],[.81,.91,.32],.022,metal,controls);rod([.81,.91,-.37],[.81,.91,-.2],.03,dark,controls);rod([.81,.91,.2],[.81,.91,.37],.03,dark,controls);
 for(const z of [-.27,.27]){rod([.81,.9,z],[.91,.75,z],.012,dark,controls);line([[.91,.75,z],[.91,.65,z],[.68,.48,z],[.94,.26,z]],0x73687f,controls);}
 for(const x of [-1.14,1.14]){rod([x-.08,.39,-.09],[x+.08,.39,.09],.019,metal,controls);mesh(new T.BoxGeometry(.085,.035,.04),rubber,controls,[x-.065,.34,.04]);mesh(new T.BoxGeometry(.085,.035,.04),rubber,controls,[x+.065,.34,-.04]);}
 function cog(teeth,r,parent,pos,material){const shape=new T.Shape();for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2,rad=r*(i%4<2?1:.91);const x=Math.cos(a)*rad,y=Math.sin(a)*rad;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();const hole=new T.Path();hole.absarc(0,0,r*.24,0,Math.PI*2,true);shape.holes.push(hole);return mesh(new T.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:false}),material,parent,pos);}
 const crank=new T.Group();crank.position.set(bb[0],bb[1],.23);drive.add(crank);cog(42,.211,crank,[0,0,0],metal);rod([-.275,0,.025],[.275,0,.025],.018,dark,crank);const pedals=[];
 for(const sign of [-1,1]){const p=mesh(new T.BoxGeometry(.135,.045,.14),dark,crank,[sign*.275,0,.085]);pedals.push(p);}
 const teeth=[28,24,22,20,18,16,14],cassette=[];
 for(let i=0;i<7;i++)cassette.push(cog(teeth[i],teeth[i]*.005,drive,[rear[0],rear[1],.13+i*.015],i===0?accent:metal));
 const derailleur=new T.Group();derailleur.position.set(rear[0]+.02,rear[1]-.2,.19);drive.add(derailleur);rod([0,.1,0],[.13,-.15,0],.023,dark,derailleur);for(const [x,y]of[[0,0],[.13,-.15]]){const g=cog(10,.048,derailleur,[x,y,0],dark);}
 let chain=null,chainCurve=null,links=null,gear=0,cadence=60,phase=0,category='whole';
 function chainPath(){if(chain){drive.remove(chain,links);chain.geometry.dispose();links.geometry.dispose();links.material.dispose();}
   const left=new T.Vector3(rear[0],rear[1],.13+gear*.015+.012),right=new T.Vector3(bb[0],bb[1],.243),rl=teeth[gear]*.005,rr=.211,axis=Math.atan2(right.y-left.y,right.x-left.x),theta=Math.acos((rl-rr)/Math.hypot(right.x-left.x,right.y-left.y));const top=axis+theta,bottom=axis-theta,points=[];
   // Rear arc (upper -> rear -> lower), then front arc (lower -> front -> upper).
   for(let i=0;i<=35;i++){const a=top+(bottom+Math.PI*2-top)*i/35;points.push(new T.Vector3(left.x+rl*Math.cos(a),left.y+rl*Math.sin(a),left.z));}
   for(let i=0;i<=45;i++){const a=bottom+(top-bottom)*i/45;points.push(new T.Vector3(right.x+rr*Math.cos(a),right.y+rr*Math.sin(a),right.z));}
   chainCurve=new T.CatmullRomCurve3(points,true,'centripetal');chain=mesh(new T.TubeGeometry(chainCurve,160,.008,5,true),dark,drive);
   links=new T.InstancedMesh(new T.SphereGeometry(.012,5,4),mat(0xb5a4d0,.4,.5),84);drive.add(links);
 }
 chainPath();
 // A soft ground disc anchors the physical object without a heavy box.
 const floor=mesh(new T.CircleGeometry(2.3,80),new T.MeshBasicMaterial({color:0xe8e2ef,transparent:true,opacity:.42}),scene,[0,-1.095,0]);floor.rotation.x=-Math.PI/2;
 for(let i=0;i<3;i++)line([[-2,-1.09,(i-1)*.7],[2,-1.09,(i-1)*.7]],0xd3c9df,scene,.35);
 const hotspots=[hotspot('c1',[bb[0]+.2,bb[1],.34]),hotspot('c2',[-.63,-.15,.3]),hotspot('c3',[-1.15,-.27,.3]),hotspot('c4',[-1.01,-.68,.27]),hotspot('c5',[.15,.64,0]),hotspot('c6',[.83,.88,.29])];
 $('#controls-area').innerHTML=`<div class="lab-grid"><div><h3 class="lab-title">${text('Feel the gearing','亲手改变传动比')}${info('42 front teeth · 7 rear sprockets · 2.1 m wheel circumference. Ideal, engaged drivetrain with no losses or slip. The 3D geometry is illustrative.','前牙盘 42 齿 · 7 片后齿轮 · 轮周长 2.1 米。理想啮合，无损耗或打滑；三维几何用于示意。')}</h3><div class="label-row"><span>${text('Rear sprocket','后齿片')}</span><output id="rear-teeth"></output></div><div class="gears">${teeth.map((n,i)=>`<button type="button" data-gear="${i}" aria-label="${n} teeth" aria-pressed="${i===0}">${i+1}</button>`).join('')}</div><div class="range-labels"><span>${text('Easier to turn','更省力')}</span><span>${text('Farther per turn','每圈更远')}</span></div><div class="compact-control"><label class="label-row" for="cadence"><span>${text('Cadence','踏频')}</span><output id="cadence-value"></output></label><input class="range" type="range" id="cadence" min="30" max="100" value="60" step="1"></div></div><div class="metrics">${metric('ratio','wheel turns / pedal turn','车轮圈数 / 踩踏一圈')}${metric('distance','metres / pedal turn','米 / 踩踏一圈')}${metric('speed','km/h · ideal model','千米/小时 · 理想模型')}</div></div>`;
 function modelValues(){const ratio=42/teeth[gear],distance=ratio*2.1,speed=cadence*distance*.06;$('#rear-teeth').textContent=teeth[gear]+(c.language==='zh'?' 齿':' teeth');$('#cadence-value').textContent=cadence+' rpm';$('#ratio').textContent=ratio.toFixed(2)+'×';$('#distance').textContent=distance.toFixed(2);$('#speed').textContent=speed.toFixed(1);c.root.dataset.ratio=String(ratio);c.root.dataset.speed=String(speed);cassette.forEach((m,i)=>m.material=i===gear?accent:metal);}
 $$('[data-gear]').forEach(b=>b.onclick=()=>{gear=Number(b.dataset.gear);$$('[data-gear]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));chainPath();modelValues();select('c3',true);});
 $('#cadence').oninput=e=>{cadence=Number(e.target.value);modelValues();};
 frame.traverse(o=>{if(o.isMesh)o.material=o.material.clone();});
 function setCategory(id){category=id;frame.traverse(o=>{if(o.isMesh){o.material.transparent=true;o.material.opacity=id==='drive'?.22:1;}});if(id==='drive')cameraTo([.3,.8,3.6],[-.68,-.3,.15]);else if(id==='controls')cameraTo([3,1.4,4.3],[.65,.5,0]);else resetCamera();}
 views([['whole','Whole bicycle','整车'],['drive','Drivetrain','传动'],['controls','Controls','控制']],setCategory);
 function resetCamera(){cameraTo([2.6,1.3,5.0],[0,-.02,0]);}
 const dummy=new T.Object3D();
 function update(dt){phase+=dt*cadence/60*Math.PI*2;crank.rotation.z=-phase;pedals.forEach(p=>p.rotation.z=phase);rw.rotation.z=fw.rotation.z=-phase*42/teeth[gear];cassette.forEach(m=>m.rotation.z=rw.rotation.z);if(links)for(let i=0;i<84;i++){const u=((i/84+phase*.211/chainCurve.getLength())%1+1)%1;dummy.position.copy(chainCurve.getPointAt(u));dummy.updateMatrix();links.setMatrixAt(i,dummy.matrix);}if(links)links.instanceMatrix.needsUpdate=true;}
 async function fallback(){const art=document.createElement('div');art.className='fallback-art';art.innerHTML='<svg viewBox="0 0 700 360" style="width:100%;height:100%"><g fill="none" stroke="#71628d" stroke-width="4"><circle cx="180" cy="238" r="81"/><circle cx="521" cy="238" r="81"/><path d="m180 238 106-140 67 140H180l229-140 112 140M286 98h123M353 238l-67-140m123 0 19-35h43"/><circle cx="353" cy="238" r="25"/><path d="m353 238 34 19"/></g></svg>';$('#viewport').prepend(art);hotspots.forEach(h=>h.element.hidden=true);}
 return {hotspots,resetCamera,update,translate:modelValues,select(){},fallback,state:()=>({gear:gear+1,teeth:teeth[gear],ratio:42/teeth[gear],cadence,crankAngle:phase,wheelAngle:phase*42/teeth[gear],category})};
}
