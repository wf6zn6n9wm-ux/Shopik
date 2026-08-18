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
  A, sel, store, Billing, Web, PRODUCTS, PLAN_ORDER, planMonthly, planSaving, planPerMonth, fmtPrice,
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
               sub={premium ? t('sub.active') : t('sub.free')} chevron onClick={() => nav.push({name: 'subscription'})} />
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
               onClick={() => nav.push({name: 'subscription'})} />
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
  const [wait, setWait] = React.useState(false);      /* чекаємо оплату на сайті */
  const [note, setNote] = React.useState('');
  const [ask, setAsk] = React.useState(false);        /* пошта перед оплатою */
  const [mail, setMail] = React.useState(s.premium.login || s.profile.email || '');
  /* Опитування сервера триває довше, ніж екран: після закриття
     оновлювати вже нікуди. */
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);
  /* Повернення з браузера — привід перевірити одразу, а не чекати
     наступного кола опитування. */
  React.useEffect(() => {
    if (!wait || typeof document === 'undefined' || !document.addEventListener) return;
    const onBack = () => { if (!document.hidden) Billing.checkWeb().then(r => {
      if (r.ok && alive.current){ setWait(false); toast(t('sub.paid')); nav.back(); }
    }); };
    document.addEventListener('visibilitychange', onBack);
    return () => document.removeEventListener('visibilitychange', onBack);
  }, [wait]);
  const premium = sel.isPremium(s);
  const p = PRODUCTS;

  /* Пробний тиждень — єдина дія, яку застосунок робить сам: вона
     безкоштовна й нікуди не платить. Усе інше — на сайті. */
  const startTrial = async () => {
    setBusy(true);
    try {
      const res = await Billing.trial();
      setBusy(false);
      if (res.ok){ toast(t('sub.trialStarted')); nav.back(); }
      else toast(t('sub.notAvailable'));
    } catch (e){ setBusy(false); toast(t('sub.notAvailable')); }
  };

  /* Карток застосунок не бачить: він відкриває сторінку оплати в
     браузері й далі питає сервер, чи з'явилась ліцензія. Пошту треба
     знати ДО оплати — саме вона зв'язує платіж із застосунком. */
  const payWeb = () => {
    if (!Web.enabled()) return toast(t('sub.webDemo'));
    const who = (s.premium.login || s.profile.email || '').trim().toLowerCase();
    if (!who) return setAsk(true);
    startPay(who);
  };

  const startPay = who => {
    A.setLogin(who);
    setAsk(false);
    openLink(Web.payUrlFor(plan, s.settings.lang, who));
    setWait(true);
    setNote('');
    /* Чекаємо мовчки: жодних модалок поверх браузера, лише кнопка
       міняє напис на «Я вже оплатив». */
    Billing.awaitWeb(who, () => alive.current).then(res => {
      if (!alive.current) return;
      setWait(false);
      if (res.ok){ toast(t('sub.paid')); nav.back(); }
      else if (res.reason === 'timeout') setNote(t('sub.waitLong'));
    });
  };

  /* «Я вже оплатив»: одна перевірка на вимогу, без десяти хвилин. */
  const checkWeb = async () => {
    setBusy(true);
    const res = await Billing.checkWeb();
    setBusy(false);
    if (res.ok){ setWait(false); toast(t('sub.paid')); nav.back(); return; }
    setNote(res.reason === 'offline' ? t('sub.offline') : t('sub.waitLong'));
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
            {!Web.native() ? (
              <>
                <SectionHead title={t('sub.ctaShort')} />
                {/* 14, а не 10: плашка вигоди виступає за верхній край
                    картки й на щільнішій сітці налазить на сусідню */}
                <div style={{display: 'grid', gap: 14}}>
                  {PLAN_ORDER.map(id => {
                    const product = p[id];
                    const saving = planSaving(id);
                    const perMonth = planPerMonth(id);
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
                            <span className="muted" style={{display: 'block', fontSize: 12.5, marginTop: 2}}>
                              {id !== 'monthly'
                                ? t('sub.monthEquivalent', {price: fmtPrice(perMonth, product.currency)})
                                : t('sub.renews')}
                            </span>
                            {!product.renews ? (
                              <span className="muted" style={{display: 'block', fontSize: 12, marginTop: 2}}>
                                {t('sub.once')}
                              </span>
                            ) : null}
                          </span>
                          <span className="amt num">
                            {fmtPrice(product.price, product.currency)}<em>{period}</em>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button className="btn line wide webpay" style={{marginTop: 14}}
                        onClick={wait ? checkWeb : payWeb} disabled={busy}>
                  <Icon.globe size={18} />
                  <span>
                    <b>{wait ? t('sub.paidAlready') : t('sub.web')}</b>
                    <i>{wait ? t('sub.checking') : t('sub.webSub')}</i>
                  </span>
                </button>
                {note ? <div className="hint" style={{marginTop: 8, lineHeight: 1.5}}>{note}</div> : null}
              </>
            ) : (
              /* Нативна збірка: ані цін, ані посилань — Apple забороняє
                 вести повз свій магазин, а магазину в нас немає. */
              <Card style={{marginTop: 16}}>
                <div className="h3">{t('sub.nativeT')}</div>
                <div className="muted" style={{fontSize: 13.5, marginTop: 6, lineHeight: 1.5}}>{t('sub.nativeD')}</div>
              </Card>
            )}
            <Btn kind="ghost" wide style={{marginTop: 6}} onClick={restore}>{t('sub.restore')}</Btn>

            <div className="fineprint">
              {!Web.native() ? t('sub.legal') : t('sub.nativeD')}
            </div>
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
              {/* Магазин тут ні до чого: підписка оформлена на сайті,
                  там нею й керують — а показує стан наш екран. */}
              <Row icon={<Icon.share size={19} />} title={t('sub.manage')}
                   onClick={() => nav.replace({name: 'subscription'})} chevron />
              <Row icon={<Icon.download size={19} />} title={t('sub.restore')} onClick={restore} />
            </div>
            <div style={{height: 24}} />
          </>
        )}
      </div>

      {!premium ? (
        <div className="fixedbar">
          {!s.premium.trialUsed ? (
            <Btn kind="pri" size="lg" wide loading={busy} disabled={busy} onClick={startTrial}>
              {t('sub.cta')}
            </Btn>
          ) : !Web.native() ? (
            <Btn kind="pri" size="lg" wide loading={busy} disabled={busy} onClick={wait ? checkWeb : payWeb}>
              {wait ? t('sub.paidAlready') : t('sub.web')}
            </Btn>
          ) : (
            <Btn kind="sec" size="lg" wide onClick={restore}>{t('sub.restore')}</Btn>
          )}
        </div>
      ) : null}

      {/* Пошта — єдина ниточка між платежем на сайті й застосунком:
          на неї прив'язується підписка, і по ній застосунок дізнається,
          що оплата пройшла. Тому питаємо її до оплати, а не після. */}
      <Sheet open={ask} onClose={() => setAsk(false)} title={t('sub.mailT')}>
        <div className="muted" style={{fontSize: 13.5, lineHeight: 1.5}}>{t('sub.mailD')}</div>
        <Field label={t('sub.restoreMail')}>
          <Input type="email" inputMode="email" value={mail} placeholder="mail@example.com"
                 onChange={e => setMail(e.target.value)} />
        </Field>
        <div style={{height: 14}} />
        <Btn kind="pri" wide disabled={!/@/.test(mail)} onClick={() => startPay(mail.trim().toLowerCase())}>
          {t('sub.mailGo')}
        </Btn>
        <div style={{height: 8}} />
        <Btn kind="ghost" wide onClick={() => setAsk(false)}>{t('a.cancel')}</Btn>
      </Sheet>
    </div>
  );
}


