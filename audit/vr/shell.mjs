import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import{cli,xr,ev,sleep,until}from '../../packages/app/e2e/lib.mjs';
const req=createRequire(path.resolve('packages/app/package.json')),{chromium}=req('playwright');
const endpoint=cli(['dev','status']).state.session.browserAutomation.endpoint;
const browser=await chromium.connectOverCDP(endpoint),page=browser.contexts()[0].pages()[0];
fs.writeFileSync('audit/raw/phase.txt','shell');
const report={recordedAt:new Date().toISOString()};
const dom=()=>ev(`({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,enter:{text:document.querySelector('#enter').textContent,disabled:document.querySelector('#enter').disabled,height:document.querySelector('#enter').getBoundingClientRect().height},status:document.querySelector('#status').textContent,pageVisible:getComputedStyle(document.querySelector('#page')).display,bodyXR:document.body.classList.contains('xr'),xr:m.state().xr,ledger:JSON.parse(m.exportJson()).ledger})`);
try{
 if(xr('status').sessionActive)xr('exit');await sleep(500);report.exited=dom();
 await page.context().addInitScript(()=>{
  window.__auditShell=[];
  const collect=()=>{const e=document.getElementById('enter');if(e){const r={text:e.textContent,disabled:e.disabled,at:performance.now()};if(JSON.stringify(window.__auditShell.at(-1)?.text)!==JSON.stringify(r.text))window.__auditShell.push(r);}};
  new MutationObserver(collect).observe(document,{childList:true,subtree:true,attributes:true});
 });
 cli(['browser','reload']);await sleep(2500);report.initialGate=ev('window.__auditShell');report.supported=dom();
 await page.setViewportSize({width:375,height:812});await sleep(500);report.mobile=dom();
 await page.screenshot({path:'audit/vr/quest-shell-375.jpg',type:'jpeg',quality:55});
 await page.setViewportSize({width:800,height:800});
 const frame=page.frames().find(f=>f!==page.mainFrame())??page.mainFrame();
 await frame.locator('#enter').click();await sleep(700);report.entered=dom();
 xr('set-input-mode',{mode:'hand'});await sleep(300);xr('exit');await sleep(500);report.returned=dom();
 await page.screenshot({path:'audit/vr/quest-shell-exit.jpg',type:'jpeg',quality:55});
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{fs.writeFileSync('audit/raw/shell.json',JSON.stringify(report,null,2));process.exit(process.exitCode??0);}
