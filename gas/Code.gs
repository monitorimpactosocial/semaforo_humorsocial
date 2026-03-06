/**
 * PARACEL · HUMOR SOCIAL (Offline-first)
 * Backend Google Apps Script
 * - Auth: simplest possible (password stored in usuarios.hash_password as either plain OR SHA-256 hex).
 * - Permissions: dashboard enabled if rol in {editor, admin} OR if permiso_tablero is TRUE/si/1 (optional col).
 * - API via doPost JSON (CORS enabled) for GitHub Pages / mobile PWA.
 *
 * Spreadsheet:
 *   usuarios: usuario | hash_password | nombre | rol | activo | tipo_informante_default | observacion | (opcional) permiso_tablero
 *   preguntas: id_pregunta | dimension | pregunta | tipo_respuesta | opciones | puntajes | requerido | orden | activo | nota
 *   respuestas: ts | usuario | nombre | rol | tipo_informante | area | comunidad | id_encuesta | id_pregunta | respuesta | puntaje | comentario
 */

const CFG = {
  SPREADSHEET_ID: '1viXJfHTebeCyStJkAkA4uRdNXa4FgHgsomcmhlxNB0k',
  SHEET_USERS: 'usuarios',
  SHEET_QUESTIONS: 'preguntas',
  SHEET_RESPONSES: 'respuestas',
  SHEET_PARAMS: 'parametros',
  SESSION_TTL_MIN: 240,
  DASHBOARD_ROLES: ['editor', 'admin'],
  RESP_HEADERS: ['ts','usuario','nombre','rol','tipo_informante','area','comunidad','id_encuesta','id_pregunta','respuesta','puntaje','comentario']
};

/* =========================
 * Entry points
 * ========================= */

function doGet(e) {
  // Backend is API-only for GitHub Pages. Provide a minimal message for direct opens.
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, service:'PARACEL_HS_API', ts:new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const payload = parseJson_(e);
  const action = String((payload && payload.action) ? payload.action : '').trim();

  let out;
  try {
    if (!action) throw new Error('Missing action');

    if (action === 'ping') out = apiPing_();
    else if (action === 'config') out = apiConfig_();
    else if (action === 'login') out = apiLogin_(payload);
    else if (action === 'questions') out = apiQuestions_(payload);
    else if (action === 'submit') out = apiSubmit_(payload);
    else if (action === 'dashboard_summary') out = apiDashboardSummary_(payload);
    else throw new Error('Unknown action');

    return jsonOut_(out);
  } catch (err) {
    return jsonOut_({ ok:false, error: String(err && err.message ? err.message : err) });
  }
}

/* =========================
 * API implementations
 * ========================= */

function apiPing_() {
  return { ok:true, ts:new Date().toISOString() };
}

function apiConfig_() {
  const params = readParams_();
  return {
    ok:true,
    app_title: params.app_title || 'Paracel · Humor Social',
    logo_url: params.logo_url || 'https://i.postimg.cc/SNHrYXDV/logo-PARACEL.jpg'
  };
}

function apiLogin_(p) {
  requireFields_(p, ['usuario','password']);
  const usuario = String(p.usuario || '').trim();
  const password = String(p.password || '');

  const u = getUserRecord_(usuario);
  if (!u) return { ok:false, error:'Usuario no registrado.' };
  if (!truthy_(u.activo)) return { ok:false, error:'Usuario inactivo.' };

  const stored = String(u.hash_password || '').trim();
  const computed = sha256Hex_(password);

  // Simplest migration-friendly auth:
  // - If stored looks like SHA-256 hex (64 hex chars), compare to computed
  // - Else treat stored as plaintext password and compare directly
  const looksHash = /^[0-9a-f]{64}$/i.test(stored);
  const ok = looksHash ? (stored.toLowerCase() === computed) : (stored === password);

  if (!ok) return { ok:false, error:'Credenciales inválidas.' };

  const token = Utilities.getUuid();
  const now = new Date();
  const exp = new Date(now.getTime() + CFG.SESSION_TTL_MIN * 60 * 1000);

  const canDashboard = roleAllowsDashboard_(u.rol) || truthy_(u.permiso_tablero);

  const ses = {
    token,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    tipo_informante_default: u.tipo_informante_default,
    can_dashboard: canDashboard,
    iat: now.toISOString(),
    exp: exp.toISOString()
  };

  CacheService.getScriptCache().put(sessionKey_(token), JSON.stringify(ses), CFG.SESSION_TTL_MIN * 60);

  return { ok:true, session: ses };
}

