import { SEED_DATA } from "./seed-data.js";

const DB_NAME = "paracel_semaforo_humor_social";
const DB_VERSION = 1;
const STORE_USERS = "users";
const STORE_SURVEYS = "surveys";
const SESSION_KEY = "paracel_session_v1";
const APP_HEADERS = [
  "ts",
  "usuario",
  "nombre",
  "rol",
  "tipo_informante",
  "departamento",
  "distrito",
  "comunidad",
  "id_encuesta",
  "id_pregunta",
  "respuesta",
  "puntaje",
  "comentario",
  "gps_lat",
  "gps_lng",
  "gps_accuracy"
];

const state = {
  db: null,
  currentUser: null,
  deferredInstallPrompt: null,
  currentGps: null,
  editingUser: null
};

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
  void boot();
});

async function boot() {
  mapDom();
  bindEvents();
  updateNetworkBadge();
  await registerServiceWorker();

  state.db = await openDb();
  await seedUsers();
  await restoreSession();

  renderQuestionnaire();
  initGeoSelectors();
  resetSurveyForm();
  await renderPending();
}

function mapDom() {
  const ids = [
    "networkBadge",
    "installBtn",
    "logoutBtn",
    "loginView",
    "appView",
    "loginForm",
    "loginUser",
    "loginPass",
    "loginMsg",
    "welcomeTitle",
    "welcomeMeta",
    "tabSurveyBtn",
    "tabPendingBtn",
    "tabUsersBtn",
    "tabSettingsBtn",
    "surveyForm",
    "draftCount",
    "idEncuesta",
    "tipoInformante",
    "departamento",
    "distrito",
    "comunidad",
    "comunidadList",
    "gpsBtn",
    "gpsStatus",
    "questionnaire",
    "comentarioGeneral",
    "surveyMsg",
    "pendingMeta",
    "pendingList",
    "pendingMsg",
    "exportCsvBtn",
    "exportJsonBtn",
    "importJsonInput",
    "markSyncedBtn",
    "userForm",
    "userFormOriginal",
    "userUsername",
    "userNombre",
    "userRol",
    "userPassword",
    "userTipoInformante",
    "userActivo",
    "cancelUserBtn",
    "usersTableBody",
    "usersMsg",
    "wipeDataBtn",
    "settingsMsg",
    "pendingItemTpl"
  ];

  for (const id of ids) dom[id] = document.getElementById(id);
}

function bindEvents() {
  window.addEventListener("online", updateNetworkBadge);
  window.addEventListener("offline", updateNetworkBadge);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    dom.installBtn.classList.remove("hidden");
  });

  dom.installBtn.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    dom.installBtn.classList.add("hidden");
  });

  dom.logoutBtn.addEventListener("click", () => {
    state.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  dom.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void login();
  });

  for (const tabBtn of [
    dom.tabSurveyBtn,
    dom.tabPendingBtn,
    dom.tabUsersBtn,
    dom.tabSettingsBtn
  ]) {
    tabBtn.addEventListener("click", () => activateTab(tabBtn.dataset.tab));
  }

  dom.departamento.addEventListener("change", () => {
    renderDistrictOptions(dom.departamento.value);
    renderCommunityOptions(dom.departamento.value, dom.distrito.value);
  });

  dom.distrito.addEventListener("change", () => {
    renderCommunityOptions(dom.departamento.value, dom.distrito.value);
  });

  dom.gpsBtn.addEventListener("click", captureGps);

  dom.surveyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSurvey();
  });

  dom.exportCsvBtn.addEventListener("click", () => void exportCsv());
  dom.exportJsonBtn.addEventListener("click", () => void exportJson());
  dom.markSyncedBtn.addEventListener("click", () => void markAllSynced());

  dom.importJsonInput.addEventListener("change", (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    void importJson(file);
    input.value = "";
  });

  dom.userForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveUser();
  });

  dom.cancelUserBtn.addEventListener("click", clearUserForm);
  dom.usersTableBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = target.dataset.action;
    const username = target.dataset.username;
    if (!action || !username) return;
    void handleUserAction(action, username);
  });

  dom.wipeDataBtn.addEventListener("click", () => void wipeLocalData());
}

