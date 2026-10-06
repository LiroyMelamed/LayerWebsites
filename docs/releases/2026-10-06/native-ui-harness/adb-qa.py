from pathlib import Path
import subprocess,json,sys,xml.etree.ElementTree as ET,re,time
root=Path(__file__).resolve().parent
adb='/Users/liroymelamed/Library/Android/sdk/platform-tools/adb'
def run(*args):return subprocess.check_output([adb,'-P','5039','-s','127.0.0.1:5555',*args],timeout=45)
c=json.loads(sys.argv[1]);action=c['action']
if action=='tap':run('shell','input','tap',str(c['x']),str(c['y']))
elif action=='drag':run('shell','input','swipe',*[str(c[k]) for k in ['x1','y1','x2','y2']],str(c.get('duration',700)))
elif action=='text':run('shell','input','text',c['text'])
elif action=='otp':run('shell','input','text',(root/'otp-private.txt').read_text().strip())
elif action=='clearOtp':
 run('shell','input','keyevent','KEYCODE_MOVE_END')
 run('shell','input','keyevent',*(['KEYCODE_DEL']*6))
elif action=='back':run('shell','input','keyevent','4')
elif action=='inspect':pass
else:raise SystemExit('Unsupported action')
time.sleep(1)
x=None
if c.get('hierarchy',True):
 run('shell','rm','-f','/data/local/tmp/signature-qa-ui.xml')
 try:
  subprocess.check_output([adb,'-P','5039','-s','127.0.0.1:5555','shell','uiautomator','dump','/data/local/tmp/signature-qa-ui.xml'],timeout=15)
  x=run('exec-out','cat','/data/local/tmp/signature-qa-ui.xml');(root/'android-current-private.xml').write_bytes(x)
 except subprocess.TimeoutExpired:
  print('UI hierarchy timeout; inspect the fresh screenshot before any further action')
png=run('exec-out','screencap','-p')
if not png.startswith(b'\x89PNG\r\n\x1a\n'):raise SystemExit('Android screenshot unavailable; UI result not accepted')
(root/'android-current.png').write_bytes(png)
for n in ET.fromstring(x).iter('node') if x else []:
 label=n.get('text') or n.get('content-desc')
 if label and n.get('bounds') != '[0,0][0,0]': print(n.get('class'),re.sub(r'\b\d{6}\b','[REDACTED]',label),n.get('bounds'),'enabled='+n.get('enabled'))
