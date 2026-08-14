/* ══════════════════════════════════════════════════════════════════
   UROK+ · ПРОФІЛЬ, НАЛАШТУВАННЯ, ПІДПИСКА
   ------------------------------------------------------------------
   Профіль — вітрина (хто я, мої цифри, спільнота), налаштування —
   робота (мова, тема, гроші, сповіщення, акаунт). Підписка живе
   окремим екраном і працює через фасад Billing: у вебі демо, у
   збірці для App Store — StoreKit, код екрана той самий.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Field, Input, TextArea, Empty, Sheet, Confirm,
  Segmented, Chips, Switch, SwitchRow, StackBar, AppBar, toast, Stats, photoFromFile,
  A, sel, store, Billing, Web, PRODUCTS, PLAN_ORDER, planMonthly, planSaving, fmtPrice,
  LANGS, CURRENCIES, TIMEZONES, FREE_STUDENT_LIMIT, VERSION,
  todayISO, addDays, startOfWeek, weekDays, fmtMoney, fmtShortDate, fmtDayMonth, currencySymbol,
  applyTheme, applyLang, loadDemo, unloadDemo, hasDemo, copyText, isEmbedded,
} = window.U;

/* ── профіль ───────────────────────────────────────────────── */
function ProfileScreen({t, s, nav}){
  const month = sel.periodRange('month', todayISO());
  const stats = sel.stats(s, month.from, month.to);
  const premium = sel.isPremium(s);
  const hwActive = sel.homeworkActive(s).length;
  const subjects = (s.profile.subjects || []).filter(Boolean);

  return (
    <div className="app tabs">
      <AppBar title={t('pr.title')}
              right={<IconBtn icon={<Icon.gear size={21} />} label={t('pr.settings')}
                              onClick={() => nav.push({name: 'settings'})} />} />
      <div className="screen">
        <button className="card pad press" style={{width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14}}
                onClick={() => nav.push({name: 'profile-edit'})}>
          <Avatar name={s.profile.name || 'U'} color={s.profile.color} emoji={s.profile.emoji}
                  photo={s.profile.photo} size={58} />
          <span style={{flex: 1, minWidth: 0}}>
            <span className="dsp ellip" style={{display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-.035em'}}>
              {s.profile.name || t('pr.title')}
            </span>
            <span className="ds muted ellip" style={{display: 'block', marginTop: 2}}>
              {subjects.length ? subjects.join(', ') : (s.auth.phone || s.profile.email || t('pr.editProfile'))}
            </span>
          </span>
          {premium ? <span className="pill acc"><Icon.crown size={13} />{t('sub.premiumBadge')}</span> : null}
          <Icon.chevronR size={18} className="chev" />
        </button>

        {s.profile.bio ? (
          <div className="muted" style={{fontSize: 13.5, lineHeight: 1.5, margin: '12px 2px 0'}}>{s.profile.bio}</div>
        ) : null}

        {/* як пройшов місяць */}
        <SectionHead title={t('fin.summary', {period: t.cal.monthNom[parseInt(month.from.slice(5, 7), 10) - 1]})}
                     action={t('dash.openFinance')} onAction={() => nav.push({name: 'finance'})} />
        <Stats items={[
          {k: t('fin.lessonsDone'), v: stats.lessons, onClick: () => nav.push({name: 'finance'})},
          {k: t('pr.activeStudents'), v: stats.students, onClick: () => nav.go('students')},
          {k: t('dash.income'), v: fmtMoney(stats.earned, s.settings.currency, {bare: true}),
           onClick: () => nav.push({name: 'finance'})},
        ]} />
        <div style={{height: 9}} />
        <Stats items={[
          {k: t('fin.avgPrice'), v: fmtMoney(stats.avgPrice, s.settings.currency, {bare: true})},
          {k: t('pr.homework'), v: `${stats.homeworkDone}/${stats.homeworkTotal}`,
           onClick: () => nav.push({name: 'homework'})},
          {k: t('fin.canceledCount'), v: stats.canceled + stats.missed},
        ]} />

        {!premium ? (
          <button className="press" style={{width: '100%', textAlign: 'left', marginTop: 16, border: 0, padding: '16px 17px',
                                            borderRadius: 'var(--r-lg)', color: 'var(--hero-ink)', display: 'flex', gap: 13, alignItems: 'center',
                                            background: 'linear-gradient(120deg,var(--hero-1),var(--hero-2))', boxShadow: 'var(--shadow-3)'}}
                  onClick={() => nav.push({name: 'premium'})}>
            <Icon.crown size={26} />
            <span style={{flex: 1, minWidth: 0}}>
              <span className="dsp" style={{display: 'block', fontSize: 17, fontWeight: 800, letterSpacing: '-.03em'}}>{t('sub.title')}</span>
              <span style={{display: 'block', fontSize: 12.5, fontWeight: 600, opacity: .85, marginTop: 2}}>{t('sub.tagline')}</span>
            </span>
            <Icon.chevronR size={18} />
          </button>
        ) : null}

        <SectionHead title={t('pr.work')} />
        <div className="rows joined">
          <Row icon={<Icon.chart size={19} />} accent title={t('pr.finance')} sub={t('pr.financeD')} chevron
               onClick={() => nav.push({name: 'finance'})} />
          <Row icon={<Icon.clipboard size={19} />} title={t('pr.homework')}
               sub={hwActive ? t.plural('task', hwActive) : t('pr.homeworkD')} chevron
               onClick={() => nav.push({name: 'homework'})} />
          <Row icon={<Icon.users size={19} />} title={t('nav.students')}
               sub={t.plural('student', sel.activeStudents(s).length)} chevron
               onClick={() => nav.go('students')} />
        </div>

        <SectionHead title={t('pr.market')} />
        <div className="rows joined">
          <Row icon={<Icon.bag size={19} />} title={t('pr.market')} sub={t('pr.marketD')} chevron
               onClick={() => nav.go('market')} />
          <Row icon={<Icon.trophy size={19} />} title={t('pr.contest')} sub={t('pr.contestD')} chevron
               onClick={() => nav.push({name: 'contest'})} />
          <Row icon={<Icon.star size={19} />} title={t('pr.rating')} sub={t('pr.ratingD')} chevron
               onClick={() => nav.push({name: 'rating'})} />
          <Row icon={<Icon.coffee size={19} />} title={t('pr.coffee')} sub={t('pr.coffeeD')} chevron
               onClick={() => nav.push({name: 'coffee'})} />
        </div>

        <SectionHead title={t('pr.community')} />
        <div className="rows joined">
          <Row icon={<Icon.telegram size={19} />} title={t('pr.telegram')} sub="@urokplus" chevron
               onClick={() => openLink('https://t.me/urokplus')} />
          <Row icon={<Icon.instagram size={19} />} title={t('pr.instagram')} sub="@urokplus" chevron
               onClick={() => openLink('https://instagram.com/urokplus')} />
        </div>

        <SectionHead title={t('pr.settings')} />
        <div className="rows joined">
          <Row icon={<Icon.gear size={19} />} title={t('se.title')} chevron onClick={() => nav.push({name: 'settings'})} />
          <Row icon={<Icon.crown size={19} />} title={t('se.subscription')}
               sub={premium ? t('sub.active') : t('sub.free')} chevron onClick={() => nav.push({name: 'premium'})} />
          <Row icon={<Icon.help size={19} />} title={t('se.help')} chevron onClick={() => nav.push({name: 'help'})} />
        </div>

        <div className="hint" style={{textAlign: 'center', marginTop: 20}}>Urok+ · {VERSION}</div>
      </div>
    </div>
  );
}

function openLink(url){
  if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
}

/* ── редагування профілю ───────────────────────────────────── */
function ProfileEditScreen({t, s, nav}){
  const [name, setName] = React.useState(s.profile.name);
  const [email, setEmail] = React.useState(s.profile.email);
  const [color, setColor] = React.useState(s.profile.color);
  const [photo, setPhoto] = React.useState(s.profile.photo || '');
  const [subjects, setSubjects] = React.useState((s.profile.subjects || []).join(', '));
  const [bio, setBio] = React.useState(s.profile.bio || '');
  return (
    <div className="app stack">
      <StackBar t={t} title={t('pr.editProfile')} onBack={nav.back} />
      <div className="screen">
        <div style={{display: 'flex', justifyContent: 'center', margin: '6px 0 4px'}}>
          <Avatar name={name || 'U'} color={color} photo={photo} size={88} />
        </div>
        <div style={{display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12}}>
          <label className="btn sec sm" style={{cursor: 'pointer'}}>
            {photo ? t('st.photo') : t('st.photoAdd')}
            <input type="file" accept="image/*" style={{display: 'none'}}
                   onChange={e => {
                     const file = e.target.files && e.target.files[0];
                     if (!file) return;
                     photoFromFile(file).then(setPhoto).catch(() => toast(t('a.retry')));
                   }} />
          </label>
          {photo ? <Btn kind="ghost" size="sm" onClick={() => setPhoto('')}>{t('st.photoRemove')}</Btn> : null}
        </div>
        <div className="chips" style={{justifyContent: 'center', marginTop: 14}}>
          {window.U.AVATAR_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} aria-label={t('st.color')}
                    style={{width: 28, height: 28, borderRadius: '50%', background: c, flex: 'none',
                            boxShadow: color === c ? '0 0 0 2px var(--bg), 0 0 0 4px ' + c : 'none'}} />
          ))}
        </div>
        <Field label={t('st.name')}>
          <Input value={name} placeholder={t('au.namePlaceholder')} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('st.email')}>
          <Input type="email" value={email} placeholder="mail@example.com" onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field label={t('pr.subjects')} hint={t('c.optional')}>
          <Input value={subjects} placeholder={t('pr.subjectsPlaceholder')} onChange={e => setSubjects(e.target.value)} />
        </Field>
        <Field label={t('pr.bio')}>
          <TextArea value={bio} placeholder={t('pr.bioPlaceholder')} onChange={e => setBio(e.target.value)} />
        </Field>
        <div style={{height: 20}} />
        <Btn kind="pri" size="lg" wide onClick={() => {
          A.setProfile({
            name: name.trim(), email, color, photo, bio,
            subjects: subjects.split(',').map(x => x.trim()).filter(Boolean),
          });
          toast(t('c.saved'));
          nav.back();
        }}>{t('a.save')}</Btn>
      </div>
    </div>
  );
}

