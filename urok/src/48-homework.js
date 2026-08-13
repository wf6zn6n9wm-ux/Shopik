/* ══════════════════════════════════════════════════════════════════
   UROK+ · ДОМАШНІ ЗАВДАННЯ
   ------------------------------------------------------------------
   Завдання живе між заняттям і учнем: видали на занятті, перевірили
   на наступному. Тому статус міняється одним дотиком просто зі
   списку — окремий екран потрібен лише щоб написати текст.

   Стан завдання читається зліва направо: не виконано → в процесі →
   виконано → перевірено. Останній крок належить викладачеві, і саме
   він дає число «потребують перевірки» на головному екрані.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Field, Input, TextArea, Empty, Sheet, Confirm,
  Segmented, Chips, StackBar, PickerField, DatePickerSheet, AppBar, toast,
  A, sel, HOMEWORK_STATUS, todayISO, addDays, diffDays, fmtRelDate, fmtShortDate, fmtDayMonth,
} = window.U;

/* Підпис до дедлайну: точна дата потрібна рідко, важливо «коли». */
function dueLabel(t, hw){
  if (!hw.dueDate) return '';
  const d = diffDays(todayISO(), hw.dueDate);
  if (hw.status === 'done') return t('hw.done');
  if (d < 0) return t('hw.overdue');
  if (d === 0) return t('hw.dueToday');
  if (d === 1) return t('hw.dueTomorrow');
  return t('hw.dueOn', {date: fmtDayMonth(t, hw.dueDate)});
}
function dueTone(hw){
  if (hw.status === 'done') return hw.checked ? '' : 'acc';
  if (!hw.dueDate) return '';
  const d = diffDays(todayISO(), hw.dueDate);
  return d < 0 ? 'neg' : d <= 1 ? 'warn' : '';
}

/* Один рядок завдання. Ліва позначка — не декор: вона перемикає
   статус по колу, щоб не відкривати екран заради галочки. */
function HomeworkRow({t, s, hw, onOpen, showStudents = true}){
  const students = hw.studentIds.map(id => sel.student(s, id)).filter(Boolean);
  const next = {todo: 'doing', doing: 'done', done: 'todo'};
  const mark = hw.status === 'done' ? 'done' : hw.status === 'doing' ? 'doing' : '';
  return (
    <div className="hw">
      <button className={'mark ' + mark} aria-label={t('hw.status')}
              onClick={() => A.setHomeworkStatus(hw.id, next[hw.status] || 'todo')}>
        {hw.status === 'done' ? <Icon.check size={14} stroke={3} />
          : hw.status === 'doing' ? <span style={{width: 8, height: 8, borderRadius: 2, background: 'currentColor'}} /> : null}
      </button>
      <button style={{flex: 1, minWidth: 0, textAlign: 'left', background: 'none'}} onClick={onOpen}>
        <div className={'t' + (hw.status === 'done' ? ' done' : '')}>{hw.title}</div>
        <div className="m">
          <span className={'pill ' + dueTone(hw)}>{dueLabel(t, hw)}</span>
          {hw.status === 'done' && !hw.checked ? <span className="pill acc">{t('hw.markChecked')}</span> : null}
          {hw.checked ? <span className="pill pos"><Icon.check size={12} stroke={3} />{t('hw.checked')}</span> : null}
          {showStudents && students.length ? <span className="ellip">{students.map(x => x.name).join(', ')}</span> : null}
        </div>
      </button>
    </div>
  );
}

/* ── список ────────────────────────────────────────────────── */
function HomeworkScreen({t, s, nav, params}){
  const [tab, setTab] = React.useState('active');
  const studentId = params && params.studentId;
  const all = studentId ? sel.homeworkOf(s, studentId) : s.homework;
  const active = all.filter(h => h.status !== 'done').sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  const doneList = all.filter(h => h.status === 'done').sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  const list = tab === 'active' ? active : doneList;
  const student = studentId ? sel.student(s, studentId) : null;
  const toCheck = all.filter(h => h.status === 'done' && !h.checked).length;
  const overdue = active.filter(h => h.dueDate && h.dueDate < todayISO()).length;

  return (
    <div className="app stack">
      <StackBar t={t} title={t('hw.title')} onBack={nav.back}
                right={<IconBtn icon={<Icon.plus size={22} />} soft label={t('hw.add')}
                                onClick={() => nav.push({name: 'homework-new', params: {studentId}})} />} />
      <div className="screen">
        {student ? (
          <div className="muted" style={{margin: '0 2px 12px', fontWeight: 700, fontSize: 13.5}}>{student.name}</div>
        ) : null}

        {(toCheck || overdue) ? (
          <div className="chips" style={{marginBottom: 12}}>
            {overdue ? <span className="pill neg">{t('hw.overdueCount', {n: overdue})}</span> : null}
            {toCheck ? <span className="pill acc">{t('hw.needCheck', {n: toCheck})}</span> : null}
          </div>
        ) : null}

        <Segmented value={tab} onChange={setTab}
                   options={[{id: 'active', label: `${t('hw.active')}${active.length ? ' · ' + active.length : ''}`},
                             {id: 'done', label: `${t('hw.archive')}${doneList.length ? ' · ' + doneList.length : ''}`}]} />

        {list.length ? (
          <div className="rows" style={{marginTop: 14}}>
            {list.map(hw => (
              <HomeworkRow key={hw.id} t={t} s={s} hw={hw} showStudents={!studentId}
                           onOpen={() => nav.push({name: 'homework', params: {id: hw.id}})} />
            ))}
          </div>
        ) : (
          <Empty icon={<Icon.clipboard size={34} />} title={t('hw.emptyT')} text={t('hw.emptyD')}
                 action={t('hw.add')} onAction={() => nav.push({name: 'homework-new', params: {studentId}})} />
        )}
      </div>
    </div>
  );
}

