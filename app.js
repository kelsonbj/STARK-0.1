/* =========================================================
   Agente Pessoal · Pixel Code
   Dados locais (localStorage) + sincronização opcional + relatório semanal
   ========================================================= */

const KEY = 'agente-pessoal-v1';

const DEFAULT = {
  xp: 0,
  updatedAt: 0,
  lastReport: null,
  routine: [
    { id: 'r1', text: 'Estudar 30 min de front-end' },
    { id: 'r2', text: 'Revisar agenda do dia' },
    { id: 'r3', text: 'Registrar despesas do dia' },
  ],
  routineDone: {},               // { 'YYYY-MM-DD': ['r1', ...] }
  tasks: [],                     // { id, title, project, due, done, doneAt }
  events: [],                    // { id, title, date, time }
  expenses: [],                  // { id, date, desc, cat, amount }
  budget: {
    income: 0,
    limits: { Alimentação: 0, Transporte: 0, Moradia: 0, Lazer: 0, Saúde: 0, Outros: 0 },
  },
  aportes: [],                   // { id, date, asset, amount }
  trail: [
    { id: 't1', topic: 'HTML semântico (header, main, nav, section)', done: false },
    { id: 't2', topic: 'CSS Flexbox', done: false },
    { id: 't3', topic: 'CSS Grid', done: false },
    { id: 't4', topic: 'Design responsivo (media queries)', done: false },
    { id: 't5', topic: 'JavaScript: DOM e eventos', done: false },
    { id: 't6', topic: 'JavaScript: fetch e APIs', done: false },
    { id: 't7', topic: 'PWA: manifest e service worker', done: false },
  ],
  errors: [],                    // { id, date, topic, desc, solution }
  settings: {
    email: 'kelsonbj.freelancer@gmail.com',
    endpoint: '',                // URL para envio de e-mail e sincronização (opcional)
    syncKey: '',
    currency: 'AOA',
    locale: 'pt-AO',
  },
};

const LESSONS = [
  { t: 'Fundo de emergência', b: 'Antes de qualquer aporte, junte de 3 a 6 meses de despesas essenciais em um lugar de liquidez imediata. É o escudo do seu patrimônio.' },
  { t: 'Regra 50/30/20 (adaptável)', b: 'Referência simples: 50% necessidades, 30% desejos, 20% poupança e investimento. Ajuste à sua realidade.' },
  { t: 'Cripto: como pensar', b: 'São ativos muito voláteis. Invista só o que você pode perder, prefira aportes regulares (DCA) a tentar adivinhar o melhor momento, e entenda onde o ativo fica guardado (custódia).' },
  { t: 'Sinais de golpe', b: 'Retorno garantido e alto, pressão para decidir rápido, cobrança de "taxa" para liberar saques e bônus por indicação são alertas vermelhos. Desconfie sempre.' },
  { t: 'Negócio digital', b: 'Antes de escalar, valide: alguém paga por isso? Calcule o custo para conquistar um cliente e a margem por venda. Faturamento sem margem não é lucro.' },
];

const TIPS = [
  'Use HTML semântico: <header>, <main> e <nav> melhoram a acessibilidade e o SEO.',
  'Flexbox organiza em uma dimensão; Grid organiza em linhas e colunas ao mesmo tempo.',
  'Pense em mobile first: escreva o CSS para celular e depois use media queries para telas maiores.',
  'Em JavaScript, prefira addEventListener a onclick no HTML: o código fica mais limpo e testável.',
  'Um service worker permite cache offline. Ele é a base de um PWA instalável.',
];

const CATEGORIES = Object.keys(DEFAULT.budget.limits);
const ASSETS = ['Cripto', 'Ações', 'Fundos', 'Poupança', 'Negócio digital', 'Outros'];

/* ---------- Estado ---------- */
let S = load();
let syncTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return deepMerge(structuredClone(DEFAULT), JSON.parse(raw));
  } catch (e) { console.warn('Falha ao ler dados locais', e); }
  return structuredClone(DEFAULT);
}

function deepMerge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k]) {
      base[k] = deepMerge(base[k], extra[k]);
    } else {
      base[k] = extra[k];
    }
  }
  return base;
}

function save() {
  S.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(S));
  scheduleSync();
}

