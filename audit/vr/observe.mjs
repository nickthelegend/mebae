import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const req=createRequire(path.resolve('packages/app/package.json'));
const {chromium}=req('playwright');
const endpoint=JSON.parse(fs.readFileSync('audit/raw/dev-status.json')).data.state.session.browserAutomation.endpoint;
const browser=await chromium.connectOverCDP(endpoint);
const instrument=()=>{
 if(window.__auditCanvasInstalled)return;window.__auditCanvasInstalled=true;
 const p=CanvasRenderingContext2D.prototype,fill=p.fillText,clear=p.clearRect;
 p.fillText=function(text,...args){(this.canvas.__auditText??=[]).push(String(text));return fill.call(this,text,...args);};
 p.clearRect=function(...args){this.canvas.__auditText=[];return clear.apply(this,args);};
};
for(const context of browser.contexts()){await context.addInitScript(instrument);for(const page of context.pages())for(const frame of page.frames())await frame.evaluate(instrument).catch(()=>{});}
let last='',n=0;
while(!fs.existsSync('audit/raw/stop-observe')){
 for(const page of browser.contexts().flatMap(c=>c.pages()))for(const frame of page.frames()){
  try{
   const result=await frame.evaluate(()=>{
    const m=window.__mebae,w=window.FRAMEWORK_MCP_RUNTIME?.world;if(!m||!w)return null;
    const s=m.state();s.focus.remainingMs=Math.round(s.focus.remainingMs/10000)*10000;s.focus.remainingFraction=undefined;
    const cards=[];w.scene.traverse(o=>{if(!o.visible)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;
     const im=o.material?.map?.image;if(im?.__auditText)cards.push({name:o.name,text:im.__auditText,scale:o.scale.toArray()});
    });
    return {state:s,targets:m.targets(),cards};
   });
   if(!result)continue;
   const phase=fs.readFileSync('audit/raw/phase.txt','utf8').trim();
   const key=JSON.stringify({phase,...result});
   if(key!==last){last=key;fs.appendFileSync('audit/raw/observations.jsonl',JSON.stringify({at:new Date().toISOString(),phase,...result})+'\n');n++;}
  }catch{}
 }
 await new Promise(r=>setTimeout(r,1000));
}
console.log('Observed snapshots',n);process.exit(0);