function apiQuestions_(p) {
  const ses = requireSession_(p);
  const qs = readQuestions_();
  return { ok:true, session: stripSession_(ses), questions: qs };
}

function apiSubmit_(p) {
  const ses = requireSession_(p);
  requireFields_(p, ['meta','answers']);

  const meta = p.meta || {};
  const answers = Array.isArray(p.answers) ? p.answers : [];

  const tipo_informante = String(meta.tipo_informante || ses.tipo_informante_default || '').trim();
  const area = String(meta.area || '').trim();
  const comunidad = String(meta.comunidad || '').trim();
  const comentario = String(meta.comentario_general || '').trim();

  if (!tipo_informante) throw new Error('Tipo de informante es obligatorio.');

  const questions = readQuestions_();
  const qMap = {};
  questions.forEach(q => { qMap[q.id_pregunta] = q; });

  // Validate required
  const missing = [];
  questions.filter(q => truthy_(q.requerido)).forEach(q => {
    const found = answers.find(a => String(a.id_pregunta) === String(q.id_pregunta));
    const val = found ? normalizeAnswer_(found.respuesta) : '';
    if (!String(val || '').trim()) missing.push(q.id_pregunta);
  });
  if (missing.length) return { ok:false, error:'Faltan respuestas obligatorias.', missing_required: missing };

  const ts = new Date();
  const id_encuesta = String(p.id_encuesta || Utilities.getUuid());
  const rows = [];

  answers.forEach(a => {
    const idp = String(a.id_pregunta || '').trim();
    if (!idp) return;
    const q = qMap[idp];
    const resp = normalizeAnswer_(a.respuesta);
    const score = computeScore_(q, resp);

    rows.push([
      ts,
      ses.usuario,
      ses.nombre,
      ses.rol,
      tipo_informante,
      area,
      comunidad,
      id_encuesta,
      idp,
      resp,
      score,
      comentario
    ]);
  });

  if (!rows.length) throw new Error('No se recibieron respuestas.');

  appendRowsSafe_(CFG.SHEET_RESPONSES, rows);

  return { ok:true, id_encuesta };
}

function apiDashboardSummary_(p) {
  const ses = requireSession_(p);
  if (!ses.can_dashboard) throw new Error('Acceso denegado. Tablero solo para usuarios autorizados.');

  const windowDays = Number(p.window_days || 30);
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const tipo = String(p.tipo_informante || '').trim();
  const comunidad = String(p.comunidad || '').trim();

  const rows = fetchResponses_(from, to, tipo, comunidad);

  const q = readQuestions_();
  const qText = {};
  q.forEach(x => { qText[String(x.id_pregunta)] = String(x.pregunta || ''); });

  const summary = buildSummary_(rows, qText, windowDays, from, to);
  return { ok:true, session: stripSession_(ses), summary };
}

/* =========================
 * Summary and semaphore
 * ========================= */

