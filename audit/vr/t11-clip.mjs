import fs from 'node:fs';
import {chromium} from '../../packages/app/node_modules/playwright/index.mjs';
import {cli} from '../../packages/app/e2e/lib.mjs';
const b=await chromium.connectOverCDP(cli(['dev','status']).state.session.browserAutomation.endpoint),c=await b.newContext(),p=await c.newPage();
const r={id:'VR-121',recordedAt:new Date().toISOString(),consoleErrors:[],pageErrors:[],failedRequests:[],httpErrors:[],requests:[]};
p.on('console',m=>{if(m.type()==='error')r.consoleErrors.push(m.text());});p.on('pageerror',e=>r.pageErrors.push(e.message));p.on('requestfailed',q=>r.failedRequests.push({url:q.url(),error:q.failure()}));p.on('response',q=>{if(q.status()>=400)r.httpErrors.push({url:q.url(),status:q.status()});});p.on('request',q=>r.requests.push({url:q.url(),method:q.method()}));
try{
 await p.setContent('<video id="clip" src="http://127.0.0.1:4322/audit/vr/first-day.mp4" muted controls></video>');
 await p.waitForFunction(()=>document.querySelector('video').readyState>=2);
 r.playback=await p.evaluate(async()=>{const v=document.querySelector('video');await v.play();await new Promise(r=>setTimeout(r,1200));const advanced=v.currentTime;await new Promise(r=>setTimeout(r,31000));v.pause();return{duration:v.duration,advanced,currentTime:v.currentTime,error:v.error?.message??null,width:v.videoWidth,height:v.videoHeight};});
 r.probe=JSON.parse(fs.readFileSync('/tmp/mebae-t11-video-probe.json','utf8'));
 const original=JSON.parse(fs.readFileSync('audit/raw/whoa.json','utf8'));
 r.capture={capturedAt:original.capturedAt,frames:original.footage.frames,error:original.error,multiDayFootage:original.multiDayFootage,marks:original.marks,realAtStageOne:original.realAtStageOne};
 r.visualReview='Decoded contact sheet and frames show seed/radial, Stretch on detected door, first check-in and stage-1 growth; sample preview caption: Example garden (sample data) · NOT a recorded later day. Existing 35-second recording re-opened on this commit; no second actual calendar day claimed.';
 r.ok=r.playback.duration>=20&&r.playback.duration<=40&&r.playback.advanced>0&&r.playback.currentTime>25&&r.playback.error===null&&r.capture.frames>0&&r.capture.error===null&&r.capture.multiDayFootage===false&&[r.consoleErrors,r.pageErrors,r.failedRequests,r.httpErrors].every(a=>a.length===0);
}finally{r.status=r.ok?'PASS':'FAIL';fs.writeFileSync('audit/raw/t11-clip.json',JSON.stringify(r,null,2));await c.close();await b.close();console.log(r.id,r.status);}
