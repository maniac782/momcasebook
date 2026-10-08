"""Draws the site icons (an original drawing, dedicated to the public domain under CC0).
Run: python3 scripts/make-icons.py  -> icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-32.png"""
from PIL import Image, ImageDraw, ImageFilter
import os
S=1024
SKY_TOP=(16,22,28); SKY_BOT=(38,74,82); MOON=(214,224,230); HOUSE=(8,10,13); LIT=(196,62,52)

def art(size_scale=1.0):
    im=Image.new('RGB',(S,S),SKY_TOP); d=ImageDraw.Draw(im)
    for y in range(S):  # dusk gradient
        t=y/S; c=tuple(int(SKY_TOP[i]+(SKY_BOT[i]-SKY_TOP[i])*t) for i in range(3)); d.line([(0,y),(S,y)],fill=c)
    glow=Image.new('L',(S,S),0); ImageDraw.Draw(glow).ellipse((650,130,850,330),fill=120); glow=glow.filter(ImageFilter.GaussianBlur(40))
    im.paste(Image.new('RGB',(S,S),(120,140,150)),(0,0),glow)
    d=ImageDraw.Draw(im); d.ellipse((690,170,810,290),fill=MOON)
    k=size_scale; cx=S//2
    def P(pts): return [(cx+(x-cx)*k, S-(S-y)*k if False else y) for x,y in pts]
    # mansion: wide body, central tower with steep roof, two gables
    body=[(190,560),(300,470),(380,560),(380,520),(440,520),(512,330),(584,520),(644,520),(644,560),(724,470),(834,560),(834,900),(190,900)]
    d.polygon(P(body),fill=HOUSE)
    d.rectangle(P([(495,250),(529,340)])[0]+P([(495,250),(529,340)])[1],fill=HOUSE)  # spire
    d.polygon(P([(512,180),(530,260),(494,260)]),fill=HOUSE)
    d.polygon(P([(150,910),(874,910),(874,1024),(150,1024)]),fill=HOUSE)
    d.rectangle((0,900,S,S),fill=HOUSE)
    # windows: dark panes, one lit
    for (x,y) in [(250,620),(330,620),(250,730),(330,730),(660,620),(740,620),(660,730),(740,730)]:
        d.rectangle(P([(x,y),(x+44,y+64)])[0]+P([(x,y),(x+44,y+64)])[1],fill=(22,28,34))
    d.ellipse(P([(482,420),(542,480)])[0]+P([(482,420),(542,480)])[1],fill=(22,28,34))
    lit=Image.new('L',(S,S),0); ImageDraw.Draw(lit).rectangle((475,600,549,700),fill=255); lit=lit.filter(ImageFilter.GaussianBlur(26))
    im.paste(Image.new('RGB',(S,S),LIT),(0,0),lit.point(lambda v:int(v*0.55)))
    d=ImageDraw.Draw(im); d.rectangle((486,612,538,690),fill=LIT); d.line((512,612,512,690),fill=HOUSE,width=6); d.line((486,650,538,650),fill=HOUSE,width=6)
    d.rectangle((470,780,554,900),fill=(22,28,34))  # door
    return im

def rounded(im,r):
    m=Image.new('L',im.size,0); ImageDraw.Draw(m).rounded_rectangle((0,0,im.size[0]-1,im.size[1]-1),r,fill=255)
    out=Image.new('RGBA',im.size,(0,0,0,0)); out.paste(im,(0,0),m); return out

here=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a=art()
rounded(a,180).resize((512,512),Image.LANCZOS).save(os.path.join(here,'icon-512.png'))
rounded(a,180).resize((192,192),Image.LANCZOS).save(os.path.join(here,'icon-192.png'))
rounded(a,180).resize((32,32),Image.LANCZOS).save(os.path.join(here,'favicon-32.png'))
a.resize((180,180),Image.LANCZOS).save(os.path.join(here,'apple-touch-icon.png'))
# maskable: art shrunk into the 80% safe zone on the sky colour
m=Image.new('RGB',(S,S),SKY_TOP); inner=art().resize((int(S*0.78),int(S*0.78)),Image.LANCZOS); m.paste(inner,((S-inner.size[0])//2,(S-inner.size[1])//2))
m.resize((512,512),Image.LANCZOS).save(os.path.join(here,'icon-maskable-512.png'))
print('icons written')
