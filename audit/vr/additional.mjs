import fs from 'node:fs';
import {cli,ev,xr,pinchAt,sleep,until,dist} from '../../packages/app/e2e/lib.mjs';
const root=process.cwd(),out=`${root}/audit/raw`;
const phase=process.argv[2]??'quest-extra';fs.writeFileSync(`${out}/phase.txt`,phase);
const records=[];
const state=()=>ev('m.state()'),targets=()=>ev('m.targets()');
const observe=()=>ev(`(()=>{
 const w=window.FRAMEWORK_MCP_RUNTIME.world,sys=n=>w.systems.find(s=>s.constructor.name===n);
 const cards=[];w.scene.traverse(o=>{if(!o.visible)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;
 const im=o.material?.map?.image;if(im?.__auditText)cards.push({name:o.name,text:im.__auditText,scale:o.scale.toArray()});});
 const p=sys('PlantingSystem'),t=sys('TraySystem'),r=sys('RoomSystem'),sp=sys('SproutSystem');
 return {state:m.state(),targets:m.targets(),cards,planting:{preset:p.preset?.label,hovered:p.hovered,preview:p.lastPreview,seed:p.seed.visible,reticle:p.reticle.visible,arc:p.arc.visible},
 freeSlots:t.freeSlots(),trayAnchor:localStorage.getItem('iwsdk_scene_anchor_uuid'),
 roomTargets:r.targets.map(o=>({name:o.name,userData:o.userData})),
 plants:[...sp.sprouts.values()].map(s=>({id:s.habitId,wallish:s.wallish,rootQuaternion:s.group.quaternion.toArray(),species:s.plant.species,stake:!!s.stake})),
 ledger:JSON.parse(m.exportJson()).ledger};})()`);
