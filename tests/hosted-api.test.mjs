import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler } from '../netlify/functions/clarity.mjs';
import catalogue from '../prepared/catalogue.json' with { type:'json' };

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const call=(route,body)=>handler({path:'/api/clarity'+route,httpMethod:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
const read=result=>JSON.parse(result.body);
const sources={
  flatland:await fs.readFile(path.join(root,'web/examples/flatland.txt'),'utf8'),
  boids:JSON.parse(await fs.readFile(path.join(root,'web/examples/boids-text.json'),'utf8')).text
};

test('hosted mode has no configured model or paid generation',async()=>{
  const result=read(await call('/health'));
  assert.equal(result.paidGenerationEnabled,false);
  assert.equal(result.modelConfigured,false);
  assert.equal(result.notebookAvailable,false);
  assert.equal(result.rendererAvailable,true);
});
test('all six reviewed sessions preserve citations, audio and local guides',async()=>{
  assert.equal(Object.keys(catalogue.sessions).length,6);
  for(const session of Object.values(catalogue.sessions)){
    const result=read(await call('/sessions/'+session.id));
    assert.equal(result.mode,session.mode);
    assert.equal(result.guideTemplate,'explorable-v1');
    assert.equal(result.guideUrl,'/prepared/'+result.sampleId+'.html');
    const ids=new Set(result.passages.map(p=>p.id));
    for(const node of result.guide.nodes) assert.ok(node.sourceIds.every(id=>ids.has(id)));
    assert.ok(result.audio.duration>20);
    assert.ok((await fs.stat(path.join(root,'web',result.audio.url))).size>1000);
    const guide=await call('/sessions/'+session.id+'/guide');
    assert.equal(guide.statusCode,302);
    assert.equal(guide.headers.Location,result.guideUrl);
    const html=await fs.readFile(path.join(root,'web',guide.headers.Location),'utf8');
    assert.ok(html.includes('__CLARITY_MODEL__'));
    assert.ok(!html.includes('sk-proj-'));
  }
});
test('book and original paper uploads match by content in both modes',async()=>{
  for(const [sampleId,text] of Object.entries(sources)) for(const mode of ['quick','deep']){
    const result=await call('/sessions',{text,name:'changed-name',sampleId,mode,inputType:'file'});
    assert.equal(result.statusCode,202);
    const session=read(result);
    assert.equal(session.sampleId,sampleId);
    assert.equal(session.inputType,'file');
    assert.equal(read(await call('/sessions/'+session.id)).inputType,'file');
  }
});
test('the full book and all original PDF pages remain available',()=>{
  const sessions=Object.values(catalogue.sessions);
  const book=sessions.find(s=>s.sampleId==='flatland');
  const paper=sessions.find(s=>s.sampleId==='boids');
  assert.equal(new Set(book.passages.map(p=>p.section)).size,22);
  assert.equal(new Set(paper.passages.map(p=>p.page)).size,13);
});
test('new content is blocked and cannot impersonate a reviewed example',async()=>{
  const text='A new unrelated source with a famous filename.';
  assert.equal((await call('/sessions',{text,name:'Flatland',mode:'deep'})).statusCode,403);
  assert.equal((await call('/sessions',{text,sample:true,sampleId:'flatland',mode:'deep'})).statusCode,422);
  assert.equal((await call('/sessions',{text:sources.flatland,sampleId:'boids',mode:'deep'})).statusCode,422);
});
test('prepared questions return the selected concept and valid evidence',async()=>{
  for(const session of Object.values(catalogue.sessions)){
    const node=session.guide.nodes.at(-1);
    const result=read(await call('/sessions/'+session.id+'/ask',{question:'Give an example',conceptId:node.id,chapterIndex:node.chapterIndex}));
    assert.equal(result.sample,true);
    assert.equal(result.answer,node.example||node.explanation);
    assert.deepEqual(result.sourceIds,node.sourceIds);
    assert.equal((await call('/sessions/'+session.id+'/ask',{question:'Explain simply',conceptId:'invalid'})).statusCode,422);
  }
});
test('invalid JSON, unknown sessions and invalid settings are rejected',async()=>{
  assert.equal((await handler({path:'/api/clarity/sessions',httpMethod:'POST',body:'{'})).statusCode,400);
  assert.equal((await call('/sessions/no-such-session')).statusCode,404);
  assert.equal((await call('/sessions',{text:sources.flatland,mode:'other'})).statusCode,422);
  assert.equal((await call('/sessions',{text:sources.flatland,mode:'quick',inputType:'secret'})).statusCode,422);
  assert.equal((await call('/sessions',{text:'x'.repeat(500001),mode:'quick'})).statusCode,422);
});
test('audio is delivered through the static CDN instead of Lambda payloads',async()=>{
  const session=Object.values(catalogue.sessions)[0];
  const result=await call('/sessions/'+session.id+'/audio');
  assert.equal(result.statusCode,302);
  assert.equal(result.headers.Location,session.audio.url);
});
