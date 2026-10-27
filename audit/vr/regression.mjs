import fs from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {cli,sleep,until} from '../../packages/app/e2e/lib.mjs';
const app=decodeURIComponent(new URL('../../packages/app/',import.meta.url).pathname);
for(const [suite,device,environment] of [['kitchen','metaQuest3','kitchen'],['quest','metaQuest3','home_office'],['glasses','metaVRGlasses','home_office'],['perf','metaQuest3','home_office']]){
 if(process.argv[2]&&suite!==process.argv[2])continue;
 execFileSync(process.execPath,['scripts/set-device.mjs',device,environment],{cwd:app});
 await sleep(3500);await until(()=>cli(['dev','status']).state.browserCommandReady,'browserCommandReady',60000);
 const phase='t10-'+suite,monitor=spawn(process.execPath,['audit/vr/monitor.mjs',phase],{stdio:['ignore',fs.openSync('/tmp/mebae-'+phase+'-monitor.log','w'),fs.openSync('/tmp/mebae-'+phase+'-monitor.err','w')]});
 try{
 await until(()=>fs.existsSync('/tmp/mebae-monitor-'+phase+'.ready'),'monitor ready',30000);
 const code=await new Promise(resolve=>{const p=spawn(process.execPath,['e2e/run.mjs',suite],{cwd:app,env:{...process.env,MEBAE_OUT:'../../audit/raw'},stdio:['ignore',fs.openSync('/tmp/mebae-'+phase+'.log','w'),fs.openSync('/tmp/mebae-'+phase+'.err','w')]});p.on('exit',resolve);});
 console.log(suite,code);
 }finally{monitor.kill('SIGTERM');await new Promise(r=>monitor.on('exit',r));}
}
