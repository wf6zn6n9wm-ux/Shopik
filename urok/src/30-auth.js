/* ══════════════════════════════════════════════════════════════════
   UROK+ · ВХІД І ОНБОРДИНГ
   ------------------------------------------------------------------
   Порядок: вітання → спосіб входу → номер → код → ім'я → онбординг.
   Вхід тут демонстраційний (жодного мережевого виклику), але
   розбитий на ті самі кроки, що й справжній: коли з'явиться сервер,
   міняється лише тіло sendCode/verify, а не екрани.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {Icon, Btn, IconBtn, Avatar, Field, Input, toast, A, store, isPhoneValid, normalizePhone, todayISO} = window.U;

/* ── онбординг ─────────────────────────────────────────────── */
function Onboarding({t, onDone}){
  const [i, setI] = React.useState(0);
  const slides = [
    {key: 1, glyph: <div className="dsp" style={{fontSize: 54, fontWeight: 800, letterSpacing: '-.05em'}}>U<span style={{color: 'var(--accent)'}}>+</span></div>},
    {key: 2, glyph: <Icon.calendarCheck size={60} stroke={1.6} />},
    {key: 3, glyph: <Icon.users size={60} stroke={1.6} />},
    {key: 4, glyph: <Icon.wallet size={60} stroke={1.6} />},
    {key: 5, glyph: <Icon.book size={60} stroke={1.6} />},
  ];
  const last = i === slides.length - 1;
  const s = slides[i];
  return (
    <div className="cover">
      <div style={{display: 'flex', alignItems: 'center', minHeight: 42}}>
        {i > 0 ? <IconBtn icon={<Icon.arrowL size={21} />} onClick={() => setI(i - 1)} label={t('a.back')} /> : null}
        <div style={{marginLeft: 'auto'}}>
          {!last ? <button className="btn ghost sm" onClick={onDone}>{t('a.skip')}</button> : null}
        </div>
      </div>

      <div className="slide" key={s.key}>
        <div className="glyph">{s.glyph}</div>
        <div className="t">{t(`ob.${s.key}.t`)}</div>
        <div className="d">{t(`ob.${s.key}.d`)}</div>
      </div>

      <div className="dots">
        {slides.map((x, n) => <i key={x.key} className={n === i ? 'on' : ''} />)}
      </div>
      <Btn kind="pri" size="lg" wide onClick={() => (last ? onDone() : setI(i + 1))}>
        {last ? t('ob.start') : t('a.next')}
      </Btn>
    </div>
  );
}

/* ── клавіатура для коду ───────────────────────────────────── */
function Keypad({onKey, onBack}){
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <div className="keypad">
      {keys.map((k, i) => k === '' ? <button key={i} className="blank" disabled /> : (
        <button key={i} onClick={() => (k === '⌫' ? onBack() : onKey(k))}
                aria-label={k === '⌫' ? 'backspace' : k}>
          {k === '⌫' ? <Icon.x size={20} /> : k}
        </button>
      ))}
    </div>
  );
}

/* ── форматування номера ───────────────────────────────────────
   Не прив'язуємось до країни: лишаємо цифри і плюс, групуємо по
   три — так номер читається й для +380, і для +48, і для +44.   */
function prettyPhone(raw){
  const v = normalizePhone(raw);
  const plus = v.startsWith('+');
  const digits = v.replace(/\D/g, '');
  if (!digits) return plus ? '+' : '';
  const head = digits.slice(0, 3), rest = digits.slice(3);
  const groups = rest.match(/.{1,3}/g) || [];
  return `${plus ? '+' : ''}${head}${groups.length ? ' ' + groups.join(' ') : ''}`;
}

