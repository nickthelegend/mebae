import collections, gzip, json, re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
audit = root / 'AUDIT.md'
lines = audit.read_text().splitlines()
events = [json.loads(x) for x in gzip.open(root/'audit/raw/browser-events.jsonl.gz', 'rt')]
observations = [json.loads(x) for x in gzip.open(root/'audit/raw/observations.jsonl.gz', 'rt')]
passes = {
2: 'The real reload observer recorded disabled “Checking for mixed reality…” before the enabled entry state; no session was entered on reload.',
3: 'Supported entry was enabled with exact text “Enter your garden”.',
5: 'Supported shell at 375 px: enter height 49.1875 px, horizontal overflow 0 px; screenshot reviewed.',
6: 'One real entry-button click produced immersive mode and hid #page; exit revealed it. Exported ledger was identical before and after.',
7: 'Cold office: no habits/sprouts/stones, sample false, six free seed slots, exact empty hint observed on the canvas.',
9: 'Office detected 13 planes and 9 meshes. Hand placements resolved desk and door; the fresh tracked door anchor classified as door / plane-label.',
11: 'All twelve named presets were hovered and selected in separate clean attempts. Every selection produced aiming with 0 habits. The canvas observer also captured “Pick a habit” / “centre: cancel”.',
12: 'Actual radial canvas text captured Water / 8 a day · kitchen counter / ×8, Eye breaks / 4 a day · monitor / ×4, and Stretch / daily · doorway, at 0 habits.',
14: 'Stretch rooted on the detected door with one live anchor and a nonempty handle; root-to-hit distance 0 cm. Actual canvas label reads Stretch / on: door.',
16: 'All twelve menu selections were observed in aiming with 0 habits. The later, separate surface pinch planted one habit.',
29: 'Actual Stretch canvas changed from Pinch when done to Done today / stage 1/7; count 0→1 and stage 0→1. Fresh clip shows the first growth.',
30: 'Second Stretch pinch retained count 1 / stage 1, displayed the exact done-for-today toast, and exported one completed day.',
32: 'Three 0.15-second Water selections yielded count 3 and visible 3/8 with the exact pinch/hold hint; stage remained 0.',
33: 'A stationary 1.3-second Water selection changed 3→2 exactly once; after release count remained 2 and the canvas showed Undone: Water 2/8.',
48: 'One-hand on/off booleans, exact toasts and undo text on both real labels observed; highlighted control shown in the screenshot.',
50: 'Original Quest interval observed one short pinch starting 25 minutes, pinch: 50 min on the timer, and unchanged rakeWrites=0.',
52: 'Single-pinch cancellation observed before any completed stone, with stones 0, exact cancellation toast and fresh idle action text.',
54: 'Two real IDs, complete count maps, labels and focus history matched across the additional reload: Stretch stage 1 and Water 2/8.',
55: 'Both original handles restored, two live anchors; stock suite measured 0.00 cm displacement for both sprouts. Additional reload retained their saved handles.',
57: 'After the stock DEV anchor-forget operation, both outcomes were pin-again, real history retained and no real sprouts drawn.',
59: 'Existing Stretch pot entered aiming and re-pinned the same ID with a fresh handle; observed root matched hit, pot disappeared and stage/count history remained.',
67: 'Stock DEV clock advanced Oct 27→28, and the next Stretch check-in reached stage 2 with today count 1 while retaining the prior completed day.',
68: 'Three more DEV days produced resting at stage 2; the anchored plant remained drawn and actual label said Resting: a missed day pauses growth.',
79: 'Sample toggling drew exactly five sample-tagged sprouts with the five expected names, while the exported real ledger and handles stayed unchanged.',
80: 'Actual canvas text captured the uppercase sample stamp on tray, all five labels, wrist and Week; focus card had its exact sample title. Week stamp remained visible while tray stamp was hidden.',
81: 'Sample sprout pinch showed the exact refusal, no sample stake existed, and real ledger and sample stage/counts stayed unchanged.',
82: 'Sample sand tap displayed the exact refusal, real idle focus and stones stayed unchanged, and the real exported ledger was identical.',
87: 'One stake pinch entered carrying with the exact toast, Week closed, and no check-in, immediate drop or archive occurred.',
91: 'Tray drop archived Stretch on the actual local day, nulled placement, freed one slot and removed one active habit/sprout/live anchor; exact history-kept toast captured.',
95: 'Contrast on/off settings and exact toasts observed; reviewed on-state screenshot shows black/white/yellow cards and highlighted Contrast.',
100: 'Kitchen state recorded Quest 3, hand input, 14 planes / 16 meshes and tray how=desk / on=table. Driver derived its seating and placement from the detected table. The kitchen screenshot was lost; see VR-01.',
104: 'Glasses profile, home_office, hand mode, connected gaze source and gaze-tracking feature recorded in fresh XR/device reports.',
105: 'Gaze plus right-hand pinch opened the twelve-target radial and selected Deep work into aiming.',
106: 'Glasses created one anchored Deep work on desk; saved state has root and gaze-hit points equal (0 cm), and actual canvas says on: desk.',
107: 'Gaze plus one pinch produced count 1, stage 1 and actual Done today / stage 1/7 canvas text.',
109: 'Stock driver disconnected gaze and closed Week with the hand ray; supplemental reconnected gaze opened Week and closed it by panel pinch without garden reset.',
112: 'DEV performance-only fixture produced six real anchored stage-7 plants on detected surfaces; forcePlantDraws included all six and the measured sample contained exactly 600 frames.',
113: '600-frame desktop emulator CPU proxy: p50 1.5 ms, p95 2.4 ms, max 3.1 ms. Scope is first ECS-system timestamp through scene.onAfterRender; not headset performance.',
115: 'Same 600-frame sample: raw renderer.info.render.triangles max 37556 (no stereo division).',
118: 'Complete kitchen driver interval captured by Playwright: no error console entries, page errors, failed requests or unexpected 4xx/5xx. Fresh table/count/Week state retained.',
119: 'Complete Glasses driver plus supplemental gaze/FoV interval captured by Playwright: zero console/page/network errors.',
120: 'Complete performance setup, warm-up, 600-frame sample and idle interval captured by Playwright: zero console/page/network errors.',
121: 'Fresh 35.000-second H.264 clip, 2100 captured source frames / 840 encoded frames, error null and multiDayFootage false. Reviewed real stage-1 frame and burned-in later sample qualification.',
127: 'Captured create/check-in/focus/Week/sample/move/archive/reload traffic contains only GET static/font/CDN/blob assets. No application API or history upload observed; real ledger persisted locally.',
128: 'No blockchain RPC/contract requests, wallet-signature request or transaction observed during the tested garden actions; no product blockchain integration exists.',
129: 'No product MCP request observed. FRAMEWORK_MCP_RUNTIME and iwsdk bridge traffic are test infrastructure, not a garden integration.',
}
failures = {
1: 'Evidence coverage is incomplete: profile change replaced CDP and the beginning of the Quest suite was not network-captured; kitchen screenshot was overwritten. CLI log API rejects counts above 200. Later intervals have full CDP capture and zero errors, but cannot fill that gap.',
4: 'Unavailable/rejected immersive-ar support was not exercised in this managed IWER session. No feature-result mock was substituted.',
8: 'Cold tray used desk and was visible, but the 0.2-cm detected-top offset was not directly measured in the cold observation.',
10: 'Core loop used hands with Quest gaze absent; the separate head-only negative placement/check-in check was not observed.',
13: 'Observed failure: pinching the lifted seed/tray while aiming entered flying rather than idle. Reticle/arc hid but lifted seed stayed visible. Repeated clean preset attempts recorded the same result; no cancellation pass claimed.',
15: 'Left-hand Water planting succeeded at the desk. Simultaneously divergent left/right hit positions were not captured, so right-hit substitution was not excluded.',
17: 'Aim preview and rooting were observed, but the complete flight duration/alignment and repeated-pinches-during-flight duplicate gate were not measured.',
18: 'Empty-space refusal and subsequent recovery were not observed against a genuinely missing room hit.',
19: 'Hand disconnect with a cached placement hit was not driven.',
20: 'Fresh placements used hit-test; no genuine no-hit-test plane-raycast path was observed.',
21: 'Actual door anchor classified door / plane-label. Smallest-mesh priority against overlapping labelled geometry was not observed.',
22: 'Four genuinely unlabelled detected-plane orientation/height cases were not observed.',
23: 'Full moss/fern/bamboo/maple orientation and directly-overhead label matrix was not driven.',
24: 'A genuinely unavailable-room float fallback was not observed.',
25: 'Anchor permission denial was not supplied by the runtime; exact refusal branch remains unobserved.',
26: 'Genuine anchor creation rejection and subsequent recovery were not observed.',
27: 'Runtime supplied persistent handles; a live anchor without a handle and its reload outcome were not observed.',
28: 'Driver reported 11.6 s through pin/check-in and 9.9 s through pin, with stage 1 / today count 1. Those are rounded seconds; exact elapsed milliseconds required by this row were not retained.',
31: 'Near fingertip poke and idle-tip/far-ray priority were not driven.',
34: 'Zero-count held undo and new-day isolation were not driven.',
35: 'Water 7→8 saturation and undo-removes-completion were not driven.',
36: 'Eye breaks hover was checked, but its 4/4 counted loop and independent undo were not driven.',
37: 'Tracked-hand/session interruption during an active sprout press was not driven.',
38: 'Short sand tap showed the correct hint with idle focus; separate stationary-hold negative start was not observed.',
39: 'A 3303-ms rake started 25 minutes, but the <2000-ms negative threshold was not measured.',
40: 'One-hand extension passed; same-rake >=4000-ms extension/start-time behavior was not measured.',
41: 'Late extension and repeated raking of an existing 50-minute timer were not driven.',
42: 'Rake writes rose to 191 and idle rakeWrites was stable; actual texture-upload/version counts and shader-only fade were not recorded.',
43: 'Normal-mode stationary held cancellation was not driven; one-hand cancellation is separate evidence.',
44: '25-minute reload survived; exact startedAt/remainingMs equations and a separate 50-minute reload were not recorded.',
45: 'DEV elapsed-time settlement produced one stone; exact completedAt and repeat-update/reload idempotence were not all recorded.',
46: 'Elapsed-while-closed load settlement and second-reload idempotence were not driven.',
47: '21/22 focus-block history versus 20 rendered-stone cap was not driven.',
49: 'Undo chip text was visible, but an actual chip undo followed by main-label increment was not driven.',
51: '25→50 extension, exact toast and pinch: cancel card were observed, but the exact persisted startedAt before/after the extension was not retained.',
53: 'The complete loop with exactly one connected hand, including undo chip and move/archive, was not driven.',
56: 'Tray reported restored and returned to the desk; saved local quaternion and scene-anchor consumption were not recorded.',
58: 'Two lost-habit pots were observed; six separately pinchable enlarged lost-habit cards were not tested.',
60: 'Mixed valid/missing persistent-handle restore was not driven.',
61: 'Missing-placement, null-handle and unsupported-restore branches were not independently observed.',
62: 'Genuine restore rejection/timeout and tracked-anchor pose loss were not observed.',
63: 'Session interruption during each flight/create/restore/carry stage was not driven.',
64: 'Imported same-ID/different-handle XR restoration was not driven in this session.',
65: 'Genuine IndexedDB open failure was not observed in this session; prior 2D evidence was not substituted.',
66: 'Ledger/settings/tray save failures were not independently observed.',
69: 'Actual local-midnight transition and next-render rollover were not observed; whole-day DEV jumps are not that test.',
70: 'All eight stage thresholds across all four species and deterministic reload geometry were not driven.',
71: 'Real-ledger four/five-day bloom boundaries, next-week retention and third-week expiry were not driven.',
72: 'Production build/check-dist passed, but window.__mebae and real wall-clock behavior were not observed in a production browser runtime.',
73: '700-ms palm-up showed all six wrist items; exact normal threshold, 9-cm placement and 250/400-ms boundaries were not measured.',
74: 'Wrist Week opened and actual heading/footer were captured; exact seven-segment ring count per active habit was not instrumented.',
75: 'Week interactions were observed, but repeated real-view tray/panel close, duplicate-ring count and unchanged anchors were not all captured.',
76: 'Empty-garden Week text and zero rings were not observed.',
77: 'Partial/full/future segment fractions, archived-ring exclusion and weekly-only stone sum were not measured.',
78: 'All four alternate wrist toggles and Close/reopen were not driven.',
83: 'The supplemental tray-centre pinch hit sample sand and showed the focus refusal, not the required seed refusal. Correct seed refusal remains unobserved.',
84: 'Sample-switch guard was not exercised separately during radial, aiming, flying and carrying.',
85: 'Sample-off restored real IDs/positions/history, but reload while sample remained on was not driven.',
86: 'Real timer completion while viewing sample was not driven.',
88: 'Move succeeded with a new handle, unchanged history and one sprout; exact deletion of the old persistent handle was not captured.',
89: 'Horizontal fern/maple/bamboo→wall→horizontal species matrix was not driven.',
90: 'Missing move hit and genuine new-anchor rejection were not driven.',
92: 'Archived history stayed exported after reload and the sprout stayed absent; later planting into the freed slot was not driven.',
93: 'Six anchored habits and the full hint were captured. The attempted full-tray centre pinch hit sand and showed the rake hint, so the required seventh-seed refusal was not observed.',
94: 'Capacity move and rapid duplicate pinches with reserved/live slot accounting were not driven.',
96: 'Large on/off persisted and label/menu scales 1.4 were observed; seed/stake/radial/pot scaling and enlarged poke/ray target matrix were not all measured.',
97: 'Three settings persisted together and disabled independently with history unchanged; actual combined-settings undo-chip single-pinch action was not driven.',
98: 'No audio asset requests/errors were observed, but synthesized note sequences and audio unlock were not recorded.',
99: 'Web Audio unavailable case was not exercised.',
101: 'Kitchen created one table anchor with root-to-hit distance 0 cm; the exact rendered on: table label was not retained and the kitchen screenshot was overwritten.',
102: 'Kitchen driver confirmed 3→2 counts with a 1.3-second hold; exact rendered 3/8 and 2/8 text was not retained in a valid kitchen screenshot/canvas record.',
103: 'Kitchen Week opened; exact heading, seven segments and subsequent panel pinch close were not observed.',
108: 'Glasses Week opened and supplemental panel pinch closed it; exact seven-segment Deep work ring count was not recorded.',
110: 'Driver FoV centres/cards passed, but supplemental sprout bounds omitted per-instance transforms and are invalid for rendered plants. Correct normal-profile actual sprout bounds remain unverified.',
111: 'Valid enlarged radial corners reach +22.55 degrees, beyond +22. Sample label card bounds also exceed the margin. Do not use the invalid instanced sprout bounds.',
114: 'Raw renderer.info.render.calls max is 92, above the unchanged gate of 50. No stereo halving.',
116: 'Six stage-7 plants and unchanged idle rakeWrites passed; actual sand texture write/upload counts were not recorded.',
117: 'Quest profile change replaced CDP before reconnect. Initial create/check-in interval has no complete network/page-error capture; the later zero-error intervals cannot establish the complete-suite requirement.',
}
assert not (passes.keys() & failures.keys())
assert set(passes) | set(failures) == set(range(1,130)) - set(range(122,127))