function updateNetworkBadge() {
  const online = navigator.onLine;
  dom.networkBadge.textContent = online ? "En línea" : "Sin conexión";
  dom.networkBadge.classList.toggle("badge-online", online);
  dom.networkBadge.classList.toggle("badge-offline", !online);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // No-op: la app sigue funcionando sin el registro.
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        const store = db.createObjectStore(STORE_SURVEYS, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbTx(storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(storeName, key) {
  return dbTx(storeName, "readonly", (store) => store.get(key));
}

async function dbGetAll(storeName) {
  return dbTx(storeName, "readonly", (store) => store.getAll());
}

async function dbPut(storeName, value) {
  return dbTx(storeName, "readwrite", (store) => store.put(value));
}

async function dbDelete(storeName, key) {
  return dbTx(storeName, "readwrite", (store) => store.delete(key));
}

async function dbClear(storeName) {
  return dbTx(storeName, "readwrite", (store) => store.clear());
}

async function seedUsers() {
  const current = await dbGetAll(STORE_USERS);
  if (current.length > 0) return;
  const now = new Date().toISOString();
  for (const user of SEED_DATA.users) {
    await dbPut(STORE_USERS, { ...user, createdAt: now, updatedAt: now });
  }
}

async function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    showLogin();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const user = await dbGet(STORE_USERS, parsed.username);
    if (!user || !user.active) {
      localStorage.removeItem(SESSION_KEY);
      showLogin();
      return;
    }
    state.currentUser = sanitizeSessionUser(user);
    showApp();
  } catch {
    localStorage.removeItem(SESSION_KEY);
    showLogin();
  }
}

function sanitizeSessionUser(user) {
  return {
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    tipoInformanteDefault: user.tipoInformanteDefault || ""
  };
}

async function login() {
  setMessage(dom.loginMsg, "", false);
  const username = dom.loginUser.value.trim();
  const password = dom.loginPass.value;

  if (!username || !password) {
    setMessage(dom.loginMsg, "Completá usuario y contraseña.", true);
    return;
  }

  const user = await dbGet(STORE_USERS, username);
  if (!user || !user.active) {
    setMessage(dom.loginMsg, "Usuario no existe o está inactivo.", true);
    return;
  }

  const hash = await sha256(password);
  if (hash !== String(user.passwordHash || "").toLowerCase()) {
    setMessage(dom.loginMsg, "Contraseña incorrecta.", true);
    return;
  }

  state.currentUser = sanitizeSessionUser(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username: user.username }));
  dom.loginForm.reset();
  showApp();
}

function showLogin() {
  dom.loginView.classList.remove("hidden");
  dom.appView.classList.add("hidden");
  dom.logoutBtn.classList.add("hidden");
}

function showApp() {
  if (!state.currentUser) return;

  dom.loginView.classList.add("hidden");
  dom.appView.classList.remove("hidden");
  dom.logoutBtn.classList.remove("hidden");

  dom.welcomeTitle.textContent = `Bienvenido/a, ${state.currentUser.name}`;
  dom.welcomeMeta.textContent = `${state.currentUser.username} · Rol ${state.currentUser.role}`;

  const isAdmin = state.currentUser.role === "admin";
  dom.tabUsersBtn.classList.toggle("hidden", !isAdmin);
  if (!isAdmin && document.getElementById("tab-users").classList.contains("active")) {
    activateTab("survey");
  }

  resetSurveyForm();
  void renderPending();
  if (isAdmin) {
    clearUserForm();
    void renderUsers();
  }
}

function activateTab(tabName) {
  for (const button of document.querySelectorAll(".tab-btn")) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }

  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.classList.remove("active");
    panel.classList.add("hidden");
  }

  const selected = document.getElementById(`tab-${tabName}`);
  if (selected) {
    selected.classList.remove("hidden");
    selected.classList.add("active");
  }

  if (tabName === "pending") {
    void renderPending();
  } else if (tabName === "users" && state.currentUser?.role === "admin") {
    void renderUsers();
  }
}

function initGeoSelectors() {
  const departamentos = [...new Set(SEED_DATA.catalogoDistritos.map((x) => x.departamento))].sort();
  dom.departamento.innerHTML = departamentos
    .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
    .join("");

  if (departamentos.length > 0) {
    dom.departamento.value = departamentos[0];
  }
  renderDistrictOptions(dom.departamento.value);
  renderCommunityOptions(dom.departamento.value, dom.distrito.value);
}

