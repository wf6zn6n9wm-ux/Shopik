/* ══════════════════════════════════════════════════════════════════
   UROK+ · UI-КІТ
   ------------------------------------------------------------------
   Іконки (інлайн-SVG, 1.9px штрих, currentColor) і примітиви, з яких
   зібрані всі екрани. Кожен примітив тонкий: класи живуть у CSS
   дизайн-системи, тут лише поведінка й розмітка.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {AVATAR_COLORS, initials, monthGrid, dow, parseISO, todayISO, addMonths, pad2, toMin, toTime} = window.U;

/* ── іконки ────────────────────────────────────────────────── */
const svg = (d, extra) => ({size = 22, stroke = 1.9, ...rest} = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {d}
    {extra}
  </svg>
);

const Icon = {
  calendar: svg(<><rect x="3" y="4.5" width="18" height="16.5" rx="3.4"/><path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4"/></>),
  calendarCheck: svg(<><rect x="3" y="4.5" width="18" height="16.5" rx="3.4"/><path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4M8.6 14.6l2.4 2.4 4.4-4.6"/></>),
  users: svg(<><path d="M16.5 20v-1.6a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20"/><circle cx="10" cy="7.5" r="3.4"/><path d="M20.5 20v-1.6a4 4 0 0 0-3-3.86M15.5 4.3a3.4 3.4 0 0 1 0 6.5"/></>),
  bag: svg(<><path d="M4 8.5h16l-1.2 11a2.4 2.4 0 0 1-2.4 2.1H7.6a2.4 2.4 0 0 1-2.4-2.1L4 8.5Z"/><path d="M8.6 11V7.2a3.4 3.4 0 0 1 6.8 0V11"/></>),
  user: svg(<><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></>),
  bell: svg(<><path d="M18 8.8a6 6 0 1 0-12 0c0 6-2.2 7.6-2.2 7.6h16.4S18 14.8 18 8.8Z"/><path d="M13.7 20.2a2 2 0 0 1-3.4 0"/></>),
  plus: svg(<path d="M12 5.5v13M5.5 12h13"/>, null),
  minus: svg(<path d="M5.5 12h13"/>, null),
  check: svg(<path d="M4.5 12.6l5 5 10-11"/>, null),
  x: svg(<path d="M6 6l12 12M18 6L6 18"/>, null),
  chevronR: svg(<path d="M9 5l7 7-7 7"/>, null),
  chevronL: svg(<path d="M15 5l-7 7 7 7"/>, null),
  chevronD: svg(<path d="M5 9l7 7 7-7"/>, null),
  arrowL: svg(<><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></>),
  search: svg(<><circle cx="11" cy="11" r="6.6"/><path d="M20 20l-4.2-4.2"/></>),
  clock: svg(<><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 1.8"/></>),
  phone: svg(<path d="M6.2 3.5h3l1.5 3.8-2 1.4a12 12 0 0 0 5.6 5.6l1.4-2 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8A16.4 16.4 0 0 1 4.4 5.5a1.8 1.8 0 0 1 1.8-2Z"/>, null),
  mail: svg(<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.6 7l7.3 5.4a2 2 0 0 0 2.2 0L20.4 7"/></>),
  wallet: svg(<><rect x="3" y="6" width="18" height="13" rx="3.4"/><path d="M3 10h18M16.5 14.5h1.6"/></>),
  cash: svg(<><rect x="2.5" y="6" width="19" height="12" rx="2.6"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.4v5.2M18 9.4v5.2"/></>),
  trash: svg(<><path d="M4 7h16M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6A1.7 1.7 0 0 1 14.5 5.2V7"/><path d="M6.5 7l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/></>),
  edit: svg(<><path d="M4 20h4l10-10a2.6 2.6 0 0 0-3.7-3.7L4.4 16.3 4 20Z"/><path d="M13.5 7.2l3.3 3.3"/></>),
  gear: svg(<><circle cx="12" cy="12" r="3.2"/><path d="M19.6 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.7 6.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"/></>),
  globe: svg(<><circle cx="12" cy="12" r="8.6"/><path d="M3.5 12h17M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2Z"/></>),
  moon: svg(<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4Z"/>, null),
  sun: svg(<><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6"/></>),
  star: svg(<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8L12 3.6Z"/>, null),
  trophy: svg(<><path d="M7 4.5h10v4.2a5 5 0 0 1-10 0V4.5Z"/><path d="M7 6.2H4.6a2.4 2.4 0 0 0 2.4 4M17 6.2h2.4a2.4 2.4 0 0 1-2.4 4M9.6 20.4h4.8M12 13.8v6.6"/></>),
  telegram: svg(<path d="M21 4.6L2.9 11.4c-.9.3-.9 1.5 0 1.8l4.6 1.5 1.8 5c.3.8 1.3 1 1.9.3l2.4-2.6 4.6 3.4c.7.5 1.7.1 1.9-.7L22 5.9c.2-.9-.6-1.6-1-1.3Z"/>, null),
  instagram: svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.9h.01"/></>),
  apple: svg(<path d="M16.2 12.6c0-2.4 2-3.6 2-3.6a4.5 4.5 0 0 0-3.6-1.9c-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9a4.8 4.8 0 0 0-4 2.5c-1.7 3-.5 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.2-1.2 3-2.4a10 10 0 0 0 1.4-2.8s-2.4-1-2.4-4ZM14 5.6A4.3 4.3 0 0 0 15 2.4a4.4 4.4 0 0 0-2.9 1.5 4.1 4.1 0 0 0-1 3.1 3.6 3.6 0 0 0 2.9-1.4Z"/>, null),
  lock: svg(<><rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10"/></>),
  help: svg(<><circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5M12 16.8h.01"/></>),
  doc: svg(<><path d="M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M13 3.6V9h5.2M8.5 13.5h7M8.5 17h5"/></>),
  book: svg(<><path d="M4 4.5h6a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4H4V4.5Z"/><path d="M20 4.5h-6a3 3 0 0 0-3 3v12a2.4 2.4 0 0 1 2.4-2.4H20V4.5Z"/></>),
  share: svg(<><path d="M12 15.5V4M8.4 7.2L12 3.6l3.6 3.6"/><path d="M5 13.5v5.6a1.4 1.4 0 0 0 1.4 1.4h11.2a1.4 1.4 0 0 0 1.4-1.4v-5.6"/></>),
  repeat: svg(<><path d="M4 9.5A4.5 4.5 0 0 1 8.5 5H19"/><path d="M16 2.2L19.4 5 16 7.8M20 14.5a4.5 4.5 0 0 1-4.5 4.5H5"/><path d="M8 21.8L4.6 19 8 16.2"/></>),
  dots: svg(<><circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/></>),
  menu: svg(<path d="M4 7h16M4 12h11M4 17h16"/>, null),
  logout: svg(<><path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5l4.5-4.5-4.5-4.5M20 12H9"/></>),
  chart: svg(<><path d="M4 20V4"/><path d="M4 20h16M8.5 16.5V11M13 16.5V7.5M17.5 16.5v-3.5"/></>),
  gift: svg(<><rect x="3.5" y="9" width="17" height="11.5" rx="2.4"/><path d="M3 13h18M12 9v11.5"/><path d="M12 9S10.6 4.5 8.4 4.5a2.2 2.2 0 0 0 0 4.5H12ZM12 9s1.4-4.5 3.6-4.5a2.2 2.2 0 0 1 0 4.5H12Z"/></>),
  sparkle: svg(<path d="M12 3.4l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9L12 3.4ZM18.6 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>, null),
  crown: svg(<><path d="M3.4 7.6l4 3.4L12 4.6l4.6 6.4 4-3.4-1.7 9.6H5.1L3.4 7.6Z"/><path d="M5.6 20.4h12.8"/></>),
  pin: svg(<><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></>),
  upload: svg(<><path d="M12 20.4V9.4M8.4 13L12 9.4 15.6 13"/><path d="M5 7.6v-3A1.6 1.6 0 0 1 6.6 3h10.8A1.6 1.6 0 0 1 19 4.6v3"/></>),
  download: svg(<><path d="M12 3.6v11M8.4 11L12 14.6 15.6 11"/><path d="M5 16.4v3a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-3"/></>),
  clipboard: svg(<><rect x="4.5" y="4.5" width="15" height="16.5" rx="3"/><path d="M9 4.5a3 3 0 0 1 6 0"/><path d="M8.6 12.4l2 2 4.8-4.8"/></>),
  cake: svg(<><path d="M4 20.5h16v-6a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 14.5v6Z"/><path d="M4 16.4c1.6 1.4 2.9 1.4 4.5 0s2.9-1.4 4.5 0 2.9 1.4 4.5 0M8.4 9V7M12 9V6.4M15.6 9V7"/></>),
};

/* ── дрібні примітиви ──────────────────────────────────────── */
function Avatar({name, color, emoji, photo, size = 44, badge, badgeAt, ring, style}){
  const fs = Math.round(size * 0.38);
  return (
    <div className={'av' + (ring ? ' ring' : '')}
         style={{width: size, height: size, fontSize: emoji ? Math.round(size * 0.5) : fs,
                 background: photo ? `center/cover url(${photo})` : emoji ? 'var(--surface-2)' : (color || 'var(--accent)'),
                 ...style}}>
      {photo ? '' : (emoji || initials(name))}
      {badge ? <i className={'badge' + (badgeAt === 'br' ? ' br' : '')} style={{background: badge}} /> : null}
    </div>
  );
}

/* Три числа в ряд — головний спосіб показати стан справ, не
   змушуючи читати списки. Натискання веде туди, звідки число. */
function Stats({items, two}){
  return (
    <div className={'statgrid' + (two ? ' two' : '')}>
      {items.map((x, i) => {
        const inner = (
          <>
            <div className="k ellip">{x.k}</div>
            <div className={'v num ellip' + (x.tone ? ' ' + x.tone : '')}>{x.v}</div>
          </>
        );
        return x.onClick
          ? <button className="stat" key={i} onClick={x.onClick}>{inner}</button>
          : <div className="stat" key={i}>{inner}</div>;
      })}
    </div>
  );
}

/* Графік доходу: стовпчики й підписи, більше нічого. Висота — від
   найбільшого значення, тому порожній період не малює нічого. */
function Bars({data, activeIndex, onPick, labelOf}){
  const max = Math.max(1, ...data.map(d => d.value));
  const active = activeIndex === undefined ? data.length - 1 : activeIndex;
  return (
    <div>
      <div className="chart">
        {data.map((d, i) => (
          <button className={'col' + (i === active ? ' on' : '')} key={d.key}
                  onClick={onPick ? () => onPick(i, d) : undefined} aria-label={String(d.value)}>
            <span className="bar" style={{height: `${Math.max(4, Math.round(d.value / max * 100))}%`}} />
          </button>
        ))}
      </div>
      <div className="chartx">
        {data.map((d, i) => <span key={d.key} className={i === active ? 'on' : ''}>{labelOf(d, i)}</span>)}
      </div>
    </div>
  );
}

function Btn({kind = 'pri', size, wide, icon, children, loading, ...rest}){
  return (
    <button className={`btn ${kind}${wide ? ' wide' : ''}${size ? ' ' + size : ''}`} {...rest}>
      {loading ? <span className="loader" /> : icon}
      {children}
    </button>
  );
}

function IconBtn({icon, boxed, soft, dot, label, ...rest}){
  return (
    <button className={`iconbtn${boxed ? ' boxed' : ''}${soft ? ' soft' : ''}`} aria-label={label} {...rest}>
      {icon}
      {dot ? <i className="dot" /> : null}
    </button>
  );
}

function Card({pad = true, flat, className = '', children, ...rest}){
  const press = rest.onClick ? ' press' : '';
  return <div className={`card${pad ? ' pad' : ''}${flat ? ' flat' : ''}${press} ${className}`} {...rest}>{children}</div>;
}

function SectionHead({title, action, onAction, tight}){
  return (
    <div className={'sechead' + (tight ? ' tight' : '')}>
      <div className="h2 ellip">{title}</div>
      {action ? <button className="link" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function Row({icon, avatar, title, sub, right, rightSub, rightTone, danger, accent, chevron, className = '', ...rest}){
  return (
    <button className={`row ${className}`} {...rest}>
      {avatar || (icon ? (
        <span style={{width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', flex: 'none',
                      background: accent ? 'var(--accent-soft)' : 'var(--surface-2)',
                      color: danger ? 'var(--neg)' : accent ? 'var(--accent)' : 'var(--ink-2)'}}>{icon}</span>
      ) : null)}
      <span className="ellip" style={{flex: 1}}>
        <span className="nm ellip" style={{display: 'block', color: danger ? 'var(--neg)' : undefined}}>{title}</span>
        {sub ? <span className="ds ellip" style={{display: 'block'}}>{sub}</span> : null}
      </span>
      {right !== undefined && right !== null ? (
        <span className="rt">
          <span className="tm">{right}</span>
          {rightSub ? <span className={'dur' + (rightTone ? ' ' + rightTone : '')} style={{display: 'block'}}>{rightSub}</span> : null}
        </span>
      ) : null}
      {chevron ? <Icon.chevronR size={18} className="chev" /> : null}
    </button>
  );
}

function Field({label, hint, error, children}){
  return (
    <div className="field">
      {label ? <span className="lbl">{label}</span> : null}
      {children}
      {error ? <div className="errtext">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function Input({error, ...rest}){
  return <input className={'inp' + (error ? ' err' : '')} {...rest} />;
}
function TextArea(props){ return <textarea className="inp" {...props} />; }

function Switch({on, onChange, label}){
  return (
    <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={!!on} aria-label={label}
            onClick={() => onChange(!on)}><i /></button>
  );
}

function SwitchRow({title, sub, on, onChange, icon}){
  return (
    <div className="row" style={{cursor: 'default'}}>
      {icon ? (
        <span style={{width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', flex: 'none',
                      background: 'var(--surface-2)', color: 'var(--ink-2)'}}>{icon}</span>
      ) : null}
      <span style={{flex: 1, minWidth: 0}}>
        <span className="nm" style={{display: 'block'}}>{title}</span>
        {sub ? <span className="ds" style={{display: 'block'}}>{sub}</span> : null}
      </span>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

function Segmented({value, onChange, options}){
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={value === o.id}
                className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function Chips({value, onChange, options, multi}){
  const active = id => (multi ? (value || []).includes(id) : value === id);
  const toggle = id => {
    if (!multi) return onChange(id);
    const cur = value || [];
    onChange(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.id} className={'chip' + (active(o.id) ? ' on' : '')} onClick={() => toggle(o.id)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({icon, title, text, action, onAction, secondary, onSecondary}){
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <div className="t">{title}</div>
      {text ? <div className="d">{text}</div> : null}
      {action ? <Btn kind="pri" onClick={onAction} icon={<Icon.plus size={19} />}>{action}</Btn> : null}
      {secondary ? (
        <div style={{marginTop: 10}}><Btn kind="ghost" onClick={onSecondary}>{secondary}</Btn></div>
      ) : null}
    </div>
  );
}

function Sheet({open, onClose, title, children, footer}){
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {title ? <div className="st">{title}</div> : null}
        {children}
        {footer}
      </div>
    </>
  );
}

/* Підтвердження — окремим компонентом, бо window.confirm на iOS
   виглядає чужорідно й блокує анімації. */
function Confirm({open, text, confirmLabel, cancelLabel, danger, onConfirm, onClose}){
  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{fontSize: 16, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.45, padding: '2px 2px 16px'}}>{text}</div>
      <Btn kind={danger ? 'danger' : 'pri'} wide onClick={onConfirm}>{confirmLabel}</Btn>
      <div style={{height: 8}} />
      <Btn kind="ghost" wide onClick={onClose}>{cancelLabel}</Btn>
    </Sheet>
  );
}

/* ── тости ─────────────────────────────────────────────────────
   Один канал на застосунок: черга з одного повідомлення, бо два
   тости одночасно — це вже помилка дизайну.                     */
const toastBus = {
  msg: null, listeners: new Set(), timer: null,
  show(text){
    toastBus.msg = {text, id: Date.now()};
    toastBus.listeners.forEach(l => l(toastBus.msg));
    clearTimeout(toastBus.timer);
    toastBus.timer = setTimeout(() => {
      toastBus.msg = null;
      toastBus.listeners.forEach(l => l(null));
    }, 2400);
  },
  subscribe(fn){ toastBus.listeners.add(fn); return () => toastBus.listeners.delete(fn); },
};
const toast = text => toastBus.show(text);

function Toaster(){
  const [msg, setMsg] = React.useState(toastBus.msg);
  React.useEffect(() => toastBus.subscribe(setMsg), []);
  if (!msg) return null;
  return <div className="toast" role="status">{msg.text}</div>;
}

/* ── вибір дати ────────────────────────────────────────────────
   Власний календар, а не <input type="date">: нативний віджет у
   кожному браузері свій і ламає темну тему.                     */
function DatePickerSheet({open, value, onPick, onClose, t, min, max, title}){
  const [cursor, setCursor] = React.useState(value || todayISO());
  React.useEffect(() => { if (open) setCursor(value || todayISO()); }, [open, value]);
  const grid = monthGrid(cursor);
  const cur = cursor.slice(0, 7);
  const d = parseISO(cursor);
  return (
    <Sheet open={open} onClose={onClose} title={title || t('d.date')}>
      <div style={{display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px'}}>
        <IconBtn icon={<Icon.chevronL size={20} />} onClick={() => setCursor(addMonths(cursor, -1))} label={t('a.back')} />
        <div className="dsp" style={{flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 16}}>
          {t.cal.monthNom[d.getMonth()]} {d.getFullYear()}
        </div>
        <IconBtn icon={<Icon.chevronR size={20} />} onClick={() => setCursor(addMonths(cursor, 1))} label={t('a.next')} />
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6}}>
        {t.cal.dowShort.map(w => (
          <div key={w} style={{textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)'}}>{w}</div>
        ))}
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4}}>
        {grid.map(day => {
          const other = day.slice(0, 7) !== cur;
          const off = (min && day < min) || (max && day > max);
          const on = day === value;
          return (
            <button key={day} disabled={off}
                    onClick={() => { onPick(day); onClose(); }}
                    style={{height: 42, borderRadius: 12, fontWeight: 700, fontSize: 14.5,
                            fontFamily: "'Onest',sans-serif", letterSpacing: '-.03em',
                            background: on ? 'var(--accent)' : 'transparent',
                            color: on ? 'var(--accent-ink)' : off ? 'var(--ink-4)' : other ? 'var(--ink-3)' : 'var(--ink)',
                            opacity: off ? .45 : 1,
                            outline: !on && day === todayISO() ? '1.5px solid var(--accent-soft-2)' : 'none'}}>
              {parseISO(day).getDate()}
            </button>
          );
        })}
      </div>
      <div style={{height: 10}} />
    </Sheet>
  );
}

/* ── вибір часу ────────────────────────────────────────────────
   Список із кроком 15 хвилин: швидше за колесо й не потребує
   жестів, яких на вебі немає.                                   */
function TimePickerSheet({open, value, onPick, onClose, t, title, from = 6 * 60, to = 23 * 60 + 45, step = 15}){
  const times = [];
  for (let m = from; m <= to; m += step) times.push(toTime(m));
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current.querySelector('[data-on="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({block: 'center'});
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={title || t('d.time')}>
      <div ref={ref} style={{maxHeight: '52vh', overflow: 'auto', margin: '4px -4px 0', padding: '0 4px'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7}}>
          {times.map(tm => (
            <button key={tm} data-on={tm === value ? '1' : '0'} onClick={() => { onPick(tm); onClose(); }}
                    style={{height: 46, borderRadius: 12, fontFamily: "'Onest',sans-serif", fontWeight: 700, fontSize: 15,
                            letterSpacing: '-.03em',
                            background: tm === value ? 'var(--accent)' : 'var(--surface-2)',
                            color: tm === value ? 'var(--accent-ink)' : 'var(--ink)'}}>{tm}</button>
          ))}
        </div>
      </div>
      <div style={{height: 10}} />
    </Sheet>
  );
}

/* Поле-кнопка: виглядає як input, відкриває шторку. */
function PickerField({label, value, placeholder, icon, onClick, hint}){
  return (
    <Field label={label} hint={hint}>
      <button className="inp" onClick={onClick}
              style={{display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left'}}>
        {icon ? <span style={{color: 'var(--ink-3)', display: 'flex'}}>{icon}</span> : null}
        <span className="ellip" style={{flex: 1, color: value ? 'var(--ink)' : 'var(--ink-3)', fontWeight: value ? 700 : 500}}>
          {value || placeholder}
        </span>
        <Icon.chevronD size={18} style={{color: 'var(--ink-3)', flex: 'none'}} />
      </button>
    </Field>
  );
}

function Stepper({value, onChange, step = 50, min = 0, max = 100000, format}){
  return (
    <div className="stepper">
      <button className="sbtn" onClick={() => onChange(Math.max(min, value - step))} aria-label="−"><Icon.minus size={18} /></button>
      <div className="inp dsp" style={{flex: 1, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800}}>
        {format ? format(value) : value}
      </div>
      <button className="sbtn" onClick={() => onChange(Math.min(max, value + step))} aria-label="+"><Icon.plus size={18} /></button>
    </div>
  );
}

function AppBar({title, sub, left, right, brand, big}){
  return (
    <div className="appbar">
      {left}
      <div className="grow ellip">
        {brand ? <div className="brand">Urok<i>+</i></div>
               : <><div className="title ellip">{title}</div>{sub ? <div className="sub ellip">{sub}</div> : null}</>}
      </div>
      {right}
    </div>
  );
}

/* Заголовок екрана-стека: стрілка назад + назва + дія праворуч. */
function StackBar({title, onBack, right, t}){
  return (
    <AppBar title={title}
            left={<IconBtn icon={<Icon.arrowL size={21} />} onClick={onBack} label={t ? t('a.back') : 'Back'} />}
            right={right} />
  );
}

Object.assign(window.U, {
  Icon, Avatar, Stats, Bars, Btn, IconBtn, Card, SectionHead, Row, Field, Input, TextArea, Switch, SwitchRow,
  Segmented, Chips, Empty, Sheet, Confirm, toast, Toaster, toastBus,
  DatePickerSheet, TimePickerSheet, PickerField, Stepper, AppBar, StackBar,
});
})();
