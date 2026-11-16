#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校园智能调度平台 —— 项目讲解（完整版，18 页 / 16:9）

沿用 scripts/build-ppt.py 的设计语言（浅灰底、白色圆角卡、电光紫、青绿点缀、
kicker + 31pt 标题 + 13.5pt 描述 + 页脚细线），在原有 14 页骨架上扩成 18 页，
补齐：校区现实、场景替换、AI 规则引擎、演示身份、现场演示脚本。

所有数字均来自仓库内真实文件或演示内置数据，页面脚注标注数据性质。
"""
import os
import sys

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import (XL_CHART_TYPE, XL_LABEL_POSITION,
                             XL_MARKER_STYLE, XL_TICK_MARK)
from pptx.oxml.ns import qn
from lxml import etree
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'docs', 'ppt-assets')
SHOTS = os.path.join(ROOT, 'docs', 'screenshots')
OUT = os.path.join(ROOT, 'docs', '校园智能调度平台-项目讲解-完整版.pptx')

# ---------------------------------------------------------------- design tokens
INK = '151830'
MUTED = '5F677C'
FAINT = '9AA2B6'
BRAND = '6C63FF'
BRAND_D = '4B42C9'
TEAL = '12B3A6'
AMBER = 'F5A623'
CORAL = 'FF6B6B'
BG = 'F6F7FB'
WHITE = 'FFFFFF'
LINE = 'E4E7F1'
DARK = '0E1023'
DARK_CARD = '1A1C3E'
LIGHT_W = 'F2F3FA'
SOFT = 'EFEDFF'
SOFT_T = 'E7F7F4'
SOFT_A = 'FEF4E3'

FONT = '微软雅黑'
MONO = 'Consolas'

SW, SH = 13.333, 7.5
M = 0.62
CW = SW - 2 * M
TOTAL = 18

prs = Presentation()
prs.slide_width = Inches(SW)
prs.slide_height = Inches(SH)
BLANK = prs.slide_layouts[6]


def rgb(h):
    return RGBColor.from_string(h)


def _ea(rPr, face=FONT):
    for tag in ('a:ea', 'a:cs'):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set('typeface', face)


def set_font(run, size=10, color=MUTED, bold=False, font=FONT, spc=None):
    f = run.font
    f.size = Pt(size)
    f.bold = bold
    f.color.rgb = rgb(color)
    f.name = font
    rPr = run._r.get_or_add_rPr()
    _ea(rPr, FONT)          # 中文一律回到微软雅黑，避免等宽字体缺字
    if spc is not None:
        rPr.set('spc', str(int(spc * 100)))


def _frame(slide, x, y, w, h, anchor=MSO_ANCHOR.TOP, margins=(0, 0, 0, 0), wrap=True):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left, tf.margin_right, tf.margin_top, tf.margin_bottom = [Inches(v) for v in margins]
    tf.vertical_anchor = anchor
    tf.clear()
    return box, tf


def text(slide, x, y, w, h, content, size=10, color=MUTED, bold=False,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, line=1.2, font=FONT,
         margins=(0, 0, 0, 0), spc=None, wrap=True):
    box, tf = _frame(slide, x, y, w, h, anchor, margins, wrap)
    lines = str(content).split('\n')
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        set_font(p.add_run(), size, color, bold, font, spc)
        p.runs[0].text = ln
    return box


def rich(slide, x, y, w, h, lines, size=10, color=MUTED, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, line=1.2, margins=(0, 0, 0, 0)):
    """lines: [[(text, {overrides}), ...], ...] 一行一个段落。"""
    box, tf = _frame(slide, x, y, w, h, anchor, margins)
    for i, parts in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        for t, ov in parts:
            r = p.add_run()
            r.text = t
            set_font(r, ov.get('size', size), ov.get('color', color),
                     ov.get('bold', False), ov.get('font', FONT), ov.get('spc'))
    return box


def para(tf, parts, size=10, color=MUTED, align=PP_ALIGN.LEFT, line=1.2,
         before=0, after=0):
    p = tf.add_paragraph()
    p.alignment = align
    p.line_spacing = line
    p.space_before = Pt(before)
    p.space_after = Pt(after)
    if isinstance(parts, str):
        parts = [(parts, {})]
    for t, ov in parts:
        r = p.add_run()
        r.text = t
        set_font(r, ov.get('size', size), ov.get('color', color),
                 ov.get('bold', False), ov.get('font', FONT), ov.get('spc'))
    return p


def soft_shadow(shape, blur=14, dist=3, alpha=0.085):
    spPr = shape._element.spPr
    for e in spPr.findall(qn('a:effectLst')):
        spPr.remove(e)
    eff = etree.SubElement(spPr, qn('a:effectLst'))
    sh = etree.SubElement(eff, qn('a:outerShdw'))
    sh.set('blurRad', str(int(blur * 12700)))
    sh.set('dist', str(int(dist * 12700)))
    sh.set('dir', '5400000')
    sh.set('rotWithShape', '0')
    clr = etree.SubElement(sh, qn('a:srgbClr'))
    clr.set('val', '151830')
    a = etree.SubElement(clr, qn('a:alpha'))
    a.set('val', str(int(alpha * 100000)))


def rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.1, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
         lw=0.75, shadow=False):
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
        try:
            sp.adjustments[0] = max(0.0, min(0.5, radius / max(0.01, min(w, h))))
        except Exception:
            pass
    else:
        sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    # 去掉主题样式，避免继承默认阴影/描边
    for st in sp._element.findall(qn('p:style')):
        sp._element.remove(st)
    sp.fill.solid()
    sp.fill.fore_color.rgb = rgb(fill)
    if line:
        sp.line.color.rgb = rgb(line)
        sp.line.width = Pt(lw)
    else:
        sp.line.fill.background()
    if shadow:
        soft_shadow(sp)
    else:
        sp.shadow.inherit = False
    return sp


def card(slide, x, y, w, h, fill=WHITE, line=LINE, radius=0.1, shadow=True, lw=0.75):
    return rect(slide, x, y, w, h, fill=fill, line=line, radius=radius, lw=lw, shadow=shadow)


def bg(slide, color=BG):
    rect(slide, 0, 0, SW, SH, fill=color, shape=MSO_SHAPE.RECTANGLE, shadow=False)


def kicker(slide, label, x=M, y=0.42, color=BRAND):
    rect(slide, x, y + 0.055, 0.105, 0.105, fill=color, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(slide, x + 0.21, y, 7.6, 0.24, label, 10.5, color, True, spc=0.9)


def title(slide, s, x=M, y=0.64, w=12.0, size=31, color=INK):
    text(slide, x, y, w, 0.82, s, size, color, True, line=1.06)


def desc(slide, s, x=M, y=1.47, w=11.3, size=13.5, color=MUTED):
    text(slide, x, y, w, 0.42, s, size, color, line=1.2)


def footer(slide, no, dark=False):
    line = '2A2D52' if dark else LINE
    fg = FAINT if not dark else '6F7690'
    rect(slide, M, 6.98, CW, 0.008, fill=line, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(slide, M, 7.08, 7.0, 0.2, '校园智能调度平台', 8.5, fg)
    text(slide, SW - M - 1.6, 7.08, 1.6, 0.2, '%02d / %d' % (no, TOTAL), 8.5, fg, align=PP_ALIGN.RIGHT)


def note(slide, s, y=6.6):
    text(slide, M, y, 11.6, 0.22, s, 8.5, FAINT)


def chip(slide, x, y, w, h, label, fg, fill=WHITE, size=9, bold=True, line=None, radius=0.12):
    rect(slide, x, y, w, h, fill=fill, line=line, radius=radius)
    text(slide, x, y, w, h, label, size, fg, bold, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def dot(slide, x, y, d, color):
    rect(slide, x, y, d, d, fill=color, shape=MSO_SHAPE.OVAL, shadow=False)


def pill(slide, x, y, w, h, label, fg, fill, size=9, bold=True):
    rect(slide, x, y, w, h, fill=fill, line=None, radius=h / 2)
    text(slide, x, y, w, h, label, size, fg, bold, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def arrow_down(slide, cx, y, h=0.16, color=FAINT):
    sp = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(cx - 0.055), Inches(y), Inches(0.11), Inches(h))
    for st in sp._element.findall(qn('p:style')):
        sp._element.remove(st)
    sp.fill.solid()
    sp.fill.fore_color.rgb = rgb(color)
    sp.line.fill.background()
    sp.shadow.inherit = False
    return sp


def picture(slide, path, x, y, w=None, h=None, frame=True, pad=0.05, radius=0.08):
    iw, ih = Image.open(path).size
    aspect = iw / ih
    if w and not h:
        h = w / aspect
    elif h and not w:
        w = h * aspect
    if frame:
        fr = rect(slide, x - pad, y - pad, w + 2 * pad, h + 2 * pad,
                  fill=WHITE, line=LINE, radius=radius, lw=0.75)
        soft_shadow(fr, blur=18, dist=4, alpha=0.10)
    slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    return w, h


def cropped_picture(slide, path, x, y, w, crop, pad=0.05, radius=0.08):
    """按比例裁切图片后放入指定宽度；外框与可见区域等比例，避免拉伸。"""
    l, r, t, b = crop
    iw, ih = Image.open(path).size
    vis_w, vis_h = iw * (1 - l - r), ih * (1 - t - b)
    h = w * vis_h / vis_w
    fr = rect(slide, x - pad, y - pad, w + 2 * pad, h + 2 * pad,
              fill=WHITE, line=LINE, radius=radius, lw=0.75)
    soft_shadow(fr, blur=18, dist=4, alpha=0.10)
    pic = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    pic.crop_left, pic.crop_right = l, r
    pic.crop_top, pic.crop_bottom = t, b
    return w, h


def fit_note(slide, s):
    slide.notes_slide.notes_text_frame.text = s


def slide_new():
    s = prs.slides.add_slide(BLANK)
    bg(s)
    return s


def head(s, k, t, d=None, dw=11.3):
    kicker(s, k)
    title(s, t)
    if d:
        desc(s, d, w=dw)


# ---------------------------------------------------------------- chart helpers
def _clear_chart_area(chart):
    """去掉图表区填充与边框（python-pptx 未暴露 chart.format）。"""
    from pptx.oxml import parse_xml
    from pptx.oxml.ns import nsdecls
    cs = chart._chartSpace
    for old in cs.findall(qn('c:spPr')):
        cs.remove(old)
    xml = ('<c:spPr %s><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' % nsdecls('c', 'a'))
    cs.chart.addnext(parse_xml(xml))


def _chart_font(chart, size=9, color=MUTED):
    chart.font.size = Pt(size)
    chart.font.color.rgb = rgb(color)
    chart.font.name = FONT
    txPr = chart._chartSpace.find(qn('c:txPr'))
    if txPr is not None:
        for rPr in txPr.iter(qn('a:defRPr')):
            _ea(rPr, FONT)


def bar_chart(slide, x, y, w, h, cats, vals, colors=None, maxv=None, unit=10, size=9):
    cd = CategoryChartData()
    cd.categories = list(reversed(cats))
    cd.add_series('n', list(reversed(vals)))
    gf = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    ch = gf.chart
    ch.has_legend = False
    ch.has_title = False
    ch.font.size = Pt(size)
    _chart_font(ch, size)
    _clear_chart_area(ch)
    plot = ch.plots[0]
    plot.gap_width = 44
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.font.size = Pt(10)
    dl.font.bold = True
    dl.font.color.rgb = rgb(INK)
    dl.position = XL_LABEL_POSITION.OUTSIDE_END
    ser = plot.series[0]
    ser.format.fill.solid()
    ser.format.fill.fore_color.rgb = rgb(BRAND)
    if colors:
        for i, c in enumerate(list(reversed(colors))):
            pt = ser.points[i]
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = rgb(c)
    ca = ch.category_axis
    ca.has_major_gridlines = False
    ca.format.line.color.rgb = rgb(LINE)
    ca.tick_labels.font.size = Pt(size)
    ca.tick_labels.font.color.rgb = rgb(MUTED)
    ca.major_tick_mark = XL_TICK_MARK.NONE
    va = ch.value_axis
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = rgb('EEF0F6')
    va.major_gridlines.format.line.width = Pt(0.75)
    va.format.line.fill.background()
    va.maximum_scale = maxv if maxv else max(vals) * 1.25
    va.minimum_scale = 0
    va.major_unit = unit
    va.tick_labels.font.size = Pt(8)
    va.tick_labels.font.color.rgb = rgb(FAINT)
    va.major_tick_mark = XL_TICK_MARK.NONE
    return ch


def line_chart(slide, x, y, w, h, cats, vals, maxv=100, minv=50):
    cd = CategoryChartData()
    cd.categories = cats
    cd.add_series('准确率', vals)
    gf = slide.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    ch = gf.chart
    ch.has_legend = False
    ch.has_title = False
    _chart_font(ch, 9)
    _clear_chart_area(ch)
    plot = ch.plots[0]
    plot.has_data_labels = True
    dl = plot.data_labels
    dl.font.size = Pt(11)
    dl.font.bold = True
    dl.font.color.rgb = rgb(BRAND_D)
    dl.position = XL_LABEL_POSITION.ABOVE
    ser = plot.series[0]
    ser.format.line.color.rgb = rgb(BRAND)
    ser.format.line.width = Pt(2.25)
    ser.smooth = False
    ser.marker.style = XL_MARKER_STYLE.CIRCLE
    ser.marker.size = 7
    ser.marker.format.fill.solid()
    ser.marker.format.fill.fore_color.rgb = rgb(WHITE)
    ser.marker.format.line.color.rgb = rgb(BRAND)
    ser.marker.format.line.width = Pt(2.25)
    ca = ch.category_axis
    ca.format.line.color.rgb = rgb(LINE)
    ca.tick_labels.font.size = Pt(9.5)
    ca.tick_labels.font.color.rgb = rgb(MUTED)
    ca.major_tick_mark = XL_TICK_MARK.NONE
    va = ch.value_axis
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = rgb('EEF0F6')
    va.major_gridlines.format.line.width = Pt(0.75)
    va.format.line.fill.background()
    va.maximum_scale = maxv
    va.minimum_scale = minv
    va.major_unit = 10
    va.tick_labels.font.size = Pt(8)
    va.tick_labels.font.color.rgb = rgb(FAINT)
    va.major_tick_mark = XL_TICK_MARK.NONE
    return ch


# ---------------------------------------------------------------- table helpers
def _cell_border(cell, edge='B', color=LINE, width=0.75):
    tcPr = cell._tc.get_or_add_tcPr()
    tag = {'L': 'a:lnL', 'R': 'a:lnR', 'T': 'a:lnT', 'B': 'a:lnB'}[edge]
    for e in tcPr.findall(qn(tag)):
        tcPr.remove(e)
    ln = etree.SubElement(tcPr, qn(tag))
    ln.set('w', str(int(width * 12700)))
    ln.set('cap', 'flat')
    ln.set('cmpd', 'sng')
    ln.set('algn', 'ctr')
    sf = etree.SubElement(ln, qn('a:solidFill'))
    c = etree.SubElement(sf, qn('a:srgbClr'))
    c.set('val', color)


def table(slide, x, y, w, cols, rows, widths, row_h=0.42, header_h=0.38,
          size=10, head_size=9, aligns=None, head_fill=LIGHT_W):
    nrows = len(rows) + 1
    gf = slide.shapes.add_table(nrows, len(cols), Inches(x), Inches(y), Inches(w), Inches(header_h + row_h * len(rows)))
    tbl = gf.table
    tblPr = tbl._tbl.tblPr
    for e in tblPr.findall(qn('a:tableStyleId')):
        tblPr.remove(e)
    tbl.first_row = False
    tbl.horz_banding = False
    for i, wd in enumerate(widths):
        tbl.columns[i].width = Inches(wd)
    tbl.rows[0].height = Inches(header_h)
    for r in range(1, nrows):
        tbl.rows[r].height = Inches(row_h)
    aligns = aligns or [PP_ALIGN.LEFT] * len(cols)

    def fill_cell(r, c, txt, bold=False, color=INK, sz=size, bgc=WHITE):
        cell = tbl.cell(r, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = rgb(bgc)
        cell.margin_left = Inches(0.10)
        cell.margin_right = Inches(0.06)
        cell.margin_top = Inches(0.02)
        cell.margin_bottom = Inches(0.02)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.alignment = aligns[c]
        r_ = p.add_run()
        r_.text = txt
        set_font(r_, sz, color, bold, FONT)
        for e in ('L', 'T', 'R'):
            _cell_border(cell, e, WHITE, 0)
        _cell_border(cell, 'B', LINE, 0.75)

    for c, name in enumerate(cols):
        fill_cell(0, c, name, True, MUTED, head_size, head_fill)
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            fill_cell(r, c, str(val), c == 0, INK, size)
    return tbl


# ================================================================ 01 cover
def s01():
    s = prs.slides.add_slide(BLANK)
    bg(s, DARK)
    # 背景光斑
    for (x, y, d, c) in [(6.4, -2.3, 7.4, '1B1E45'), (8.9, 4.4, 6.2, '10322F'), (-1.6, 4.9, 4.2, '141634')]:
        o = rect(s, x, y, d, d, fill=c, shape=MSO_SHAPE.OVAL, shadow=False)
        o.line.fill.background()

    # logo：渐变圆角方块 + 白色「搭」字
    logo = rect(s, 0.92, 0.82, 0.86, 0.86, fill=TEAL, radius=0.2)
    logo.fill.gradient()
    logo.fill.gradient_angle = 45
    st = logo.fill.gradient_stops
    st[0].color.rgb = rgb(BRAND)
    st[0].position = 0.0
    st[1].color.rgb = rgb(TEAL)
    st[1].position = 1.0
    logo.line.fill.background()
    text(s, 0.92, 0.82, 0.86, 0.86, '搭', 27, WHITE, True,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

    text(s, 1.98, 0.88, 2.4, 0.32, '校园智能调度平台', 19, WHITE, True)
    text(s, 1.99, 1.20, 2.6, 0.24, 'AI 智能调度', 10.5, 'AEB5CC', spc=0.6)

    text(s, 1.98, 1.86, 8.2, 0.24, '河南新华电脑学院 · AI 应用创意大赛 · V1.0', 10.5, 'C9CEE3', True, spc=0.4)

    text(s, 1.94, 2.20, 6.9, 2.20, '一句话，\n把校园里的事\n安排好。', 40, WHITE, True, line=1.08)
    text(s, 1.98, 4.52, 6.55, 0.72,
         '面向校园场景的 AI 调度网站：自然语言输入 → 意图解析 →\n资源匹配 → 结果生成 → 自动通知。',
         13, 'C3C8DC', line=1.45)

    labels = ['教室借用', '失物招领', '拼单集市', '校园论坛']
    cols = ['9C95FF', '5FD9CE', 'FFC46B', 'FF9A9A']
    x = 1.98
    for i, (lb, c) in enumerate(zip(labels, cols)):
        w = 0.36 + len(lb) * 0.175
        rect(s, x, 5.36, w, 0.36, fill='242745', line=None, radius=0.18)
        text(s, x, 5.36, w, 0.36, lb, 9.5, c, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        x += w + 0.14

    text(s, 1.98, 5.95, 6.6, 0.24, '42 处教学场所 · 4 个场景 · 15 个页面 · 0 后端依赖', 9.5, '8F96AF')
    text(s, 1.98, 6.24, 6.7, 0.22, '纯前端可离线演示；AI 由本地可解释规则引擎驱动，不调用真实大模型。', 8.5, '6F7690')
    text(s, 1.98, 6.48, 6.6, 0.22, '页面内所有数字均为演示内置数据，非线上实测。', 8.5, '6F7690')

    # 右侧流水线卡
    cx, cy, cw, chh = 8.86, 2.26, 3.62, 3.98
    card(s, cx, cy, cw, chh, fill=DARK_CARD, line='2E3160', radius=0.12, shadow=False)
    text(s, cx + 0.34, cy + 0.30, 2.2, 0.22, 'AI 调度流水线', 11, WHITE, True)
    dot(s, cx + cw - 0.52, cy + 0.36, 0.07, TEAL)
    text(s, cx + cw - 0.42, cy + 0.31, 0.34, 0.18, '实时', 7.5, TEAL)

    steps = [('01', '需求解析', '自然语言 → 结构化意图'),
             ('02', '智能匹配', '资源检索 + 规则可解释'),
             ('03', '结果生成', '方案 / 文案 / 帖子'),
             ('04', '自动通知', '站内信 + 重要提醒')]
    for i, (no, name, sub) in enumerate(steps):
        yy = cy + 0.78 + i * 0.72
        rect(s, cx + 0.30, yy, 0.40, 0.34, fill='2A2C55', line=None, radius=0.08)
        text(s, cx + 0.30, yy, 0.40, 0.34, no, 8, 'B9BCFF', True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=MONO)
        text(s, cx + 0.82, yy - 0.02, 2.3, 0.22, name, 10.5, WHITE, True)
        text(s, cx + 0.82, yy + 0.20, 2.5, 0.2, sub, 7.8, '9AA0BC')

    rect(s, cx + 0.30, cy + 3.35, cw - 0.60, 0.008, fill='2E3160', shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, cx + 0.30, cy + 3.50, 1.8, 0.2, '平均 2.3s 返回方案', 7.8, '9AA0BC')
    text(s, cx + cw - 1.42, cy + 3.50, 1.12, 0.2, '演示记录', 7.8, '6F7690', align=PP_ALIGN.RIGHT)

    fit_note(s, '各位老师好，我们是校园智能调度平台。这个项目的出发点很简单：校园里的事不该让人来回问。今天用十八页讲清三件事——它解决什么问题、怎么做的、哪些已经真跑通、哪些还没有。页面上的数字都是演示内置数据，不是线上实测。')
    return s


# ================================================================ 02 problem
def s02():
    s = slide_new()
    head(s, '02 · PROBLEM',
         '校园里的“小事”，为什么总要花很多时间？',
         '四类高频需求散落在群聊、表格和公告里：信息不对称，重复沟通的成本全落在学生身上。')

    items = [
        ('01', BRAND, '找教室', '空闲信息不透明', '问班群、跑楼层看门牌；换一个时间，就要重新问一遍。'),
        ('02', TEAL, '找失物', '描述不清难匹配', '丢的人和捡到的人各发一条，颜色、地点、时间对不上就沉底。'),
        ('03', AMBER, '拼单', '接龙靠刷屏', '满员没人提醒、截止没人收口，发起人反复核对名单。'),
        ('04', CORAL, '找同频', '帖子容易沉底', '重复提问多、相似讨论散落，缺少结构化标签与摘要。'),
    ]
    for i, (no, c, name, sub, body) in enumerate(items):
        x = M + i * 3.07
        card(s, x, 1.96, 2.85, 2.62)
        rect(s, x + 0.28, 2.18, 0.46, 0.46, fill=c, radius=0.12)
        text(s, x + 0.28, 2.18, 0.46, 0.46, no, 10.5, WHITE, True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=MONO)
        text(s, x + 0.28, 2.82, 2.3, 0.34, name, 16, INK, True)
        text(s, x + 0.28, 3.18, 2.3, 0.24, sub, 10, c, True)
        text(s, x + 0.28, 3.56, 2.32, 0.86, body, 9.5, MUTED, line=1.45)

    # 结论条
    card(s, M, 4.88, CW, 1.14, fill=SOFT, line=None, radius=0.1, shadow=False)
    rect(s, M, 4.88, 0.075, 1.14, fill=BRAND, radius=0.03, shadow=False)
    text(s, M + 0.34, 5.03, 11.2, 0.36,
         '“不是没有资源，而是需求与资源之间缺一个会理解、会匹配、会通知的中间层。”',
         16, BRAND_D, True)
    text(s, M + 0.34, 5.46, 11.1, 0.28,
         '四种场景共享同一套 AI 调度能力，而不是四个各自动手的小工具。', 10, MUTED)

    note(s, '场景来自方案设定的校园高频需求；本页不引用未经实测的用户调研数字。')
    fit_note(s, '先看问题。借教室靠问、找失物靠刷、拼单靠记、提问靠沉底。四件事看起来不同，本质相同：需求在群里，资源在表里，中间缺一个会理解、会匹配、会通知的中间层。这不是我们编的用户调研，是方案设定的四类高频场景。')
    footer(s, 2)
    return s


# ================================================================ 03 campus reality
def s03():
    s = slide_new()
    head(s, '03 · REALITY',
         '先把学校讲对：42 处场所',
         '教学场所按《10.26 教学场所（东校区）》重建；专业以 AI+ 为主，场地清单就是产品边界。')

    # 大数字
    text(s, M, 1.94, 2.1, 0.62, '42', 40, BRAND_D, True, line=1.0)
    text(s, M + 1.02, 2.02, 1.5, 0.24, '处教学场所', 10.5, INK, True)
    text(s, M + 1.02, 2.28, 1.9, 0.22, '另有 5 间「容量待核」', 8.5, FAINT)

    # 构成图
    text(s, M, 2.82, 4.6, 0.22, '场所构成（处）', 9.5, MUTED, True, spc=0.4)
    cats = ['A栋教室', '3F 会议室', '1F 报告厅', 'B栋台球教室', 'B栋电竞教室']
    vals = [36, 1, 1, 1, 3]
    bar_chart(s, M - 0.12, 3.06, 5.24, 2.62, cats, vals,
              colors=[BRAND, TEAL, AMBER, CORAL, BRAND_D], maxv=40, unit=10, size=8.5)
    text(s, M, 5.76, 5.0, 0.42,
         'A栋 1–3F 共 36 间教室；A栋另有 3F 会议室、1F 报告厅；\nB栋 1F 台球教室、2F 三间电竞教室。合计 42 处。',
         8.8, FAINT, line=1.4)

    # 右上有
    card(s, 6.55, 1.94, 6.16, 2.16)
    text(s, 6.85, 2.12, 5.6, 0.24, '真实存在的 42 处', 11.5, TEAL, True)
    rich(s, 6.85, 2.46, 5.55, 1.72, [
        [('A栋 1–3F · 36 间教室　', {'bold': True, 'color': INK}),
         ('AI+人工智能 / AI+新媒体电商 / AI+全媒体影视…', {'color': MUTED})],
        [('A栋 3F · 会议室 30 座　A栋 1F · 报告厅 200 座', {'color': INK})],
        [('B栋 1F · 台球教室 40 座　B栋 2F · 电竞教室 48 / 40 / 32 座', {'color': INK})],
        [('5 间桌椅为空 → 标「容量待核」，不臆造容量', {'color': FAINT})],
    ], size=9.3, line=1.55)

    # 右下没有
    card(s, 6.55, 4.28, 6.16, 2.02)
    text(s, 6.85, 4.46, 5.6, 0.24, '因此明确不做的事', 11.5, CORAL, True)
    rows = [
        ('✕', '未接入座位预约数据', '→ 不做座位预约'),
        ('✕', '未接入课表数据', '→ 不做课表查询'),
        ('✕', '未接入宿舍报修、校车、缴费', '→ 不写进路线图'),
        ('✓', '只调度真实场所与 11 个校园地标、6 个取货点', ''),
    ]
    yy = 4.80
    for mark, a, b in rows:
        c = CORAL if mark == '✕' else TEAL
        text(s, 6.85, yy, 0.22, 0.22, mark, 9.5, c, True)
        rich(s, 7.10, yy - 0.01, 5.4, 0.24, [[(a, {'bold': True, 'color': INK}), ('  ' + b, {'color': MUTED})]], size=9.2)
        yy += 0.34

    note(s, '场所清单依据《10.26 教学场所（东校区）》整理；B栋特殊教室与场地占用为演示设定。')
    fit_note(s, '先把学校讲对。东校区真实可用的教学场所是四十二处：A栋三十六间教室、三F会议室、一F报告厅，B栋台球教室和三间电竞教室。未接入座位预约与课表数据，所以这两类查询不做。产品只调度真实存在的东西。')
    footer(s, 3)
    return s


# ================================================================ 04 solution
def s04():
    s = slide_new()
    head(s, '04 · SOLUTION',
         '一个入口，四个场景，一条 AI 流水线',
         '把“人跑腿去问”的部分交给解析、匹配、生成与通知；人只负责确认。')

    # 输入
    rect(s, M, 1.92, 6.42, 0.50, fill=SOFT, line=None, radius=0.25)
    dot(s, M + 0.20, 2.10, 0.13, BRAND)
    text(s, M + 0.44, 1.92, 5.8, 0.50,
         '“周四下午想借一间 40 人、带投影的教室开班会”', 10.5, BRAND_D, True, anchor=MSO_ANCHOR.MIDDLE)

    card(s, M, 2.56, 6.42, 3.42)
    # 竖向连接线
    rect(s, M + 0.50, 2.94, 0.012, 1.98, fill=LINE, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    steps = [
        ('01', BRAND, '需求解析', '自然语言 → 场景、字段、置信度', 'parseRequirement'),
        ('02', TEAL, '资源匹配', '硬过滤 → 加权排序 → 3 个候选', 'recommendClassrooms'),
        ('03', AMBER, '结果生成', '推荐理由 / 招领文案 / 拼单 / 帖子', 'buildForumDraft'),
        ('04', CORAL, '自动通知', '站内信 + 重要提醒 + 状态时间线', 'buildNotice'),
    ]
    for i, (no, c, name, sub, fn) in enumerate(steps):
        yy = 2.78 + i * 0.66
        rect(s, M + 0.38, yy, 0.26, 0.26, fill=c, shape=MSO_SHAPE.OVAL, shadow=False)
        text(s, M + 0.38, yy, 0.26, 0.26, no, 7.5, WHITE, True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=MONO)
        text(s, M + 0.80, yy - 0.03, 1.55, 0.24, name, 11, INK, True)
        text(s, M + 2.32, yy - 0.02, 3.0, 0.24, sub, 9, MUTED)
        text(s, M + 2.32, yy + 0.20, 3.4, 0.2, fn + '()', 7.4, FAINT, font=MONO)

    rect(s, M + 0.28, 5.44, 5.86, 0.008, fill=LINE, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, M + 0.28, 5.53, 5.8, 0.28,
         'AI 只产出建议；提交、审核与认领仍由人完成。', 8.8, MUTED)

    # 右侧四场景
    scenes = [
        ('教室借用', '42 处场所', '3 个候选', '一键申请', BRAND),
        ('失物招领', '双向比对', '89% 线索', '人工认领', TEAL),
        ('拼单集市', '还差 4 份', '临期提醒', '成团收口', AMBER),
        ('校园论坛', '相似帖推荐', 'AI 摘要', '标签归档', CORAL),
    ]
    for i, (name, a, b, c, col) in enumerate(scenes):
        yy = 1.92 + i * 1.03
        card(s, 7.36, yy, 5.36, 0.93)
        rect(s, 7.36, yy + 0.19, 0.055, 0.55, fill=col, radius=0.02, shadow=False)
        text(s, 7.60, yy + 0.12, 1.9, 0.26, name, 11.5, INK, True)
        text(s, 7.62, yy + 0.46, 4.9, 0.22, a + '　·　' + b + '　·　' + c, 8.6, MUTED)
        text(s, 12.28, yy + 0.30, 0.30, 0.26, '›', 14, FAINT, True)

    note(s, '四个场景共用同一套解析与生成；页面内的场所数、候选数与匹配度为演示内置数据。')
    fit_note(s, '方案是一条流水线：一句话进来，先解析意图，再匹配资源，然后生成结果，最后自动通知。四个场景共用这条流水线，不是四个各自为战的小工具。用户全程只做两件事：把需求说清楚，确认 AI 的理解。')
    footer(s, 4)
    return s


# ================================================================ 05 one sentence
def s05():
    s = slide_new()
    head(s, '05 · ONE SENTENCE',
         '说一句话，AI 把需求拆成“可修改的字段”',
         '不让用户猜 AI 想了什么：场景、置信度、字段全部回显，确认之后才继续。')

    # 例句
    card(s, M, 1.92, 4.78, 0.92, fill=SOFT, line=None, shadow=False)
    rect(s, M, 1.92, 0.07, 0.92, fill=BRAND, radius=0.03, shadow=False)
    text(s, M + 0.26, 2.06, 4.36, 0.22, '用户只说这一句', 8.5, BRAND_D, True, spc=0.4)
    text(s, M + 0.26, 2.30, 4.36, 0.44,
         '“周三下午想借一间能坐 30 人、\n有投影的教室开班会”', 10.2, INK, True, line=1.35)

    principles = [
        ('①', BRAND, '先回显，再执行', '解析结果逐字段可改，点「查看 AI 推荐」才落库。'),
        ('②', TEAL, '置信度可见', '94% 可确认；低于 72% 标「待人工核对」。'),
        ('③', AMBER, '缺字段不猜', '缺人数或时段就留空提示，绝不编造。'),
        ('④', CORAL, '失败可降级', '识别不出场景时给四个入口，而不是报错。'),
    ]
    for i, (no, c, name, sub) in enumerate(principles):
        yy = 3.08 + i * 0.84
        text(s, M, yy - 0.02, 0.3, 0.3, no, 12, c, True)
        text(s, M + 0.34, yy - 0.04, 4.34, 0.24, name, 11, INK, True)
        text(s, M + 0.34, yy + 0.22, 4.36, 0.36, sub, 9.2, MUTED, line=1.35)

    # 截图（裁到弹层主体：左 24.5%、右 26.5%、上 11.5%、下 17.5%）
    cropped_picture(s, os.path.join(ASSETS, 'ai-dialog.png'), 6.62, 1.92, 5.02,
                    (0.272, 0.266, 0.150, 0.183), pad=0.045, radius=0.09)
    text(s, 6.62, 6.10, 5.2, 0.24, '真实界面：场景 + 94% 置信度 + 4 个可编辑字段', 8.8, FAINT)

    note(s, '截图为 1440 宽演示环境；置信度阈值 0.72 写在 src/components/AiParseDialog.vue，可当场核对。')
    fit_note(s, '这是最核心的一屏。用户说“周三下午借一间三十人、有投影的教室开班会”，系统回显场景、置信度和四个字段，全部可改。注意这个九十四不是装饰，是置信度；低于七十二会强制人工核对，不会直接执行。')
    footer(s, 5)
    return s


# ================================================================ 06 classroom
def s06():
    s = slide_new()
    head(s, '06 · SCENE 01',
         '教室借用：先过滤硬条件，再解释为什么推荐',
         '人数、设备、时段先做硬过滤，再按距离与好评排序，给出 3 个带理由的候选。')

    stats = [('42', '处', '可用场所'), ('3', '个', '候选方案'), ('97', '%', '首选匹配度')]
    for i, (v, u, lb) in enumerate(stats):
        x = M + i * 1.60
        card(s, x, 1.92, 1.50, 0.98)
        rich(s, x + 0.16, 1.98, 1.2, 0.42, [[(v, {'size': 23, 'color': BRAND_D, 'bold': True}),
                                            (' ' + u, {'size': 9, 'color': MUTED, 'bold': True})]], line=1.0)
        text(s, x + 0.16, 2.55, 1.2, 0.2, lb, 8.3, MUTED)

    bullets = [
        ('硬过滤', '人数、设备、时段、用途，不满足的直接排除'),
        ('加权排序', '容量 30 + 时段 30 + 每项设备 9 + 同楼 16 + 好评 ×4 + 距离'),
        ('可解释', '每条候选给 4 条理由，能点回原始条件'),
        ('闭环', '一键申请预填表单 → 审核 → 状态时间线 + 站内通知'),
    ]
    for i, (k, v) in enumerate(bullets):
        yy = 3.18 + i * 0.72
        rect(s, M, yy + 0.055, 0.09, 0.09, fill=BRAND, shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, M + 0.20, yy, 1.25, 0.22, k, 10, INK, True)
        text(s, M + 0.20, yy + 0.24, 4.30, 0.42, v, 9.2, MUTED, line=1.35)

    picture(s, os.path.join(ASSETS, 'classroom-result.png'), 5.52, 1.90, w=7.18)
    text(s, 5.57, 6.05, 6.9, 0.22, '真实界面：周四 14:00–16:00 · 40 人 · 投影 · 班会，从 42 处筛出 3 处候选', 8.5, FAINT)

    note(s, '截图与候选均为演示内置数据；匹配逻辑在 src/utils/aiEngine.js，权重可逐项对照。')
    fit_note(s, '教室借用的关键是先硬过滤再解释。人数、设备、时段不满足的直接排除，四十二处里只剩三处候选；每一条推荐理由都能点回原始条件，比如容量四十一、步行二百一十米、近三十天好评百分之九十四。用户看到的是理由，不是分数。')
    footer(s, 6)
    return s


# ================================================================ 07 lostfound
def s07():
    s = slide_new()
    head(s, '07 · SCENE 02',
         '失物招领：把“像不像”拆成四个可加的分',
         '一条寻物、一条招领，AI 在后台做双向比对；物品、颜色、地点、时间各占一份权重。')

    text(s, M, 1.94, 4.6, 0.24, '89% 是怎么算出来的', 11, INK, True)

    # 堆叠条
    segs = [('45', 45, BRAND), ('18', 18, TEAL), ('18', 18, AMBER), ('8', 8, CORAL)]
    total = 89.0
    bx, bw, by, bh = M, 4.72, 2.30, 0.34
    cx = bx
    for label, v, c in segs:
        sw = bw * v / total
        rect(s, cx, by, sw - 0.02, bh, fill=c, radius=0.04, shadow=False)
        text(s, cx, by, sw, bh, label, 8.5, WHITE, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        cx += sw
    text(s, M, 2.68, 4.6, 0.22, '四项权重相加 = 89 · 相似度上限 96', 8.5, FAINT)

    legend = [
        ('物品类别完全一致', '+45', '', BRAND),
        ('颜色特征一致', '+18', '', TEAL),
        ('地点相同', '+18', '', AMBER),
        ('发布时间差 < 48h', '+8', '', CORAL),
    ]
    for i, (name, v, extra, c) in enumerate(legend):
        yy = 2.98 + i * 0.36
        rect(s, M, yy + 0.055, 0.10, 0.10, fill=c, radius=0.02, shadow=False)
        text(s, M + 0.22, yy, 2.7, 0.22, name, 9.6, INK)
        text(s, M + 3.10, yy, 0.7, 0.22, v, 10, c, True, align=PP_ALIGN.RIGHT)
        if extra:
            text(s, M + 3.85, yy, 0.9, 0.22, extra, 8, FAINT)

    # 阈值
    pill(s, M, 4.62, 1.52, 0.34, '≥ 55% 才进线索池', BRAND_D, SOFT, 8.5)
    text(s, M + 1.66, 4.67, 3.1, 0.24, '低于阈值不打扰用户', 8.5, FAINT)

    rich(s, M, 5.18, 4.42, 1.0, [
        [('AI 先把口语写成规范文案，', {'color': MUTED}), ('再进双向池', {'color': INK, 'bold': True}), ('。', {'color': MUTED})],
        [('联系人默认「林**」，认领要人工核对特征。', {'color': MUTED})],
    ], size=9.2, line=1.6)

    picture(s, os.path.join(ASSETS, 'lostfound.png'), 6.02, 1.90, w=6.60)
    text(s, 6.07, 6.14, 6.6, 0.22, '真实界面：10 条进行中 · 2 组 AI 匹配 · 89% 为四项权重求和', 8.5, FAINT)

    note(s, '89 = 45 + 18 + 18 + 8（类别完全一致 +45，包含关系 +30）；演示数据，阈值与权重见 aiEngine.js。')
    fit_note(s, '失物招领做的是双向匹配。左边这个八十九不是拍的：物品类别四十五、颜色十八、地点十八、四十八小时内八分，加起来正好八十九。超过五十五才进线索池，避免把无关信息推给用户。联系方式默认脱敏，认领要人工核对。')
    footer(s, 7)
    return s


# ================================================================ 08 groupbuy
def s08():
    s = slide_new()
    head(s, '08 · SCENE 03',
         '拼单集市：发布只是开始，收口才是难点',
         '发起、接龙、临期提醒、成团或流单——四个状态都要有明确出口，不能留下烂尾。')

    steps = [
        ('发起', '商品、单价、目标份数、取货点、截止时间', BRAND),
        ('接龙', '一键加一份，进度环与「还差 N 份」实时更新', TEAL),
        ('提醒', '临期与差额提醒发起人和参与者，不靠刷群', AMBER),
        ('收口', '成团 / 流单都归档，列表不留悬空状态', CORAL),
    ]
    for i, (name, body, c) in enumerate(steps):
        yy = 1.94 + i * 1.09
        card(s, M, yy, 4.95, 0.96)
        rect(s, M, yy + 0.16, 0.06, 0.64, fill=c, radius=0.02, shadow=False)
        text(s, M + 0.22, yy + 0.10, 0.34, 0.34, '0%d' % (i + 1), 10, c, True, font=MONO)
        text(s, M + 0.66, yy + 0.13, 1.2, 0.26, name, 12, INK, True)
        text(s, M + 1.62, yy + 0.14, 3.16, 0.56, body, 8.8, MUTED, line=1.4)

    picture(s, os.path.join(ASSETS, 'groupbuy.png'), 5.92, 1.90, w=6.78)

    # 截图下的三个事实
    facts = [('6 / 10', '已接龙'), ('60%', '成团进度'), ('还差 4 份', '临期提醒')]
    for i, (v, lb) in enumerate(facts):
        x = 5.96 + i * 2.24
        text(s, x, 5.86, 2.0, 0.28, v, 13, BRAND_D, True)
        text(s, x, 6.14, 2.0, 0.2, lb, 8.3, FAINT)
    text(s, 5.96, 6.38, 6.7, 0.2, '校门口奶茶 · ¥6.50 / 份 · 距截止 2 天 4 小时', 8.3, FAINT)

    note(s, '拼单进度为演示内置数据；取货点来自 campus.js 的 6 个真实地标。')
    fit_note(s, '拼单的难点不是发布，是收口。发起、接龙、临期提醒、成团或流单，四个状态都要有明确出口。这一单奶茶六块五，十份成团，已接六份，还差四份，系统会在截止前提醒发起人和参与者，而不是靠人反复刷群。')
    footer(s, 8)
    return s


# ================================================================ 09 forum
def s09():
    s = slide_new()
    head(s, '09 · SCENE 04',
         '从“社团排班”到“校园论坛”：一次场景替换',
         '论坛是每所学校都有的公共场景；AI 在这里的增益也更直接——起标题、打标签、找同频、做摘要。')

    bullets = [
        ('AI 帮我发帖', '给标题、分类、标签，避免“求助”两个字就发出去'),
        ('相似帖推荐', '发帖时提示已有讨论，减少重复提问'),
        ('回复摘要', '19 条回复压成 3 句，先看结论再决定要不要读'),
        ('待回复清单', '没人接的问题浮上来，而不是发完就沉'),
    ]
    for i, (k, v) in enumerate(bullets):
        yy = 1.92 + i * 0.62
        rect(s, M, yy + 0.06, 0.09, 0.09, fill=BRAND, shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, M + 0.20, yy, 1.3, 0.22, k, 10, INK, True)
        text(s, M + 1.56, yy + 0.01, 3.34, 0.4, v, 8.8, MUTED, line=1.35)

    card(s, M, 4.60, 4.92, 1.62, fill=SOFT_A, line=None, shadow=False)
    text(s, M + 0.22, 4.74, 4.4, 0.22, '为什么换掉「社团排班」', 10, '9A6200', True)
    text(s, M + 0.22, 5.02, 4.46, 1.06,
         '它依赖真实社团与指导老师数据，演示环境给不出可信输入；\n'
         '论坛人人可用，AI 的增益（标题 / 标签 / 摘要）也能当场验证。',
         8.6, '7A5510', line=1.5)

    picture(s, os.path.join(ASSETS, 'forum.png'), 5.62, 1.90, w=7.06)
    text(s, 5.67, 5.96, 7.0, 0.2, '真实界面：9 帖 · 19 回复 · 1 待回复；AI 已标注相似讨论', 8.2, FAINT)

    note(s, '场景替换发生在方案评审后；旧版方案里的社团排班已从产品中移除，不在演示中假装可用。')
    fit_note(s, '论坛不只是发帖。AI 帮想标题、打标签、找相似讨论，还能把十九条回复压成三句摘要。原来这里放的是社团排班，后来判断它太依赖真实组织数据，换成了每个学校都有的论坛。这是第一次场景替换，也是我们做减法的开始。')
    footer(s, 9)
    return s


# ================================================================ 10 AI layers
def s10():
    s = slide_new()
    head(s, '10 · AI CAPABILITY',
         'AI 能力层：可解释、可替换、可降级',
         '演示版不联网，用本地规则引擎跑同一套输入输出；接口按 GLM-4-Flash / Qwen-Turbo 的形态预留。')

    layers = [
        ('交互层', '一句话入口 / 确认弹层 / 结果页', BRAND, '只认字段，不认引擎'),
        ('应用服务层', '教室 · 失物 · 拼单 · 论坛 store', '8A82FF', '状态与持久化'),
        ('AI 能力层', '解析 · 匹配 · 生成 · 通知', TEAL, '可替换 adapter'),
        ('数据层', '演示种子 + localStorage', AMBER, '正式版 FastAPI + SQLite'),
    ]
    for i, (name, what, c, tag) in enumerate(layers):
        yy = 1.94 + i * 0.92
        card(s, M, yy, 6.42, 0.82)
        rect(s, M, yy + 0.10, 0.07, 0.62, fill=c, radius=0.02, shadow=False)
        text(s, M + 0.26, yy + 0.10, 1.8, 0.26, name, 11, INK, True)
        text(s, M + 0.26, yy + 0.40, 2.0, 0.2, tag, 7.5, FAINT)
        text(s, M + 2.42, yy + 0.10, 3.78, 0.26, what, 8.8, MUTED, align=PP_ALIGN.RIGHT)

    text(s, M, 5.68, 6.3, 0.24, '同一份 JSON：页面只认字段，不认引擎。', 9.2, BRAND_D, True)
    text(s, M, 5.98, 6.3, 0.42, '超时或识别失败时自动降级到本地规则，不把错误抛给学生。', 8.6, MUTED)

    # 代码卡
    card(s, 7.34, 1.94, 5.38, 3.96, fill=DARK_CARD, line=None, radius=0.1, shadow=False)
    text(s, 7.62, 2.10, 4.8, 0.22, 'parseRequirement( 一句话 )', 10, 'A8B0FF', True, font=MONO)
    text(s, 7.62, 2.36, 4.8, 0.2, '// 本地引擎与真实模型共用同一返回结构', 7.4, '6F7690', font=MONO)
    code = (
        '{\n'
        '  "scene": "classroom",\n'
        '  "confidence": 0.94,\n'
        '  "fields": {\n'
        '    "day": "周三",\n'
        '    "start": "14:00",\n'
        '    "end": "16:00",\n'
        '    "capacity": 30,\n'
        '    "equipment": ["投影"]\n'
        '  },\n'
        '  "missing": []\n'
        '}'
    )
    text(s, 7.62, 2.62, 4.9, 2.00, code, 8.0, 'D8DCF0', font=MONO, line=1.25)

    rect(s, 7.62, 4.58, 4.62, 0.008, fill='2A3052', shadow=False)
    checks = ['解析结果强制人工确认', '低置信度标「待人工核对」', '超时 / 失败自动切本地规则']
    for i, c in enumerate(checks):
        yy = 4.72 + i * 0.26
        text(s, 7.62, yy, 0.24, 0.2, '✓', 8.5, TEAL, True)
        text(s, 7.88, yy, 4.4, 0.2, c, 7.8, 'AEB5CC')

    text(s, 7.62, 5.58, 4.8, 0.2, '正式版：GLM-4-Flash / Qwen-Turbo 适配层', 8.2, '8F96C8', font=MONO)

    note(s, '演示版由 src/utils/aiEngine.js 执行，不发真实模型请求；模型名称仅表示接口对齐的目标。')
    fit_note(s, 'AI 能力层单独讲，因为它决定了这个项目能不能长大。演示版不联网，用本地规则引擎跑同一套输入输出；接口按 GLM-4-Flash 和 Qwen-Turbo 的形态预留，换成真模型时页面一行不用改。这是刻意的工程选择，不是临时凑数。')
    footer(s, 10)
    return s


# ================================================================ 11 engine internals
def s11():
    s = slide_new()
    head(s, '11 · ENGINE',
         'AI 不是黑箱：五个核心函数，每一步都能指给你看',
         '演示版用本地规则引擎执行同一套契约；换成 GLM / Qwen 时，函数体替换、页面不动。')

    card(s, M, 1.92, 6.45, 4.42)
    text(s, M + 0.24, 2.06, 3.8, 0.22, 'src/utils/aiEngine.js', 8.2, FAINT, font=MONO)
    rows = [
        ('detectScene', '一句话', '场景 + 置信度'),
        ('parseRequirement', '场景 + 一句话', '字段 + 缺失项'),
        ('recommendClassrooms', '条件', '3 个候选 + 4 条理由'),
        ('scoreLostPair', '两条失物信息', '0–96 相似度'),
        ('buildForumDraft', '标题 + 正文', '分类 + 标签 + 摘要'),
    ]
    for i, (fn, inp, out) in enumerate(rows):
        yy = 2.38 + i * 0.74
        rect(s, M + 0.24, yy + 0.02, 0.26, 0.26, fill=BRAND, radius=0.07, shadow=False)
        text(s, M + 0.24, yy + 0.02, 0.26, 0.26, str(i + 1), 7.5, WHITE, True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=MONO)
        text(s, M + 0.64, yy - 0.02, 3.0, 0.24, fn, 10.5, BRAND_D, True, font=MONO)
        text(s, M + 0.64, yy + 0.24, 2.6, 0.2, inp, 8.2, MUTED)
        text(s, M + 3.30, yy + 0.24, 0.34, 0.2, '→', 8.5, FAINT)
        text(s, M + 3.64, yy + 0.24, 2.5, 0.2, out, 8.2, MUTED)
        if i < len(rows) - 1:
            rect(s, M + 0.24, yy + 0.64, 5.95, 0.006, fill=LINE, shape=MSO_SHAPE.RECTANGLE, shadow=False)

    # 置信度卡
    card(s, 7.44, 1.92, 5.28, 2.02)
    text(s, 7.68, 2.06, 4.6, 0.24, '置信度也是算出来的', 11, INK, True)
    # 刻度条
    gx, gy, gw = 7.68, 2.56, 4.80
    rect(s, gx, gy, gw, 0.16, fill='FEF0F0', radius=0.08, shadow=False)
    rect(s, gx, gy, gw * 0.519, 0.16, fill='FBD5D5', radius=0.08, shadow=False)
    rect(s, gx + gw * 0.519, gy, gw * 0.53, 0.16, fill=SOFT_T, radius=0.08, shadow=False)
    # 94% 指针
    tx = gx + gw * 0.94
    rect(s, tx - 0.012, gy - 0.08, 0.024, 0.32, fill=BRAND_D, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, tx - 0.36, gy - 0.34, 0.72, 0.22, '94%', 9.5, BRAND_D, True, align=PP_ALIGN.CENTER)
    text(s, gx, gy + 0.24, 1.7, 0.2, '45 低可信', 7.6, CORAL)
    text(s, gx + gw * 0.519 - 0.30, gy + 0.24, 0.9, 0.2, '72', 7.6, MUTED)
    text(s, gx + gw - 0.6, gy + 0.24, 0.6, 0.2, '97', 7.6, TEAL, align=PP_ALIGN.RIGHT)
    text(s, 7.68, 3.10, 4.7, 0.62,
         '低于 72% 不直接执行：弹层标「待人工核对」，\n由用户补齐字段后再确认。', 8.8, MUTED, line=1.45)

    # 公式卡
    card(s, 7.44, 4.10, 5.28, 2.24, fill=DARK_CARD, line=None, shadow=False)
    text(s, 7.68, 4.24, 4.7, 0.22, 'confidence =', 8.6, 'A8B0FF', font=MONO)
    text(s, 7.68, 4.50, 4.8, 0.84,
         '0.56\n+ min(已填字段, 4) × 0.075\n+ 关键词命中 0.04 / 0.08\n− 缺失字段 × 0.06',
         8.4, 'D8DCF0', font=MONO, line=1.38)
    rect(s, 7.68, 5.46, 4.8, 0.008, fill='2E3160', shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, 7.68, 5.56, 4.8, 0.22, '结果夹在 0.45–0.97，永不给“绝对正确”', 7.8, '8F96C8')
    text(s, 7.68, 5.86, 4.8, 0.22, '同一句话改一个数字，置信度会跟着变。', 7.8, '6F7690')

    note(s, '公式与阈值均可在 src/utils/aiEngine.js、AiParseDialog.vue 中逐行核对。')
    fit_note(s, '规则引擎不是黑箱。五个函数各管一段：识别场景、抽字段、推荐教室、算失物相似度、生成文案。置信度也是算出来的：基础零点五六，每填一个字段加零点零七五，缺字段扣零点零六。评委可以当场改一句话，看字段怎么变。')
    footer(s, 11)
    return s


# ================================================================ 12 iteration
def s12():
    s = slide_new()
    head(s, '12 · ITERATION',
         '两轮迭代：68% → 84% → 91%',
         '同一批演示任务集，逐轮修掉误判与漏抽；指标、问题、改动都留在 AI 使用记录页。')

    stats = [('91', '%', '意图解析准确率', '+23pt', BRAND_D),
             ('2.3', 's', '平均响应', '−1.5s', TEAL),
             ('93', '%', '用户满意度', '第 2 轮样本', AMBER)]
    for i, (v, u, lb, sub, c) in enumerate(stats):
        x = M + i * 1.82
        card(s, x, 1.92, 1.72, 1.06)
        rich(s, x + 0.16, 1.99, 1.44, 0.36, [[(v, {'size': 21, 'color': c, 'bold': True}),
                                              (' ' + u, {'size': 9, 'color': MUTED, 'bold': True})]], line=1.0)
        text(s, x + 0.16, 2.44, 1.44, 0.2, lb, 7.8, INK, True)
        text(s, x + 0.16, 2.64, 1.44, 0.2, sub, 7.2, FAINT)

    table(s, M, 3.14, 5.90,
          ['轮次', '日期', '准确率', '耗时', '满意度'],
          [['基线', '11-05', '68%', '3.8s', '72%'],
           ['第一轮', '11-06', '84%', '2.6s', '86%'],
           ['第二轮', '11-08', '91%', '2.3s', '93%']],
          widths=[1.25, 1.10, 1.20, 1.15, 1.20], row_h=0.40, header_h=0.36, size=9.6, head_size=8.6,
          aligns=[PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT, PP_ALIGN.RIGHT])

    card(s, M, 5.06, 5.90, 0.86, fill=SOFT, line=None, shadow=False)
    text(s, M + 0.22, 5.16, 5.5, 0.66,
         '改动集中在解析与解释：认对场景、抽全字段、讲清理由；\n不是换模型，是改规则。', 8.8, BRAND_D, True, line=1.45)

    line_chart(s, 6.52, 1.92, 6.20, 3.12, ['初版', '第 1 轮', '第 2 轮'], [68, 84, 91], maxv=100, minv=50)

    changes = [
        ('关键词加权', '修掉“拼”字误判拼单'),
        ('时间兜底', '上午 / 下午 / 晚上 补全'),
        ('理由三段式', '事实 + 距离 + 好评'),
        ('低置信度', '强制人工确认，不直接执行'),
    ]
    for i, (k, v) in enumerate(changes):
        x = 6.62 + (i % 2) * 3.05
        yy = 5.12 + (i // 2) * 0.62
        rect(s, x, yy + 0.05, 0.08, 0.08, fill=TEAL, shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, x + 0.16, yy - 0.01, 2.8, 0.2, k, 8.8, INK, True)
        text(s, x + 0.16, yy + 0.20, 2.8, 0.2, v, 8, MUTED)

    note(s, '以上为演示内置模拟数据，样本为方案设定的演示任务集，非线上真实用户实测。')
    fit_note(s, '两轮迭代，准确率从六十八到八十四再到九十一，耗时从三点八秒降到二点三秒。改的不是模型，是规则：关键词加权、时间兜底、推荐理由改成三段式、低置信度强制确认。每一轮的指标、问题和改动都留在 AI 使用记录页，可以逐条查。')
    footer(s, 12)
    return s


# ================================================================ 13 design system
def s13():
    s = slide_new()
    head(s, '13 · DESIGN SYSTEM',
         '一套设计系统，撑起 15 个页面',
         '品牌色、组件与响应式规则先定，再并行开发场景页，最后仍然像同一个产品。')

    colors = [('电光紫', '#6C63FF', BRAND), ('青绿', '#12B3A6', TEAL), ('琥珀', '#F5A623', AMBER),
              ('珊瑚', '#FF6B6B', CORAL), ('墨色', '#151830', INK)]
    for i, (name, hexv, c) in enumerate(colors):
        x = M + i * 1.29
        rect(s, x, 1.94, 1.10, 0.58, fill=c, radius=0.09)
        text(s, x, 2.60, 1.12, 0.2, name, 8.6, INK, True)
        text(s, x, 2.80, 1.12, 0.2, hexv, 7.6, FAINT, font=MONO)

    text(s, M, 3.14, 3.0, 0.22, '15 个共享组件', 9.6, INK, True)
    comps = ['PageHeader', 'SectionCard', 'StatTile', 'StatusPill', 'ProgressRing',
             'CountdownText', 'AvatarStack', 'AiBadge', 'AiThinking', 'AiParseDialog',
             'SceneTile', 'SceneIcon', 'EmptyState', 'AppLogo', 'AppLayout']
    for i, c in enumerate(comps):
        col, row = i % 3, i // 3
        x = M + col * 1.72
        yy = 3.42 + row * 0.40
        rect(s, x, yy, 1.62, 0.32, fill=WHITE, line=LINE, radius=0.16)
        text(s, x, yy, 1.62, 0.32, c, 7.4, MUTED, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=MONO)

    text(s, M, 5.62, 5.0, 0.2, '18px 圆角 · 8pt 间距 · CSS 变量统一主题', 8.2, MUTED)
    text(s, M, 5.86, 1.2, 0.2, '三档断点', 8.6, INK, True)
    for i, (lb, c) in enumerate([('≥1180 双栏', BRAND), ('900 收窄', TEAL), ('≤640 单列', AMBER)]):
        x = M + i * 1.58
        rect(s, x, 6.10, 1.46, 0.30, fill=WHITE, line=LINE, radius=0.15)
        text(s, x, 6.10, 1.46, 0.30, lb, 7.6, c, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

    # 手机截图
    phones = [('11-mobile-home.jpg', '首页', '一句话入口 + KPI'),
              ('12-mobile-classroom.jpg', '教室', '筛选 → 候选 → 申请'),
              ('13-mobile-groupbuy.jpg', '拼单', '进度环 + 接龙')]
    for i, (fn, name, sub) in enumerate(phones):
        x = 6.42 + i * 2.18
        picture(s, os.path.join(SHOTS, fn), x, 1.94, w=1.86, pad=0.045, radius=0.16)
        text(s, x, 6.10, 1.86, 0.2, name + ' · ' + sub, 7.4, FAINT, align=PP_ALIGN.CENTER)

    note(s, '移动端截图为 390 宽演示环境；断点写在 src/styles/utilities.css，均为 max-width。')
    fit_note(s, '设计系统是为了让十五个页面像同一个产品。五个品牌色、十八像素圆角、十五个共享组件、三档断点，先定规则再并行开发。右边三张是真实移动端截图，三百九十宽，底部五个 tab 加一个 AI 悬浮球，核心操作不超过三步。')
    footer(s, 13)
    return s


# ================================================================ 14 engineering
def s14():
    s = slide_new()
    head(s, '14 · ENGINEERING',
         '工程质量：能验证的，才写进 PPT',
         '纯前端交付，不依赖后端；构建、路由、巡检、启动四件事都能当场复现。')

    stats = [('16', '条', '命名路由'), ('15', '个', '页面 · 15 个共享组件'),
             ('0', 'error', '生产构建'), ('0', '异常', '14 路由巡检')]
    for i, (v, u, lb) in enumerate(stats):
        x = M + i * 3.06
        card(s, x, 1.90, 2.86, 0.96)
        rich(s, x + 0.20, 1.98, 2.5, 0.38, [[(v, {'size': 22, 'color': BRAND_D, 'bold': True}),
                                             (' ' + u, {'size': 9.5, 'color': MUTED, 'bold': True})]], line=1.0)
        text(s, x + 0.20, 2.50, 2.5, 0.2, lb, 8.2, MUTED)

    checks = [
        '16 条命名路由，含 /login 与 404 兜底',
        '15 个页面按路由懒加载，单页 chunk 5–13KB（gzip）',
        'vendor 分包：首屏 index 30KB，vendor-vue 43KB',
        '14 条路由 × 1440 / 390 巡检，0 异常',
        'localStorage 持久化，状态刷新不丢',
    ]
    for i, c in enumerate(checks):
        yy = 3.12 + i * 0.46
        rect(s, M, yy + 0.04, 0.20, 0.20, fill=SOFT_T, radius=0.10, shadow=False)
        text(s, M, yy + 0.03, 0.20, 0.20, '✓', 7.5, TEAL, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, M + 0.32, yy, 6.0, 0.24, c, 9.2, INK)

    card(s, M, 5.52, 6.32, 0.88, fill=DARK_CARD, line=None, shadow=False)
    text(s, M + 0.22, 5.62, 2.4, 0.2, '一键启动 / 停止', 8.4, 'A8B0FF', True)
    text(s, M + 0.22, 5.86, 5.9, 0.4, '双击 启动校园智能调度平台.bat → http://localhost:5173/  ·  node_modules 已就绪', 7.8, 'AEB5CC', font=MONO)

    # chunk 图
    cats = ['教室', '失物', '拼单', '论坛', '帖子', '记录', '管理']
    vals = [13, 6, 7, 7, 5, 8, 7]
    bar_chart(s, 7.26, 3.02, 5.42, 2.52, cats, vals, colors=[BRAND] * 7, maxv=16, unit=4, size=8)
    text(s, M + 6.68, 5.62, 5.4, 0.2, '页面 chunk 体积（gzip, KB）· 按路由拆包', 8, FAINT)
    text(s, M + 6.68, 5.86, 5.4, 0.2, '构建产物在 dist/，无需安装依赖即可用预览服务打开。', 8, FAINT)

    note(s, 'gzip 体积取自本机最近一次生产构建（dist/assets），巡检结果为演示环境自检。')
    fit_note(s, '工程质量这块只说能验证的：十六条路由、十五个页面、生产构建零错误；首屏 index 压缩后三十 K，页面按路由拆包；十四条路由在一四四零和三九零两个宽度巡检，零异常。双击 bat 就能起，评委可以自己点。')
    footer(s, 14)
    return s


# ================================================================ 15 demo accounts
def s15():
    s = slide_new()
    head(s, '15 · DEMO ACCOUNTS',
         '四个演示身份，一条权限链',
         '学号 + 姓名即可进入，不需要密码；五个身份分别覆盖发起、审核、论坛运营与高级系统控制。')

    table(s, M, 1.94, 7.55,
          ['身份', '学号', '姓名', '专业 / 部门', '能体验什么'],
          [['学生', '2024010123', '林小满', 'AI+人工智能', '四个场景的发起与参与'],
           ['班委', '2023020456', '陈子昂', '电子竞技', '教室申请与班级事务视角'],
           ['版主', '2022050789', '苏念', 'AI+影视', '论坛发帖、回复与内容运营'],
           ['管理员', '2021000001', '周老师', '学生工作处', '内容管理、申请审核']],
          widths=[0.95, 1.55, 0.95, 1.70, 2.40], row_h=0.50, header_h=0.38,
          size=9.2, head_size=8.4,
          aligns=[PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.LEFT, PP_ALIGN.LEFT])

    # 隐私卡
    card(s, M, 4.62, 7.55, 1.06, fill=LIGHT_W, line=None, shadow=False)
    text(s, M + 0.22, 4.72, 3.0, 0.2, '隐私与数据边界', 8.8, INK, True)
    text(s, M + 0.22, 4.96, 7.1, 0.6,
         '公开页学号默认脱敏为 2024****23；联系人只留姓（林**）；\n不采集密码与手机号；四个身份与全部业务数据均为虚构。',
         8.4, MUTED, line=1.45)

    text(s, M, 5.86, 7.55, 0.44,
         '登录只校验“学号 + 姓名”，不连接学校统一身份认证——这是演示设定，不是已接入。', 8.2, FAINT, line=1.4)

    # 登录页裁切（右侧演示账号面板）
    cropped_picture(s, os.path.join(ASSETS, 'login.png'), 9.42, 1.96, 2.98,
                    (0.508, 0.150, 0.150, 0.180), pad=0.045, radius=0.09)

    text(s, 9.10, 5.74, 3.5, 0.22, '登录页右侧：四个演示身份，一键进入', 8.2, FAINT)
    text(s, 9.10, 5.98, 3.5, 0.44, '每个身份都标了专业，\n方便评委判断“这是给谁用的”。', 8.2, MUTED, line=1.4)

    note(s, '账号与专业信息来自 src/mock/seed.js 的演示身份设定，不对应真实学生。')
    fit_note(s, '四个演示身份对应四种权限：学生发起，班委申请和审核，版主做内容运营，管理员看全局。登录只要学号和姓名，不采集密码和手机号；公开页面学号默认脱敏成二零二四星号二三，联系人只留姓。所有数据都是虚构的。')
    footer(s, 15)
    return s


# ================================================================ 16 boundary
def s16():
    s = slide_new()
    head(s, '16 · BOUNDARY & ROADMAP',
         '边界与路线：今天能演示，明天才上线',
         '先把完整体验跑通，再按“真实模型 → 真实数据 → 真实用户”三步升级。')

    cols = [
        ('现在', '现在就能演示', BRAND, SOFT,
         ['纯前端离线可跑，无后端依赖', '本地规则引擎驱动全部 AI 能力', '42 处场所 + 15 个页面 + 4 个场景', '双击 bat 启动，评委可自己点']),
        ('下一步', '接真实模型与数据', TEAL, SOFT_T,
         ['FastAPI + SQLite 替换 localStorage', 'GLM-4-Flash 主模型 / Qwen 备用', '登录鉴权、角色权限与服务端校验', 'AI 调用日志、超时与重试']),
        ('再下一步', '小范围试点', AMBER, SOFT_A,
         ['30–50 名真实学生，2–3 周', '建评测集，统计真实采纳率', '并发、数据隔离与隐私合规', '对接教务 / 教室 / 通知系统']),
    ]
    for i, (tag, name, c, soft, items) in enumerate(cols):
        x = M + i * 4.07
        card(s, x, 1.94, 3.86, 3.22)
        rect(s, x + 0.26, 2.14, 0.72, 0.28, fill=soft, radius=0.14, shadow=False)
        text(s, x + 0.26, 2.14, 0.72, 0.28, tag, 8, c, True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 0.26, 2.56, 3.3, 0.26, name, 14, INK, True)
        yy = 2.98
        for it in items:
            rect(s, x + 0.28, yy + 0.075, 0.075, 0.075, fill=c, shape=MSO_SHAPE.RECTANGLE, shadow=False)
            text(s, x + 0.44, yy, 3.12, 0.4, it, 8.8, MUTED, line=1.3)
            yy += 0.48

    card(s, M, 5.36, CW, 1.02, fill=SOFT_A, line=None, shadow=False)
    text(s, M + 0.28, 5.48, 11.4, 0.32,
         '我们不把“能演示”说成“已上线”，也不把演示数据说成实测数据。', 14, '9A6200', True)
    text(s, M + 0.28, 5.86, 11.4, 0.3,
         '当前版本定位：可完整走通的竞赛演示版；模型、数据库、鉴权与真实用户规模都还在路线图上。', 8.8, '7A5510')

    note(s, '路线图为方案规划，不是承诺交付时间；当前仓库只包含“现在”一列的能力。')
    fit_note(s, '边界要讲清楚。现在能演示的是纯前端、本地引擎、四十二处场所和十五个页面；下一步接真模型和数据库，补鉴权和日志；再下一步才是真实用户试点。我们不把“能演示”说成“已上线”，也不把演示数据说成实测数据。')
    footer(s, 16)
    return s


# ================================================================ 17 demo script
def s17():
    s = slide_new()
    head(s, '17 · LIVE DEMO',
         '3 分钟怎么演：六步，一步一个可见结果',
         '按主线走，不解释实现；每一步都在屏幕上留下一个可验证的结果。')

    steps = [
        ('0:00', '登录', '选「林小满 · AI+人工智能」一键进入', '工作台出现今日 KPI 与四个场景'),
        ('0:20', '一句话', '输入“周四下午借 40 人、带投影的教室开班会”', '弹层回显场景、94% 置信度、可改字段'),
        ('1:00', '教室', '确认后点「查看 AI 推荐」', '42 处 → 3 个候选，理由逐条可见'),
        ('1:45', '失物', '切到失物招领，看右侧双向匹配', '89% 线索：类别 + 颜色 + 地点 + 时间'),
        ('2:20', '拼单', '打开校门口奶茶，接龙一份', '进度从 6/10 变 7/10，还差 3 份'),
        ('2:50', '收口', '打开消息中心，读 4 条未读', 'AI 线索 / 教室通过 / 拼单提醒 / 论坛回复'),
    ]
    for i, (t, name, act, res) in enumerate(steps):
        yy = 1.92 + i * 0.71
        card(s, M, yy, 8.18, 0.64)
        rect(s, M + 0.10, yy + 0.14, 0.62, 0.36, fill=SOFT, radius=0.18, shadow=False)
        text(s, M + 0.10, yy + 0.14, 0.62, 0.36, t, 7.6, BRAND_D, True, align=PP_ALIGN.CENTER,
             anchor=MSO_ANCHOR.MIDDLE, font=MONO)
        text(s, M + 0.84, yy + 0.18, 0.86, 0.28, name, 9.8, INK, True)
        text(s, M + 1.70, yy + 0.09, 3.20, 0.48, act, 8.2, MUTED, line=1.3)
        text(s, M + 4.96, yy + 0.09, 3.10, 0.48, res, 8.4, TEAL, line=1.3)

    # 故障预案
    card(s, 9.02, 1.92, 3.70, 3.52, fill=DARK_CARD, line=None, shadow=False)
    text(s, 9.26, 2.08, 3.2, 0.24, '现场故障预案', 10.5, WHITE, True)
    text(s, 9.26, 2.36, 3.2, 0.2, '一分钟内恢复演示', 7.8, '8F96C8')
    plan = [
        ('端口被占', '双击「停止校园智能调度平台.bat」再启动'),
        ('数据被点乱', '管理员 → 重置演示数据'),
        ('构建失败', '直接用已构建的 dist/ 预览'),
        ('完全断网', '纯前端仍可跑，AI 是本地引擎'),
    ]
    yy = 2.66
    for k, v in plan:
        text(s, 9.26, yy, 3.2, 0.2, k, 8.6, 'A8B0FF', True)
        text(s, 9.26, yy + 0.20, 3.24, 0.36, v, 7.8, 'AEB5CC', line=1.3)
        yy += 0.68

    card(s, 9.02, 5.62, 3.70, 0.78, fill=WHITE)
    text(s, 9.22, 5.70, 3.3, 0.2, '全程 3:00 · 可随时打断', 9.6, INK, True)
    text(s, 9.22, 5.94, 3.3, 0.3, '每一步都留一个可验证结果', 7.8, MUTED)

    note(s, '演示脚本按当前种子数据编写；若现场数据被修改，以管理员重置后的状态为准。')
    fit_note(s, '现场演示按这六步走，三分钟。先登录，再一句话，然后教室推荐、失物匹配、拼单接龙，最后用消息中心收口。每一步都要求屏幕上出现一个可见结果，不解释实现。万一现场出错，右边四个预案能在一分钟内恢复。')
    footer(s, 17)
    return s


# ================================================================ 18 closing
def s18():
    s = prs.slides.add_slide(BLANK)
    bg(s, DARK)
    for (x, y, d, c) in [(-2.0, -1.8, 6.0, '1B1E45'), (10.2, 3.4, 6.4, '10322F')]:
        o = rect(s, x, y, d, d, fill=c, shape=MSO_SHAPE.OVAL, shadow=False)
        o.line.fill.background()

    text(s, 1.02, 0.96, 6.0, 0.24, 'THANKS FOR LISTENING', 9.5, '8F96C8', True, spc=1.6)
    text(s, 1.02, 1.36, 7.0, 1.75, '把复杂留给系统，\n把简单留给同学。', 38, WHITE, True, line=1.2)

    text(s, 1.04, 3.42, 6.3, 0.3, '校园智能调度平台 · 河南新华电脑学院 东校区', 10.5, 'AEB5CC')

    facts = [('42', '处教学场所'), ('4', '个高频场景'), ('15', '个页面')]
    for i, (v, lb) in enumerate(facts):
        x = 1.04 + i * 1.86
        text(s, x, 4.12, 1.7, 0.44, v, 24, WHITE, True, line=1.0)
        text(s, x, 4.60, 1.7, 0.2, lb, 8.4, '8F96C8')

    text(s, 1.04, 5.42, 6.2, 0.24, '数据说明', 8.4, '8F96C8', True)
    text(s, 1.04, 5.66, 6.1, 0.86,
         '页面中的场所、账号、匹配度与迭代指标均为演示内置数据；\n'
         'AI 由本地规则引擎模拟，未调用真实大模型；不含线上实测数据。',
         8.2, '6F7690', line=1.5)

    # 现场体验卡
    card(s, 8.36, 1.42, 4.04, 3.86, fill=DARK_CARD, line='2E3160', radius=0.12, shadow=False)
    text(s, 8.62, 1.62, 3.5, 0.24, '现场体验', 11, WHITE, True)
    text(s, 8.62, 1.90, 3.5, 0.2, '三个动作，三分钟', 7.8, '8F96C8')
    lines = [
        ('01', '双击「启动校园智能调度平台.bat」'),
        ('02', '浏览器打开 localhost:5173'),
        ('03', '选一个演示身份，说一句话'),
    ]
    yy = 2.30
    for no, t in lines:
        text(s, 8.62, yy, 0.34, 0.2, no, 8, 'A8B0FF', True, font=MONO)
        text(s, 9.00, yy - 0.02, 3.16, 0.44, t, 8.8, 'D8DCF0', line=1.3)
        yy += 0.62
    rect(s, 8.62, 4.34, 3.5, 0.008, fill='2E3160', shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, 8.62, 4.48, 3.5, 0.52, '停止：双击「停止校园智能调度平台.bat」\n无需后端与密钥', 7.6, '8F96C8', line=1.45)

    text(s, 8.38, 5.72, 4.0, 0.2, '谢谢，欢迎提问。', 10, WHITE, True, align=PP_ALIGN.RIGHT)

    fit_note(s, '最后一句话：把复杂留给系统，把简单留给同学。四十二处场所是真的，四个场景是真的，两轮迭代的过程也真的发生过；指标是在演示任务集上测的。代码和演示都在仓库里，欢迎会后自己跑一遍。谢谢大家。')
    footer(s, 18, dark=True)
    return s


def estimate_notes_len(s):
    return len([c for c in s if not c.isspace()])


def main():
    s01(); s02(); s03(); s04(); s05(); s06(); s07(); s08(); s09()
    s10(); s11(); s12(); s13(); s14(); s15(); s16(); s17(); s18()

    prs.core_properties.title = '校园智能调度平台 · 项目讲解（完整版）'
    prs.core_properties.author = '校园智能调度平台项目组'
    prs.core_properties.subject = '河南新华电脑学院 AI 应用创意大赛'

    assert len(prs.slides) == TOTAL, len(prs.slides)
    for i, sl in enumerate(prs.slides, 1):
        n = sl.notes_slide.notes_text_frame.text
        L = estimate_notes_len(n)
        flag = '' if 60 <= L <= 120 else '  <<< OUT OF RANGE'
        print('%02d slides=%d notes=%3d%s' % (i, len(sl.shapes), L, flag))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    prs.save(OUT)
    print('saved:', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
