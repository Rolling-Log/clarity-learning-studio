import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../netlify/functions/clarity.mjs';
import { runJob, sign, validJob } from '../netlify/lib/live.mjs';
import { InvalidLesson, normalizeGuide } from '../netlify/lib/visual-contract.mjs';
import { renderGuide } from '../netlify/lib/visual-renderer.mjs';
import { narrate } from '../netlify/lib/narration.mjs';
import { createModel } from '../netlify/lib/deepseek.mjs';
import catalogue from '../prepared/catalogue.json' with { type:'json' };

const source = 'Below or at 14 degrees the greenhouse heater starts.\n\nAt 19 degrees or above it stops.\n\nBetween these points it holds its last setting.';
const passages = source.split('\n\n').map((text,i) => ({id:'S'+(i+1),text}));
const rawGuide = {
  title:'Greenhouse heat control',summary:'A temperature band lets the greenhouse heater hold its last setting.',language:'en',
  nodes:[
    {id:'c1',label:'Heating starts',explanation:'At 14 degrees or below the heater turns on.',sourceIds:['S1'],chapterIndex:0},
    {id:'c2',label:'Heating stops',explanation:'At 19 degrees or above the heater turns off.',sourceIds:['S2'],chapterIndex:0},
    {id:'c3',label:'State is retained',explanation:'The heater holds its setting between the two thresholds.',sourceIds:['S3'],chapterIndex:0},
    {id:'c4',label:'The switching gap',explanation:'The heater uses a different value to turn off than to turn on.',sourceIds:['S1','S2'],chapterIndex:0}
  ],
  chapters:[{title:'The temperature band',summary:'Two thresholds control the heater.',nodeIds:['c1','c2','c3','c4'],sourceIds:['S1','S2','S3']}],
  takeaways:['The two switching temperatures are different.'],
  visual:{type:'threshold',quantity:'Temperature',unit:'°C',
    low:{id:'c1',at:14,state:'Heating'},high:{id:'c2',at:19,state:'Off'},hold:{id:'c3',state:'Hold previous setting'}}
};
const rawNarration = [{chapterIndex:0,sentences:['The greenhouse heater starts at fourteen degrees.','It stops at nineteen.']}];

function harness({dispatchError = false} = {}) {
  const data = new Map(), jobs = [], questions = [];
  let counter = 0, generations = 0;
  const store = {
    async getWithMetadata(key) { return structuredClone(data.get(key) || null); },
    async setJSON(key,value,options={}) {
      const old = data.get(key);
      if ((options.onlyIfNew && old) || (options.onlyIfMatch && old?.etag !== options.onlyIfMatch)) return {modified:false};
      data.set(key,{data:structuredClone(value),etag:String(++counter)});
      return {modified:true};
    },
    async set(key,bytes) { data.set(key,{data:new Uint8Array(bytes)}); },
    async get(key) { return data.get(key)?.data.buffer || null; }
  };
  const services = {
    store,key:'test-key',ip:'test-client',
    async dispatch(id,attempt) {
      if (dispatchError) throw new Error('Simulated queue outage');
      jobs.push([id,attempt]);
    },
    model:createModel('test-key',async (_url,request) => {
      const [system,input] = JSON.parse(request.body).messages;
      const generate = system.content.includes('narration');
      if (generate) generations++;
      else questions.push(JSON.parse(input.content));
      const value = generate ? {guide:rawGuide,narration:rawNarration} :
        {answer:'The heater holds its last setting in the band.',sourceIds:['S3','S999']};
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
    })
  };
  const handler = createHandler(() => services, () => true);
  return {
    jobs, services, questions, generations:() => generations,
    request:(path,body,headers={}) => handler({path:'/api/clarity'+path,headers,
      httpMethod:body?'POST':'GET',body:body&&JSON.stringify(body)})
  };
}

