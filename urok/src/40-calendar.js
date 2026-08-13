/* ══════════════════════════════════════════════════════════════════
   UROK+ · ГОЛОВНИЙ ЕКРАН
   ------------------------------------------------------------------
   Календар і водночас щоденний зріз усієї CRM. Порядок читання
   зверху вниз відповідає порядку питань викладача, коли він
   відкриває застосунок зранку:

     який сьогодні день → що на тижні → хто прийде сьогодні →
     скільки я заробив → що з домашніми завданнями → як місяць.

   Кожен блок нижче першого екрана з'являється, лише коли йому є що
   сказати: порожній розділ «Домашні завдання» — це шум, а не
   інформація.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Empty, Sheet, Segmented, Stats, AppBar,
  A, sel, store, toast, HomeworkRow, dueLabel,
  todayISO, addDays, weekDays, dow, diffDays, parseISO, monthGrid, startOfMonth, addMonths,
  fmtLongDate, fmtDayMonth, fmtRelDate, fmtMoney, fmtDur, duration, toMin, lessonTotal, lessonPrice,
} = window.U;

/* Крапка статусу біля аватара: колір учня — не про статус, тому
   стан заняття показуємо окремою крапкою, як у референсі. */
const statusColor = l => (l.status === 'done' ? 'var(--pos)'
  : l.status === 'canceled' ? 'var(--ink-4)'
  : l.status === 'missed' ? 'var(--neg)' : 'var(--warn)');

/* Рядок заняття. Аватар — окрема кнопка: найчастіший наступний крок
   після «хто прийде» — це «відкрити картку цієї людини», і робити
   заради нього два переходи безглуздо. */
