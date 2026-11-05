import { createHash, randomUUID } from 'node:crypto';
import catalogue from '../../prepared/catalogue.json' with { type: 'json' };
import { askLive, liveId, LiveError, publicSession, readAudio, readSession, retrySession, runtime, startSession } from '../lib/live.mjs';
import { renderGuide } from '../lib/visual-renderer.mjs';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(statusCode,value)=>({statusCode,headers,body:JSON.stringify(value)});
const invalid=(message)=>json(422,{detail:message});
const paused=()=>json(403,{detail:{code:'live_generation_paused',message:"Live generation isn't enabled yet. You can explore the sample now."}});
const canonicalHash=text=>createHash('sha256').update(text.normalize('NFKC').replace(/\s+/gu,'').toLowerCase()).digest('hex');

function sessionFor(id){
  const match=/^([a-f0-9]{32})(?:-(text|file))?$/.exec(id);
  if(!match||!catalogue.sessions[match[1]]) return null;
  const value=structuredClone(catalogue.sessions[match[1]]);
  value.id=id;
  if(match[2]) value.inputType=match[2];
  return value;
}

const handle = createHandler();

export default async function handler(request, context) {
  const result = await handle({
    path:new URL(request.url).pathname, httpMethod:request.method, ip:context.ip,
    headers:Object.fromEntries(request.headers),
    body:request.method === 'POST' ? await request.text() : undefined
  });
  return new Response(result.isBase64Encoded ? Buffer.from(result.body,'base64') : result.body,
    {status:result.statusCode,headers:result.headers});
}

export function createHandler(servicesFor = runtime, hasModel = () => Boolean(process.env.DEEPSEEK_API_KEY)) {
  return async function handle(event) {
    try {
      return await routeRequest(event,servicesFor,hasModel);
    } catch (error) {
      if (error instanceof LiveError) return json(error.status,{detail:{code:error.code,message:error.message}});
      if (error.code === 'model_limit') return json(429,{detail:'The model service has reached its limit. Try again later.'});
      console.error('Clarity API request failed', error.name, Number.isInteger(error.status) ? error.status : '');
      return json(503,{detail:'The service is busy. Try again.'});
    }
  };
}

async function routeRequest(event,servicesFor,hasModel){
  const route=(event.path||'').replace(/^\/(?:api\/clarity|\.netlify\/functions\/clarity)\/?/,'/').replace(/\/$/,'')||'/';
  const method=event.httpMethod||'GET';
  let body={};
  if(method==='POST'){
    if((event.body||'').length>3000000) return json(413,{detail:'The request is too large.'});
    try {body=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):(event.body||'{}'));}
    catch{return json(400,{detail:'Invalid JSON.'});}
    if(!body||typeof body!=='object'||Array.isArray(body)) return invalid('A JSON object is required.');
  }
  if(route==='/health'&&method==='GET') {
    const live=hasModel();
    return json(200,{
      status:'ready',notebookAvailable:false,rendererAvailable:true,modelConfigured:live,
      textProvider:live?'deepseek':null,speechProvider:live?'espeak-ng':'prepared-local-system-voice',
      paidGenerationEnabled:live,deploymentMode:live?'live':'reviewed-examples',integrations:['Open Intelligent UI'],
      sourceProvenance:'Reviewed examples exported from the local Open Notebook / OIUI workflow'
    });
  }
  if(route==='/sessions'&&method==='GET') return json(200,[]);
  if(route==='/sessions'&&method==='POST'){
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>500000) return invalid('Add text under 500,000 characters.');
    if(!['quick','deep'].includes(body.mode)) return invalid('Choose Quick Overview or Deep Dive.');
    if(body.inputType&&!['text','file'].includes(body.inputType)) return invalid('Choose a valid source type.');
    const id=catalogue.sourceHashes[canonicalHash(body.text)]?.[body.mode];
    if(!id) {
      if(body.sample||body.sampleId) return invalid('This source does not match the prepared example.');
      const services=servicesFor(event);
      return services?json(202,publicSession(await startSession(services,body))):paused();
    }
    const value=sessionFor(id+'-'+(body.inputType||'text'));
    if(body.sampleId&&body.sampleId!==value.sampleId) return invalid('This source does not match the prepared example.');
    return json(202,value);
  }
  const match=/^\/sessions\/([^/]+)(?:\/(guide|audio|ask|retry))?$/.exec(route);
  if(!match) return json(404,{detail:'Endpoint not found.'});
  const [,sid,part]=match;
  const value=sessionFor(match[1]);
  if(part==='ask'&&method==='POST'){
    if(typeof body.question!=='string'||!body.question.trim()||body.question.length>2000) return invalid('Write a question under 2,000 characters.');
    if(body.chapterIndex!==undefined&&(!Number.isInteger(body.chapterIndex)||body.chapterIndex<0||body.chapterIndex>12)) return invalid('Choose a valid chapter.');
    if(body.conceptId!=null&&(typeof body.conceptId!=='string'||body.conceptId.length>40)) return invalid('Select a concept from this guide.');
  }
  if(!value) return handleLiveSession(event,servicesFor,sid,part,method,body);
  if(!part&&method==='GET'||part==='retry'&&method==='POST') return json(part?202:200,value);
  if((part==='guide'||part==='audio')&&method==='GET') return {
    statusCode:302,headers:{Location:part==='guide'?'/prepared/'+value.sampleId+'.html':value.audio.url,'Cache-Control':'no-store'},body:''
  };
  if(part==='ask'&&method==='POST'){
    const chapter=Math.min(body.chapterIndex||0,value.guide.chapters.length-1);
    const node=body.conceptId?value.guide.nodes.find(n=>n.id===body.conceptId):value.guide.nodes.find(n=>n.chapterIndex===chapter)||value.guide.nodes[0];
    if(!node) return invalid('Select a concept from this guide.');
    const query=body.question.toLowerCase();
    const example=/example|例子|举例/.test(query);
    const explain=/simple|explain|what|how|why|mean|解释|什么|为何|怎么/.test(query);
    const answer=example?node.example||node.explanation:explain?node.explanation:'Choose a question above.';
    return json(200,{id:randomUUID(),question:body.question,answer,sourceIds:example||explain?node.sourceIds:[],conceptId:node.id,contextLabel:node.label,sample:true,createdAt:Date.now()/1000});
  }
  return json(405,{detail:'Method not allowed.'});
}

async function handleLiveSession(event,servicesFor,sid,part,method,body) {
  const missing=()=>json(404,{detail:'Learning session not found.'});
  if(!liveId.test(sid)) return missing();
  const services=servicesFor(event);
  if(!services) return missing();
  const record=await readSession(services.store,sid);
  if(!record) return missing();
  const session=record.data;
  if(!part&&method==='GET') return json(200,publicSession(session));
  if(part==='retry'&&method==='POST') return json(202,publicSession(await retrySession(services,record)));
  if(part==='audio'&&method==='GET'){
    if(!session.audio) return json(409,{detail:'The podcast is not ready yet.'});
    return await readAudio(services.store,session,event.headers?.range)||missing();
  }
  if(part==='guide'&&method==='GET'){
    if(!session.guide) return json(409,{detail:'The visual guide is not ready yet.'});
    return {statusCode:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox allow-scripts",
      'Referrer-Policy':'no-referrer'},body:renderGuide(session.guide)};
  }
  if(part==='ask'&&method==='POST'){
    if(!session.guide) return json(409,{detail:'The guide is not ready yet.'});
    return json(200,await askLive(services,session,body));
  }
  return json(405,{detail:'Method not allowed.'});
}
