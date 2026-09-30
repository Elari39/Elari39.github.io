#!/usr/bin/env python
"""素材流水线：把截图与图标加工成 public/ 下的成品。

为什么是一个独立脚本、而不是构建步骤：

  * 这些素材**只在素材变了的时候**才需要重跑。CI 只验证已提交的素材，
    不重新生成；浏览器验收独立运行。
  * 四个被展示的项目在站点仓库之外（`../AshenCourier`、`../ruiqiang-website` 等）。
    这里只**读**它们，复制出来加工，绝不修改源目录。
  * 刻意不引 sharp / astro:assets：那个原生依赖换机器时最容易装不上，
    而 Pillow 已在本机可用，WebP 输出也够用。

关于线上截图 —— 一个实测结论
------------------------------
曾经想让这个脚本顺手抓 blog.miku831.fun 的首页当图版。实测不可行：

    https://blog.miku831.fun/ 在 Cloudflare 的安全验证之后，无头浏览器
    拿到的是"请稍候… 正在进行安全验证"的中间页（DOM 里 title 就是这四个字，
    没有任何文章链接）。截出来的图是一张几乎全白、标准差 18 的验证页。

所以**线上站点不在这里抓**。需要某个项目的线上截图时，请人工截好放进
`public/shots/<slug>/`，再把它写进条目的 gallery。`--inspect` 会告诉你
某张图是否疑似空白页；它无法识别验证页，内容仍需人工确认。

跑法：`pnpm assets`（需要 Pillow 与一个 Chrome / Edge）
体检：`pnpm assets --inspect`

产出：
  public/shots/ashen-courier/*.webp    —— 复用 AshenCourier 仓库里那批真实截图
  public/shots/ruiqiang-website/*.webp —— 复用 ruiqiang-website 已公开发布的那三张实拍
  public/apple-touch-icon.png         —— Pillow 画出来的印记
  public/favicon.ico                  —— 由同一枚印记生成多尺寸
  public/og.jpg                       —— 用无头 Chrome 渲染 scripts/og-template.html，再存成 JPEG
  src/data/plates.ts                  —— 图版真实像素尺寸（喂给 <img> 的 width/height）
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent  # F:\WorkSpace\Ashen-Witch
PUBLIC = ROOT / "public"
RAW = ROOT / ".assets-raw"
DATA = ROOT / "src" / "data"

COURIER_SHOTS = WORKSPACE / "AshenCourier" / "docs" / "screenshots"
RUIQIANG_SHOTS = WORKSPACE / "ruiqiang-website" / "docs" / "screenshots"

# 详情页正文列是 max-w-3xl（768px），1400px 足够 2x 清晰度又不会太肥
PLATE_WIDTH = 1400
WEBP_QUALITY = 80

# 站点色板（与 src/styles/global.css 的深色主题一致）
ASH = (18, 17, 16)
EMBER = (224, 141, 109)
AMBER = (232, 165, 90)

CHROME_CANDIDATES = [
    *([Path(os.environ["CHROME_PATH"])] if os.environ.get("CHROME_PATH") else []),
    Path("/usr/bin/google-chrome"), Path("/usr/bin/chromium"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]

# 复用仓库里已有的真实截图（AshenCourier README 说明过它们取自真实实例）
COURIER_PLATES = {
    "landing": "landing.png",
    "dashboard": "dashboard.png",
    "link-detail": "link-detail.png",
    "create-result": "create-result.png",
}

# ruiqiang-website 的 README 实拍：由该项目自己的 `npm run shots:readme` 抓线上地址得到，
# 三张都是它已经公开发布的图。**只取这三张** —— 该仓库 img/ 下的营业执照原图
# 永不发布（它的 PLACEHOLDERS.md §7 有明确纪律），本站也不复制。
RUIQIANG_PLATES = {
    "desktop-home": "desktop-home.png",
    "pages-grid": "pages-grid.png",
    "mobile-home": "mobile-home.png",
}

# (输出目录名, 源目录, {输出名: 源文件名}) —— 加一个项目就在这里加一行
PLATE_SOURCES = [
    ("ashen-courier", COURIER_SHOTS, COURIER_PLATES),
    ("ruiqiang-website", RUIQIANG_SHOTS, RUIQIANG_PLATES),
]

manifest: dict[str, dict[str, int]] = {}


def log(message: str) -> None:
    print(message, flush=True)


def find_chrome() -> Path:
    for candidate in CHROME_CANDIDATES:
        if candidate.exists():
            return candidate
    raise SystemExit("找不到 Chrome / Edge —— 渲染 OG 卡片需要一个无头浏览器")


def run_chrome(chrome: Path, args: list[str], log_path: Path) -> None:
    """跑一次无头 Chrome。输出重定向到文件而不是管道，避免平台差异。"""
    with tempfile.TemporaryDirectory(prefix="grimoire-chrome-") as profile:
        command = [
            str(chrome),
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--user-data-dir={profile}",
            *args,
        ]
        with log_path.open("wb") as sink:
            completed = subprocess.run(command, stdout=sink, stderr=sink, timeout=180, check=False)
        if completed.returncode != 0:
            tail = log_path.read_text(encoding="utf-8", errors="replace")[-1200:]
            raise SystemExit(f"Chrome 退出码 {completed.returncode}\n{tail}")


def render(chrome: Path, url: str, out: Path, size: tuple[int, int], wait_ms: int = 3000) -> None:
    """把一个 URL（通常是本地 file:// 模板）渲染成 PNG。"""
    out.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for mode in ("--headless=new", "--headless"):
        out.unlink(missing_ok=True)
        try:
            run_chrome(
                chrome,
                [
                    mode,
                    f"--window-size={size[0]},{size[1]}",
                    f"--virtual-time-budget={wait_ms}",
                    f"--screenshot={out}",
                    url,
                ],
                RAW / "chrome.log",
            )
            if out.exists() and out.stat().st_size > 0:
                return
        except SystemExit as error:  # 换一种 headless 写法再试一次
            last_error = error
    raise SystemExit(f"渲染失败：{url}\n{last_error}")


