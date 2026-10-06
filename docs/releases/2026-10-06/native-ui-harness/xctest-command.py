from pathlib import Path
import json,time,sys,re
root=Path(__file__).resolve().parent
command=json.loads(sys.argv[1])
required={'drag':['x1','y1','x2','y2'],'tapPoint':['x','y'],'tap':['label'],'type':['label','text'],'input':['text']}
missing=[k for k in required.get(command.get('action'),[]) if k not in command]
if missing: raise SystemExit('Missing command fields: '+','.join(missing))
command['id']=str(time.time_ns())
p=root/'command-private.json';p.write_text(json.dumps(command));p.chmod(0o600)
for _ in range(60):
 time.sleep(1)
 r=root/'xctest-result.json'
 if r.exists():
  data=json.loads(r.read_text())
  if data.get('id')==command['id']:
   tree=re.sub(r'\b\d{6}\b','[REDACTED]',data['tree'])
   visible=[]
   for line in tree.splitlines():
    if not any(k in line for k in ['label:', 'placeholderValue:', 'TextField,', 'Keyboard,']):continue
    match=re.search(r'\{\{(-?[\d.]+), (-?[\d.]+)\}',line)
    if match and not (0<=float(match[1])<402 and 0<=float(match[2])<874):continue
    visible.append(line.strip())
   print('\n'.join(visible)[:15000]);break
else:raise SystemExit('XCTest command pending; inspect runner state before retrying')
