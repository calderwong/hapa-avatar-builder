#!/usr/bin/env python3
"""Prepare, never launch, a configured derivative of the supplied reference QA.
Original source is hash-pinned and untouched. Current checks remain independent
of unavailable historical 108.1 comparison. GPU qualification is a separate run.
"""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--browser-executable',type=Path,required=True);p.add_argument('--baseline-root',type=Path);p.add_argument('--software-rendering',action='store_true');args=p.parse_args()
root=args.source_root.resolve();original=root/'tools/browser109.py';raw=original.read_bytes()
if hashlib.sha256(raw).hexdigest()!='a28254f11ad979b9ec3edbfc02000f1fbaee566d6e24182e4d17bc26cb52e7b3':raise SystemExit('Supplied reference QA differs from reviewed source')
if not args.browser_executable.is_file():raise SystemExit('Browser executable is unavailable')
if args.output.exists():raise SystemExit('Output already exists; retain prior evidence')
baseline=args.baseline_root.resolve() if args.baseline_root else root.parent/'baseline/Hapa_Living_Light_108_1_Source'
browser_args=['--autoplay-policy=no-user-gesture-required']
if args.software_rendering:browser_args+=['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
text=raw.decode();old="ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa';BASE=ROOT.parent/'baseline/Hapa_Living_Light_108_1_Source'";new=f"ROOT=Path({str(root)!r});QA=ROOT/'qa';BASE=Path({str(baseline)!r})";assert text.count(old)==1;text=text.replace(old,new)
old="executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']";new=f'executable_path={str(args.browser_executable.resolve())!r},headless=False,args={browser_args!r}';assert text.count(old)==1;text=text.replace(old,new)
# Retain all current109 checks even when the historical artifact is unavailable.
start=text.index('   baseline=await load(browser,BASE)');end=text.index('   page=await load(browser,ROOT)',start)
block=text[start:end];case=next(line for line in block.splitlines() if line.startswith('   cases='));rest=block.replace(case+'\n','');rest='\n'.join(' '+line for line in rest.splitlines())+'\n'
text=text[:start]+case+'\n   historical_available=(BASE/"dist/OPEN_ME.html").is_file()\n   REPORT["historicalComparison"]={"state":"available" if historical_available else "unavailable", "reason":None if historical_available else "108.1 sibling baseline was not supplied; no parity pass inferred"};save()\n   if historical_available:\n'+rest+text[end:]
old="add('Standard parity '+str(i),hash==REPORT['baseline'][i]['sha256'],{'sha256':hash,'world':world,'time':t,'gl':out['glError']})";new="add('Standard parity '+str(i),hash==REPORT['baseline'][i]['sha256'],{'sha256':hash,'world':world,'time':t,'gl':out['glError']}) if historical_available else add('Current109 Standard frame '+str(i),out['glError']==0 and out['fault'] is None,{'sha256':hash,'world':world,'time':t,'gl':out['glError'],'historicalComparison':'unavailable'})";assert text.count(old)==1;text=text.replace(old,new)
compile(text,str(args.output),'exec');args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(text)
print(json.dumps({'prepared':str(args.output),'originalUnchanged':hashlib.sha256(original.read_bytes()).hexdigest()==hashlib.sha256(raw).hexdigest(),'browserExecutable':str(args.browser_executable.resolve()),'renderer':'explicit-software' if args.software_rendering else 'native-browser-default','historicalComparison':'available' if (baseline/'dist/OPEN_ME.html').is_file() else 'unavailable','launched':False,'qualificationClaim':False}))
