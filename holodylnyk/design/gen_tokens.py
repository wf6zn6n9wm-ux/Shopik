# Одне джерело правди для токенів. Із нього генеруються JSON, CSS і Swift,
# щоб три файли не могли розійтися між собою.
import io, json

MODE = {
 'light': {
  'bg':'#F3E5E5','bg2':'#F7EBEB','surface':'#F9EEEE','surface2':'#FCEFF0',
  'border':'#E8D5D7','border2':'#DFC8CB',
  'text':'#242126','text2':'#6F6870','text3':'#726C70','textPlaceholder':'#91898D',
  'accent':'#E83D72','accentPressed':'#D83265','accentLight':'#F5A6BD',
  'accentSoft':'#F9DCE5','onAccent':'#FFFFFF',
  'ok':'#2C7A50','okBg':'#DCEEE2','warn':'#9A560E','warnBg':'#FBE6CC',
  'crit':'#B22334','critBg':'#FBDBDD','navOff':'#6E666A',
 },
 'dark': {
  'bg':'#080D13','bg2':'#0B1118','surface':'#0E171E','surface2':'#122027',
  'border':'#1C343B','border2':'#24424A',
  'text':'#F4F7F7','text2':'#AAB8BB','text3':'#718185','textPlaceholder':'#617074',
  'accent':'#39D0C0','accentPressed':'#249E95','accentLight':'#45E1D0',
  'accentSoft':'#123A3B','onAccent':'#04211F',
  'ok':'#5FE0B4','okBg':'#0F2E2A','warn':'#F0B44E','warnBg':'#31250F',
  'crit':'#FF7A85','critBg':'#33161A','navOff':'#718185',
 },
}
# Імена в CSS відрізняються від camelCase у Swift — тримаємо мапу явно.
CSSNAME = {
 'bg':'bg','bg2':'bg-2','surface':'surface','surface2':'surface-2',
 'border':'border','border2':'border-2','text':'text','text2':'text-2','text3':'text-3',
 'textPlaceholder':'text-ph','accent':'accent','accentPressed':'accent-press',
 'accentLight':'accent-light','accentSoft':'accent-soft','onAccent':'on-accent',
 'ok':'ok','okBg':'ok-bg','warn':'warn','warnBg':'warn-bg','crit':'crit','critBg':'crit-bg',
 'navOff':'nav-off',
}
ROLE = {
 'bg':'тло екрана','bg2':'друге тло: шапка, панель навігації','surface':'картка',
 'surface2':'піднята картка, поле вводу','border':'волосяна межа картки',
 'border2':'помітніша межа: контурні кнопки, вимкнений перемикач',
 'text':'заголовки й назви','text2':'підписи під назвою','text3':'мітки секцій',
 'textPlaceholder':'плейсхолдер поля','accent':'кнопки, активна вкладка, FAB, вибране',
 'accentPressed':'натиснутий стан акценту','accentLight':'смуги графіків, посилання на темному',
 'accentSoft':'тло під акцентом: бейдж іконки, підсвітка фокуса',
 'onAccent':'текст і знаки поверх акценту',
 'ok':'свіжий продукт','okBg':'тло статусу «свіжий»',
 'warn':'скоро закінчиться','warnBg':'тло статусу «скоро»',
 'crit':'прострочено','critBg':'тло статусу «прострочено»',
 'navOff':'неактивна вкладка',
}
GEOM = {
 'radius':{'xs':10,'sm':14,'md':18,'lg':22,'xl':28,'full':999},
 'spacing':{'gutter':20,'gap':8,'sectionTop':22,'cardPadY':14,'cardPadX':16},
 'type':{'title':{'size':28,'weight':700,'tracking':-0.022},
         'name':{'size':16,'weight':600,'tracking':-0.012},
         'body':{'size':15,'weight':400,'tracking':0},
         'caption':{'size':12.5,'weight':400,'tracking':0},
         'label':{'size':12,'weight':600,'tracking':0.04,'uppercase':True},
         'stat':{'size':24,'weight':700,'tracking':-0.025},
         'nav':{'size':10.5,'weight':600,'tracking':-0.005}},
 'icon':{'stroke':2,'sizes':[18,20,24,28]},
 'hit':{'min':44,'fab':54,'switchW':51,'switchH':31},
}

# ── контраст ────────────────────────────────────────────────────────
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True); return round((l1+0.05)/(l2+0.05),2)

PAIRS = [('text','bg','назва на тлі'),('text','surface','назва на картці'),
 ('text2','surface','підпис на картці'),('text3','bg','мітка секції'),
 ('textPlaceholder','surface2','плейсхолдер'),('accent','bg','акцент на тлі'),
 ('onAccent','accent','текст на акценті'),('navOff','bg2','неактивна вкладка'),
 ('ok','okBg','статус «свіжий»'),('warn','warnBg','статус «скоро»'),
 ('crit','critBg','статус «прострочено»')]

