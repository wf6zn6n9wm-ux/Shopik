/* ══════════════════════════════════════════════════════════════════
   UROK+ · УЧНІ
   ------------------------------------------------------------------
   Список, форма й картка учня. Картка — маленька CRM: контакти,
   гроші, найближчі заняття, історія, нотатки. Усе, що викладач
   інакше тримає в голові.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Field, Input, TextArea, Empty, Sheet, Confirm,
  Chips, StackBar, PickerField, DatePickerSheet, Stepper, AppBar, toast,
  A, sel, store, AVATAR_COLORS, PAYMENT_METHODS, FREE_STUDENT_LIMIT,
  todayISO, addDays, fmtRelDate, fmtDayMonth, fmtShortDate, fmtMoney, fmtDur, duration, currencySymbol, initials, pickColor,
} = window.U;

/* ── список ────────────────────────────────────────────────── */
function StudentsScreen({t, s, nav}){
  const [q, setQ] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);

  const all = showArchived ? s.students : sel.activeStudents(s);
  const needle = q.trim().toLowerCase();
  const list = (needle
    ? all.filter(x => (x.name + ' ' + (x.subject || '')).toLowerCase().includes(needle))
    : all
  ).slice().sort((a, b) => a.name.localeCompare(b.name, t.tag));

  const archivedCount = s.students.length - sel.activeStudents(s).length;

  const add = () => {
    if (!sel.canAddStudent(s)) return nav.push({name: 'premium', params: {reason: 'students'}});
    nav.push({name: 'student-new'});
  };

  return (
    <div className="app tabs">
      <AppBar title={t('st.title')}
              sub={s.students.length ? t.plural('student', sel.activeStudents(s).length) : null}
              right={<IconBtn icon={<Icon.plus size={22} />} soft label={t('st.add')} onClick={add} />} />
      <div className="screen">
        {sel.activeStudents(s).length ? (
          <>
            <div className="search">
              <Icon.search size={18} />
              <input className="inp" value={q} placeholder={t('st.searchPlaceholder')}
                     onChange={e => setQ(e.target.value)} />
            </div>

            {list.length ? (
              <div className="rows" style={{marginTop: 14}}>
                {list.map(st => {
                  const stat = sel.studentStats(s, st.id);
                  return (
                    <Row key={st.id}
                         className={st.archived ? 'cancel' : ''}
                         avatar={<Avatar name={st.name} color={st.color} emoji={st.emoji} size={44} />}
                         title={st.name}
                         sub={[st.subject, t.plural('lesson', stat.total)].filter(Boolean).join(' · ')}
                         right={stat.debt ? fmtMoney(stat.debt, s.settings.currency) : ''}
                         rightSub={stat.debt ? t('st.debt') : ''}
                         rightTone="neg"
                         chevron
                         onClick={() => nav.push({name: 'student', params: {id: st.id}})} />
                  );
                })}
              </div>
            ) : (
              <Empty icon={<Icon.search size={34} />} title={t('st.notFound')} text={t('st.notFoundD')} />
            )}

            {archivedCount ? (
              <div style={{textAlign: 'center', marginTop: 16}}>
                <Btn kind="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? t('a.close') : `${t('st.showArchived')} (${archivedCount})`}
                </Btn>
              </div>
            ) : null}

            {!sel.isPremium(s) ? (
              <button className="card pad press" style={{width: '100%', textAlign: 'left', marginTop: 18, display: 'flex', gap: 12, alignItems: 'center'}}
                      onClick={() => nav.push({name: 'premium'})}>
                <span style={{width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
                              background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none'}}>
                  <Icon.crown size={19} />
                </span>
                <span style={{flex: 1, minWidth: 0}}>
                  <span className="h3" style={{display: 'block'}}>{t('sub.free')}</span>
                  <span className="ds muted" style={{display: 'block'}}>
                    {t('sub.freeD', {used: sel.activeStudents(s).length, limit: FREE_STUDENT_LIMIT})}
                  </span>
                </span>
                <Icon.chevronR size={18} className="chev" />
              </button>
            ) : null}
          </>
        ) : (
          <Empty icon={<Icon.users size={38} />} title={t('st.emptyT')} text={t('st.emptyD')}
                 action={t('st.add')} onAction={add} />
        )}
      </div>
    </div>
  );
}

/* ── форма ─────────────────────────────────────────────────── */
function StudentFormScreen({t, s, nav, params}){
  const editing = params && params.id ? sel.student(s, params.id) : null;
  const [name, setName] = React.useState(editing ? editing.name : '');
  const [subject, setSubject] = React.useState(editing ? editing.subject : '');
  const [price, setPrice] = React.useState(editing ? editing.price : s.settings.defaultPrice);
  const [phone, setPhone] = React.useState(editing ? editing.phone : '');
  const [email, setEmail] = React.useState(editing ? editing.email : '');
  const [birthday, setBirthday] = React.useState(editing ? editing.birthday : '');
  const [notes, setNotes] = React.useState(editing ? editing.notes : '');
  const [color, setColor] = React.useState(editing ? editing.color : AVATAR_COLORS[0]);
  const [extra, setExtra] = React.useState(!!(editing && (editing.phone || editing.email || editing.birthday || editing.notes)));
  const [err, setErr] = React.useState('');
  const [pick, setPick] = React.useState(false);

  const submit = () => {
    if (!name.trim()) return setErr(t('st.nameRequired'));
    const data = {name, subject, price, phone, email, birthday, notes, color};
    if (editing){
      A.updateStudent(editing.id, data);
      toast(t('st.updated'));
      nav.back();
    } else {
      if (!sel.canAddStudent(s)) return nav.replace({name: 'premium', params: {reason: 'students'}});
      const st = A.addStudent(data);
      toast(t('st.added'));
      nav.replace({name: 'student', params: {id: st.id}});
    }
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={editing ? t('st.edit') : t('st.add')} onBack={nav.back} />
      <div className="screen">
        <div style={{display: 'flex', justifyContent: 'center', margin: '6px 0 4px'}}>
          <Avatar name={name || '?'} color={color} size={88} />
        </div>
        <div className="chips" style={{justifyContent: 'center', marginTop: 14}}>
          {AVATAR_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} aria-label={t('st.color')}
                    style={{width: 28, height: 28, borderRadius: '50%', background: c, flex: 'none',
                            boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 4px ' + c : 'none'}} />
          ))}
        </div>

        <Field label={t('st.name')} error={err}>
          <Input value={name} autoFocus={!editing} error={!!err} placeholder={t('st.namePlaceholder')}
                 onChange={e => { setName(e.target.value); setErr(''); }} />
        </Field>
        <Field label={t('st.subject')}>
          <Input value={subject} placeholder={t('lesson.subjectPlaceholder')} onChange={e => setSubject(e.target.value)} />
        </Field>
        <Field label={t('st.price')}>
          <Stepper value={price} onChange={setPrice} step={50} min={0}
                   format={v => `${v} ${currencySymbol(s.settings.currency)}`} />
        </Field>

        <button className="row" style={{marginTop: 22}} onClick={() => setExtra(!extra)}>
          <span style={{width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', flex: 'none',
                        background: 'var(--surface-2)', color: 'var(--ink-2)'}}><Icon.doc size={19} /></span>
          <span className="nm" style={{flex: 1}}>{t('st.extra')}</span>
          <span style={{transform: extra ? 'rotate(180deg)' : 'none', transition: 'transform .22s', color: 'var(--ink-3)', display: 'flex'}}>
            <Icon.chevronD size={18} />
          </span>
        </button>

        {extra ? (
          <div>
            <Field label={t('st.phone')}>
              <Input type="tel" inputMode="tel" value={phone} placeholder="+380 00 000 00 00"
                     onChange={e => setPhone(e.target.value)} />
            </Field>
            <Field label={t('st.email')}>
              <Input type="email" inputMode="email" value={email} placeholder="mail@example.com"
                     onChange={e => setEmail(e.target.value)} />
            </Field>
            <PickerField label={t('st.birthday')} value={birthday ? fmtShortDate(t, birthday) : ''}
                         placeholder={t('c.optional')} icon={<Icon.cake size={17} />} onClick={() => setPick(true)} />
            <Field label={t('st.notes')}>
              <TextArea value={notes} placeholder={t('st.notesPlaceholder')} onChange={e => setNotes(e.target.value)} />
            </Field>
          </div>
        ) : null}

        <div className="barpad" />
      </div>

      <div className="fixedbar">
        <Btn kind="pri" size="lg" wide onClick={submit}>{editing ? t('a.save') : t('st.add')}</Btn>
        <div style={{height: 6}} />
        <Btn kind="ghost" wide onClick={nav.back}>{t('a.cancel')}</Btn>
      </div>

      <DatePickerSheet open={pick} value={birthday || '2010-01-01'} t={t} title={t('st.birthday')}
                       max={todayISO()} onPick={setBirthday} onClose={() => setPick(false)} />
    </div>
  );
}