/* ── керування підпискою ───────────────────────────────────────
   Окремий екран, як у тренері: спершу стан справ рядками (план, де
   оформлена, до якої дати, автопродовження, пристрої), потім дії.
   Тарифи звідси відкриваються окремо — щоб людина, яка зайшла
   подивитись дату, не потрапляла одразу на вітрину.               */
function SubscriptionScreen({t, s, nav}){
  const [busy, setBusy] = React.useState('');
  const [mail, setMail] = React.useState(s.premium.login || '');
  const [restore, setRestore] = React.useState(false);
  const premium = sel.isPremium(s);
  const raw = s.premium;
  const trial = raw.plan === 'trial';
  const web = raw.source === 'web';
  const product = PRODUCTS[raw.plan];
  const cancelled = premium && web && raw.autoRenew === false;

  /* Сервер знає більше за нас: при відкритті тихо звіряємось. */
  React.useEffect(() => { if (raw.login) Billing.refresh(); }, []);

  const status = premium ? (trial ? t('sub.statusTrial') : t('sub.statusActive')) : t('sub.statusNone');
  /* Червона плашка на «ще не купив» — це докір, а не інформація. */
  const tone = premium ? (trial ? 'acc' : 'pos') : '';

  const doRestore = async () => {
    const who = mail.trim().toLowerCase();
    if (!who) return;
    setBusy('restore');
    const res = await Billing.restore(who);
    setBusy('');
    if (res.ok){ setRestore(false); toast(t('sub.restoreOk')); return; }
    if (res.reason === 'device_limit')
      return toast(t('sub.restoreLimit', {used: res.devices || 0, limit: res.limit || 3}));
    toast(res.reason === 'offline' ? t('sub.offline') : t('sub.restoreNone'));
  };

  const doCancel = async () => {
    setBusy('cancel');
    const res = await Billing.cancelAutoRenew();
    setBusy('');
    toast(res.ok ? t('sub.cancelDone') : t('sub.offline'));
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={t('se.subscription')} onBack={nav.back} />
      <div className="screen">
        <Card>
          <div style={{display: 'flex', alignItems: 'flex-start', gap: 12}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div className="lbl">Urok+ Premium</div>
              <div className="dsp" style={{fontSize: 21, fontWeight: 800, letterSpacing: '-.035em', marginTop: 2}}>
                {status}
              </div>
            </div>
            <span className={'pill ' + tone}>{premium ? t('sub.premiumBadge') : t('sub.free')}</span>
          </div>

          {/* Порожня довідка гірша за її відсутність: поки підписки не
              було, показувати нічого — і роздільник теж зайвий. */}
          {raw.plan ? <div className="divider" /> : null}
          {raw.plan ? (
          <div className="rowlines">
            {product ? (
              <div><span>{t('sub.plan')}</span><b>{t('sub.' + raw.plan)} · {fmtPrice(product.price, product.currency)}</b></div>
            ) : null}
            {raw.plan ? (
              <div><span>{t('sub.where')}</span><b>{web ? t('sub.whereWeb') : t('sub.whereTrial')}</b></div>
            ) : null}
            {raw.until ? (
              <div>
                <span>{premium ? t('sub.until') : t('sub.ended')}</span>
                <b>{fmtShortDate(t, raw.until)}</b>
              </div>
            ) : null}
            {web ? (
              <div>
                <span>{t('sub.autoRenew')}</span>
                <b>{raw.autoRenew === false ? t('sub.off') : t('sub.on')}</b>
              </div>
            ) : null}
            {web && raw.limit ? (
              <div>
                <span>{t('sub.devices')}</span>
                <b>{t('sub.devicesOf', {used: raw.devices || 1, limit: raw.limit})}</b>
              </div>
            ) : null}
            {raw.login ? (
              <div><span>{t('sub.restoreMail')}</span><b className="ellip">{raw.login}</b></div>
            ) : null}
          </div>
          ) : null}
        </Card>

        {cancelled ? (
          <Card style={{marginTop: 9, background: 'var(--warn-soft)', borderColor: 'transparent'}}>
            <b style={{fontSize: 14, color: 'var(--warn)'}}>{t('sub.cancelled')}</b>
            <p className="muted" style={{fontSize: 13, margin: '6px 0 0', lineHeight: 1.5}}>
              {t('sub.cancelledD', {date: fmtShortDate(t, raw.until)})}
            </p>
          </Card>
        ) : null}

        <div style={{display: 'grid', gap: 9, marginTop: 14}}>
          {!Web.native() ? (
            <Btn kind="pri" size="lg" wide onClick={() => nav.push({name: 'premium'})}>
              {premium && !trial ? t('sub.change') : t('sub.choose')}
            </Btn>
          ) : null}

          {premium && web && !Web.native() ? (
            <Btn kind="sec" wide icon={<Icon.globe size={18} />}
                 onClick={() => openLink(Web.payUrlFor(raw.plan, s.settings.lang, raw.login))}>
              {t('sub.manageWeb')}
            </Btn>
          ) : null}

          {premium && web && raw.autoRenew !== false ? (
            <Btn kind="sec" wide loading={busy === 'cancel'} disabled={!!busy} onClick={doCancel}>
              {t('sub.cancelAuto')}
            </Btn>
          ) : null}

          <Btn kind="sec" wide onClick={() => setRestore(true)}>{t('sub.restoreT')}</Btn>
        </div>

        <div className="hint" style={{marginTop: 16, lineHeight: 1.5}}>{t('sub.dataNote')}</div>
        <div style={{height: 20}} />
      </div>

      <Sheet open={restore} onClose={() => setRestore(false)} title={t('sub.restoreT')}>
        <div className="muted" style={{fontSize: 13.5, lineHeight: 1.5}}>{t('sub.restoreD')}</div>
        <Field label={t('sub.restoreMail')}>
          <Input type="email" inputMode="email" value={mail} placeholder="mail@example.com"
                 onChange={e => setMail(e.target.value)} />
        </Field>
        <div style={{height: 14}} />
        <Btn kind="pri" wide loading={busy === 'restore'} disabled={!!busy} onClick={doRestore}>
          {t('sub.restoreGo')}
        </Btn>
        <div style={{height: 8}} />
        <Btn kind="ghost" wide onClick={() => setRestore(false)}>{t('a.cancel')}</Btn>
      </Sheet>
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
  ProfileScreen, ProfileEditScreen, SettingsScreen, PremiumScreen, SubscriptionScreen,
  ContestScreen, CoffeeScreen, TextScreen, HelpScreen, openLink, boardWith, FAKE_BOARD,
});
})();
