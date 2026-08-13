/* ══════════════════════════════════════════════════════════════════
   UROK+ · КАЛЕНДАР
   ------------------------------------------------------------------
   Головний екран. Порядок читання зверху вниз відповідає порядку
   питань викладача: який сьогодні день → що на тижні → що зараз →
   скільки заробив. Нічого більше на екрані немає.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Empty, Sheet, Segmented, AppBar,
  A, sel, store, toast,
  todayISO, addDays, weekDays, dow, parseISO, monthGrid, startOfMonth, addMonths,
  fmtLongDate, fmtDayMonth, fmtRelDate, fmtMoney, fmtDur, duration, toMin,
} = window.U;

/* Крапка статусу біля аватара: колір учня — не про статус, тому
   стан заняття показуємо окремою крапкою, як у референсі. */
const statusColor = l => (l.status === 'done' ? 'var(--pos)' : l.status === 'canceled' ? 'var(--neg)' : 'var(--warn)');

function LessonRow({lesson, s, t, onClick}){
  const students = sel.studentsOf(s, lesson);
  const first = students[0];
  const group = students.length > 1;
  const title = group ? t('lesson.groupOf', {count: students.length}) : (first ? first.name : t('lesson.one'));
  const sub = lesson.subject || (first && first.subject) || '';
  const mins = duration(lesson.start, lesson.end);
  return (
    <button className={'row' + (lesson.status === 'done' ? ' done' : lesson.status === 'canceled' ? ' cancel' : '')}
            onClick={onClick}>
      {group ? (
        <span style={{display: 'flex', flex: 'none'}}>
          {students.slice(0, 3).map((st, i) => (
            <span key={st.id} style={{marginLeft: i ? -14 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)'}}>
              <Avatar name={st.name} color={st.color} emoji={st.emoji} size={40} />
            </span>
          ))}
        </span>
      ) : (
        <Avatar name={first ? first.name : '?'} color={first ? first.color : 'var(--ink-3)'}
                emoji={first && first.emoji} size={40} badge={statusColor(lesson)} />
      )}
      <span className="ellip" style={{flex: 1}}>
        <span className="nm ellip" style={{display: 'block'}}>{title}</span>
        <span className="ds ellip" style={{display: 'block'}}>
          {sub}{lesson.seriesId ? ' · ' + t('rep.seriesBadge') : ''}
        </span>
      </span>
      <span className="rt">
        <span className="tm">{lesson.start}</span>
        <span className="dur" style={{display: 'block'}}>{fmtDur(t, mins)}</span>
      </span>
    </button>
  );
}

/* ── смуга тижня ───────────────────────────────────────────── */
function WeekStrip({t, s, date, onPick}){
  const days = weekDays(date);
  const today = todayISO();
  return (
    <div className="week">
      {days.map((d, i) => {
        const count = s.lessons.filter(l => l.date === d && l.status !== 'canceled').length;
        const weekend = i >= 5;
        return (
          <button key={d} onClick={() => onPick(d)}
                  className={'day' + (d === date ? ' on' : '') + (d === today ? ' today' : '') + (weekend && d !== date ? ' off' : '')}>
            <div className="dw">{t.cal.dowShort[i]}</div>
            <div className="dn">{parseISO(d).getDate()}</div>
            <div className="pips">
              {Array.from({length: Math.min(count, 3)}, (_, k) => <i key={k} />)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── місяць ────────────────────────────────────────────────── */
function MonthGrid({t, s, date, onPick}){
  const [cursor, setCursor] = React.useState(startOfMonth(date));
  React.useEffect(() => setCursor(startOfMonth(date)), [date]);
  const grid = monthGrid(cursor);
  const cur = cursor.slice(0, 7);
  const md = parseISO(cursor);
  return (
    <div style={{marginTop: 14}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8}}>
        <IconBtn icon={<Icon.chevronL size={19} />} onClick={() => setCursor(addMonths(cursor, -1))} label={t('a.back')} />
        <div className="dsp" style={{flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 15.5}}>
          {t.cal.monthNom[md.getMonth()]} {md.getFullYear()}
        </div>
        <IconBtn icon={<Icon.chevronR size={19} />} onClick={() => setCursor(addMonths(cursor, 1))} label={t('a.next')} />
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4}}>
        {t.cal.dowShort.map(w => (
          <div key={w} style={{textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)'}}>{w}</div>
        ))}
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3}}>
        {grid.map(d => {
          const count = s.lessons.filter(l => l.date === d && l.status !== 'canceled').length;
          const on = d === date, other = d.slice(0, 7) !== cur;
          return (
            <button key={d} onClick={() => onPick(d)}
                    style={{height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', gap: 2,
                            background: on ? 'var(--accent)' : 'transparent',
                            color: on ? 'var(--accent-ink)' : other ? 'var(--ink-4)' : 'var(--ink)',
                            outline: !on && d === todayISO() ? '1.5px solid var(--accent-soft-2)' : 'none'}}>
              <span className="dsp" style={{fontWeight: 800, fontSize: 14.5}}>{parseISO(d).getDate()}</span>
              <span style={{display: 'flex', gap: 2, height: 4}}>
                {Array.from({length: Math.min(count, 3)}, (_, k) => (
                  <i key={k} style={{width: 4, height: 4, borderRadius: '50%',
                                     background: on ? '#fff' : 'var(--accent)', opacity: on ? .9 : .6}} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── сповіщення ────────────────────────────────────────────────
   Не окремий екран: список коротких подій, які й так є в даних —
   найближче заняття, борги, день народження учня.               */
function buildNotifications(s, t){
  const out = [];
  const today = todayISO();
  const next = s.lessons
    .filter(l => l.status === 'planned' && (l.date > today || (l.date === today)))
    .sort(window.U.byTime)[0];
  if (next){
    const who = sel.studentsOf(s, next);
    out.push({
      id: 'next', icon: <Icon.clock size={19} />,
      title: `${fmtRelDate(t, next.date)}, ${next.start}`,
      sub: who.length ? who.map(x => x.name).join(', ') : t('lesson.one'),
    });
  }
  const unpaid = sel.unpaidLessons(s);
  if (unpaid.length){
    const sum = unpaid.reduce((a, l) => a + l.price * Math.max(1, l.studentIds.length), 0);
    out.push({
      id: 'debt', icon: <Icon.wallet size={19} />, accent: true,
      title: `${t('st.debt')}: ${fmtMoney(sum, s.settings.currency)}`,
      sub: t.plural('lesson', unpaid.length),
    });
  }
  s.students.filter(x => !x.archived && x.birthday).forEach(st => {
    const [, m, d] = st.birthday.split('-');
    if (!m || !d) return;
    const thisYear = `${today.slice(0, 4)}-${m}-${d}`;
    const diff = window.U.diffDays(today, thisYear);
    if (diff >= 0 && diff <= 14){
      out.push({
        id: 'bd_' + st.id, icon: <Icon.cake size={19} />,
        title: st.name, sub: t('st.birthdaySoon', {date: fmtDayMonth(t, thisYear)}),
      });
    }
  });
  return out;
}

function NotificationsSheet({open, onClose, t, s}){
  const items = buildNotifications(s, t);
  return (
    <Sheet open={open} onClose={onClose} title={t('cal.notifications')}>
      {items.length ? (
        <div className="rows" style={{marginTop: 6}}>
          {items.map(n => <Row key={n.id} icon={n.icon} accent={n.accent} title={n.title} sub={n.sub} />)}
        </div>
      ) : (
        <Empty icon={<Icon.bell size={34} />} title={t('cal.noNotifications')} text={t('cal.noNotificationsD')} />
      )}
      <div style={{height: 10}} />
    </Sheet>
  );
}

/* ── екран ─────────────────────────────────────────────────── */
function CalendarScreen({t, s, nav}){
  const [date, setDate] = React.useState(todayISO());
  const [view, setView] = React.useState('week');
  const [notif, setNotif] = React.useState(false);

  const lessons = sel.lessonsOn(s, date).filter(l => l.status !== 'canceled');
  const canceled = sel.lessonsOn(s, date).filter(l => l.status === 'canceled');
  const income = sel.incomeOn(s, date);
  const isToday = date === todayISO();
  const notifCount = buildNotifications(s, t).length;

  return (
    <div className="app tabs">
      <AppBar brand
              left={<IconBtn icon={<Icon.menu size={22} />} label={t('a.more')} onClick={() => nav.go('profile')} />}
              right={<IconBtn icon={<Icon.bell size={21} />} dot={notifCount > 0} label={t('cal.notifications')}
                              onClick={() => setNotif(true)} />} />

      <div className="screen">
        {/* hero: який сьогодні день */}
        <button className="hero press" style={{width: '100%', textAlign: 'left'}}
                onClick={() => setDate(todayISO())}>
          <div style={{position: 'relative', zIndex: 1}}>
            <div className="ttl">{isToday ? t('d.today') : fmtRelDate(t, date)}</div>
            <div className="sub">{fmtLongDate(t, date)}</div>
          </div>
          <div className="art">
            <Icon.calendarCheck size={62} stroke={1.5} />
          </div>
        </button>

        {/* тиждень / місяць */}
        {view === 'week'
          ? <WeekStrip t={t} s={s} date={date} onPick={setDate} />
          : <MonthGrid t={t} s={s} date={date} onPick={setDate} />}

        <div style={{marginTop: 12}}>
          <Segmented value={view} onChange={setView}
                     options={[{id: 'week', label: t('cal.weekView')}, {id: 'month', label: t('cal.monthView')}]} />
        </div>

        {/* заняття дня */}
        <SectionHead title={isToday ? t('cal.todayLessons') : t('cal.dayLessons')}
                     action={lessons.length ? t.plural('lesson', lessons.length) : null} />
        {lessons.length ? (
          <div className="rows">
            {lessons.map(l => (
              <LessonRow key={l.id} lesson={l} s={s} t={t}
                         onClick={() => nav.push({name: 'lesson', params: {id: l.id}})} />
            ))}
            {canceled.map(l => (
              <LessonRow key={l.id} lesson={l} s={s} t={t}
                         onClick={() => nav.push({name: 'lesson', params: {id: l.id}})} />
            ))}
          </div>
        ) : (
          <Empty icon={<Icon.calendar size={34} />} title={t('cal.noLessons')} text={t('cal.noLessonsD')}
                 action={t('cal.addLesson')}
                 onAction={() => nav.push({name: 'lesson-new', params: {date}})} />
        )}

        {/* гроші */}
        <div className="money" style={{marginTop: 22}}>
          <div style={{minWidth: 0}}>
            <div className="k">{isToday ? t('cal.incomeToday') : t('cal.incomeDay')}</div>
            <div className="v num ellip">{fmtMoney(income, s.settings.currency)}</div>
          </div>
          <button className="fab" aria-label={t('cal.addLesson')}
                  onClick={() => nav.push({name: 'lesson-new', params: {date}})}>
            <Icon.plus size={26} stroke={2.4} />
          </button>
        </div>
      </div>

      <NotificationsSheet open={notif} onClose={() => setNotif(false)} t={t} s={s} />
    </div>
  );
}

Object.assign(window.U, {CalendarScreen, WeekStrip, MonthGrid, LessonRow, NotificationsSheet, buildNotifications, statusColor});
})();