function buildSummary_(rows, qText, windowDays, from, to) {
  const nRows = rows.length;
  const nEncuestas = uniqueCount_(rows.map(r => r.id_encuesta));
  const nInformantes = uniqueCount_(rows.map(r => r.usuario));
  const sumScore = sum_(rows.map(r => r.puntaje));
  const avgScore = nRows ? sumScore / nRows : 0;

  const byDay = groupSum_(rows, r => String(r.ts).slice(0,10), r => r.puntaje);
  const byDim = groupSum_(rows, r => r.dimension || '(sin_dimension)', r => r.puntaje);

  const sem = computeSemaphore_(rows, byDay);

  const sample = rows.slice(0,200).map(r => ({
    ts: r.ts,
    usuario: r.usuario,
    tipo_informante: r.tipo_informante,
    comunidad: r.comunidad,
    dimension: r.dimension,
    id_pregunta: r.id_pregunta,
    pregunta: qText[r.id_pregunta] || r.id_pregunta,
    respuesta: r.respuesta,
    puntaje: r.puntaje,
    id_encuesta: r.id_encuesta
  }));

  const dimRank = Object.keys(byDim).map(k => ({ dimension:k, puntaje: byDim[k] }))
    .sort((a,b) => b.puntaje - a.puntaje)
    .slice(0,20);

  const communities = uniqueList_(rows.map(r => r.comunidad).filter(Boolean)).sort();

  return {
    window_days: windowDays,
    range: { from: from.toISOString(), to: to.toISOString() },
    kpi: {
      n_rows: nRows,
      n_encuestas: nEncuestas,
      n_informantes: nInformantes,
      sum_score: round_(sumScore, 4),
      avg_score: round_(avgScore, 4)
    },
    semaforo: sem,
    aggregates: { byDay, byDim },
    rankings: { byDim: dimRank },
    sample,
    filter_values: { comunidades: communities }
  };
}

function computeSemaphore_(rows, byDay) {
  const days = Object.keys(byDay || {}).sort();
  let meanDaily = 0;
  if (days.length) {
    const daily = days.map(d => Number(byDay[d] || 0));
    meanDaily = sum_(daily) / daily.length;
  }

  let color = 'VERDE';
  if (meanDaily <= -0.5) color = 'ROJO';
  else if (meanDaily < 0.5) color = 'AMARILLO';

  const signals = [];
  let hasRed = false;
  let hasYellow = false;

  const strong = ['Corte de ruta planificado','Protesta convocada'];
  const medium = ['Notas formales a autoridades','Denuncias mediáticas'];

  rows.forEach(r => {
    const idp = String(r.id_pregunta || '');
    const resp = String(r.respuesta || '');

    if (idp === 'P025') {
      resp.split('|').map(s => s.trim()).filter(Boolean).forEach(s => {
        if (strong.indexOf(s) >= 0) { hasRed = true; signals.push({nivel:'ROJO', fuente:'P025', señal:s, ts:r.ts, id_encuesta:r.id_encuesta}); }
        else if (medium.indexOf(s) >= 0) { hasYellow = true; signals.push({nivel:'AMARILLO', fuente:'P025', señal:s, ts:r.ts, id_encuesta:r.id_encuesta}); }
      });
    }
    if (idp === 'P018' && resp === 'Sí, graves') { hasRed = true; signals.push({nivel:'ROJO', fuente:'P018', señal:'Incidente ambiental grave', ts:r.ts, id_encuesta:r.id_encuesta}); }
    if (idp === 'P026') {
      if (resp === 'Crítica') { hasRed = true; signals.push({nivel:'ROJO', fuente:'P026', señal:'Urgencia crítica', ts:r.ts, id_encuesta:r.id_encuesta}); }
      else if (resp === 'Alta') { hasYellow = true; signals.push({nivel:'AMARILLO', fuente:'P026', señal:'Urgencia alta', ts:r.ts, id_encuesta:r.id_encuesta}); }
    }
  });

  if (hasRed) color = 'ROJO';
  else if (hasYellow && color === 'VERDE') color = 'AMARILLO';

  const rationale = [
    { tipo:'Índice cuantitativo', detalle:'Promedio diario de puntaje', valor: round_(meanDaily,4), regla:'Verde>=0.5, Amarillo(-0.5,0.5), Rojo<=-0.5' }
  ];
  if (hasRed) rationale.push({ tipo:'Gatillo', detalle:'Señales críticas detectadas', valor:'ROJO', regla:'P025/P018/P026' });
  if (!hasRed && hasYellow) rationale.push({ tipo:'Gatillo', detalle:'Señales de atención detectadas', valor:'AMARILLO', regla:'P025/P026' });

  return { color, mean_daily_score: round_(meanDaily,4), rationale, signals: signals.slice(0,50) };
}

/* =========================
 * Data access
 * ========================= */

