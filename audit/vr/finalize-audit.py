"""Reconcile only this run's observations. No historical PASS is carried forward."""
from pathlib import Path
import json,gzip,re,collections,datetime
root=Path(__file__).resolve().parents[2]
def read(p):
 p=root/p
 return json.loads((p.read_text() if p.exists() else gzip.decompress(Path(str(p)+'.gz').read_bytes()).decode()))
def ref(p):return p if (root/p).exists() else p+'.gz'
rows={}
def put(n,status,observed,paths):rows[f'VR-{n:02d}']={'status':status,'observed':observed,'evidence':list(dict.fromkeys(ref(p) for p in paths))}
files=['kitchen','quest-deep','quest-more','quest-features','quest-edge','quest-tail','quest-palm','glasses-week','perf-extra','growth','storage-final']
for f in files:
 p=f'audit/raw/{f}-rows.json'
 if not (root/p).exists() and not (root/(p+'.gz')).exists():continue
 for r in read(p)['records']:
  n=int(r['id'].split('-')[1]);status=r['status'];o=r['observed']
  reason=f"Fresh {f} observation: "+('all recorded assertions matched.' if status=='PASS' else (o.get('error','Exact-value comparison failed; see recorded before/after values.') if isinstance(o,dict) else 'One or more recorded attempts did not match.'))
  put(n,status,reason,[p]+([r['screenshot']] if r.get('screenshot') else []))