function renderDistrictOptions(departamento) {
  const distritos = [
    ...new Set(
      SEED_DATA.catalogoDistritos
        .filter((x) => x.departamento === departamento)
        .map((x) => x.distrito)
    )
  ].sort();

  dom.distrito.innerHTML = distritos
    .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
    .join("");

  if (distritos.length > 0) {
    dom.distrito.value = distritos[0];
  }
}

function renderCommunityOptions(departamento, distrito) {
  const comunidades = SEED_DATA.catalogoComunidades
    .filter((x) => x.departamento === departamento && x.distrito === distrito)
    .map((x) => x.comunidad)
    .sort();

  dom.comunidadList.innerHTML = comunidades
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");

  if (comunidades.length > 0) {
    dom.comunidad.value = comunidades[0];
  } else {
    dom.comunidad.value = "";
  }
}

function renderQuestionnaire() {
  const activeQuestions = [...SEED_DATA.questions].sort((a, b) => a.order - b.order);
  dom.questionnaire.innerHTML = activeQuestions.map(buildQuestionCard).join("");
}

function buildQuestionCard(question) {
  const header = `
    <div class="question-head">
      <span class="question-id">${question.id} · ${escapeHtml(question.dimension)}</span>
      <span class="badge badge-neutral">${question.type}</span>
    </div>
    <p class="question-text">${escapeHtml(question.text)}${question.required ? " *" : ""}</p>
  `;

  if (question.type === "single") {
    const options = question.options
      .map((opt, idx) => {
        const id = `${question.id}-single-${idx}`;
        return `
          <label class="option-item" for="${id}">
            <input id="${id}" type="radio" name="q-${question.id}" value="${idx}">
            <span>${escapeHtml(opt)}</span>
          </label>
        `;
      })
      .join("");
    return `<article class="question-card" data-question-id="${question.id}">${header}<div class="options">${options}</div></article>`;
  }

  if (question.type === "multi") {
    const options = question.options
      .map((opt, idx) => {
        const id = `${question.id}-multi-${idx}`;
        return `
          <label class="option-item" for="${id}">
            <input id="${id}" type="checkbox" name="q-${question.id}" value="${idx}">
            <span>${escapeHtml(opt)}</span>
          </label>
        `;
      })
      .join("");
    return `<article class="question-card" data-question-id="${question.id}">${header}<div class="options">${options}</div></article>`;
  }

  if (question.type === "photo") {
    return `
      <article class="question-card" data-question-id="${question.id}">
        ${header}
        <label class="field">
          <span>Adjuntar evidencia (opcional)</span>
          <input type="file" name="q-${question.id}" accept="image/*" capture="environment">
        </label>
      </article>
    `;
  }

  return `
    <article class="question-card" data-question-id="${question.id}">
      ${header}
      <label class="field">
        <span>Respuesta</span>
        <textarea name="q-${question.id}" rows="3"></textarea>
      </label>
    </article>
  `;
}

function resetSurveyForm() {
  if (!state.currentUser) return;
  dom.surveyForm.reset();
  dom.idEncuesta.value = generateSurveyId();
  dom.tipoInformante.value = state.currentUser.tipoInformanteDefault || "Poblador/a general";
  dom.comentarioGeneral.value = "";
  state.currentGps = null;
  dom.gpsStatus.textContent = "Sin coordenadas.";
  setMessage(dom.surveyMsg, "", false);

  if (dom.departamento.options.length > 0) {
    dom.departamento.selectedIndex = 0;
    renderDistrictOptions(dom.departamento.value);
    renderCommunityOptions(dom.departamento.value, dom.distrito.value);
  }
}