function LessonRow({lesson, s, t, onClick, onStudent}){
  const students = sel.studentsOf(s, lesson);
  const first = students[0];
  const group = students.length > 1;
  const title = group
    ? (lesson.subject || t('lesson.group'))
    : (first ? first.name : t('lesson.one'));
  const sub = group
    ? t('lesson.groupOf', {count: students.length})
    : (lesson.subject || (first && first.subject) || '');
  const mins = duration(lesson.start, lesson.end);
  const paid = sel.isLessonPaid(s, lesson);

  return (
    <div className={'row' + (lesson.status === 'done' ? ' done' : '')
                    + (lesson.status === 'canceled' ? ' cancel' : '')}>
      {group ? (
        <button style={{display: 'flex', flex: 'none'}} aria-label={t('lesson.students')} onClick={onClick}>
          {students.slice(0, 3).map((st, i) => (
            <span key={st.id} style={{marginLeft: i ? -14 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)'}}>
              <Avatar name={st.name} color={st.color} emoji={st.emoji} photo={st.photo} size={40} />
            </span>
          ))}
        </button>
      ) : (
        <button style={{flex: 'none', display: 'flex'}} aria-label={first ? first.name : ''}
                onClick={() => (first && onStudent ? onStudent(first) : onClick())}>
          <Avatar name={first ? first.name : '?'} color={first ? first.color : 'var(--ink-3)'}
                  emoji={first && first.emoji} photo={first && first.photo} size={40}
                  badge={statusColor(lesson)} />
        </button>
      )}
      <button className="ellip" style={{flex: 1, textAlign: 'left', minWidth: 0}} onClick={onClick}>
        <span className="nm ellip" style={{display: 'block'}}>{title}</span>
        <span className="ds ellip" style={{display: 'block'}}>
          {[sub, lesson.seriesId ? t('rep.seriesBadge') : '', lesson.status === 'missed' ? t('lesson.missed') : '']
            .filter(Boolean).join(' · ')}
        </span>
      </button>
      <button className="rt" onClick={onClick} aria-label={lesson.start}>
        <span className="tm">{lesson.start}</span>
        <span className={'dur' + (lesson.status === 'done' && !paid ? ' neg' : '')} style={{display: 'block'}}>
          {lesson.status === 'done' ? (paid ? t('lesson.paid') : t('lesson.unpaid')) : fmtDur(t, mins)}
        </span>
      </button>
    </div>
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
   Не окремий канал, а те саме, що вже є в даних, показане як
   короткі події: найближче заняття, дедлайни, борги. Кожен рядок
   веде туди, де з ним можна щось зробити.                       */
function buildNotifications(s, t){
  const out = [];
  const today = todayISO();
  const on = s.settings.notifications || {};

  if (on.lesson !== false){
    const next = sel.nextLesson(s);
    if (next){
      const who = sel.studentsOf(s, next);
      const names = who.map(x => x.name).join(', ');
      const minsLeft = next.date === today
        ? toMin(next.start) - (new Date().getHours() * 60 + new Date().getMinutes())
        : null;
      out.push({
        id: 'next', icon: <Icon.clock size={19} />, accent: true,
        title: minsLeft !== null && minsLeft > 0 && minsLeft <= 120
          ? t('notif.lessonSoon', {min: minsLeft, name: names || t('lesson.one')})
          : t('notif.lessonNext', {when: `${fmtRelDate(t, next.date)}, ${next.start}`}),
        sub: names || t('lesson.one'),
        route: {name: 'lesson', params: {id: next.id}},
      });
    }
  }

  if (on.homework !== false){
    sel.homeworkOverdue(s).slice(0, 3).forEach(h => {
      out.push({
        id: 'hwo_' + h.id, icon: <Icon.clipboard size={19} />,
        title: t('notif.homeworkOverdue', {name: h.title}),
        sub: h.studentIds.map(id => (sel.student(s, id) || {}).name).filter(Boolean).join(', '),
        route: {name: 'homework', params: {id: h.id}},
      });
    });
    const tomorrow = addDays(today, 1);
    sel.homeworkActive(s).filter(h => h.dueDate === tomorrow).slice(0, 3).forEach(h => {
      const names = h.studentIds.map(id => (sel.student(s, id) || {}).name).filter(Boolean).join(', ');
      out.push({
        id: 'hwd_' + h.id, icon: <Icon.clipboard size={19} />,
        title: t('notif.homeworkDue', {name: names || t('st.title')}),
        sub: h.title,
        route: {name: 'homework', params: {id: h.id}},
      });
    });
    const check = sel.homeworkToCheck(s);
    if (check.length) out.push({
      id: 'hwc', icon: <Icon.clipboard size={19} />, accent: true,
      title: t('notif.homeworkCheck'),
      sub: t('hw.needCheck', {n: check.length}),
      route: {name: 'homework'},
    });
  }

  if (on.payment !== false){
    sel.debtors(s).slice(0, 4).forEach(x => {
      out.push({
        id: 'debt_' + x.student.id, icon: <Icon.wallet size={19} />,
        title: t('notif.debt', {name: x.student.name, sum: fmtMoney(x.debt, s.settings.currency)}),
        sub: t.plural('lesson', x.unpaid.length),
        route: {name: 'student', params: {id: x.student.id}},
      });
    });
  }

  s.students.filter(x => !x.archived && x.birthday).forEach(st => {
    const [, m, d] = st.birthday.split('-');
    if (!m || !d) return;
    const thisYear = `${today.slice(0, 4)}-${m}-${d}`;
    const diff = diffDays(today, thisYear);
    if (diff >= 0 && diff <= 14){
      out.push({
        id: 'bd_' + st.id, icon: <Icon.cake size={19} />,
        title: st.name, sub: t('st.birthdaySoon', {date: fmtDayMonth(t, thisYear)}),
        route: {name: 'student', params: {id: st.id}},
      });
    }
  });
  return out;
}

function NotificationsSheet({open, onClose, t, s, nav}){
  const items = buildNotifications(s, t);
  return (
    <Sheet open={open} onClose={onClose} title={t('cal.notifications')}>
      {items.length ? (
        <div className="rows" style={{marginTop: 6}}>
          {items.map(n => (
            <Row key={n.id} icon={n.icon} accent={n.accent} title={n.title} sub={n.sub} chevron={!!n.route}
                 onClick={n.route ? () => { onClose(); nav.push(n.route); } : undefined} />
          ))}
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

  const dayLessons = sel.lessonsOn(s, date);
  const lessons = dayLessons.filter(l => l.status !== 'canceled');
  const canceled = dayLessons.filter(l => l.status === 'canceled');
  const income = sel.incomeOn(s, date);
  const isToday = date === todayISO();
  const notifCount = buildNotifications(s, t).length;
  const cur = s.settings.currency;

  /* місяць — контекст ширший за день; він відповідає на питання
     «як узагалі йде місяць», а не «що зараз» */
  const month = sel.periodRange('month', todayISO());
  const monthStats = sel.stats(s, month.from, month.to);
  const debt = sel.totalDebt(s);

  const hwActive = sel.homeworkActive(s);
  const hwCheck = sel.homeworkToCheck(s);
  const hwOverdue = sel.homeworkOverdue(s);
  const hwShown = [...hwOverdue, ...hwActive.filter(h => !hwOverdue.includes(h))].slice(0, 3);

  /* наступне заняття поза сьогоднішнім списком — щоб не гортати */
  const next = sel.nextLesson(s);
  const showNext = next && next.date !== date;

  const openLesson = l => nav.push({name: 'lesson', params: {id: l.id}});
  const openStudent = st => nav.push({name: 'student', params: {id: st.id}});

  return (
    <div className="app tabs">
      <AppBar brand
              left={<IconBtn icon={<Icon.menu size={22} />} label={t('a.more')} onClick={() => nav.go('profile')} />}
              right={<IconBtn icon={<Icon.bell size={21} />} dot={notifCount > 0} label={t('cal.notifications')}
                              onClick={() => setNotif(true)} />} />

      <div className="screen">
        {/* який сьогодні день */}
        <button className="hero press" style={{width: '100%', textAlign: 'left'}}
                onClick={() => setDate(todayISO())}>
          <div style={{position: 'relative', zIndex: 1}}>
            <div className="ttl">{isToday ? t('d.today') : fmtRelDate(t, date)}</div>
            <div className="sub">{fmtLongDate(t, date)}</div>
          </div>
          <div className="art"><Icon.calendarCheck size={62} stroke={1.5} /></div>
        </button>

        {view === 'week'
          ? <WeekStrip t={t} s={s} date={date} onPick={setDate} />
          : <MonthGrid t={t} s={s} date={date} onPick={setDate} />}

        <div style={{marginTop: 12}}>
          <Segmented value={view} onChange={setView}
                     options={[{id: 'week', label: t('cal.weekView')}, {id: 'month', label: t('cal.monthView')}]} />
        </div>

        {/* хто прийде */}
        <SectionHead title={isToday ? t('cal.todayLessons') : t('cal.dayLessons')}
                     action={lessons.length ? t.plural('lesson', lessons.length) : null} />
        {lessons.length || canceled.length ? (
          <div className="rows">
            {lessons.map(l => (
              <LessonRow key={l.id} lesson={l} s={s} t={t}
                         onClick={() => openLesson(l)} onStudent={openStudent} />
            ))}
            {canceled.map(l => (
              <LessonRow key={l.id} lesson={l} s={s} t={t}
                         onClick={() => openLesson(l)} onStudent={openStudent} />
            ))}
          </div>
        ) : (
          <Empty icon={<Icon.calendar size={34} />} title={t('cal.noLessons')} text={t('cal.noLessonsD')}
                 action={t('cal.addLesson')}
                 onAction={() => nav.push({name: 'lesson-new', params: {date}})} />
        )}

        {/* скільки я заробив */}
        <div className="money" style={{marginTop: 20}}>
          <div style={{minWidth: 0}}>
            <div className="k">{isToday ? t('cal.incomeToday') : t('cal.incomeDay')}</div>
            <div className="v num ellip">{fmtMoney(income, cur)}</div>
          </div>
          <button className="fab" aria-label={t('cal.addLesson')}
                  onClick={() => nav.push({name: 'lesson-new', params: {date}})}>
            <Icon.plus size={26} stroke={2.4} />
          </button>
        </div>

        {/* що з домашніми завданнями */}
        {hwActive.length || hwCheck.length ? (
          <>
            <SectionHead title={t('hw.title')} action={t('a.all')}
                         onAction={() => nav.push({name: 'homework'})} />
            {hwCheck.length || hwOverdue.length ? (
              <div className="chips" style={{margin: '-4px 0 10px'}}>
                {hwOverdue.length ? <span className="pill neg">{t('hw.overdueCount', {n: hwOverdue.length})}</span> : null}
                {hwCheck.length ? <span className="pill acc">{t('hw.needCheck', {n: hwCheck.length})}</span> : null}
              </div>
            ) : null}
            <div className="rows">
              {hwShown.map(h => (
                <HomeworkRow key={h.id} t={t} s={s} hw={h}
                             onOpen={() => nav.push({name: 'homework', params: {id: h.id}})} />
              ))}
            </div>
          </>
        ) : null}

        {/* як іде місяць */}
        <SectionHead title={t.cal.monthNom[parseInt(month.from.slice(5, 7), 10) - 1]}
                     action={t('dash.openFinance')} onAction={() => nav.push({name: 'finance'})} />
        <Stats items={[
          {k: t('dash.income'), v: fmtMoney(monthStats.earned, cur, {bare: true}),
           onClick: () => nav.push({name: 'finance'})},
          {k: t('dash.unpaid'), v: fmtMoney(debt, cur, {bare: true}), tone: debt ? 'neg' : '',
           onClick: () => nav.push({name: 'finance'})},
          {k: t('dash.lessons'), v: monthStats.lessons, onClick: () => nav.push({name: 'finance'})},
        ]} />

        {/* що далі */}
        {showNext ? (
          <>
            <SectionHead title={t('lesson.upcoming')} />
            <div className="rows">
              <LessonRow lesson={next} s={s} t={t}
                         onClick={() => openLesson(next)} onStudent={openStudent} />
              <div className="hint" style={{margin: '2px 2px 0'}}>{fmtRelDate(t, next.date)}</div>
            </div>
          </>
        ) : null}
      </div>

      <NotificationsSheet open={notif} onClose={() => setNotif(false)} t={t} s={s} nav={nav} />
    </div>
  );
}

Object.assign(window.U, {CalendarScreen, WeekStrip, MonthGrid, LessonRow, NotificationsSheet, buildNotifications, statusColor});
})();
