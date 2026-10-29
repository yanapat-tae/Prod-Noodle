"""Resize the approved full-bleed brand artwork (requires Pillow)."""
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parent.parent
root = project / 'public' / 'icons'
with Image.open(project / 'assets' / 'branding' / 'icon-master.png') as source:
    if source.width != source.height:
        raise ValueError('The approved app icon master must be square.')
    image = source.convert('RGB')
    for size in (32, 180, 192, 512):
        image.resize((size, size), Image.Resampling.LANCZOS).save(
            root / f'icon-{size}.png', optimize=True)
print('Generated approved brand icons: 32, 180, 192, 512 px.')
