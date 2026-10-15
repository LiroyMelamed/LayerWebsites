"""Recheck synthetic, captured Android 14 PDF preview pixels. Never edits images."""
from pathlib import Path
from PIL import Image
import hashlib, json, zipfile

root = Path(__file__).resolve().parent
with zipfile.ZipFile(root / 'android-v14-dashboard2-evidence.zip') as archive:
    digest = hashlib.sha256(archive.read('signed.pdf')).hexdigest()
assert digest == 'a8d850f7b386987c34d8b08d774abdeeb67ecfcf6a8dfacb1ebce496befdbb43'
capture = Image.open(root.parent / 'live-ui/signature.png').convert('RGBA')
white = Image.new('RGBA', capture.size, 'white')
white.alpha_composite(capture)
bounds = white.convert('L').point(lambda value: 255 if value < 220 else 0).getbbox()
factor = min(240 / capture.width, 80 / capture.height)
dx, dy = 100 + (240 - capture.width * factor) / 2, 200 + (80 - capture.height * factor) / 2
expected = [dx + bounds[0] * factor, dy + bounds[1] * factor, dx + bounds[2] * factor, dy + bounds[3] * factor]
measurements = []
for page, pair, frame in [(1, '1-2', (90, 161, 539, 720)), (2, '1-2', (0, 898, 720, 539)), (5, '5-6', (126, 342, 467, 611)), (6, '5-6', (54, 970, 611, 467))]:
    image = Image.open(root / f'android-v14-dashboard2-preview-pages{pair}.png').convert('RGB')
    left, top, width, height = frame
    assert image.size == (720, 1600)
    assert image.getpixel((left, top)) == (255, 255, 255)
    scale = width / 800
    box = (round(left + 100 * scale), round(top + 200 * scale), round(left + 340 * scale), round(top + 280 * scale))
    ink = image.crop(box).convert('L').point(lambda value: 255 if value < 220 else 0).getbbox()
    assert ink
    actual = [(ink[0] + box[0] - left) / scale, (ink[1] + box[1] - top) / scale, (ink[2] + box[0] - left) / scale, (ink[3] + box[1] - top) / scale]
    error = max(abs(a - b) for a, b in zip(actual, expected))
    assert error * scale <= 2, (page, error * scale)
    measurements.append(dict(page=page, pageViewportPixels=frame, expectedInkBounds800=expected, actualInkBounds800=actual, maxError800=error, maxErrorScreenPixels=error * scale, rasterToleranceScreenPixels=2))
result = dict(status='PASS', sourceCommit='c33d1791f3ec87c9324ac906bdfea29b5f33586a', build=14, fileId=12, signedPdfSha256=digest, scope='Native final PDF preview: all four signed pages including 90-degree rotation and nonzero CropBox; measured against contain-fit source signature', pages=measurements, maxErrorScreenPixels=max(row['maxErrorScreenPixels'] for row in measurements))
(root / 'android-v14-dashboard2-preview-measurements.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'pages': [row['page'] for row in measurements], 'maxErrorScreenPixels': result['maxErrorScreenPixels']}))
