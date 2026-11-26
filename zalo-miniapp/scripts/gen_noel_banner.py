"""Sinh ảnh Giáng sinh cho Mini App và trang đăng nhập webapp: vải len đan + logo Truliva thêu.

Chạy: python scripts/gen_noel_banner.py   (cần pillow, numpy, scipy)
Muốn đổi họa tiết thì sửa các bảng chữ bên dưới: mỗi ký tự là một mũi đan.
Đổi STITCH_W/STITCH_H/số hàng/số cột thì sửa kích thước trong ChristmasKnitHeader.tsx và NoelLoginTheme.tsx.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
OUTS = [ROOT / 'src' / 'assets', ROOT.parent / 'webapp' / 'src' / 'assets']
LOGO = ROOT.parent / 'logo' / 'Truliva_cropped_logo.png'

STITCH_W, STITCH_H, SS = 14, 11, 4  # px ảnh @3x mỗi mũi, hệ số khử răng cưa
YARN = {
    '.': (120, 12, 28),    # đỏ đậm
    'D': (150, 28, 42),    # đỏ sáng hơn, họa tiết chìm
    'W': (248, 239, 222),  # kem
    'G': (40, 122, 78),    # xanh thông
    'Y': (240, 186, 72),   # vàng
    'N': (172, 116, 66),   # nâu thân cây
    'R': (232, 54, 50),    # mũi tuần lộc
}
GAP = np.array((58, 4, 14), float)  # khe giữa các mũi

DEER = """
........W...W..
......W.W...W.W
......WWW...WWW
........W...W..
........WW.WW..
.........WWW...
.........WWWW..
........WW.WWWW
........WWWWWWR
........WWWWW..
W......WWWW....
WW.....GGGG....
.WWWWWWWWWW....
.WWWWWWWWWW....
.WWWWWWWWWW....
.WWWWWWWWWW....
.WWWW..WWW.....
.WW.....WW.....
.W.W....W.W....
WW.WW..WW.WW...
"""
TREE = """
.......Y.......
......YYY......
.......Y.......
.......G.......
......GGG......
.....GGGGG.....
....WWGGGWW....
......GGG......
.....GGGGG.....
....GGGYGGG....
...GGGGGGGGG...
..WWWGGGGGWWW..
.....GGGGG.....
....GGYGGGG....
...GGGGGGGYG...
..GGGGGGGGGGG..
.GGYGGGGYGGGGG.
WWWWGGGGGGGWWWW
.......N.......
......NNN......
"""
STAR = """
......W......
.............
...W.....W...
...WW...WW...
...WWW.WWW...
WWW.WW.WW.WWW
.WWW.W.W.WWW.
..WWW...WWW..
......Y......
..WWW...WWW..
.WWW.W.W.WWW.
WWW.WW.WW.WWW
...WWW.WWW...
...WW...WW...
...W.....W...
.............
......W......
.............
..W.......W..
.............
"""
BORDER = """
W.W.W.W.
........
...G....
..GWG...
...G....
........
.W.W.W.W
"""
MINI_TREE = """
....D....
....D....
...DDD...
..DDDDD..
...DDD...
..DDDDD..
.DDDDDDD.
..DDDDD..
.DDDDDDD.
DDDDDDDDD
....D....
"""


def chart(text):
    rows = text.strip('\n').split('\n')
    assert len({len(r) for r in rows}) == 1, f'bảng họa tiết lệch cột: {rows[0]}'
    return np.array([list(r) for r in rows])


def base_chart():
    c = np.full((32, 36), '.')
    star, tree = chart(STAR)[2:15], chart(MINI_TREE)
    star = np.where(star == '.', '.', 'D')
    for y, x, motif in ((1, 2, star), (2, 22, tree), (17, 20, star), (18, 4, tree)):
        c[y:y + motif.shape[0], x:x + motif.shape[1]] = motif
    return c


def scene_chart():
    deer, tree, star, border = chart(DEER), chart(TREE), chart(STAR), chart(BORDER)
    c = np.full((30, 72), '.')
    x = 7 + 4
    for motif, gap in ((deer, 3), (tree, 3), (deer[:, ::-1], 4)):
        c[1:21, x:x + motif.shape[1]] = motif
        x += motif.shape[1] + gap
    for i in range(13):  # sao tám cánh nằm vắt qua mép để ghép liền mạch
        c[1:21, (x + i) % 72] = star[:, i]
    c[23:30] = np.tile(border, (1, 9))
    return c


def stitch_stamp():
    """Một mũi trơn: hai sợi nghiêng hình chữ V. Trả về (độ sáng, alpha)."""
    w, h = STITCH_W * SS, STITCH_H * SS
    ph = h * 2
    yy, xx = np.mgrid[0:ph, 0:w].astype(float)
    shade, alpha = np.zeros((ph, w)), np.zeros((ph, w))
    for side in (-1, 1):
        a = side * np.deg2rad(27)
        dx, dy = xx - (w / 2 + side * w * 0.25), yy - ph / 2
        across = (dx * np.cos(a) + dy * np.sin(a)) / (w * 0.262)
        along = (-dx * np.sin(a) + dy * np.cos(a)) / (h * 0.84)
        r = across ** 2 + np.abs(along) ** 2.6
        inside = np.clip((1 - r) * 8, 0, 1)
        ply = 0.07 * np.sin((along * 2.6 + across * 1.1 * side) * np.pi * 2)
        lit = 0.60 + 0.46 * np.sqrt(np.clip(1 - across ** 2, 0, 1)) - 0.10 * across - 0.12 * along + ply
        shade = np.where(inside > alpha, lit, shade)
        alpha = np.maximum(alpha, inside)
    return shade, alpha


def knit(c, seed, wrap_rows):
    """Vẽ bảng mũi đan thành vải, lặp liền mạch theo chiều ngang (và dọc nếu wrap_rows)."""
    rows, cols = c.shape
    w, h = STITCH_W * SS, STITCH_H * SS
    shade, alpha = stitch_stamp()
    rng = np.random.default_rng(seed)
    tone = rng.normal(1, 0.045, c.shape)
    pad = 2
    img = np.empty(((rows + 2 * pad) * h, cols * w, 3))
    img[:] = GAP
    for r in range(-pad, rows + pad - 1):
        for k in range(cols):
            rr = r % rows
            key = c[rr, k] if 0 <= r < rows or wrap_rows else '.'
            color = np.array(YARN[key]) * tone[rr, k]
            y0, x0 = (r + pad) * h - h // 2, k * w
            patch = img[y0:y0 + 2 * h, x0:x0 + w]
            a = alpha[:patch.shape[0], :, None]
            patch[:] = patch * (1 - a) + np.clip(color * shade[:patch.shape[0], :, None], 0, 255) * a
    img = img[pad * h:(pad + rows) * h]
    img *= rng.normal(1, 0.06, img.shape[:2])[..., None]  # xơ len
    im = Image.fromarray(np.clip(img, 0, 255).astype('uint8'))
    return im.resize((cols * STITCH_W, rows * STITCH_H), Image.LANCZOS)


def run_lengths(mask):
    """Độ dài đoạn liên tục theo chiều ngang tại từng điểm."""
    out = np.zeros(mask.shape)
    for y, row in enumerate(mask):
        lab, n = ndi.label(row)
        if n:
            out[y] = np.bincount(lab)[lab] * row
    return out


def satin(mask, color, rng, period=7.0, angle=None):
    """Mũi thêu sa-tanh. angle=None: sợi chạy ngang nét chữ như thêu thật."""
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    if angle is None:
        horiz = ndi.uniform_filter((run_lengths(mask) <= run_lengths(mask.T).T).astype(float), 9) > 0.5
        u = np.where(horiz, yy + 0.22 * xx, xx + 0.22 * yy)
        vx, vy = horiz.astype(float), 1.0 - horiz
    else:
        a = np.deg2rad(angle)
        u = -xx * np.sin(a) + yy * np.cos(a)
        vx, vy = np.full(mask.shape, np.cos(a)), np.full(mask.shape, np.sin(a))
    idx = np.floor(u / period).astype(int)
    frac = u / period - idx
    jitter, tint = rng.uniform(-1.2, 1.2, 4096)[idx % 4096], rng.normal(1, 0.05, 4096)[idx % 4096]
    soft = ndi.gaussian_filter(mask.astype(float), 0.8)
    alpha = ndi.map_coordinates(soft, [yy + vy * jitter, xx + vx * jitter], order=1)  # mép chỉ so le
    puff = ndi.gaussian_filter(mask.astype(float), 6)
    gy, gx = np.gradient(puff)
    light = 0.98 + np.clip((gx + gy) * 4.5, -0.30, 0.16)
    thread = 0.70 + 0.34 * np.sqrt(np.clip(1 - (2 * frac - 1) ** 2, 0, 1))
    rgb = np.broadcast_to(np.asarray(color, float), (h, w, 3)) * (thread * tint * light)[..., None]
    return np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)


def embroider_logo(width=600):
    rng = np.random.default_rng(12)
    pad = 24
    src = Image.open(LOGO).convert('RGBA')
    k = (width * 2 - 2 * pad) / src.width
    src = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    a = np.pad(np.asarray(src).astype(float), ((pad, pad), (pad, pad), (0, 0)))
    xx = np.arange(a.shape[1])[None, :]
    solid, lum = a[..., 3] > 128, a[..., :3].mean(-1)
    icon_side = xx < pad + 405 * k
    letters = solid & ~icon_side & (lum < 200)
    icon = ndi.binary_fill_holes(ndi.binary_closing(solid & icon_side, iterations=4))
    figure = ndi.binary_opening(solid & icon_side & (lum < 95), iterations=1)
    backing = ndi.binary_dilation(icon, iterations=8)
    # màu chỉ của giọt nước lấy từ logo gốc, gom còn vài mức như thay cuộn chỉ
    drop_rgb = ndi.gaussian_filter(a[..., :3], (5, 5, 0))
    drop_rgb = np.round(drop_rgb / 22) * 22
    cream = YARN['W']
    layers = [
        satin(backing, cream, rng, 7, 20),
        satin(icon & ~ndi.binary_dilation(figure, iterations=3), drop_rgb, rng, 6, -38),
        satin(figure, (30, 48, 128), rng, 6, 35),
        satin(letters, cream, rng, 6.5),
    ]
    out, oa = np.zeros((*solid.shape, 3)), np.zeros(solid.shape)
    for rgb, al in layers:
        out = out * (1 - al[..., None]) + rgb * al[..., None]
        oa = al + oa * (1 - al)
    shadow = np.clip(ndi.gaussian_filter(ndi.shift(oa, (4, 3)), 4) * 0.85, 0, 1)
    fa = oa + shadow * (1 - oa)
    # out đã nhân alpha; bóng đổ màu đỏ rất tối
    rgb = (out + np.array((32, 2, 8)) * (shadow * (1 - oa))[..., None]) / np.maximum(fa, 1e-6)[..., None]
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), fa * 255]).astype('uint8'))
    return im.resize((im.width // 2, im.height // 2), Image.LANCZOS)


if __name__ == '__main__':
    for name, im, q in (
        ('noel-knit-base', knit(base_chart(), 1, True), 72),
        ('noel-knit-scene', knit(scene_chart(), 2, False), 76),
        ('noel-logo-theu', embroider_logo(), 86),
    ):
        for out in OUTS:
            path = out / f'{name}.webp'
            im.save(path, quality=q, method=6)
        print(path.name, im.size, f'{path.stat().st_size / 1024:.0f} KB')