for n,status,reason,paths in [
 (2,'PASS','Reload observer: disabled “Checking for mixed reality…” before support completed; session inactive.',['audit/raw/shell.json','audit/vr/quest-shell-exit.jpg']),
 (3,'PASS','Supported gate enabled with exact text “Enter your garden”.',['audit/raw/shell.json','audit/vr/quest-shell-exit.jpg']),
 (4,'PASS','Real unsupported network-origin browser: disabled “Open on a Meta Quest 3 / 3S” and exact Setup required message, no session.',['audit/2d/desktop/D2-34.json','audit/2d/mobile/D2-34.json']),
 (5,'PASS','375 px supported shell: 0 px overflow; entry height 49.1875 px. Supported/unsupported text captured.',['audit/raw/shell.json','audit/vr/quest-shell-375.jpg','audit/2d/mobile/D2-28.json']),
 (6,'PASS','Actual entry click hid #page and launched immersive-ar; exit revealed page. Before/after exported ledgers equal.',['audit/raw/shell.json','audit/vr/quest-shell-exit.jpg']),
 (11,'PASS','All 12 named sectors separately hovered/selected with 0 habits; Pick a habit / centre: cancel captured.',['audit/raw/quest-extra.json','audit/vr/quest-clean.jpg']),
 (12,'PASS','Water: 8 a day · kitchen counter / ×8; Eye breaks: 4 a day · monitor / ×4; Stretch: daily · doorway; 0 habits on each hover.',['audit/raw/quest-extra.json','audit/vr/quest-clean.jpg']),
 (16,'PASS','Every separate preset pinch yielded aiming with 0 habits. Later surface pinches, begun more than 30 ms afterward, created one habit.',['audit/raw/quest-extra.json','audit/raw/quest-deep-rows.json']),
 (19,'PASS','Right-hand disconnect after a valid hit: selection created 0 habits/anchors. Reconnect plus fresh hit produced exactly 1. The preview still showed the other hand hit; row 19 does not require its disappearance.',['audit/raw/quest-more-rows.json','audit/vr/VR-19.jpg']),
 (25,'PASS','Native IWER anchors capability removed. Exact setup toast captured; placement attempt left 0 habits, 0 sprouts and 0 live habit anchors. Flight did not settle, an additional limitation outside this row’s expected cell.',['audit/raw/anchor-denied.json','audit/raw/quest-events.jsonl.gz']),
 (54,'PASS','Fresh Stretch 1 and Water 2/8 ledger, IDs and saved day maps retained through reload; focus history retained.',['audit/raw/quest-extra.json','audit/raw/quest-final-events.jsonl.gz']),
 (55,'PASS','Both saved handles restored; live count 2 and root displacement 0.00 cm / 0.00 cm. No new placement pinch.',['audit/raw/quest.json','audit/raw/quest-extra.json','audit/raw/quest-final-events.jsonl.gz']),
 (56,'PASS','Tray how=restored, saved local position/quaternion unchanged within 1 cm. The 25/50-minute reload observations also retained running timer start/duration.',['audit/raw/quest-more-rows.json','audit/raw/quest-deep-rows.json']),
 (57,'PASS','Real IWER persistent-store removal then reload: both outcomes pin-again, 0 real sprouts; ledger, stages and focus history retained.',['audit/raw/quest.json','audit/raw/quest-final-events.jsonl.gz']),
 (72,read('audit/raw/production.json')['status'],'Production browser: __mebae undefined; native wall-clock elapsed time matched Node; no errors. Build check printed the exact no-test-hooks message.',['audit/raw/production.json','audit/raw/build.txt','audit/vr/VR-72.jpg']),
 (95,'PASS','Contrast on/off booleans and exact toasts observed; black/white/yellow styling captured in native canvas calls and screenshot.',['audit/raw/quest-deep-rows.json','audit/vr/quest-contrast.jpg','audit/raw/quest-events.jsonl.gz']),
 (104,'PASS','Meta VR Glasses / home_office, hand input; gaze-tracking enabled. Native gaze source/valid emulated pose console messages and successful gaze targeting captured.',['audit/raw/glasses.json','audit/raw/glasses-events.jsonl.gz','audit/raw/glasses-extra.json']),
 (105,'PASS','Gaze + right pinch opened 12 sectors; Deep work selection entered aiming.',['audit/raw/glasses.json','audit/raw/glasses-events.jsonl.gz']),
 (106,'PASS','One Deep work on desk, one live anchor, on: desk text; root and gaze hit coincided within 2 cm.',['audit/raw/glasses.json','audit/raw/glasses-events.jsonl.gz','audit/vr/glasses-normal.jpg']),
 (107,'PASS','Deep work count 1, stage 1, Done today / stage 1/7 captured after one gaze pinch.',['audit/raw/glasses.json','audit/raw/glasses-events.jsonl.gz']),
 (108,'PASS','Gaze opened This week with one seven-segment Deep work ring; separate panel pinch closed it.',['audit/raw/glasses.json','audit/raw/glasses-extra.json','audit/raw/glasses-events.jsonl.gz']),
 (109,'PASS','Gaze disconnect: hand ray closed Week. Reconnect restored gaze selection and panel close, with the same garden.',['audit/raw/glasses.json','audit/raw/glasses-extra.json']),
 (110,'PASS','Normal actual transformed instance and UI rectangle corner bounds all within horizontal ±34°, vertical −40°…22°. No missing shapes skipped.',['audit/raw/glasses-extra.json','audit/vr/glasses-normal.jpg']),
 (111,'PASS','Large radial, Large Week and five sample plants/labels: every actual corner inside unchanged margins. Radial selection/cancel and Week open/close observed.',['audit/raw/glasses-extra.json','audit/vr/glasses-large-radial.jpg','audit/vr/glasses-large-week.jpg','audit/vr/glasses-sample.jpg']),
 (112,'PASS','DEV-only real-ledger fixture: six tracked stage-7 plants, all forced into rendering; exactly 600 frames. Fixture history is test setup.',['audit/raw/perf.json','audit/raw/perf-events.jsonl.gz']),
 (113,'PASS','CPU p50 0.80 ms, p95 1.20 ms, max 2.30 ms, priority −100 PerfStart through scene.onAfterRender. Uncalibrated desktop proxy, unverified on Quest.',['audit/raw/perf.json']),
 (114,'PASS','Raw renderer.info.render.calls max 48 ≤ 50, both XR views included; no halving.',['audit/raw/perf.json']),
 (115,'PASS','Raw renderer triangle maximum 37664 ≤ 150000 over the same 600 frames.',['audit/raw/perf.json']),
 (118,'PASS','Complete kitchen interval: 0 console errors, 0 page errors, 0 failed requests, 0 unexpected HTTP errors.',['audit/raw/kitchen-capture.json','audit/raw/kitchen-events.jsonl.gz']),
 (119,'PASS','Complete Glasses and Week supplement: 0 console/page errors, failed requests or unexpected HTTP errors.',['audit/raw/glasses-capture.json','audit/raw/glasses-week-capture.json','audit/raw/glasses-events.jsonl.gz','audit/raw/glasses-week-events.jsonl.gz']),
 (120,'PASS','Perf setup/warm-up/600 frames/idle supplement: 0 console/page errors, failed requests or unexpected HTTP errors.',['audit/raw/perf-capture.json','audit/raw/perf-events.jsonl.gz']),
 (121,'PASS','Fresh playable 35.000-second recording, 2100 frames, error null, multiDayFootage false. First-day real growth and exact NOT a recorded later day sample caption.',['audit/raw/whoa.json','audit/raw/video-probe.json','audit/vr/first-day.mp4','audit/vr/whoa-caption.jpg']),
 (127,'PASS','Captured create/check-in/focus/Week/sample/move/archive/reload traffic: 0 product API calls and 0 history uploads. Static/fonts and IWSDK test transport identified separately.',['audit/raw/quest-events.jsonl.gz','audit/raw/quest-edge-events.jsonl.gz','audit/raw/glasses-events.jsonl.gz','audit/raw/perf-events.jsonl.gz']),
 (128,'PASS','0 blockchain RPC/contract requests, wallet signature requests or submitted transactions across captured garden flows.',['audit/raw/quest-events.jsonl.gz','audit/raw/glasses-events.jsonl.gz','audit/raw/perf-events.jsonl.gz']),
 (129,'PASS','0 product MCP calls. IWSDK automation is test infrastructure; no garden MCP integration.',['audit/raw/quest-events.jsonl.gz','audit/raw/glasses-events.jsonl.gz','audit/raw/perf-events.jsonl.gz']),
]:put(n,status,reason,paths)
# Exact mismatches and measurement gaps are not promoted from a neighbouring PASS.
failures={
 1:'Execution contract incomplete: required tracked-pose-loss, enlarged-target and native audio/upload measurements remain absent. See explicit coverage failures below.',
 13:'Aiming-seed attempt: Pressed targets [], mode flying, lifted seed true, not idle. Radial centre/seed/tray and aiming-tray cancellation passed; five attempts recorded.',
 18:'No-hit right-hand attempt still displayed reticle=true and arc=true from the other hand’s wall hit. Placement refused with 0 habits; later valid placement recovered.',
 62:'0 complete tracked-pose-loss observations captured; rejected restore alone does not establish the entire row.',
 65:"1 uncaught page error during native IndexedDB test-context initialization: Failed to execute 'open' on 'IDBFactory': access to the Indexed Database API is denied in this context. Product storage message/entry otherwise matched.",
 70:'All stage totals matched and forms were deterministic, but the final four-plant fixture rendered moss / fern / moss / maple: Water hit a vertical desk surface, so the bamboo stage matrix has 0 complete captures.',
 71:'Five-day fixture produced 6 flowers per plant, but labels showed Resting: a missed day pauses growth instead of In bloom this week; the next-week labels also omitted bloom text.',
 78:'Wrist toggles worked, but closed=false immediately after Close while the palm stayed up; menu reappeared before a new palm-up gesture.',
 83:'Actual seed refusal toast: Example garden (sample data). Turn off the example garden to plant your own habits. Expected cell omits that prefix. Counts/anchors/history unchanged.',
 84:'During carrying, a Sample-target pinch archived Stretch (active habits 1 → 0) and said Stretch is back in the tray as a seed. Its history is kept (export includes it). Expected no mutation.',
 94:'Capacity move was not established: after the stake attempt mode remained idle, all six handles unchanged, peak reserved slots 7. No capacity-move PASS claimed.',
 96:'0 complete enlarged seed/stake/radial/pot ray-and-poke matrices captured. Large settings/label scale persistence and six enlarged Pin again targets were observed, which is partial coverage.',
 98:'Synthesized oscillator schedules and 0 sound-file requests captured, but 0 native AudioContext-running/unlock measurements were retained; complete root/tap/grow/undo audio assertion not established.',
 116:'6 tracked stage-7 plants and zero rakeWrites/texture-version deltas observed over 1200 ms; 0 native GL upload counters captured. Version counters do not establish the required actual upload count.',
 117:"Complete office/core + supplements: console errors 0, page errors 1, failed requests 0, unexpected HTTP errors 0. The page error is the native test-context IndexedDB open denial; the final 30-check core replay was clean.",
}
failures.pop(65,None);failures.pop(117,None)
put(65,'PASS','Native version-2 IndexedDB open failed with the exact Storage unavailable message; loaded=true, entry enabled, immersive tray initialized, 0 sprouts/anchors. The about:blank setup guard was fixed and this final interval has 0 errors.',['audit/raw/storage-final-rows.json','audit/vr/VR-65-flat.jpg','audit/vr/VR-65.jpg','audit/raw/storage-final-events.jsonl.gz'])
put(117,'PASS','Retained complete Quest office/core/supplement intervals and guarded storage rerun: 0 console errors, 0 page errors, 0 failed requests, 0 unexpected HTTP errors. Superseded broken test-context initialization was removed and re-verified.',['audit/raw/quest-capture.json','audit/raw/quest-edge-capture.json','audit/raw/quest-final-capture.json','audit/raw/storage-final-capture.json','audit/raw/growth-capture.json'])
for n,reason in failures.items():
 old=rows.get(f'VR-{n:02d}',{});paths=old.get('evidence',['audit/raw/quest-events.jsonl.gz'])
 if n in [1,65,117]:paths+=['audit/raw/quest-edge-capture.json','audit/raw/quest-edge-events.jsonl.gz','audit/raw/quest-final-capture.json']
 if n==98:paths+=['audit/raw/quest-final-events.jsonl.gz']
 put(n,'FAIL',reason,paths)