/* ---------- Utilitários ---------- */
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD no fuso local
const monthStr = () => todayStr().slice(0, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat(S.settings.locale, { style: 'currency', currency: S.settings.currency, maximumFractionDigits: 0 }).format(Number(n) || 0);
const level = () => Math.floor(S.xp / 100) + 1;
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString(S.settings.locale, { day: '2-digit', month: 'short' }) : '';

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function addXP(n, motivo) {
  S.xp += n;
  toast(`+${n} XP${motivo ? ' · ' + motivo : ''}`);
}

function updateHeader() {
  $('#level').textContent = `Nível ${level()} · ${S.xp} XP`;
  $('#xpbar').style.width = (S.xp % 100) + '%';
}

/* ---------- Sincronização (opcional) ---------- */
function scheduleSync() {
  if (!S.settings.endpoint || !S.settings.syncKey) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushState, 1500);
}

async function pushState() {
  try {
    const r = await fetch(S.settings.endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.settings.syncKey },
      body: JSON.stringify(S),
    });
    if (!r.ok) throw new Error(r.status);
  } catch (e) { console.warn('Sync falhou', e); toast('Sincronização falhou'); }
}

async function pullState() {
  if (!S.settings.endpoint || !S.settings.syncKey) return;
  try {
    const r = await fetch(S.settings.endpoint, { headers: { Authorization: 'Bearer ' + S.settings.syncKey } });
    if (!r.ok) return;
    const remote = await r.json();
    if (remote && remote.updatedAt > S.updatedAt) {
      S = deepMerge(structuredClone(DEFAULT), remote);
      localStorage.setItem(KEY, JSON.stringify(S));
      render();
      toast('Dados sincronizados');
    }
  } catch (e) { console.warn('Pull falhou', e); }
}

/* ---------- Relatório semanal ---------- */
function buildReport() {
  const since = Date.now() - 7 * 864e5;
  const inWeek = (ts) => ts && ts >= since;
  const weekDate = (d) => Date.parse(d) >= since;

  const tasksDone = S.tasks.filter((t) => t.done && inWeek(t.doneAt));
  const pending = S.tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const trailDone = S.trail.filter((t) => t.done).length;
  const errorsWeek = S.errors.filter((e) => weekDate(e.date));
  const expWeek = S.expenses.filter((e) => weekDate(e.date));
  const totalExp = expWeek.reduce((s, e) => s + Number(e.amount), 0);
  const aportesWeek = S.aportes.filter((a) => weekDate(a.date));
  const totalAp = aportesWeek.reduce((s, a) => s + Number(a.amount), 0);
  const monthIncome = Number(S.budget.income) || 0;
  const monthExp = S.expenses.filter((e) => e.date.startsWith(monthStr())).reduce((s, e) => s + Number(e.amount), 0);
  const nextWeek = pending.filter((t) => t.due && t.due <= new Date(Date.now() + 7 * 864e5).toLocaleDateString('en-CA'));
  const routineDays = Object.keys(S.routineDone).filter((d) => Date.parse(d) >= since).length;

  const lines = [
    `RELATÓRIO SEMANAL · ${new Date().toLocaleDateString(S.settings.locale)}`,
    '',
    '1. ESTUDOS DE PROGRAMAÇÃO',
    `   • Tópicos concluídos na trilha: ${trailDone}/${S.trail.length}`,
    `   • Erros registrados e resolvidos: ${errorsWeek.length}`,
    `   • Dias com rotina cumprida: ${routineDays}/7`,
    '',
    '2. AGÊNCIA PIXEL CODE',
    `   • Tarefas concluídas: ${tasksDone.length}`,
    `   • Pendentes: ${pending.length}`,
    ...pending.slice(0, 5).map((t) => `      - ${t.title}${t.due ? ' (prazo ' + t.due + ')' : ''}`),
    '',
    '3. FINANÇAS',
    `   • Despesas na semana: ${money(totalExp)}`,
    `   • Renda mensal informada: ${money(monthIncome)}`,
    `   • Gasto acumulado no mês: ${money(monthExp)}`,
    `   • Aportes na semana: ${money(totalAp)}`,
    '',
    '4. FOCO DA PRÓXIMA SEMANA',
    ...(nextWeek.length
      ? nextWeek.map((t) => `   • Entregar: ${t.title} (até ${t.due})`)
      : ['   • Nenhum prazo nos próximos 7 dias. Aproveite para avançar na trilha de estudos.']),
    `   • Meta de estudo: concluir ${Math.min(2, S.trail.length - trailDone)} tópico(s) da trilha.`,
  ];

  return {
    subject: `Relatório semanal · Agente Pessoal (${new Date().toLocaleDateString(S.settings.locale)})`,
    body: lines.join('\n'),
  };
}

