"""Цифры для заголовочного шрифта Prata.

У Prata единица неотличима от строчной «l»: «11:00» читается как «ll:00», «1 390 ₽» — как «l 390 ₽».
Скрипт берёт маюскульные цифры Playfair Display (тот же стиль с контрастными штрихами), увеличивает их до роста
цифр Prata и собирает:

  1. public/fonts/prata-digits-<хэш>.woff2 — десять цифр для сайта (подключается в src/app/fonts.css как часть
     семейства Prata на диапазон U+0030–0039);
  2. src/assets/og/Prata-Regular.ttf — тот же шрифт для картинок превью ссылок, цифры заменены прямо в файле.

Запуск из корня репозитория (нужны fonttools и brotli):

    pip install fonttools brotli
    python scripts/fonts/prata-digits.py

Шрифты распространяются по SIL Open Font License 1.1. У Playfair Display зарезервировано имя, поэтому производный
файл с цифрами назван по-своему («Stolitsa Numerals»); сведения об авторах и лицензии в нём сохранены.
"""
import hashlib
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "public" / "fonts"
PLAYFAIR = FONTS / "playfair-display-normal-latin-9deeae.woff2"
PRATA = FONTS / "prata-normal-latin-c9c5f3.woff2"
OG_PRATA = ROOT / "src" / "assets" / "og" / "Prata-Regular.ttf"

DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
WEIGHT = 400  # толщина штрихов Playfair, после увеличения совпадающая с Prata
SCALE = 1.13  # рост прописных: Prata 800, Playfair 708
NAME = "Stolitsa Numerals"


def build_digits() -> TTFont:
    """Десять маюскульных цифр Playfair Display в росте и вертикальных метриках Prata."""
    font = instancer.instantiateVariableFont(TTFont(PLAYFAIR), {"wght": WEIGHT})
    font.recalcTimestamp = False  # без отметки времени сборки: повторный запуск даёт тот же файл и тот же хэш в имени
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = [0, 13, 14]  # авторы, лицензия и ссылка на неё остаются в файле
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    opts.glyph_names = False
    opts.drop_tables += ["GSUB", "GPOS", "GDEF", "STAT", "DSIG", "MVAR", "HVAR", "avar"]
    sub = subset.Subsetter(opts)
    sub.populate(glyphs=[d + ".lf" for d in DIGITS])
    sub.subset(font)

    cmap = newTable("cmap")
    cmap.tableVersion = 0
    table = CmapSubtable.newSubtable(4)
    table.platformID, table.platEncID, table.language = 3, 1, 0
    table.cmap = {0x30 + i: d + ".lf" for i, d in enumerate(DIGITS)}
    cmap.tables = [table]
    font["cmap"] = cmap

    upm = font["head"].unitsPerEm
    scale_upem(font, round(upm * SCALE))
    font["head"].unitsPerEm = upm

    # Цифры стоят в одной строке с буквами Prata: с её метриками они не меняют ни высоту строки, ни базовую линию.
    prata = TTFont(PRATA)
    for attr in ("ascent", "descent", "lineGap"):
        setattr(font["hhea"], attr, getattr(prata["hhea"], attr))
    for attr in ("sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "sxHeight", "sCapHeight"):
        if hasattr(prata["OS/2"], attr) and hasattr(font["OS/2"], attr):
            setattr(font["OS/2"], attr, getattr(prata["OS/2"], attr))
    font["OS/2"].usFirstCharIndex, font["OS/2"].usLastCharIndex = 0x30, 0x39

    description = (
        f"Lining figures of Playfair Display (wght {WEIGHT}), enlarged by {SCALE} to the figure height of Prata. "
        "Modified version; SIL Open Font License 1.1."
    )
    for name_id, value in ((1, NAME), (2, "Regular"), (3, f"{NAME} 1.0"), (4, NAME), (5, "Version 1.0"), (6, NAME.replace(" ", "")), (10, description)):
        font["name"].setName(value, name_id, 3, 1, 0x409)
    return font


def save_web(digits: TTFont) -> Path:
    digits.flavor = "woff2"
    buf = io.BytesIO()
    digits.save(buf)
    data = buf.getvalue()
    for old in FONTS.glob("prata-digits-*.woff2"):
        old.unlink()
    out = FONTS / f"prata-digits-{hashlib.sha256(data).hexdigest()[:6]}.woff2"
    out.write_bytes(data)
    return out


def patch_og(digits: TTFont) -> None:
    """В TTF для превью ссылок цифры заменяются на месте, а кернинг Prata, рассчитанный на старые формы, снимается."""
    font = TTFont(OG_PRATA, recalcTimestamp=False)
    glyphs = digits.getGlyphSet()
    cmap = font.getBestCmap()
    names = [cmap[0x30 + i] for i in range(10)]
    for target, source in zip(names, DIGITS):
        pen = TTGlyphPen(None)
        glyphs[source + ".lf"].draw(pen)
        font["glyf"][target] = pen.glyph()
        font["hmtx"][target] = (digits["hmtx"][source + ".lf"][0], digits["hmtx"][source + ".lf"][1])
    if "GPOS" in font:
        skip = set(names)
        for lookup in font["GPOS"].table.LookupList.Lookup:
            for st in lookup.SubTable:
                st = getattr(st, "ExtSubTable", st)
                if type(st).__name__ != "PairPos":
                    continue
                if st.Format == 1:
                    keep = [(g, ps) for g, ps in zip(st.Coverage.glyphs, st.PairSet) if g not in skip]
                    st.Coverage.glyphs = [g for g, _ in keep]
                    st.PairSet = [ps for _, ps in keep]
                    for ps in st.PairSet:
                        ps.PairValueRecord = [r for r in ps.PairValueRecord if r.SecondGlyph not in skip]
                        ps.PairValueCount = len(ps.PairValueRecord)
                    st.PairSetCount = len(st.PairSet)
                else:
                    st.Coverage.glyphs = [g for g in st.Coverage.glyphs if g not in skip]
                    for class_def in (st.ClassDef1, st.ClassDef2):
                        for g in skip:
                            class_def.classDefs.pop(g, None)
    font.save(OG_PRATA)


def main() -> None:
    for path in (PLAYFAIR, PRATA, OG_PRATA):
        if not path.exists():
            sys.exit(f"нет файла: {path.relative_to(ROOT)}")
    web = save_web(build_digits())
    patch_og(build_digits())
    print(f"{web.relative_to(ROOT)} ({web.stat().st_size} байт) — имя файла нужно указать в src/app/fonts.css")
    print(f"{OG_PRATA.relative_to(ROOT)} — цифры заменены")


if __name__ == "__main__":
    main()
