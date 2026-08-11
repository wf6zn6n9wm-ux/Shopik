# Сторінка дизайн-системи. Генерується з tokens.json, тому не може
# розійтися ні із застосунком, ні з файлами для розробника.
import io, json

T = json.load(io.open('tokens.json', encoding='utf-8'))
C, G = T['color'], T['geometry']
ICONS = io.open('icons.svg', encoding='utf-8').read().strip()

def swatches(mode):
    out = []
    for k, v in C[mode].items():
        out.append(
          f'<div class="sw"><i style="background:{v["value"]}"></i>'
          f'<div><b>{v["css"]}</b><code>{v["value"]}</code>'
          f'<s>{v["role"]}</s></div></div>')
    return '\n'.join(out)

def contrast_rows(mode):
    out = []
    for x in T['contrast'][mode]:
        r = x['ratio']
        tag = 'AAA' if r >= 7 else 'AA' if r >= 4.5 else 'AA·L' if r >= 3 else '✗'
        cls = 'aaa' if r >= 7 else 'aa' if r >= 4.5 else 'aal' if r >= 3 else 'no'
        out.append(f'<tr><td>{x["role"]}</td><td><code>{x["pair"]}</code></td>'
                   f'<td class="num">{r:.2f}:1</td><td><span class="b {cls}">{tag}</span></td></tr>')
    return '\n'.join(out)

ICON_NAMES = ['fridge','clock','list','chart','more','plus','search','bell','camera','barcode',
 'mic','pencil','chev','back','check','x','trash','snow','gear','sun','moon','auto','users',
 'receipt','wallet','repeat','grid','alert','share','down','spark','cart',
 'milk','cup','cheese','meat','fish','egg','leaf','veg','apple','bread','candy','bottle',
 'jar','box','butter']

def icon_grid():
    return '\n'.join(
      f'<div class="ig"><svg class="i"><use href="#i-{n}"/></svg><span>{n}</span></div>'
      for n in ICON_NAMES)

def type_rows():
    out = []
    for k, v in G['type'].items():
        up = ';text-transform:uppercase' if v.get('uppercase') else ''
        out.append(f'<div class="ty"><span style="font-size:{v["size"]}px;font-weight:{v["weight"]};'
                   f'letter-spacing:{v["tracking"]}em{up}">Свіжий шпинат</span>'
                   f'<code>{k} · {v["size"]}/{v["weight"]} · {v["tracking"]}em</code></div>')
    return '\n'.join(out)

def demo(mode):
    c = C[mode]
    g = lambda k: c[k]['value']
    return f'''<div class="demo" style="background:{g('bg')};color:{g('text')}">
  <div class="dh"><b>Холодильник</b><i style="background:{g('surface')};color:{g('accent')}">
    <svg class="i s20"><use href="#i-bell"/></svg></i></div>
  <div class="dsub" style="color:{g('text2')}">14 позицій</div>
  <div class="dcard" style="background:{g('critBg')};color:{g('crit')};border:0">
    <span class="dg" style="background:rgba(255,255,255,.3)">1</span>
    <div><b>Прострочено</b><s>Фарш яловичий</s></div></div>
  <div class="dcard" style="background:{g('surface')};border:1px solid {g('border')}">
    <span class="dth" style="background:{g('bg2')};color:{g('text2')}">
      <svg class="i s20"><use href="#i-cup"/></svg></span>
    <div><b style="color:{g('text')}">Грецький йогурт</b>
      <s style="color:{g('text2')}">400 г · полиця 2</s></div>
    <em style="color:{g('text2')}">до 14.08</em></div>
  <div class="dcard" style="background:{g('surface')};border:1px solid {g('border')}">
    <span class="dth" style="background:{g('warnBg')};color:{g('warn')}">
      <svg class="i s20"><use href="#i-leaf"/></svg></span>
    <div><b style="color:{g('text')}">Шпинат</b>
      <s style="color:{g('text2')}">1 пачка · ящик</s></div>
    <em class="pill" style="background:{g('warnBg')};color:{g('warn')}">сьогодні</em></div>
  <div class="dchips">
    <span style="background:{g('accent')};color:{g('onAccent')};border-color:{g('accent')}">Усе</span>
    <span style="background:{g('surface')};color:{g('text2')};border-color:{g('border')}">полиця 1</span>
    <span style="background:{g('surface')};color:{g('text2')};border-color:{g('border')}">ящик</span>
  </div>
  <div class="dbtn" style="background:{g('accent')};color:{g('onAccent')}">Додати в холодильник</div>
  <div class="dbtn gh" style="background:{g('surface')};color:{g('text')};border:1px solid {g('border2')}">Скасувати</div>
  <div class="dnav" style="background:{g('bg2')};border-top:1px solid {g('border')}">
    <span style="color:{g('accent')}"><svg class="i s20"><use href="#i-fridge"/></svg>Холодильник</span>
    <span style="color:{g('navOff')}"><svg class="i s20"><use href="#i-clock"/></svg>Скоро</span>
    <span class="fab"><i style="background:{g('accent')};color:{g('onAccent')};border-color:{g('bg')}">
      <svg class="i s28"><use href="#i-plus"/></svg></i></span>
    <span style="color:{g('navOff')}"><svg class="i s20"><use href="#i-cart"/></svg>Список</span>
    <span style="color:{g('navOff')}"><svg class="i s20"><use href="#i-more"/></svg>Ще</span>
  </div>
</div>'''

