const CONFIG = {
  // Put your deployed Apps Script Web App URL here (ends with /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbzZJHNbxZ7YH57jAYeWKMdjRXOGONx5sF-jq2zDISstqcHvj2-4_-ZPVMco08XN8fR5/exec'
};

const UI = {
  cardLogin: document.getElementById('cardLogin'),
  cardApp: document.getElementById('cardApp'),
  btnLogin: document.getElementById('btnLogin'),
  btnClear: document.getElementById('btnClear'),
  btnLogout: document.getElementById('btnLogout'),
  loginUser: document.getElementById('loginUser'),
  loginPass: document.getElementById('loginPass'),
  loginMsg: document.getElementById('loginMsg'),

  netPill: document.getElementById('netPill'),
  appTitle: document.getElementById('appTitle'),
  logo: document.getElementById('logo'),

  tabForm: document.getElementById('tabForm'),
  tabDash: document.getElementById('tabDash'),
  panelForm: document.getElementById('panelForm'),
  panelDash: document.getElementById('panelDash'),

  metaTipo: document.getElementById('metaTipo'),
  metaArea: document.getElementById('metaArea'),
  metaComunidad: document.getElementById('metaComunidad'),
  metaComentario: document.getElementById('metaComentario'),

  questions: document.getElementById('questions'),
  btnSaveLocal: document.getElementById('btnSaveLocal'),
  btnSendNow: document.getElementById('btnSendNow'),
  btnSync: document.getElementById('btnSync'),
  formMsg: document.getElementById('formMsg'),
  pendingCount: document.getElementById('pendingCount'),
  lastSync: document.getElementById('lastSync'),

  dashWindow: document.getElementById('dashWindow'),
  dashTipo: document.getElementById('dashTipo'),
  dashComunidad: document.getElementById('dashComunidad'),
  btnDash: document.getElementById('btnDash'),
  dashMsg: document.getElementById('dashMsg'),

  lightGreen: document.getElementById('lightGreen'),
  lightYellow: document.getElementById('lightYellow'),
  lightRed: document.getElementById('lightRed'),
  semTitle: document.getElementById('semTitle'),
  semMeta: document.getElementById('semMeta'),
  semExplain: document.getElementById('semExplain'),
  kpis: document.getElementById('kpis'),
  dimRank: document.getElementById('dimRank'),
  dashTable: document.getElementById('dashTable')
};

let STATE = {
  session: null,
  questions: []
};

function setMsg(el, text, kind = 'ok') {
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="msg ${kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'bad'}">${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", "&#039;");
}

function isOnline() { return navigator.onLine; }

function updateNetPill() {
  UI.netPill.textContent = isOnline() ? 'Online' : 'Offline';
  UI.netPill.style.background = isOnline() ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)';
  UI.netPill.style.borderColor = isOnline() ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)';
}

async function api(action, body) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...body })
  });
  const json = await res.json();
  return json;
}

async function init() {
  updateNetPill();
  window.addEventListener('online', async () => { updateNetPill(); await syncPending(true); });
  window.addEventListener('offline', () => updateNetPill());

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { }
  }

  await loadConfig();
  await loadSessionFromCache();
  await refreshPendingCount();

  UI.btnLogin.addEventListener('click', login);
  UI.btnClear.addEventListener('click', () => { UI.loginUser.value = ''; UI.loginPass.value = ''; setMsg(UI.loginMsg, ''); });
  UI.btnLogout.addEventListener('click', logout);

  UI.tabForm.addEventListener('click', () => setTab('form'));
  UI.tabDash.addEventListener('click', () => setTab('dash'));

  UI.btnSaveLocal.addEventListener('click', saveLocalOnly);
  UI.btnSendNow.addEventListener('click', sendNow);
  UI.btnSync.addEventListener('click', () => syncPending(false));

  UI.btnDash.addEventListener('click', loadDashboard);
}