function generateSurveyId() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ENC-${Date.now()}-${rand}`;
}

function captureGps() {
  if (!("geolocation" in navigator)) {
    dom.gpsStatus.textContent = "Este dispositivo no soporta geolocalización.";
    return;
  }
  dom.gpsStatus.textContent = "Capturando GPS...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.currentGps = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
        accuracy: Math.round(position.coords.accuracy)
      };
      dom.gpsStatus.textContent = `Lat ${state.currentGps.lat} · Lng ${state.currentGps.lng} · ±${state.currentGps.accuracy}m`;
    },
    (error) => {
      dom.gpsStatus.textContent = `No se pudo capturar GPS (${error.message}).`;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

async function saveSurvey() {
  if (!state.currentUser) return;
  setMessage(dom.surveyMsg, "", false);

  const departamento = dom.departamento.value.trim();
  const distrito = dom.distrito.value.trim();
  const comunidad = dom.comunidad.value.trim();
  const tipoInformante = dom.tipoInformante.value.trim();
  const idEncuesta = dom.idEncuesta.value.trim();
  const comentarioGeneral = dom.comentarioGeneral.value.trim();

  if (!tipoInformante || !departamento || !distrito || !comunidad) {
    setMessage(dom.surveyMsg, "Completá tipo de informante y ubicación.", true);
    return;
  }

  const answersResult = await collectAnswers();
  if (!answersResult.ok) {
    setMessage(dom.surveyMsg, answersResult.message, true);
    return;
  }

  const survey = {
    id: idEncuesta,
    createdAt: new Date().toISOString(),
    createdBy: state.currentUser.username,
    nombre: state.currentUser.name,
    rol: state.currentUser.role,
    tipoInformante,
    departamento,
    distrito,
    comunidad,
    gps: state.currentGps,
    comentarioGeneral,
    synced: false,
    answers: answersResult.answers
  };

  await dbPut(STORE_SURVEYS, survey);

  setMessage(dom.surveyMsg, "Sondeo guardado localmente. Quedó pendiente de sincronización.", false);
  resetSurveyForm();
  await renderPending();
}

async function collectAnswers() {
  const answers = [];
  const questions = [...SEED_DATA.questions].sort((a, b) => a.order - b.order);

  for (const q of questions) {
    const nodeList = [...dom.questionnaire.querySelectorAll(`[name="q-${q.id}"]`)];
    let response = "";
    let score = 0;
    let attachment = null;

    if (q.type === "single") {
      const selected = nodeList.find((input) => input.checked);
      if (!selected && q.required) {
        return { ok: false, message: `La pregunta ${q.id} es obligatoria.` };
      }
      if (selected) {
        const idx = Number(selected.value);
        response = q.options[idx] || "";
        score = Number(q.scores[idx] || 0);
      }
    } else if (q.type === "multi") {
      const checked = nodeList.filter((input) => input.checked);
      if (checked.length === 0 && q.required) {
        return { ok: false, message: `La pregunta ${q.id} es obligatoria.` };
      }
      if (checked.length > 0) {
        const idxs = checked.map((input) => Number(input.value));
        response = idxs.map((idx) => q.options[idx]).join(" | ");
        score = idxs.reduce((acc, idx) => acc + Number(q.scores[idx] || 0), 0);
      }
    } else if (q.type === "photo") {
      const fileInput = nodeList[0];
      const file = fileInput?.files?.[0];
      if (file) {
        response = file.name;
        attachment = await fileToDataUrl(file);
      }
      if (!file && q.required) {
        return { ok: false, message: `La pregunta ${q.id} requiere foto.` };
      }
    } else {
      const value = String(nodeList[0]?.value || "").trim();
      if (!value && q.required) {
        return { ok: false, message: `La pregunta ${q.id} es obligatoria.` };
      }
      response = value;
    }

    answers.push({
      idPregunta: q.id,
      respuesta: response,
      puntaje: score,
      comentario: q.note || "",
      attachment
    });
  }

  return { ok: true, answers };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function surveyToRows(survey) {
  return survey.answers.map((answer, index) => ({
    ts: survey.createdAt,
    usuario: survey.createdBy,
    nombre: survey.nombre,
    rol: survey.rol,
    tipo_informante: survey.tipoInformante,
    departamento: survey.departamento,
    distrito: survey.distrito,
    comunidad: survey.comunidad,
    id_encuesta: survey.id,
    id_pregunta: answer.idPregunta,
    respuesta: answer.respuesta || "",
    puntaje: Number(answer.puntaje || 0),
    comentario:
      (answer.comentario || "") +
      (index === 0 && survey.comentarioGeneral ? ` | ${survey.comentarioGeneral}` : "") +
      (answer.attachment ? " | [foto_local]" : ""),
    gps_lat: survey.gps?.lat ?? "",
    gps_lng: survey.gps?.lng ?? "",
    gps_accuracy: survey.gps?.accuracy ?? ""
  }));
}

async function renderPending() {
  const surveys = await dbGetAll(STORE_SURVEYS);
  const pending = surveys
    .filter((s) => !s.synced)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  dom.draftCount.textContent = `Pendientes: ${pending.length}`;
  dom.pendingMeta.textContent = `${pending.length} sondeos pendientes`;
  dom.pendingList.innerHTML = "";

  if (pending.length === 0) {
    dom.pendingList.innerHTML = `<p class="muted">No hay sondeos pendientes en este dispositivo.</p>`;
    return;
  }

  for (const survey of pending) {
    const fragment = dom.pendingItemTpl.content.cloneNode(true);
    const title = fragment.querySelector("h4");
    const text = fragment.querySelector("p");
    title.textContent = `${survey.id} · ${survey.comunidad}`;
    text.textContent = `${formatDate(survey.createdAt)} · ${survey.answers.length} respuestas`;
    dom.pendingList.appendChild(fragment);
  }
}

async function exportCsv() {
  setMessage(dom.pendingMsg, "", false);
  const surveys = (await dbGetAll(STORE_SURVEYS)).filter((s) => !s.synced);
  const rows = surveys.flatMap(surveyToRows);
  if (rows.length === 0) {
    setMessage(dom.pendingMsg, "No hay datos pendientes para exportar.", true);
    return;
  }

  const csv = [
    APP_HEADERS.join(","),
    ...rows.map((row) => APP_HEADERS.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");

  downloadBlob(csv, `semaforo_respuestas_${timestampFileSafe()}.csv`, "text/csv;charset=utf-8");
  setMessage(dom.pendingMsg, "CSV exportado.", false);
}

async function exportJson() {
  setMessage(dom.pendingMsg, "", false);
  const payload = {
    exportedAt: new Date().toISOString(),
    app: SEED_DATA.appTitle,
    users: state.currentUser?.role === "admin" ? await dbGetAll(STORE_USERS) : [],
    surveys: await dbGetAll(STORE_SURVEYS)
  };
  downloadBlob(JSON.stringify(payload, null, 2), `semaforo_backup_${timestampFileSafe()}.json`, "application/json");
  setMessage(dom.pendingMsg, "Respaldo JSON exportado.", false);
}

async function importJson(file) {
  setMessage(dom.pendingMsg, "", false);
  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (Array.isArray(payload.surveys)) {
      for (const survey of payload.surveys) {
        if (!survey?.id || !Array.isArray(survey.answers)) continue;
        await dbPut(STORE_SURVEYS, survey);
      }
    }

    if (state.currentUser?.role === "admin" && Array.isArray(payload.users)) {
      for (const user of payload.users) {
        if (!user?.username || !user?.passwordHash) continue;
        await dbPut(STORE_USERS, user);
      }
      await renderUsers();
    }

    await renderPending();
    setMessage(dom.pendingMsg, "Respaldo importado correctamente.", false);
  } catch {
    setMessage(dom.pendingMsg, "No se pudo importar el archivo JSON.", true);
  }
}

async function markAllSynced() {
  setMessage(dom.pendingMsg, "", false);
  const surveys = await dbGetAll(STORE_SURVEYS);
  const pending = surveys.filter((s) => !s.synced);
  if (pending.length === 0) {
    setMessage(dom.pendingMsg, "No hay sondeos pendientes.", true);
    return;
  }
  if (!window.confirm(`Marcar ${pending.length} sondeos como sincronizados?`)) return;

  for (const survey of pending) {
    await dbPut(STORE_SURVEYS, { ...survey, synced: true, syncedAt: new Date().toISOString() });
  }
  setMessage(dom.pendingMsg, "Sondeos marcados como sincronizados.", false);
  await renderPending();
}

function requireAdmin() {
  if (state.currentUser?.role === "admin") return true;
  setMessage(dom.usersMsg, "Solo un usuario administrador puede realizar esta acción.", true);
  return false;
}

async function renderUsers() {
  if (!requireAdmin()) return;
  setMessage(dom.usersMsg, "", false);
  const users = (await dbGetAll(STORE_USERS)).sort((a, b) => a.username.localeCompare(b.username));

  dom.usersTableBody.innerHTML = users
    .map(
      (user) => `
      <tr>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.name || "")}</td>
        <td>${escapeHtml(user.role || "")}</td>
        <td>${user.active ? "Sí" : "No"}</td>
        <td>${escapeHtml(user.tipoInformanteDefault || "")}</td>
        <td>
          <div class="inline-actions">
            <button type="button" class="btn btn-secondary" data-action="edit" data-username="${escapeHtml(user.username)}">Editar</button>
            <button type="button" class="btn btn-secondary" data-action="toggle" data-username="${escapeHtml(user.username)}">${user.active ? "Desactivar" : "Activar"}</button>
            <button type="button" class="btn btn-danger" data-action="delete" data-username="${escapeHtml(user.username)}">Eliminar</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function clearUserForm() {
  dom.userForm.reset();
  state.editingUser = null;
  dom.userFormOriginal.value = "";
  dom.userUsername.disabled = false;
  dom.userActivo.checked = true;
  setMessage(dom.usersMsg, "", false);
}

