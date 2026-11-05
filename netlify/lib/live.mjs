import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { createModel } from './deepseek.mjs';
import { InvalidLesson } from './visual-contract.mjs';

const stages = ['source','guide','audio'];
const now = () => Date.now() / 1000;
const stage = (status, error = null) => ({status,error});
const sessionKey = id => 'sessions/' + id;
const expires = session => session.active && now() - session.job.startedAt > 240;
export const liveId = /^[a-f0-9]{32}$/;
export const attemptId = /^[a-f0-9-]{36}$/;

export class LiveError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function sign(key, purpose, id, attempt = '') {
  return createHmac('sha256',key).update([purpose,id,attempt].join(':')).digest('hex');
}

export function validJob(key, id, attempt, signature) {
  return Boolean(key && liveId.test(id) && attemptId.test(attempt) &&
    typeof signature === 'string' && /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(key,'generate',id,attempt),'hex')));
}

export function runtime({ip} = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  return {
    key, store:getStore({name:'clarity-live',consistency:'strong'}), model:createModel(key),
    ip:ip || 'unknown',
    async dispatch(id, attempt) {
      const url = new URL('/.netlify/functions/clarity-generate-background', process.env.URL);
      const response = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json','X-Clarity-Job':sign(key,'generate',id,attempt)},
        body:JSON.stringify({id,attempt}), signal:AbortSignal.timeout(10000)
      });
      if (response.status !== 202) throw new Error('Background dispatch failed');
    }
  };
}

function splitPassages(text) {
  const passages = [];
  const add = value => passages.push({id:'S'+(passages.length+1),text:value});
  for (let paragraph of text.trim().split(/\n\s*\n/u)) {
    paragraph = paragraph.trim();
    while (paragraph.length > 1500) {
      const space = paragraph.lastIndexOf(' ',1500);
      const end = space >= 800 ? space : 1500;
      add(paragraph.slice(0,end));
      paragraph = paragraph.slice(end).trimStart();
    }
    if (paragraph) add(paragraph);
  }
  return passages;
}

export function publicSession(session) {
  const {job,narration,audioObject,...value} = session;
  if (!value.guide && value.active) value.passages = [];
  if (expires(session)) {
    value.active = false;
    value.stages = Object.fromEntries(Object.entries(value.stages).map(([name,part]) =>
      [name, part.status === 'ready' ? part : stage('error','service_timeout')]));
  }
  return value;
}

async function reserve({store,key,ip}, kind) {
  const bucket = 'quota/' + new Date().toISOString().slice(0,10) + '/' + kind;
  const client = sign(key,'quota',ip).slice(0,24);
  const [daily, perClient] = kind === 'generate' ? [12,6] : [36,16];
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await store.getWithMetadata(bucket,{type:'json'});
    const value = existing?.data || {total:0,clients:{}};
    if (value.total >= daily || (value.clients[client] || 0) >= perClient) {
      throw new LiveError(429,'daily_limit','Today’s generation limit has been reached. Try again tomorrow.');
    }
    value.total++;
    value.clients[client] = (value.clients[client] || 0) + 1;
    const options = existing ? {onlyIfMatch:existing.etag} : {onlyIfNew:true};
    if ((await store.setJSON(bucket,value,options)).modified) return;
  }
  throw new LiveError(503,'service_unavailable','The service is busy. Try again.');
}

export function readSession(store,id) {
  return store.getWithMetadata(sessionKey(id),{type:'json'});
}

async function updateAttempt(store,id,attempt,update) {
  const record = await readSession(store,id);
  if (!record?.data.active || record.data.job.attempt !== attempt) return null;
  if (update(record.data) === false) return null;
  return (await store.setJSON(sessionKey(id),record.data,{onlyIfMatch:record.etag})).modified ? record.data : null;
}

async function dispatch(services,session) {
  try { await services.dispatch(session.id,session.job.attempt); }
  catch {
    const current = await updateAttempt(services.store,session.id,session.job.attempt,value => {
      if (value.job.claimed) return false;
      for (const name of stages) if (value.stages[name].status !== 'ready') value.stages[name] = stage('error','service_unavailable');
      value.active = false;
    });
    if (current) return current;
  }
  return session;
}

function newAttempt() {
  return {attempt:randomUUID(),startedAt:now(),claimed:false};
}

