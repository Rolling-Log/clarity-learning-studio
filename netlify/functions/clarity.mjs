// Hosted review mode. No provider credentials, model clients or billable calls.
import { createHash, randomUUID } from 'node:crypto';
import catalogue from '../../prepared/catalogue.json' with { type: 'json' };

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

export async function handler(event){
  const route=(event.path||'').replace(/^\/(?:api\/clarity|\.netlify\/functions\/clarity)\/?/,'/').replace(/\/$/,'')||'/';
  const method=event.httpMethod||'GET';
  let body={};
  if(method==='POST'){
    if((event.body||'').length>3000000) return json(413,{detail:'The request is too large.'});
    try {body=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):(event.body||'{}'));}
    catch{return json(400,{detail:'Invalid JSON.'});}
    if(!body||typeof body!=='object'||Array.isArray(body)) return invalid('A JSON object is required.');
  }
  if(route==='/health'&&method==='GET') return json(200,{
    status:'ready',notebookAvailable:false,rendererAvailable:true,modelConfigured:false,
    textProvider:null,speechProvider:'prepared-local-system-voice',paidGenerationEnabled:false,
    deploymentMode:'reviewed-examples',integrations:['Open Intelligent UI'],
    sourceProvenance:'Reviewed examples exported from the local Open Notebook / OIUI workflow'
  });
  if(route==='/sessions'&&method==='GET') return json(200,[]);
  if(route==='/sessions'&&method==='POST'){
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>500000) return invalid('Add text under 500,000 characters.');
    if(!['quick','deep'].includes(body.mode)) return invalid('Choose Quick Overview or Deep Dive.');
    if(body.inputType&&!['text','file'].includes(body.inputType)) return invalid('Choose a valid source type.');
    const id=catalogue.sourceHashes[canonicalHash(body.text)]?.[body.mode];
    if(!id) return body.sample||body.sampleId?invalid('This source does not match the prepared example.'):paused();
    const value=sessionFor(id+'-'+(body.inputType||'text'));
    if(body.sampleId&&body.sampleId!==value.sampleId) return invalid('This source does not match the prepared example.');
    return json(202,value);
  }
  const match=/^\/sessions\/([^/]+)(?:\/(guide|audio|ask|retry))?$/.exec(route);
  if(!match) return json(404,{detail:'Endpoint not found.'});
  const value=sessionFor(match[1]);
  if(!value) return json(404,{detail:'Learning session not found.'});
  const part=match[2];
  if(!part&&method==='GET'||part==='retry'&&method==='POST') return json(part?202:200,value);
  if((part==='guide'||part==='audio')&&method==='GET') return {
    statusCode:302,headers:{Location:part==='guide'?'/prepared/'+value.sampleId+'.html':value.audio.url,'Cache-Control':'no-store'},body:''
  };
  if(part==='ask'&&method==='POST'){
    if(typeof body.question!=='string'||!body.question.trim()||body.question.length>2000) return invalid('Write a question under 2,000 characters.');
    if(body.chapterIndex!==undefined&&(!Number.isInteger(body.chapterIndex)||body.chapterIndex<0||body.chapterIndex>12)) return invalid('Choose a valid chapter.');
    const chapter=Math.min(body.chapterIndex||0,value.guide.chapters.length-1);
    const node=body.conceptId?value.guide.nodes.find(n=>n.id===body.conceptId):value.guide.nodes.find(n=>n.chapterIndex===chapter)||value.guide.nodes[0];
    if(!node) return invalid('Select a concept from this guide.');
    const query=body.question.toLowerCase();
    const answer=query.includes('example')?node.example||node.explanation:/simple|explain|what|how|why|mean/.test(query)?node.explanation:'This sample has a prepared explanation and example for each concept. Try “Explain simply” or “Give an example”, or explore the supporting passage.';
    return json(200,{id:randomUUID(),question:body.question,answer,sourceIds:node.sourceIds,conceptId:node.id,contextLabel:node.label,sample:true,createdAt:Date.now()/1000});
  }
  return json(405,{detail:'Method not allowed.'});
}
