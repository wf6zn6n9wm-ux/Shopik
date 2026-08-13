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
  HomeworkRow,
  A, sel, uid, todayISO, addDays, toMin, toTime, duration, expandSeries, SERIES_HORIZON_WEEKS,
  fmtRelDate, fmtLongDate, fmtDur, fmtMoney, currencySymbol, normalizeLesson, lessonPrice, lessonTotal,
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
  const [prices, setPrices] = React.useState(editing ? Object.assign({}, editing.prices) : {});
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
  const priceFor = id => (prices[id] === undefined || prices[id] === '' ? price : prices[id]);
  const total = studentIds.reduce((sum, id) => sum + Number(priceFor(id) || 0), 0);
  const group = studentIds.length > 1;

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

    /* ціни залишаємо лише для тих, хто справді в занятті */
    const own = {};
    studentIds.forEach(id => { if (prices[id] !== undefined && prices[id] !== price) own[id] = Number(prices[id]) || 0; });

    if (editing){
      A.updateLesson(editing.id, {studentIds, date, start, end, price, prices: own, subject, note});
      toast(t('lesson.updated'));
      nav.back();
      return;
    }
    if (repeat){
      const rule = {
        id: uid('sr'), freq, days: days.slice().sort(), start, end, price, prices: own, subject, studentIds, note,
        from: date, until: untilMode === 'date' ? until : '', createdAt: todayISO(),
      };
      A.addSeries(rule);
      const items = expandSeries(rule, {weeks: SERIES_HORIZON_WEEKS});
      A.addLessons(items);
      toast(t('rep.createdSeries', {count: t.plural('lesson', items.length)}));
    } else {
      A.addLesson({studentIds, date, start, end, price, prices: own, subject, note});
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
        {group ? (
          <>
            <div className="hint">{t('lesson.pricePerStudentHint')}</div>
            <div className="rows" style={{marginTop: 10}}>
              {studentIds.map(id => {
                const st = sel.student(s, id);
                if (!st) return null;
                return (
                  <div className="row" key={id} style={{cursor: 'default'}}>
                    <Avatar name={st.name} color={st.color} emoji={st.emoji} photo={st.photo} size={36} />
                    <span className="nm ellip" style={{flex: 1}}>{st.name}</span>
                    <span style={{width: 140, flex: 'none'}}>
                      <Stepper value={Number(priceFor(id)) || 0} step={50} min={0}
                               onChange={v => setPrices({...prices, [id]: v})}
                               format={v => `${v} ${currencySymbol(s.settings.currency)}`} />
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="hint" style={{fontWeight: 700, color: 'var(--ink)'}}>
              {t('lesson.total')}: {fmtMoney(total, s.settings.currency)}
            </div>
          </>
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

/* ── картка заняття ────────────────────────────────────────────
   Заняття — вузол, з якого видно все інше: учня, гроші, домашнє
   завдання. Тому картка не показує самі дані, а дає короткі
   відповіді й переходи туди, де з ними працюють.                */
function LessonScreen({t, s, nav, params}){
  const lesson = s.lessons.find(l => l.id === params.id);
  const [del, setDel] = React.useState(false);
  const [sheet, setSheet] = React.useState('');
  const [moveDate, setMoveDate] = React.useState('');
  const [moveTime, setMoveTime] = React.useState('');
  const [prices, setPrices] = React.useState(null);

  if (!lesson) return (
    <div className="app stack">
      <StackBar t={t} title={t('lesson.one')} onBack={nav.back} />
      <div className="screen"><Empty icon={<Icon.calendar size={34} />} title={t('c.noData')} /></div>
    </div>
  );

  const students = sel.studentsOf(s, lesson);
  const mins = duration(lesson.start, lesson.end);
  const total = lessonTotal(lesson);
  const cur = s.settings.currency;
  const paid = sel.isLessonPaid(s, lesson);
  const payments = s.payments.filter(p => p.lessonId === lesson.id);
  const homework = sel.homeworkOfLesson(s, lesson.id);
  const statusPill = lesson.status === 'done' ? 'pos'
    : lesson.status === 'canceled' ? '' : lesson.status === 'missed' ? 'neg' : 'warn';

  const openPrices = () => {
    const init = {};
    lesson.studentIds.forEach(id => { init[id] = lessonPrice(lesson, id); });
    setPrices(init);
    setSheet('price');
  };
  const savePrices = () => {
    const single = lesson.studentIds.length === 1;
    if (single) A.updateLesson(lesson.id, {price: prices[lesson.studentIds[0]], prices: {}});
    else A.updateLesson(lesson.id, {prices});
    setSheet('');
    toast(t('lesson.updated'));
  };
  const move = () => {
    A.rescheduleLesson(lesson.id, {date: moveDate || lesson.date, start: moveTime || lesson.start});
    setSheet('');
    toast(t('lesson.rescheduled'));
  };
  const repeat = offset => {
    const copy = A.duplicateLesson(lesson.id, offset);
    setSheet('');
    toast(t('lesson.duplicated'));
    if (copy) nav.replace({name: 'lesson', params: {id: copy.id}});
  };
  const remove = () => {
    if (lesson.seriesId) return setDel(true);
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
                {fmtMoney(total, cur)}
              </div>
            </div>
            {lesson.status === 'done' ? (
              <span className={'pill ' + (paid ? 'pos' : 'neg')}>
                {paid ? <Icon.check size={13} stroke={3} /> : null}
                {paid ? t('lesson.paid') : t('lesson.unpaid')}
              </span>
            ) : null}
          </div>
        </Card>

        {/* учні: тут же видно, хто скільки винен */}
        <SectionHead title={t('lesson.students')}
                     action={students.length > 1 ? t('lesson.groupOf', {count: students.length}) : null} />
        <div className="rows">
          {students.map(st => {
            const money = sel.ledger(s, st.id);
            return (
              <Row key={st.id}
                   avatar={<Avatar name={st.name} color={st.color} emoji={st.emoji} photo={st.photo} size={40} />}
                   title={st.name}
                   sub={money.debt ? `${t('st.owes')} ${fmtMoney(money.debt, cur)}`
                        : money.prepay ? `${t('st.prepayLabel')} ${fmtMoney(money.prepay, cur)}`
                        : st.subject}
                   right={students.length > 1 ? fmtMoney(lessonPrice(lesson, st.id), cur) : null}
                   chevron
                   onClick={() => nav.push({name: 'student', params: {id: st.id}})} />
            );
          })}
        </div>

        {/* оплата */}
        <SectionHead title={t('lesson.payment')} />
        <div className="rows joined">
          {payments.map(p => {
            const st = sel.student(s, p.studentId);
            return (
              <Row key={p.id} icon={<Icon.cash size={18} />} title={fmtMoney(p.amount, cur)}
                   sub={`${st ? st.name : ''} · ${t('st.' + p.method)}`} />
            );
          })}
          {payments.length ? (
            <Row icon={<Icon.x size={18} />} title={t('lesson.markUnpaid')}
                 onClick={() => { A.unpayLesson(lesson.id); toast(t('lesson.unpaid')); }} />
          ) : (
            <Row icon={<Icon.wallet size={18} />} accent title={t('lesson.addPayment')}
                 sub={paid ? t('lesson.paidFromBalance') : fmtMoney(total, cur)}
                 onClick={() => { A.payForLesson(lesson.id); toast(t('st.paymentAdded')); }} />
          )}
        </div>

        {/* домашнє завдання */}
        <SectionHead title={t('hw.title')}
                     action={<span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}><Icon.plus size={15} />{t('a.add')}</span>}
                     onAction={() => nav.push({name: 'homework-new', params: {lessonId: lesson.id, studentId: lesson.studentIds[0]}})} />
        {homework.length ? (
          <div className="rows">
            {homework.map(h => (
              <HomeworkRow key={h.id} t={t} s={s} hw={h} showStudents={false}
                           onOpen={() => nav.push({name: 'homework', params: {id: h.id}})} />
            ))}
          </div>
        ) : (
          <Card><div className="muted" style={{fontSize: 14}}>{t('hw.emptyD')}</div></Card>
        )}

        {lesson.note ? (
          <>
            <SectionHead title={t('lesson.note')} />
            <Card><div style={{fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap'}}>{lesson.note}</div></Card>
          </>
        ) : null}

        {/* дії */}
        <SectionHead title={t('lesson.actions')} />
        <div className="rows joined">
          {lesson.status !== 'done' ? (
            <Row icon={<Icon.check size={19} />} accent title={t('lesson.markDone')}
                 onClick={() => { A.setLessonStatus(lesson.id, 'done'); toast(t('lesson.updated')); }} />
          ) : (
            <Row icon={<Icon.repeat size={19} />} title={t('lesson.markPlanned')}
                 onClick={() => { A.setLessonStatus(lesson.id, 'planned'); toast(t('lesson.updated')); }} />
          )}
          <Row icon={<Icon.clock size={19} />} title={t('lesson.reschedule')}
               onClick={() => { setMoveDate(lesson.date); setMoveTime(lesson.start); setSheet('move'); }} />
          <Row icon={<Icon.repeat size={19} />} title={t('lesson.duplicate')} onClick={() => setSheet('repeat')} />
          <Row icon={<Icon.cash size={19} />} title={t('lesson.changePrice')}
               right={fmtMoney(total, cur)} onClick={openPrices} />
          <Row icon={<Icon.users size={19} />} title={t('lesson.changeStudents')}
               onClick={() => nav.push({name: 'lesson-edit', params: {id: lesson.id}})} />
          {lesson.status !== 'missed' ? (
            <Row icon={<Icon.x size={19} />} title={t('lesson.markMissed')}
                 onClick={() => { A.setLessonStatus(lesson.id, 'missed'); toast(t('lesson.missed')); }} />
          ) : null}
          {lesson.status !== 'canceled' ? (
            <Row icon={<Icon.x size={19} />} title={t('lesson.cancel')}
                 onClick={() => { A.setLessonStatus(lesson.id, 'canceled'); toast(t('lesson.canceled')); }} />
          ) : null}
          <Row icon={<Icon.trash size={19} />} danger title={t('a.delete')} onClick={remove} />
        </div>
        <div style={{height: 20}} />
      </div>

      {/* перенести */}
      <Sheet open={sheet === 'move'} onClose={() => setSheet('')} title={t('lesson.reschedule')}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
          <PickerField label={t('d.date')} value={fmtRelDate(t, moveDate || lesson.date)}
                       icon={<Icon.calendar size={17} />} onClick={() => setSheet('move-date')} />
          <PickerField label={t('d.from')} value={moveTime || lesson.start}
                       icon={<Icon.clock size={17} />} onClick={() => setSheet('move-time')} />
        </div>
        <div className="chips" style={{marginTop: 12}}>
          {[[1, t('d.tomorrow')], [7, t('lesson.duplicateWeek')]].map(([off, label]) => (
            <button key={off} className="chip" onClick={() => setMoveDate(addDays(lesson.date, off))}>{label}</button>
          ))}
        </div>
        <div style={{height: 16}} />
        <Btn kind="pri" wide onClick={move}>{t('a.save')}</Btn>
        <div style={{height: 8}} />
        <Btn kind="ghost" wide onClick={() => setSheet('')}>{t('a.cancel')}</Btn>
      </Sheet>
      <DatePickerSheet open={sheet === 'move-date'} value={moveDate || lesson.date} t={t}
                       onPick={setMoveDate} onClose={() => setSheet('move')} />
      <TimePickerSheet open={sheet === 'move-time'} value={moveTime || lesson.start} t={t}
                       onPick={setMoveTime} onClose={() => setSheet('move')} />

      {/* повторити */}
      <Sheet open={sheet === 'repeat'} onClose={() => setSheet('')} title={t('lesson.duplicate')}>
        <div className="rows" style={{marginTop: 6}}>
          <Row icon={<Icon.calendar size={18} />} title={t('lesson.duplicateTomorrow')}
               sub={fmtRelDate(t, addDays(lesson.date, 1))} onClick={() => repeat(1)} />
          <Row icon={<Icon.repeat size={18} />} accent title={t('lesson.duplicateWeek')}
               sub={fmtRelDate(t, addDays(lesson.date, 7))} onClick={() => repeat(7)} />
        </div>
        <div style={{height: 10}} />
        <Btn kind="ghost" wide onClick={() => setSheet('')}>{t('a.cancel')}</Btn>
      </Sheet>

      {/* ціна */}
      <Sheet open={sheet === 'price'} onClose={() => setSheet('')} title={t('lesson.changePrice')}>
        {prices ? students.map(st => (
          <Field key={st.id} label={students.length > 1 ? st.name : t('lesson.price')}>
            <Stepper value={prices[st.id] || 0} step={50} min={0}
                     onChange={v => setPrices({...prices, [st.id]: v})}
                     format={v => `${v} ${currencySymbol(cur)}`} />
          </Field>
        )) : null}
        {students.length > 1 ? <div className="hint">{t('lesson.pricePerStudentHint')}</div> : null}
        <div style={{height: 16}} />
        <Btn kind="pri" wide onClick={savePrices}>{t('a.save')}</Btn>
        <div style={{height: 8}} />
        <Btn kind="ghost" wide onClick={() => setSheet('')}>{t('a.cancel')}</Btn>
      </Sheet>

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