function fetchResponses_(from, to, tipo, comunidad) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_RESPONSES);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(String);
  const idx = indexMapStrict_(header, CFG.RESP_HEADERS);
  const qDim = questionDimensionMap_();

  const out = [];
  for (let i=1; i<values.length; i++) {
    const r = values[i];
    const tsVal = r[idx.ts];
    const ts = tsVal instanceof Date ? tsVal : new Date(tsVal);
    if (from && ts < from) continue;
    if (to && ts > to) continue;

    const ti = String(r[idx.tipo_informante] || '');
    if (tipo && ti !== tipo) continue;

    const com = String(r[idx.comunidad] || '');
    if (comunidad && com !== comunidad) continue;

    const idp = String(r[idx.id_pregunta] || '');
    const dim = qDim[idp] || '';

    out.push({
      ts: ts.toISOString(),
      usuario: String(r[idx.usuario] || ''),
      tipo_informante: ti,
      comunidad: com,
      id_encuesta: String(r[idx.id_encuesta] || ''),
      id_pregunta: idp,
      dimension: dim,
      respuesta: String(r[idx.respuesta] || ''),
      puntaje: Number(r[idx.puntaje] || 0)
    });
  }

  out.sort((a,b) => (a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0)));
  return out;
}

/* =========================
 * Questions and users
 * ========================= */

function readQuestions_() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_QUESTIONS);
  if (!sh) throw new Error('No existe hoja preguntas.');

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(String);
  const idx = indexMapStrict_(header, ['id_pregunta','dimension','pregunta','tipo_respuesta','opciones','puntajes','requerido','orden','activo','nota']);

  const out = [];
  for (let i=1; i<values.length; i++) {
    const row = values[i];
    if (!truthy_(row[idx.activo])) continue;

    const opciones = String(row[idx.opciones] || '').trim();
    const puntajes = String(row[idx.puntajes] || '').trim();

    out.push({
      id_pregunta: String(row[idx.id_pregunta] || '').trim(),
      dimension: String(row[idx.dimension] || '').trim(),
      pregunta: String(row[idx.pregunta] || '').trim(),
      tipo_respuesta: String(row[idx.tipo_respuesta] || '').trim(),
      opciones: opciones ? opciones.split('|').map(s => s.trim()) : [],
      puntajes: puntajes ? puntajes.split('|').map(s => Number(String(s).trim())) : [],
      requerido: truthy_(row[idx.requerido]),
      orden: Number(row[idx.orden] || 0),
      nota: String(row[idx.nota] || '').trim()
    });
  }
  out.sort((a,b) => (a.orden-b.orden) || a.id_pregunta.localeCompare(b.id_pregunta));
  return out;
}

function getUserRecord_(usuario) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_USERS);
  if (!sh) throw new Error('No existe hoja usuarios.');

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const header = values[0].map(String);
  const idx = indexMapStrict_(header, ['usuario','hash_password','nombre','rol','activo','tipo_informante_default','observacion']);

  // permiso_tablero is optional
  const hasPermCol = header.map(h => String(h).trim()).indexOf('permiso_tablero') >= 0;
  const permIdx = hasPermCol ? header.map(h => String(h).trim()).indexOf('permiso_tablero') : -1;

  for (let i=1; i<values.length; i++) {
    const u = String(values[i][idx.usuario] || '').trim();
    if (u && u.toLowerCase() === usuario.toLowerCase()) {
      return {
        usuario: u,
        hash_password: String(values[i][idx.hash_password] || '').trim(),
        nombre: String(values[i][idx.nombre] || '').trim(),
        rol: String(values[i][idx.rol] || '').trim(),
        activo: values[i][idx.activo],
        tipo_informante_default: String(values[i][idx.tipo_informante_default] || '').trim(),
        observacion: String(values[i][idx.observacion] || '').trim(),
        permiso_tablero: hasPermCol ? values[i][permIdx] : ''
      };
    }
  }
  return null;
}

function questionDimensionMap_() {
  const qs = readQuestions_();
  const m = {};
  qs.forEach(q => { m[String(q.id_pregunta)] = String(q.dimension || ''); });
  return m;
}

/* =========================
 * Session management
 * ========================= */