async function sendReport(auto = false) {
  const r = buildReport();
  S.lastReport = new Date().toISOString();
  save();
  const to = S.settings.email;

  if (S.settings.endpoint) {
    try {
      const res = await fetch(S.settings.endpoint + '/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.settings.syncKey },
        body: JSON.stringify({ to, subject: r.subject, body: r.body }),
      });
      if (!res.ok) throw new Error(res.status);
      toast('Relatório enviado por e-mail');
    } catch (e) {
      toast('Falha no envio. Use "Abrir no e-mail".');
    }
  } else if (!auto) {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`;
  }
  render();
}

function weeklyCheck() {
  const d = new Date();
  if (d.getDay() !== 6 || d.getHours() < 20) return; // sábado, a partir das 20:00
  const last = S.lastReport ? new Date(S.lastReport) : null;
  if (last && Date.now() - last.getTime() < 5 * 864e5) return; // já enviado nesta semana
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Relatório semanal pronto', { body: 'Abra o app para revisar e enviar.', icon: 'icon.svg' });
  }
  if (S.settings.endpoint) sendReport(true);
}

/* ---------- Ações ---------- */
const actions = {
  toggleRoutine(id) {
    const day = todayStr();
    const list = S.routineDone[day] || [];
    if (list.includes(id)) {
      S.routineDone[day] = list.filter((x) => x !== id);
    } else {
      S.routineDone[day] = [...list, id];
      addXP(10, 'rotina');
    }
    save(); render();
  },
  toggleTask(id) {
    const t = S.tasks.find((x) => x.id === id); if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done) addXP(20, 'tarefa');
    save(); render();
  },
  toggleStudy(id) {
    const t = S.trail.find((x) => x.id === id); if (!t) return;
    t.done = !t.done;
    if (t.done) addXP(30, 'estudo');
    save(); render();
  },
  del(list, id) {
    if (!confirm('Excluir este item?')) return;
    S[list] = S[list].filter((x) => x.id !== id);
    save(); render();
  },
  delRoutine(id) {
    S.routine = S.routine.filter((x) => x.id !== id);
    save(); render();
  },
  async requestNotif() {
    if (!('Notification' in window)) return toast('Notificações não suportadas aqui');
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notificações ativadas' : 'Permissão negada');
    render();
  },
  sendReport() { sendReport(false); },
  copyReport() {
    const r = buildReport();
    navigator.clipboard?.writeText(r.body).then(() => toast('Relatório copiado'), () => toast('Não foi possível copiar'));
  },
  exportData() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agente-backup-${todayStr()}.json`;
    a.click();
  },
  importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        S = deepMerge(structuredClone(DEFAULT), data);
        save(); render(); toast('Backup restaurado');
      } catch { toast('Arquivo inválido'); }
    };
    input.click();
  },
  resetAll() {
    if (!confirm('Apagar TODOS os dados deste aparelho?')) return;
    S = structuredClone(DEFAULT); save(); render(); toast('Dados apagados');
  },
};

