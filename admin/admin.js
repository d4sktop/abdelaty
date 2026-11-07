/* Learnly admin — edits data/teachers.json and data/courses.json in the GitHub repo.
   No server: the browser talks to the GitHub REST API with the admin's own token.
   All edits are kept as a draft and published as ONE commit (Git Data API). */
(function () {
  "use strict";

  const CFG = Object.assign({ owner: "", repo: "", branch: "main", siteUrl: "../", apiBase: "https://api.github.com" }, window.LEARNLY_ADMIN || {});
  const LANGS = [
    { code: "en", label: "EN", name: "English", html: "en", dir: "ltr" },
    { code: "ru", label: "RU", name: "Русский", html: "ru", dir: "ltr" },
    { code: "tj", label: "TJ", name: "Тоҷикӣ", html: "tg", dir: "ltr" },
    { code: "ar", label: "AR", name: "العربية", html: "ar", dir: "rtl" }
  ];
  const FILES = { teachers: "data/teachers.json", courses: "data/courses.json" };
  const PHOTO_DIR = "img/teachers/";
  const AUTH_KEY = "learnly.admin.auth";

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  };
  const icon = (id) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "ico"); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#i-" + id); s.appendChild(u);
    return s;
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const pick = (obj) => (obj && (obj.ru || obj.en || obj.tj || obj.ar)) || "";

  /* ---------- storage ---------- */
  const store = {
    get() {
      for (const s of [sessionStorage, localStorage]) {
        try { const v = s.getItem(AUTH_KEY); if (v) return JSON.parse(v); } catch (e) { /* ignore */ }
      }
      return null;
    },
    set(v, remember) {
      try { (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
    clear() {
      try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
      try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
    }
  };

  /* ==========================================================
     GitHub API
     ========================================================== */
  const auth = { owner: "", repo: "", branch: "", token: "" };

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function gh(method, path, body) {
    let res;
    try {
      res = await fetch(CFG.apiBase + path, {
        method,
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": "Bearer " + auth.token,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
    } catch (e) {
      throw new ApiError(0, "Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.");
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) throw new ApiError(res.status, (data && data.message) || res.statusText);
    return data;
  }
  const repoPath = (p) => "/repos/" + encodeURIComponent(auth.owner) + "/" + encodeURIComponent(auth.repo) + p;

  function explain(err, context) {
    const s = err && err.status;
    if (s === 0) return err.message;
    if (s === 401) return "GitHub не принял токен: он неверный, удалён или истёк. Создайте новый по инструкции.";
    if (s === 403) return "У токена нет права на запись. В настройках токена нужно: Contents → Read and write.";
    if (s === 404) return context === "repo"
      ? "Репозиторий не найден. Проверьте владельца и название, и что токену выдан доступ к этому репозиторию."
      : "Файл или ветка не найдены. Проверьте название ветки.";
    if (s === 409 || s === 422) return "Данные на GitHub изменились, пока вы редактировали (например, с другого устройства). Обновите страницу и внесите правки заново.";
    return "Ошибка GitHub (" + s + "): " + (err && err.message);
  }

  // UTF-8 safe base64 decode
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function readJson(path, ref) {
    const f = await gh("GET", repoPath("/contents/" + path + "?ref=" + encodeURIComponent(ref)));
    return { sha: f.sha, json: JSON.parse(b64decode(f.content)) };
  }

  /* ==========================================================
     State
     ========================================================== */
  const state = {
    remote: { teachers: null, courses: null }, // { sha, json }
    original: null,   // { teachers:[], courses:[], exams:[] } as loaded
    draft: null,      // same shape, edited
    uploads: new Map(), // path -> { base64, url }
    previews: new Map(), // path -> object URL (kept after publish until Pages rebuilds)
    tab: "teachers",
    busy: false
  };

  function snapshot(d) { return JSON.stringify(d); }
  function isDirty() {
    return snapshot(state.draft) !== snapshot(state.original);
  }
  function changedSections() {
    const out = [];
    if (snapshot(state.draft.teachers) !== snapshot(state.original.teachers)) out.push("преподаватели");
    if (snapshot(state.draft.courses) !== snapshot(state.original.courses)) out.push("курсы");
    if (snapshot(state.draft.exams) !== snapshot(state.original.exams)) out.push("экзамены");
    return out;
  }

  /* ==========================================================
     Login
     ========================================================== */
  function showLogin(message) {
    $("appView").hidden = true;
    $("loginView").hidden = false;
    const fixedRepo = !!(CFG.owner && CFG.repo);
    $("repoFields").hidden = fixedRepo;
    $("repoSummary").hidden = !fixedRepo;
    if (fixedRepo) $("repoSummary").textContent = "Репозиторий: " + CFG.owner + "/" + CFG.repo + " (ветка " + (CFG.branch || "main") + ")";
    $("lOwner").value = auth.owner || CFG.owner || "";
    $("lRepo").value = auth.repo || CFG.repo || "";
    $("lBranch").value = auth.branch || CFG.branch || "main";
    $("loginError").textContent = message || "";
    setTimeout(() => (fixedRepo || $("lOwner").value ? $("lToken") : $("lOwner")).focus(), 0);
  }

  async function login(creds, remember) {
    Object.assign(auth, creds);
    // 1) repo + access
    let repo;
    try { repo = await gh("GET", repoPath("")); }
    catch (e) { throw new Error(explain(e, "repo")); }
    if (repo.permissions && repo.permissions.push === false) {
      throw new Error("У этого аккаунта GitHub нет права записи в репозиторий. Попросите владельца добавить вас как участника (Collaborator).");
    }
    // 2) branch
    try { await gh("GET", repoPath("/git/ref/heads/" + encodeURIComponent(auth.branch))); }
    catch (e) { throw new Error(e.status === 404 ? "Ветка «" + auth.branch + "» не найдена в репозитории." : explain(e)); }
    // 3) data
    await loadData();
    if (remember !== undefined) store.set(creds, remember);
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("repoName").textContent = auth.owner + "/" + auth.repo;
    $("siteLink").href = CFG.siteUrl || "../";
    renderAll();
  }

  async function loadData() {
    try {
      const [t, c] = await Promise.all([readJson(FILES.teachers, auth.branch), readJson(FILES.courses, auth.branch)]);
      state.remote.teachers = t; state.remote.courses = c;
      state.original = {
        teachers: Array.isArray(t.json.teachers) ? t.json.teachers : [],
        courses: Array.isArray(c.json.courses) ? c.json.courses : [],
        exams: Array.isArray(c.json.exams) ? c.json.exams : []
      };
      state.draft = clone(state.original);
      state.uploads.clear();
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Файл с данными на GitHub повреждён (неверный JSON). Восстановите его из истории коммитов.");
      throw new Error(e.status === 404 ? "В репозитории нет файлов data/teachers.json и data/courses.json. Загрузите новую версию сайта." : explain(e));
    }
  }

  function initLogin() {
    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const creds = {
        owner: (CFG.owner || $("lOwner").value).trim(),
        repo: (CFG.owner && CFG.repo ? CFG.repo : $("lRepo").value).trim(),
        branch: ((CFG.owner && CFG.repo ? CFG.branch : $("lBranch").value) || "main").trim(),
        token: $("lToken").value.trim()
      };
      const err = $("loginError");
      if (!creds.owner || !creds.repo) { err.textContent = "Укажите владельца и название репозитория."; return; }
      if (!creds.token) { err.textContent = "Вставьте токен доступа."; $("lToken").focus(); return; }
      const btn = $("loginBtn");
      btn.disabled = true; btn.textContent = "Проверяем…"; err.textContent = "";
      try {
        await login(creds, $("lRemember").checked);
        $("lToken").value = "";
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false; btn.textContent = "Войти";
      }
    });

    $("logoutBtn").addEventListener("click", async () => {
      if (isDirty() && !(await confirmDlg("Выйти без публикации?", "Неопубликованные изменения будут потеряны.", "Выйти"))) return;
      store.clear();
      auth.token = "";
      state.draft = state.original = null;
      showLogin();
    });
  }

  /* ==========================================================
     Schemas: what each section's editor shows
     ========================================================== */
  const SCHEMAS = {
    teachers: {
      one: "преподавателя", title: "Преподаватель", add: "Добавить преподавателя",
      hint: "Карточки в разделе «Преподаватели» на сайте. Порядок здесь = порядок на сайте.",
      empty: "Преподавателей пока нет. Раздел на сайте скрыт, пока список пуст.",
      i18n: [
        { key: "name", label: "Имя", required: true, ph: "Например: Мерна" },
        { key: "role", label: "Должность", ph: "Например: Преподаватель английского" },
        { key: "experience", label: "Опыт", ph: "Например: 5 лет опыта" },
        { key: "languages", label: "Языки", ph: "Например: Английский, русский" },
        { key: "bio", label: "О себе", textarea: true, rows: 5 }
      ],
      shared: ["photo", "telegram", "whatsapp", "email", "hidden"],
      blank: () => ({ id: "", name: {}, role: {}, experience: {}, languages: {}, bio: {}, photo: "", telegram: "", whatsapp: "", email: "" })
    },
    courses: {
      one: "курс", title: "Курс", add: "Добавить курс",
      hint: "Блок «Чему я учу» на сайте.",
      empty: "Курсов пока нет.",
      i18n: [
        { key: "title", label: "Название", required: true },
        { key: "text", label: "Описание", textarea: true, rows: 3 }
      ],
      shared: ["icon", "tags", "examGuide", "hidden"],
      blank: () => ({ id: "", icon: "chat", title: {}, text: {}, tags: [], examGuide: false })
    },
    exams: {
      one: "экзамен", title: "Экзамен", add: "Добавить экзамен",
      hint: "Список в окне «Какой экзамен мне нужен?». Окно открывается из курса, у которого включена эта кнопка.",
      empty: "Экзаменов пока нет. Кнопка «Какой экзамен мне нужен?» на сайте скрыта.",
      sharedFirst: ["examName"],
      i18n: [
        { key: "type", label: "Для кого / тип", ph: "Например: Academic & General Training" },
        { key: "desc", label: "Описание", textarea: true, rows: 3 }
      ],
      shared: ["hidden"],
      blank: () => ({ id: "", name: "", type: {}, desc: {} })
    }
  };

  /* ==========================================================
     List view
     ========================================================== */
  function photoSrc(path) {
    if (!path) return null;
    if (state.uploads.has(path)) return state.uploads.get(path).url;
    if (state.previews.has(path)) return state.previews.get(path);
    return "../" + path;
  }

  function avatar(item) {
    const name = pick(item.name) || "?";
    const initials = name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
    const wrap = el("span", { class: "avatar", "aria-hidden": "true" }, initials);
    const src = photoSrc(item.photo);
    if (src) {
      const img = el("img", { src, alt: "", loading: "lazy" });
      img.addEventListener("error", () => img.remove()); // photo not on the site yet → initials
      wrap.appendChild(img);
    }
    return wrap;
  }

  function renderList() {
    const tab = state.tab;
    const sc = SCHEMAS[tab];
    const items = state.draft[tab];
    $("listHint").textContent = sc.hint;
    $("addLabel").textContent = sc.add;
    const list = $("itemList");
    list.replaceChildren();
    $("emptyState").hidden = items.length > 0;
    $("emptyState").textContent = sc.empty;

    items.forEach((item, i) => {
      let lead, title, sub;
      if (tab === "teachers") {
        lead = avatar(item); title = pick(item.name); sub = pick(item.role);
      } else if (tab === "courses") {
        lead = el("span", { class: "course-ico" }, icon(["chat", "case", "cap"].includes(item.icon) ? item.icon : "chat"));
        title = pick(item.title); sub = pick(item.text);
      } else {
        lead = el("span", { class: "exam-badge" }, (item.name || "?").slice(0, 5));
        title = item.name; sub = pick(item.type);
      }
      const missing = LANGS.filter((l) => !langFilled(tab, item, l.code)).map((l) => l.label);
      const row = el("li", { class: "item" + (item.hidden ? " is-hidden" : "") },
        lead,
        el("div", { class: "item-main" },
          el("p", { class: "item-title" }, title || "Без названия",
            item.hidden ? el("span", { class: "badge" }, icon("eye-off"), "Скрыт") : null),
          sub ? el("p", { class: "item-sub" }, sub) : null,
          missing.length ? el("p", { class: "item-warn" }, "Нет перевода: " + missing.join(", ")) : null
        ),
        el("div", { class: "item-actions" },
          el("button", { type: "button", class: "icon-btn", "aria-label": "Выше", title: "Выше", disabled: i === 0, onclick: () => move(i, -1) }, icon("up")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Ниже", title: "Ниже", disabled: i === items.length - 1, onclick: () => move(i, 1) }, icon("down")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Изменить", title: "Изменить", onclick: () => openEditor(i) }, icon("edit")),
          el("button", { type: "button", class: "icon-btn icon-btn--danger", "aria-label": "Удалить", title: "Удалить", onclick: () => remove(i) }, icon("trash"))
        )
      );
      row.querySelector(".item-main").addEventListener("click", () => openEditor(i));
      list.appendChild(row);
    });
  }

  function langFilled(tab, item, code) {
    const req = SCHEMAS[tab].i18n.filter((f) => f.required).map((f) => f.key);
    const keys = req.length ? req : [SCHEMAS[tab].i18n[0].key];
    return keys.every((k) => item[k] && String(item[k][code] || "").trim());
  }

  function renderCounts() {
    $("countTeachers").textContent = state.draft.teachers.length;
    $("countCourses").textContent = state.draft.courses.length;
    $("countExams").textContent = state.draft.exams.length;
  }

  function renderPublishBar() {
    const dirty = isDirty();
    $("publishBar").hidden = !dirty;
    document.body.classList.toggle("has-bar", dirty);
    if (dirty) $("publishText").textContent = "Не опубликовано: " + changedSections().join(", ") + ". На сайте пока старая версия.";
  }

  function renderAll() {
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    renderCounts();
    renderList();
    renderPublishBar();
  }

  function move(i, d) {
    const arr = state.draft[state.tab];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderAll();
    const btn = $("itemList").children[j]?.querySelectorAll(".icon-btn")[d < 0 ? 0 : 1];
    if (btn && !btn.disabled) btn.focus();
  }

  async function remove(i) {
    const arr = state.draft[state.tab];
    const item = arr[i];
    const name = state.tab === "exams" ? item.name : pick(item.name || item.title);
    const ok = await confirmDlg("Удалить " + SCHEMAS[state.tab].one + "?", "«" + (name || "Без названия") + "» исчезнет с сайта после публикации. До публикации можно нажать «Отменить изменения».", "Удалить");
    if (!ok) return;
    arr.splice(i, 1);
    renderAll();
    toast("Удалено. Нажмите «Опубликовать», чтобы применить на сайте.");
  }

  /* ==========================================================
     Editor
     ========================================================== */
  let editing = null; // { tab, index (-1 = new), item, photo: {path, base64, url} | null }

  function field(label, input, hint, id) {
    return el("div", { class: "field" },
      el("label", { for: id }, label),
      input,
      hint ? el("p", { class: "hint" }, hint) : null);
  }

  function sharedField(name, item) {
    switch (name) {
      case "examName":
        return field("Название экзамена", el("input", { id: "f-name", value: item.name || "", required: true, maxlength: 20, placeholder: "Например: IELTS" }), null, "f-name");
      case "photo": {
        const prev = el("div", { class: "photo-preview", id: "photoPreview" });
        const fileIn = el("input", { type: "file", id: "f-photo", accept: "image/jpeg,image/png,image/webp", class: "sr-only" });
        const box = el("div", { class: "field" },
          el("span", { class: "label" }, "Фото"),
          el("div", { class: "photo-row" },
            prev,
            el("div", { class: "photo-actions" },
              el("label", { for: "f-photo", class: "btn btn-line btn-sm" }, "Загрузить фото"),
              el("button", { type: "button", class: "btn btn-line btn-sm", id: "photoRemove" }, "Убрать фото"),
              el("p", { class: "hint" }, "JPG или PNG. Фото обрежется до квадрата по центру и уменьшится до 640×640.")
            )),
          fileIn);
        fileIn.addEventListener("change", () => onPhoto(fileIn));
        box.querySelector("#photoRemove").addEventListener("click", () => { editing.photo = { path: "", url: null }; renderPhoto(); });
        return box;
      }
      case "telegram":
        return field("Telegram", el("input", { id: "f-telegram", value: item.telegram || "", spellcheck: "false", placeholder: "@username, ссылка t.me/… или номер +992…" }), null, "f-telegram");
      case "whatsapp":
        return field("WhatsApp — номер", el("input", { id: "f-whatsapp", value: item.whatsapp ? "+" + item.whatsapp : "", inputmode: "tel", placeholder: "+992 92 000 0000" }), "С кодом страны.", "f-whatsapp");
      case "email":
        return field("Email", el("input", { id: "f-email", type: "email", value: item.email || "", spellcheck: "false", placeholder: "name@example.com" }), null, "f-email");
      case "icon": {
        const opts = [["chat", "Разговор"], ["case", "Портфель (бизнес)"], ["cap", "Шапочка (экзамены)"]];
        const group = el("div", { class: "icon-choice", role: "radiogroup", "aria-label": "Иконка" },
          opts.map(([v, l]) => el("label", { class: "icon-opt" },
            el("input", { type: "radio", name: "f-icon", value: v, checked: (item.icon || "chat") === v }),
            icon(v), el("span", null, l))));
        return el("div", { class: "field" }, el("span", { class: "label" }, "Иконка"), group);
      }
      case "tags":
        return field("Метки", el("input", { id: "f-tags", value: (item.tags || []).join(", "), placeholder: "IELTS, TOEFL, SAT" }), "Через запятую. Показываются под описанием. Можно оставить пустым.", "f-tags");
      case "examGuide":
        return el("label", { class: "check" }, el("input", { type: "checkbox", id: "f-examGuide", checked: !!item.examGuide }),
          el("span", null, "Показывать кнопку «Какой экзамен мне нужен?»"));
      case "hidden":
        return el("label", { class: "check" }, el("input", { type: "checkbox", id: "f-hidden", checked: !!item.hidden }),
          el("span", null, "Скрыть на сайте (останется здесь, можно вернуть)"));
    }
    return null;
  }

  function renderPhoto() {
    const prev = $("photoPreview");
    if (!prev) return;
    prev.replaceChildren();
    const p = editing.photo;
    const src = p ? p.url : photoSrc(editing.item.photo);
    if (src) {
      const img = el("img", { src, alt: "Предпросмотр фото" });
      img.addEventListener("error", () => { prev.replaceChildren(el("span", null, "Фото появится на сайте после публикации")); });
      prev.appendChild(img);
    } else prev.appendChild(el("span", null, "Нет фото"));
    $("photoRemove").hidden = !src;
  }

  async function onPhoto(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const err = $("editorError");
    err.textContent = "";
    if (file.size > 20 * 1024 * 1024) { err.textContent = "Файл больше 20 МБ. Выберите фото поменьше."; return; }
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height);
      const size = Math.min(640, side);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      // centre crop; for portraits keep a bit more of the top (faces)
      const sx = (bmp.width - side) / 2;
      const sy = bmp.height > bmp.width ? (bmp.height - side) * 0.3 : (bmp.height - side) / 2;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
      bmp.close && bmp.close();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      // the data: URL doubles as the preview (no fetch — the page's CSP only allows the GitHub API)
      editing.photo = { path: null, base64: dataUrl.split(",")[1], url: dataUrl };
      renderPhoto();
    } catch (e) {
      err.textContent = "Не удалось прочитать фото. Сохраните его как JPG или PNG и попробуйте снова.";
    }
  }

  function openEditor(index) {
    const tab = state.tab;
    const sc = SCHEMAS[tab];
    const item = index >= 0 ? clone(state.draft[tab][index]) : sc.blank();
    editing = { tab, index, item, photo: null };

    $("editorTitle").textContent = (index >= 0 ? "Изменить: " : "Новый: ") + sc.title.toLowerCase();
    $("editorError").textContent = "";
    const body = $("editorBody");
    body.replaceChildren();

    (sc.sharedFirst || []).forEach((n) => body.appendChild(sharedField(n, item)));

    // language tabs
    const startLang = "ru";
    const tabs = el("div", { class: "lang-tabs", role: "tablist", "aria-label": "Язык текста" });
    const panels = el("div", { class: "lang-panels" });
    LANGS.forEach((L) => {
      const btn = el("button", { type: "button", role: "tab", class: "lang-tab", id: "lt-" + L.code, "aria-controls": "lp-" + L.code, "aria-selected": String(L.code === startLang), "data-lang": L.code },
        L.label, el("span", { class: "dot", "aria-hidden": "true" }));
      btn.addEventListener("click", () => selectLang(L.code));
      tabs.appendChild(btn);
      const panel = el("div", { class: "lang-panel", role: "tabpanel", id: "lp-" + L.code, "aria-labelledby": "lt-" + L.code, hidden: L.code !== startLang, lang: L.html, dir: L.dir });
      sc.i18n.forEach((f) => {
        const id = "f-" + f.key + "-" + L.code;
        const val = (item[f.key] && item[f.key][L.code]) || "";
        const input = f.textarea
          ? el("textarea", { id, rows: f.rows || 4, "data-key": f.key, "data-lang": L.code, placeholder: L.code === "ru" ? f.ph || "" : "" })
          : el("input", { id, "data-key": f.key, "data-lang": L.code, placeholder: L.code === "ru" ? f.ph || "" : "" });
        input.value = val;
        input.addEventListener("input", updateLangDots);
        panel.appendChild(field(f.label + (f.required ? " *" : "") + " · " + L.name, input, null, id));
      });
      panels.appendChild(panel);
    });
    body.append(
      el("div", { class: "lang-block" },
        el("div", { class: "lang-head" },
          el("span", { class: "label" }, "Текст на сайте"),
          el("p", { class: "hint" }, "Заполните все 4 языка. Если поле пустое, на сайте покажется английский (или русский) вариант.")),
        tabs, panels)
    );

    sc.shared.forEach((n) => { const f = sharedField(n, item); if (f) body.appendChild(f); });
    updateLangDots();
    renderPhoto();

    const dlg = $("editor");
    dlg.showModal();
    dlg.querySelector(".editor-body").scrollTop = 0;
    const first = body.querySelector("input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea");
    if (first && matchMedia("(pointer: fine)").matches) first.focus();
  }

  function selectLang(code) {
    document.querySelectorAll(".lang-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === code)));
    document.querySelectorAll(".lang-panel").forEach((p) => { p.hidden = p.id !== "lp-" + code; });
  }

  function updateLangDots() {
    if (!editing) return;
    const sc = SCHEMAS[editing.tab];
    LANGS.forEach((L) => {
      const inputs = [...document.querySelectorAll('.lang-panel [data-lang="' + L.code + '"]')];
      const filled = inputs.filter((i) => i.value.trim()).length;
      const tab = $("lt-" + L.code);
      if (!tab) return;
      tab.classList.toggle("is-full", filled === sc.i18n.length);
      tab.classList.toggle("is-partial", filled > 0 && filled < sc.i18n.length);
    });
  }

  /* ---------- normalising typed values ---------- */
  function normTelegram(v) {
    v = v.trim();
    if (!v) return "";
    v = v.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t\.me|telegram\.me)\//i, "");
    v = v.replace(/^@/, "").replace(/\s+/g, "");
    if (/^\+?\d{7,15}$/.test(v)) return "https://t.me/+" + v.replace(/^\+/, "");
    if (/^\+[\w-]{6,}$/.test(v)) return "https://t.me/" + v; // invite link
    if (/^[A-Za-z][\w]{3,31}$/.test(v)) return "https://t.me/" + v;
    return null;
  }
  const normPhone = (v) => {
    const d = v.replace(/\D/g, "");
    if (!d) return "";
    return /^\d{7,15}$/.test(d) ? d : null;
  };
  const normEmail = (v) => {
    v = v.trim();
    if (!v) return "";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  };
  const slug = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);

  function uniqueId(base, tab, selfIndex) {
    const used = new Set(state.draft[tab].filter((_, i) => i !== selfIndex).map((x) => x.id));
    let id = base || (tab.slice(0, -1) + "-" + Date.now().toString(36));
    let n = 2;
    while (used.has(id)) id = base + "-" + n++;
    return id;
  }

  function saveEditor() {
    const { tab, index, item } = editing;
    const sc = SCHEMAS[tab];
    const err = $("editorError");
    err.textContent = "";
    const fail = (msg, focusEl, lang) => {
      err.textContent = msg;
      if (lang) selectLang(lang);
      if (focusEl) focusEl.focus();
      return false;
    };

    // translated fields
    sc.i18n.forEach((f) => {
      item[f.key] = {};
      LANGS.forEach((L) => { item[f.key][L.code] = ($("f-" + f.key + "-" + L.code).value || "").trim(); });
    });
    for (const f of sc.i18n.filter((x) => x.required)) {
      if (!LANGS.some((L) => item[f.key][L.code])) {
        return fail("Заполните поле «" + f.label + "» хотя бы на одном языке.", $("f-" + f.key + "-ru"), "ru");
      }
    }

    // shared fields
    if (sc.sharedFirst && sc.sharedFirst.includes("examName")) {
      const n = $("f-name").value.trim();
      if (!n) return fail("Укажите название экзамена.", $("f-name"));
      item.name = n;
    }
    if (sc.shared.includes("telegram")) {
      const tg = normTelegram($("f-telegram").value);
      if (tg === null) return fail("Telegram: укажите @username, ссылку t.me/… или номер с кодом страны.", $("f-telegram"));
      item.telegram = tg;
    }
    if (sc.shared.includes("whatsapp")) {
      const wa = normPhone($("f-whatsapp").value);
      if (wa === null) return fail("WhatsApp: номер должен содержать 7–15 цифр с кодом страны.", $("f-whatsapp"));
      item.whatsapp = wa;
    }
    if (sc.shared.includes("email")) {
      const em = normEmail($("f-email").value);
      if (em === null) return fail("Проверьте email — он должен быть вида name@example.com.", $("f-email"));
      item.email = em;
    }
    if (sc.shared.includes("icon")) {
      const r = document.querySelector('input[name="f-icon"]:checked');
      item.icon = r ? r.value : "chat";
    }
    if (sc.shared.includes("tags")) {
      item.tags = $("f-tags").value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
    }
    if (sc.shared.includes("examGuide")) item.examGuide = $("f-examGuide").checked;
    if (sc.shared.includes("hidden")) {
      if ($("f-hidden").checked) item.hidden = true; else delete item.hidden;
    }

    // id (stable once set)
    if (!item.id) {
      const base = slug(tab === "exams" ? item.name : (item.name || item.title || {}).en || "") ;
      item.id = uniqueId(base, tab, index);
    }

    // photo
    if (editing.photo) {
      if (editing.photo.base64) {
        const path = PHOTO_DIR + item.id + "-" + Date.now().toString(36) + ".jpg";
        state.uploads.set(path, { base64: editing.photo.base64, url: editing.photo.url });
        item.photo = path;
      } else {
        item.photo = "";
      }
    }

    if (index >= 0) state.draft[tab][index] = item; else state.draft[tab].push(item);
    // drop uploads no longer referenced by any draft item
    pruneUploads();
    closeEditor();
    renderAll();
    toast(index >= 0 ? "Изменения сохранены в черновик. Не забудьте опубликовать." : "Добавлено в черновик. Не забудьте опубликовать.");
    return true;
  }

  function pruneUploads() {
    const used = new Set(state.draft.teachers.map((t) => t.photo));
    for (const p of [...state.uploads.keys()]) if (!used.has(p)) state.uploads.delete(p);
  }

  function closeEditor() {
    editing = null;
    if ($("editor").open) $("editor").close();
  }

  function initEditor() {
    $("editorForm").addEventListener("submit", (e) => { e.preventDefault(); saveEditor(); });
    $("editorCancel").addEventListener("click", closeEditor);
    $("editorClose").addEventListener("click", closeEditor);
    $("editor").addEventListener("cancel", () => { editing = null; });
    $("addBtn").addEventListener("click", () => openEditor(-1));
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      renderAll();
    }));
    // arrow keys between tabs
    $("appView").querySelector(".tabs").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const tabs = [...document.querySelectorAll(".tab")];
      const i = tabs.findIndex((t) => t.dataset.tab === state.tab);
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.click(); next.focus();
    });
  }

  /* ==========================================================
     Publish: one atomic commit with JSON + new photos + removed photos
     ========================================================== */
  function buildFiles() {
    const files = [];
    const teachersJson = JSON.stringify({ teachers: state.draft.teachers }, null, 2) + "\n";
    const coursesJson = JSON.stringify({ courses: state.draft.courses, exams: state.draft.exams }, null, 2) + "\n";
    if (snapshot(state.draft.teachers) !== snapshot(state.original.teachers)) files.push({ path: FILES.teachers, content: teachersJson });
    if (snapshot(state.draft.courses) !== snapshot(state.original.courses) || snapshot(state.draft.exams) !== snapshot(state.original.exams)) {
      files.push({ path: FILES.courses, content: coursesJson });
    }
    return files;
  }

  async function publish() {
    if (state.busy || !isDirty()) return;
    state.busy = true;
    const btn = $("publishBtn");
    btn.disabled = true; $("discardBtn").disabled = true;
    const setStatus = (t) => { $("publishText").textContent = t; };
    try {
      setStatus("Проверяем, не изменились ли данные на GitHub…");
      const ref = await gh("GET", repoPath("/git/ref/heads/" + encodeURIComponent(auth.branch)));
      const headSha = ref.object.sha;
      const head = await gh("GET", repoPath("/git/commits/" + headSha));

      // someone else changed the data since we loaded it?
      for (const key of ["teachers", "courses"]) {
        const f = await gh("GET", repoPath("/contents/" + FILES[key] + "?ref=" + headSha));
        if (f.sha !== state.remote[key].sha) throw new ApiError(409, "conflict");
      }

      const tree = [];
      buildFiles().forEach((f) => tree.push({ path: f.path, mode: "100644", type: "blob", content: f.content }));

      // new photos
      pruneUploads();
      let n = 0;
      for (const [path, up] of state.uploads) {
        n++;
        setStatus("Загружаем фото " + n + " из " + state.uploads.size + "…");
        const blob = await gh("POST", repoPath("/git/blobs"), { content: up.base64, encoding: "base64" });
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      // photos of removed teachers / replaced photos (only inside img/teachers/)
      const stillUsed = new Set(state.draft.teachers.map((t) => t.photo));
      const removed = [...new Set(state.original.teachers.map((t) => t.photo))]
        .filter((p) => p && p.startsWith(PHOTO_DIR) && !stillUsed.has(p));
      removed.forEach((path) => tree.push({ path, mode: "100644", type: "blob", sha: null }));

      setStatus("Сохраняем…");
      const newTree = await gh("POST", repoPath("/git/trees"), { base_tree: head.tree.sha, tree });
      const message = "Админка: обновлены " + changedSections().join(", ");
      const commit = await gh("POST", repoPath("/git/commits"), { message, tree: newTree.sha, parents: [headSha] });
      await gh("PATCH", repoPath("/git/refs/heads/" + encodeURIComponent(auth.branch)), { sha: commit.sha, force: false });

      // keep local previews of new photos until GitHub Pages serves them
      for (const [path, up] of state.uploads) state.previews.set(path, up.url);
      await loadData();
      renderAll();
      toast("Опубликовано. Сайт обновится через 1–2 минуты.", 6000);
    } catch (e) {
      setStatus(explain(e));
      toast(explain(e), 8000, true);
    } finally {
      state.busy = false;
      btn.disabled = false; $("discardBtn").disabled = false;
    }
  }

  function initPublish() {
    $("publishBtn").addEventListener("click", publish);
    $("discardBtn").addEventListener("click", async () => {
      if (!(await confirmDlg("Отменить все изменения?", "Черновик вернётся к версии, которая сейчас на сайте.", "Отменить изменения"))) return;
      state.draft = clone(state.original);
      state.uploads.clear();
      renderAll();
    });
    window.addEventListener("beforeunload", (e) => {
      if (state.draft && isDirty()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ==========================================================
     Small UI helpers
     ========================================================== */
  function confirmDlg(title, text, yes) {
    return new Promise((resolve) => {
      const dlg = $("confirmDlg");
      $("confirmTitle").textContent = title;
      $("confirmText").textContent = text;
      $("confirmYes").textContent = yes || "Да";
      const done = (v) => { cleanup(); if (dlg.open) dlg.close(); resolve(v); };
      const onYes = () => done(true), onNo = () => done(false), onCancel = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        $("confirmYes").removeEventListener("click", onYes);
        $("confirmNo").removeEventListener("click", onNo);
        dlg.removeEventListener("cancel", onCancel);
      };
      $("confirmYes").addEventListener("click", onYes);
      $("confirmNo").addEventListener("click", onNo);
      dlg.addEventListener("cancel", onCancel);
      dlg.showModal();
      $("confirmNo").focus();
    });
  }

  let toastTimer = 0;
  function toast(text, ms, isError) {
    const t = $("toast");
    t.textContent = text;
    t.classList.toggle("is-error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 3500);
  }

  /* ==========================================================
     Boot
     ========================================================== */
  document.addEventListener("DOMContentLoaded", async () => {
    initLogin();
    initEditor();
    initPublish();
    const saved = store.get();
    if (saved && saved.token) {
      try {
        await login(saved);
        return;
      } catch (e) {
        Object.assign(auth, saved, { token: "" });
        showLogin(e.message);
        return;
      }
    }
    showLogin();
  });

  // for automated checks
  window.__admin = { state, normTelegram, normPhone };
})();
