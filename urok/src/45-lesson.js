/* ══════════════════════════════════════════════════════════════════
   UROK+ · ЗАНЯТТЯ
   ------------------------------------------------------------------
   Створення й картка заняття. Форма зроблена так, щоб типовий
   випадок («той самий учень, та сама година, щотижня») закривався
   трьома дотиками, а рідкісний — не вимагав іншого екрана.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Field, Input, TextArea, Empty, Sheet, Confirm,
  Segmented, Chips, Switch, StackBar, PickerField, DatePickerSheet, TimePickerSheet, Stepper, toast,
  A, sel, uid, todayISO, addDays, toMin, toTime, duration, expandSeries, SERIES_HORIZON_WEEKS,
  fmtRelDate, fmtLongDate, fmtDur, fmtMoney, currencySymbol, normalizeLesson,
} = window.U;

const DURATIONS = [30, 45, 60, 90, 120];

/* ── вибір учнів ───────────────────────────────────────────── */
function StudentPicker({t, s, value, onChange}){
  const list = sel.activeStudents(s);
  return (
    <div className="rows" style={{marginTop: 4}}>
      {list.map(st => {
        const on = value.includes(st.id);
        return (
          <button key={st.id} className="row" onClick={() =>
            onChange(on ? value.filter(x => x !== st.id) : [...value, st.id])}>
            <Avatar name={st.name} color={st.color} emoji={st.emoji} size={40} />
            <span className="ellip" style={{flex: 1}}>
              <span className="nm ellip" style={{display: 'block'}}>{st.name}</span>
              {st.subject ? <span className="ds ellip" style={{display: 'block'}}>{st.subject}</span> : null}
            </span>
            <span style={{width: 24, height: 24, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                          background: on ? 'var(--accent)' : 'transparent',
                          border: on ? 'none' : '1.8px solid var(--line-2)', color: '#fff'}}>
              {on ? <Icon.check size={14} stroke={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── створення / редагування ───────────────────────────────── */
function LessonFormScreen({t, s, nav, params}){
  const editing = params && params.id ? s.lessons.find(l => l.id === params.id) : null;
  const def = s.settings;

  const [studentIds, setStudentIds] = React.useState(editing ? editing.studentIds : (params && params.studentId ? [params.studentId] : []));
  const [date, setDate] = React.useState(editing ? editing.date : (params && params.date) || todayISO());
  const [start, setStart] = React.useState(editing ? editing.start : '10:00');
  const [end, setEnd] = React.useState(editing ? editing.end : toTime(toMin('10:00') + def.defaultDuration));
  const [price, setPrice] = React.useState(editing ? editing.price : def.defaultPrice);
  const [subject, setSubject] = React.useState(editing ? editing.subject : '');
  const [note, setNote] = React.useState(editing ? editing.note : '');
  const [repeat, setRepeat] = React.useState(false);
  const [freq, setFreq] = React.useState('weekly');
  const [days, setDays] = React.useState([]);
  const [untilMode, setUntilMode] = React.useState('none');
  const [until, setUntil] = React.useState(addDays(todayISO(), 90));
  const [err, setErr] = React.useState('');
  const [pick, setPick] = React.useState('');

  /* Ціну й предмет підказує сам учень: у 90% випадків вони сталі. */
  React.useEffect(() => {
    if (editing || studentIds.length !== 1) return;
    const st = sel.student(s, studentIds[0]);
    if (!st) return;
    if (st.price) setPrice(st.price);
    if (st.subject) setSubject(st.subject);
  }, [studentIds.join(','), editing]);

  /* Обраний день тижня для повтору — той самий, що й у дати. */
  React.useEffect(() => {
    if (repeat && !days.length) setDays([window.U.dow(date)]);
  }, [repeat]);

  const mins = duration(start, end);
  const conflicts = sel.conflicts(s, {date, start, end, ignoreId: editing ? editing.id : ''});
  const students = sel.activeStudents(s);
  const total = price * Math.max(1, studentIds.length);

  const setStartKeepLength = v => {
    const len = mins || def.defaultDuration;
    setStart(v);
    setEnd(toTime(toMin(v) + len));
  };

  const submit = () => {
    if (!studentIds.length) return setErr(t('lesson.needStudent'));
    if (toMin(end) <= toMin(start)) return setErr(t('lesson.needTime'));
    if (repeat && !days.length) return setErr(t('rep.needDay'));
    setErr('');

    if (editing){
      A.updateLesson(editing.id, {studentIds, date, start, end, price, subject, note});
      toast(t('lesson.updated'));
      nav.back();
      return;
    }
    if (repeat){
      const rule = {
        id: uid('sr'), freq, days: days.slice().sort(), start, end, price, subject, studentIds, note,
        from: date, until: untilMode === 'date' ? until : '', createdAt: todayISO(),
      };
      A.addSeries(rule);
      const items = expandSeries(rule, {weeks: SERIES_HORIZON_WEEKS});
      A.addLessons(items);
      toast(t('rep.createdSeries', {count: t.plural('lesson', items.length)}));
    } else {
      A.addLesson({studentIds, date, start, end, price, subject, note});
      toast(t('lesson.created'));
    }
    nav.back();
  };

  if (!students.length) return (
    <div className="app stack">
      <StackBar t={t} title={t('lesson.new')} onBack={nav.back} />
      <div className="screen">
        <Empty icon={<Icon.users size={34} />} title={t('lesson.noStudents')} text={t('lesson.noStudentsD')}
               action={t('st.add')} onAction={() => nav.push({name: 'student-new'})} />
      </div>
    </div>
  );

  const dateChips = [
    {id: todayISO(), label: t('d.today')},
    {id: addDays(todayISO(), 1), label: t('d.tomorrow')},
  ];
  const isOther = !dateChips.some(c => c.id === date);

  return (
    <div className="app stack">
      <StackBar t={t} title={editing ? t('lesson.edit') : t('lesson.new')} onBack={nav.back} />
      <div className="screen">
        {/* учні */}
        <SectionHead title={t('lesson.students')} tight
                     action={<span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}><Icon.plus size={15} />{t('a.add')}</span>}
                     onAction={() => nav.push({name: 'student-new'})} />
        <div className="hint" style={{margin: '-6px 2px 8px'}}>{t('lesson.studentsHint')}</div>
        <StudentPicker t={t} s={s} value={studentIds} onChange={setStudentIds} />

        {/* дата */}
        <SectionHead title={t('lesson.date')} />
        <div className="chips">
          {dateChips.map(c => (
            <button key={c.id} className={'chip' + (date === c.id ? ' on' : '')} onClick={() => setDate(c.id)}>{c.label}</button>
          ))}
          <button className={'chip' + (isOther ? ' on' : '')} onClick={() => setPick('date')}>
            <Icon.calendar size={16} />{isOther ? fmtRelDate(t, date) : t('d.otherDate')}
          </button>
        </div>

        {/* час */}
        <SectionHead title={t('lesson.frame')} />
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
          <PickerField label={t('d.from')} value={start} icon={<Icon.clock size={17} />} onClick={() => setPick('start')} />
          <PickerField label={t('d.to')} value={end} icon={<Icon.clock size={17} />} onClick={() => setPick('end')} />
        </div>
        <div className="chips" style={{marginTop: 10}}>
          {DURATIONS.map(d => (
            <button key={d} className={'chip sq' + (mins === d ? ' on' : '')}
                    onClick={() => setEnd(toTime(toMin(start) + d))}>{d} {t('d.min')}</button>
          ))}
        </div>
        {conflicts.length ? (
          <div className="hint" style={{color: 'var(--warn)', fontWeight: 700}}>
            {t('lesson.conflict', {list: conflicts.map(c => `${c.start}–${c.end}`).join(', ')})}
          </div>
        ) : null}

        {/* предмет і ціна */}
        <SectionHead title={t('lesson.price')} />
        <Stepper value={price} onChange={setPrice} step={50} min={0}
                 format={v => `${v} ${currencySymbol(s.settings.currency)}`} />
        {studentIds.length > 1 ? (
          <div className="hint">{t('lesson.priceHint')} {fmtMoney(total, s.settings.currency)}</div>
        ) : null}
        <Field label={t('lesson.subject')}>
          <Input value={subject} placeholder={t('lesson.subjectPlaceholder')} onChange={e => setSubject(e.target.value)} />
        </Field>

        {/* повтор */}
        {!editing ? (
          <>
            <div className="card pad" style={{marginTop: 22}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <span style={{width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
                              background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none'}}>
                  <Icon.repeat size={19} />
                </span>
                <span style={{flex: 1, minWidth: 0}}>
                  <span className="h3" style={{display: 'block'}}>{t('rep.title')}</span>
                  <span className="ds muted" style={{display: 'block', fontSize: 12.5, marginTop: 2}}>{t('rep.hint')}</span>
                </span>
                <Switch on={repeat} onChange={setRepeat} label={t('rep.title')} />
              </div>

              {repeat ? (
                <div style={{marginTop: 14}}>
                  <Segmented value={freq} onChange={setFreq}
                             options={[{id: 'weekly', label: t('rep.weekly')}, {id: 'biweekly', label: t('rep.biweekly')}]} />
                  <div className="lbl" style={{margin: '14px 2px 8px'}}>{t('rep.days')}</div>
                  <div className="chips">
                    {t.cal.dowShort.map((w, i) => (
                      <button key={w} className={'chip sq' + (days.includes(i) ? ' on' : '')}
                              onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i])}>{w}</button>
                    ))}
                  </div>
                  <div className="lbl" style={{margin: '14px 2px 8px'}}>{t('rep.until')}</div>
                  <div className="chips">
                    <button className={'chip' + (untilMode === 'none' ? ' on' : '')} onClick={() => setUntilMode('none')}>
                      {t('rep.noEnd')}
                    </button>
                    <button className={'chip' + (untilMode === 'date' ? ' on' : '')}
                            onClick={() => { setUntilMode('date'); setPick('until'); }}>
                      <Icon.calendar size={16} />{untilMode === 'date' ? fmtRelDate(t, until) : t('rep.untilDate')}
                    </button>
                  </div>
                  <div className="hint">{t('rep.horizon')}</div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <Field label={t('lesson.note')}>
          <TextArea value={note} placeholder={t('lesson.notePlaceholder')} onChange={e => setNote(e.target.value)} />
        </Field>

        {err ? <div className="errtext" style={{textAlign: 'center', marginTop: 12}}>{err}</div> : null}
        <div className="barpad" />
      </div>

      <div className="fixedbar">
        <Btn kind="pri" size="lg" wide onClick={submit}>
          {editing ? t('a.save') : t('lesson.create')}
        </Btn>
      </div>

      <DatePickerSheet open={pick === 'date'} value={date} t={t} onPick={setDate} onClose={() => setPick('')} />
      <DatePickerSheet open={pick === 'until'} value={until} t={t} min={date} title={t('rep.until')}
                       onPick={setUntil} onClose={() => setPick('')} />
      <TimePickerSheet open={pick === 'start'} value={start} t={t} title={t('d.from')}
                       onPick={setStartKeepLength} onClose={() => setPick('')} />
      <TimePickerSheet open={pick === 'end'} value={end} t={t} title={t('d.to')}
                       onPick={setEnd} onClose={() => setPick('')} />
    </div>
  );
}

/* ── картка заняття ────────────────────────────────────────── */
function LessonScreen({t, s, nav, params}){
  const lesson = s.lessons.find(l => l.id === params.id);
  const [del, setDel] = React.useState(false);
  if (!lesson) return (
    <div className="app stack">
      <StackBar t={t} title={t('lesson.one')} onBack={nav.back} />
      <div className="screen"><Empty icon={<Icon.calendar size={34} />} title={t('c.noData')} /></div>
    </div>
  );
  const students = sel.studentsOf(s, lesson);
  const mins = duration(lesson.start, lesson.end);
  const total = lesson.price * Math.max(1, students.length);
  const statusPill = lesson.status === 'done' ? 'pos' : lesson.status === 'canceled' ? 'neg' : 'warn';

  const remove = () => {
    if (lesson.seriesId) { setDel(true); return; }
    A.removeLesson(lesson.id);
    toast(t('lesson.deleted'));
    nav.back();
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={t('lesson.one')} onBack={nav.back}
                right={<IconBtn icon={<Icon.edit size={19} />} label={t('a.edit')}
                                onClick={() => nav.push({name: 'lesson-edit', params: {id: lesson.id}})} />} />
      <div className="screen">
        <Card>
          <div style={{display: 'flex', alignItems: 'flex-start', gap: 12}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div className="dsp" style={{fontSize: 24, fontWeight: 800, letterSpacing: '-.04em'}}>
                {lesson.start} – {lesson.end}
              </div>
              <div className="muted" style={{fontSize: 13.5, marginTop: 4, fontWeight: 600}}>
                {fmtLongDate(t, lesson.date)} · {fmtDur(t, mins)}
              </div>
            </div>
            <span className={'pill ' + statusPill}>{t('lesson.' + lesson.status)}</span>
          </div>
          <div className="divider" />
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div className="lbl">{lesson.subject || t('lesson.subject')}</div>
              <div className="dsp num" style={{fontSize: 22, fontWeight: 800, marginTop: 2}}>
                {fmtMoney(total, s.settings.currency)}
              </div>
            </div>
            <span className={'pill ' + (lesson.paid ? 'pos' : '')}>
              {lesson.paid ? <Icon.check size={13} stroke={3} /> : null}
              {lesson.paid ? t('lesson.paid') : t('lesson.unpaid')}
            </span>
          </div>
        </Card>

        <SectionHead title={t('lesson.students')} />
        <div className="rows">
          {students.map(st => (
            <Row key={st.id} avatar={<Avatar name={st.name} color={st.color} emoji={st.emoji} size={40} />}
                 title={st.name} sub={st.subject} chevron
                 onClick={() => nav.push({name: 'student', params: {id: st.id}})} />
          ))}
        </div>

        {lesson.note ? (
          <>
            <SectionHead title={t('lesson.note')} />
            <Card><div style={{fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap'}}>{lesson.note}</div></Card>
          </>
        ) : null}

        <SectionHead title={t('lesson.status')} />
        <div className="rows">
          {lesson.status !== 'done' ? (
            <Row icon={<Icon.check size={19} />} accent title={t('lesson.markDone')}
                 onClick={() => { A.updateLesson(lesson.id, {status: 'done'}); toast(t('lesson.updated')); }} />
          ) : (
            <Row icon={<Icon.repeat size={19} />} title={t('lesson.markPlanned')}
                 onClick={() => { A.updateLesson(lesson.id, {status: 'planned'}); toast(t('lesson.updated')); }} />
          )}
          <Row icon={<Icon.wallet size={19} />} accent={!lesson.paid}
               title={lesson.paid ? t('lesson.markUnpaid') : t('lesson.markPaid')}
               onClick={() => { A.togglePaid(lesson.id, !lesson.paid); toast(lesson.paid ? t('lesson.unpaid') : t('lesson.paid')); }} />
          {lesson.status !== 'canceled' ? (
            <Row icon={<Icon.x size={19} />} title={t('lesson.cancel')}
                 onClick={() => { A.updateLesson(lesson.id, {status: 'canceled'}); toast(t('lesson.canceled')); }} />
          ) : null}
          <Row icon={<Icon.trash size={19} />} danger title={t('a.delete')} onClick={remove} />
        </div>
        <div style={{height: 20}} />
      </div>

      <Sheet open={del} onClose={() => setDel(false)} title={t('lesson.deleteConfirm')}>
        <div className="rows" style={{marginTop: 8}}>
          <Row icon={<Icon.trash size={19} />} title={t('lesson.deleteOne')}
               onClick={() => { A.removeLesson(lesson.id); setDel(false); toast(t('lesson.deleted')); nav.back(); }} />
          <Row icon={<Icon.repeat size={19} />} danger title={t('lesson.deleteSeries')}
               onClick={() => { A.removeSeries(lesson.seriesId); setDel(false); toast(t('lesson.deleted')); nav.back(); }} />
        </div>
        <div style={{height: 10}} />
        <Btn kind="ghost" wide onClick={() => setDel(false)}>{t('a.cancel')}</Btn>
      </Sheet>
    </div>
  );
}

Object.assign(window.U, {LessonFormScreen, LessonScreen, StudentPicker, DURATIONS});
})();