/* ---------- Formulários ---------- */
const forms = {
  routine(d) {
    if (!d.text?.trim()) return;
    S.routine.push({ id: uid(), text: d.text.trim() });
  },
  task(d) {
    if (!d.title?.trim()) return;
    S.tasks.push({ id: uid(), title: d.title.trim(), project: d.project || 'Pixel Code', due: d.due || '', done: false, doneAt: null });
  },
  event(d) {
    if (!d.title?.trim()) return;
    S.events.push({ id: uid(), title: d.title.trim(), date: d.date || todayStr(), time: d.time || '' });
  },
  study(d) {
    if (!d.topic?.trim()) return;
    S.trail.push({ id: uid(), topic: d.topic.trim(), done: false });
  },
  error(d) {
    if (!d.desc?.trim()) return;
    S.errors.push({ id: uid(), date: todayStr(), topic: d.topic || 'Geral', desc: d.desc.trim(), solution: d.solution?.trim() || '' });
    addXP(15, 'erro registrado');
  },
  expense(d) {
    const amount = Number(d.amount);
    if (!amount) return;
    S.expenses.push({ id: uid(), date: d.date || todayStr(), desc: (d.desc || 'Despesa').trim(), cat: d.cat, amount });
    addXP(2, 'despesa');
  },
  income(d) {
    S.budget.income = Number(d.income) || 0;
  },
  limit(d) {
    S.budget.limits[d.cat] = Number(d.limit) || 0;
  },
  aporte(d) {
    const amount = Number(d.amount);
    if (!amount) return;
    S.aportes.push({ id: uid(), date: d.date || todayStr(), asset: d.asset, amount });
    addXP(15, 'aporte');
  },
  config(d) {
    Object.assign(S.settings, {
      email: d.email?.trim() || S.settings.email,
      endpoint: d.endpoint?.trim() || '',
      syncKey: d.syncKey?.trim() || '',
      currency: d.currency?.trim().toUpperCase() || 'AOA',
      locale: d.locale?.trim() || 'pt-AO',
    });
    pullState();
  },
};

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.dataset.form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  forms[f.dataset.form](data);
  f.reset();
  save();
  render();
  toast('Salvo');
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const [name, arg] = el.dataset.act.split(':');
  if (actions[name]) actions[name](arg ?? el.dataset.id, el.dataset.id);
});

/* Atalhos internos: data-act="del:tasks" com data-id */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-del]');
  if (!el) return;
  actions.del(el.dataset.del, el.dataset.id);
});