/* ── налаштування ──────────────────────────────────────────── */
function SettingsScreen({t, s, nav}){
  const [sheet, setSheet] = React.useState('');
  const [confirmWipe, setConfirmWipe] = React.useState(false);
  const [confirmOut, setConfirmOut] = React.useState(false);
  const set = s.settings;
  const lang = LANGS.find(l => l.id === set.lang) || LANGS[0];
  const themeLabel = {system: t('se.themeSystem'), light: t('se.themeLight'), dark: t('se.themeDark')}[set.theme];

  const exportData = () => {
    const json = JSON.stringify(store.get(), null, 2);
    /* У вбудованій сторінці браузер не дає зберегти файл — тоді
       кладемо дані в буфер обміну, а не вдаємо, що щось сталося. */
    if (isEmbedded()){
      copyText(json).then(ok => toast(ok ? t('c.copied') : t('sub.notAvailable')));
      return;
    }
    try {
      const blob = new Blob([json], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `urok-plus-${todayISO()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t('se.exported'));
    } catch (e) { copyText(json).then(ok => toast(ok ? t('c.copied') : t('c.noData'))); }
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={t('se.title')} onBack={nav.back} />
      <div className="screen">
        <SectionHead title={t('se.general')} tight />
        <div className="rows joined">
          <Row icon={<Icon.globe size={19} />} title={t('se.lang')} right={`${lang.flag} ${lang.name}`}
               onClick={() => setSheet('lang')} chevron />
          <Row icon={set.theme === 'dark' ? <Icon.moon size={19} /> : <Icon.sun size={19} />} title={t('se.theme')}
               right={themeLabel} onClick={() => setSheet('theme')} chevron />
          <Row icon={<Icon.wallet size={19} />} title={t('se.currency')}
               right={`${currencySymbol(set.currency)} ${set.currency}`} onClick={() => setSheet('currency')} chevron />
          <Row icon={<Icon.pin size={19} />} title={t('se.tz')} right={set.tz} onClick={() => setSheet('tz')} chevron />
        </div>

        <SectionHead title={t('lesson.one')} />
        <div className="rows joined">
          <Row icon={<Icon.clock size={19} />} title={t('se.defaultDuration')}
               right={`${set.defaultDuration} ${t('d.min')}`} onClick={() => setSheet('duration')} chevron />
          <Row icon={<Icon.cash size={19} />} title={t('se.defaultPrice')}
               right={fmtMoney(set.defaultPrice, set.currency)} onClick={() => setSheet('price')} chevron />
        </div>

        <SectionHead title={t('se.notifications')} />
        <div className="rows joined">
          <SwitchRow icon={<Icon.bell size={19} />} title={t('se.notifLesson')} sub={t('se.notifLessonD')}
                     on={set.notifications.lesson}
                     onChange={v => A.setSettings({notifications: {...set.notifications, lesson: v}})} />
          <SwitchRow icon={<Icon.wallet size={19} />} title={t('se.notifPayment')} sub={t('se.notifPaymentD')}
                     on={set.notifications.payment}
                     onChange={v => A.setSettings({notifications: {...set.notifications, payment: v}})} />
          <SwitchRow icon={<Icon.clipboard size={19} />} title={t('se.notifHomework')} sub={t('se.notifHomeworkD')}
                     on={set.notifications.homework}
                     onChange={v => A.setSettings({notifications: {...set.notifications, homework: v}})} />
          <SwitchRow icon={<Icon.sparkle size={19} />} title={t('se.notifNews')} sub={t('se.notifNewsD')}
                     on={set.notifications.news}
                     onChange={v => A.setSettings({notifications: {...set.notifications, news: v}})} />
        </div>

        <SectionHead title={t('se.account')} />
        <div className="rows joined">
          <Row icon={<Icon.user size={19} />} title={t('pr.editProfile')} chevron
               onClick={() => nav.push({name: 'profile-edit'})} />
          <Row icon={<Icon.phone size={19} />} title={t('se.accountPhone')}
               right={s.auth.phone || '—'} />
          <Row icon={<Icon.crown size={19} />} title={t('se.subscription')}
               right={sel.isPremium(s) ? t('sub.active') : t('sub.free')} chevron
               onClick={() => nav.push({name: 'premium'})} />
          <SwitchRow icon={<Icon.sparkle size={19} />} title={t('se.demoData')} sub={t('se.demoDataD')}
                     on={hasDemo(s)} onChange={v => { v ? loadDemo(t) : unloadDemo(); toast(t('c.saved')); }} />
          <Row icon={<Icon.download size={19} />} title={t('se.exportData')} sub={t('se.exportDataD')}
               onClick={exportData} />
          <Row icon={<Icon.logout size={19} />} title={t('au.logout')} onClick={() => setConfirmOut(true)} />
          <Row icon={<Icon.trash size={19} />} danger title={t('se.clearData')} onClick={() => setConfirmWipe(true)} />
        </div>

        <SectionHead title={t('se.about')} />
        <div className="rows joined">
          <Row icon={<Icon.lock size={19} />} title={t('se.privacy')} chevron onClick={() => nav.push({name: 'privacy'})} />
          <Row icon={<Icon.doc size={19} />} title={t('se.terms')} chevron onClick={() => nav.push({name: 'terms'})} />
          <Row icon={<Icon.help size={19} />} title={t('se.help')} sub={t('se.helpD')} chevron
               onClick={() => nav.push({name: 'help'})} />
          <Row icon={<Icon.sparkle size={19} />} title={t('se.version')} right={VERSION} />
        </div>
        <div style={{height: 24}} />
      </div>

      {/* мова */}
      <Sheet open={sheet === 'lang'} onClose={() => setSheet('')} title={t('se.lang')}>
        <div className="rows" style={{marginTop: 6}}>
          {LANGS.map(l => (
            <Row key={l.id} title={`${l.flag}  ${l.name}`}
                 right={set.lang === l.id ? <Icon.check size={18} stroke={3} /> : null}
                 onClick={() => { A.setSettings({lang: l.id}); applyLang(l.id); setSheet(''); toast(window.U.makeT(l.id)('se.langChanged')); }} />
          ))}
        </div>
        <div style={{height: 10}} />
      </Sheet>

      {/* тема */}
      <Sheet open={sheet === 'theme'} onClose={() => setSheet('')} title={t('se.theme')}>
        <div className="rows" style={{marginTop: 6}}>
          {[['system', t('se.themeSystem'), <Icon.gear size={19} />],
            ['light', t('se.themeLight'), <Icon.sun size={19} />],
            ['dark', t('se.themeDark'), <Icon.moon size={19} />]].map(([id, label, icon]) => (
            <Row key={id} icon={icon} title={label}
                 right={set.theme === id ? <Icon.check size={18} stroke={3} /> : null}
                 onClick={() => { A.setSettings({theme: id}); applyTheme(id); setSheet(''); }} />
          ))}
        </div>
        <div style={{height: 10}} />
      </Sheet>

      {/* валюта */}
      <Sheet open={sheet === 'currency'} onClose={() => setSheet('')} title={t('se.currency')}>
        <div className="rows" style={{marginTop: 6}}>
          {CURRENCIES.map(c => (
            <Row key={c.id} title={`${c.symbol}  ${c.id}`} sub={c.name}
                 right={set.currency === c.id ? <Icon.check size={18} stroke={3} /> : null}
                 onClick={() => { A.setSettings({currency: c.id}); setSheet(''); }} />
          ))}
        </div>
        <div style={{height: 10}} />
      </Sheet>

      {/* часовий пояс */}
      <Sheet open={sheet === 'tz'} onClose={() => setSheet('')} title={t('se.tz')}>
        <div className="rows" style={{marginTop: 6, maxHeight: '56vh', overflow: 'auto'}}>
          {TIMEZONES.map(z => (
            <Row key={z} title={z} right={set.tz === z ? <Icon.check size={18} stroke={3} /> : null}
                 onClick={() => { A.setSettings({tz: z}); setSheet(''); }} />
          ))}
        </div>
        <div style={{height: 10}} />
      </Sheet>

      {/* тривалість */}
      <Sheet open={sheet === 'duration'} onClose={() => setSheet('')} title={t('se.defaultDuration')}>
        <div className="chips" style={{marginTop: 8}}>
          {[30, 45, 60, 90, 120].map(d => (
            <button key={d} className={'chip' + (set.defaultDuration === d ? ' on' : '')}
                    onClick={() => { A.setSettings({defaultDuration: d}); setSheet(''); }}>{d} {t('d.min')}</button>
          ))}
        </div>
        <div style={{height: 16}} />
      </Sheet>

      {/* ціна */}
      <Sheet open={sheet === 'price'} onClose={() => setSheet('')} title={t('se.defaultPrice')}>
        <div className="chips" style={{marginTop: 8}}>
          {[200, 250, 300, 350, 400, 500, 600].map(p => (
            <button key={p} className={'chip' + (set.defaultPrice === p ? ' on' : '')}
                    onClick={() => { A.setSettings({defaultPrice: p}); setSheet(''); }}>
              {fmtMoney(p, set.currency)}
            </button>
          ))}
        </div>
        <div style={{height: 16}} />
      </Sheet>

      <Confirm open={confirmOut} text={t('au.logoutConfirm')} confirmLabel={t('au.logout')} cancelLabel={t('a.cancel')}
               onClose={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); A.logout(); }} />
      <Confirm open={confirmWipe} danger text={t('se.clearConfirm')} confirmLabel={t('a.delete')} cancelLabel={t('a.cancel')}
               onClose={() => setConfirmWipe(false)}
               onConfirm={() => { setConfirmWipe(false); A.wipe(); toast(t('se.cleared')); }} />
    </div>
  );
}

/* ── підписка ──────────────────────────────────────────────── */
function PremiumScreen({t, s, nav, params}){
  const [plan, setPlan] = React.useState('yearly');
  const [busy, setBusy] = React.useState(false);
  const premium = sel.isPremium(s);
  const p = PRODUCTS;

  const go = async () => {
    setBusy(true);
    try {
      const first = !s.premium.trialUsed;
      const res = first ? await Billing.trial() : await Billing.purchase(plan);
      setBusy(false);
      if (res.ok){
        toast(first ? t('sub.trialStarted') : t('c.saved'));
        nav.back();
      } else toast(t('sub.notAvailable'));
    } catch (e){
      setBusy(false);
      toast(t('sub.notAvailable'));
    }
  };

  /* Сторінку оплати відкриваємо в браузері й нічого не чекаємо:
     підписку підтягне «Відновити покупки», коли з'явиться ліцензійний
     сервер. Карток застосунок не бачить у жодному разі. */
  const payWeb = () => {
    if (!Web.enabled()) return toast(t('sub.webDemo'));
    openLink(Web.payUrl(plan, s.settings.lang));
    toast(t('sub.webOpened'));
  };

  const restore = async () => {
    const res = await Billing.restore();
    toast(res.ok ? t('sub.restored') : t('sub.notAvailable'));
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={t('se.subscription')} onBack={nav.back} />
      <div className="screen">
        <div style={{borderRadius: 'var(--r-lg)', padding: '26px 20px', textAlign: 'center', color: 'var(--hero-ink)',
                     background: 'linear-gradient(120deg,var(--hero-1),var(--hero-2))', boxShadow: 'var(--shadow-3)'}}>
          <Icon.crown size={40} />
          <div className="dsp" style={{fontSize: 26, fontWeight: 800, letterSpacing: '-.04em', marginTop: 10}}>
            {t('sub.title')}
          </div>
          <div style={{fontSize: 14, fontWeight: 600, opacity: .88, marginTop: 8, lineHeight: 1.5}}>
            {premium ? t('sub.activeUntil', {date: s.premium.until ? fmtShortDate(t, s.premium.until) : '—'}) : t('sub.tagline')}
          </div>
        </div>

        {params && params.reason === 'students' && !premium ? (
          <Card className="" style={{marginTop: 14, borderColor: 'var(--accent)'}}>
            <div className="h3">{t('sub.limitT')}</div>
            <div className="muted" style={{fontSize: 13.5, marginTop: 5, lineHeight: 1.5}}>
              {t('sub.limitD', {n: FREE_STUDENT_LIMIT})}
            </div>
          </Card>
        ) : null}

        <SectionHead title={t('mk.includes')} />
        <Card>
          {[['sub.f1', 'sub.f1d'], ['sub.f2', 'sub.f2d'], ['sub.f3', 'sub.f3d'], ['sub.f4'], ['sub.f5'], ['sub.f6']].map(([k, d]) => (
            <div className="feat" key={k}>
              <span className="ck"><Icon.check size={13} stroke={3} /></span>
              <span style={{minWidth: 0}}>
                <span style={{display: 'block', fontSize: 14.5, fontWeight: 700, letterSpacing: '-.015em'}}>{t(k)}</span>
                {d ? <span className="muted" style={{display: 'block', fontSize: 12.5, marginTop: 2}}>{t(d, {n: FREE_STUDENT_LIMIT})}</span> : null}
              </span>
            </div>
          ))}
        </Card>

        {!premium ? (
          <>
            <SectionHead title={t('sub.ctaShort')} />
            {/* 14, а не 10: плашка вигоди виступає за верхній край
                картки й на щільнішій сітці налазить на сусідню */}
            <div style={{display: 'grid', gap: 14}}>
              {PLAN_ORDER.map(id => {
                const product = p[id];
                const saving = planSaving(id);
                const perMonth = Math.round(planMonthly(id) * 100) / 100;
                const period = id === 'yearly' ? t('sub.perYear')
                  : id === 'quarterly' ? t('sub.perQuarter') : t('sub.perMonth');
                /* Плашку вигоди чіпляємо лише там, де вона справді
                   найбільша: два різні «−%» поруч читаються як шум. */
                const best = saving > 0 && saving === Math.max(...PLAN_ORDER.map(planSaving));
                return (
                  <button key={id} className={'plan' + (plan === id ? ' on' : '')} onClick={() => setPlan(id)}>
                    {best ? <span className="save">{t('sub.save', {percent: saving})}</span> : null}
                    <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                      <span style={{flex: 1, minWidth: 0}}>
                        <span className="h3" style={{display: 'block'}}>{t('sub.' + id)}</span>
                        {id !== 'monthly' ? (
                          <span className="muted" style={{display: 'block', fontSize: 12.5, marginTop: 2}}>
                            {t('sub.monthEquivalent', {price: fmtPrice(perMonth, product.currency)})}
                          </span>
                        ) : null}
                      </span>
                      <span style={{textAlign: 'right', flex: 'none'}}>
                        <span className="amt num">
                          {fmtPrice(product.price, product.currency)}<em>{period}</em>
                        </span>
                        {!Web.native() ? (
                          <span className="webprice">{t('sub.webPrice', {price: fmtPrice(product.web, product.currency)})}</span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {!Web.native() ? (
              <button className="btn line wide webpay" style={{marginTop: 14}} onClick={payWeb}>
                <Icon.globe size={18} />
                <span>
                  <b>{t('sub.web')}</b>
                  <i>{t('sub.webFrom', {price: fmtPrice(Web.cheapest(), p.monthly.currency)})}</i>
                </span>
              </button>
            ) : null}
            <Btn kind="ghost" wide style={{marginTop: 6}} onClick={restore}>{t('sub.restore')}</Btn>

            {/* Дрібний текст однією колонкою: спершу як влаштована
                оплата в магазині, далі — чому на сайті дешевше. */}
            <div className="fineprint">
              {t('sub.legal')}
              {!Web.native() ? ' ' + t('sub.webNote') : ''}
            </div>
            {/* Посилання на умови й політику мають бути на самому екрані
                підписки — цього вимагає App Store, і шукати їх у
                налаштуваннях користувач не зобов'язаний. */}
            <div className="legallinks">
              <button onClick={() => nav.push({name: 'terms'})}>{t('se.terms')}</button>
              <button onClick={() => nav.push({name: 'privacy'})}>{t('se.privacy')}</button>
            </div>
            <div className="barpad" />
          </>
        ) : (
          <>
            <SectionHead title={t('sub.manage')} />
            <div className="rows joined">
              <Row icon={<Icon.crown size={19} />} accent title={t('sub.active')}
                   sub={s.premium.until ? t('sub.activeUntil', {date: fmtShortDate(t, s.premium.until)}) : ''} />
              <Row icon={<Icon.share size={19} />} title={t('sub.manage')}
                   onClick={() => openLink('https://apps.apple.com/account/subscriptions')} chevron />
              <Row icon={<Icon.download size={19} />} title={t('sub.restore')} onClick={restore} />
            </div>
            <div style={{height: 24}} />
          </>
        )}
      </div>

      {!premium ? (
        <div className="fixedbar">
          <Btn kind="pri" size="lg" wide loading={busy} disabled={busy} onClick={go}>
            {s.premium.trialUsed ? t('sub.ctaShort') : t('sub.cta')}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

/* ── змагання й рейтинг ────────────────────────────────────────
   Дані демонстраційні, але місце користувача рахується з реальних
   занять: щойно з'явиться сервер, зміниться лише джерело списку. */
const FAKE_BOARD = [
  {name: 'Olena K.', n: 34}, {name: 'Kate L.', n: 31}, {name: 'Andrii H.', n: 27},
  {name: 'Iryna S.', n: 24}, {name: 'Mark D.', n: 21}, {name: 'Yulia P.', n: 18},
  {name: 'Taras M.', n: 15}, {name: 'Nina V.', n: 12},
];

function boardWith(s, t){
  const week = weekDays(todayISO());
  const mine = s.lessons.filter(l => l.date >= week[0] && l.date <= week[6] && l.status === 'done').length;
  const me = {name: s.profile.name || t('pr.you'), n: mine, me: true};
  return [...FAKE_BOARD, me].sort((a, b) => b.n - a.n);
}

function ContestScreen({t, s, nav, params}){
  const board = boardWith(s, t);
  const place = board.findIndex(x => x.me) + 1;
  /* Рейтинг і змагання показують один список: різниця в тому, що
     змагання пояснює правила, а рейтинг — просто таблиця. */
  const contest = !(params && params.mode === 'rating');
  return (
    <div className="app stack">
      <StackBar t={t} title={contest ? t('pr.contestTitle') : t('pr.ratingTitle')} onBack={nav.back} />
      <div className="screen">
        {contest ? (
        <div style={{borderRadius: 'var(--r-lg)', padding: '22px 18px', color: 'var(--hero-ink)', textAlign: 'center',
                     background: 'linear-gradient(120deg,var(--hero-1),var(--hero-2))', boxShadow: 'var(--shadow-3)'}}>
          <Icon.trophy size={34} />
          <div className="dsp" style={{fontSize: 24, fontWeight: 800, letterSpacing: '-.04em', marginTop: 8}}>
            {t('pr.place', {n: place})}
          </div>
          <div style={{fontSize: 13.5, fontWeight: 600, opacity: .86, marginTop: 6, lineHeight: 1.5}}>{t('pr.contestHint')}</div>
        </div>
        ) : null}
        <SectionHead title={contest ? t('pr.ratingTitle') : t('pr.place', {n: place})} tight={!contest} />
        <div className="rows joined">
          {board.map((x, i) => (
            <Row key={x.name + i}
                 avatar={<span className="dsp" style={{width: 32, height: 32, borderRadius: 10, flex: 'none', display: 'grid',
                                                       placeItems: 'center', fontWeight: 800, fontSize: 14,
                                                       background: x.me ? 'var(--accent)' : 'var(--surface-2)',
                                                       color: x.me ? 'var(--accent-ink)' : 'var(--ink-2)'}}>{i + 1}</span>}
                 title={x.me ? `${x.name} · ${t('pr.you')}` : x.name}
                 right={String(x.n)} rightSub={t('st.lessonsCount').toLowerCase()} />
          ))}
        </div>
        <div className="hint" style={{textAlign: 'center', marginTop: 16}}>{t('c.demo')}</div>
      </div>
    </div>
  );
}

function CoffeeScreen({t, s, nav}){
  const amounts = [50, 100, 200];
  return (
    <div className="app stack">
      <StackBar t={t} title={t('pr.coffeeTitle')} onBack={nav.back} />
      <div className="screen">
        <div className="empty" style={{padding: '26px 10px 10px'}}>
          <div className="ic"><Icon.coffee size={38} /></div>
          <div className="t">{t('pr.coffeeTitle')}</div>
          <div className="d">{t('pr.coffeeText')}</div>
        </div>
        <div style={{display: 'grid', gap: 10}}>
          {amounts.map(a => (
            <Btn key={a} kind="sec" size="lg" wide onClick={() => toast(t('pr.coffeeThanks'))}>
              {fmtMoney(a, s.settings.currency)}
            </Btn>
          ))}
        </div>
        <div className="hint" style={{textAlign: 'center', marginTop: 14}}>{t('c.demo')}</div>
      </div>
    </div>
  );
}

/* ── правові й довідка ─────────────────────────────────────── */
function TextScreen({t, nav, titleKey, textKey}){
  return (
    <div className="app stack">
      <StackBar t={t} title={t(titleKey)} onBack={nav.back} />
      <div className="screen">
        <Card><div style={{fontSize: 14.5, lineHeight: 1.62}}>{t(textKey)}</div></Card>
        <div className="hint" style={{textAlign: 'center', marginTop: 16}}>Urok+ · {VERSION}</div>
      </div>
    </div>
  );
}

function HelpScreen({t, nav}){
  const [open, setOpen] = React.useState('');
  const faq = [1, 2, 3, 4];
  return (
    <div className="app stack">
      <StackBar t={t} title={t('lg.helpTitle')} onBack={nav.back} />
      <div className="screen">
        <div style={{display: 'grid', gap: 9}}>
          {faq.map(i => (
            <Card key={i} onClick={() => setOpen(open === i ? '' : i)}>
              <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                <span className="h3" style={{flex: 1}}>{t(`lg.faq${i}q`)}</span>
                <span style={{color: 'var(--ink-3)', display: 'flex', flex: 'none',
                              transform: open === i ? 'rotate(180deg)' : 'none', transition: 'transform .22s'}}>
                  <Icon.chevronD size={18} />
                </span>
              </div>
              {open === i ? (
                <div className="muted" style={{fontSize: 14, lineHeight: 1.55, marginTop: 10}}>{t(`lg.faq${i}a`)}</div>
              ) : null}
            </Card>
          ))}
        </div>
        <div style={{marginTop: 18}}>
          <Btn kind="soft" wide icon={<Icon.telegram size={18} />} onClick={() => openLink('https://t.me/urokplus')}>
            {t('lg.contact')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window.U, {
  ProfileScreen, ProfileEditScreen, SettingsScreen, PremiumScreen,
  ContestScreen, CoffeeScreen, TextScreen, HelpScreen, openLink, boardWith, FAKE_BOARD,
});
})();