/* ── оплата ────────────────────────────────────────────────── */
function PaymentSheet({open, onClose, t, s, student}){
  const [amount, setAmount] = React.useState(student ? (student.price || s.settings.defaultPrice) : 0);
  const [method, setMethod] = React.useState('cash');
  React.useEffect(() => { if (open && student) setAmount(student.price || s.settings.defaultPrice); }, [open]);
  if (!student) return null;
  return (
    <Sheet open={open} onClose={onClose} title={t('st.addPayment')}>
      <Field label={t('st.paymentAmount')}>
        <Stepper value={amount} onChange={setAmount} step={50} min={0}
                 format={v => `${v} ${currencySymbol(s.settings.currency)}`} />
      </Field>
      <Field label={t('st.paymentMethod')}>
        <Chips value={method} onChange={setMethod}
               options={PAYMENT_METHODS.map(m => ({id: m, label: t('st.' + m)}))} />
      </Field>
      <div style={{height: 16}} />
      <Btn kind="pri" wide onClick={() => {
        A.addPayment({studentId: student.id, amount, method});
        toast(t('st.paymentAdded'));
        onClose();
      }}>{t('a.add')}</Btn>
      <div style={{height: 8}} />
      <Btn kind="ghost" wide onClick={onClose}>{t('a.cancel')}</Btn>
    </Sheet>
  );
}

