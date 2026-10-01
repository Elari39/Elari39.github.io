from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops

root = Path(__file__).resolve().parent
items = [
    ('01', '余烬魔典', '书页承载工程，火焰象征创造', '01-ember-grimoire.png'),
    ('02', '女巫帽', '鲜明的女巫身份与利落轮廓', '02-witch-hat.png'),
    ('03', '月牙书页', '月夜、阅读与珍藏的魔法', '03-crescent-pages.png'),
    ('04', '羽笔火焰', '把思考与工程经验写成记录', '04-quill-flame.png'),
    ('05', '字母符印', 'A / W 首字母化作几何符文', '05-aw-sigil.png'),
    ('06', '星轨封印', '工程的精度与魔法阵相呼应', '06-orbital-seal.png'),
]
font_path = 'C:/Windows/Fonts/msyh.ttc'
bold_path = 'C:/Windows/Fonts/msyhbd.ttc'
def font(size, bold=False):
    return ImageFont.truetype(bold_path if bold else font_path, size)

def icon(file):
    im = Image.open(root / file).convert('RGB')
    # White is the requested backing, with no white subject fills.
    near_white = ImageChops.darker(ImageChops.darker(*im.split()[:2]), im.split()[2])
    mask = near_white.point(lambda v: 255 if v < 235 else int((255-v)*12.75))
    box = mask.point(lambda v: 255 if v > 100 else 0).getbbox()
    if not box:
        raise ValueError(f'Blank generated image: {file}')
    rgba = im.convert('RGBA')
    rgba.putalpha(mask)
    rgba = rgba.crop(box)
    return rgba

cream, ink, gray, orange = '#fffdf4', '#101010', '#666258', '#f04e14'
board = Image.new('RGB', (1440, 1190), cream)
d = ImageDraw.Draw(board)
d.text((54, 34), "ASHEN WITCH'S GRIMOIRE", font=font(19, True), fill=orange)
d.text((50, 68), '选择你的魔典印记', font=font(43, True), fill=ink)
d.text((53, 132), '六款导航品牌图标  /  黑墨 × 余烬橙  /  每款附 26px 缩略预览', font=font(20), fill=gray)
d.line((52, 177, 1388, 177), fill=ink, width=2)
nav = Image.new('RGB', (1120, 690), cream)
nd = ImageDraw.Draw(nav)
nd.text((40, 25), '导航应用预览 · 图标 26px', font=font(29, True), fill=ink)
nd.text((40, 76), '导航排版示意；选择后制作主题自适应 SVG', font=font(17), fill=gray)
for i,(number,title,desc,file) in enumerate(items):
    x = 52 + (i % 3)*453
    y = 205 + (i // 3)*453
    d.rectangle((x+5,y+5,x+434,y+429),fill=ink)
    d.rectangle((x,y,x+429,y+424),fill='white',outline=ink,width=2)
    d.text((x+23,y+19),number,font=font(20,True),fill=orange)
    d.text((x+67,y+14),title,font=font(28,True),fill=ink)
    im = icon(file)
    large=im.copy()
    large.thumbnail((225,208),Image.Resampling.LANCZOS)
    board.paste(large,(x+(429-large.width)//2,y+88+(208-large.height)//2),large)
    d.text((x+23,y+320),desc,font=font(18),fill=gray)
    d.line((x+23,y+363,x+406,y+363),fill='#e4e1d9',width=1)
    small=im.copy()
    small.thumbnail((26,26),Image.Resampling.LANCZOS)
    board.paste(small,(x+26,y+383+(26-small.height)//2),small)
    d.text((x+67,y+384),"Ashen Witch's Grimoire",font=font(18,True),fill=ink)
    row=130+i*86
    nd.text((40,row+13),number,font=font(18,True),fill=orange)
    nd.rectangle((93,row-3,1080,row+66),fill=cream,outline='#d9d5ca',width=1)
    nav.paste(small,(115,row+16+(26-small.height)//2),small)
    nd.text((153,row+5),"Ashen Witch's Grimoire",font=font(17,True),fill=ink)
    nd.text((153,row+32),'灰 烬 女 巫 的 魔 典',font=font(11),fill=gray)
    nd.text((750,row+19),'条目     关于本站     GitHub',font=font(15),fill=ink)
    nd.rectangle((1030,row+13,1058,row+41),outline=ink,width=2)
    nd.rectangle((1037,row+20,1051,row+34),fill=orange,outline=ink,width=1)
    nd.line((93,row+66,1080,row+66),fill=ink,width=2)
d.text((53,1136),'选一个编号即可  ·  原始生成稿已单独保存  ·  正式导航图标将在选定后制作',font=font(19),fill=gray)
board.save(root/'icon-options.png',optimize=True)
nav.save(root/'navigation-previews.png',optimize=True)
print('Created icon-options.png and navigation-previews.png')