async function loadConfig() {
  if (!isOnline()) {
    const cached = await IDB.get(IDB.STORE_CACHE, 'config');
    if (cached && cached.value) {
      applyConfig(cached.value);
      return;
    }
  }
  try {
    const cfg = await api('config', {});
    if (cfg && cfg.ok) {
      applyConfig(cfg);
      await IDB.put(IDB.STORE_CACHE, { key: 'config', value: cfg, saved_at: new Date().toISOString() });
    }
  } catch (e) { }
}

function applyConfig(cfg) {
  if (cfg.app_title) UI.appTitle.textContent = cfg.app_title;
  UI.logo.src = cfg.logo_url || 'https://i.postimg.cc/SNHrYXDV/logo-PARACEL.jpg';
}

async function loadSessionFromCache() {
  const s = await IDB.get(IDB.STORE_CACHE, 'session');
  if (s && s.value && s.value.token) {
    STATE.session = s.value;
    showApp();
    await loadQuestions();
    if (STATE.session.can_dashboard) UI.tabDash.style.display = 'inline-flex';
  }
}

async function persistSession(session) {
  STATE.session = session;
  await IDB.put(IDB.STORE_CACHE, { key: 'session', value: session, saved_at: new Date().toISOString() });
}

async function login() {
  setMsg(UI.loginMsg, '');
  const usuario = UI.loginUser.value.trim();
  const password = UI.loginPass.value;

  if (!usuario || !password) {
    setMsg(UI.loginMsg, 'Debe completar usuario y contraseña.', 'bad');
    return;
  }
  if (!isOnline()) {
    setMsg(UI.loginMsg, 'Sin conexión. El primer login requiere conexión para obtener sesión.', 'warn');
    return;
  }
  UI.btnLogin.disabled = true;
  try {
    const res = await api('login', { usuario, password });
    if (!res.ok) {
      setMsg(UI.loginMsg, res.error || 'Login inválido.', 'bad');
      return;
    }
    await persistSession(res.session);
    showApp();
    await loadQuestions();
    if (STATE.session.can_dashboard) UI.tabDash.style.display = 'inline-flex';
    else UI.tabDash.style.display = 'none';
    setTab('form');
    await syncPending(true);
  } catch (e) {
    setMsg(UI.loginMsg, 'Error de red al autenticar.', 'bad');
  } finally {
    UI.btnLogin.disabled = false;
  }
}

async function logout() {
  STATE.session = null;
  await IDB.del(IDB.STORE_CACHE, 'session');
  UI.cardApp.style.display = 'none';
  UI.cardLogin.style.display = 'block';
  UI.btnLogout.style.display = 'none';
  UI.tabDash.style.display = 'none';
  setMsg(UI.loginMsg, 'Sesión finalizada.', 'ok');
}

function showApp() {
  UI.cardLogin.style.display = 'none';
  UI.cardApp.style.display = 'block';
  UI.btnLogout.style.display = 'inline-flex';
}

function setTab(which) {
  if (which === 'dash') {
    UI.panelForm.style.display = 'none';
    UI.panelDash.style.display = 'block';
    UI.tabForm.classList.remove('active');
    UI.tabDash.classList.add('active');
  } else {
    UI.panelForm.style.display = 'block';
    UI.panelDash.style.display = 'none';
    UI.tabForm.classList.add('active');
    UI.tabDash.classList.remove('active');
  }
}

async function loadQuestions() {
  // If offline, use cache
  if (!isOnline()) {
    const cached = await IDB.get(IDB.STORE_CACHE, 'questions');
    if (cached && cached.value && Array.isArray(cached.value)) {
      STATE.questions = cached.value;
      renderQuestions();
      setMsg(UI.formMsg, 'Modo offline, usando preguntas cacheadas.', 'warn');
      return;
    }
    setMsg(UI.formMsg, 'Modo offline y sin preguntas cacheadas. Conéctese al menos una vez para descargar preguntas.', 'bad');
    return;
  }

  try {
    const res = await api('questions', { token: STATE.session.token });
    if (!res.ok) {
      setMsg(UI.formMsg, res.error || 'No se pudieron cargar preguntas.', 'bad');
      return;
    }
    STATE.questions = (res.questions || []);
    await IDB.put(IDB.STORE_CACHE, { key: 'questions', value: STATE.questions, saved_at: new Date().toISOString() });
    renderQuestions();
    setMsg(UI.formMsg, 'Preguntas cargadas.', 'ok');
  } catch (e) {
    // fallback to cache
    const cached = await IDB.get(IDB.STORE_CACHE, 'questions');
    if (cached && cached.value) {
      STATE.questions = cached.value;
      renderQuestions();
      setMsg(UI.formMsg, 'Error de red. Usando preguntas cacheadas.', 'warn');
    } else {
      setMsg(UI.formMsg, 'Error de red y sin cache de preguntas.', 'bad');
    }
  }
}

