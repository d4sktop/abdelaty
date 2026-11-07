/* Learnly admin — edits data/teachers.json and data/courses.json in the GitHub repo.
   No server: the browser talks to the GitHub REST API with the admin's own token.

   Sign-in: the GitHub token is entered once per device and stored ENCRYPTED in this
   browser (AES-GCM, key derived from username + password with PBKDF2, 600k rounds).
   After that the admin signs in with username + password; the decrypted token only
   lives in this tab's sessionStorage and is gone when the tab is closed.

   All edits are kept as a draft and published as ONE commit (Git Data API). */
(function () {
  "use strict";

  const CFG = Object.assign({ owner: "", repo: "", branch: "main", siteUrl: "../", apiBase: "https://api.github.com" }, window.LEARNLY_ADMIN || {});
  const LANGS = [
    { code: "en", label: "EN", name: "English", dir: "ltr" },
    { code: "ru", label: "RU", name: "Russian", dir: "ltr" },
    { code: "ar", label: "AR", name: "Arabic", dir: "rtl" }
  ];
  const LANG_CODES = LANGS.map((l) => l.code);
  const FILES = { teachers: "data/teachers.json", courses: "data/courses.json" };
  const PHOTO_DIR = "img/teachers/";

  const VAULT_KEY = "learnly.admin.vault";      // encrypted token (localStorage, per device)
  const SESSION_KEY = "learnly.admin.session";  // decrypted creds for this tab only (sessionStorage)
  const FAILS_KEY = "learnly.admin.fails";      // sign-in throttling
  const LEGACY_KEY = "learnly.admin.auth";      // v1 stored the token in plain text — migrated & removed
  const PBKDF2_ROUNDS = 600000;

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
  const pick = (obj) => (obj && (obj.en || obj.ru || obj.ar)) || "";

  const ls = {
    get(store, k) { try { const v = store.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(store, k, v) { try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(store, k) { try { store.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ==========================================================
     Vault: token encrypted with a key from username + password
     ========================================================== */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(user, pass, salt, rounds) {
    const material = await crypto.subtle.importKey("raw", enc.encode(user.trim().toLowerCase() + "\u0000" + pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function sealVault(user, pass, payload) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(user, pass, salt, PBKDF2_ROUNDS);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload)));
    return { v: 1, rounds: PBKDF2_ROUNDS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }
  async function openVault(user, pass, vault) {
    const key = await deriveKey(user, pass, fromB64(vault.salt), vault.rounds || PBKDF2_ROUNDS);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(vault.iv) }, key, fromB64(vault.ct));
    return JSON.parse(dec.decode(pt)); // throws on wrong username/password
  }

  // slow down guessing: after 5 wrong attempts, wait 30 s, doubling each time (max 15 min)
  function lockRemaining() {
    const f = ls.get(localStorage, FAILS_KEY);
    return f && f.until ? Math.max(0, f.until - Date.now()) : 0;
  }
  function registerFail() {
    const f = ls.get(localStorage, FAILS_KEY) || { n: 0 };
    f.n++;
    if (f.n >= 5) f.until = Date.now() + Math.min(30000 * Math.pow(2, f.n - 5), 15 * 60000);
    ls.set(localStorage, FAILS_KEY, f);
  }

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
      throw new ApiError(0, "Can't reach GitHub. Check your internet connection and try again.");
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
    if (s === 401) return "GitHub didn't accept the token: it's wrong, deleted or expired.";
    if (s === 403) return "The token can't write to the repository. It needs Contents → Read and write.";
    if (s === 404) return context === "repo"
      ? "Repository not found. Check the owner and name, and that the token has access to this repository."
      : "File or branch not found. Check the branch name.";
    if (s === 409 || s === 422) return "The data on GitHub changed while you were editing (for example, from another device). Reload the page and make your changes again.";
    return "GitHub error (" + s + "): " + (err && err.message);
  }

  const b64decode = (b64) => dec.decode(fromB64(b64.replace(/\s/g, "")));

  async function readJson(path, ref) {
    const f = await gh("GET", repoPath("/contents/" + path + "?ref=" + encodeURIComponent(ref)));
    return { sha: f.sha, json: JSON.parse(b64decode(f.content)) };
  }

  /* ==========================================================
     State
     ========================================================== */
  const state = {
    remote: { teachers: null, courses: null },
    original: null,
    draft: null,
    uploads: new Map(),  // path -> { base64, url }
    previews: new Map(), // path -> data URL (kept after publish until Pages rebuilds)
    tab: "teachers",
    busy: false
  };
  const snapshot = (d) => JSON.stringify(d);
  const isDirty = () => !!state.draft && snapshot(state.draft) !== snapshot(state.original);
  function changedSections() {
    const out = [];
    if (snapshot(state.draft.teachers) !== snapshot(state.original.teachers)) out.push("teachers");
    if (snapshot(state.draft.courses) !== snapshot(state.original.courses)) out.push("courses");
    if (snapshot(state.draft.exams) !== snapshot(state.original.exams)) out.push("exams");
    return out;
  }

  // keep only the languages the site supports (drops e.g. the old "tj" texts)
  function cleanLangs(items) {
    items.forEach((item) => {
      Object.keys(item).forEach((k) => {
        const v = item[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const out = {};
          LANG_CODES.forEach((c) => { out[c] = typeof v[c] === "string" ? v[c] : ""; });
          item[k] = out;
        }
      });
    });
    return items;
  }

  /* ==========================================================
     Views: setup / sign in / app
     ========================================================== */
  function show(view) {
    ["setupView", "signinView", "appView"].forEach((v) => { $(v).hidden = v !== view; });
  }

  let legacyCreds = null; // token found from the old plain-text storage

  function showSetup(message, opts) {
    opts = opts || {};
    show("setupView");
    const fixedRepo = !!(CFG.owner && CFG.repo);
    $("repoFields").hidden = fixedRepo;
    $("repoSummary").hidden = !fixedRepo;
    if (fixedRepo) $("repoSummary").textContent = "Repository: " + CFG.owner + "/" + CFG.repo + " (branch " + (CFG.branch || "main") + ")";
    $("uOwner").value = (legacyCreds && legacyCreds.owner) || CFG.owner || "";
    $("uRepo").value = (legacyCreds && legacyCreds.repo) || CFG.repo || "";
    $("uBranch").value = (legacyCreds && legacyCreds.branch) || CFG.branch || "main";
    // if we already have a token (old version), don't ask for it again
    const haveToken = !!(legacyCreds && legacyCreds.token);
    $("tokenStep").hidden = haveToken && fixedRepo;
    $("tokenField").hidden = haveToken;
    $("tokenHelp").hidden = haveToken;
    const notice = $("setupNotice");
    const text = message || (haveToken ? "Your GitHub token from the previous version was found. Just create a username and password." : "");
    notice.hidden = !text;
    notice.textContent = text;
    notice.classList.toggle("notice--warn", !!message);
    $("setupCancel").hidden = !opts.canCancel;
    $("setupError").textContent = "";
    if (opts.user) $("uUser").value = opts.user;
    setTimeout(() => {
      const first = [$("uOwner"), $("uToken"), $("uUser")].find((i) => i.offsetParent !== null && !i.value);
      (first || $("uUser")).focus();
    }, 0);
  }

  function showSignin(message) {
    show("signinView");
    $("signinError").textContent = message || "";
    $("sPass").value = "";
    setTimeout(() => ($("sUser").value ? $("sPass") : $("sUser")).focus(), 0);
  }

  // check the token against GitHub and load the data
  async function connect(creds) {
    Object.assign(auth, creds);
    let repo;
    try { repo = await gh("GET", repoPath("")); }
    catch (e) { const err = new Error(explain(e, "repo")); err.status = e.status; throw err; }
    if (repo.permissions && repo.permissions.push === false) {
      throw new Error("This GitHub account can't write to the repository. Ask the owner to add you as a collaborator.");
    }
    try { await gh("GET", repoPath("/git/ref/heads/" + encodeURIComponent(auth.branch))); }
    catch (e) { throw new Error(e.status === 404 ? "Branch “" + auth.branch + "” doesn't exist in the repository." : explain(e)); }
    await loadData();
  }

  function enterApp() {
    show("appView");
    $("repoName").textContent = auth.owner + "/" + auth.repo;
    $("siteLink").href = CFG.siteUrl || "../";
    renderAll();
  }

  async function loadData() {
    try {
      const [t, c] = await Promise.all([readJson(FILES.teachers, auth.branch), readJson(FILES.courses, auth.branch)]);
      state.remote.teachers = t; state.remote.courses = c;
      state.original = {
        teachers: cleanLangs(Array.isArray(t.json.teachers) ? t.json.teachers : []),
        courses: cleanLangs(Array.isArray(c.json.courses) ? c.json.courses : []),
        exams: cleanLangs(Array.isArray(c.json.exams) ? c.json.exams : [])
      };
      state.draft = clone(state.original);
      state.uploads.clear();
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("The data file on GitHub is damaged (invalid JSON). Restore it from the commit history.");
      throw new Error(e.status === 404 ? "data/teachers.json or data/courses.json is missing from the repository. Upload the latest website files." : explain(e));
    }
  }

  function initAuth() {
    // ---- one-time setup ----
    $("setupForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("setupError");
      err.textContent = "";
      const fixedRepo = !!(CFG.owner && CFG.repo);
      const creds = {
        owner: (fixedRepo ? CFG.owner : $("uOwner").value).trim(),
        repo: (fixedRepo ? CFG.repo : $("uRepo").value).trim(),
        branch: ((fixedRepo ? CFG.branch : $("uBranch").value) || "main").trim(),
        token: (legacyCreds && legacyCreds.token) || $("uToken").value.trim()
      };
      const user = $("uUser").value.trim();
      const pass = $("uPass").value;
      const fail = (msg, input) => { err.textContent = msg; if (input) input.focus(); };
      if (!creds.owner || !creds.repo) return fail("Enter the repository owner and name.", $("uOwner"));
      if (!creds.token) return fail("Paste your GitHub access token.", $("uToken"));
      if (user.length < 3) return fail("Username must be at least 3 characters.", $("uUser"));
      if (pass.length < 10) return fail("Password must be at least 10 characters.", $("uPass"));
      if (pass !== $("uPass2").value) return fail("The passwords don't match.", $("uPass2"));

      const btn = $("setupBtn");
      btn.disabled = true; btn.textContent = "Checking the token…";
      try {
        await connect(creds);
        btn.textContent = "Encrypting…";
        const vault = await sealVault(user, pass, creds);
        if (!ls.set(localStorage, VAULT_KEY, vault)) throw new Error("This browser doesn't allow saving data (private mode?). Use a normal window.");
        ls.del(localStorage, LEGACY_KEY); ls.del(sessionStorage, LEGACY_KEY);
        ls.del(localStorage, FAILS_KEY);
        legacyCreds = null;
        ls.set(sessionStorage, SESSION_KEY, creds);
        $("uToken").value = ""; $("uPass").value = ""; $("uPass2").value = "";
        $("sUser").value = user;
        enterApp();
        toast("Done. Next time, sign in with your username and password.", 5000);
      } catch (ex) {
        // a token that GitHub rejects should be re-entered, even if it came from the old version
        if (ex.status === 401 && legacyCreds) { legacyCreds = null; showSetup(); }
        fail(ex.message);
      } finally {
        btn.disabled = false; btn.textContent = "Save and sign in";
      }
    });
    $("setupCancel").addEventListener("click", () => showSignin());

    // ---- sign in ----
    $("signinForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("signinError");
      const wait = lockRemaining();
      if (wait) { err.textContent = "Too many wrong attempts. Try again in " + Math.ceil(wait / 1000) + " seconds."; return; }
      const user = $("sUser").value.trim(), pass = $("sPass").value;
      if (!user || !pass) { err.textContent = "Enter your username and password."; return; }
      const vault = ls.get(localStorage, VAULT_KEY);
      if (!vault) { showSetup(); return; }
      const btn = $("signinBtn");
      btn.disabled = true; btn.textContent = "Signing in…"; err.textContent = "";
      let creds;
      try {
        creds = await openVault(user, pass, vault);
      } catch (ex) {
        registerFail();
        err.textContent = "Wrong username or password.";
        $("sPass").value = ""; $("sPass").focus();
        btn.disabled = false; btn.textContent = "Sign in";
        return;
      }
      ls.del(localStorage, FAILS_KEY);
      try {
        await connect(creds);
        ls.set(sessionStorage, SESSION_KEY, creds);
        $("sPass").value = "";
        enterApp();
      } catch (ex) {
        if (ex.status === 401) {
          // token expired or revoked on GitHub → need a new one, keep the same username
          ls.del(localStorage, VAULT_KEY);
          showSetup("Your GitHub token has expired or was deleted. Paste a new token and choose a password.", { user });
        } else err.textContent = ex.message;
      } finally {
        btn.disabled = false; btn.textContent = "Sign in";
      }
    });

    $("resetBtn").addEventListener("click", async () => {
      const ok = await confirmDlg("Set up again?", "This removes the saved sign-in from this device. You'll need a GitHub token to create a new username and password.", "Set up again", true);
      if (!ok) return;
      ls.del(localStorage, VAULT_KEY);
      ls.del(localStorage, FAILS_KEY);
      showSetup();
    });

    $("logoutBtn").addEventListener("click", async () => {
      if (isDirty() && !(await confirmDlg("Sign out without publishing?", "Your unpublished changes will be lost.", "Sign out"))) return;
      ls.del(sessionStorage, SESSION_KEY);
      auth.token = "";
      state.draft = state.original = null;
      showSignin();
    });
  }

  /* ==========================================================
     Schemas: what each section's editor shows
     ========================================================== */
  const SCHEMAS = {
    teachers: {
      one: "teacher", title: "Teacher", add: "Add teacher",
      hint: "Cards in the “Teachers” section of the site. The order here is the order on the site.",
      empty: "No teachers yet. The section is hidden on the site while the list is empty.",
      i18n: [
        { key: "name", label: "Name", required: true, ph: "e.g. Merna" },
        { key: "role", label: "Role", ph: "e.g. English teacher" },
        { key: "experience", label: "Experience", ph: "e.g. 5 years of experience" },
        { key: "languages", label: "Languages", ph: "e.g. English, Russian" },
        { key: "bio", label: "About", textarea: true, rows: 5 }
      ],
      shared: ["photo", "telegram", "whatsapp", "email", "hidden"],
      blank: () => ({ id: "", name: {}, role: {}, experience: {}, languages: {}, bio: {}, photo: "", telegram: "", whatsapp: "", email: "" })
    },
    courses: {
      one: "course", title: "Course", add: "Add course",
      hint: "The “What I teach” block on the site.",
      empty: "No courses yet.",
      i18n: [
        { key: "title", label: "Title", required: true },
        { key: "text", label: "Description", textarea: true, rows: 3 }
      ],
      shared: ["icon", "tags", "examGuide", "hidden"],
      blank: () => ({ id: "", icon: "chat", title: {}, text: {}, tags: [], examGuide: false })
    },
    exams: {
      one: "exam", title: "Exam", add: "Add exam",
      hint: "The list in the “Which exam do I need?” window. It opens from a course that has this button turned on.",
      empty: "No exams yet. The “Which exam do I need?” button is hidden on the site.",
      sharedFirst: ["examName"],
      i18n: [
        { key: "type", label: "Who it's for / type", ph: "e.g. Academic & General Training" },
        { key: "desc", label: "Description", textarea: true, rows: 3 }
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
      img.addEventListener("error", () => img.remove());
      wrap.appendChild(img);
    }
    return wrap;
  }

  function langFilled(tab, item, code) {
    const req = SCHEMAS[tab].i18n.filter((f) => f.required).map((f) => f.key);
    const keys = req.length ? req : [SCHEMAS[tab].i18n[0].key];
    return keys.every((k) => item[k] && String(item[k][code] || "").trim());
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
        lead = el("span", { class: "exam-badge" }, item.name || "?");
        title = item.name; sub = pick(item.type);
      }
      const missing = LANGS.filter((l) => !langFilled(tab, item, l.code)).map((l) => l.label);
      const row = el("li", { class: "item" + (item.hidden ? " is-hidden" : "") },
        lead,
        el("div", { class: "item-main" },
          el("p", { class: "item-title" }, title || "Untitled",
            item.hidden ? el("span", { class: "badge" }, icon("eye-off"), "Hidden") : null),
          sub ? el("p", { class: "item-sub" }, sub) : null,
          missing.length ? el("p", { class: "item-warn" }, "Missing translation: " + missing.join(", ")) : null
        ),
        el("div", { class: "item-actions" },
          el("button", { type: "button", class: "icon-btn", "aria-label": "Move up", title: "Move up", disabled: i === 0, onclick: () => move(i, -1) }, icon("up")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Move down", title: "Move down", disabled: i === items.length - 1, onclick: () => move(i, 1) }, icon("down")),
          el("button", { type: "button", class: "icon-btn", "aria-label": "Edit", title: "Edit", onclick: () => openEditor(i) }, icon("edit")),
          el("button", { type: "button", class: "icon-btn icon-btn--danger", "aria-label": "Delete", title: "Delete", onclick: () => remove(i) }, icon("trash"))
        )
      );
      row.querySelector(".item-main").addEventListener("click", () => openEditor(i));
      list.appendChild(row);
    });
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
    if (dirty) $("publishText").textContent = "Unpublished changes: " + changedSections().join(", ") + ". The site still shows the old version.";
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
    const ok = await confirmDlg("Delete this " + SCHEMAS[state.tab].one + "?", "“" + (name || "Untitled") + "” will disappear from the site when you publish. Until then you can still click “Discard changes”.", "Delete", true);
    if (!ok) return;
    arr.splice(i, 1);
    renderAll();
    toast("Deleted. Click “Publish” to apply it on the site.");
  }

  /* ==========================================================
     Editor
     ========================================================== */
  let editing = null; // { tab, index (-1 = new), item, photo }

  function field(label, input, hint, id) {
    return el("div", { class: "field" },
      el("label", { for: id }, label),
      input,
      hint ? el("p", { class: "hint" }, hint) : null);
  }

  function sharedField(name, item) {
    switch (name) {
      case "examName":
        return field("Exam name", el("input", { id: "f-name", value: item.name || "", required: true, maxlength: 20, placeholder: "e.g. IELTS" }), null, "f-name");
      case "photo": {
        const prev = el("div", { class: "photo-preview", id: "photoPreview" });
        const fileIn = el("input", { type: "file", id: "f-photo", accept: "image/jpeg,image/png,image/webp", class: "sr-only" });
        const box = el("div", { class: "field" },
          el("span", { class: "label" }, "Photo"),
          el("div", { class: "photo-row" },
            prev,
            el("div", { class: "photo-actions" },
              el("label", { for: "f-photo", class: "btn btn-line btn-sm" }, "Upload photo"),
              el("button", { type: "button", class: "btn btn-line btn-sm", id: "photoRemove" }, "Remove photo"),
              el("p", { class: "hint" }, "JPG or PNG. It's cropped to a centred square and resized to 640×640.")
            )),
          fileIn);
        fileIn.addEventListener("change", () => onPhoto(fileIn));
        box.querySelector("#photoRemove").addEventListener("click", () => { editing.photo = { path: "", url: null }; renderPhoto(); });
        return box;
      }
      case "telegram":
        return field("Telegram", el("input", { id: "f-telegram", value: item.telegram || "", autocapitalize: "none", spellcheck: "false", placeholder: "@username, a t.me/… link or +992… number" }), null, "f-telegram");
      case "whatsapp":
        return field("WhatsApp number", el("input", { id: "f-whatsapp", value: item.whatsapp ? "+" + item.whatsapp : "", inputmode: "tel", placeholder: "+992 92 000 0000" }), "Include the country code.", "f-whatsapp");
      case "email":
        return field("Email", el("input", { id: "f-email", type: "email", value: item.email || "", autocapitalize: "none", spellcheck: "false", placeholder: "name@example.com" }), null, "f-email");
      case "icon": {
        const opts = [["chat", "Conversation"], ["case", "Briefcase (business)"], ["cap", "Graduation cap (exams)"]];
        const group = el("div", { class: "icon-choice", role: "radiogroup", "aria-label": "Icon" },
          opts.map(([v, l]) => el("label", { class: "icon-opt" },
            el("input", { type: "radio", name: "f-icon", value: v, checked: (item.icon || "chat") === v }),
            icon(v), el("span", null, l))));
        return el("div", { class: "field" }, el("span", { class: "label" }, "Icon"), group);
      }
      case "tags":
        return field("Tags", el("input", { id: "f-tags", value: (item.tags || []).join(", "), placeholder: "IELTS, TOEFL, SAT" }), "Comma-separated. Shown under the description. Optional.", "f-tags");
      case "examGuide":
        return el("label", { class: "check" }, el("input", { type: "checkbox", id: "f-examGuide", checked: !!item.examGuide }),
          el("span", null, "Show the “Which exam do I need?” button"));
      case "hidden":
        return el("label", { class: "check" }, el("input", { type: "checkbox", id: "f-hidden", checked: !!item.hidden }),
          el("span", null, "Hide on the site (stays here, you can show it again)"));
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
      const img = el("img", { src, alt: "Photo preview" });
      img.addEventListener("error", () => { prev.replaceChildren(el("span", null, "The photo will appear on the site after publishing")); });
      prev.appendChild(img);
    } else prev.appendChild(el("span", null, "No photo"));
    $("photoRemove").hidden = !src;
  }

  async function onPhoto(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const err = $("editorError");
    err.textContent = "";
    if (file.size > 20 * 1024 * 1024) { err.textContent = "The file is larger than 20 MB. Choose a smaller photo."; return; }
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height);
      const size = Math.min(640, side);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      const sx = (bmp.width - side) / 2;
      const sy = bmp.height > bmp.width ? (bmp.height - side) * 0.3 : (bmp.height - side) / 2; // keep faces in portraits
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
      bmp.close && bmp.close();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      // the data: URL doubles as the preview (no fetch — the page's CSP only allows the GitHub API)
      editing.photo = { path: null, base64: dataUrl.split(",")[1], url: dataUrl };
      renderPhoto();
    } catch (e) {
      err.textContent = "Couldn't read this photo. Save it as JPG or PNG and try again.";
    }
  }

  function openEditor(index) {
    const tab = state.tab;
    const sc = SCHEMAS[tab];
    const item = index >= 0 ? clone(state.draft[tab][index]) : sc.blank();
    editing = { tab, index, item, photo: null };

    $("editorTitle").textContent = (index >= 0 ? "Edit " : "New ") + sc.one;
    $("editorError").textContent = "";
    const body = $("editorBody");
    body.replaceChildren();

    (sc.sharedFirst || []).forEach((n) => body.appendChild(sharedField(n, item)));

    const startLang = "en";
    const tabs = el("div", { class: "lang-tabs", role: "tablist", "aria-label": "Text language" });
    const panels = el("div", { class: "lang-panels" });
    LANGS.forEach((L) => {
      const btn = el("button", { type: "button", role: "tab", class: "lang-tab", id: "lt-" + L.code, "aria-controls": "lp-" + L.code, "aria-selected": String(L.code === startLang), "data-lang": L.code },
        L.label, el("span", { class: "dot", "aria-hidden": "true" }));
      btn.addEventListener("click", () => selectLang(L.code));
      tabs.appendChild(btn);
      const panel = el("div", { class: "lang-panel", role: "tabpanel", id: "lp-" + L.code, "aria-labelledby": "lt-" + L.code, hidden: L.code !== startLang, lang: L.code, dir: L.dir });
      sc.i18n.forEach((f) => {
        const id = "f-" + f.key + "-" + L.code;
        const val = (item[f.key] && item[f.key][L.code]) || "";
        const ph = L.code === "en" ? f.ph || "" : "";
        const input = f.textarea
          ? el("textarea", { id, rows: f.rows || 4, "data-key": f.key, "data-lang": L.code, placeholder: ph })
          : el("input", { id, "data-key": f.key, "data-lang": L.code, placeholder: ph });
        input.value = val;
        input.addEventListener("input", updateLangDots);
        panel.appendChild(field(f.label + (f.required ? " *" : "") + " · " + L.name, input, null, id));
      });
      panels.appendChild(panel);
    });
    body.append(
      el("div", { class: "lang-block" },
        el("div", { class: "lang-head" },
          el("span", { class: "label" }, "Text on the site"),
          el("p", { class: "hint" }, "Fill in all 3 languages. Any empty field shows the English text on the site.")),
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

    sc.i18n.forEach((f) => {
      item[f.key] = {};
      LANGS.forEach((L) => { item[f.key][L.code] = ($("f-" + f.key + "-" + L.code).value || "").trim(); });
    });
    for (const f of sc.i18n.filter((x) => x.required)) {
      if (!LANGS.some((L) => item[f.key][L.code])) {
        return fail("Fill in “" + f.label + "” in at least one language.", $("f-" + f.key + "-en"), "en");
      }
    }

    if (sc.sharedFirst && sc.sharedFirst.includes("examName")) {
      const n = $("f-name").value.trim();
      if (!n) return fail("Enter the exam name.", $("f-name"));
      item.name = n;
    }
    if (sc.shared.includes("telegram")) {
      const tg = normTelegram($("f-telegram").value);
      if (tg === null) return fail("Telegram: enter an @username, a t.me/… link or a number with the country code.", $("f-telegram"));
      item.telegram = tg;
    }
    if (sc.shared.includes("whatsapp")) {
      const wa = normPhone($("f-whatsapp").value);
      if (wa === null) return fail("WhatsApp: the number needs 7–15 digits including the country code.", $("f-whatsapp"));
      item.whatsapp = wa;
    }
    if (sc.shared.includes("email")) {
      const em = normEmail($("f-email").value);
      if (em === null) return fail("Check the email address — it should look like name@example.com.", $("f-email"));
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

    if (!item.id) {
      const base = slug(tab === "exams" ? item.name : (item.name || item.title || {}).en || "");
      item.id = uniqueId(base, tab, index);
    }

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
    pruneUploads();
    closeEditor();
    renderAll();
    toast(index >= 0 ? "Saved to the draft. Don't forget to publish." : "Added to the draft. Don't forget to publish.");
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
      setStatus("Checking that nothing changed on GitHub…");
      const ref = await gh("GET", repoPath("/git/ref/heads/" + encodeURIComponent(auth.branch)));
      const headSha = ref.object.sha;
      const head = await gh("GET", repoPath("/git/commits/" + headSha));

      for (const key of ["teachers", "courses"]) {
        const f = await gh("GET", repoPath("/contents/" + FILES[key] + "?ref=" + headSha));
        if (f.sha !== state.remote[key].sha) throw new ApiError(409, "conflict");
      }

      const tree = [];
      buildFiles().forEach((f) => tree.push({ path: f.path, mode: "100644", type: "blob", content: f.content }));

      pruneUploads();
      let n = 0;
      for (const [path, up] of state.uploads) {
        n++;
        setStatus("Uploading photo " + n + " of " + state.uploads.size + "…");
        const blob = await gh("POST", repoPath("/git/blobs"), { content: up.base64, encoding: "base64" });
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const stillUsed = new Set(state.draft.teachers.map((t) => t.photo));
      const removed = [...new Set(state.original.teachers.map((t) => t.photo))]
        .filter((p) => p && p.startsWith(PHOTO_DIR) && !stillUsed.has(p));
      removed.forEach((path) => tree.push({ path, mode: "100644", type: "blob", sha: null }));

      setStatus("Saving…");
      const newTree = await gh("POST", repoPath("/git/trees"), { base_tree: head.tree.sha, tree });
      const message = "Admin: updated " + changedSections().join(", ");
      const commit = await gh("POST", repoPath("/git/commits"), { message, tree: newTree.sha, parents: [headSha] });
      await gh("PATCH", repoPath("/git/refs/heads/" + encodeURIComponent(auth.branch)), { sha: commit.sha, force: false });

      for (const [path, up] of state.uploads) state.previews.set(path, up.url);
      await loadData();
      renderAll();
      toast("Published. The site will update in 1–2 minutes.", 6000);
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
      if (!(await confirmDlg("Discard all changes?", "The draft goes back to the version that's on the site now.", "Discard changes", true))) return;
      state.draft = clone(state.original);
      state.uploads.clear();
      renderAll();
    });
    window.addEventListener("beforeunload", (e) => {
      if (isDirty()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ==========================================================
     Small UI helpers
     ========================================================== */
  function confirmDlg(title, text, yes, danger) {
    return new Promise((resolve) => {
      const dlg = $("confirmDlg");
      $("confirmTitle").textContent = title;
      $("confirmText").textContent = text;
      $("confirmYes").textContent = yes || "OK";
      $("confirmYes").className = "btn " + (danger === false ? "btn-ink" : "btn-danger");
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
    initAuth();
    initEditor();
    initPublish();

    if (!window.crypto || !crypto.subtle) {
      showSetup("This page must be opened over HTTPS (secure connection) to sign in.");
      $("setupBtn").disabled = true;
      return;
    }

    // migrate the plain-text token saved by the previous version, then delete it
    legacyCreds = ls.get(localStorage, LEGACY_KEY) || ls.get(sessionStorage, LEGACY_KEY);
    if (legacyCreds && !legacyCreds.token) legacyCreds = null;

    // same tab, already signed in → continue without asking again
    const session = ls.get(sessionStorage, SESSION_KEY);
    if (session && session.token) {
      try { await connect(session); enterApp(); return; }
      catch (e) { ls.del(sessionStorage, SESSION_KEY); }
    }

    if (ls.get(localStorage, VAULT_KEY)) showSignin();
    else showSetup();
  });

  window.__admin = { state, normTelegram, normPhone };
})();