export async function startSession(services,body) {
  await reserve(services,'generate');
  const id = randomUUID().replaceAll('-','');
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0,200) : 'Your text';
  const session = {
    id,title:name,sourceName:name,passages:splitPassages(body.text),mode:body.mode,
    initialView:body.mode === 'quick' ? 'podcast' : 'visual-guide',
    sample:false,sampleId:null,inputType:body.inputType || 'text',createdAt:now(),active:true,sessionStorage:'browser',
    stages:{source:stage('ready'),guide:stage('working'),audio:stage('waiting')},
    guide:null,audio:null,questions:[],job:newAttempt()
  };
  await services.store.setJSON(sessionKey(id),session);
  return dispatch(services,session);
}

export async function retrySession(services,record) {
  const session = record.data;
  if ((session.active && !expires(session)) || (session.guide && session.audio)) return session;
  session.job = newAttempt();
  session.active = true;
  session.stages.guide = stage(session.guide ? 'ready' : 'working');
  session.stages.audio = stage(session.guide ? 'working' : 'waiting');
  if (!(await services.store.setJSON(sessionKey(session.id),session,{onlyIfMatch:record.etag})).modified) {
    return (await readSession(services.store,session.id)).data;
  }
  try {
    if (!session.narration) await reserve(services,'generate');
  } catch (error) {
    await updateAttempt(services.store,session.id,session.job.attempt,value => {
      value.active = false;
      for (const name of ['guide','audio']) if (value.stages[name].status !== 'ready') value.stages[name] = stage('error',error.code || 'generation_failed');
    });
    throw error;
  }
  return dispatch(services,session);
}

export async function runJob(services,id,attempt,narrate) {
  const {store,model} = services;
  const update = change => updateAttempt(store,id,attempt,change);
  let session = await update(value => {
    if (value.job.claimed) return false;
    value.job.claimed = true;
  });
  if (!session) return;
  try {
    if (!session.guide) {
      const {guide,narration} = await model.generate(session);
      session = await update(value => {
        Object.assign(value,{guide,narration,title:guide.title,guideTemplate:'structured-v1'});
        value.stages.guide = stage('ready');
        value.stages.audio = stage('working');
      });
      if (!session) return;
    }
    const {audio,bytes} = await narrate(session);
    const audioObject = 'audio/' + id + '/' + attempt;
    await store.set(audioObject,bytes);
    await update(value => {
      value.audioObject = audioObject;
      value.audio = {...audio,url:'/api/clarity/sessions/' + id + '/audio'};
      value.stages.audio = stage('ready');
      value.active = false;
    });
  } catch (error) {
    const code = error instanceof InvalidLesson ? 'invalid_result' : error.code || 'generation_failed';
    console.error('Clarity generation failed', session.guide ? 'audio' : 'guide', code, error.name);
    await update(value => {
      value.active = false;
      for (const name of ['guide','audio']) if (value.stages[name].status !== 'ready') value.stages[name] = stage('error',code);
    });
  }
}

export async function askLive(services,session,body) {
  const chapter = Math.min(body.chapterIndex || 0,session.guide.chapters.length - 1);
  const node = body.conceptId ? session.guide.nodes.find(n => n.id === body.conceptId) :
    session.guide.nodes.find(n => n.chapterIndex === chapter) || session.guide.nodes[0];
  if (!node) throw new LiveError(422,'invalid_concept','Select a concept from this guide.');
  await reserve(services,'ask');
  const question = body.question.trim();
  const answer = await services.model.ask({question,node,passages:session.passages});
  return {...answer,id:randomUUID(),question,conceptId:node.id,contextLabel:node.label,sample:false,createdAt:now()};
}

export async function readAudio(store,session,range) {
  const data = await store.get(session.audioObject,{type:'arrayBuffer'});
  if (!data) return null;
  const bytes = Buffer.from(data);
  const headers = {'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'private, no-store'};
  if (!range) return {statusCode:200,headers,body:bytes.toString('base64'),isBase64Encoded:true};
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const size = bytes.length;
  const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0,size-Number(match[2])) : size;
  const end = match?.[1] && match[2] ? Math.min(size-1,Number(match[2])) : size-1;
  if (start >= size || end < start) return {statusCode:416,headers:{...headers,'Content-Range':'bytes */'+size},body:''};
  return {statusCode:206,headers:{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+size},
    body:bytes.subarray(start,end+1).toString('base64'),isBase64Encoded:true};
}