async function saveUser() {
  if (!requireAdmin()) return;

  const username = dom.userUsername.value.trim();
  const name = dom.userNombre.value.trim();
  const role = dom.userRol.value;
  const password = dom.userPassword.value;
  const tipoInformanteDefault = dom.userTipoInformante.value.trim();
  const active = dom.userActivo.checked;
  const now = new Date().toISOString();

  if (!username || !name || !role) {
    setMessage(dom.usersMsg, "Completá usuario, nombre y rol.", true);
    return;
  }

  const original = dom.userFormOriginal.value || null;
  const creating = !original;
  const existing = await dbGet(STORE_USERS, username);

  if (creating && existing) {
    setMessage(dom.usersMsg, "El usuario ya existe.", true);
    return;
  }

  if (creating && !password) {
    setMessage(dom.usersMsg, "La contraseña es obligatoria para nuevos usuarios.", true);
    return;
  }

  let passwordHash = creating ? "" : String(state.editingUser?.passwordHash || "");
  if (password) {
    passwordHash = await sha256(password);
  }

  if (!passwordHash) {
    setMessage(dom.usersMsg, "Debe existir un hash de contraseña válido.", true);
    return;
  }

  const nextUser = {
    username,
    name,
    role,
    active,
    tipoInformanteDefault,
    permisoTablero: role === "admin" || role === "editor",
    passwordHash,
    createdAt: state.editingUser?.createdAt || now,
    updatedAt: now
  };

  await dbPut(STORE_USERS, nextUser);
  setMessage(dom.usersMsg, "Usuario guardado.", false);
  clearUserForm();
  await renderUsers();
}