async function snap(name){await sleep(250);const data=observe();records.push({at:new Date().toISOString(),name,...data});fs.writeFileSync(`${out}/${phase}.json`,JSON.stringify({phase,records},null,2));return data;}
async function shot(name){fs.writeFileSync(`${out}/capture.txt`,name);await sleep(800);}
async function seated(){if(!xr('status').sessionActive)xr('enter');xr('set-input-mode',{mode:'hand'});xr('set-transform',{device:'headset',position:{x:-0.08,y:1.2,z:-1.35},orientation:{pitch:-28,yaw:0,roll:0}});await until(()=>state().tray?.placed,'tray');}
async function plant(index,point,hand='hand-right'){
 await pinchAt(hand,targets().seed);await until(()=>state().mode==='radial','radial');
 await pinchAt(hand,targets().icons[index]);await snap(`preset-${index}-before-place`);
 await pinchAt(hand,point);await until(()=>state().mode==='idle','root');await sleep(300);
}
try{
 if(phase==='quest-extra'){
  ev('m.wipe()');cli(['browser','reload']);await sleep(2500);await seated();
  await snap('clean-cold-office');await shot('quest-clean');
  for(let i=0;i<12;i++){
   await pinchAt('hand-right',targets().seed);await until(()=>state().mode==='radial','radial');
   xr('look-at',{device:'hand-right',target:{x:targets().icons[i][0],y:targets().icons[i][1],z:targets().icons[i][2]}});await sleep(300);
   await snap(`radial-hover-${i}`);
   await pinchAt('hand-right',targets().icons[i]);await snap(`radial-selected-${i}`);
   const tray=targets().tray;await pinchAt('hand-right',[tray[0]-.19,tray[1]+.025,tray[2]+.075]);await snap(`cancel-aim-${i}`);
   if(state().mode!=='idle'||state().habits.length){await sleep(1500);ev('m.wipe()');cli(['browser','reload']);await sleep(2500);await seated();}
  }
  await pinchAt('hand-right',targets().seed);
  const centre=ev('window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName("Icon radial").getWorldPosition(window.FRAMEWORK_MCP_RUNTIME.world.camera.position.clone()).toArray()');
  await pinchAt('hand-right',centre);await snap('cancel-centre');
  await plant(0,[-0.6,1.2,1.58]);let h=state().habits[0];await snap('stretch-planted');
  await pinchAt('hand-right',targets().sprouts[h.id].label);await snap('stretch-checkin');
  await pinchAt('hand-right',targets().sprouts[h.id].label);await snap('stretch-saturated');
  const t=targets(),desk=[t.tray[0]+.32,t.tray[1]+.003,t.tray[2]-.15];
  await plant(1,desk,'hand-left');const water=state().habits.find(h=>h.label==='Water');await snap('left-water-planted');
  for(let i=0;i<3;i++)await pinchAt('hand-right',targets().sprouts[water.id].label);
  await snap('water-three');await pinchAt('hand-right',targets().sprouts[water.id].label,1.3);await snap('water-undo');
  for(const [index,label]of[[2,'contrast'],[3,'large'],[4,'onehand']]){await pinchAt('hand-right',targets().menuButtons[index]);await snap(`${label}-on`);await shot(`quest-${label}`);}
  cli(['browser','reload']);await sleep(2500);await seated();await snap('combined-settings-restored');
  for(const[index,label]of[[2,'contrast'],[3,'large'],[4,'onehand']]){await pinchAt('hand-right',targets().menuButtons[index]);await snap(`${label}-off`);}
  await pinchAt('hand-right',targets().menuButtons[1]);await sleep(400);await snap('sample-on');
  xr('set-transform',{device:'hand-left',position:{x:-.2,y:1,z:-1.65},orientation:{fingers:'forward',palm:'up'},anchor:'wrist'});await sleep(700);
  await pinchAt('hand-right',targets().menuButtons[0]);await snap('sample-week-wrist-stamps');await shot('quest-sample-week');
  await pinchAt('hand-right',targets().week);await pinchAt('hand-right',targets().sand);await snap('sample-focus-refusal');
  await pinchAt('hand-right',targets().tray);await snap('sample-seed-refusal');
  const sampleSprout=Object.values(targets().sprouts).find(s=>s.label);if(sampleSprout){await pinchAt('hand-right',sampleSprout.label);await snap('sample-sprout-refusal');}
  await pinchAt('hand-right',targets().menuButtons[1]);await snap('sample-off');
  xr('set-transform',{device:'hand-left',position:{x:-.2,y:1,z:-1.65},orientation:{fingers:'forward',palm:'down'},anchor:'wrist'});await sleep(600);
  await pinchAt('hand-right',targets().sprouts[h.id].stake);await snap('carry-stretch');
  await pinchAt('hand-right',[desk[0]-.15,desk[1],desk[2]-.05]);await until(()=>state().mode==='idle','move');await sleep(300);await snap('stretch-moved');await shot('quest-moved');
  await pinchAt('hand-right',targets().sprouts[h.id].stake);await snap('archive-carry');
  await pinchAt('hand-right',targets().tray);await until(()=>state().mode==='idle','archive');await snap('stretch-archived');
  cli(['browser','reload']);await sleep(2500);await seated();await snap('archive-reloaded');await shot('quest-archive');
 }
 if(phase==='capacity-extra'){
  await snap('six-before');await pinchAt('hand-right',targets().tray);await snap('seventh-refused');await shot('quest-capacity');
 }
 if(phase==='glasses-extra'){
  const gaze=async p=>{xr('look-at',{device:'gaze',target:{x:p[0],y:p[1],z:p[2]}});await sleep(300);xr('select',{device:'hand-right'});await sleep(300);};
  const fov=async name=>{
   const shapes=ev(`(()=>{const w=window.FRAMEWORK_MCP_RUNTIME.world,groups=[];
    w.scene.traverse(o=>{if(!o.visible)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;
     if(!o.name.startsWith('Sprout: ')&&!o.name.startsWith('Label: '))return;
     const corners=[];o.traverse(c=>{if(!c.visible||!c.geometry)return;const g=c.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;if(!b)return;c.updateWorldMatrix(true,false);
      for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])corners.push(w.camera.position.clone().set(x,y,z).applyMatrix4(c.matrixWorld).toArray());});groups.push({name:o.name,corners});});return groups;})()`);
   const t=targets();for(const[key,corners]of Object.entries(t.bounds))shapes.push({name:key,corners});
   const pitch=-30*Math.PI/180,head=[-.08,1.2,-1.35];
   for(const shape of shapes)shape.angles=shape.corners.map(p=>{const d=p.map((v,i)=>v-head[i]),y=d[1]*Math.cos(pitch)+d[2]*Math.sin(pitch),z=-d[1]*Math.sin(pitch)+d[2]*Math.cos(pitch);const h=Math.atan2(d[0],-z)*180/Math.PI,v=Math.atan2(y,-z)*180/Math.PI;return{h,v,inside:Math.abs(h)<=34&&v<=22&&v>=-40};});
   records.push({name,at:new Date().toISOString(),shapes,allInside:shapes.every(s=>s.angles.length&&s.angles.every(a=>a.inside))});await snap(`${name}-state`);
  };
  await snap('glasses-driver-end');await fov('normal-actual-bounds');await shot('glasses-normal');
  await gaze(targets().menuButtons[0]);await snap('gaze-reconnected-week-open');
  if(state().weekOpen)await gaze(targets().week);await snap('gaze-panel-close');
  await gaze(targets().menuButtons[3]);await snap('large-on');
  await gaze(targets().seed);await fov('large-radial-bounds');await shot('glasses-large-radial');
  const centre=ev('window.FRAMEWORK_MCP_RUNTIME.world.scene.getObjectByName("Icon radial").getWorldPosition(window.FRAMEWORK_MCP_RUNTIME.world.camera.position.clone()).toArray()');await gaze(centre);
  await gaze(targets().menuButtons[0]);await fov('large-week-bounds');await shot('glasses-large-week');if(state().weekOpen)await gaze(targets().week);
  await gaze(targets().menuButtons[3]);await gaze(targets().menuButtons[1]);await fov('sample-actual-bounds');await shot('glasses-sample');
 }
}catch(e){records.push({at:new Date().toISOString(),error:e.stack});process.exitCode=1;}
finally{fs.writeFileSync(`${out}/${phase}.json`,JSON.stringify({phase,records},null,2));}