test('a new file uses the live worker, renders a real diagram and plays indexed audio',async () => {
  const {request,jobs,services,generations} = harness();
  assert.equal(JSON.parse((await request('/health')).body).modelConfigured,true);
  const created = await request('/sessions',{text:source,mode:'deep',inputType:'file',name:'Notes.txt'});
  assert.equal(created.statusCode,202);
  const queued = JSON.parse(created.body);
  assert.equal(queued.sample,false);
  assert.equal(queued.initialView,'visual-guide');
  assert.equal(queued.inputType,'file');
  assert.equal(queued.active,true);
  assert.equal(queued.job,undefined);
  const route = '/sessions/'+queued.id;
  assert.equal((await request(route+'/guide')).statusCode,409);

  const [id,attempt] = jobs[0];
  assert.equal(validJob(services.key,id,attempt,sign(services.key,'generate',id,attempt)),true);
  assert.equal(validJob(services.key,id,attempt,'a'.repeat(64)),false);
  await Promise.all([runJob(services,id,attempt,narrate),runJob(services,id,attempt,narrate)]);
  assert.equal(generations(),1);
  const ready = JSON.parse((await request(route)).body);
  assert.equal(ready.active,false);
  assert.equal(ready.guide.visual.type,'threshold');
  assert.equal(ready.guideTemplate,'structured-v1');
  assert.equal(ready.stages.audio.status,'ready');
  assert.deepEqual(ready.passages,passages);
  assert.equal(ready.audio.captions.length,2);
  assert.ok(ready.audio.captions[1].start > ready.audio.captions[0].end);
  const guide = await request(route+'/guide');
  assert.equal(guide.statusCode,200);
  assert.match(guide.body,/id="study-range"/);
  assert.match(guide.body,/data-high="19"/);
  assert.match(guide.body,/data-node="c4"[^>]*>The switching gap/);
  const audio = await request(route+'/audio',null,{range:'bytes=0-127'});
  assert.equal(audio.statusCode,206);
  assert.match(audio.headers['Content-Range'],/^bytes 0-127\//);
  assert.equal(Buffer.from(audio.body,'base64').length,128);
  assert.equal((await request(route+'/audio',null,{range:'bytes=99999999-'})).statusCode,416);

  const answer = JSON.parse((await request(route+'/ask',{question:'What happens in the middle?',conceptId:'c3'})).body);
  assert.equal(answer.sample,false);
  assert.equal(answer.conceptId,'c3');
  assert.deepEqual(answer.sourceIds,['S3']);
  await request(route+'/retry',{part:'all'});
  assert.equal(jobs.length,1);
  assert.deepEqual(JSON.parse((await request('/sessions')).body),[]);
});

test('a free-form question on a prepared example reaches the budgeted model with its passages',async () => {
  const {request,questions} = harness();
  const session = Object.values(catalogue.sessions).find(value => value.sampleId === 'flatland');
  const node = session.guide.nodes[0];
  const route = '/sessions/' + session.id + '/ask';
  await request(route,{question:'你好'});
  await request(route,{question:'Explain simply',conceptId:node.id});
  assert.equal(questions.length,0);

  const question = 'Hi, how does a sphere appear to a Flatlander?';
  const result = await request(route,{question,conceptId:node.id});
  assert.equal(result.statusCode,200);
  const answer = JSON.parse(result.body);
  assert.equal(answer.sample,false);
  assert.equal(answer.conceptId,node.id);
  assert.equal(questions[0].question,question);
  assert.equal(questions[0].concept,node.label);
  assert.ok(node.sourceIds.every(id => questions[0].source.some(p => p.id === id)));
  assert.ok(!answer.sourceIds.includes('S999'));
});

test('dispatch failure is retryable and public creation is bounded',async () => {
  const {request} = harness({dispatchError:true});
  const body = {text:source,mode:'quick'};
  for (let index = 0; index < 6; index++) {
    const result = await request('/sessions',body);
    assert.equal(result.statusCode,202);
    const session = JSON.parse(result.body);
    assert.equal(session.active,false);
    assert.equal(session.stages.guide.error,'service_unavailable');
  }
  assert.equal((await request('/sessions',body)).statusCode,429);
});

test('guide validation rejects invented thresholds and the old generic node payload',() => {
  const wrong = structuredClone(rawGuide);
  wrong.visual.high.at = 20;
  assert.throws(() => normalizeGuide(wrong,passages),InvalidLesson);
  delete wrong.visual;
  assert.throws(() => normalizeGuide(wrong,passages),InvalidLesson);
});

test('a mechanism can connect secondary concepts and preserves the direction of each relationship',() => {
  const lesson = structuredClone(rawGuide);
  lesson.visual = {
    type:'mechanism', focus:'c4', links:[
      {from:'c3',to:'c1',verb:'keeps on below the high limit',effect:'The heater continues to run in the band.'},
      {from:'c4',to:'c3',verb:'allows retention',effect:'A distinct band holds the previous state.'},
      {from:'c2',to:'c4',verb:'sets the upper limit',effect:'The heater stops at the high end.'}
    ]
  };
  const guide = normalizeGuide(lesson,passages);
  assert.deepEqual(guide.visual,lesson.visual);
  const html = renderGuide(guide);
  assert.match(html,/class="mechanism mechanism-network"/);
  assert.match(html,/<li class="mechanism-link"><button[^>]+data-node="c3"[^>]*>State is retained<\/button><div class="link-verb">keeps on below the high limit[^]*?data-node="c1"[^>]*>Heating starts<\/button><\/li>/);

  lesson.visual.links.splice(1,1);
  assert.throws(() => normalizeGuide(lesson,passages),InvalidLesson);
});