suite_for = lambda n: ('kitchen' if 100 <= n <= 103 or n == 118 else 'glasses' if 104 <= n <= 111 or n == 119 else 'perf' if 112 <= n <= 116 or n == 120 else 'quest')
def artifacts(n):
    suite = suite_for(n)
    refs = [f'audit/raw/{suite}.json']
    if n in range(2,7): refs += ['audit/raw/shell.json','audit/vr/quest-shell-375.jpg','audit/vr/quest-shell-exit.jpg']
    elif n == 121: refs += ['audit/raw/whoa.json','audit/raw/video-probe.json','audit/vr/first-day.mp4','audit/vr/whoa-real-growth.jpg','audit/vr/whoa-caption.jpg']
    elif n in [113,114,115,112,116,120,93,94]: refs += ['audit/raw/capacity-extra.json','audit/vr/quest-capacity.jpg']
    elif suite == 'glasses': refs += ['audit/raw/glasses-extra.json','audit/vr/glasses-driver.jpg']
    elif suite == 'kitchen': refs += ['audit/raw/kitchen-state.json']
    else: refs += ['audit/raw/quest-extra.json','audit/vr/quest-clean.jpg']
    if n in [13]: refs += ['audit/raw/quest-cancel-failure.json']
    if n in [9,21]: refs += ['audit/raw/office-geometry.json']
    if n in [79,80,81,82,83,84,85,86]: refs += ['audit/vr/quest-sample-week.jpg']
    if n in [87,88,89,90]: refs += ['audit/vr/quest-moved.jpg']
    if n in [91,92]: refs += ['audit/vr/quest-archive.jpg']
    if n in [48,49,50,51,52,53,97]: refs += ['audit/vr/quest-onehand.jpg']
    if n == 95: refs += ['audit/vr/quest-contrast.jpg']
    if n == 96: refs += ['audit/vr/quest-large.jpg']
    if n == 72: refs += ['audit/raw/build.txt','audit/raw/typecheck.txt']
    refs += ['audit/raw/browser-events.jsonl.gz','audit/raw/observations.jsonl.gz']
    return list(dict.fromkeys(refs))