function renderQuestions() {
  const qs = STATE.questions || [];
  if (!qs.length) {
    UI.questions.innerHTML = '<p class="muted">No hay preguntas disponibles.</p>';
    return;
  }
  UI.questions.innerHTML = qs.map(q => {
    const req = q.requerido ? '<span class="qreq">Obligatoria</span>' : '<span class="muted">Opcional</span>';
    const note = q.nota ? `<div class="muted">${escapeHtml(q.nota)}</div>` : '';
    let input = '';

    if (q.tipo_respuesta === 'text') {
      input = `<textarea data-qid="${escapeHtml(q.id_pregunta)}" placeholder="Respuesta"></textarea>`;
    } else if (q.tipo_respuesta === 'single' || q.tipo_respuesta === 'scale') {
      input = (q.opciones || []).map(opt => `
        <div class="opt">
          <input type="radio" name="q_${escapeHtml(q.id_pregunta)}" value="${escapeHtml(opt)}">
          <div>${escapeHtml(opt)}</div>
        </div>
      `).join('');
    } else if (q.tipo_respuesta === 'multi') {
      input = (q.opciones || []).map(opt => `
        <div class="opt">
          <input type="checkbox" data-qid="${escapeHtml(q.id_pregunta)}" value="${escapeHtml(opt)}">
          <div>${escapeHtml(opt)}</div>
        </div>
      `).join('');
    } else {
      input = `<div class="msg bad">tipo_respuesta inválido: ${escapeHtml(q.tipo_respuesta)}</div>`;
    }

    return `
      <div class="qcard" data-qwrap="${escapeHtml(q.id_pregunta)}">
        <div class="qhead">
          <div class="qdim">${escapeHtml(q.dimension || '')}</div>
          ${req}
        </div>
        <div class="qtext">${escapeHtml(q.pregunta || '')}</div>
        ${note}
        <div style="margin-top:10px;">${input}</div>
      </div>
    `;
  }).join('');
}

function collectAnswers() {
  const out = [];
  (STATE.questions || []).forEach(q => {
    const idp = String(q.id_pregunta);
    if (q.tipo_respuesta === 'text') {
      const el = document.querySelector(`textarea[data-qid="${cssEscape(idp)}"]`);
      out.push({ id_pregunta: idp, respuesta: el ? el.value.trim() : '' });
    } else if (q.tipo_respuesta === 'single' || q.tipo_respuesta === 'scale') {
      const el = document.querySelector(`input[type="radio"][name="q_${cssEscape(idp)}"]:checked`);
      out.push({ id_pregunta: idp, respuesta: el ? el.value : '' });
    } else if (q.tipo_respuesta === 'multi') {
      const els = Array.from(document.querySelectorAll(`input[type="checkbox"][data-qid="${cssEscape(idp)}"]:checked`));
      out.push({ id_pregunta: idp, respuesta: els.map(x => x.value) });
    } else {
      out.push({ id_pregunta: idp, respuesta: '' });
    }
  });
  return out;
}

function buildPayload() {
  const meta = {
    tipo_informante: UI.metaTipo.value.trim(),
    area: UI.metaArea.value.trim(),
    comunidad: UI.metaComunidad.value.trim(),
    comentario_general: UI.metaComentario.value.trim()
  };
  const answers = collectAnswers();
  const id_encuesta = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2);
  return { id_encuesta, meta, answers };
}