/* ---------- Telas ---------- */
const views = {
  hoje() {
    const day = todayStr();
    const doneToday = S.routineDone[day] || [];
    const dueToday = S.tasks.filter((t) => !t.done && t.due && t.due <= day);
    const eventsToday = S.events.filter((e) => e.date === day).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const pct = S.routine.length ? Math.round((doneToday.length / S.routine.length) * 100) : 0;
    const tip = TIPS[new Date().getDate() % TIPS.length];

    return `
      <h1>Olá, bom trabalho hoje! 👋</h1>
      <p class="sub">${new Date().toLocaleDateString(S.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <div class="card highlight">
        <h2>Rotina de hoje · ${pct}%</h2>
        <ul class="list">
          ${S.routine.map((r) => `
            <li class="item ${doneToday.includes(r.id) ? 'done' : ''}">
              <button class="check ${doneToday.includes(r.id) ? 'on' : ''}" data-act="toggleRoutine" data-id="${r.id}" aria-label="Marcar">${doneToday.includes(r.id) ? '✓' : ''}</button>
              <div class="main"><div class="title">${esc(r.text)}</div></div>
              <button class="del" data-del="routine" data-id="${r.id}" aria-label="Excluir">×</button>
            </li>`).join('') || '<li class="empty">Adicione hábitos em Config.</li>'}
        </ul>
      </div>

      <div class="grid2">
        <div class="stat"><span>Tarefas em atraso/hoje</span><b>${dueToday.length}</b></div>
        <div class="stat"><span>Compromissos hoje</span><b>${eventsToday.length}</b></div>
        <div class="stat"><span>Trilha concluída</span><b>${S.trail.filter((t) => t.done).length}/${S.trail.length}</b></div>
        <div class="stat"><span>Gasto no mês</span><b>${money(S.expenses.filter((e) => e.date.startsWith(monthStr())).reduce((s, e) => s + Number(e.amount), 0))}</b></div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Agenda de hoje</h2>
        <ul class="list">
          ${eventsToday.map((e) => `<li class="item"><div class="main"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.time) || 'Sem horário'}</div></div></li>`).join('')}
          ${dueToday.map((t) => `<li class="item"><div class="main"><div class="title">${esc(t.title)}</div><div class="meta">${esc(t.project)} · prazo ${fmtDate(t.due)}</div></div><span class="pill ${t.due < day ? 'late' : ''}">${t.due < day ? 'Atrasada' : 'Hoje'}</span></li>`).join('')}
          ${!eventsToday.length && !dueToday.length ? '<li class="empty">Nada urgente hoje. Ótimo momento para estudar. 🎯</li>' : ''}
        </ul>
      </div>

      <div class="card">
        <h2>💡 Dica do dia</h2>
        <p class="muted" style="margin:0;line-height:1.5">${esc(tip)}</p>
      </div>
    `;
  },

  agenda() {
    const tasks = [...S.tasks].sort((a, b) => (a.done - b.done) || (a.due || '9').localeCompare(b.due || '9'));
    const events = [...S.events].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const day = todayStr();
    return `
      <h1>Agenda & Prazos</h1>
      <p class="sub">Agência Pixel Code e compromissos</p>

      <div class="card">
        <h2>Tarefas da agência</h2>
        <ul class="list">
          ${tasks.map((t) => `
            <li class="item ${t.done ? 'done' : ''}">
              <button class="check ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}">${t.done ? '✓' : ''}</button>
              <div class="main">
                <div class="title">${esc(t.title)}</div>
                <div class="meta">${esc(t.project)}${t.due ? ' · prazo ' + fmtDate(t.due) : ''}</div>
              </div>
              ${!t.done && t.due && t.due < day ? '<span class="pill late">Atrasada</span>' : ''}
              <button class="del" data-del="tasks" data-id="${t.id}">×</button>
            </li>`).join('') || '<li class="empty">Nenhuma tarefa ainda.</li>'}
        </ul>
        <form class="form" data-form="task">
          <input name="title" placeholder="Nova tarefa (ex.: Landing page cliente X)" required>
          <div class="grid2">
            <input name="project" placeholder="Projeto">
            <input name="due" type="date">
          </div>
          <button class="btn" type="submit">Adicionar tarefa</button>
        </form>
      </div>

      <div class="card">
        <h2>Compromissos</h2>
        <ul class="list">
          ${events.map((e) => `
            <li class="item"><div class="main"><div class="title">${esc(e.title)}</div><div class="meta">${fmtDate(e.date)} ${esc(e.time)}</div></div>
            <button class="del" data-del="events" data-id="${e.id}">×</button></li>`).join('') || '<li class="empty">Sem compromissos.</li>'}
        </ul>
        <form class="form" data-form="event">
          <input name="title" placeholder="Compromisso" required>
          <div class="grid2">
            <input name="date" type="date" value="${day}">
            <input name="time" type="time">
          </div>
          <button class="btn" type="submit">Adicionar compromisso</button>
        </form>
      </div>`;
  },

  estudos() {
    const done = S.trail.filter((t) => t.done).length;
    const pct = Math.round((done / S.trail.length) * 100);
    return `
      <h1>Trilha de Front-end</h1>
      <p class="sub">HTML · CSS · JavaScript · PWA</p>

      <div class="card highlight">
        <h2>Progresso · ${pct}%</h2>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <p class="muted" style="margin:10px 0 0">Cada tópico concluído vale 30 XP. Erros registrados valem 15 XP, porque errar e corrigir é como se aprende.</p>
      </div>

      <div class="card">
        <ul class="list">
          ${S.trail.map((t) => `
            <li class="item ${t.done ? 'done' : ''}">
              <button class="check ${t.done ? 'on' : ''}" data-act="toggleStudy" data-id="${t.id}">${t.done ? '✓' : ''}</button>
              <div class="main"><div class="title">${esc(t.topic)}</div></div>
              <button class="del" data-del="trail" data-id="${t.id}">×</button>
            </li>`).join('')}
        </ul>
        <form class="form" data-form="study">
          <input name="topic" placeholder="Novo tópico na trilha">
          <button class="btn ghost" type="submit">Adicionar tópico</button>
        </form>
      </div>

      <div class="card">
        <h2>Diário de erros</h2>
        <ul class="list">
          ${[...S.errors].reverse().map((e) => `
            <li class="item"><div class="main">
              <div class="title">${esc(e.topic)} · ${fmtDate(e.date)}</div>
              <div class="meta">❌ ${esc(e.desc)}</div>
              ${e.solution ? `<div class="meta">✅ ${esc(e.solution)}</div>` : ''}
            </div><button class="del" data-del="errors" data-id="${e.id}">×</button></li>`).join('') || '<li class="empty">Nenhum erro registrado. Quando travar num bug, anote aqui.</li>'}
        </ul>
        <form class="form" data-form="error">
          <input name="topic" placeholder="Tema (ex.: Flexbox, DOM)">
          <textarea name="desc" placeholder="O que deu errado?" required></textarea>
          <textarea name="solution" placeholder="Como resolveu (ou o que aprendeu)"></textarea>
          <button class="btn" type="submit">Registrar erro</button>
        </form>
      </div>`;
  },

  financas() {
    const m = monthStr();
    const exps = S.expenses.filter((e) => e.date.startsWith(m)).sort((a, b) => b.date.localeCompare(a.date));
    const spentBy = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    exps.forEach((e) => { spentBy[e.cat] = (spentBy[e.cat] || 0) + Number(e.amount); });
    const total = exps.reduce((s, e) => s + Number(e.amount), 0);
    const income = Number(S.budget.income) || 0;
    const saldo = income - total;

    return `
      <h1>Finanças</h1>
      <p class="sub">Orçamento do mês · ${m}</p>

      <div class="grid2">
        <div class="stat"><span>Renda do mês</span><b>${money(income)}</b></div>
        <div class="stat"><span>Saldo disponível</span><b style="color:${saldo < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(saldo)}</b></div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Limites por categoria</h2>
        ${CATEGORIES.map((c) => {
          const limit = Number(S.budget.limits[c]) || 0;
          const spent = spentBy[c] || 0;
          const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const cls = limit && spent > limit ? 'over' : pct >= 80 ? 'warn' : '';
          return `<div class="budget-row">
            <div class="head"><span>${c}</span><span class="muted">${money(spent)} / ${money(limit)}</span></div>
            <div class="progress"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
        }).join('')}
        <form class="form" data-form="income">
          <input name="income" type="number" min="0" placeholder="Renda mensal (${S.settings.currency})" value="${income || ''}">
          <button class="btn ghost" type="submit">Salvar renda</button>
        </form>
        <form class="row" data-form="limit">
          <select name="cat">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
          <input name="limit" type="number" min="0" placeholder="Limite mensal">
          <button class="btn ghost small" type="submit">Definir limite</button>
        </form>
      </div>

      <div class="card">
        <h2>Registrar despesa</h2>
        <form class="form" data-form="expense">
          <input name="desc" placeholder="Descrição (ex.: Mercado)" required>
          <div class="grid2">
            <input name="amount" type="number" min="0" step="any" placeholder="Valor" required>
            <input name="date" type="date" value="${todayStr()}">
          </div>
          <select name="cat">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
          <button class="btn" type="submit">Salvar despesa</button>
        </form>
      </div>

      <div class="card">
        <h2>Despesas do mês · ${money(total)}</h2>
        <ul class="list">
          ${exps.map((e) => `<li class="item"><div class="main"><div class="title">${esc(e.desc)}</div><div class="meta">${fmtDate(e.date)} · ${e.cat}</div></div>
            <b>${money(e.amount)}</b><button class="del" data-del="expenses" data-id="${e.id}">×</button></li>`).join('') || '<li class="empty">Nenhuma despesa neste mês.</li>'}
        </ul>
      </div>`;
  },

  patrimonio() {
    const byAsset = Object.fromEntries(ASSETS.map((a) => [a, 0]));
    S.aportes.forEach((a) => { byAsset[a.asset] = (byAsset[a.asset] || 0) + Number(a.amount); });
    const total = Object.values(byAsset).reduce((s, v) => s + v, 0);
    const lesson = LESSONS[new Date().getDate() % LESSONS.length];

    return `
      <h1>Patrimônio & Mentoria</h1>
      <p class="sub">Aportes, estratégia e aprendizado</p>

      <div class="card highlight">
        <h2>Total aportado</h2>
        <b style="font-size:26px">${money(total)}</b>
        <div class="grid2" style="margin-top:12px">
          ${ASSETS.filter((a) => byAsset[a]).map((a) => `<div class="stat"><span>${a}</span><b>${money(byAsset[a])}</b></div>`).join('') || '<span class="muted">Registre seu primeiro aporte abaixo.</span>'}
        </div>
      </div>

      <div class="card">
        <h2>Registrar aporte</h2>
        <form class="form" data-form="aporte">
          <div class="grid2">
            <select name="asset">${ASSETS.map((a) => `<option>${a}</option>`).join('')}</select>
            <input name="amount" type="number" min="0" step="any" placeholder="Valor" required>
          </div>
          <input name="date" type="date" value="${todayStr()}">
          <button class="btn" type="submit">Salvar aporte</button>
        </form>
      </div>

      <div class="card">
        <h2>Histórico de aportes</h2>
        <ul class="list">
          ${[...S.aportes].reverse().map((a) => `<li class="item"><div class="main"><div class="title">${a.asset}</div><div class="meta">${fmtDate(a.date)}</div></div>
            <b>${money(a.amount)}</b><button class="del" data-del="aportes" data-id="${a.id}">×</button></li>`).join('') || '<li class="empty">Sem aportes ainda.</li>'}
        </ul>
      </div>

      <div class="card">
        <h2>📚 Lição de hoje: ${esc(lesson.t)}</h2>
        <p class="muted" style="margin:0;line-height:1.5">${esc(lesson.b)}</p>
        <p class="muted" style="font-size:12px;margin:12px 0 0">Conteúdo educativo, não é recomendação personalizada. Antes de decisões relevantes, consulte um profissional habilitado.</p>
      </div>`;
  },

  relatorio() {
    const r = buildReport();
    return `
      <h1>Relatório semanal</h1>
      <p class="sub">Gerado automaticamente todo sábado a partir das 20:00 (com o app aberto ou com envio configurado)</p>
      <div class="card">
        <pre class="report">${esc(r.body)}</pre>
        <div class="actions">
          <button class="btn" data-act="sendReport">Enviar por e-mail</button>
          <button class="btn ghost" data-act="copyReport">Copiar texto</button>
        </div>
        <p class="muted" style="font-size:12px;margin-top:10px">Último envio: ${S.lastReport ? new Date(S.lastReport).toLocaleString(S.settings.locale) : 'nenhum ainda'}</p>
      </div>`;
  },

  config() {
    const perm = 'Notification' in window ? Notification.permission : 'indisponível';
    return `
      <h1>Configurações</h1>
      <p class="sub">Dados, sincronização e e-mail</p>

      <div class="card">
        <h2>Sincronização e e-mail</h2>
        <form class="form" data-form="config">
          <input name="email" type="email" placeholder="E-mail para relatórios" value="${esc(S.settings.email)}">
          <input name="endpoint" type="url" placeholder="URL do seu backend (opcional)" value="${esc(S.settings.endpoint)}">
          <input name="syncKey" type="password" placeholder="Chave de sincronização (opcional)" value="${esc(S.settings.syncKey)}">
          <div class="grid2">
            <input name="currency" placeholder="Moeda (AOA, BRL, USD)" value="${esc(S.settings.currency)}">
            <input name="locale" placeholder="Idioma (pt-AO, pt-BR, en-US)" value="${esc(S.settings.locale)}">
          </div>
          <button class="btn" type="submit">Salvar configurações</button>
        </form>
        <p class="muted" style="font-size:12px;margin-top:10px">Sem backend, o relatório abre no seu app de e-mail. Com backend, ele é enviado automaticamente. Veja as instruções abaixo.</p>
      </div>

      <div class="card">
        <h2>Notificações</h2>
        <p class="muted">Permissão atual: <b>${perm}</b></p>
        <div class="actions"><button class="btn ghost" data-act="requestNotif">Ativar notificações</button></div>
      </div>

      <div class="card">
        <h2>Rotina diária</h2>
        <ul class="list">
          ${S.routine.map((r) => `<li class="item"><div class="main"><div class="title">${esc(r.text)}</div></div><button class="del" data-del="routine" data-id="${r.id}">×</button></li>`).join('')}
        </ul>
        <form class="form" data-form="routine">
          <input name="text" placeholder="Novo hábito diário">
          <button class="btn ghost" type="submit">Adicionar hábito</button>
        </form>
      </div>

      <div class="card">
        <h2>Dados</h2>
        <div class="actions">
          <button class="btn ghost" data-act="exportData">Exportar backup</button>
          <button class="btn ghost" data-act="importData">Importar backup</button>
          <button class="btn ghost" data-act="resetAll" style="color:var(--danger)">Apagar tudo</button>
        </div>
      </div>`;
  },
};

/* ---------- Roteamento ---------- */
function render() {
  const tab = (location.hash.slice(1) || 'hoje');
  const key = views[tab] ? tab : 'hoje';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === key));
  $('#view').innerHTML = views[key]();
  updateHeader();
}

window.addEventListener('hashchange', render);

/* ---------- Inicialização ---------- */
render();
pullState();
setInterval(weeklyCheck, 60 * 1000);
weeklyCheck();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW falhou', e));
}