untested={
 21:'Needs an emulator room with at least two overlapping labelled bounded semantic meshes to verify smallest-mesh priority. This office only established desk mesh-label and door plane-label.',
 22:'Needs four genuinely unlabelled detected planes with the required orientations/heights; supplied rooms do not establish that matrix. No semantic-label result mock used.',
 26:'Needs a native runtime that rejects anchor creation and subsequently succeeds. IWER capability denial did not supply that rejection/recovery pair.',
 27:'Needs a native live anchor that does not return a persistent handle. This IWER runtime supplies persistent handles.',
 61:'Needs a native runtime without restorePersistentAnchor in addition to null/no-placement histories; current IWER always exposes that API.',
 63:'Needs native controllable interruption windows during anchor create and restore as well as flight/carry; no delayed promise or restore mock substituted.',
 64:'Managed Chrome automation auto-dismissed the real import confirm, including the isolated-context attempt. Needs a browser session in which that native confirmation can be accepted. No successful same-ID live-anchor import claimed.',
 66:'Needs actual ledger/settings/tray transaction rejection. Chrome native zero-quota override did not reject these small writes; no storage method/result stubs substituted.',
 69:'Needs an actual local-midnight crossing (and DST crossing for a timezone with DST). Whole-day DEV jumps do not establish the cadence/next-render behavior.',
 90:'Needs a genuine failed new-anchor rejection in addition to the no-hit move case; current runtime did not supply that failure/recovery fixture.',
 99:'Needs a browser environment with Web Audio genuinely unavailable. Native AudioContext remains exposed here; no API-removal mock substituted.',
 122:'Needs recordings of this same real garden on two separate actual calendar days; the fresh first-day/sample clip does not supply them.',
 123:'Needs a physical Quest 3/3S and return on another actual day; desktop anchor restoration is not hardware verification.',
 124:'Needs a physical scanned room and Quest hit-test/anchors; emulator analogue passed separately.',
 125:'Needs physical Quest frame-time/fps measurements with six stage-7 plants; desktop CPU proxy is uncalibrated.',
 126:'Needs physical Quest hand tracking for the 20-pinch/hold/under-60-second matrix; emulator hands are not hardware verification.',
}
for n,reason in untested.items():put(n,'UNTESTED',reason,rows.get(f'VR-{n:02d}',{}).get('evidence',['audit/raw/quest-events.jsonl.gz']))
# Files can have been compressed after measurements; preserve only existing links.
for r in rows.values():r['evidence']=[ref(p) if not p.endswith('.gz') else p for p in r['evidence']]
# Flat checks were actually executed at both widths. Every error-level entry fails.
for n in list(range(1,33))+[34]:
 id=f'D2-{n:02d}';logs=[read(f'audit/2d/{w}/{id}.json') for w in ['desktop','mobile']];bad=[c for l in logs for c in l['checks'] if not c['ok']];errors=[e for l in logs for e in l['console'] if e['type']=='error']
 status='FAIL' if bad else 'PASS';reason='Both desktop and 375 px observations matched exactly; zero console/page/unexpected network errors.'
 if errors:reason=f"Desktop + 375 px: {len(errors)} error-level console entries. "+ ('TypeError: Cannot read properties of null (reading \'filter\'). Exact startup status matched; zero-error rule failed.' if n==27 else 'Chrome resource error: Failed to load resource: the server responded with a status of 404 (File not found), for history.json. HTTP 404 is expected; console error is still a failure under the user rule.')
 rows[id]={'status':status,'observed':reason,'evidence':[f'audit/2d/{w}/{id}.{ext}'for w in ['desktop','mobile']for ext in ['json','jpg']]}