rows = []
original_d2 = [x for x in lines if x.startswith('| D2-')]
for i,line in enumerate(lines):
    if not re.match(r'\| VR-\d+ ',line): continue
    cells = [x.strip() for x in line.split('|')[1:-1]]
    n = int(cells[0].split('-')[1])
    if cells[3] == 'UNTESTED': continue
    status = 'PASS' if n in passes else 'FAIL'
    reason = (passes if n in passes else failures)[n]
    refs = artifacts(n)
    suite = suite_for(n)
    selected_shots = [x for x in refs if x.endswith('.jpg')]
    links = [f'[suite]({refs[0]})']
    observation = next((x for x in refs[1:] if x.endswith('.json')),None)
    if observation: links.append(f'[observations]({observation})')
    if selected_shots: links.append(f'[view]({selected_shots[-1]})')
    if n == 121: links.append('[35 s clip](audit/vr/first-day.mp4)')
    links += ['[console/network](audit/raw/browser-events.jsonl.gz)','[coverage](audit/vr/rows.json)']
    cells[3] = status
    cells[4] = reason + ' · ' + ' · '.join(links)
    cells[5] = '' if status == 'PASS' else 'Audit-only scope; no product fix. '
    lines[i] = '| ' + ' | '.join(cells) + ' |'
    rows.append({'id':f'VR-{n:02d}','status':status,'expected':cells[2],'observed':reason,'suite':suite,'evidence':refs})
