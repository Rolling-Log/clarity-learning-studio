import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(await fs.readFile(path.join(root,'prepared/catalogue.json'),'utf8'));
if(Object.keys(data.sessions).length!==6) throw Error('Six reviewed example/mode combinations are required.');
const out=path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'web'),out,{recursive:true});
let html=await fs.readFile(path.join(out,'index.html'),'utf8');
for(const name of ['learning.css','web-refinement.css','iris-theme.css','mobile.css','hero-preview.css','i18n.js','mobile.js','learning.js','web-controls.js','examples.js']){
  const hash=createHash('sha256').update(await fs.readFile(path.join(out,name))).digest('hex').slice(0,12);
  html=html.replace(new RegExp('((?:src|href)="'+name.replaceAll('.','\\.')+')(?:\\?[^\"]*)?(")','g'),(_,prefix,quote)=>prefix+'?v='+hash+quote);
}
await fs.writeFile(path.join(out,'index.html'),html);
for(const name of ['bicycle','flatland','boids']) await fs.access(path.join(out,'prepared',name+'.html'));
console.log('Built Clarity Web with three reviewed interactive examples.');
