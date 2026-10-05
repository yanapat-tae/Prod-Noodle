"""Draw the app's simple bowl icon from geometric primitives (no menu photos)."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent / 'public' / 'icons'
for size in (180, 192, 512):
    scale = 4
    image = Image.new('RGB', (size*scale, size*scale), '#fffdf7')
    d = ImageDraw.Draw(image)
    k = size*scale/512
    box = lambda values: tuple(round(v*k) for v in values)
    d.ellipse(box((55,55,457,457)), fill='#f6ead7')
    d.pieslice(box((100,163,412,421)), 0,180,fill='#6e2917')
    d.ellipse(box((100,191,412,287)), fill='#c79756')
    d.ellipse(box((122,207,390,266)), fill='#fff2bd')
    d.line(box((269,170,423,87)),fill='#2f6653',width=round(13*k))
    d.line(box((283,181,437,102)),fill='#2f6653',width=round(13*k))
    for x in (176,221):
        d.arc(box((x,111,x+52,195)),80,280,fill='#6e2917',width=round(9*k))
    d.rounded_rectangle(box((208,376,304,399)),radius=round(10*k),fill='#6e2917')
    image.resize((size,size),Image.Resampling.LANCZOS).save(root/f'icon-{size}.png')
print('Generated app icons: 180, 192, 512 px.')
