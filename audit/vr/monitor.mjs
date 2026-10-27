import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const req = createRequire(path.join(root,'packages/app/package.json'));
const {chromium}=req('playwright');
const status=JSON.parse(fs.readFileSync('audit/raw/dev-status.json'));
const endpoint=status.data.state.session.browserAutomation.endpoint;
const browser=await chromium.connectOverCDP(endpoint);
const log=(kind,data)=>fs.appendFileSync('audit/raw/browser-events.jsonl',JSON.stringify({at:new Date().toISOString(),phase:fs.existsSync('audit/raw/phase.txt')?fs.readFileSync('audit/raw/phase.txt','utf8').trim():'startup',kind,...data})+'\n');
log('connected',{endpoint,version:browser.version()});
const seen=new Set();
function attach(page){
 if(seen.has(page))return;seen.add(page);
 page.on('console',m=>log('console',{level:m.type(),text:m.text(),location:m.location()}));
 page.on('pageerror',e=>log('pageerror',{message:e.message,stack:e.stack}));
 page.on('request',r=>log('request',{url:r.url(),method:r.method(),type:r.resourceType()}));
 page.on('response',r=>log('response',{url:r.url(),status:r.status()}));
 page.on('requestfailed',r=>log('requestfailed',{url:r.url(),failure:r.failure()}));
}
for(const c of browser.contexts()){c.on('page',attach);for(const p of c.pages())attach(p);}
console.log('Monitoring managed Chrome',browser.version(),[...seen].map(p=>p.url()));
let last='';
while(!fs.existsSync('audit/raw/stop-monitor')){
 if(fs.existsSync('audit/raw/capture.txt')){
  const name=fs.readFileSync('audit/raw/capture.txt','utf8').trim();
  if(name&&name!==last){
   last=name;
   try{const page=[...seen].find(p=>!p.isClosed()&&p.url().includes('8081'));
    await page.screenshot({path:`audit/vr/${name}.jpg`,type:'jpeg',quality:55});
    log('screenshot',{path:`audit/vr/${name}.jpg`,frames:page.frames().map(f=>f.url())});
   }catch(e){log('captureerror',{message:e.message});}
  }
 }
 await new Promise(r=>setTimeout(r,400));
}
log('monitor-stopped',{});
process.exit(0); // Disconnect this observer without closing the managed browser.
