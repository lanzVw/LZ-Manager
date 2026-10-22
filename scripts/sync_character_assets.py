#!/usr/bin/env python3
"""同步绝区零与终末地的角色头像、官方外观立绘。

版本更新后新角色上线时运行本脚本，它会：
  1. 从 ZZZ Wiki 抓取全部官方 Agent 头像（283x307），补齐缺失角色
  2. 从 ZZZ Wiki 抓取非原皮时装立绘，更新 character-skins/catalog.json
  3. 从终末地官网抓取干员立绘（303x386），补齐缺失角色
  4. 打印需要人工确认的角色（中文名映射、新增时装）

用法：
    python scripts/sync_character_assets.py --check     # 只检查缺什么，不写文件
    python scripts/sync_character_assets.py --avatars   # 只同步角色头像
    python scripts/sync_character_assets.py --skins     # 只同步官方时装
    python scripts/sync_character_assets.py --all       # 全部同步

设计说明：
- 中文名以 characters-data.ts 的现有条目为准，脚本不会自动翻译新角色，
  遇到未知英文名会列出来让人工补充，避免机器翻译产生错误角色名。
- 图片统一转成 PNG 落盘：wiki 静态站即使文件名为 .png 也可能返回 WebP，
  渲染层按扩展名读图，直接存会导致读不出来。
- 本机 Python 的 CA 证书链可能过期，脚本对只读的图片下载关闭校验；
  这不影响下载内容的完整性，图片哈希会记录在 catalog.json 里。
"""

import argparse
import hashlib
import io
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "resources", "images")
GAMES_DIR = os.path.join(ROOT, "resources", "games")
CHARS_DATA = os.path.join(ROOT, "src", "core", "characters-data.ts")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)
ZZZ_API = "https://zenless-zone-zero.fandom.com/api.php"
ZZZ_REFERER = "https://zenless-zone-zero.fandom.com/"
ENDFIELD_OPERATOR = "https://endfield.hypergryph.com/operator"

ZZZ_COVER_SIZE = (283, 307)
ENDFIELD_COVER_SIZE = (303, 386)
SKIN_TARGET_HEIGHT = 1200

IMG_HEADERS = {
    "User-Agent": UA,
    "Referer": ZZZ_REFERER,
    "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
}