/* ── картка учня ───────────────────────────────────────────── */
function StudentScreen({t, s, nav, params}){
  const st = sel.student(s, params.id);
  const [pay, setPay] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [del, setDel] = React.useState(false);
  if (!st) return (
    <div className="app stack">
      <StackBar t={t} title={t('st.title')} onBack={nav.back} />
      <div className="screen"><Empty icon={<Icon.users size={34} />} title={t('c.noData')} /></div>
    </div>
  );
  const stat = sel.studentStats(s, st.id);
  const payments = s.payments.filter(p => p.studentId === st.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const cur = s.settings.currency;

  return (
    <div className="app stack">
      <StackBar t={t} title={t('st.title')} onBack={nav.back}
                right={<IconBtn icon={<Icon.dots size={20} />} label={t('a.more')} onClick={() => setMenu(true)} />} />
      <div className="screen">
        {/* шапка */}
        <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '4px 2px 2px'}}>
          <Avatar name={st.name} color={st.color} emoji={st.emoji} size={62} />
          <div style={{minWidth: 0, flex: 1}}>
            <div className="dsp ellip" style={{fontSize: 22, fontWeight: 800, letterSpacing: '-.04em'}}>{st.name}</div>
            <div className="muted ellip" style={{fontSize: 13.5, fontWeight: 600, marginTop: 2}}>
              {[st.subject, st.price ? fmtMoney(st.price, cur) : ''].filter(Boolean).join(' · ')}
            </div>
            {st.archived ? <span className="pill" style={{marginTop: 6}}>{t('st.archived')}</span> : null}
          </div>
        </div>

        {/* цифри */}
        <div className="statgrid" style={{marginTop: 18}}>
          <div className="stat">
            <div className="k">{t('st.lessonsCount')}</div>
            <div className="v num">{stat.total}</div>
          </div>
          <div className="stat">
            <div className="k">{t('st.income')}</div>
            <div className="v num ellip">{fmtMoney(stat.income, cur, {bare: true})}</div>
          </div>
          <div className="stat">
            <div className="k">{t('st.debt')}</div>
            <div className="v num ellip" style={{color: stat.debt ? 'var(--neg)' : undefined}}>
              {fmtMoney(stat.debt, cur, {bare: true})}
            </div>
          </div>
        </div>

        {/* контакти */}
        {(st.phone || st.email || st.birthday) ? (
          <>
            <SectionHead title={t('st.contacts')} />
            <div className="rows joined">
              {st.phone ? (
                <Row icon={<Icon.phone size={18} />} title={st.phone} sub={t('st.callAction')}
                     onClick={() => { if (typeof window !== 'undefined') window.location.href = 'tel:' + st.phone; }} />
              ) : null}
              {st.email ? (
                <Row icon={<Icon.mail size={18} />} title={st.email} sub={t('st.writeAction')}
                     onClick={() => { if (typeof window !== 'undefined') window.location.href = 'mailto:' + st.email; }} />
              ) : null}
              {st.birthday ? (
                <Row icon={<Icon.cake size={18} />} title={fmtShortDate(t, st.birthday)} sub={t('st.birthday')} />
              ) : null}
            </div>
          </>
        ) : null}

        {/* найближчі */}
        <SectionHead title={t('lesson.upcoming')}
                     action={<span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}><Icon.plus size={15} />{t('a.add')}</span>}
                     onAction={() => nav.push({name: 'lesson-new', params: {studentId: st.id}})} />
        {stat.upcoming.length ? (
          <div className="rows">
            {stat.upcoming.slice(0, 6).map(l => (
              <Row key={l.id} icon={<Icon.calendar size={18} />} accent
                   title={`${fmtRelDate(t, l.date)}, ${l.start}`}
                   sub={[l.subject, fmtDur(t, duration(l.start, l.end))].filter(Boolean).join(' · ')}
                   right={fmtMoney(l.price, cur)}
                   onClick={() => nav.push({name: 'lesson', params: {id: l.id}})} />
            ))}
          </div>
        ) : (
          <Card><div className="muted" style={{fontSize: 14}}>{t('cal.noLessons')}</div></Card>
        )}

        {/* оплати */}
        <SectionHead title={t('st.payments')}
                     action={<span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}><Icon.plus size={15} />{t('a.add')}</span>}
                     onAction={() => setPay(true)} />
        {payments.length ? (
          <div className="rows joined">
            {payments.slice(0, 8).map(p => (
              <Row key={p.id} icon={<Icon.cash size={18} />} title={fmtMoney(p.amount, cur)}
                   sub={`${fmtShortDate(t, p.date)} · ${t('st.' + p.method)}`} />
            ))}
          </div>
        ) : (
          <Card><div className="muted" style={{fontSize: 14}}>{t('st.noPayments')}</div></Card>
        )}

        {/* історія */}
        <SectionHead title={t('lesson.history')} />
        {stat.history.length ? (
          <div className="rows joined">
            {stat.history.slice(0, 10).map(l => (
              <Row key={l.id} icon={<Icon.check size={18} />}
                   title={`${fmtShortDate(t, l.date)}, ${l.start}`}
                   sub={t('lesson.' + l.status) + (l.paid ? ' · ' + t('lesson.paid') : '')}
                   right={fmtMoney(l.price, cur)}
                   onClick={() => nav.push({name: 'lesson', params: {id: l.id}})} />
            ))}
          </div>
        ) : (
          <Card><div className="muted" style={{fontSize: 14}}>{t('lesson.noHistory')}</div></Card>
        )}

        {/* нотатки */}
        {st.notes ? (
          <>
            <SectionHead title={t('st.notes')} />
            <Card><div style={{fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap'}}>{st.notes}</div></Card>
          </>
        ) : null}

        <div className="hint" style={{textAlign: 'center', marginTop: 18}}>
          {t('st.since', {date: fmtShortDate(t, st.createdAt)})}
        </div>
        <div className="barpad" />
      </div>

      <div className="fixedbar">
        <Btn kind="pri" size="lg" wide icon={<Icon.plus size={19} />}
             onClick={() => nav.push({name: 'lesson-new', params: {studentId: st.id}})}>
          {t('cal.addLesson')}
        </Btn>
      </div>

      <PaymentSheet open={pay} onClose={() => setPay(false)} t={t} s={s} student={st} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={st.name}>
        <div className="rows" style={{marginTop: 6}}>
          <Row icon={<Icon.edit size={18} />} title={t('st.edit')}
               onClick={() => { setMenu(false); nav.push({name: 'student-edit', params: {id: st.id}}); }} />
          <Row icon={<Icon.doc size={18} />} title={st.archived ? t('st.unarchive') : t('st.archive')}
               onClick={() => { A.updateStudent(st.id, {archived: !st.archived}); setMenu(false); toast(t('st.updated')); }} />
          <Row icon={<Icon.trash size={18} />} danger title={t('a.delete')}
               onClick={() => { setMenu(false); setDel(true); }} />
        </div>
        <div style={{height: 10}} />
        <Btn kind="ghost" wide onClick={() => setMenu(false)}>{t('a.cancel')}</Btn>
      </Sheet>

      <Confirm open={del} text={t('st.deleteConfirm')} danger
               confirmLabel={t('a.delete')} cancelLabel={t('a.cancel')}
               onClose={() => setDel(false)}
               onConfirm={() => { A.removeStudent(st.id); setDel(false); toast(t('st.deleted')); nav.back(); }} />
    </div>
  );
}

Object.assign(window.U, {StudentsScreen, StudentFormScreen, StudentScreen, PaymentSheet});
})();