async function saveLocalOnly() {
  setMsg(UI.formMsg, '');
  if (!STATE.session) { setMsg(UI.formMsg, 'Debe iniciar sesión.', 'bad'); return; }
  const payload = buildPayload();
  const local_id = payload.id_encuesta;

  await IDB.put(IDB.STORE_PENDING, {
    local_id,
    created_at: new Date().toISOString(),
    status: 'pending',
    token: STATE.session.token,
    payload
  });

  await refreshPendingCount();
  setMsg(UI.formMsg, 'Guardado localmente. Se enviará al volver la conexión.', 'ok');
}

async function sendNow() {
  setMsg(UI.formMsg, '');
  if (!STATE.session) { setMsg(UI.formMsg, 'Debe iniciar sesión.', 'bad'); return; }

  const payload = buildPayload();
  const local_id = payload.id_encuesta;

  // Always store first, then try to send (guarantees offline safety)
  await IDB.put(IDB.STORE_PENDING, {
    local_id,
    created_at: new Date().toISOString(),
    status: 'pending',
    token: STATE.session.token,
    payload
  });

  await refreshPendingCount();

  if (!isOnline()) {
    setMsg(UI.formMsg, 'Sin conexión. Quedó en pendientes.', 'warn');
    return;
  }

  await syncPending(false);
}

async function syncPending(silent) {
  if (!STATE.session) return;

  const items = await IDB.listPending(500);
  const pending = items.filter(x => x && x.status === 'pending');

  if (!pending.length) {
    await refreshPendingCount();
    if (!silent) setMsg(UI.formMsg, 'No hay pendientes.', 'ok');
    return;
  }

  if (!isOnline()) {
    await refreshPendingCount();
    if (!silent) setMsg(UI.formMsg, 'Sin conexión, no se puede sincronizar.', 'warn');
    return;
  }

  let okN = 0;
  let badN = 0;

  for (const it of pending) {
    try {
      const res = await api('submit', { token: it.token, id_encuesta: it.payload.id_encuesta, meta: it.payload.meta, answers: it.payload.answers });
      if (res && res.ok) {
        okN += 1;
        await IDB.del(IDB.STORE_PENDING, it.local_id);
      } else {
        badN += 1;
      }
    } catch (e) {
      badN += 1;
    }
  }

  await refreshPendingCount();
  UI.lastSync.textContent = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (!silent) {
    if (badN === 0) setMsg(UI.formMsg, `Sincronización completa. Enviados=${okN}.`, 'ok');
    else setMsg(UI.formMsg, `Sincronización parcial. Enviados=${okN}, fallidos=${badN}.`, 'warn');
  }
}

async function refreshPendingCount() {
  const items = await IDB.listPending(5000);
  const n = items.filter(x => x && x.status === 'pending').length;
  UI.pendingCount.textContent = String(n);
}

async function loadDashboard() {
  setMsg(UI.dashMsg, '');
  if (!STATE.session) { setMsg(UI.dashMsg, 'Debe iniciar sesión.', 'bad'); return; }
  if (!STATE.session.can_dashboard) { setMsg(UI.dashMsg, 'No autorizado para tablero.', 'bad'); return; }
  if (!isOnline()) { setMsg(UI.dashMsg, 'Tablero requiere conexión.', 'warn'); return; }

  UI.btnDash.disabled = true;
  try {
    const window_days = Number(UI.dashWindow.value || 30);
    const tipo_informante = UI.dashTipo.value.trim();
    const comunidad = UI.dashComunidad.value.trim();

    const res = await api('dashboard_summary', { token: STATE.session.token, window_days, tipo_informante, comunidad });
    if (!res.ok) { setMsg(UI.dashMsg, res.error || 'Error tablero.', 'bad'); return; }
    renderDashboard(res.summary);
    setMsg(UI.dashMsg, 'Tablero actualizado.', 'ok');
  } catch (e) {
    setMsg(UI.dashMsg, 'Error de red al cargar tablero.', 'bad');
  } finally {
    UI.btnDash.disabled = false;
  }
}