assert [x for x in lines if x.startswith('| D2-')] == original_d2
statuses = collections.Counter(re.search(r'\| (PASS|FAIL|UNTESTED|PENDING) \|',x)[1] for x in lines if x.startswith('| VR-'))
allstatuses = collections.Counter(re.search(r'\| (PASS|FAIL|UNTESTED|PENDING) \|',x)[1] for x in lines if re.match(r'\| (VR|D2)-',x))
lines = [x for x in lines if not x.startswith('Row counts:')]
lines += ['','Row counts: '+', '.join(f'{v} {k}' for k,v in sorted(allstatuses.items()))+f'. VR only: {statuses["PASS"]} PASS, {statuses["FAIL"]} FAIL, {statuses["UNTESTED"]} UNTESTED, {statuses["PENDING"]} PENDING.']
audit.write_text('\n'.join(lines)+'\n')
(root/'audit/vr/rows.json').write_text(json.dumps({'rows':rows,'vrCounts':dict(statuses)},indent=2,ensure_ascii=False)+'\n')
phase_summary = {}
for phase in sorted(set(e['phase'] for e in events)):
    es = [e for e in events if e['phase']==phase]
    phase_summary[phase] = {'firstCapturedAt':es[0]['at'],'lastCapturedAt':es[-1]['at'],'events':len(es),'consoleErrors':sum(e.get('level')=='error' for e in es),'pageErrors':sum(e['kind']=='pageerror' for e in es),'failedRequests':sum(e['kind']=='requestfailed' for e in es),'httpErrors':sum(e.get('status',0)>=400 for e in es)}
