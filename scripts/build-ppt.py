#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《校园智能调度平台 · 项目讲解》16:9 演示文稿。

用法：python scripts/build-ppt.py
依赖：python-pptx（DSH 运行时已内置）。
截图来源：docs/ppt-assets/*.png（由 scripts/shot.mjs 生成）。
"""
import os
from pathlib import Path

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from pptx.oxml.ns import qn
from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
SHOT = ROOT / 'docs' / 'ppt-assets'
OUT = Path(os.environ.get('PPT_OUT', ROOT / 'docs' / '校园智能调度平台-项目讲解.pptx'))

FONT = '微软雅黑'
MONO = 'Consolas'

INK = RGBColor(0x15, 0x18, 0x30)
MUTED = RGBColor(0x5F, 0x67, 0x7C)
FAINT = RGBColor(0x9A, 0xA2, 0xB6)
BRAND = RGBColor(0x6C, 0x63, 0xFF)
BRAND_D = RGBColor(0x4B, 0x42, 0xC9)
TEAL = RGBColor(0x12, 0xB3, 0xA6)
AMBER = RGBColor(0xF5, 0xA6, 0x23)
CORAL = RGBColor(0xFF, 0x6B, 0x6B)
BG = RGBColor(0xF6, 0xF7, 0xFB)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xE4, 0xE7, 0xF1)
DARK = RGBColor(0x0E, 0x10, 0x23)
DARK_2 = RGBColor(0x1A, 0x1D, 0x3D)
LIGHT_W = RGBColor(0xF2, 0xF3, 0xFA)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def set_font(run, size=18, color=INK, bold=False, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    for tag in ('a:ea', 'a:cs'):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set('typeface', font)


def text(slide, s, x, y, w, h, size=18, color=INK, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, font=FONT, spacing=1.16, margins=(0, 0, 0, 0)):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left, tf.margin_right, tf.margin_top, tf.margin_bottom = (Inches(m) for m in margins)
    tf.vertical_anchor = anchor
    lines = s.split('\n')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = line
        set_font(r, size, color, bold, font)
    return box


def rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.12, shape=MSO_SHAPE.ROUNDED_RECTANGLE, lw=0.8):
    sh = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(lw)
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sh.adjustments[0] = min(0.5, radius / min(w, h))
        except Exception:
            pass
    sh.shadow.inherit = False
    return sh


def set_gradient(sh, c1, c2, angle=45):
    sh.fill.gradient()
    sh.fill.gradient_angle = angle
    stops = sh.fill.gradient_stops
    stops[0].color.rgb = c1
    stops[0].position = 0.0
    stops[1].color.rgb = c2
    stops[1].position = 1.0


def bg(slide, color=BG):
    rect(slide, 0, 0, 13.333, 7.5, fill=color, line=None, shape=MSO_SHAPE.RECTANGLE)


def kicker(slide, label, x=0.62, y=0.42, color=BRAND):
    rect(slide, x, y + 0.04, 0.09, 0.09, fill=color, line=None, radius=0.02, shape=MSO_SHAPE.RECTANGLE)
    text(slide, label, x + 0.18, y - 0.03, 8.6, 0.3, 10.5, color, True)


def title(slide, s, x=0.62, y=0.66, w=11.9, size=31):
    text(slide, s, x, y, w, 0.78, size, INK, True, spacing=1.05)


def desc(slide, s, x=0.62, y=1.46, w=11.0, size=13.5, color=MUTED):
    text(slide, s, x, y, w, 0.42, size, color, False, spacing=1.25)


def footer(slide, no, total=14, dark=False):
    c = RGBColor(0x6E, 0x74, 0x8C) if not dark else RGBColor(0x8F, 0x95, 0xAD)
    rect(slide, 0.62, 7.02, 12.09, 0.012, fill=RGBColor(0x2C, 0x30, 0x50) if dark else LINE, line=None, shape=MSO_SHAPE.RECTANGLE)
    text(slide, '校园智能调度平台    |    AI 应用创意大赛 · 演示版', 0.62, 7.12, 8.6, 0.24, 9, c)
    text(slide, f'{no:02d} / {total}', 11.4, 7.12, 1.3, 0.24, 9, c, False, PP_ALIGN.RIGHT)


def note(slide, s, x=0.62, y=6.56, w=12.0):
    text(slide, s, x, y, w, 0.3, 8.5, FAINT, False, spacing=1.2)


def pic(slide, name, x, y, w, h=None, frame=True, crop=None):
    path = SHOT / name
    if frame:
        rect(slide, x - 0.055, y - 0.055, w + 0.11, (h or w * 9 / 16) + 0.11, fill=WHITE, line=LINE, radius=0.1)
    if h is None:
        h = w * 9 / 16
    picture = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    if crop:
        l, t, r, b = crop
        picture.crop_left, picture.crop_top, picture.crop_right, picture.crop_bottom = l, t, r, b
    return h


def chip(slide, label, x, y, w, fill=LIGHT_W, fg=MUTED, size=10.5, h=0.34):
    rect(slide, x, y, w, h, fill=fill, line=None, radius=0.17)
    text(slide, label, x, y + 0.02, w, h - 0.04, size, fg, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)


def bullet(slide, s, x, y, w, color=INK, size=13.5, dot=BRAND, gap=0.05):
    rect(slide, x, y + 0.11, 0.07, 0.07, fill=dot, line=None, radius=0.02, shape=MSO_SHAPE.RECTANGLE)
    text(slide, s, x + 0.2, y, w - 0.2, 0.46, size, color, False, spacing=1.2)


def stat(slide, value, label, sub, x, y, w=2.7, h=1.26, color=BRAND):
    rect(slide, x, y, w, h, fill=WHITE, line=LINE, radius=0.14)
    text(slide, value, x + 0.22, y + 0.17, w - 0.4, 0.52, 25, color, True, spacing=1.0)
    text(slide, label, x + 0.22, y + 0.68, w - 0.4, 0.26, 10.5, MUTED, True)
    text(slide, sub, x + 0.22, y + 0.94, w - 0.4, 0.22, 9, FAINT)


# ---------------------------------------------------------------- 01 封面
s = prs.slides.add_slide(BLANK)
bg(s, DARK)
# 背景光斑
for (cx, cy, d, col) in [(9.2, 0.6, 5.6, RGBColor(0x2A, 0x25, 0x66)), (11.0, 5.8, 4.2, RGBColor(0x0F, 0x4A, 0x4A))]:
    sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - d / 2), Inches(cy - d / 2), Inches(d), Inches(d))
    sh.fill.solid()
    sh.fill.fore_color.rgb = col
    sh.line.fill.background()
    sh.shadow.inherit = False

s.shapes.add_picture(str(ROOT / 'public' / 'app-icon-512.png'), Inches(0.92), Inches(0.86), Inches(0.82), Inches(0.82))
text(s, '校园智能调度平台', 1.86, 0.92, 3.0, 0.4, 18, WHITE, True)
text(s, 'AI 智能调度', 1.86, 1.3, 3.0, 0.28, 10.5, RGBColor(0xB9, 0xB4, 0xE8))

text(s, '河南新华电脑学院 · AI 应用创意大赛 · V1.0', 0.92, 2.05, 8.0, 0.3, 11, RGBColor(0xB9, 0xB4, 0xE8), True)
text(s, '一句话，\n把校园里的事\n安排好。', 0.92, 2.5, 8.2, 2.55, 42, WHITE, True, spacing=1.08)
text(s, '面向校园场景的 AI 调度网站：自然语言输入 → 意图解析 → 资源匹配 → 结果生成 → 自动通知。',
     0.94, 5.2, 7.6, 0.8, 14, RGBColor(0xD6, 0xD4, 0xEE), False, spacing=1.3)

for i, (lab, col) in enumerate([('教室借用', RGBColor(0x8F, 0x87, 0xFF)), ('失物招领', TEAL), ('拼单集市', AMBER), ('校园论坛', CORAL)]):
    chip(s, lab, 0.94 + i * 1.62, 6.2, 1.42, RGBColor(0x25, 0x27, 0x4A), col, 10.5, 0.36)
text(s, '4 大场景 · 15 个页面 · 纯前端可离线演示', 0.94, 6.78, 8.0, 0.3, 9.5, RGBColor(0x8E, 0x92, 0xB0))
text(s, '演示数据均为模拟数据，AI 由本地可解释规则引擎驱动', 0.94, 7.06, 8.4, 0.3, 8.5, RGBColor(0x6E, 0x72, 0x92))

# 右侧装饰卡
rect(s, 8.9, 2.45, 3.5, 3.55, fill=RGBColor(0x1B, 0x1E, 0x3E), line=RGBColor(0x33, 0x36, 0x62), radius=0.18)
text(s, 'AI 调度流水线', 9.2, 2.72, 2.9, 0.3, 11, WHITE, True)
for i, lab in enumerate(['需求解析', '智能匹配', '结果生成', '自动通知']):
    y = 3.2 + i * 0.62
    rect(s, 9.2, y, 0.3, 0.3, fill=RGBColor(0x2E, 0x2A, 0x66), line=None, radius=0.08)
    text(s, f'0{i+1}', 9.2, y + 0.03, 0.3, 0.24, 8.5, RGBColor(0xC9, 0xC5, 0xF5), True, PP_ALIGN.CENTER)
    text(s, lab, 9.64, y + 0.01, 2.2, 0.3, 12, RGBColor(0xEC, 0xEA, 0xFA), True)
text(s, '平均 2.3s 返回方案', 9.2, 5.62, 2.8, 0.28, 9, RGBColor(0x9A, 0x9F, 0xC0))

# ---------------------------------------------------------------- 02 问题
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '01  ·  PROBLEM')
title(s, '校园里的“小事”，为什么总要花很多时间？')
desc(s, '四类高频需求散布在群聊、表格和公告里，信息不对称，重复沟通成本高。')

cards = [
    ('找教室', '空闲信息不透明', '问遍班群、跑到楼层看门牌；换时间就要重新问一遍。', BRAND),
    ('找失物', '描述不清难匹配', '丢的人和捡到的人各发一条，颜色、地点、时间对不上就沉底。', TEAL),
    ('拼单', '接龙靠刷屏', '满员没人提醒、截止没人收口，发起人反复核对名单。', AMBER),
    ('找同频', '帖子容易沉底', '重复提问多，相似讨论散落，缺少结构化标签与摘要。', CORAL),
]
for i, (h, sub, body, col) in enumerate(cards):
    x = 0.62 + i * 3.07
    rect(s, x, 2.05, 2.85, 2.72, fill=WHITE, line=LINE, radius=0.16)
    rect(s, x + 0.22, 2.28, 0.4, 0.4, fill=col, line=None, radius=0.11)
    text(s, f'0{i+1}', x + 0.22, 2.32, 0.4, 0.3, 10, WHITE, True, PP_ALIGN.CENTER)
    text(s, h, x + 0.22, 2.84, 2.4, 0.36, 16, INK, True)
    text(s, sub, x + 0.22, 3.26, 2.45, 0.28, 10.5, col, True)
    text(s, body, x + 0.22, 3.66, 2.42, 0.95, 10.5, MUTED, False, spacing=1.35)

rect(s, 0.62, 5.05, 12.09, 1.18, fill=RGBColor(0xEF, 0xEE, 0xFF), line=None, radius=0.16)
text(s, '“不是没有资源，而是需求与资源之间缺一个会理解、会匹配、会通知的中间层。”',
     0.96, 5.3, 11.4, 0.4, 15.5, BRAND_D, True)
text(s, '四种场景共享同一套 AI 调度能力，而不是四个各自动手的小工具。',
     0.96, 5.76, 11.2, 0.3, 10.5, MUTED)
note(s, '场景来自方案设定的校园高频需求；本页不引用未经实测的用户调研数字。')

# ---------------------------------------------------------------- 03 方案总览
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '02  ·  SOLUTION')
title(s, '一个入口，四个场景，一条 AI 流水线')
desc(s, '把“人要跑腿问”的部分，交给解析、匹配、生成与通知；人只做确认。')

steps = [('01', '需求解析', '一句话 → 场景 + 字段 + 置信度'),
         ('02', '智能匹配', '按硬条件过滤，再按距离/好评排序'),
         ('03', '结果生成', '候选方案、规范文案、帖子草稿'),
         ('04', '自动通知', '审核、匹配、成团、回复统一进站内信')]
rect(s, 0.62, 2.02, 6.55, 3.64, fill=WHITE, line=LINE, radius=0.18)
for i, (n, h, body) in enumerate(steps):
    y = 2.28 + i * 0.8
    rect(s, 0.92, y, 0.46, 0.46, fill=RGBColor(0xEF, 0xEE, 0xFF), line=None, radius=0.13)
    text(s, n, 0.92, y + 0.08, 0.46, 0.3, 10.5, BRAND, True, PP_ALIGN.CENTER)
    text(s, h, 1.56, y + 0.02, 1.7, 0.32, 14, INK, True)
    text(s, body, 3.24, y + 0.04, 3.6, 0.34, 10.5, MUTED)
    if i < 3:
        rect(s, 1.14, y + 0.5, 0.012, 0.28, fill=LINE, line=None, shape=MSO_SHAPE.RECTANGLE)

scenes = [('教室借用', '42 处教学场所 · 空闲时段 · 一键申请', BRAND),
          ('失物招领', '双向匹配 · 相似度与理由 · 脱敏联系', TEAL),
          ('拼单集市', '接龙进度 · 倒计时 · 满员提醒', AMBER),
          ('校园论坛', 'AI 起草 · 相似帖 · AI 速读', CORAL)]
for i, (h, body, col) in enumerate(scenes):
    x = 7.5
    y = 2.02 + i * 1.02
    rect(s, x, y, 5.2, 0.9, fill=WHITE, line=LINE, radius=0.12)
    rect(s, x, y + 0.18, 0.07, 0.54, fill=col, line=None, radius=0.02, shape=MSO_SHAPE.RECTANGLE)
    text(s, h, x + 0.26, y + 0.16, 1.7, 0.3, 13, INK, True)
    text(s, body, x + 0.26, y + 0.5, 4.7, 0.28, 9.5, MUTED)
text(s, 'AI 只做建议，确认后才执行', 7.52, 6.28, 5.0, 0.3, 9.5, FAINT)
note(s, '交互链路对应方案 FR-01 / FR-02，四个场景共用同一套 AI 能力接口。')

# ---------------------------------------------------------------- 04 一句话交互
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '03  ·  ONE SENTENCE')
title(s, '说一句话，AI 把需求拆成“可修改的字段”')
desc(s, '不让用户猜 AI 想了什么：场景、置信度、字段全部显式回显，确认后才继续。')

pic(s, 'ai-dialog.png', 7.2, 1.9, 5.0, 4.5, crop=(0.235, 0.10, 0.265, 0.10))
items = [('看得见', '识别场景、置信度、每个字段都摆出来'),
         ('改得动', '时段、人数、设备、地点可逐项修正'),
         ('退得回', '低置信度提示人工核对；识别失败给场景入口'),
         ('有边界', '不编造未提供的信息；所有 AI 文案带标识')]
for i, (h, body) in enumerate(items):
    y = 2.02 + i * 1.06
    rect(s, 0.62, y, 0.34, 0.34, fill=RGBColor(0xEF, 0xEE, 0xFF), line=None, radius=0.09)
    text(s, f'0{i+1}', 0.62, y + 0.04, 0.34, 0.26, 9, BRAND, True, PP_ALIGN.CENTER)
    text(s, h, 1.1, y - 0.02, 2.0, 0.32, 14, INK, True)
    text(s, body, 1.1, y + 0.34, 4.55, 0.5, 10.5, MUTED, False, spacing=1.25)
note(s, '示例：周四下午 40 人、带投影的班会 → 94% 置信度；低于 72% 的结果强制人工确认。')

# ---------------------------------------------------------------- 05 教室
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '04  ·  SCENE 01')
title(s, '教室借用：先过滤硬条件，再解释为什么推荐')
desc(s, '容量、设备、时段先做硬过滤，再按距离与好评排序，给出 2–3 个带理由的候选。')

for i, (lab, val) in enumerate([('可用场所', '42 处'), ('匹配耗时', '0.9s'), ('候选方案', '3 个')]):
    x = 0.62 + i * 1.94
    rect(s, x, 2.0, 1.78, 0.86, fill=WHITE, line=LINE, radius=0.12)
    text(s, val, x + 0.2, 2.12, 1.4, 0.4, 19, BRAND, True)
    text(s, lab, x + 0.2, 2.52, 1.4, 0.24, 9.5, FAINT)

points = ['硬条件过滤：人数、设备、空闲时段不满足的直接排除',
          '可解释排序：理由逐条可核验（容量/空闲/设备/好评）',
          '一键申请：预填表单 + AI 资源核验，提交后进入审核',
          '闭环跟踪：状态时间线 + 站内通知，管理员可审核/驳回']
for i, p in enumerate(points):
    bullet(s, p, 0.68, 3.14 + i * 0.62, 4.72, INK, 10.5)

pic(s, 'classroom-result.png', 5.5, 1.9, 7.22)
note(s, '截图为 1440 宽演示环境；42 处教学场所、5 个工作日、0.9s 均为演示内置数据。')

# ---------------------------------------------------------------- 06 失物
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '05  ·  SCENE 02')
title(s, '失物招领：双向匹配，把“像”说清楚')
desc(s, '丢的人与捡到的人各说一半，AI 用类别、颜色、地点与时间窗把两半拼起来。')

for i, (h, body) in enumerate([
    ('AI 生成规范文案', '标题、正文、标签一次成型，发布前可改'),
    ('双向特征匹配', '类别 + 颜色 + 地点 + 48h 时间窗加权'),
    ('给出相似度与理由', '89% 相似 · 物品类别一致 · 地点相同'),
    ('隐私默认脱敏', '联系人显示「林**」，站内沟通，不留手机号'),
]):
    y = 2.0 + i * 1.02
    rect(s, 0.62, y, 5.0, 0.86, fill=WHITE, line=LINE, radius=0.12)
    text(s, h, 0.86, y + 0.14, 4.4, 0.3, 12.5, INK, True)
    text(s, body, 0.86, y + 0.48, 4.5, 0.28, 9.5, MUTED)

pic(s, 'lostfound.png', 6.0, 1.92, 6.72)
note(s, '右栏为 AI 双向匹配面板；相似度与理由均可追溯，认领需线下核对特征。')

# ---------------------------------------------------------------- 07 拼单
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '06  ·  SCENE 03')
title(s, '拼单集市：进度、倒计时与自动提醒')
desc(s, '把群里的“接龙”变成有状态、有进度、会自动收口的拼单。')

for i, (h, body) in enumerate([
    ('发起', '商品、单价、目标份数、截止时间、取货点'),
    ('接龙', '实时进度、参与人头像、份数可增减'),
    ('提醒', '满员 / 临近截止自动进消息中心'),
    ('收口', '已成团、已结束状态明确，发起人可结束/删除'),
]):
    y = 2.02 + i * 1.0
    rect(s, 0.62, y, 5.2, 0.84, fill=WHITE, line=LINE, radius=0.12)
    text(s, f'0{i+1}', 0.84, y + 0.18, 0.5, 0.3, 11, BRAND, True)
    text(s, h, 1.32, y + 0.12, 1.2, 0.3, 12.5, INK, True)
    text(s, body, 1.32, y + 0.46, 4.2, 0.28, 9.5, MUTED)

pic(s, 'groupbuy.png', 6.0, 1.92, 6.72)
note(s, '进度环颜色只表达成团状态：进行中 / 临近截止 / 已成团，避免和分类标签混淆。')

# ---------------------------------------------------------------- 08 论坛
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '07  ·  SCENE 04  /  PIVOT')
title(s, '从“社团排班”到“校园论坛”：一次场景替换')
desc(s, '初版第四场景演示成本高、受众窄；论坛复用同一条 AI 流水线，更贴近日常讨论。')

left = ['AI 起草：一句话生成标题、分类、正文与标签',
        '相似帖：发布前先看 3 条同频讨论，减少重复提问',
        'AI 速读：多条回复压缩成一段摘要，先看结论',
        '闭环：回复、点赞、标记解决，通知中心统一收口']
for i, p in enumerate(left):
    bullet(s, p, 0.68, 1.98 + i * 0.58, 4.62, INK, 11, TEAL)

rect(s, 0.62, 4.62, 4.95, 1.28, fill=RGBColor(0xEE, 0xFA, 0xF8), line=None, radius=0.14)
text(s, '为什么敢换？', 0.86, 4.76, 2.0, 0.3, 11, RGBColor(0x0A, 0x7F, 0x76), True)
text(s, '场景层只依赖统一的 AI 能力接口与设计系统；换一个场景，交互层与 AI 层零改动。',
     0.86, 5.1, 4.45, 0.7, 9.5, RGBColor(0x2E, 0x4E, 0x4D), False, spacing=1.3)

pic(s, 'forum.png', 5.75, 1.88, 6.85)
pic(s, 'forum-detail.png', 9.55, 4.12, 3.15)
note(s, '左：论坛广场；右：帖子详情（AI 速读 / 相似讨论 / 回复）。')

# ---------------------------------------------------------------- 09 AI 架构
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '08  ·  AI  CAPABILITY')
title(s, 'AI 能力层：可解释、可替换、可降级')
desc(s, '演示版用本地规则引擎模拟，但接口与真实 LLM 对齐，接 GLM / Qwen 时不改页面。')

layers = [('交互层', '首页一句话、场景页、确认弹层', BRAND),
          ('应用服务层', '教室 / 失物 / 拼单 / 论坛 store', RGBColor(0x8F, 0x87, 0xFF)),
          ('AI 能力层', '解析 · 匹配 · 生成 · 通知', TEAL),
          ('数据层', '演示种子数据 + localStorage', AMBER)]
for i, (h, body, col) in enumerate(layers):
    y = 1.98 + i * 1.03
    rect(s, 0.62, y, 6.5, 0.84, fill=WHITE, line=LINE, radius=0.12)
    rect(s, 0.62, y, 0.09, 0.84, fill=col, line=None, radius=0.02, shape=MSO_SHAPE.RECTANGLE)
    text(s, h, 0.94, y + 0.1, 1.6, 0.3, 11.5, INK, True)
    text(s, body, 2.5, y + 0.1, 4.3, 0.3, 10, MUTED)
    if i < 3:
        text(s, '↓', 3.55, y + 0.78, 0.3, 0.26, 10, FAINT)

rect(s, 7.42, 1.98, 5.3, 4.06, fill=RGBColor(0x16, 0x18, 0x2E), line=None, radius=0.16)
text(s, 'parseRequirement(一句话)', 7.68, 2.16, 4.8, 0.3, 10.5, RGBColor(0x9E, 0x97, 0xFF), True, font=MONO)
code = ('{\n'
        '  "scene": "classroom",\n'
        '  "confidence": 0.94,\n'
        '  "fields": {\n'
        '    "day": "周四", "start": "14:00",\n'
        '    "end": "16:00", "capacity": 40\n'
        '  },\n'
        '  "missing": ["building"]\n'
        '}')
text(s, code, 7.68, 2.52, 4.75, 2.05, 9.5, RGBColor(0xD9, 0xD6, 0xF2), False, font=MONO, spacing=1.22)
rect(s, 7.68, 4.38, 4.75, 0.012, fill=RGBColor(0x33, 0x36, 0x5E), line=None, shape=MSO_SHAPE.RECTANGLE)
text(s, '✓ 解析结果强制人工确认\n✓ 低置信度标记「待人工核对」\n✓ 超时 / 失败自动切本地规则',
     7.68, 4.54, 4.8, 0.95, 9.5, RGBColor(0x9E, 0xA0, 0xBE), False, spacing=1.35)
text(s, '正式版：GLM-4-Flash / Qwen-Turbo 适配层', 7.68, 5.66, 4.8, 0.3, 9.5, RGBColor(0x7E, 0xD8, 0xCF), True)
note(s, '本地引擎是“演示可跑”的实现选择；接口约定不变时，可平滑替换为真实大模型。')

# ---------------------------------------------------------------- 10 迭代
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '09  ·  ITERATION')
title(s, '两轮迭代：68% → 84% → 91%')
desc(s, '同一批演示任务集下，逐轮修掉误判与漏抽；指标、问题、改动都保留在 AI 使用记录页。')

stat_data = [('91%', '意图解析准确率', '较初版 +23 个百分点', BRAND),
             ('2.3s', '平均响应', '较初版 -1.5s', TEAL),
             ('93%', '用户满意度', '演示样本 · 第 2 轮', AMBER)]
for i, (v, l, sub, col) in enumerate(stat_data):
    x = 0.62 + i * 1.93
    rect(s, x, 1.94, 1.8, 1.14, fill=WHITE, line=LINE, radius=0.14)
    text(s, v, x + 0.18, 2.05, 1.5, 0.46, 19.5, col, True, spacing=1.0)
    text(s, l, x + 0.18, 2.52, 1.52, 0.24, 8.8, MUTED, True)
    text(s, sub, x + 0.18, 2.78, 1.52, 0.22, 7.8, FAINT)

chart_data = CategoryChartData()
chart_data.categories = ['初版', '第 1 轮', '第 2 轮']
chart_data.add_series('准确率', (68, 84, 91))
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(6.78), Inches(1.9), Inches(5.92), Inches(3.02), chart_data)
chart = gf.chart
chart.has_legend = False
chart.has_title = False
chart.font.size = Pt(9)
chart.font.name = FONT
chart.font.color.rgb = MUTED
plot = chart.plots[0]
plot.has_data_labels = True
plot.data_labels.font.size = Pt(9)
plot.data_labels.font.bold = True
plot.data_labels.font.color.rgb = BRAND_D
plot.series[0].format.line.color.rgb = BRAND
plot.series[0].format.line.width = Pt(2.2)
plot.series[0].smooth = False
chart.value_axis.maximum_scale = 100
chart.value_axis.minimum_scale = 50
chart.value_axis.has_major_gridlines = True
chart.value_axis.major_gridlines.format.line.color.rgb = RGBColor(0xE8, 0xEA, 0xF3)
chart.value_axis.tick_labels.font.size = Pt(8)
chart.category_axis.tick_labels.font.size = Pt(9)

changes = ['关键词改为加权匹配，修掉“拼”字误判拼单',
           '时间抽取补「上午/下午/晚上」兜底',
           '推荐理由改为「事实 + 距离 + 好评」三段式',
           '失物匹配加入颜色、地点、48 小时时间窗',
           '低置信度改成强制人工确认，不再直接执行']
text(s, '两轮具体改了什么', 0.68, 3.44, 3.2, 0.3, 11, BRAND, True)
for i, c in enumerate(changes):
    bullet(s, c, 0.68, 3.86 + i * 0.5, 5.8, MUTED, 9.8, TEAL)

rect(s, 6.78, 5.14, 5.92, 0.9, fill=RGBColor(0xEF, 0xEE, 0xFF), line=None, radius=0.14)
text(s, '改动集中在解析与解释：认对场景、抽全字段、讲清理由。',
     7.02, 5.32, 5.45, 0.34, 10.5, BRAND_D, True)
text(s, '每一轮都同步更新 AI 使用记录页，保留问题、改动与前后指标。',
     7.02, 5.66, 5.45, 0.26, 8.5, MUTED)

note(s, '以上为演示内置模拟数据，样本为方案设定的演示任务集，非线上真实用户实测；AI 使用记录页可逐项查看。')

# ---------------------------------------------------------------- 11 设计系统
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '10  ·  DESIGN SYSTEM')
title(s, '一套设计系统，撑起 15 个页面')
desc(s, '品牌色、组件与响应式规则先定，再并行开发场景页，最后仍像同一个产品。')

colors = [('电光紫', '#6C63FF', BRAND), ('青绿', '#12B3A6', TEAL), ('琥珀', '#F5A623', AMBER),
          ('珊瑚', '#FF6B6B', CORAL), ('墨色', '#151830', INK)]
for i, (name, hexv, col) in enumerate(colors):
    x = 0.62 + i * 1.24
    rect(s, x, 2.0, 1.06, 0.66, fill=col, line=None, radius=0.1)
    text(s, name, x, 2.74, 1.1, 0.24, 9, MUTED, True)
    text(s, hexv, x, 2.96, 1.1, 0.22, 7.8, FAINT, font=MONO)

text(s, '15 个共享组件', 0.64, 3.48, 3.2, 0.3, 11, BRAND, True)
comps = ['PageHeader', 'SectionCard', 'StatTile', 'StatusPill', 'ProgressRing', 'CountdownText',
         'AvatarStack', 'AiBadge', 'AiThinking', 'AiParseDialog', 'SceneTile', 'SceneIcon',
         'EmptyState', 'AppLogo', 'AppLayout']
for i, c in enumerate(comps):
    col = i % 3
    row = i // 3
    chip(s, c, 0.62 + col * 1.62, 3.8 + row * 0.43, 1.5, LIGHT_W, MUTED, 8.5, 0.3)

text(s, '响应式三档断点', 0.64, 5.98, 3.2, 0.3, 10.5, BRAND, True)
text(s, '≥1180 桌面双栏   ·   900–1180 收窄   ·   ≤900 单列 / 移动底栏   ·   移动端核心操作 ≤3 步',
     0.64, 6.3, 6.2, 0.3, 9, MUTED)

pic(s, 'login.png', 7.05, 1.94, 5.65)
text(s, '标准登录 + 4 个演示身份，保留一键进入', 7.1, 5.22, 5.5, 0.28, 8.8, FAINT)
note(s, '页面统一 18px 卡片圆角、三档断点、AI 生成标识与隐私脱敏规则。')

# ---------------------------------------------------------------- 12 工程
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '11  ·  ENGINEERING')
title(s, '从“能跑”到“可交付”：工程化收尾')
desc(s, '纯前端、无后端依赖；构建、路由、状态、错误兜底与启动方式都按可演示标准收口。')

stats = [('16', '命名路由', '含 404 兜底'), ('15', '共享组件', '设计系统复用'),
         ('0', '构建错误', '4.8s 完成'), ('0', '巡检异常', '桌面 + 移动双端')]
for i, (v, l, sub) in enumerate(stats):
    x = 0.62 + i * 3.06
    rect(s, x, 1.96, 2.82, 1.28, fill=WHITE, line=LINE, radius=0.14)
    text(s, v, x + 0.22, 2.08, 1.2, 0.5, 24, BRAND, True)
    text(s, l, x + 0.22, 2.6, 2.3, 0.26, 10, INK, True)
    text(s, sub, x + 0.22, 2.88, 2.3, 0.22, 8.5, FAINT)

checks = ['路由懒加载 + vendor 分包，首屏 JS gzip ≈ 30KB',
          '状态持久化带 try/catch，旧通知链接自动迁移',
          '全局错误兜底；chunk 加载失败自动刷新一次',
          '图片上传压缩到 1000px，避免撑爆 localStorage',
          '键盘可达：skip link、焦点环、aria-label']
for i, c in enumerate(checks):
    bullet(s, c, 0.68, 3.56 + i * 0.44, 7.1, MUTED, 10, TEAL)

rect(s, 8.0, 3.48, 4.72, 2.1, fill=RGBColor(0xEF, 0xEE, 0xFF), line=None, radius=0.16)
text(s, '一键启动（Windows）', 8.26, 3.66, 4.2, 0.3, 11, BRAND_D, True)
text(s, '双击「启动校园智能调度平台.bat」或桌面快捷方式\n自动检查依赖 / 端口，启动后打开浏览器',
     8.26, 4.04, 4.2, 0.7, 9.5, MUTED, False, spacing=1.35)
text(s, '停止：双击「停止校园智能调度平台.bat」\n只结束本项目 5173 上的 Vite 进程',
     8.26, 4.84, 4.2, 0.66, 9.5, MUTED, False, spacing=1.35)

note(s, '构建与巡检为本机记录：vite build 4.8s；脚本巡检 14 条业务路由 × 1440/390 + 管理员页，0 异常。')

# ---------------------------------------------------------------- 13 边界与路线
s = prs.slides.add_slide(BLANK)
bg(s)
kicker(s, '12  ·  BOUNDARY  &  ROADMAP')
title(s, '今天能演示什么，下一步补什么')
desc(s, '先把完整体验跑通，再按“真实模型 → 真实数据 → 真实用户”三步升级。')

cols = [
    ('现在 · 可演示', BRAND, ['纯前端，离线可跑，无后端依赖', '本地规则引擎模拟 AI', '演示种子数据 + localStorage', '15 个页面 + 响应式 + 一键启动']),
    ('下一步 · 接真模型', TEAL, ['FastAPI + SQLite 最小后端', 'GLM-4-Flash / Qwen 适配层', '登录鉴权与真实角色权限', 'AI 调用日志、超时与重试']),
    ('再下一步 · 试点', AMBER, ['30+ 真实用户试用', '真实评测集与采纳率', '多用户并发与数据隔离', '与学校教室/通知系统对接']),
]
for i, (h, col, items) in enumerate(cols):
    x = 0.62 + i * 4.12
    rect(s, x, 1.98, 3.86, 3.42, fill=WHITE, line=LINE, radius=0.16)
    rect(s, x + 0.24, 2.2, 3.38, 0.06, fill=col, line=None, radius=0.03, shape=MSO_SHAPE.RECTANGLE)
    text(s, h, x + 0.24, 2.4, 3.4, 0.32, 13.5, INK, True)
    for j, it in enumerate(items):
        bullet(s, it, x + 0.26, 2.84 + j * 0.58, 3.34, MUTED, 9.5, col)

rect(s, 0.62, 5.62, 12.09, 0.9, fill=RGBColor(0xFF, 0xF6, 0xE6), line=None, radius=0.14)
text(s, '赛前不临时加后端：演示稳定性优先；AI 能力以“接口可替换”讲清楚，而不是假装已经上线。',
     0.9, 5.84, 11.6, 0.36, 12, RGBColor(0x7A, 0x4E, 0x00), True)
note(s, '真实模型接入的成本、时延与合规风险已在方案风险表中列出；演示版保留降级路径。')

# ---------------------------------------------------------------- 14 收尾
s = prs.slides.add_slide(BLANK)
bg(s, DARK)
for (cx, cy, d, col) in [(2.2, 6.4, 5.2, RGBColor(0x1E, 0x1B, 0x4A)), (11.6, 1.2, 4.8, RGBColor(0x0E, 0x42, 0x42))]:
    sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - d / 2), Inches(cy - d / 2), Inches(d), Inches(d))
    sh.fill.solid()
    sh.fill.fore_color.rgb = col
    sh.line.fill.background()
    sh.shadow.inherit = False

s.shapes.add_picture(str(ROOT / 'public' / 'app-icon-512.png'), Inches(0.94), Inches(0.82), Inches(0.72), Inches(0.72))
text(s, '校园智能调度平台', 1.8, 0.88, 2.6, 0.36, 15, WHITE, True)
text(s, '把复杂留给系统，\n把简单留给同学。', 0.94, 2.1, 8.4, 1.7, 38, WHITE, True, spacing=1.12)
text(s, '现场演示路径：登录 → 一句话描述 → 确认识别结果 → 查看匹配 → 接收通知',
     0.96, 4.18, 8.6, 0.36, 13, RGBColor(0xD6, 0xD4, 0xEE))
text(s, '4 个场景 · 1 套 AI 能力 · 15 个页面，全部可点、可改、可追踪。',
     0.96, 4.62, 8.6, 0.36, 11, RGBColor(0x9E, 0xA3, 0xC2))

for i, (lab, col) in enumerate([('教室借用', RGBColor(0x8F, 0x87, 0xFF)), ('失物招领', TEAL), ('拼单集市', AMBER), ('校园论坛', CORAL)]):
    chip(s, lab, 0.96 + i * 1.62, 5.4, 1.42, RGBColor(0x25, 0x27, 0x4A), col, 10.5, 0.36)

rect(s, 9.9, 5.15, 2.55, 0.62, fill=BRAND, line=None, radius=0.31)
text(s, '谢谢聆听', 9.9, 5.26, 2.55, 0.4, 14, WHITE, True, PP_ALIGN.CENTER)
text(s, '河南新华电脑学院 · 校园智能调度平台团队 · 2026.10', 0.96, 6.72, 8.0, 0.3, 9, RGBColor(0x7F, 0x84, 0xA4))
footer(s, 14, 14, dark=True)


# ---------------------------------------------------------------- 演讲备注
NOTES = [
    '开场：问候评委。校园智能调度平台解决的是校园里“说一句话就能把事安排明白”的问题——不是再造一个工具，而是给四类高频需求补一个会理解、会匹配、会通知的中间层。',
    '先共情：找教室、找失物、拼单、找同频，四件事都不难，难在信息散、重复问、没人收口。今天不引用未经实测的调研数字，只讲方案设定的四类真实高频场景。',
    '方案一句话：一个入口、四个场景、一条 AI 流水线。四个场景不是四套系统，而是共享“解析→匹配→生成→通知”四步能力。',
    '关键交互：AI 不能黑箱。识别出的场景、置信度、字段全部回显，用户可逐项改；低于 72% 强制人工确认；识别失败也不报错，给四个场景入口。',
    '教室场景：先硬过滤再排序，推荐 2–3 个候选，每条理由可核验。演示时点“一键申请”，能看到预填表单和提交后的状态时间线。',
    '失物场景：丢的人与捡到的人各说一半，AI 用类别、颜色、地点、48 小时时间窗拼起来，给出相似度和理由。联系人默认脱敏，认领要线下核对特征。',
    '拼单场景：把群接龙变成有状态、有进度、会自动提醒的拼单。满员或临近截止自动进消息中心，发起人可以结束或删除。',
    '这一页讲取舍：初版第四场景是社团排班，演示成本高、受众窄；论坛复用同一条 AI 流水线，反而更日常。敢换，是因为场景层只依赖统一接口与设计系统。',
    'AI 能力层：演示版是本地规则引擎，但接口按真实 LLM 对齐——输入一句话，输出场景、置信度、字段与缺失项。低置信度人工确认，超时/失败本地兜底，正式版可平滑替换 GLM/Qwen。',
    '两轮迭代：68%→84%→91%，响应 3.8s→2.3s。改了什么、为什么改、前后指标都留在 AI 使用记录页。这里的数据是演示任务集的模拟数据，不是线上实测。',
    '设计系统：先把品牌色、组件、断点定下来，再并行开发场景页，15 个页面仍然像同一个产品；移动端核心操作不超过 3 步。',
    '工程收尾：纯前端、无后端依赖；构建 0 error、双端巡检 0 异常；一键启动和停止脚本，现场演示不用敲命令。',
    '边界与路线：今天能完整演示，但不假装已经上线。下一步接 FastAPI + SQLite + 真实模型，再下一步做 30+ 用户试点和真实评测。',
    '收尾：把复杂留给系统，把简单留给同学。现场演示路径是登录→一句话→确认→匹配→通知，谢谢大家。',
]
for slide, note in zip(prs.slides, NOTES):
    slide.notes_slide.notes_text_frame.text = note

OUT.parent.mkdir(parents=True, exist_ok=True)
prs.save(OUT)
print('saved', OUT, OUT.stat().st_size)