function setSemaphore(sema) {
  UI.lightGreen.className = 'light';
  UI.lightYellow.className = 'light';
  UI.lightRed.className = 'light';

  if (!sema) {
    UI.semTitle.textContent = 'Semáforo';
    UI.semMeta.textContent = 'Sin datos';
    UI.semExplain.textContent = '';
    return;
  }
  const c = String(sema.color || 'VERDE').toUpperCase();
  if (c === 'VERDE') UI.lightGreen.className = 'light on green';
  if (c === 'AMARILLO') UI.lightYellow.className = 'light on yellow';
  if (c === 'ROJO') UI.lightRed.className = 'light on red';

  UI.semTitle.textContent = 'Semáforo: ' + c;
  UI.semMeta.textContent = 'Promedio diario (puntaje): ' + String(sema.mean_daily_score ?? '');
  const rationale = (sema.rationale || []).map(x => `${x.tipo}: ${x.detalle} (valor=${x.valor})`).join(' | ');
  UI.semExplain.textContent = rationale;
}

function renderDashboard(s) {
  if (!s) return;
  setSemaphore(s.semaforo);

  // communities filter
  const coms = (s.filter_values && s.filter_values.comunidades) ? s.filter_values.comunidades : [];
  const current = UI.dashComunidad.value;
  UI.dashComunidad.innerHTML = [''].concat(coms).map(v => `<option value="${escapeHtml(v)}">${v ? escapeHtml(v) : '(todas)'}</option>`).join('');
  if (coms.includes(current)) UI.dashComunidad.value = current;

  // KPIs
  const k = s.kpi || {};
  const items = [
    { label: 'Respuestas', value: k.n_rows },
    { label: 'Encuestas', value: k.n_encuestas },
    { label: 'Informantes', value: k.n_informantes },
    { label: 'Puntaje total', value: k.sum_score },
    { label: 'Puntaje promedio', value: k.avg_score },
    { label: 'Ventana', value: s.window_days + ' días' },
    { label: 'Desde', value: String(s.range.from).slice(0, 10) },
    { label: 'Hasta', value: String(s.range.to).slice(0, 10) }
  ];
  UI.kpis.innerHTML = items.map(it => `
    <div class="kpi"><div class="klabel">${escapeHtml(it.label)}</div><div class="kval">${escapeHtml(String(it.value ?? ''))}</div></div>
  `).join('');

  // Ranking dims
  const rank = (s.rankings && s.rankings.byDim) ? s.rankings.byDim : [];
  if (!rank.length) UI.dimRank.innerHTML = '<p class="muted">Sin datos.</p>';
  else {
    let html = '<table><thead><tr><th>#</th><th>Dimensión</th><th>Puntaje</th></tr></thead><tbody>';
    rank.slice(0, 20).forEach((r, i) => { html += `<tr><td>${i + 1}</td><td>${escapeHtml(r.dimension)}</td><td>${escapeHtml(String(r.puntaje))}</td></tr>`; });
    html += '</tbody></table>';
    UI.dimRank.innerHTML = html;
  }

  // Sample table
  const sample = (s.sample || []).slice(0, 200);
  if (!sample.length) UI.dashTable.innerHTML = '<p class="muted">Sin registros.</p>';
  else {
    let html = '<table><thead><tr><th>ts</th><th>tipo</th><th>comunidad</th><th>dimensión</th><th>pregunta</th><th>respuesta</th><th>puntaje</th></tr></thead><tbody>';
    sample.forEach(r => {
      html += `<tr>
        <td>${escapeHtml(String(r.ts).slice(0, 19).replace('T', ' '))}</td>
        <td>${escapeHtml(r.tipo_informante || '')}</td>
        <td>${escapeHtml(r.comunidad || '')}</td>
        <td>${escapeHtml(r.dimension || '')}</td>
        <td>${escapeHtml(r.pregunta || '')}</td>
        <td>${escapeHtml(r.respuesta || '')}</td>
        <td>${escapeHtml(String(r.puntaje ?? ''))}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    UI.dashTable.innerHTML = html;
  }
}

function cssEscape(s) { return String(s || '').replaceAll('"', '\\"'); }

// Register SW on first load (already called), and start
init();