/* ── картка ────────────────────────────────────────────────── */
function HomeworkCardScreen({t, s, nav, params}){
  const hw = s.homework.find(h => h.id === params.id);
  const [del, setDel] = React.useState(false);
  if (!hw) return (
    <div className="app stack">
      <StackBar t={t} title={t('hw.one')} onBack={nav.back} />
      <div className="screen"><Empty icon={<Icon.clipboard size={34} />} title={t('c.noData')} /></div>
    </div>
  );
  const students = hw.studentIds.map(id => sel.student(s, id)).filter(Boolean);
  const lesson = hw.lessonId ? s.lessons.find(l => l.id === hw.lessonId) : null;

  return (
    <div className="app stack">
      <StackBar t={t} title={t('hw.one')} onBack={nav.back}
                right={<IconBtn icon={<Icon.edit size={19} />} label={t('a.edit')}
                                onClick={() => nav.push({name: 'homework-edit', params: {id: hw.id}})} />} />
      <div className="screen">
        <Card>
          <div className="dsp" style={{fontSize: 21, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.25}}>
            {hw.title}
          </div>
          <div className="chips" style={{marginTop: 10}}>
            <span className={'pill ' + dueTone(hw)}>{dueLabel(t, hw)}</span>
            <span className="pill">{t('hw.' + hw.status)}</span>
            {hw.checked ? <span className="pill pos">{t('hw.checked')}</span> : null}
          </div>
          {hw.description ? (
            <div style={{fontSize: 14.5, lineHeight: 1.55, marginTop: 14, whiteSpace: 'pre-wrap'}}>{hw.description}</div>
          ) : null}
          <div className="divider" />
          <div className="muted" style={{fontSize: 12.5, fontWeight: 600}}>
            {t('hw.issued')}: {fmtShortDate(t, hw.issuedAt)}
            {hw.dueDate ? ` · ${t('hw.due')}: ${fmtShortDate(t, hw.dueDate)}` : ''}
          </div>
        </Card>

        <SectionHead title={t('hw.students')} />
        <div className="rows">
          {students.map(st => (
            <Row key={st.id} avatar={<Avatar name={st.name} color={st.color} emoji={st.emoji} photo={st.photo} size={40} />}
                 title={st.name} sub={st.subject} chevron
                 onClick={() => nav.push({name: 'student', params: {id: st.id}})} />
          ))}
        </div>

        {lesson ? (
          <>
            <SectionHead title={t('hw.forLesson')} />
            <div className="rows">
              <Row icon={<Icon.calendar size={18} />} accent
                   title={`${fmtRelDate(t, lesson.date)}, ${lesson.start}`}
                   sub={t('hw.fromLesson', {date: fmtShortDate(t, lesson.date)})} chevron
                   onClick={() => nav.push({name: 'lesson', params: {id: lesson.id}})} />
            </div>
          </>
        ) : null}

        <SectionHead title={t('hw.status')} />
        <div className="rows">
          {HOMEWORK_STATUS.map(st => (
            <Row key={st} icon={st === 'done' ? <Icon.check size={19} /> : st === 'doing' ? <Icon.clock size={19} /> : <Icon.clipboard size={19} />}
                 accent={hw.status === st} title={t('hw.' + st)}
                 right={hw.status === st ? <Icon.check size={18} stroke={3} /> : null}
                 onClick={() => { A.setHomeworkStatus(hw.id, st); toast(t('hw.updated')); }} />
          ))}
          {hw.status === 'done' ? (
            <Row icon={<Icon.check size={19} />} accent={!hw.checked}
                 title={hw.checked ? t('hw.uncheck') : t('hw.markChecked')}
                 onClick={() => { A.checkHomework(hw.id, !hw.checked); toast(t('hw.updated')); }} />
          ) : null}
          <Row icon={<Icon.trash size={19} />} danger title={t('a.delete')} onClick={() => setDel(true)} />
        </div>
        <div style={{height: 20}} />
      </div>

      <Confirm open={del} danger text={t('hw.deleteConfirm')} confirmLabel={t('a.delete')} cancelLabel={t('a.cancel')}
               onClose={() => setDel(false)}
               onConfirm={() => { A.removeHomework(hw.id); setDel(false); toast(t('hw.deleted')); nav.back(); }} />
    </div>
  );
}

