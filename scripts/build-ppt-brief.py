#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校园智能调度平台 —— 创意说明（5 分钟路演版，10 页 / 16:9）

按大赛「创意说明」五问组织，而不是技术架构堆料：
  Q1 想解决什么问题 / 表达什么      Q2 创意从哪来
  Q3 给谁看、给谁用                 Q4 AI 做了什么、人做了什么
  Q5 如果还有一周怎么改
另加：一句话怎么用（四场景一页概览）、真实产品证据、AI 使用记录与两轮迭代、
      现场 1 分钟演示路径。

设计语言沿用 scripts/build-ppt-full.py（电光紫 / 青绿 / 浅灰底 / 白色圆角卡）。
所有数字来自仓库内文件或产品内置演示数据；页面与备注均标注数据性质。
"""
import os

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
OUT = os.path.join(ROOT, 'docs', '校园智能调度平台-创意说明-5分钟.pptx')

# ---------------------------------------------------------------- design tokens
INK = '151830'
MUTED = '5F677C'
FAINT = '9AA2B6'
BRAND = '6C63FF'
BRAND_D = '4B42C9'
TEAL = '12B3A6'
TEAL_D = '0B8B81'
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
TOTAL = 10
TOTAL_SEC = 300

# (start_sec, duration_sec)
TIMING = [(0, 10), (10, 35), (45, 20), (65, 20), (85, 50),
          (135, 25), (160, 25), (185, 30), (215, 25), (240, 60)]

prs = Presentation()
prs.slide_width = Inches(SW)
prs.slide_height = Inches(SH)
BLANK = prs.slide_layouts[6]
PAGE = [0]


def rgb(h):
    return RGBColor.from_string(h)


def _ea(rPr, face=FONT):
    for tag in ('a:ea', 'a:cs'):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set('typeface', face)


def set_font(run, size=10, color=MUTED, bold=False, font=FONT, spc=None, italic=False):
    f = run.font
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
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
         margins=(0, 0, 0, 0), spc=None, wrap=True, italic=False):
    box, tf = _frame(slide, x, y, w, h, anchor, margins, wrap)
    lines = str(content).split('\n')
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        r = p.add_run()
        r.text = ln
        set_font(r, size, color, bold, font, spc, italic)
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
                     ov.get('bold', False), ov.get('font', FONT), ov.get('spc'),
                     ov.get('italic', False))
    return box


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


def rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.1,
         shape=MSO_SHAPE.ROUNDED_RECTANGLE, lw=0.75, shadow=False):
    sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sp.adjustments[0] = max(0.0, min(0.5, radius / max(0.01, min(w, h))))
        except Exception:
            pass
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


def chip(slide, x, y, w, h, label, fg, fill=WHITE, size=9, bold=True, line=None, radius=0.12):
    rect(slide, x, y, w, h, fill=fill, line=line, radius=radius)
    text(slide, x, y, w, h, label, size, fg, bold, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def dot(slide, x, y, d, color):
    rect(slide, x, y, d, d, fill=color, shape=MSO_SHAPE.OVAL, shadow=False)


def pill(slide, x, y, w, h, label, fg, fill, size=9, bold=True):
    rect(slide, x, y, w, h, fill=fill, line=None, radius=h / 2)
    text(slide, x, y, w, h, label, size, fg, bold, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


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


def cropped_picture(slide, path, x, y, w, crop, pad=0.05, radius=0.08, frame=True):
    """按比例裁切图片后放入指定宽度；外框与可见区域等比例，避免拉伸。"""
    l, r, t, b = crop
    iw, ih = Image.open(path).size
    vis_w, vis_h = iw * (1 - l - r), ih * (1 - t - b)
    h = w * vis_h / vis_w
    if frame:
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


# ---------------------------------------------------------------- page chrome
def time_chip(s, idx):
    start, dur = TIMING[idx - 1]
    end = start + dur

    def fmt(t):
        return '%d:%02d' % (t // 60, t % 60)

    text(s, SW - M - 2.16, 0.40, 1.14, 0.22,
         '%s – %s' % (fmt(start), fmt(end)), 8.5, FAINT, align=PP_ALIGN.RIGHT)
    pill(s, SW - M - 0.92, 0.35, 0.92, 0.32, '%d 秒' % dur, BRAND_D, SOFT, 9.5)


def progress(s, idx):
    x = M
    y = 7.34
    for i, (start, dur) in enumerate(TIMING, start=1):
        w = CW * dur / TOTAL_SEC
        fill = BRAND if i == idx else ('C9C6FF' if i < idx else 'E2E5EF')
        h = 0.055 if i == idx else 0.032
        rect(s, x, y + (0.055 - h) / 2, max(0.02, w - 0.045), h,
             fill=fill, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.03, shadow=False)
        x += w


def footer(s, idx, dark=False):
    line = '2A2D52' if dark else LINE
    fg = '6F7690' if dark else FAINT
    rect(s, M, 7.00, CW, 0.008, fill=line, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, M, 7.09, 7.6, 0.2,
         '校园智能调度平台 · 创意说明（5 分钟）', 8.5, fg)
    text(s, SW - M - 1.4, 7.09, 1.4, 0.2, '%02d / %d' % (idx, TOTAL), 8.5, fg,
         align=PP_ALIGN.RIGHT)


def head(s, idx, kick, t, d=None, dw=11.2):
    text(s, M, 0.40, 0.16, 0.24, '', 10)
    rect(s, M, 0.475, 0.105, 0.105, fill=BRAND, shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, M + 0.21, 0.42, 7.4, 0.24, kick, 10.5, BRAND, True, spc=0.8)
    text(s, M, 0.66, 10.9, 0.62, t, 30, INK, True, line=1.08)
    if d:
        text(s, M, 1.46, dw, 0.46, d, 13, MUTED, line=1.28)
    time_chip(s, idx)
    footer(s, idx)
    progress(s, idx)
    PAGE[0] = idx


# ---------------------------------------------------------------- charts
def _clear_chart_area(chart):
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


def line_chart(slide, x, y, w, h, cats, vals, maxv=100, minv=50, unit=10):
    cd = CategoryChartData()
    cd.categories = cats
    cd.add_series('准确率', vals)
    gf = slide.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(x), Inches(y),
                                Inches(w), Inches(h), cd)
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
    va.major_unit = unit
    va.tick_labels.font.size = Pt(8)
    va.tick_labels.font.color.rgb = rgb(FAINT)
    va.major_tick_mark = XL_TICK_MARK.NONE
    return ch


# ================================================================ 01 cover
def s01():
    s = prs.slides.add_slide(BLANK)
    bg(s, DARK)
    for (x, y, d, c) in [(6.4, -2.3, 7.4, '1B1E45'), (8.9, 4.4, 6.2, '10322F'),
                         (-1.8, 4.6, 4.6, '141634')]:
        o = rect(s, x, y, d, d, fill=c, shape=MSO_SHAPE.OVAL, shadow=False)
        o.line.fill.background()

    logo = rect(s, 0.90, 0.78, 0.86, 0.86, fill=TEAL, radius=0.2)
    logo.fill.gradient()
    logo.fill.gradient_angle = 45
    st = logo.fill.gradient_stops
    st[0].color.rgb = rgb(BRAND)
    st[0].position = 0.0
    st[1].color.rgb = rgb(TEAL)
    st[1].position = 1.0
    logo.line.fill.background()
    text(s, 0.90, 0.78, 0.86, 0.86, '搭', 27, WHITE, True,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 1.96, 0.84, 2.4, 0.32, '校园智能调度平台', 19, WHITE, True)
    text(s, 1.97, 1.16, 2.6, 0.24, 'AI 智能调度', 10.5, 'AEB5CC', spc=0.6)

    # 右上：赛事标签
    rect(s, SW - M - 2.42, 0.86, 2.42, 0.36, fill='1E2145', line='33376A',
         radius=0.18, shadow=False)
    text(s, SW - M - 2.42, 0.86, 2.42, 0.36, '创意说明 · 5 分钟路演', 9.5, 'C9CEE3',
         True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

    text(s, SW - M - 2.42, 1.30, 2.42, 0.22, '本页 0:00 – 0:10（10 秒）', 8.2, '8F96B2',
         align=PP_ALIGN.RIGHT)

    text(s, 0.96, 1.92, 7.6, 0.26, '河南新华电脑学院 · AI 应用创意大赛 · V1.0',
         10, '9DA4C0', True, spc=0.4)

    text(s, 0.92, 2.26, 7.4, 2.40, '把一句话，\n变成一次\n可执行的调度。',
         39, WHITE, True, line=1.10)
    text(s, 0.96, 4.46, 6.55, 0.66,
         '自然语言输入 → 意图解析 → 资源匹配 → 结果生成 → 自动通知。\n不是又一个校园 App，是把「问一圈」压缩成「说一句」。',
         12.5, 'C3C8DC', line=1.45)

    items = [('42', '处真实教学场所', 1.50), ('4', '类高频校园需求', 1.50),
             ('68→91', '两轮迭代准确率', 2.90)]
    x = 0.96
    for num, lb, w in items:
        text(s, x, 5.28, w, 0.44, num, 20, '9C95FF', True)
        text(s, x, 5.76, w, 0.24, lb, 8.5, '9AA0BC')
        x += w + 0.22

    text(s, 0.96, 6.28, 6.9, 0.22,
         '页面数字均为演示内置数据；真实场所与演示数据的边界见第 7 页。', 8.5, '6F7690')
    text(s, 0.96, 6.52, 6.9, 0.22,
         '纯前端演示版，AI 由本地可解释规则引擎驱动，不调用真实大模型。', 8.5, '6F7690')

    # 右侧：五问索引
    cx, cy, cw, chh = 8.62, 1.92, 3.92, 4.55
    card(s, cx, cy, cw, chh, fill=DARK_CARD, line='2E3160', radius=0.12, shadow=False)
    text(s, cx + 0.34, cy + 0.30, 2.9, 0.22, '这五分钟，只回答五问', 11, WHITE, True)
    dot(s, cx + cw - 0.50, cy + 0.36, 0.07, TEAL)
    text(s, cx + cw - 0.40, cy + 0.31, 0.32, 0.18, '5 min', 7.5, TEAL)

    rows = [('01', '想解决什么问题', '0:10'),
            ('02', '创意从哪来', '0:45'),
            ('03', '给谁看、给谁用', '1:05'),
            ('04', 'AI 做哪段，人做哪段', '1:25'),
            ('05', '如果还有一周', '3:35')]
    for i, (no, name, tm) in enumerate(rows):
        yy = cy + 0.80 + i * 0.56
        text(s, cx + 0.34, yy, 0.36, 0.22, no, 8.5, '8F8BE8', True, font=MONO)
        text(s, cx + 0.76, yy - 0.01, 2.3, 0.24, name, 10.2, WHITE, True)
        text(s, cx + cw - 0.86, yy, 0.52, 0.22, tm, 8.5, '8F96B2', align=PP_ALIGN.RIGHT)

    rect(s, cx + 0.34, cy + 3.72, cw - 0.68, 0.008, fill='2E3160',
         shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, cx + 0.34, cy + 3.86, cw - 0.68, 0.22, '另附：一句话四场景 · 真实证据 · 迭代记录 · 1 分钟演示',
         7.8, '8F96B2', line=1.35)

    fit_note(s, '各位老师好，我是校园智能调度平台。五分钟，我只回答创意说明的五个问题：为什么做、创意从哪来、给谁用、AI 和人各做什么、还有一周怎么改。')
    return s


# ================================================================ 02 Q1 problem
def s02():
    s = slide_new()
    head(s, 2, 'Q1 · 想解决什么问题',
         'Q1 ｜ 不是没有资源，是没有一次说清楚的调度',
         '四类高频需求散在群聊、Excel、公告栏和班委脑子里；信息不对称的成本，最后都落在学生身上。')

    rows = [
        ('教室借用', '群里问 → 等回复 → 跑楼层看门牌 → 再确认', '重复沟通', BRAND),
        ('失物招领', '三个群各发一遍 → 有人回但说不清 → 线下碰', '信息不对称', TEAL),
        ('拼单集市', '群接龙 → 手动数人头 → 到点没人收口', '无人收口', AMBER),
        ('校园论坛', '重复提问 → 老帖没人搜得到 → 沉底', '石沉大海', CORAL),
    ]
    y = 2.05
    for name, chain, cost, c in rows:
        card(s, M, y, 7.24, 0.96, radius=0.12)
        rect(s, M, y + 0.16, 0.055, 0.64, fill=c, radius=0.028, shadow=False)
        text(s, M + 0.26, y + 0.20, 1.32, 0.30, name, 13, INK, True)
        text(s, M + 1.58, y + 0.28, 4.30, 0.42, chain, 9.8, MUTED, line=1.3)
        pill(s, M + 5.94, y + 0.30, 1.04, 0.34, cost, c, WHITE, 8.5)
        y += 1.08

    text(s, M, 6.52, 7.2, 0.34,
         '共同点：四处信息都不可查、不可追踪——群聊会滚走，Excel 在老师电脑里。', 9.2, FAINT)

    # 右侧：我们要表达什么
    cx, cy, cw, chh = 8.12, 2.05, 4.58, 4.42
    card(s, cx, cy, cw, chh, fill=DARK, line='2A2D52', radius=0.12, shadow=False)
    text(s, cx + 0.34, cy + 0.28, 3.4, 0.22, '所以我们想表达的是', 9.2, '9AA0BC', True, spc=0.5)
    text(s, cx + 0.34, cy + 0.62, cw - 0.68, 1.16,
         'AI 不该只是会聊天，\n它该把一句话变成一次安排。', 18, WHITE, True, line=1.36)
    text(s, cx + 0.34, cy + 1.86, cw - 0.68, 0.44,
         '不是校园版聊天机器人，是校园里的调度层。', 9.5, 'AEB5CC', line=1.35)

    tri = [('可执行', '有字段、有候选，点一下就能提交', TEAL),
           ('可追踪', '有状态、有时间线，谁卡住看得见', '8F8BE8'),
           ('可通知', '关键节点自动进消息中心，不用再问', 'FFC46B')]
    for i, (k, d, c) in enumerate(tri):
        yy = cy + 2.42 + i * 0.62
        dot(s, cx + 0.34, yy + 0.05, 0.09, c)
        text(s, cx + 0.56, yy - 0.02, 0.86, 0.22, k, 10, c, True)
        text(s, cx + 1.44, yy - 0.02, cw - 1.80, 0.22, d, 9, 'A9AFC6')

    fit_note(s, '第一个问题，想解决什么。校园不缺资源，缺一次说清楚的调度。借教室要群里问、跑楼层、再确认；失物要在三个群各发一遍；拼单靠接龙数人头；提问常常沉底。信息散在群聊、Excel、公告栏和班委脑子里，四处都不可查。我们想表达的不是校园版聊天机器人，是把一句话变成一次可执行、可追踪、可通知的安排。')
    return s


# ================================================================ 03 Q2 origin
def s03():
    s = slide_new()
    head(s, 3, 'Q2 · 创意从哪来',
         'Q2 ｜ 创意不是想出来的，是被三次摩擦逼出来的',
         '三次「做不下去」，三次换方向；每条弯路都留在仓库里，不是事后编的故事。')

    cards = [
        ('01', '起点', '自己被借教室折磨', BRAND,
         '班委在群里问「周四下午谁有空教室」，靠 Excel 截图和跑楼层。',
         '42 处场所 × 6 个时段，人脑排不过来；信息不是没有，是不可查。',
         '先做「一句话 + 候选 + 理由」，不做通讯录。'),
        ('02', '转折', '社团排班做完，适用面太窄', TEAL,
         '按原方案做了社团排班，功能完整。',
         '排班是少数社团的月度痛点，论坛是全校每天都发生的事。',
         '换场景，但保留同一套「解析 → 匹配 → 生成 → 通知」。'),
        ('03', '逼出来的', '68% 那次基线评测', CORAL,
         '以为瓶颈是「文案写得不够好」，一直在调生成。',
         '68% 的失败几乎都在「没听懂」：场景误判、时段丢失。',
         '把力气从生成移到解析，并强制人工确认；两轮后 91%。'),
    ]
    x = M
    for no, tag, name, c, when, found, change in cards:
        card(s, x, 2.02, 3.83, 3.62, radius=0.12)
        text(s, x + 0.30, 2.20, 0.42, 0.24, no, 9, c, True, font=MONO)
        pill(s, x + 0.74, 2.18, 0.78, 0.26, tag, c, WHITE, 8)
        text(s, x + 0.30, 2.56, 3.24, 0.30, name, 13, INK, True)

        blocks = [('当时以为', when, MUTED), ('后来发现', found, '3C4257'), ('所以改了', change, BRAND_D)]
        yy = 2.98
        for lb, body, col in blocks:
            text(s, x + 0.30, yy, 3.24, 0.20, lb, 8.2, FAINT, True, spc=0.6)
            text(s, x + 0.30, yy + 0.22, 3.22, 0.62, body, 9.2, col, line=1.42)
            yy += 0.90
        x += 4.13

    # 卡片间箭头
    for ax in (M + 3.86, M + 7.99):
        sp = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(ax - 0.02), Inches(3.68),
                                Inches(0.24), Inches(0.20))
        for st in sp._element.findall(qn('p:style')):
            sp._element.remove(st)
        sp.fill.solid()
        sp.fill.fore_color.rgb = rgb('D6D9E6')
        sp.line.fill.background()
        sp.shadow.inherit = False

    card(s, M, 5.86, CW, 0.92, fill=SOFT, line='DCD7FF', radius=0.12, shadow=False)
    text(s, M + 0.30, 6.02, 0.30, 0.24, '“', 20, BRAND, True)
    text(s, M + 0.62, 6.00, 10.9, 0.30,
         '三次都不是「想到了」，是「做不下去」：摩擦力是真的，改动才是真的。', 12, BRAND_D, True)
    text(s, M + 0.62, 6.34, 10.9, 0.24,
         '所以这份说明不讲架构堆料，只讲：问题真不真、人用不用、AI 该做哪一段。', 9.2, MUTED)

    fit_note(s, '第二，创意从哪来。不是灵光一现，是三次做不下去：借教室被 42 处场所折磨；社团排班做完发现适用面太窄，换论坛；68% 基线评测发现瓶颈不在写文案，在没听懂。')
    return s


# ================================================================ 04 Q3 users
def s04():
    s = slide_new()
    head(s, 4, 'Q3 · 给谁看、给谁用',
         'Q3 ｜ 四类人每天用，三类人只看三件事',
         '用的人关心「少跑一趟」，看的人关心「真不真、撑不撑得住」。')

    roles = [
        ('林', '学生 · 林小满', 'AI+人工智能', BRAND,
         '发起：借教室、找失物、拼单、提问', '一句话到结果，不用记流程'),
        ('陈', '班委 · 陈子昂', '电子竞技', TEAL,
         '申请场地 + 盯审核状态', '不再当人肉中转站'),
        ('苏', '版主 · 苏念', 'AI+影视', CORAL,
         '发帖、回帖、标记解决', '标题标签摘要不用手写'),
        ('周', '管理员 · 周老师', '学生工作处', AMBER,
         '审核、看资源、重置演示数据', '一条链能看到底'),
    ]
    pos = [(M, 2.02), (M + 3.75, 2.02), (M, 4.16), (M + 3.75, 4.16)]
    for (ini, who, major, c, duty, gain), (x, y) in zip(roles, pos):
        card(s, x, y, 3.57, 1.98, radius=0.12)
        rect(s, x + 0.26, y + 0.26, 0.52, 0.52, fill=c, radius=0.26, shadow=False)
        text(s, x + 0.26, y + 0.26, 0.52, 0.52, ini, 13, WHITE, True,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 0.92, y + 0.27, 2.36, 0.26, who, 11.2, INK, True)
        text(s, x + 0.92, y + 0.53, 2.36, 0.22, major, 8.4, FAINT)
        text(s, x + 0.26, y + 0.94, 3.06, 0.24, duty, 8.8, MUTED)
        rect(s, x + 0.26, y + 1.24, 3.02, 0.006, fill=LINE,
             shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, x + 0.26, y + 1.38, 3.06, 0.24, '得到：' + gain, 8.8, TEAL_D, True)

    # 右侧：给谁看
    cx, cy, cw, chh = 8.18, 2.02, 4.52, 4.12
    card(s, cx, cy, cw, chh, radius=0.12)
    text(s, cx + 0.30, cy + 0.26, cw - 0.6, 0.24, '给谁看：三类观众', 11, INK, True)
    text(s, cx + 0.30, cy + 0.54, cw - 0.6, 0.22, '他们不点按钮，只判断值不值得信。', 8.6, FAINT)

    items = [('评委', '这是不是真问题、是不是真做过——对应第 3、7、8 页的三组证据。', BRAND),
             ('学校信息中心 / 教务处', '42 处场地对不对得上、审核与通知链成不成立。', TEAL),
             ('后续维护者', '接口是否分层、换模型要不要改页面。', AMBER)]
    yy = cy + 0.92
    for who, what, c in items:
        dot(s, cx + 0.30, yy + 0.07, 0.09, c)
        text(s, cx + 0.48, yy, cw - 0.78, 0.22, who, 9.6, INK, True)
        text(s, cx + 0.48, yy + 0.23, cw - 0.78, 0.52, what, 8.6, MUTED, line=1.38)
        yy += 0.92

    rect(s, cx + 0.30, cy + 3.52, cw - 0.60, 0.006, fill=LINE,
         shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, cx + 0.30, cy + 3.64, cw - 0.60, 0.32,
         '登录页就是角色说明：四个演示身份，专业与职责都写在卡上。', 8.4, FAINT, line=1.35)

    fit_note(s, '第三，给谁用、给谁看。四类人每天打开：学生发起，班委看审核，版主发帖，管理员审资源。给谁看三类：评委看真假，学校信息中心看 42 处场地和审核链，维护者看接口分不分层。')
    return s


# ================================================================ 05 Q4 AI vs human
def s05():
    s = slide_new()
    head(s, 5, 'Q4 · AI 做了什么，人做了什么',
         'Q4 ｜ AI 只做到草稿，最后一下必须人来点',
         '四步交给 AI，三步必须由人完成；置信度低于 72% 时，系统主动要求人工核对。')

    # 左：AI 四件事
    lx, lw = M, 4.18
    text(s, lx, 1.98, lw, 0.24, 'AI 做四件事', 10.5, BRAND, True, spc=0.6)
    text(s, lx + 1.42, 1.99, 2.6, 0.22, '本地规则引擎 / 可换大模型', 8, FAINT)
    ai = [('01', '听懂', 'detectScene + parseRequirement', '一句话 → 场景、字段、置信度'),
          ('02', '算清', 'recommendClassrooms', '硬过滤 → 加权排序 → 逐条理由'),
          ('03', '写出', '文案 / 标题 / 摘要 / 通知', '80 字以内，统一格式，带 AI 标识'),
          ('04', '通知', '关键节点写入消息中心', '通过、满员、匹配、收到回复')]
    yy = 2.30
    for no, name, fn, desc_ in ai:
        card(s, lx, yy, lw, 0.96, radius=0.1)
        text(s, lx + 0.22, yy + 0.20, 0.34, 0.22, no, 8, BRAND, True, font=MONO)
        text(s, lx + 0.60, yy + 0.16, 1.0, 0.26, name, 11.5, INK, True)
        text(s, lx + 1.46, yy + 0.19, 2.48, 0.22, fn, 7.4, FAINT, font=MONO)
        text(s, lx + 0.60, yy + 0.50, lw - 0.82, 0.30, desc_, 8.8, MUTED)
        yy += 1.04

    # 中：人三件事 + 原则
    mx, mw = 4.98, 3.98
    text(s, mx, 1.98, mw, 0.24, '人做三件事', 10.5, TEAL_D, True, spc=0.6)
    human = [('确认', '解析字段全部可改；点「查看推荐」才落库', TEAL),
             ('判断', '置信度 <72% 强制人工核对；管理员审核通过', AMBER),
             ('负责', '发布前可编辑；隐私脱敏；AI 内容带标识', CORAL)]
    yy = 2.30
    for name, desc_, c in human:
        card(s, mx, yy, mw, 0.84, radius=0.1)
        rect(s, mx, yy + 0.14, 0.05, 0.56, fill=c, radius=0.025, shadow=False)
        text(s, mx + 0.20, yy + 0.12, mw - 0.40, 0.26, name, 11, INK, True)
        text(s, mx + 0.20, yy + 0.42, mw - 0.40, 0.36, desc_, 8.4, MUTED, line=1.3)
        yy += 0.92

    card(s, mx, 5.20, mw, 1.16, fill=DARK, line='2A2D52', radius=0.1, shadow=False)
    text(s, mx + 0.26, 5.34, mw - 0.52, 0.30, '一条原则', 8.2, '9AA0BC', True, spc=0.6)
    text(s, mx + 0.26, 5.60, mw - 0.52, 0.66,
         'AI 输出的是草稿，\n签字的人必须是用户。', 13.5, WHITE, True, line=1.35)

    # 右：证据截图
    rx, rw = 9.22, 3.48
    cropped_picture(s, os.path.join(ASSETS, 'ai-dialog.png'), rx, 2.02, rw,
                    (0.284, 0.283, 0.166, 0.168), pad=0.05)
    text(s, rx - 0.02, 5.22, rw + 0.04, 0.22, '真实界面（演示数据）：一句话解析结果', 8.6, INK, True)
    text(s, rx - 0.02, 5.46, rw + 0.04, 0.60,
         '94% 置信度，四个字段仍全部可改；\n低置信度会先要求人工核对。', 8.2, MUTED, line=1.4)

    text(s, M, 6.56, CW, 0.26,
         '分工的边界很清楚：AI 负责「把话听懂、把方案算出来」，人负责「确认、判断、签字」。', 9.2, FAINT)

    fit_note(s, '第四，AI 和人各做什么。AI 做四件：听懂，把一句话变成场景、字段和置信度；算清，硬条件过滤再按距离好评排序，并给出理由；写出，文案、标题、摘要、通知；通知，关键节点自动进消息中心。人做三件：确认，解析字段全部可改，点了才执行；判断，置信度低于 72% 强制人工核对，管理员审核通过；负责，发布前可编辑，隐私脱敏，AI 内容带标识。原则就一句：AI 只做到可提交的草稿，最后一下必须人来点。')
    return s


# ================================================================ 06 four scenes
def s06():
    s = slide_new()
    head(s, 6, '一句话怎么用',
         '一句话怎么用：四个场景，一套动作',
         '说一句 → 看解析 → 改字段 → 拿结果；每个场景都在 3 步内完成，不多一步学习成本。')

    scenes = [
        ('教室借用', BRAND, 'EFEDFF',
         '周四下午想借一间 40 人、带投影的教室开班会',
         ['3 处候选，逐条说明理由', '冲突提示与空闲时段'],
         '改字段 → 一键申请'),
        ('失物招领', TEAL, 'E7F7F4',
         '在 A 栋丢了个蓝色水杯，杯身有贴纸',
         ['双向匹配，给出相似度', '生成规范文案，可编辑'],
         '核对物品 → 站内联系'),
        ('拼单集市', AMBER, 'FEF4E3',
         '校门口奶茶拼单，6.5 一杯，还差 4 杯',
         ['进度、倒计时、还差几份', '满员与截止自动提醒'],
         '接龙一份 / 发起拼单'),
        ('校园论坛', CORAL, 'FDEEEE',
         'A 栋三楼晚自习教室插座多吗？',
         ['标题、正文、标签一次给全', '相似帖推荐 + 回复摘要'],
         '改文案 → 发布'),
    ]
    w = 2.88
    x = M
    for name, c, soft, quote, outs, human in scenes:
        card(s, x, 2.02, w, 4.02, radius=0.12)
        rect(s, x, 2.02, w, 0.10, fill=c, radius=0.05, shadow=False)
        dot(s, x + 0.28, 2.34, 0.12, c)
        text(s, x + 0.48, 2.28, w - 0.7, 0.26, name, 12, INK, True)

        rect(s, x + 0.24, 2.70, w - 0.48, 1.06, fill=soft, line=None, radius=0.08, shadow=False)
        text(s, x + 0.38, 2.70, w - 0.74, 1.06, quote, 9.2, '2B3040', line=1.42,
             anchor=MSO_ANCHOR.MIDDLE)

        text(s, x + 0.24, 3.94, w - 0.48, 0.20, 'AI 给什么', 7.8, FAINT, True, spc=0.5)
        yy = 4.18
        for o in outs:
            dot(s, x + 0.28, yy + 0.07, 0.07, c)
            text(s, x + 0.45, yy, w - 0.72, 0.44, o, 8.8, MUTED, line=1.35)
            yy += 0.46

        rect(s, x + 0.24, 5.16, w - 0.48, 0.008, fill=LINE,
             shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, x + 0.24, 5.28, w - 0.48, 0.20, '人做什么', 7.8, FAINT, True, spc=0.5)
        text(s, x + 0.24, 5.50, w - 0.48, 0.44, human, 9.2, c, True, line=1.3)
        x += w + 0.19

    card(s, M, 6.22, CW, 0.56, fill=WHITE, line=LINE, radius=0.1, shadow=False)
    text(s, M + 0.28, 6.36, 4.9, 0.26, '同一个入口：首页 Hero · 顶栏快捷入口 · 手机悬浮按钮',
         8.8, MUTED)
    text(s, M + 6.1, 6.36, 5.7, 0.26,
         '四个场景共用一套解析与确认弹层；换场景，不换操作方式。', 8.8, BRAND_D, True,
         align=PP_ALIGN.RIGHT)

    fit_note(s, '一句话怎么用。四个场景同一套动作：说一句、看解析、改字段、拿结果。教室给三处候选和理由，失物做双向匹配，拼单管进度和截止，论坛起标题、找相似帖。入口只有一个，首页、顶栏、手机悬浮按钮都能唤起。')
    return s


# ================================================================ 07 evidence
def s07():
    s = slide_new()
    head(s, 7, '真实产品证据',
         '真实证据：42 处场所，按学校清单建',
         '通用校园模板在这里一拍就假——场地、专业和使用方式都必须对得上。')

    # 左：场所构成
    lx, ly, lw, lh = M, 2.02, 5.28, 4.06
    card(s, lx, ly, lw, lh, radius=0.12)
    text(s, lx + 0.30, ly + 0.22, 1.0, 0.62, '42', 32, BRAND_D, True)
    text(s, lx + 1.12, ly + 0.30, 2.4, 0.28, '处教学场所', 13, INK, True)
    text(s, lx + 1.12, ly + 0.58, 3.8, 0.22, '来自学校《10.26 教学场所（东校区）》', 8.2, FAINT)

    bars = [('A 栋教室', 36, BRAND), ('会议室 3F', 1, '8F8BE8'),
            ('报告厅 1F', 1, '8F8BE8'), ('台球教室 1F', 1, AMBER), ('电竞教室 2F', 3, TEAL)]
    yy = ly + 1.02
    for name, val, c in bars:
        text(s, lx + 0.30, yy + 0.02, 1.34, 0.22, name, 8.8, MUTED)
        rect(s, lx + 1.66, yy + 0.05, 2.42, 0.14, fill='EEF0F6', radius=0.07, shadow=False)
        bw = max(0.10, 2.42 * val / 36.0)
        rect(s, lx + 1.66, yy + 0.05, bw, 0.14, fill=c, radius=0.07, shadow=False)
        text(s, lx + 4.16, yy + 0.00, 0.44, 0.22, str(val), 9, INK, True)
        yy += 0.40

    rect(s, lx + 0.30, ly + 3.16, lw - 0.60, 0.008, fill=LINE,
         shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, lx + 0.30, ly + 3.30, lw - 0.60, 0.62,
         'A 栋 36 间教室 + 3F 会议室 + 1F 报告厅；B 栋 1F 台球教室、2F 三间电竞教室。'
         '5 间桌椅数未知，产品标「容量待核」，不猜。', 8.4, MUTED, line=1.42)

    # 右：反模板证据
    rx, rw = 6.12, 6.58
    blocks = [('01', '真实场地清单', TEAL,
               '第一屏不是通用预约页，而是教室与场地借用：A 栋 36 间教室、3F 会议室、1F 报告厅，'
               'B 栋台球教室和三间电竞教室，逐条来自学校场地表。'),
              ('02', '专业以 AI+ 为主', CORAL,
               '演示身份来自 AI+人工智能、AI+影视、AI+电商、电子竞技等方向；产品只做教室、失物、'
               '拼单、论坛四类真实事务，不为通用模板硬加模块。')]
    yy = 2.02
    for no, name, c, body in blocks:
        card(s, rx, yy, rw, 1.90, radius=0.12)
        text(s, rx + 0.28, yy + 0.20, 0.36, 0.22, no, 8, c, True, font=MONO)
        text(s, rx + 0.66, yy + 0.16, rw - 0.94, 0.28, name, 12.5, INK, True)
        text(s, rx + 0.28, yy + 0.60, rw - 0.56, 1.14, body, 9.2, MUTED, line=1.52)
        yy += 2.02

    # 真实 / 演示 边界
    yy = 6.10
    pill(s, rx, yy, 0.72, 0.26, '真实', WHITE, TEAL_D, 8)
    text(s, rx + 0.82, yy + 0.02, 5.0, 0.22,
         '42 处房号 / 容量 / 设备、学校地址电话、专业设置', 8.4, MUTED)
    pill(s, rx, yy + 0.34, 0.72, 0.26, '演示', WHITE, AMBER, 8)
    text(s, rx + 0.82, yy + 0.36, 5.6, 0.22,
         '占用时段、用户与通知、拼单与帖子内容、AI 指标', 8.4, MUTED)

    fit_note(s, '42 处场所来自学校教学场所表：A 栋 36 间教室加会议室、报告厅，B 栋台球和三间电竞教室。真实的是房号、容量、设备与专业方向；时段、用户、通知、拼单和帖子内容、AI 指标是演示数据。')
    return s


# ================================================================ 08 AI record
def s08():
    s = slide_new()
    head(s, 8, 'AI 使用记录 · 两轮迭代',
         'AI 使用记录：68 → 84 → 91，人在补位',
         '工具、提示词、每轮改了什么，都留在产品里的「AI 使用记录」页；指标为演示内置模拟，不是线上实测。')

    # 左：折线
    lx, lw = M, 4.06
    card(s, lx, 2.02, lw, 3.60, radius=0.12)
    text(s, lx + 0.26, 2.18, 2.4, 0.22, '意图解析准确率（%）', 9, INK, True)
    text(s, lx + lw - 1.30, 2.18, 1.06, 0.22, '演示模拟', 7.6, AMBER, True,
         align=PP_ALIGN.RIGHT)
    line_chart(s, lx + 0.10, 2.46, lw - 0.32, 2.30,
               ['11-05\n基线', '11-06\n第一轮', '11-08\n第二轮'], [68, 84, 91],
               maxv=100, minv=50, unit=10)
    text(s, lx + 0.26, 4.86, lw - 0.52, 0.58,
         '满意度 72 → 86 → 93；平均耗时 3.8s → 2.6s → 2.3s。', 8.6, MUTED, line=1.4)
    text(s, lx + 0.26, 5.34, lw - 0.52, 0.22, '同一批演示任务集，逐轮修误判与漏抽。', 8, FAINT)

    # 中：两轮改了什么
    mx, mw = 4.96, 4.22
    text(s, mx, 2.02, mw, 0.24, '两轮各改了什么', 10, INK, True)
    rounds = [('第一轮 · 11-06', ['关键词改加权匹配，降低「拼」字误触发',
                                  '时间抽取补「上午 / 下午 / 晚上」兜底',
                                  '解析结果强制回显，允许人工改字段']),
              ('第二轮 · 11-08', ['推荐理由改「事实 + 距离 + 好评」三段式',
                                  '失物加入颜色、地点、48 小时窗三维加权',
                                  '补低置信度提示与「人工核对」入口'])]
    yy = 2.32
    for title_, items in rounds:
        text(s, mx, yy, mw, 0.22, title_, 8.6, BRAND_D, True, spc=0.4)
        yy += 0.26
        for it in items:
            dot(s, mx + 0.03, yy + 0.075, 0.06, BRAND)
            text(s, mx + 0.18, yy - 0.02, mw - 0.18, 0.24, it, 8.8, MUTED)
            yy += 0.30
        yy += 0.14

    # 右：工具与提示词
    rx, rw = 9.40, 3.30
    card(s, rx, 2.02, rw, 3.12, fill=WHITE, radius=0.12)
    text(s, rx + 0.24, 2.16, rw - 0.48, 0.22, '工具与版本', 8.8, INK, True)
    tools = [('GLM-4-Flash', 'glm-4-flash-250414'), ('Qwen-Turbo', 'qwen-turbo-2025-04'),
             ('本地规则引擎', 'v1.2 · 214 次调用')]
    yy = 2.44
    for name, ver in tools:
        text(s, rx + 0.24, yy, rw - 0.48, 0.20, name, 8.4, INK, True)
        text(s, rx + 0.24, yy + 0.18, rw - 0.48, 0.18, ver, 7.0, FAINT, font=MONO)
        yy += 0.50
    rect(s, rx + 0.24, 3.96, rw - 0.48, 0.006, fill=LINE,
         shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, rx + 0.24, 4.06, rw - 0.48, 0.20, '关键提示词（节选）', 7.8, FAINT, True, spc=0.4)
    text(s, rx + 0.24, 4.28, rw - 0.48, 0.76,
         '「输出 JSON：{scene, confidence, fields[], missing[]}；不确定时降低 confidence 并给出澄清问题。」',
         7.2, MUTED, line=1.42)

    # 底部：人补位
    text(s, M, 5.74, 2.2, 0.22, '每一轮，人补了什么', 9, INK, True)
    backs = [('强制回显确认', '不让 AI 直接落库', BRAND),
             ('低置信度核对', '<72% 先问人再执行', TEAL),
             ('规则写进提示词', '隐私与格式靠约束，不靠运气', AMBER)]
    x = M
    for name, desc_, c in backs:
        card(s, x, 6.02, 3.94, 0.74, radius=0.1, shadow=False)
        rect(s, x, 6.16, 0.05, 0.46, fill=c, radius=0.025, shadow=False)
        text(s, x + 0.20, 6.12, 3.6, 0.22, name, 9.2, INK, True)
        text(s, x + 0.20, 6.36, 3.6, 0.22, desc_, 8.2, MUTED)
        x += 4.06

    fit_note(s, 'AI 使用记录在产品里能翻到：工具、版本、提示词全公开，演示版由本地规则引擎模拟。两轮迭代 68 到 84 到 91：第一轮加权关键词、补时段兜底、强制回显；第二轮改推荐理由、失物加颜色地点时间三维、补低置信度核对。每一轮都不是模型自己变好，是人补的规则。')
    return s


# ================================================================ 09 one week
def s09():
    s = slide_new()
    head(s, 9, 'Q5 · 如果还有一周',
         'Q5 ｜ 如果还有一周：先补真，再加多',
         '七天只做三件事——接真模型、接真数据、找真人走查；功能列表从今天起冻结。')

    days = [('D1', '接真模型', '规则引擎换真模型，保留规则兜底', '可切换的模型适配层', BRAND),
            ('D2', '解析回归', '30 条真实说法跑一遍，改写提示词', '回归结果与失败样本', BRAND),
            ('D3', '接真数据', '42 处占用表接后端，登录审核落库', '真实占用表与审核链', TEAL),
            ('D4', '真人走查', '10 位同学做 3 个真实任务', '问题清单与优先级', AMBER),
            ('D5', '埋点', '成功率、改字段率、放弃率', '三个真实指标看板', AMBER),
            ('D6', '回归', '390 宽适配，断网与超时降级', '降级话术与适配截图', CORAL),
            ('D7', '彩排', '只演练，不加任何功能', '一次完整 5 分钟彩排', CORAL)]
    x = M
    for d, name, act, deliver, c in days:
        card(s, x, 2.02, 1.60, 2.66, radius=0.1)
        rect(s, x, 2.02, 1.60, 0.07, fill=c, radius=0.035, shadow=False)
        text(s, x + 0.18, 2.16, 0.66, 0.22, d, 8.2, c, True, font=MONO)
        text(s, x + 0.18, 2.42, 1.30, 0.24, name, 9.6, INK, True)
        text(s, x + 0.18, 2.72, 1.26, 0.70, act, 7.8, MUTED, line=1.34)
        rect(s, x + 0.18, 3.48, 1.26, 0.006, fill=LINE,
             shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, x + 0.18, 3.56, 1.26, 0.18, '交付', 6.6, FAINT, True, spc=0.4)
        text(s, x + 0.18, 3.74, 1.26, 0.84, deliver, 7.8, INK, line=1.36)
        x += 1.72

    # 会改 / 不会改 / 验收
    y = 4.92
    card(s, M, y, 4.34, 1.66, radius=0.1)
    text(s, M + 0.24, y + 0.16, 3.8, 0.22, '会改', 9.4, TEAL_D, True, spc=0.5)
    lines = ['真模型调用 + 规则兜底', '真实占用表 + 审核链 + 登录', '真实任务成功率与埋点']
    for i, ln in enumerate(lines):
        text(s, M + 0.24, y + 0.46 + i * 0.34, 3.9, 0.24, '· ' + ln, 8.8, MUTED)

    card(s, M + 4.50, y, 4.06, 1.66, radius=0.1)
    text(s, M + 4.74, y + 0.16, 3.6, 0.22, '不会改', 9.4, CORAL, True, spc=0.5)
    lines = ['不加第五个场景', '不做 App 与社交扩张', '不为演示效果改数据']
    for i, ln in enumerate(lines):
        text(s, M + 4.74, y + 0.46 + i * 0.34, 3.7, 0.24, '· ' + ln, 8.8, MUTED)

    card(s, M + 8.72, y, 3.36, 1.66, fill=DARK, line='2A2D52', radius=0.1, shadow=False)
    text(s, M + 8.96, y + 0.16, 2.9, 0.22, '验收目标（不是实测）', 8.4, '9AA0BC', True, spc=0.3)
    text(s, M + 8.96, y + 0.46, 2.9, 1.06,
         '解析成功率 ≥ 90%\n字段改率 < 30%\n任务完成率 ≥ 80%', 9.2, WHITE, line=1.42)

    fit_note(s, '如果还有一周，先补真再加多。前三天换真模型、跑解析回归、接真实占用表和审核后端；第四天找十位同学走查；第五天埋点，换真实指标；第六天回归移动端和断网降级；第七天只彩排。不加第五个场景，不做 App。验收看三个数：解析成功率、字段改率、任务完成率。')
    return s


# ================================================================ 10 demo + closing
def s10():
    s = slide_new()
    head(s, 10, '现场演示 · 收尾',
         '现场 1 分钟：六步，每步留一个结果',
         '不解释实现，只让评委看到「一句话 → 一个可提交的结果」。')

    steps = [('0:00', '登录', '林小满一键进入', '工作台 KPI + 四场景'),
             ('0:10', '说一句', '「周四下午 40 人 投影 班会」', '解析弹层：场景 + 94%'),
             ('0:22', '改一个字段', '40 人改成 30 人', '字段可改 = 人确认'),
             ('0:32', '看候选', '3 处教室 + 逐条理由', '匹配度 / 空闲 / 距离'),
             ('0:42', '一键申请', '提交并进入状态跟踪', '我的申请：待审核'),
             ('0:52', '看通知', '消息中心收到回执', '管理员审核入口')]
    w = 1.90
    x = M
    for tm, name, act, out in steps:
        card(s, x, 2.02, w, 2.50, radius=0.1)
        pill(s, x + 0.18, 2.16, 0.70, 0.26, tm, BRAND_D, SOFT, 7.6)
        text(s, x + 0.18, 2.52, w - 0.36, 0.24, name, 9.8, INK, True)
        text(s, x + 0.18, 2.82, w - 0.34, 0.80, act, 8.0, MUTED, line=1.36)
        rect(s, x + 0.18, 3.66, w - 0.36, 0.006, fill=LINE,
             shape=MSO_SHAPE.RECTANGLE, shadow=False)
        text(s, x + 0.18, 3.74, w - 0.34, 0.20, '屏幕上留下', 6.8, FAINT)
        text(s, x + 0.18, 3.94, w - 0.34, 0.48, out, 7.8, TEAL_D, True, line=1.34)
        x += w + 0.116

    # 收尾
    card(s, M, 4.74, CW, 1.76, fill=DARK, line='2A2D52', radius=0.14, shadow=False)
    text(s, M + 0.46, 5.02, 7.2, 0.66, '把复杂留给系统，把简单留给同学。',
         23, WHITE, True)
    text(s, M + 0.46, 5.78, 6.8, 0.44,
         '校园智能调度平台 · 河南新华电脑学院 东校区\n演示数据均为虚构；AI 指标为产品内置模拟，不是线上实测。',
         8.4, '9AA0BC', line=1.45)
    rect(s, SW - M - 3.52, 5.02, 0.008, 1.18, fill='2E3160',
         shape=MSO_SHAPE.RECTANGLE, shadow=False)
    text(s, SW - M - 3.28, 5.04, 3.0, 0.22, '下一步', 8, '8F96B2', True, spc=0.5)
    text(s, SW - M - 3.28, 5.30, 3.0, 0.94,
         '接真模型 · 接真场地 · 找真人\n三件事做完，再谈上线。', 9.4, 'C9CEE3', line=1.5)

    fit_note(s, '现场一分钟这样走：登录林小满，首页说一句「周四下午 40 人、带投影、开班会」，弹层给出场景和 94% 置信度；把 40 人改成 30 人，证明字段可改；看三处候选和理由；一键申请；消息中心收到提交回执。六步，每步屏幕上都有一个结果。最后一句：把复杂留给系统，把简单留给同学。谢谢。')
    return s


def main():
    s01()
    s02()
    s03()
    s04()
    s05()
    s06()
    s07()
    s08()
    s09()
    s10()
    prs.save(OUT)

    total_notes = 0
    for i, sl in enumerate(prs.slides, 1):
        n = sl.notes_slide.notes_text_frame.text if sl.has_notes_slide else ''
        total_notes += len(n.replace('\n', ''))
        print('p%02d  notes=%d  %s' % (i, len(n), n[:24]))
    print('notes total chars:', total_notes)
    print('saved:', OUT)


if __name__ == '__main__':
    main()
