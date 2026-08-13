/* ══════════════════════════════════════════════════════════════════
   UROK+ · ФІНАНСИ
   ------------------------------------------------------------------
   Не бухгалтерія, а відповідь на чотири питання: скільки я заробив,
   скільки мені винні, скільки вже оплатили наперед і скільки ще
   попереду. Усе інше — зайве.

   ДВА РІЗНІ ЧИСЛА. «Дохід» — проведені заняття. «Отримано» —
   гроші, які вже в кишені. Різниця між ними і є борг чи
   передоплата. Показуємо обидва, бо викладачу потрібні обидва: одне
   для розуміння роботи, друге — для розуміння гаманця.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Empty, Stats, Bars, Segmented, StackBar, toast,
  A, sel, todayISO, addDays, parseISO, startOfWeek, startOfMonth, fmtMoney, fmtShortDate, fmtDayMonth, fmtRelDate,
} = window.U;

const PERIODS = ['day', 'week', 'month', 'year'];

/* Підпис під стовпчиком: у днях — число, у тижнях — дата початку,
   у місяцях — коротка назва, у роках — рік. */
function barLabel(t, kind, d){
  const date = parseISO(d.from);
  if (kind === 'day') return t.cal.dowShort[(date.getDay() + 6) % 7];
  if (kind === 'week') return String(date.getDate());
  if (kind === 'year') return d.key;
  return t.cal.monthNom[date.getMonth()].slice(0, 3);
}

function FinanceScreen({t, s, nav}){
  const [kind, setKind] = React.useState('month');
  const series = sel.incomeSeries(s, kind);
  const [idx, setIdx] = React.useState(series.length - 1);
  const point = series[Math.min(idx, series.length - 1)] || series[series.length - 1];
  const stats = sel.stats(s, point.from, point.to);
  const cur = s.settings.currency;
  const debtors = sel.debtors(s);
  const prepaid = sel.prepaid(s);
  const payments = s.payments
    .filter(p => p.date >= point.from && p.date <= point.to)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const periodTitle = kind === 'day' ? fmtRelDate(t, point.from)
    : kind === 'year' ? point.key
    : kind === 'week' ? `${fmtDayMonth(t, point.from)} – ${fmtDayMonth(t, point.to)}`
    : `${t.cal.monthNom[parseISO(point.from).getMonth()]} ${point.from.slice(0, 4)}`;

  return (
    <div className="app stack">
      <StackBar t={t} title={t('fin.title')} onBack={nav.back} />
      <div className="screen">
        <Segmented value={kind} onChange={k => { setKind(k); setIdx(sel.incomeSeries(s, k).length - 1); }}
                   options={PERIODS.map(p => ({id: p, label: t('fin.period' + p[0].toUpperCase() + p.slice(1))}))} />

        {/* головне число періоду */}
        <Card style={{marginTop: 14}}>
          <div className="lbl">{periodTitle}</div>
          <div className="dsp num" style={{fontSize: 34, fontWeight: 800, letterSpacing: '-.045em', margin: '4px 0 2px'}}>
            {fmtMoney(stats.earned, cur)}
          </div>
          <div className="muted" style={{fontSize: 13, fontWeight: 600}}>
            {t('fin.received')}: {fmtMoney(stats.received, cur)}
            {stats.expected ? ` · ${t('fin.expected')}: ${fmtMoney(stats.expected, cur)}` : ''}
          </div>
          <div style={{marginTop: 16}}>
            <Bars data={series} activeIndex={idx} onPick={i => setIdx(i)}
                  labelOf={d => barLabel(t, kind, d)} />
          </div>
        </Card>

        {/* борги й передоплати — окремо від доходу */}
        <div className="statgrid two" style={{marginTop: 12}}>
          <div className="stat">
            <div className="k">{t('fin.debt')}</div>
            <div className={'v num ellip' + (sel.totalDebt(s) ? ' neg' : '')}>
              {fmtMoney(sel.totalDebt(s), cur, {bare: true})}
            </div>
          </div>
          <div className="stat">
            <div className="k">{t('fin.prepay')}</div>
            <div className={'v num ellip' + (sel.totalPrepay(s) ? ' pos' : '')}>
              {fmtMoney(sel.totalPrepay(s), cur, {bare: true})}
            </div>
          </div>
        </div>

        <SectionHead title={t('pr.stats')} />
        <Stats items={[
          {k: t('fin.lessonsDone'), v: stats.lessons},
          {k: t('fin.avgPrice'), v: fmtMoney(stats.avgPrice, cur, {bare: true})},
          {k: t('fin.hours'), v: stats.hours},
        ]} />
        <div style={{height: 9}} />
        <Stats items={[
          {k: t('pr.activeStudents'), v: stats.students},
          {k: t('fin.canceledCount'), v: stats.canceled},
          {k: t('fin.missedCount'), v: stats.missed},
        ]} />

        {debtors.length ? (
          <>
            <SectionHead title={t('fin.debtors')} action={fmtMoney(sel.totalDebt(s), cur)} />
            <div className="rows">
              {debtors.map(x => (
                <Row key={x.student.id}
                     avatar={<Avatar name={x.student.name} color={x.student.color} emoji={x.student.emoji}
                                     photo={x.student.photo} size={40} />}
                     title={x.student.name}
                     sub={t.plural('lesson', x.unpaid.length)}
                     right={fmtMoney(x.debt, cur)} rightSub={t('st.debt')} rightTone="neg"
                     onClick={() => nav.push({name: 'student', params: {id: x.student.id}})} />
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionHead title={t('fin.debtors')} />
            <Card><div className="muted" style={{fontSize: 14}}>{t('fin.noDebtors')}</div></Card>
          </>
        )}

        {prepaid.length ? (
          <>
            <SectionHead title={t('fin.prepaidList')} action={fmtMoney(sel.totalPrepay(s), cur)} />
            <div className="rows">
              {prepaid.map(x => (
                <Row key={x.student.id}
                     avatar={<Avatar name={x.student.name} color={x.student.color} emoji={x.student.emoji}
                                     photo={x.student.photo} size={40} />}
                     title={x.student.name} sub={t('fin.prepay')}
                     right={fmtMoney(x.prepay, cur)}
                     onClick={() => nav.push({name: 'student', params: {id: x.student.id}})} />
              ))}
            </div>
          </>
        ) : null}

        <SectionHead title={t('fin.payments')} action={payments.length ? String(payments.length) : null} />
        {payments.length ? (
          <div className="rows joined">
            {payments.slice(0, 12).map(p => {
              const st = sel.student(s, p.studentId);
              return (
                <Row key={p.id} icon={p.type === 'prepay' ? <Icon.wallet size={18} /> : <Icon.cash size={18} />}
                     accent={p.type === 'prepay'}
                     title={st ? st.name : t('st.title')}
                     sub={`${fmtShortDate(t, p.date)} · ${t('st.' + p.method)}${p.type === 'prepay' ? ' · ' + t('fin.prepay') : ''}`}
                     right={fmtMoney(p.amount, cur)}
                     onClick={st ? () => nav.push({name: 'student', params: {id: st.id}}) : undefined} />
              );
            })}
          </div>
        ) : (
          <Card><div className="muted" style={{fontSize: 14}}>{t('fin.noPayments')}</div></Card>
        )}

        <div className="hint" style={{marginTop: 16, lineHeight: 1.5}}>{t('fin.hint')}</div>
        <div style={{height: 16}} />
      </div>
    </div>
  );
}

Object.assign(window.U, {FinanceScreen, barLabel, PERIODS});
})();