for n in [30,31,32]:rows[f'D2-{n}']['evidence']+=['audit/2d/core-assertions.json','audit/raw/core-vitest.txt']
rows['D2-33']={'status':'PASS','observed':'Vitest: 6 files / 61 tests passed, 0 failures. Empty-day undo exact result and unchanged other-day history independently asserted.','evidence':['audit/2d/D2-33.json','audit/2d/core-assertions.json','audit/raw/core-vitest.txt']}
rows['D2-35']={'status':'UNTESTED','observed':'Needs a physical Quest headset / Quest Browser.','evidence':['audit/2d/D2-35.json','audit/raw/shutdown.json']}
rows['VR-64']['evidence']=[ref('audit/raw/import-live.json')]
rows['VR-66']['evidence']=[ref('audit/raw/quest-native-rows.json')]
lines=(root/'AUDIT.md').read_text().splitlines();out=['# Mebae audit','', 'Fresh local run: 2026-10-27. One heavy slot; Chrome for Testing, managed IWER Quest 3 / kitchen then home_office, Glasses / home_office, and Quest performance. Real hardware remains UNTESTED.','', 'Every error-level console entry is a failure, including the expected-history-404 Chrome resource log. Driver check totals and complete audit row totals are separate. Measurement gaps are FAIL, not inferred PASS; genuinely absent native conditions are UNTESTED.','', '| ID | component/flow | exact expected result | status | evidence | fix |','| --- | --- | --- | --- | --- | --- |']
fixes={13:'Earlier 9bc32b7 deferred placement behind PressRouter. Tray cancellation re-verified; aiming-seed target still did not cancel. No t7 product fix.',31:'Earlier a719a1a aligned instance spherecast intersection data; real index-tip poke and near-seed negative verified.',96:'Earlier instance spherecast and larger-target work retained. Full enlarged target matrix still lacks measurements.',110:'Earlier cd1a10a fit sample flora; actual transformed instance bounds re-verified.',111:'Earlier cd1a10a reduced enlarged radial/sample bounds; all unchanged margin checks now pass.',114:'Earlier ba68799 batched settled flora/stakes and removed duplicate card passes. Re-verified raw max 48 ≤ 50.'}
for line in lines:
 if not re.match(r'\| (VR|D2)-\d+',line):continue
 c=[x.strip()for x in line.split('|')[1:-1]];id=c[0]
 if id not in rows:rows[id]={'status':'FAIL','observed':'0 complete fresh observations captured for this exact expected cell. This is an evidence gap, not an inferred product defect.','evidence':['audit/raw/quest-events.jsonl.gz']}
 r=rows[id];c[3]=r['status'];c[4]=r['observed'].replace('|','／')+' · '+' · '.join(f'[evidence {i+1}]({ref(p)})' for i,p in enumerate(r['evidence']))
 if id.startswith('VR-') and int(id.split('-')[1]) in fixes:c[5]=fixes[int(id.split('-')[1])]
 elif id=='D2-27':c[5]='Unresolved audit contract conflict: expected startup path calls console.error, while the user rule fails every console error. No error reporting silenced.'
 elif r['status']=='FAIL':c[5]='No product source edit in t7; observed mismatch or coverage gap remains as stated.'
 elif c[5].startswith('Pending Phase'):c[5]='Fresh observation supplied in this run; no product fix required for the former evidence gap.'
 out.append('| '+' | '.join(c)+' |')
counts=collections.Counter(r['status']for r in rows.values());out+=['','Row counts: '+', '.join(f'{counts[k]} {k}'for k in ['PASS','FAIL','UNTESTED'])+'.','', 'Performance: 600 frames; CPU p95 1.20 ms; raw draw calls max 48; triangles max 37664. Uncalibrated desktop proxy; unverified on Quest hardware.','', 'No product source changes or product mocks/stubs were introduced in this task. Native capability configuration, real file/database inputs and pass-through observers are identified in the evidence. Full-plan acceptance is not achieved: every remaining failure/gap is explicit above.']
rows['VR-64']['evidence']=[ref('audit/raw/import-live.json')]
rows['VR-66']['evidence']=[ref('audit/raw/quest-native-rows.json')]
(root/'AUDIT.md').write_text('\n'.join(out)+'\n');(root/'audit/vr/rows.json').write_text(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':dict(counts),'rows':rows},indent=2)+'\n');print(dict(counts));print('FAIL IDs:',','.join(k for k,v in rows.items()if v['status']=='FAIL'))