contrast = {m: [{'pair':f'{a} на {b}','role':r,
                 'ratio':cr(MODE[m][a],MODE[m][b])} for a,b,r in PAIRS] for m in MODE}

# ── JSON ────────────────────────────────────────────────────────────
data = {'name':'Холодильник+ · design tokens','version':'1.0.0',
        'color':{m:{k:{'value':v,'role':ROLE[k],'css':'--'+CSSNAME[k]}
                    for k,v in MODE[m].items()} for m in MODE},
        'geometry':GEOM,'contrast':contrast,
        'themeModes':['system','light','dark'],
        'note':'Тема стоїть на <html data-t="light|dark">. Значення system '
               'розвʼязується в коді у light або dark — третього стану в розмітці немає.'}
io.open('tokens.json','w',encoding='utf-8').write(json.dumps(data,ensure_ascii=False,indent=2))

# ── CSS ─────────────────────────────────────────────────────────────
def block(m, ind='  '):
    return '\n'.join(f'{ind}--{CSSNAME[k]}:{v};{" "*max(1,22-len(CSSNAME[k])-len(v))}/* {ROLE[k]} */'
                     for k,v in MODE[m].items())
g = GEOM['radius']; sp = GEOM['spacing']
css = f"""/* Холодильник+ · design tokens 1.0.0
   Згенеровано з tokens.json. Правити тут — правити в одному місці.
   Тема: <html data-t="light"> або <html data-t="dark">.
   Значення «system» розвʼязується в коді, у розмітці його не існує. */

:root{{
{block('light')}

  /* геометрія — спільна для обох тем */
  --r-xs:{g['xs']}px; --r-sm:{g['sm']}px; --r-md:{g['md']}px;
  --r-lg:{g['lg']}px; --r-xl:{g['xl']}px; --r-full:{g['full']}px;
  --gut:{sp['gutter']}px; --gap:{sp['gap']}px;
}}

@media (prefers-color-scheme:dark){{ :root:not([data-t="light"]){{
{block('dark','  ')}
}} }}

:root[data-t="dark"]{{
{block('dark','  ')}
}}
"""
io.open('tokens.css','w',encoding='utf-8').write(css)

# ── Swift ───────────────────────────────────────────────────────────
def swift_block(m):
    return '\n'.join(f'        case .{m}: return Color(hex: "{MODE[m][k]}")' for k in [k])
keys = list(MODE['light'].keys())
sw = ['''// Холодильник+ · design tokens 1.0.0
// Згенеровано з tokens.json — не правити руками.
import SwiftUI

public enum AppTheme { case light, dark }

public extension Color {
    init(hex: String) {
        let s = hex.dropFirst()
        let v = UInt32(s, radix: 16) ?? 0
        self.init(.sRGB,
                  red:   Double((v >> 16) & 0xFF) / 255,
                  green: Double((v >>  8) & 0xFF) / 255,
                  blue:  Double( v        & 0xFF) / 255,
                  opacity: 1)
    }
}

public struct Tokens {
    public let theme: AppTheme
    public init(_ theme: AppTheme) { self.theme = theme }
    private func c(_ l: String, _ d: String) -> Color {
        Color(hex: theme == .dark ? d : l)
    }
''']
for k in keys:
    sw.append(f'    /// {ROLE[k]}\n    public var {k}: Color '
              f'{{ c("{MODE["light"][k]}", "{MODE["dark"][k]}") }}')
sw.append('''
    // геометрія — однакова в обох темах
    public let rXS: CGFloat = %d
    public let rSM: CGFloat = %d
    public let rMD: CGFloat = %d
    public let rLG: CGFloat = %d
    public let rXL: CGFloat = %d
    public let gutter: CGFloat = %d
    public let gap: CGFloat = %d
    public let iconStroke: CGFloat = %d
    public let minHit: CGFloat = %d
    public let fabSize: CGFloat = %d
}''' % (g['xs'],g['sm'],g['md'],g['lg'],g['xl'],sp['gutter'],sp['gap'],
        GEOM['icon']['stroke'],GEOM['hit']['min'],GEOM['hit']['fab']))
io.open('Tokens.swift','w',encoding='utf-8').write('\n'.join(sw)+'\n')

print('tokens.json · tokens.css · Tokens.swift — згенеровано')
worst = {m: min(x['ratio'] for x in contrast[m]) for m in contrast}
print('найгірший контраст: світла %.2f · темна %.2f' % (worst['light'], worst['dark']))