def describe(path: Path) -> str:
    """给一张图一个可读指纹：标准差太小就说明它没渲染出来。"""
    with Image.open(path) as image:
        stats = ImageStat.Stat(image.convert("L"))
        mean, stddev = stats.mean[0], stats.stddev[0]
    flag = "  ← 疑似空白页！" if stddev < 3 else ""
    return f"均值 {mean:.1f} 标准差 {stddev:.1f}{flag}"


def save_plate(source: Path, destination: Path) -> None:
    """统一缩到 PLATE_WIDTH 宽（只缩不放），输出 WebP，并记下真实尺寸。"""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGBA")
        if image.width > PLATE_WIDTH:
            height = round(image.height * PLATE_WIDTH / image.width)
            image = image.resize((PLATE_WIDTH, height), Image.LANCZOS)
        image.save(destination, "WEBP", quality=WEBP_QUALITY, method=6)
        key = str(destination.relative_to(PUBLIC)).replace("\\", "/")
        manifest[key] = {"width": image.width, "height": image.height}
        log(
            f"  {key}  {image.width}x{image.height}  {destination.stat().st_size // 1024} KB"
            f"  （源：{source.name} {describe(source)}）"
        )


def draw_sigil(size: int, rounded: bool) -> Image.Image:
    """站点印记：深色底 + 余烬菱形 + 琥珀内芯。超采样后缩小，边缘才干净。"""
    scale = 8
    edge = size * scale
    image = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if rounded:
        draw.rounded_rectangle([0, 0, edge - 1, edge - 1], radius=int(edge * 0.22), fill=ASH + (255,))
    else:
        draw.rectangle([0, 0, edge, edge], fill=ASH + (255,))

    center = edge / 2
    outer = edge * 0.35
    inner = edge * 0.165
    stroke = max(1, int(edge * 0.042))

    draw.line(
        [
            (center, center - outer),
            (center + outer, center),
            (center, center + outer),
            (center - outer, center),
            (center, center - outer),
        ],
        fill=EMBER + (255,),
        width=stroke,
        joint="curve",
    )
    draw.polygon(
        [
            (center, center - inner),
            (center + inner, center),
            (center, center + inner),
            (center - inner, center),
        ],
        fill=AMBER + (255,),
    )
    for x1, y1, x2, y2 in (
        (center, center - outer, center, center - inner),
        (center + outer, center, center + inner, center),
        (center, center + outer, center, center + inner),
        (center - outer, center, center - inner, center),
    ):
        draw.line([(x1, y1), (x2, y2)], fill=EMBER + (255,), width=stroke)

    return image.resize((size, size), Image.LANCZOS)


def build_icons() -> None:
    touch = PUBLIC / "apple-touch-icon.png"
    # iOS 会自己套圆角，所以这里给一张不透明的整块方图
    draw_sigil(180, rounded=False).convert("RGB").save(touch, "PNG", optimize=True)
    ico = PUBLIC / "favicon.ico"
    draw_sigil(64, rounded=True).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    log(f"图标：{touch.name} / {ico.name}")


def build_plates() -> None:
    log("\n条目图版")
    for slug, shots_dir, plates in PLATE_SOURCES:
        for name, filename in plates.items():
            source = shots_dir / filename
            if not source.exists():
                raise SystemExit(f"缺少素材来源：{source}")
            save_plate(source, PUBLIC / "shots" / slug / f"{name}.webp")