HTML = f'''<title>Холодильник+ · дизайн-система</title>
<style>
:root{{--pg:#EFEFEC;--pane:#FFFFFF;--ink:#17181B;--mut:#63666B;--ln:#D9DAD6;
  --sh:0 1px 0 rgba(20,22,26,.05), 0 16px 36px -26px rgba(20,22,26,.4)}}
@media (prefers-color-scheme:dark){{ :root:not([data-theme="light"]){{
  --pg:#121317;--pane:#1A1B20;--ink:#E9E9E6;--mut:#8B8E95;--ln:#2B2D33;
  --sh:0 1px 0 rgba(0,0,0,.4), 0 20px 44px -30px #000}} }}
:root[data-theme="dark"]{{--pg:#121317;--pane:#1A1B20;--ink:#E9E9E6;--mut:#8B8E95;
  --ln:#2B2D33;--sh:0 1px 0 rgba(0,0,0,.4), 0 20px 44px -30px #000}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--pg);color:var(--ink);font-size:16px;line-height:1.6;
  font-family:-apple-system,'Segoe UI',ui-sans-serif,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}}
.wrap{{max-width:1120px;margin:0 auto;padding:44px 22px 90px}}
code{{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px}}
h1{{font-size:clamp(28px,5vw,44px);line-height:1.1;letter-spacing:-.03em;margin:0 0 14px;
  text-wrap:balance}}
h2{{font-size:24px;letter-spacing:-.02em;margin:0 0 4px}}
.eyebrow{{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--mut);margin:0 0 12px}}
p{{max-width:66ch}} .mut{{color:var(--mut)}}
section{{margin-top:52px;border-top:1px solid var(--ln);padding-top:26px}}
.two{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:28px;margin-top:22px}}
.pane{{background:var(--pane);border:1px solid var(--ln);border-radius:16px;padding:20px;
  box-shadow:var(--sh)}}
.pane h3{{margin:0 0 14px;font-size:15px;letter-spacing:.02em;text-transform:uppercase;
  color:var(--mut)}}
.sw{{display:flex;gap:12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--ln)}}
.sw:last-child{{border-bottom:0}}
.sw i{{width:34px;height:34px;flex:none;border-radius:9px;border:1px solid rgba(128,128,128,.35)}}
.sw b{{font-family:ui-monospace,monospace;font-size:12.5px;font-weight:600}}
.sw code{{color:var(--mut);margin-left:8px}}
.sw s{{display:block;text-decoration:none;font-size:12.5px;color:var(--mut);line-height:1.35}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}}
td{{padding:7px 6px;border-bottom:1px solid var(--ln);vertical-align:middle}}
td.num{{font-family:ui-monospace,monospace;text-align:right;white-space:nowrap}}
.b{{font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;padding:3px 7px;
  border-radius:999px;white-space:nowrap}}
.b.aaa{{background:#1E7A4A;color:#fff}} .b.aa{{background:#2F855A;color:#fff}}
.b.aal{{background:#B77500;color:#fff}} .b.no{{background:#C0392B;color:#fff}}
.icons{{display:grid;grid-template-columns:repeat(auto-fill,minmax(94px,1fr));gap:6px;margin-top:16px}}
.ig{{display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 4px;
  border:1px solid var(--ln);border-radius:12px;background:var(--pane)}}
.ig span{{font-family:ui-monospace,monospace;font-size:10px;color:var(--mut)}}
.i{{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;display:block}}
.i.s20{{width:20px;height:20px}} .i.s28{{width:28px;height:28px}}
.ty{{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
  padding:11px 0;border-bottom:1px solid var(--ln)}}
.ty code{{color:var(--mut);white-space:nowrap}}
.geo{{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}}
.geo div{{text-align:center}}
.geo i{{display:block;width:74px;height:52px;background:var(--pane);border:2px solid var(--ink)}}
.geo span{{font-family:ui-monospace,monospace;font-size:11px;color:var(--mut)}}

/* макет-зразок: фіксована палітра, бо це знімок теми, а не інтерфейс */
.demo{{border-radius:24px;padding:18px 14px 0;overflow:hidden;
  font-family:-apple-system,'Segoe UI',system-ui,sans-serif;box-shadow:var(--sh)}}
.dh{{display:flex;align-items:center;justify-content:space-between}}
.dh b{{font-size:25px;font-weight:700;letter-spacing:-.022em}}
.dh i{{width:34px;height:34px;border-radius:999px;display:flex;align-items:center;
  justify-content:center;font-style:normal}}
.dsub{{font-size:13.5px;margin:2px 0 14px}}
.dcard{{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:18px;
  margin-bottom:8px}}
.dcard div{{flex:1;min-width:0}}
.dcard b{{display:block;font-size:15.5px;font-weight:650;letter-spacing:-.015em}}
.dcard s{{display:block;font-size:12.5px;text-decoration:none;margin-top:2px}}
.dcard em{{font-style:normal;font-size:12.5px;white-space:nowrap}}
.dcard em.pill{{padding:5px 10px;border-radius:999px;font-size:11.5px;font-weight:700}}
.dg{{width:40px;height:40px;border-radius:999px;display:flex;align-items:center;
  justify-content:center;font-weight:700;flex:none}}
.dth{{width:40px;height:40px;border-radius:13px;display:flex;align-items:center;
  justify-content:center;flex:none}}
.dchips{{display:flex;gap:7px;margin:12px 0}}
.dchips span{{font-size:13px;font-weight:550;padding:8px 14px;border-radius:999px;
  border:1px solid;white-space:nowrap}}
.dbtn{{padding:15px;text-align:center;border-radius:18px;font-size:15.5px;font-weight:650;
  letter-spacing:-.012em;margin-bottom:8px}}
.dnav{{display:flex;align-items:flex-end;justify-content:space-between;margin:16px -14px 0;
  padding:9px 10px 12px}}
.dnav > span{{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;
  font-size:10px;font-weight:600}}
.dnav .fab i{{width:50px;height:50px;border-radius:999px;display:flex;align-items:center;
  justify-content:center;margin-top:-26px;border:4px solid;font-style:normal}}
.dev{{margin-top:22px;display:grid;gap:14px}}
.dev > div{{border-left:3px solid var(--ink);padding-left:15px}}
.dev b{{display:block;font-size:15.5px}}
.dev p{{margin:4px 0 0;font-size:14.5px;color:var(--mut)}}
</style>

{ICONS}

<div class="wrap">
<p class="eyebrow">Холодильник+ · дизайн-система · версія {T['version']}</p>
<h1>Один інтерфейс, дві теми</h1>
<p style="font-size:17px">Світла й темна — це <b>не два дизайни</b>. Структура, розміри,
іконки, відступи й логіка однакові до пікселя; змінюється лише набір кольорів.
Усі значення нижче згенеровані з <code>tokens.json</code> — тим самим файлом,
з якого зібрано застосунок, тому розійтися вони не можуть.</p>

<section>
  <p class="eyebrow">01</p><h2>Кольорові токени</h2>
  <p class="mut">Компонент ніколи не знає, яка тема активна: він звертається до ролі,
  а не до кольору. Щоб перефарбувати весь застосунок, треба змінити ці два стовпці —
  і більше нічого.</p>
  <div class="two">
    <div class="pane"><h3>Світла · blush</h3>{swatches('light')}</div>
    <div class="pane"><h3>Темна · deep navy + aqua</h3>{swatches('dark')}</div>
  </div>
</section>

<section>
  <p class="eyebrow">02</p><h2>Ті самі екрани</h2>
  <p class="mut">Зліва світла, справа темна. Однакові скруглення, однакові відступи,
  однакові іконки, однакові розміри дотику.</p>
  <div class="two">{demo('light')}{demo('dark')}</div>
</section>

<section>
  <p class="eyebrow">03</p><h2>Контраст</h2>
  <p class="mut">Порахований, а не оцінений на око. AA = 4.5:1 для тексту,
  AA·L = 3:1 для великого й напівжирного.</p>
  <div class="two">
    <div class="pane"><h3>Світла</h3><table>{contrast_rows('light')}</table></div>
    <div class="pane"><h3>Темна</h3><table>{contrast_rows('dark')}</table></div>
  </div>
</section>

<section>
  <p class="eyebrow">04</p><h2>Іконки</h2>
  <p class="mut">Один набір на обидві теми: сітка 24, товщина {G['icon']['stroke']},
  круглі кінці, колір успадковується. Тема змінює лише колір — ніколи не форму.
  Розміри: {', '.join(str(x) for x in G['icon']['sizes'])} px.</p>
  <div class="icons">{icon_grid()}</div>
</section>

<section>
  <p class="eyebrow">05</p><h2>Типографіка</h2>
  <p class="mut">Системна гарнітура: на iPhone це справжній SF Pro — саме те, що дає
  відчуття рідного застосунку. Цифри — JetBrains Mono з табличними знаками,
  щоб суми в стовпці не стрибали.</p>
  <div class="pane" style="margin-top:18px">{type_rows()}</div>
</section>

<section>
  <p class="eyebrow">06</p><h2>Геометрія</h2>
  <div class="geo">
    {''.join(f'<div><i style="border-radius:{v}px"></i><span>--r-{k} · {v}px</span></div>'
             for k, v in G['radius'].items() if k != 'full')}
  </div>
  <p class="mut" style="margin-top:18px">Бічне поле {G['spacing']['gutter']} px,
  проміжок між картками {G['spacing']['gap']} px. Найменша зона дотику
  {G['hit']['min']} px, кнопка «+» {G['hit']['fab']} px,
  перемикач {G['hit']['switchW']}×{G['hit']['switchH']} px — розміри Apple HIG.</p>
</section>

<section>
  <p class="eyebrow">07</p><h2>Три відступи від брифу</h2>
  <p class="mut">Кожен — там, де задане значення суперечило іншій вимозі того ж брифу.
  Усі три — це один токен, який ви можете повернути назад одним рядком.</p>
  <div class="dev">
    <div><b>Сірі відтінки світлої теми стали темнішими</b>
      <p>Пункт 3 брифу вимагає не використовувати сірий, який погано читається на рожевому.
      Задані значення давали 2.60:1, 2.13:1 і 2.91:1 — нижче межі. Відтінок лишився тим самим
      рожево-сірим, змінилася лише світлота: <code>#9C949A→#726C70</code>,
      <code>#AFA5AA→#91898D</code>, <code>#8F858A→#6E666A</code>.</p></div>
    <div><b>Знак «+» у темній темі не білий, а темно-смарагдовий</b>
      <p>Білий на бірюзовому <code>#39D0C0</code> дає 1.92:1 — плюс майже зникає.
      <code>#04211F</code> дає 8.82:1. Це токен <code>--on-accent</code>: якщо білий
      усе-таки потрібен, міняється один рядок.</p></div>
    <div><b>Пігулка статусу лишилась тільки в критичних станів</b>
      <p>Зелена пігулка під кожним спокійним продуктом заливала весь екран кольором,
      хоча бриф просить «мінімум візуального шуму». Спокійний термін — просто текст,
      колір є лише там, куди справді треба подивитися.</p></div>
  </div>
</section>

<section>
  <p class="eyebrow">08</p><h2>Для розробника</h2>
  <p class="mut">Три файли з одного джерела: <code>tokens.json</code> (машинний формат),
  <code>tokens.css</code> (готові змінні) і <code>Tokens.swift</code> (SwiftUI).
  Тема стоїть на <code>&lt;html data-t="light|dark"&gt;</code>; значення
  <code>system</code> розвʼязується в коді, тому в розмітці третього стану не існує.</p>
</section>
</div>
'''

io.open('system.html', 'w', encoding='utf-8').write(HTML)
print('system.html · %.0f KB' % (len(HTML) / 1024))