/* ── форма ─────────────────────────────────────────────────── */
function HomeworkFormScreen({t, s, nav, params}){
  const editing = params && params.id ? s.homework.find(h => h.id === params.id) : null;
  const [title, setTitle] = React.useState(editing ? editing.title : '');
  const [description, setDescription] = React.useState(editing ? editing.description : '');
  const [studentIds, setStudentIds] = React.useState(
    editing ? editing.studentIds : (params && params.studentId ? [params.studentId] : []));
  const [dueDate, setDueDate] = React.useState(editing ? editing.dueDate : addDays(todayISO(), 7));
  const [status, setStatus] = React.useState(editing ? editing.status : 'todo');
  const [err, setErr] = React.useState('');
  const [pick, setPick] = React.useState(false);
  const students = sel.activeStudents(s);

  const submit = () => {
    if (!title.trim()) return setErr(t('hw.nameRequired'));
    if (!studentIds.length) return setErr(t('hw.needStudent'));
    if (editing){
      A.updateHomework(editing.id, {title: title.trim(), description, studentIds, dueDate, status});
      toast(t('hw.updated'));
      nav.back();
    } else {
      A.addHomework({title: title.trim(), description, studentIds, dueDate, status,
                     lessonId: (params && params.lessonId) || ''});
      toast(t('hw.created'));
      nav.back();
    }
  };

  if (!students.length) return (
    <div className="app stack">
      <StackBar t={t} title={t('hw.new')} onBack={nav.back} />
      <div className="screen">
        <Empty icon={<Icon.users size={34} />} title={t('lesson.noStudents')} text={t('lesson.noStudentsD')}
               action={t('st.add')} onAction={() => nav.push({name: 'student-new'})} />
      </div>
    </div>
  );

  const dueChips = [
    {id: addDays(todayISO(), 1), label: t('d.tomorrow')},
    {id: addDays(todayISO(), 7), label: t.plural('week', 1)},
  ];

  return (
    <div className="app stack">
      <StackBar t={t} title={editing ? t('hw.edit') : t('hw.new')} onBack={nav.back} />
      <div className="screen">
        <Field label={t('hw.name')} error={err}>
          <Input value={title} autoFocus={!editing} error={!!err} placeholder={t('hw.namePlaceholder')}
                 onChange={e => { setTitle(e.target.value); setErr(''); }} />
        </Field>
        <Field label={t('hw.description')}>
          <TextArea value={description} placeholder={t('hw.descriptionPlaceholder')}
                    onChange={e => setDescription(e.target.value)} />
        </Field>

        <SectionHead title={t('hw.students')} />
        <div className="rows">
          {students.map(st => {
            const on = studentIds.includes(st.id);
            return (
              <button key={st.id} className="row" onClick={() =>
                setStudentIds(on ? studentIds.filter(x => x !== st.id) : [...studentIds, st.id])}>
                <Avatar name={st.name} color={st.color} emoji={st.emoji} photo={st.photo} size={40} />
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

        <SectionHead title={t('hw.due')} />
        <div className="chips">
          {dueChips.map(c => (
            <button key={c.id} className={'chip' + (dueDate === c.id ? ' on' : '')}
                    onClick={() => setDueDate(c.id)}>{c.label}</button>
          ))}
          <button className={'chip' + (!dueChips.some(c => c.id === dueDate) ? ' on' : '')} onClick={() => setPick(true)}>
            <Icon.calendar size={16} />{fmtRelDate(t, dueDate)}
          </button>
        </div>

        {editing ? (
          <>
            <SectionHead title={t('hw.status')} />
            <Segmented value={status} onChange={setStatus}
                       options={HOMEWORK_STATUS.map(x => ({id: x, label: t('hw.' + x)}))} />
          </>
        ) : null}

        <div className="barpad" />
      </div>

      <div className="fixedbar">
        <Btn kind="pri" size="lg" wide onClick={submit}>{editing ? t('a.save') : t('hw.create')}</Btn>
        <div style={{height: 6}} />
        <Btn kind="ghost" wide onClick={nav.back}>{t('a.cancel')}</Btn>
      </div>

      <DatePickerSheet open={pick} value={dueDate} t={t} title={t('hw.due')} min={todayISO()}
                       onPick={setDueDate} onClose={() => setPick(false)} />
    </div>
  );
}

Object.assign(window.U, {HomeworkScreen, HomeworkCardScreen, HomeworkFormScreen, HomeworkRow, dueLabel, dueTone});
})();