async function handleUserAction(action, username) {
  if (!requireAdmin()) return;
  const user = await dbGet(STORE_USERS, username);
  if (!user) return;

  if (action === "edit") {
    state.editingUser = user;
    dom.userFormOriginal.value = user.username;
    dom.userUsername.value = user.username;
    dom.userUsername.disabled = true;
    dom.userNombre.value = user.name || "";
    dom.userRol.value = user.role || "usuario";
    dom.userTipoInformante.value = user.tipoInformanteDefault || "";
    dom.userActivo.checked = Boolean(user.active);
    dom.userPassword.value = "";
    setMessage(dom.usersMsg, "Edición de usuario cargada.", false);
    return;
  }

  if (action === "toggle") {
    if (username === state.currentUser.username && user.active) {
      setMessage(dom.usersMsg, "No podés desactivar tu propio usuario en sesión.", true);
      return;
    }
    const toggled = { ...user, active: !user.active, updatedAt: new Date().toISOString() };
    await dbPut(STORE_USERS, toggled);
    await renderUsers();
    setMessage(dom.usersMsg, "Estado de usuario actualizado.", false);
    return;
  }

  if (action === "delete") {
    if (username === state.currentUser.username) {
      setMessage(dom.usersMsg, "No podés eliminar tu propio usuario en sesión.", true);
      return;
    }
    if (!window.confirm(`Eliminar al usuario ${username}?`)) return;
    await dbDelete(STORE_USERS, username);
    await renderUsers();
    setMessage(dom.usersMsg, "Usuario eliminado.", false);
  }
}

async function wipeLocalData() {
  setMessage(dom.settingsMsg, "", false);
  if (!window.confirm("Se borrarán los sondeos locales de este dispositivo. ¿Continuar?")) return;
  await dbClear(STORE_SURVEYS);
  await renderPending();
  setMessage(dom.settingsMsg, "Datos locales de sondeos eliminados.", false);
}

function setMessage(node, text, isError) {
  node.textContent = text;
  node.classList.toggle("error", Boolean(isError));
}

function formatDate(isoText) {
  try {
    return new Date(isoText).toLocaleString("es-PY");
  } catch {
    return isoText;
  }
}

function timestampFileSafe() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function csvEscape(value) {
  const raw = String(value ?? "");
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