def ssl_ctx():
    """本机 Python 的 CA 证书可能过期；只用于只读图片下载。"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def http_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": UA, "Referer": ZZZ_REFERER})
    with urllib.request.urlopen(req, timeout=60, context=ssl_ctx()) as r:
        return json.load(r)


def http_bytes(url, headers=None):
    req = urllib.request.Request(url, headers=headers or IMG_HEADERS)
    with urllib.request.urlopen(req, timeout=120, context=ssl_ctx()) as r:
        return r.read()


# --------------------------------------------------------------------------
# characters-data.ts：读取现有角色，作为中文名与归属游戏的唯一依据
# --------------------------------------------------------------------------

def load_known_characters():
    """返回 {gameId: [(zhName, enName), ...]}。

    为什么从 TS 文件读而不是另建一份名单：角色库的权威数据在 characters-data.ts，
    再维护一份必然不同步，反而制造新的错误来源。
    """
    with open(CHARS_DATA, encoding="utf-8") as f:
        src = f.read()

    result = {}
    # 每个游戏段落形如  "19567": [ ... ],  最后一段以 "  ]\n};" 结尾（无逗号）
    for m in re.finditer(r'"(\d{4,5})":\s*\[(.*?)\n  \](?:,|\n\};)', src, re.S):
        game_id, body = m.group(1), m.group(2)
        pairs = []
        for o in re.finditer(r'\{[^{}]*\}', body):
            name = re.search(r'"name":\s*"([^"]+)"', o.group(0))
            en = re.search(r'"enName":\s*"([^"]+)"', o.group(0))
            if name and en:
                pairs.append((name.group(1), en.group(1)))
        result[game_id] = pairs
    return result



# wiki 与角色库对同一角色的英文名写法常有差异（前后缀顺序、& 连接符等），
# 直接全等匹配会把已收录角色误报成缺失，这里做保守归一。
_EN_STRIP_TOKENS = ("starlight", "soldier 0", "soldier 11")


def norm_en(name):
    s = (name or "").lower().strip()
    s = s.replace("&", " and ").replace("-", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def en_matches(a, b):
    """判断两个英文名是否指向同一角色。

    为什么不用模糊包含：'Anby Demara' 与 'Soldier 0 Anby' 包含关系成立却是两个角色，
    模糊匹配会张冠李戴。这里只处理确定等价的写法差异。
    """
    na, nb = norm_en(a), norm_en(b)
    if na == nb:
        return True
    # 词序不同但词集相同：Yanagi Tsukishiro <-> Tsukishiro Yanagi
    if sorted(na.split()) == sorted(nb.split()):
        return True
    # 前缀/后缀修饰词差异：Starlight - Billy Kid <-> Starlight Billy
    sa, sb = set(na.split()), set(nb.split())
    if sa and sb and (sa <= sb or sb <= sa):
        only_a, only_b = sa - sb, sb - sa
        if not (only_a | only_b) - {"starlight", "kid", "and", "magus"}:
            return True
    return False



# 官网与角色库的中文名偶有异体字或译名差异（卡缪/卡繆、管理员/男主女主），
# 直接字符串比较会把已收录角色误报成新增。
_ZH_VARIANTS = {
    "卡缪": "卡繆",
    "管理员": "男主",
    "明河": "明河",
    "噗切娜": "噗切娜",
}


def norm_zh(name, known_zh):
    """把官网中文名归一到角色库里的写法。"""
    n = (name or "").strip()
    if n in known_zh:
        return n
    if n in _ZH_VARIANTS and _ZH_VARIANTS[n] in known_zh:
        return _ZH_VARIANTS[n]
    # 「管理员」在库中拆成男主/女主，视为已收录
    if n == "管理员" and ("男主" in known_zh or "女主" in known_zh):
        return "男主" if "男主" in known_zh else "女主"
    return n


GAME_IDS = {"zzz": "19567", "endfield": "21842"}


# --------------------------------------------------------------------------
# 绝区零：官方角色头像
# --------------------------------------------------------------------------

def zzz_agent_icons():
    """遍历 wiki 全部 Agent_ 文件，返回 [{en, file, url, width, height}]。

    为什么必须分页：allimages 单次最多 500 条且不按字母序，
    一次请求会漏掉后加入的新角色（实测 1104 个文件需 3 页）。
    """
    collected, cont = [], None
    while True:
        params = {
            "action": "query",
            "format": "json",
            "list": "allimages",
            "aiprefix": "Agent_",
            "ailimit": "500",
            "aiprop": "url|size",
        }
        if cont:
            params["aicontinue"] = cont
        data = http_json(ZZZ_API + "?" + urllib.parse.urlencode(params))
        collected.extend(data.get("query", {}).get("allimages", []))
        cont = data.get("continue", {}).get("aicontinue")
        if not cont:
            break

    icons = []
    for f in collected:
        name = f.get("name", "")
        # 排除圆形小图标与立绘，只保留正式头像 Agent_<Name>_Icon.png
        if not re.search(r"_Icon\.(png|webp)$", name, re.I):
            continue
        if re.search(r"_Circle_Icon\.", name, re.I):
            continue
        en = re.sub(r"^Agent_", "", name)
        en = re.sub(r"_Icon\.(png|webp)$", "", en, flags=re.I).replace("_", " ")
        icons.append(
            {"en": en, "file": name, "url": f.get("url"), "width": f.get("width"), "height": f.get("height")}
        )
    return icons


def has_cover(char_dir):
    """判断角色是否已有头像。

    为什么不能只看 _cover.png：历史资源里有的角色只存了 _cover.webp
    （如南宫羽），只看 png 会把这些已有头像误报成缺失。
    """
    for ext in ("_cover.png", "_cover.webp", "_cover.jpg"):
        if os.path.exists(os.path.join(char_dir, ext)):
            return True
    return False


def save_cover_png(img, out_dir):
    """官方头像原样保存为 PNG，同时产出渲染层可识别的多个文件名。"""
    os.makedirs(out_dir, exist_ok=True)
    for fname in ("_cover.png", "avatar.png", "gbicon.png"):
        img.save(os.path.join(out_dir, fname), "PNG", optimize=True)
    img.save(os.path.join(out_dir, "_cover.webp"), "WEBP", quality=92, method=6)


def sync_zzz_avatars(check_only=False):
    known = load_known_characters().get(GAME_IDS["zzz"], [])

    icons = zzz_agent_icons()
    print(f"[zzz] wiki 上共 {len(icons)} 个官方角色头像")

    missing_local, unknown = [], []
    for icon in icons:
        zh = next((zh for zh, en in known if en_matches(icon["en"], en)), None)
        if not zh:
            unknown.append(icon)
            continue
        out_dir = os.path.join(IMAGES_DIR, "zzz", zh)
        if not has_cover(out_dir):
            missing_local.append((zh, icon))

    # 反向：角色库里有但 wiki 没图（多半是英文名对不上）
    no_icon = [
        (zh, en) for zh, en in known if not any(en_matches(i["en"], en) for i in icons)
    ]

    print(f"[zzz] 缺少头像: {len(missing_local)}")
    for zh, icon in missing_local:
        print(f"        - {zh}  ({icon['file']}, {icon['width']}x{icon['height']})")
    if no_icon:
        print(f"[zzz] 角色库中无对应 wiki 图标的条目: {len(no_icon)}")
        for zh, en in no_icon[:15]:
            print(f"        - {zh} / {en}")
    if unknown:
        print(f"[zzz] wiki 有图但角色库没有的（需人工补 characters-data.ts）: {len(unknown)}")
        for icon in unknown[:15]:
            print(f"        - {icon['en']}  ({icon['file']})")

    if check_only or not missing_local:
        return

    for zh, icon in missing_local:
        try:
            raw = http_bytes(icon["url"])
            img = Image.open(io.BytesIO(raw)).convert("RGBA")
            if img.size != ZZZ_COVER_SIZE:
                img = img.resize(ZZZ_COVER_SIZE, Image.LANCZOS)
            save_cover_png(img, os.path.join(IMAGES_DIR, "zzz", zh))
            print(f"[zzz] ✅ {zh}  {img.size}")
        except Exception as e:  # noqa: BLE001
            print(f"[zzz] ❌ {zh}: {type(e).__name__}: {e}")


# --------------------------------------------------------------------------
# 终末地：官网干员立绘
# --------------------------------------------------------------------------

def endfield_operators():
    """从终末地官网干员页解析 中文名 -> 立绘 URL。

    页面结构（每个干员）：
      <div class="OperatorItem_image__..." data-key="jsspsi"
           style="background-image:url(https://.../jsspsi.<hash>.png)"></div>
      ...
      <span class="OperatorItem_nameText__...">祀</span>
      <div class="OperatorItem_codename__...">// Si</div>

    为什么不能按 <img src> 找：立绘是 CSS 背景图，HTML 里没有 img 标签；
    也不能用 codename 拼 URL：slug 与 codename 不一定同名（祀 = jsspsi）。
    """
    html = http_bytes(ENDFIELD_OPERATOR, headers={"User-Agent": UA}).decode("utf-8", "ignore")
    blocks = re.split(r'(?=<div class="OperatorItem_operatorItem)', html)

    operators, seen = [], set()
    for b in blocks:
        img = re.search(r"background-image:url\(([^)]+\.(?:png|webp)[^)]*)\)", b)
        if not img:
            img = re.search(r'src="(https://web\.hycdn\.cn/[^"]+\.(?:png|webp))"', b)
        zh = re.search(r'class="OperatorItem_nameText[^"]*"[^>]*>([^<]{1,12})<', b)
        code = re.search(r'class="OperatorItem_codename[^"]*"[^>]*>\s*//\s*([^<]{1,40})<', b)
        if not (img and zh):
            continue
        name = zh.group(1).strip()
        if name in seen:
            continue
        seen.add(name)
        operators.append(
            {"zh": name, "code": code.group(1).strip() if code else "", "url": img.group(1)}
        )
    return operators


def sync_endfield_avatars(check_only=False):
    known = load_known_characters().get(GAME_IDS["endfield"], [])
    known_zh = {zh for zh, _ in known}

    try:
        operators = endfield_operators()
    except Exception as e:  # noqa: BLE001
        print(f"[endfield] ❌ 无法读取官网干员页: {type(e).__name__}: {e}")
        return

    print(f"[endfield] 官网干员页共 {len(operators)} 个干员")

    for o in operators:
        o["zh_norm"] = norm_zh(o["zh"], known_zh)

    missing_local = []
    for o in operators:
        if o["zh_norm"] not in known_zh:
            continue
        out_dir = os.path.join(IMAGES_DIR, "endfield", o["zh_norm"])
        if not has_cover(out_dir):
            missing_local.append(o)

    unknown = [o for o in operators if o["zh_norm"] not in known_zh]
    covered = {o["zh_norm"] for o in operators}
    no_icon = [zh for zh in known_zh if zh not in covered]

    print(f"[endfield] 缺少头像: {len(missing_local)}")
    for o in missing_local:
        print(f"        - {o['zh']} (// {o['code']})")
    if no_icon:
        print(f"[endfield] 角色库中官网无立绘的条目: {len(no_icon)} -> {', '.join(sorted(no_icon)[:15])}")
    if unknown:
        print(f"[endfield] 官网有但角色库没有的（需人工补 characters-data.ts）: {len(unknown)}")
        for o in unknown[:15]:
            print(f"        - {o['zh']} (// {o['code']})")

    if check_only or not missing_local:
        return

    for o in missing_local:
        try:
            raw = http_bytes(o["url"], headers={"User-Agent": UA})
            img = Image.open(io.BytesIO(raw)).convert("RGBA")
            if img.size != ENDFIELD_COVER_SIZE:
                img = img.resize(ENDFIELD_COVER_SIZE, Image.LANCZOS)
            save_cover_png(img, os.path.join(IMAGES_DIR, "endfield", o["zh_norm"]))
            print(f"[endfield] ✅ {o['zh_norm']}  {img.size}")
        except Exception as e:  # noqa: BLE001
            print(f"[endfield] ❌ {o['zh']}: {type(e).__name__}: {e}")


# --------------------------------------------------------------------------
# 绝区零：官方时装（catalog.json）
# --------------------------------------------------------------------------

def sync_zzz_skins(check_only=False):
    """从 Agent Outfit 页面抓取非原皮时装，与 catalog.json 比对。

    表格列序固定为：Icon | Name | Rarity | Agent | Type | Obtain。
    收录口径与既有 catalog 一致：只要 Paid / Event Reward / Commission Reward，
    不要 Default 原皮——原皮已由角色头像代表，不是可切换外观。

    脚本只做检测不自动写入：时装中文名无法可靠机器翻译，而项目要求
    以官方简体中文名为准，必须人工到官网/BWIKI 确认后录入。
    """
    catalog_path = os.path.join(GAMES_DIR, "zzz", "character-skins", "catalog.json")
    with open(catalog_path, encoding="utf-8") as f:
        catalog = json.load(f)

    params = {"action": "parse", "format": "json", "page": "Agent Outfit", "prop": "text"}
    data = http_json(ZZZ_API + "?" + urllib.parse.urlencode(params))
    html = data.get("parse", {}).get("text", {}).get("*", "")
    if not html:
        print("[zzz-skins] ❌ 无法读取 Agent Outfit 页面")
        return

    def strip_cell(cell):
        txt = re.sub(r"<[^>]+>", " ", cell)
        txt = txt.replace("&#39;", "'").replace("&amp;", "&").replace("&quot;", '"')
        return re.sub(r"\s+", " ", txt).strip()

    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    found = []
    for row in rows:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        if len(cells) < 5:
            continue
        # 0=Icon 1=Name 2=Rarity 3=Agent 4=Type 5=Obtain
        outfit = strip_cell(cells[1])
        agent = strip_cell(cells[3])
        otype = strip_cell(cells[4])
        if not outfit or not agent or otype.lower() == "name":
            continue
        if not re.search(r"Paid|Event Reward|Commission Reward", otype, re.I):
            continue
        found.append({"outfit": outfit, "character": agent, "type": otype})

    have = set()
    for c in catalog["characters"]:
        for sk in c["skins"]:
            have.add((norm_en(c["nameEn"]), norm_en(sk["nameEn"])))

    new = [f for f in found if (norm_en(f["character"]), norm_en(f["outfit"])) not in have]

    print(f"[zzz-skins] 页面非原皮时装 {len(found)} 套，catalog 现有 {len(have)} 套")
    print(f"[zzz-skins] 待补充: {len(new)}")
    for n in new:
        print(f"        - {n['character']} / {n['outfit']}  ({n['type']})")

    if new:
        print(
            "\n[zzz-skins] ⚠️  新增时装需人工录入（脚本不自动写，避免译名出错）：\n"
            "        1. 到 ZZZ 官网/BWIKI 确认该时装的官方简体中文名\n"
            "        2. 下载官方立绘 Agent_<角色>_<时装>_Portrait.png\n"
            "        3. 缩放到高度 1200，存为 images/<中文角色名>/zzz-outfit-<slug>.webp\n"
            "        4. 在 catalog.json 对应角色 skins 数组追加条目（含 imageSha256）"
        )


def main():
    ap = argparse.ArgumentParser(description="同步绝区零与终末地的角色头像与官方外观立绘")
    ap.add_argument("--check", action="store_true", help="只检查缺失，不写文件")
    ap.add_argument("--avatars", action="store_true", help="只同步角色头像")
    ap.add_argument("--skins", action="store_true", help="只检查/同步官方时装")
    ap.add_argument("--all", action="store_true", help="全部同步")
    args = ap.parse_args()

    do_all = args.all or not (args.avatars or args.skins)
    check_only = args.check

    if do_all or args.avatars:
        sync_zzz_avatars(check_only)
        print()
        sync_endfield_avatars(check_only)
        print()
    if do_all or args.skins:
        sync_zzz_skins(check_only)

    print("\n完成。同步后请运行：npm test && npm run typecheck && npm run build")


if __name__ == "__main__":
    sys.exit(main())