/* ── вхід ──────────────────────────────────────────────────── */
function AuthFlow({t, onDone}){
  const [step, setStep] = React.useState('welcome');
  const [phone, setPhone] = React.useState('+380');
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [left, setLeft] = React.useState(0);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const finish = provider => {
    A.setAuth({status: 'authed', phone: provider === 'apple' ? '' : normalizePhone(phone), provider, createdAt: todayISO()});
    onDone();
  };

  /* Apple Sign In: справжній виклик піде через нативний міст, у
     вебі — одразу пускаємо, щоб сценарій можна було пройти. */
  const withApple = () => {
    const bridge = typeof window !== 'undefined' && window.UrokAuth;
    if (bridge && typeof bridge.apple === 'function'){
      setBusy(true);
      Promise.resolve(bridge.apple()).then(res => {
        setBusy(false);
        if (res && res.ok){
          A.setProfile({name: res.name || ''});
          finish('apple');
        } else setErr(t('a.retry'));
      }).catch(() => { setBusy(false); setErr(t('a.retry')); });
      return;
    }
    setStep('name');
  };

  const sendCode = () => {
    if (!isPhoneValid(phone)) return setErr(t('au.phoneInvalid'));
    setErr(''); setBusy(true);
    setTimeout(() => { setBusy(false); setCode(''); setLeft(30); setStep('otp'); }, 420);
  };

  const verify = value => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (value.length < 4) { setErr(t('au.otpWrong')); setCode(''); return; }
      setErr('');
      if (restoring){
        /* Відновлення: дані вже на пристрої, лишається прив'язати номер. */
        finish('phone');
      } else {
        setStep('name');
      }
    }, 380);
  };

  const pressKey = k => {
    if (code.length >= 4) return;
    const next = code + k;
    setCode(next);
    if (next.length === 4) verify(next);
  };

  const saveName = () => {
    if (!name.trim()) return setErr(t('au.nameRequired'));
    A.setProfile({name: name.trim()});
    finish(step === 'name' && !phone ? 'apple' : 'phone');
  };

  /* ── екрани ── */
  if (step === 'welcome') return (
    <div className="cover">
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4}}>
        <div className="brandbig">Urok<i>+</i></div>
        <div className="muted" style={{fontSize: 16, marginTop: 12, lineHeight: 1.5, maxWidth: 300}}>
          {t('au.subtitle')}
        </div>
      </div>
      <Btn kind="dark" size="lg" wide icon={<Icon.apple size={19} />} onClick={withApple} loading={busy}>
        {t('au.apple')}
      </Btn>
      <div style={{height: 10}} />
      <Btn kind="sec" size="lg" wide icon={<Icon.phone size={18} />} onClick={() => setStep('phone')}>
        {t('au.phone')}
      </Btn>
      {/* Подивитись до реєстрації. Людина, яка вперше бачить застосунок,
          не має віддавати номер телефону за право поклацати — а без
          даних дивитись немає на що, тому режим одразу з демо-тижнем. */}
      <div style={{height: 10}} />
      <Btn kind="soft" size="lg" wide icon={<Icon.sparkle size={18} />} onClick={() => A.startDemo(t)}>
        {t('au.demo')}
      </Btn>
      <div className="hint" style={{textAlign: 'center', marginTop: 8, lineHeight: 1.45}}>{t('au.demoD')}</div>
      <button className="btn ghost" style={{width: '100%', marginTop: 8}}
              onClick={() => { setRestoring(true); setStep('phone'); }}>{t('au.restore')}</button>
      <div className="hint" style={{textAlign: 'center', marginTop: 10, lineHeight: 1.45}}>{t('au.terms')}</div>
    </div>
  );

  if (step === 'phone') return (
    <div className="cover">
      <div style={{minHeight: 42}}>
        <IconBtn icon={<Icon.arrowL size={21} />} label={t('a.back')}
                 onClick={() => { setRestoring(false); setStep('welcome'); }} />
      </div>
      <div className="dsp" style={{fontSize: 27, fontWeight: 800, letterSpacing: '-.04em', marginTop: 12}}>
        {restoring ? t('au.restoreTitle') : t('au.phoneTitle')}
      </div>
      <div className="muted" style={{marginTop: 8, fontSize: 14.5, lineHeight: 1.5, maxWidth: 320}}>
        {restoring ? t('au.restoreHint') : t('au.phoneHint')}
      </div>
      <Field label={t('au.phoneLabel')} error={err}>
        <Input type="tel" inputMode="tel" autoFocus value={prettyPhone(phone)} error={!!err}
               placeholder="+380 XX XXX XX XX"
               onChange={e => { setPhone(normalizePhone(e.target.value)); setErr(''); }} />
      </Field>
      <div style={{flex: 1}} />
      <Btn kind="pri" size="lg" wide onClick={sendCode} loading={busy} disabled={busy}>{t('au.sendCode')}</Btn>
    </div>
  );

  if (step === 'otp') return (
    <div className="cover">
      <div style={{minHeight: 42}}>
        <IconBtn icon={<Icon.arrowL size={21} />} onClick={() => setStep('phone')} label={t('a.back')} />
      </div>
      <div className="dsp" style={{fontSize: 27, fontWeight: 800, letterSpacing: '-.04em', marginTop: 12}}>{t('au.otpTitle')}</div>
      <div className="muted" style={{marginTop: 8, fontSize: 14.5}}>{t('au.otpHint', {phone: prettyPhone(phone)})}</div>

      <div className="otp">
        {[0, 1, 2, 3].map(i => (
          <b key={i} className={code.length === i ? 'on' : ''}>{code[i] ? '•' : ''}</b>
        ))}
      </div>
      {err ? <div className="errtext" style={{textAlign: 'center'}}>{err}</div> : null}
      <div style={{textAlign: 'center', marginTop: 14}}>
        {left > 0
          ? <span className="hint">{t('au.resendIn', {sec: left})}</span>
          : <button className="btn ghost sm" onClick={() => { setLeft(30); toast(t('au.sendCode')); }}>{t('au.resend')}</button>}
      </div>
      <div className="hint" style={{textAlign: 'center', marginTop: 4}}>{t('au.demoHint')}</div>
      <Keypad onKey={pressKey} onBack={() => setCode(code.slice(0, -1))} />
    </div>
  );

  /* ім'я */
  return (
    <div className="cover">
      <div style={{minHeight: 42}}>
        <IconBtn icon={<Icon.arrowL size={21} />} onClick={() => setStep('welcome')} label={t('a.back')} />
      </div>
      <div className="dsp" style={{fontSize: 27, fontWeight: 800, letterSpacing: '-.04em', marginTop: 12}}>{t('au.nameTitle')}</div>
      <div className="muted" style={{marginTop: 8, fontSize: 14.5, lineHeight: 1.5, maxWidth: 320}}>{t('au.nameHint')}</div>
      <div style={{display: 'flex', justifyContent: 'center', margin: '26px 0 4px'}}>
        <Avatar name={name || '?'} size={84} color="var(--accent)" />
      </div>
      <Field error={err}>
        <Input autoFocus value={name} error={!!err} placeholder={t('au.namePlaceholder')}
               onChange={e => { setName(e.target.value); setErr(''); }} />
      </Field>
      <div style={{flex: 1}} />
      <Btn kind="pri" size="lg" wide onClick={saveName}>{t('a.continue')}</Btn>
    </div>
  );
}

Object.assign(window.U, {Onboarding, AuthFlow, Keypad, prettyPhone});
})();
