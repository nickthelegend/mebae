// Read-only browser telemetry. Passthrough wrappers retain actual rendering/audio.
import {chromium} from '../../packages/app/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import {createGzip} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const phase=process.argv[2];
const status=JSON.parse(execFileSync('node_modules/.bin/iwsdk',['dev','status'],{cwd:'packages/app',encoding:'utf8'}));
const browser=await chromium.connectOverCDP(status.data.state.session.browserAutomation.endpoint);
const zip=createGzip();zip.pipe(fs.createWriteStream(`audit/raw/${phase}-events.jsonl.gz`));
const write=v=>zip.write(JSON.stringify({at:new Date().toISOString(),phase,...v})+'\n');
const totals={consoleErrors:0,pageErrors:0,failedRequests:0,httpErrors:0,requests:0,snapshots:0};
const init=()=>{
 if(window.__audit)return;window.__audit={text:[],arcs:[],audio:[],gate:[],started:Date.now()};
 const a=window.__audit;const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){this.canvas.__auditText=[];return clear.apply(this,args);};
 for(const name of ['fillText','arc']){const old=CanvasRenderingContext2D.prototype[name];CanvasRenderingContext2D.prototype[name]=function(...args){if(name==='fillText')(this.canvas.__auditText??=[]).push(String(args[0]));const log={at:performance.now(),canvas:[this.canvas.width,this.canvas.height],args,fill:this.fillStyle,stroke:this.strokeStyle,lineWidth:this.lineWidth};const arr=name==='fillText'?a.text:a.arcs;arr.push(log);if(arr.length>1000)arr.splice(0,500);return old.apply(this,args);};}
 if(window.OscillatorNode){const old=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){a.audio.push({at:performance.now(),frequency:this.frequency.value,contextState:this.context.state,when:args[0]});return old.apply(this,args);};}
 const obs=new MutationObserver(()=>{const e=document.querySelector('#enter');if(!e)return;const g={text:e.textContent,disabled:e.disabled,session:document.body.classList.contains('xr')};if(JSON.stringify(a.gate.at(-1))!==JSON.stringify(g))a.gate.push(g);});obs.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
};
const seen=new Set();
async function attach(p){if(seen.has(p))return;seen.add(p);p.on('console',m=>{if(m.type()==='error')totals.consoleErrors++;write({kind:'console',level:m.type(),text:m.text(),location:m.location()});});p.on('pageerror',e=>{totals.pageErrors++;write({kind:'pageerror',message:e.message});});p.on('request',r=>{totals.requests++;write({kind:'request',url:r.url(),method:r.method(),type:r.resourceType(),body:r.postData()?.slice(0,100)});});p.on('requestfailed',r=>{totals.failedRequests++;write({kind:'requestfailed',url:r.url(),error:r.failure()});});p.on('response',r=>{if(r.status()>=400)totals.httpErrors++;write({kind:'response',url:r.url(),status:r.status()});});await p.addInitScript(init);for(const f of p.frames())await f.evaluate(init).catch(()=>{});}
for(const c of browser.contexts()){for(const p of c.pages())await attach(p);c.on('page',p=>attach(p));}
write({kind:'monitor-ready',endpoint:status.data.state.session.browserAutomation.endpoint});fs.writeFileSync(`/tmp/mebae-monitor-${phase}.ready`,String(process.pid));
let running=true;process.on('SIGTERM',()=>running=false);process.on('SIGINT',()=>running=false);
while(running){for(const c of browser.contexts())for(const p of c.pages())for(const f of p.frames()){try{const s=await f.evaluate(()=>{if(!window.__mebae)return null;const a=window.__audit;const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){this.canvas.__auditText=[];return clear.apply(this,args);};return {url:location.href,state:window.__mebae.state(),ledger:JSON.parse(window.__mebae.exportJson()).ledger,targets:window.__mebae.targets(),text:a?.text.splice(0),arcs:a?.arcs.splice(0),audio:a?.audio.splice(0),gate:a?.gate};});if(s){totals.snapshots++;write({kind:'snapshot',...s});}}catch(e){write({kind:'navigation-gap',message:e.message.split('\n')[0]});}}await new Promise(r=>setTimeout(r,phase==='perf'?1000:200));}
write({kind:'totals',...totals});fs.writeFileSync(`audit/raw/${phase}-capture.json`,JSON.stringify({recordedAt:new Date().toISOString(),...totals},null,2));await browser.close();await new Promise(r=>zip.end(r));
