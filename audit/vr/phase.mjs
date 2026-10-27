// Owns only its telemetry child. Server/browser lifecycle is handled explicitly.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
const phase=process.argv[2],app=new URL('../../packages/app/',import.meta.url).pathname;
const status=()=>JSON.parse(execFileSync('node_modules/.bin/iwsdk',['dev','status'],{cwd:decodeURIComponent(app),encoding:'utf8'}));
await new Promise(r=>setTimeout(r,2500));
for(let i=0;i<60;i++){const s=status();if(s.data.state?.browserCommandReady&&s.data.state?.session?.browserAutomation?.endpoint){fs.writeFileSync(`audit/raw/${phase}-dev-status.json`,JSON.stringify(s,null,2));break;}if(i===59)throw Error('browserCommandReady timeout');await new Promise(r=>setTimeout(r,1000));}
fs.rmSync(`/tmp/mebae-monitor-${phase}.ready`,{force:true});
const monitor=spawn(process.execPath,['audit/vr/monitor.mjs',phase],{stdio:['ignore',fs.openSync(`/tmp/mebae-monitor-${phase}.log`,'w'),fs.openSync(`/tmp/mebae-monitor-${phase}.err`,'w')]});
const run=(args,cwd,log,env={})=>new Promise(resolve=>{const p=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:['ignore',fs.openSync(log,'w'),fs.openSync(log+'.err','w')]});p.on('exit',code=>resolve(code));});
try{
 for(let i=0;!fs.existsSync(`/tmp/mebae-monitor-${phase}.ready`);i++){if(i>100)throw Error('monitor readiness');await new Promise(r=>setTimeout(r,100));}
 console.log('CAPTURE READY',phase);
 const code=await run(['e2e/run.mjs',phase],decodeURIComponent(app),`/tmp/mebae-${phase}.log`,{MEBAE_OUT:decodeURIComponent(new URL('../raw/',import.meta.url).pathname)});console.log('SUITE FINISHED',phase,code);
 for(const script of (phase==='quest'?['shell.mjs','additional.mjs','verify.mjs']:phase==='glasses'?['additional.mjs','week.mjs']:phase==='perf'?['additional.mjs','perf-edge.mjs']:[])){
 const arg=phase==='quest'?(script==='additional.mjs'?'quest-extra':script==='verify.mjs'?'quest-deep':script==='verify-more.mjs'?'quest-more':script==='features.mjs'?'quest-features':'whoa'):phase==='glasses'?'glasses-extra':'capacity-extra';
 const result=await run([`audit/vr/${script}`,...arg?[arg]:[]],process.cwd(),`/tmp/mebae-${arg||'shell'}.log`);console.log('EXTRA FINISHED',script,arg,result);
 }
}finally{if(monitor.exitCode===null){monitor.kill('SIGTERM');await new Promise(r=>monitor.on('exit',r));}console.log('CAPTURE CLOSED',phase);}