function requireSession_(p) {
  requireFields_(p, ['token']);
  const token = String(p.token || '').trim();
  const raw = CacheService.getScriptCache().get(sessionKey_(token));
  if (!raw) throw new Error('Sesión expirada o inválida.');
  return JSON.parse(raw);
}

function stripSession_(ses) {
  // Avoid returning token copies unnecessarily
  return {
    usuario: ses.usuario,
    nombre: ses.nombre,
    rol: ses.rol,
    tipo_informante_default: ses.tipo_informante_default,
    can_dashboard: ses.can_dashboard,
    exp: ses.exp
  };
}

function sessionKey_(token) {
  return 'PARACEL_HS_SESSION_' + token;
}

function roleAllowsDashboard_(rol) {
  const r = String(rol || '').trim().toLowerCase();
  return CFG.DASHBOARD_ROLES.indexOf(r) >= 0;
}

/* =========================
 * Write safety
 * ========================= */

function appendRowsSafe_(sheetName, rows) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    appendRows_(sheetName, rows);
  } finally {
    lock.releaseLock();
  }
}

function appendRows_(sheetName, rows) {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('No existe hoja: ' + sheetName);

  ensureHeaders_(sh, CFG.RESP_HEADERS);

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureHeaders_(sh, headers) {
  const lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
}

/* =========================
 * Helpers
 * ========================= */

function parseJson_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!body) return {};
  return JSON.parse(body);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireFields_(obj, fields) {
  if (!obj || typeof obj !== 'object') throw new Error('Payload inválido.');
  fields.forEach(f => { if (!(f in obj)) throw new Error('Falta parámetro: ' + f); });
}

function readParams_() {
  const ss = SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CFG.SHEET_PARAMS);
  if (!sh) return {};
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return {};
  const out = {};
  for (let i=1; i<vals.length; i++) {
    const k = String(vals[i][0] || '').trim();
    const v = String(vals[i][1] || '').trim();
    if (k) out[k] = v;
  }
  return out;
}

function indexMapStrict_(header, requiredCols) {
  const idx = {};
  header.forEach((h,i) => { idx[String(h).trim()] = i; });
  requiredCols.forEach(c => { if (!(c in idx)) throw new Error('Falta columna requerida: ' + c); });
  return new Proxy(idx, {
    get(target, prop) {
      const k = String(prop);
      if (!(k in target)) throw new Error('Falta columna requerida: ' + k);
      return target[k];
    }
  });
}

function normalizeAnswer_(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean).join('|');
  return String(val).trim();
}

function computeScore_(q, respuesta) {
  if (!q) return 0;
  const t = String(q.tipo_respuesta || '');
  const opts = q.opciones || [];
  const scores = q.puntajes || [];
  if (!opts.length || !scores.length) return 0;

  if (t === 'single' || t === 'scale') {
    const pos = opts.indexOf(respuesta);
    return (pos >= 0 && pos < scores.length) ? Number(scores[pos] || 0) : 0;
  }
  if (t === 'multi') {
    const parts = String(respuesta || '').split('|').map(s => s.trim()).filter(Boolean);
    let sum = 0;
    parts.forEach(p => {
      const pos = opts.indexOf(p);
      if (pos >= 0 && pos < scores.length) sum += Number(scores[pos] || 0);
    });
    return sum;
  }
  return 0;
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function truthy_(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || '').trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes');
}

function groupSum_(rows, keyFn, valFn) {
  const out = {};
  rows.forEach(r => {
    const k = String(keyFn(r) || '');
    const v = Number(valFn(r) || 0);
    out[k] = (out[k] || 0) + v;
  });
  return out;
}

function uniqueCount_(arr) {
  const s = {};
  arr.forEach(x => { s[String(x || '')] = true; });
  return Object.keys(s).filter(Boolean).length;
}

function uniqueList_(arr) {
  const s = {};
  arr.forEach(x => { s[String(x || '')] = true; });
  return Object.keys(s).filter(Boolean);
}

function sum_(arr) {
  let s = 0;
  arr.forEach(v => { s += Number(v || 0); });
  return s;
}

function round_(x, d) {
  const p = Math.pow(10, Number(d || 0));
  return Math.round(Number(x || 0) * p) / p;
}