def write_plate_sizes() -> None:
    """把真实尺寸写成 TS 模块，供 <img width height> 使用，避免布局跳动。"""
    DATA.mkdir(parents=True, exist_ok=True)
    target = DATA / "plates.ts"
    rows = "\n".join(
        f'  "{key}": {{ width: {value["width"]}, height: {value["height"]} }},'
        for key, value in sorted(manifest.items())
    )
    target.write_text(
        "/**\n"
        " * 图版真实像素尺寸。\n"
        " *\n"
        " * 由 scripts/prepare-assets.py 生成，**不要手工编辑** —— 重新跑一次\n"
        " * `pnpm assets` 就会覆盖它。存在的意义是给 <img> 写 width/height，\n"
        " * 让图片在加载完成前就占住位置（避免累计布局偏移）。\n"
        " */\n\n"
        "export const PLATE_SIZES: Record<string, { width: number; height: number }> = {\n"
        f"{rows}\n"
        "};\n",
        encoding="utf-8",
        # 仓库统一 LF（见 .gitattributes）：别让平台默认的换行符把这份生成文件
        # 变成一堆「已修改」的假差异
        newline="\n",
    )
    log(f"\n图版尺寸：{target.name}（{len(manifest)} 条）")


def build_og(chrome: Path) -> None:
    template = ROOT / "scripts" / "og-template.html"
    out = PUBLIC / "og.jpg"
    render(chrome, template.as_uri(), out, (1200, 630), wait_ms=1500)
    with Image.open(out) as image:
        image = image.convert("RGB")
        # JPEG 而不是 PNG：这张卡片是 1200×630 的扁平渐变，PNG 要 290 KB、
        # JPEG q85 只要 ~42 KB（省 86%）。社交平台只把它当缩略图看，
        # 而每一次分享预览都要为它付流量。质量 85 实测文字边缘没有可见损失。
        image.save(out, "JPEG", quality=85, optimize=True, progressive=True)
        log(f"OG 卡片：{out.name}  {image.width}x{image.height}  {out.stat().st_size // 1024} KB")


def validate_image(target: Path) -> tuple[int, int]:
    """Reject broken/blank images; visual review still determines content validity."""
    with Image.open(target) as image:
        image.load()
        stats = ImageStat.Stat(image.convert("L"))
        colors = image.convert("RGB").getcolors(maxcolors=200_000)
        if stats.stddev[0] < 3 or (stats.mean[0] > 250 and colors and len(colors) < 5000):
            raise ValueError(f"疑似空白/白屏图片：{target}")
        return image.size


def public_images(directory: Path) -> list[Path]:
    return sorted(p for p in directory.rglob("*") if p.is_file() and p.suffix.lower() in {".png", ".webp", ".jpg", ".jpeg", ".ico"})


def inspect(directory: Path | None = None) -> None:
    targets = public_images(directory or PUBLIC)
    if not targets:
        raise ValueError("没有可检查的发布图片")
    errors = []
    for target in targets:
        try:
            width, height = validate_image(target)
            log(f"  {target.name}: {width}x{height} {describe(target)}")
        except (OSError, ValueError) as error:
            errors.append(str(error))
    if errors:
        raise ValueError("\n".join(errors))


def collect_sizes() -> None:
    manifest.clear()
    for target in public_images(PUBLIC / "shots"):
        width, height = validate_image(target)
        manifest[target.relative_to(PUBLIC).as_posix()] = {"width": width, "height": height}


def publish(staged: list[tuple[Path, Path]]) -> None:
    """Replace only validated generated files, rolling back a failed commit."""
    original = {target: target.read_bytes() if target.exists() else None for _, target in staged}
    changed = []
    try:
        for source, target in staged:
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(source, target)
            changed.append(target)
    except BaseException:
        for target in reversed(changed):
            if original[target] is None:
                target.unlink(missing_ok=True)
            else:
                target.write_bytes(original[target])
        raise


def generate(chrome: Path) -> None:
    global PUBLIC, DATA
    # Validate every configured source before producing or replacing anything.
    for _, source_dir, mappings in PLATE_SOURCES:
        for filename in mappings.values():
            validate_image(source_dir / filename)
    original_public, original_data = PUBLIC, DATA
    RAW.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="assets-stage-", dir=RAW) as temporary:
        stage = Path(temporary)
        PUBLIC, DATA = stage / "public", stage / "data"
        try:
            shutil.copytree(original_public, PUBLIC)
            build_icons()
            build_plates()
            build_og(chrome)
            inspect(PUBLIC)
            collect_sizes()  # Includes hand-added public/shots images.
            write_plate_sizes()
            generated = [(f, original_public / f.relative_to(PUBLIC)) for f in public_images(PUBLIC)]
            generated.append((DATA / "plates.ts", original_data / "plates.ts"))
            publish(generated)
        finally:
            PUBLIC, DATA = original_public, original_data


def main() -> None:
    if "--inspect" in sys.argv:
        inspect()
    else:
        generate(find_chrome())


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