run = {'vrCounts':dict(statuses),'allRowCounts':dict(allstatuses),'browser':'Managed Chrome for Testing 156.0.8078.4 via IWSDK CDP; active IWER immersive-ar runtime, not a second browser','phaseSummary':phase_summary,'coverageGaps':['Quest initial profile-change/reconnect interval not captured.','Kitchen screenshot overwritten; retained kitchen state and complete network/console interval.','CLI browser logs API accepts at most 200 entries.','Actual instanced sprout bounds were not measured correctly; normal Glasses sprout fit is not established.'],'productSourceChanges':'None. iwsdk.config.json restored to metaQuest3 / home_office.','fixtureQualification':'preparePerf uses synthetic DEV history for performance setup only. Quest DEV calendar jumps are not actual elapsed days. Whoa clip has no clock advance and explicitly labels sample preview.','performance':json.load(open(root/'audit/raw/perf.json'))['metrics'],'clip':{'path':'audit/vr/first-day.mp4','durationSeconds':35,'sourceFrames':2100,'multiDayFootage':False,'temporaryFramesDeleted':True},'shutdown':json.load(open(root/'audit/raw/shutdown.json')),'noMocks':'No feature-denial, network, storage or anchor failure results were mocked. Canvas text wrappers forward original calls and only record telemetry.'}
(root/'audit/vr/run.json').write_text(json.dumps(run,indent=2,ensure_ascii=False)+'\n')
check_rows = {
 'kitchen': [[100],[101],[102],[102],[103],[118]],
 'quest': [[8],[9],[14],[14,21],[14],[29],[28],[32],[32],[33],[39],[54],[55],[55],[44],[52],[50],[51],[45],[57],[58],[59],[67],[68],[73],[74],[79],[82],[85],[117]],
 'glasses': [[104],[105],[106],[107],[108],[109],[110],[119]],
 'perf': [[112],[113],[114],[115],[116],[42,116],[120]],
}
driver_map=[]
for suite,mapping in check_rows.items():
    results=json.load(open(root/f'audit/raw/{suite}.json'))['results']
    assert len(results)==len(mapping)
    for check,ids in zip(results,mapping):
        driver_map.append({'suite':suite,'check':check,'auditRows':[f'VR-{n:02d}' for n in ids],'auditStatuses':{f'VR-{n:02d}':('PASS' if n in passes else 'FAIL') for n in ids},'qualification':'Driver checks may cover only part of a row; the row requires every exact expectation and full evidence.'})
(root/'audit/vr/driver-map.json').write_text(json.dumps(driver_map,indent=2,ensure_ascii=False)+'\n')
for row in rows:
    row['driverChecks']=[{'suite':m['suite'],**m['check']} for m in driver_map if row['id'] in m['auditRows']]
(root/'audit/vr/rows.json').write_text(json.dumps({'rows':rows,'vrCounts':dict(statuses)},indent=2,ensure_ascii=False)+'\n')
print(dict(statuses),dict(allstatuses))
