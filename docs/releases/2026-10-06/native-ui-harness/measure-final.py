from pathlib import Path
from PIL import Image, ImageChops, ImageFilter
import fitz, json, io, hashlib
root=Path(__file__).resolve().parent
original=fitz.open(root/'source.pdf');final=fitz.open(root/'final.pdf')
assert len(original)==len(final)==8
signed_pages={1,2,5,6}; results=[]
def render(page):
 p=page.get_pixmap(matrix=fitz.Matrix(1600/page.rect.width,1600/page.rect.width),alpha=False)
 return Image.open(io.BytesIO(p.tobytes('png'))).convert('RGB')
for index,(before,after) in enumerate(zip(original,final),1):
 assert tuple(before.rect)==tuple(after.rect),(index,'page dimensions changed')
 a,b=render(before),render(after);assert a.size==b.size
 b.save(root/f'final-render-{index}.png')
 delta=ImageChops.difference(a,b).convert('L').point(lambda p:255 if p>20 else 0)
 if index not in signed_pages:
  assert delta.getbbox() is None,(index,'unassigned page changed')
  results.append({'page':index,'unassignedPageUnchanged':True});continue
 cap=Image.open(root/f'captured-{index}.png').convert('RGBA')
 white=Image.new('RGBA',cap.size,'white');white.alpha_composite(cap)
 ink=white.convert('L').point(lambda p:255 if p<220 else 0);bounds=ink.getbbox();assert bounds
 x,y,w,h=100,200,240,80;factor=min(w/cap.width,h/cap.height);dx=x+(w-cap.width*factor)/2;dy=y+(h-cap.height*factor)/2
 expected=[dx+bounds[0]*factor,dy+bounds[1]*factor,dx+bounds[2]*factor,dy+bounds[3]*factor]
 scale=b.width/800;box=tuple(round(v*scale) for v in [x,y,x+w,y+h]);actualMask=b.crop(box).convert('L').point(lambda p:255 if p<220 else 0);bb=actualMask.getbbox();assert bb
 actual=[(bb[k]+box[k%2])/scale for k in range(4)];error=max(abs(av-ev) for av,ev in zip(actual,expected));assert error<=1.2,(index,error)
 reference=Image.new('L',b.size);reference.paste(ink.resize((round(cap.width*factor*scale),round(cap.height*factor*scale))),(round(dx*scale),round(dy*scale)));region=reference.crop(box).point(lambda p:255 if p>64 else 0)
 missed=ImageChops.subtract(region,actualMask.filter(ImageFilter.MaxFilter(5))).histogram()[255];extra=ImageChops.subtract(actualMask,region.filter(ImageFilter.MaxFilter(5))).histogram()[255];assert missed+extra<40,(index,missed,extra)
 outside=delta.copy();outside.paste(0,box);assert outside.getbbox() is None,(index,'changes outside signature field')
 results.append({'page':index,'captureSize':cap.size,'expectedInkBounds800':expected,'actualInkBounds800':actual,'maxError800':error,'unmatchedInkPixels':missed+extra,'outsideSignatureFieldUnchanged':True})
out={'status':'PASS','sha256':hashlib.sha256((root/'final.pdf').read_bytes()).hexdigest(),'pages':results,'maxError800':max(x.get('maxError800',0) for x in results)}
(root/'raster-measurements.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
