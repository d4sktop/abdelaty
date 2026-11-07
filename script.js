/* Learnly — site script (no build step, no backend) */
(function () {
  "use strict";

  /* ---------- Safe storage (private mode / blocked storage won't break the site) ---------- */
  const store = {
    get(key) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  const $ = (id) => document.getElementById(id);
  const LANGS = ["en", "ru", "tj", "ar"];
  const TEACHER_WA = "201025570505";

  /* ==========================================================
     i18n
     ========================================================== */
  let lang = "en";
  const dict = () => (window.translations && translations[lang]) || {};
  const t = (key, vars) => {
    let s = dict()[key];
    if (s == null) s = (window.translations && translations.en[key]) || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  };

  function detectLang() {
    const saved = store.get("learnly.lang");
    if (saved && LANGS.includes(saved)) return saved;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (nav === "ru") return "ru";
    if (nav === "tg") return "tj";
    if (nav === "ar") return "ar";
    return "en";
  }

  function applyLanguage(next) {
    if (!LANGS.includes(next)) next = "en";
    lang = next;
    const html = document.documentElement;
    html.lang = next === "tj" ? "tg" : next;
    html.dir = next === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = dict()[el.dataset.i18n];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const v = dict()[el.dataset.i18nPlaceholder];
      if (v != null) el.placeholder = v;
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      const v = dict()[el.dataset.i18nAlt];
      if (v != null) el.alt = v;
    });
    if (dict().metaTitle) document.title = dict().metaTitle;

    const sel = $("langSelect");
    if (sel) sel.value = next;
    store.set("learnly.lang", next);

    // re-render dynamic parts in the new language
    Test.refreshLanguage();
    renderHeroYou();
    Content.render();
  }

  /* ==========================================================
     Header: mobile menu, current section highlight
     ========================================================== */
  function initHeader() {
    const toggle = $("menuToggle");
    const nav = $("mainNav");
    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open); // lock page scroll under the menu
    };
    const desktop = matchMedia("(min-width: 1021px)");
    const onBp = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener ? desktop.addEventListener("change", onBp) : desktop.addListener(onBp);
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("is-open") && !e.target.closest("#mainNav, #menuToggle")) setOpen(false);
    });

    $("langSelect").addEventListener("change", (e) => applyLanguage(e.target.value));

    // highlight nav item of the section in view
    if ("IntersectionObserver" in window) {
      const links = new Map();
      nav.querySelectorAll('li:not(.nav-cta) a[href^="#"]').forEach((a) => links.set(a.getAttribute("href").slice(1), a));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.target.id === "home" && en.isIntersecting) { links.forEach((l) => l.classList.remove("is-current")); return; }
          const a = links.get(en.target.id);
          if (a && en.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-current"));
            a.classList.add("is-current");
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      links.forEach((_, id) => { const s = $(id); if (s) io.observe(s); });
      io.observe($("home"));

    }

    const y = $("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ==========================================================
     Floating chat
     Hidden where it would cover something important: the hero (it has its own
     WhatsApp/Telegram buttons, phones only), the test while answering, and contacts.
     On phones it's one button that opens WhatsApp / Telegram.
     ========================================================== */
  let updateFloat = () => {};
  const isPhone = matchMedia("(max-width: 640px)");
  const isTouch = matchMedia("(hover: none) and (pointer: coarse)");

  function initFloatChat() {
    const fc = $("floatChat");
    const toggle = $("fcToggle");
    if (!fc) return;
    const setOpen = (open) => {
      fc.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    toggle.addEventListener("click", () => setOpen(!fc.classList.contains("is-open")));
    document.addEventListener("click", (e) => { if (!e.target.closest("#floatChat")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    fc.querySelectorAll(".fc-links a").forEach((a) => a.addEventListener("click", () => setOpen(false)));

    const visible = (el, minPx) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > minPx && r.top < window.innerHeight - minPx;
    };
    let raf = 0;
    updateFloat = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hide =
          visible($("contact"), 80) ||
          (Test.isActive() && visible($("placementTest"), 80)) ||
          (isPhone.matches && $("home").getBoundingClientRect().bottom > window.innerHeight * 0.35);
        fc.classList.toggle("is-hidden", hide);
        if (hide) setOpen(false);
      });
    };
    window.addEventListener("scroll", updateFloat, { passive: true });
    window.addEventListener("resize", updateFloat);
    updateFloat();
  }

  /* ==========================================================
     Exam guide dialog
     ========================================================== */
  function initExamGuide() {
    const dlg = $("examGuide");
    if (!dlg) return;
    const close = () => { if (dlg.open) dlg.close(); };
    // the button is rendered from data/courses.json, so listen on the document
    document.addEventListener("click", (e) => {
      if (!e.target.closest("[data-exam-guide]")) return;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    });
    $("closeExamGuide").addEventListener("click", close);
    $("egContact").addEventListener("click", close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); }); // click on backdrop
  }

  /* ==========================================================
     Content managed in /admin: teachers, courses, exams.
     Stored as JSON in the repository (data/*.json) and rendered here.
     Everything is inserted with textContent, never innerHTML.
     ========================================================== */
  const Content = (function () {
    let teachers = null, courses = null, exams = null, failed = false;
    const ICONS = ["chat", "case", "cap"];

    // pick the text for the current language, falling back to English, then any language
    const pick = (obj) => {
      if (!obj || typeof obj !== "object") return typeof obj === "string" ? obj : "";
      return (obj[lang] || obj.en || obj.ru || obj.tj || obj.ar || "").trim();
    };
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const icon = (id, cls) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", cls || "ico");
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-" + id);
      svg.appendChild(use);
      return svg;
    };
    // links typed by the admin are normalised and only http(s)/mailto are allowed
    const safeUrl = (u) => /^(https:\/\/|mailto:)/i.test(u || "") ? u : null;
    const photoUrl = (p) => /^img\/[\w\-./]+\.(jpe?g|png|webp)$/i.test(p || "") && p.indexOf("..") === -1 ? p : null;

    function renderTeachers() {
      const box = $("teamList");
      const section = $("team");
      if (!box) return;
      box.replaceChildren();
      box.removeAttribute("aria-busy");
      if (failed) { section.hidden = false; box.appendChild(el("p", "data-error", t("dataError"))); return; }
      const list = (teachers || []).filter((x) => !x.hidden);
      section.hidden = list.length === 0;
      list.forEach((p) => {
        const name = pick(p.name);
        const card = el("article", "person");
        const src = photoUrl(p.photo);
        if (src) {
          const img = el("img");
          img.src = src; img.width = 640; img.height = 640; img.loading = "lazy"; img.alt = name;
          card.appendChild(img);
        } else {
          const ph = el("div", "person-initials", name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase());
          ph.setAttribute("aria-hidden", "true");
          card.appendChild(ph);
        }
        const body = el("div", "person-body");
        body.appendChild(el("h3", null, name));
        const role = pick(p.role);
        if (role) body.appendChild(el("p", "person-role", role));
        const meta = [pick(p.experience), pick(p.languages)].filter(Boolean);
        if (meta.length) {
          const ul = el("ul", "person-meta");
          meta.forEach((m) => ul.appendChild(el("li", null, m)));
          body.appendChild(ul);
        }
        const bio = pick(p.bio);
        if (bio) body.appendChild(el("p", null, bio));
        const links = el("div", "person-links");
        const add = (href, ico, label) => {
          if (!href) return;
          const a = el("a");
          a.href = href;
          if (/^https:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
          a.setAttribute("aria-label", name + " — " + label);
          a.append(icon(ico), document.createTextNode(label));
          links.appendChild(a);
        };
        add(safeUrl(p.telegram), "tg", "Telegram");
        add(p.whatsapp && /^\d{7,15}$/.test(p.whatsapp) ? "https://wa.me/" + p.whatsapp : null, "wa", "WhatsApp");
        add(p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? "mailto:" + p.email : null, "mail", "Email");
        if (links.childNodes.length) body.appendChild(links);
        card.appendChild(body);
        box.appendChild(card);
      });
    }

    function renderCourses() {
      const box = $("courseList");
      if (!box) return;
      box.replaceChildren();
      box.removeAttribute("aria-busy");
      if (failed) { box.appendChild(el("p", "data-error", t("dataError"))); return; }
      (courses || []).filter((x) => !x.hidden).forEach((c) => {
        const card = el("article", "course");
        card.appendChild(icon(ICONS.includes(c.icon) ? c.icon : "chat", "course-ico"));
        card.appendChild(el("h3", null, pick(c.title)));
        const text = pick(c.text);
        if (text) card.appendChild(el("p", null, text));
        const tags = (c.tags || []).filter(Boolean);
        if (tags.length) {
          const ul = el("ul", "chips");
          tags.forEach((tg) => ul.appendChild(el("li", null, tg)));
          card.appendChild(ul);
        }
        if (c.examGuide && (exams || []).some((x) => !x.hidden)) {
          const b = el("button", "link-btn");
          b.type = "button";
          b.setAttribute("data-exam-guide", "");
          b.append(el("span", null, t("compareExams")), icon("arrow", "ico flip-rtl"));
          card.appendChild(b);
        }
        box.appendChild(card);
      });
    }

    function renderExams() {
      const box = $("examList");
      if (!box) return;
      box.replaceChildren();
      (exams || []).filter((x) => !x.hidden).forEach((x) => {
        const row = el("div");
        row.appendChild(el("dt", null, x.name || ""));
        const dd = el("dd");
        const type = pick(x.type), desc = pick(x.desc);
        if (type) dd.appendChild(el("strong", null, type));
        if (desc) dd.appendChild(el("span", null, desc));
        row.appendChild(dd);
        box.appendChild(row);
      });
    }

    function render() {
      if (teachers === null && !failed) return; // not loaded yet
      renderCourses(); renderExams(); renderTeachers();
    }

    async function load() {
      try {
        // no-cache = revalidate with GitHub Pages every time, so admin edits show up quickly
        const [a, b] = await Promise.all([
          fetch("data/teachers.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw r.status; return r.json(); }),
          fetch("data/courses.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw r.status; return r.json(); })
        ]);
        teachers = Array.isArray(a.teachers) ? a.teachers : [];
        courses = Array.isArray(b.courses) ? b.courses : [];
        exams = Array.isArray(b.exams) ? b.exams : [];
      } catch (e) {
        failed = true;
      }
      render();
    }

    return { load, render };
  })();

  /* ==========================================================
     Placement test
     ========================================================== */
  const QUESTIONS = [
    // A1
    { level: "A1", q: "My name _____ Sara.", o: ["am", "is", "are", "be"], a: 1 },
    { level: "A1", q: "We _____ from Tajikistan.", o: ["is", "are", "am", "be"], a: 1 },
    { level: "A1", q: "I have _____ brother and two sisters.", o: ["a", "an", "the", "some"], a: 0 },
    { level: "A1", q: "She _____ coffee every morning.", o: ["drink", "drinks", "drinking", "is drink"], a: 1 },
    { level: "A1", q: "_____ you like music?", o: ["Are", "Do", "Does", "Have"], a: 1 },
    { level: "A1", q: "There _____ two books on the table.", o: ["is", "are", "has", "be"], a: 1 },
    { level: "A1", q: "I usually go to work _____ bus.", o: ["on", "with", "by", "at"], a: 2 },
    { level: "A1", q: "Look! The children _____ in the garden.", o: ["play", "plays", "are playing", "played"], a: 2 },
    // A2
    { level: "A2", q: "I _____ to the cinema last Saturday.", o: ["go", "went", "have gone", "am going"], a: 1 },
    { level: "A2", q: "We haven't got _____ milk.", o: ["some", "many", "any", "a"], a: 2 },
    { level: "A2", q: "This bag is _____ than that one.", o: ["cheap", "cheaper", "cheapest", "more cheap"], a: 1 },
    { level: "A2", q: "How long _____ in this city?", o: ["do you live", "are you live", "have you lived", "you live"], a: 2 },
    { level: "A2", q: "I'm tired because I _____ all morning.", o: ["work", "worked", "have been working", "am work"], a: 2 },
    { level: "A2", q: "Could you tell me _____ the station is?", o: ["where", "where is", "is where", "what"], a: 0 },
    { level: "A2", q: "We _____ visit our grandparents next weekend.", o: ["are going to", "going", "have", "did"], a: 0 },
    { level: "A2", q: "You _____ wear a seat belt in a car.", o: ["must", "might", "could", "would"], a: 0 },
    // B1
    { level: "B1", q: "If it rains tomorrow, we _____ at home.", o: ["stay", "stayed", "will stay", "would stay"], a: 2 },
    { level: "B1", q: "I used _____ football when I was younger.", o: ["play", "to play", "playing", "played"], a: 1 },
    { level: "B1", q: "She has worked here _____ 2021.", o: ["for", "since", "during", "from"], a: 1 },
    { level: "B1", q: "The meeting _____ before I arrived.", o: ["has started", "had started", "starts", "was start"], a: 1 },
    { level: "B1", q: "This book _____ by a famous journalist.", o: ["wrote", "was written", "has writing", "is wrote"], a: 1 },
    { level: "B1", q: "I don't enjoy _____ up early at weekends.", o: ["get", "to get", "getting", "got"], a: 2 },
    { level: "B1", q: "He said he _____ call me later.", o: ["will", "would", "can", "has"], a: 1 },
    { level: "B1", q: "The train was delayed, _____ we took a taxi.", o: ["although", "so", "unless", "because"], a: 1 },
    // B2
    { level: "B2", q: "If I _____ more time, I would take another course.", o: ["have", "had", "would have", "will have"], a: 1 },
    { level: "B2", q: "By next June, she _____ here for ten years.", o: ["will work", "will have worked", "has worked", "is working"], a: 1 },
    { level: "B2", q: "I'd rather you _____ me before making that decision.", o: ["tell", "told", "have told", "will tell"], a: 1 },
    { level: "B2", q: "The project was cancelled _____ a lack of funding.", o: ["because", "because of", "although", "despite"], a: 1 },
    { level: "B2", q: "He denied _____ the confidential document.", o: ["to copy", "copy", "copying", "copied"], a: 2 },
    { level: "B2", q: "The new policy is expected _____ next month.", o: ["introducing", "to introduce", "to be introduced", "being introduced"], a: 2 },
    { level: "B2", q: "She speaks English fluently, _____ she?", o: ["doesn't", "isn't", "does", "is"], a: 0 },
    { level: "B2", q: "We need to _____ a solution before Friday.", o: ["come up with", "come across", "come into", "come after"], a: 0 },
    // C1
    { level: "C1", q: "Had I known about the delay, I _____ earlier.", o: ["would leave", "would have left", "will have left", "had left"], a: 1 },
    { level: "C1", q: "The report, _____ was published yesterday, has attracted criticism.", o: ["that", "what", "which", "where"], a: 2 },
    { level: "C1", q: "The manager insisted that the figures _____ checked again.", o: ["are", "were", "be", "will be"], a: 2 },
    { level: "C1", q: "Rarely _____ such a dramatic change in policy.", o: ["we see", "do we see", "we have seen", "have we see"], a: 1 },
    { level: "C1", q: "The evidence is not sufficient to _____ the claim.", o: ["substantiate", "estimate", "presume", "retain"], a: 0 },
    { level: "C1", q: "Much _____ the proposal may seem attractive, it has serious drawbacks.", o: ["although", "as", "despite", "however"], a: 1 },
    { level: "C1", q: "She was _____ to agree to the terms without further discussion.", o: ["reluctant", "reluctance", "reluctantly", "relucted"], a: 0 },
    { level: "C1", q: "The company needs to _____ the risks before expanding overseas.", o: ["assess", "assure", "assume", "assert"], a: 0 }
  ];
  const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  const IDK = -1; // "I don't know"
  const STATE_KEY = "learnly.test.progress";
  const RESULT_KEY = "learnly.test.result";

  /*
   * Scoring.
   * Each level has 8 questions. The result is the highest level L where
   *   1) at least 5 of the 8 questions of L are correct (random guessing gives ~2), and
   *   2) accuracy over all questions from A1 up to and including L is at least 65%.
   * (1) stops a level being awarded without evidence at that level;
   * (2) stops a few lucky guesses in a high band from skipping weak lower bands,
   * while one weaker band in the middle doesn't sink an otherwise strong result.
   * If no level qualifies, the result is A1.
   */
  const PASS_MARK = 5;
  const CUMULATIVE_MIN = 0.65;
  function computeLevel(perLevel) {
    let level = "A1";
    let correct = 0, total = 0;
    for (const L of LEVELS) {
      correct += perLevel[L].correct;
      total += perLevel[L].total;
      if (perLevel[L].correct >= PASS_MARK && correct / total >= CUMULATIVE_MIN) level = L;
    }
    return level;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const Test = (function () {
    let s = null; // { index, answers[], order[][], startedAt, elapsed }
    let els = {};
    let tickStart = 0;

    function newState() {
      return {
        index: 0,
        answers: new Array(QUESTIONS.length).fill(null),
        order: QUESTIONS.map((q) => shuffle(q.o.map((_, i) => i))), // option order shuffled per attempt
        elapsed: 0
      };
    }

    function validState(x) {
      return x && Array.isArray(x.answers) && x.answers.length === QUESTIONS.length &&
        Array.isArray(x.order) && x.order.length === QUESTIONS.length &&
        Number.isInteger(x.index) && x.index >= 0 && x.index < QUESTIONS.length;
    }

    function save() {
      if (!s) return;
      s.elapsed += Date.now() - tickStart; tickStart = Date.now();
      store.set(STATE_KEY, s);
    }

    function answeredCount() { return s ? s.answers.filter((v) => v !== null).length : 0; }

    function show(view) {
      els.start.hidden = view !== "start";
      els.quiz.hidden = view !== "quiz";
      els.result.hidden = view !== "result";
    }

    function scrollToTest() {
      const header = document.querySelector(".site-header");
      const top = els.root.getBoundingClientRect().top;
      if (top < (header ? header.offsetHeight : 0) || top > window.innerHeight * 0.5) {
        els.root.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
    }

    function begin(resume) {
      if (resume) {
        const saved = store.get(STATE_KEY);
        s = validState(saved) ? saved : newState();
      } else {
        s = newState();
        store.remove(STATE_KEY);
      }
      tickStart = Date.now();
      show("quiz");
      render();
      scrollToTest();
      updateFloat();
      focusOption("input");
    }

    function exit() {
      save();
      s = null;
      renderStart();
      show("start");
      scrollToTest();
      updateFloat();
    }

    function questionHTML(text, filled) {
      // turn "_____" into a visible gap; when answered, show the chosen words in the gap
      const parts = text.split("_____");
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => {
        frag.appendChild(document.createTextNode(p));
        if (i < parts.length - 1) {
          const gap = document.createElement("span");
          gap.className = "gap" + (filled ? " filled" : "");
          if (filled) gap.textContent = filled; else gap.setAttribute("aria-label", "blank");
          frag.appendChild(gap);
        }
      });
      return frag;
    }

    function render() {
      const q = QUESTIONS[s.index];
      const chosen = s.answers[s.index];
      els.current.textContent = s.index + 1;
      els.total.textContent = QUESTIONS.length;
      els.level.textContent = q.level;

      els.qtext.replaceChildren(questionHTML(q.q, chosen !== null && chosen !== IDK ? q.o[chosen] : null));

      els.options.replaceChildren();
      const name = "pt-q-" + s.index;
      const opts = s.order[s.index].map((origIdx) => ({ idx: origIdx, text: q.o[origIdx] }));
      opts.push({ idx: IDK, text: t("ptIdk") });

      opts.forEach((opt, n) => {
        const label = document.createElement("label");
        label.className = "pt-option" + (opt.idx === IDK ? " pt-option--idk" : "") + (chosen === opt.idx ? " is-selected" : "");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = String(opt.idx);
        input.checked = chosen === opt.idx;
        const key = document.createElement("span");
        key.className = "pt-key";
        key.textContent = opt.idx === IDK ? "?" : String(n + 1);
        key.setAttribute("aria-hidden", "true");
        const txt = document.createElement("span");
        txt.className = "pt-option-text";
        txt.textContent = opt.text;
        label.append(input, key, txt);
        input.addEventListener("change", () => select(opt.idx));
        els.options.appendChild(label);
      });

      const pct = (answeredCount() / QUESTIONS.length) * 100;
      els.bar.style.width = pct + "%";
      els.progress.setAttribute("aria-valuenow", String(answeredCount()));
      els.progress.setAttribute("aria-valuemax", String(QUESTIONS.length));
      updateNav();
    }

    function select(idx) {
      s.answers[s.index] = idx;
      els.options.querySelectorAll(".pt-option").forEach((l) => {
        const inp = l.querySelector("input");
        const on = Number(inp.value) === idx;
        l.classList.toggle("is-selected", on);
        inp.checked = on;
      });
      const q = QUESTIONS[s.index];
      els.qtext.replaceChildren(questionHTML(q.q, idx !== IDK ? q.o[idx] : null));
      const pct = (answeredCount() / QUESTIONS.length) * 100;
      els.bar.style.width = pct + "%";
      els.progress.setAttribute("aria-valuenow", String(answeredCount()));
      updateNav();
      save();

      // Touch screens: move on automatically after a short pause so the choice is visible.
      // Not on the last question (the result should be a deliberate tap), and cancelled
      // if the person changes the answer or navigates in the meantime.
      clearTimeout(autoTimer);
      if (isTouch.matches && s.index < QUESTIONS.length - 1) {
        const at = s.index;
        autoTimer = setTimeout(() => { if (s && s.index === at && s.answers[at] !== null) next(); }, 450);
      }
    }
    let autoTimer = 0;

    function updateNav() {
      els.prev.disabled = s.index === 0;
      els.next.disabled = s.answers[s.index] === null;
      const last = s.index === QUESTIONS.length - 1;
      els.nextLabel.textContent = last ? t("ptFinish") : t("ptNext");
    }

    function next() {
      if (!s || s.answers[s.index] === null) return;
      if (s.index < QUESTIONS.length - 1) {
        clearTimeout(autoTimer);
        s.index++;
        save();
        render();
        keepQuestionInView();
        focusOption("input:checked, input");
      } else {
        finish();
      }
    }

    function prev() {
      if (!s || s.index === 0) return;
      clearTimeout(autoTimer);
      s.index--;
      save();
      render();
      keepQuestionInView();
      focusOption("input:checked, input");
    }

    // Keyboard users get focus on the options; on touch screens focusing a radio
    // only draws a ring and can make the browser scroll, so skip it there.
    function focusOption(sel) {
      if (isTouch.matches) return;
      els.options.querySelector(sel)?.focus({ preventScroll: true });
    }

    function keepQuestionInView() {
      const header = document.querySelector(".site-header");
      const top = els.quiz.getBoundingClientRect().top - (header ? header.offsetHeight : 0) - 8;
      if (top < 0) window.scrollBy({ top, behavior: "auto" });
    }

    function finish() {
      clearTimeout(autoTimer);
      // all answered? (guard in case of tampered state)
      const firstMissing = s.answers.findIndex((v) => v === null);
      if (firstMissing !== -1) { s.index = firstMissing; render(); return; }

      save();
      const perLevel = {};
      LEVELS.forEach((L) => { perLevel[L] = { correct: 0, total: 0 }; });
      const mistakes = [];
      QUESTIONS.forEach((q, i) => {
        perLevel[q.level].total++;
        if (s.answers[i] === q.a) perLevel[q.level].correct++;
        else mistakes.push({ i, given: s.answers[i] });
      });
      const score = QUESTIONS.length - mistakes.length;
      const result = {
        level: computeLevel(perLevel),
        score,
        total: QUESTIONS.length,
        perLevel,
        mistakes,
        seconds: Math.round(s.elapsed / 1000),
        completedAt: new Date().toISOString()
      };
      store.set(RESULT_KEY, result);
      store.remove(STATE_KEY);
      s = null;
      renderResult(result);
      show("result");
      scrollToTest();
      els.result.focus({ preventScroll: true });
      renderHeroYou();
      updateFloat();
    }

    function fmtTime(sec) {
      const m = Math.floor(sec / 60), r = sec % 60;
      return t("ptTimeFmt", { m, s: String(r).padStart(2, "0") });
    }

    function fmtDate(iso) {
      try {
        return new Date(iso).toLocaleDateString(lang === "tj" ? "tg" : lang, { day: "numeric", month: "long", year: "numeric" });
      } catch (e) { return iso.slice(0, 10); }
    }

    function resultText(r) {
      return t("ptShareText", { level: r.level, title: t("lvl" + r.level), score: r.score, total: r.total });
    }

    let lastResult = null;
    function renderResult(r) {
      lastResult = r;
      els.resLevel.textContent = r.level;
      els.resTitle.textContent = t("lvl" + r.level);
      els.resDesc.textContent = t("desc" + r.level);
      els.resScore.textContent = r.score + " / " + r.total;
      els.resTime.textContent = r.seconds ? fmtTime(r.seconds) : "—";
      els.resRuler.querySelectorAll("li").forEach((li) => li.classList.toggle("is-you", li.dataset.level === r.level));

      els.breakdown.replaceChildren();
      LEVELS.forEach((L) => {
        const d = r.perLevel[L];
        const li = document.createElement("li");
        const b = document.createElement("b"); b.textContent = L;
        const bar = document.createElement("div");
        bar.className = "pt-bar" + (d.correct >= PASS_MARK ? " is-pass" : "");
        const fill = document.createElement("span");
        fill.style.width = (d.correct / d.total) * 100 + "%";
        bar.appendChild(fill);
        const em = document.createElement("em"); em.textContent = d.correct + "/" + d.total;
        li.append(b, bar, em);
        els.breakdown.appendChild(li);
      });

      els.sendWa.href = "https://wa.me/" + TEACHER_WA + "?text=" + encodeURIComponent(resultText(r));

      // review list
      els.reviewList.replaceChildren();
      els.reviewCount.textContent = "(" + r.mistakes.length + ")";
      els.reviewWrap.hidden = r.mistakes.length === 0;
      r.mistakes.forEach((m) => {
        const q = QUESTIONS[m.i];
        if (!q) return;
        const li = document.createElement("li");
        const qp = document.createElement("p"); qp.className = "q";
        const lvl = document.createElement("span"); lvl.className = "lvl"; lvl.textContent = q.level;
        qp.append(lvl, document.createTextNode(q.q));
        const ans = document.createElement("p"); ans.className = "ans";
        const yours = document.createElement("span"); yours.className = "yours";
        yours.textContent = t("ptYourAnswer") + ": " + (m.given === IDK || m.given == null ? t("ptIdk") : q.o[m.given]);
        const right = document.createElement("span"); right.className = "right";
        right.textContent = t("ptCorrect") + ": " + q.o[q.a];
        ans.append(yours, right);
        li.append(qp, ans);
        els.reviewList.appendChild(li);
      });
      els.copied.textContent = "";
    }

    function renderStart() {
      const saved = store.get(STATE_KEY);
      const hasProgress = validState(saved) && saved.answers.some((v) => v !== null);
      els.resume.hidden = !hasProgress;
      if (hasProgress) {
        const n = saved.answers.filter((v) => v !== null).length;
        els.resume.textContent = t("ptResume", { n, total: QUESTIONS.length });
        els.startBtn.textContent = t("ptStartOver");
      } else {
        els.startBtn.textContent = t("ptStart");
      }
      const r = store.get(RESULT_KEY);
      if (r && r.level && LEVELS.includes(r.level)) {
        els.last.hidden = false;
        els.last.textContent = t("ptLast", { level: r.level, title: t("lvl" + r.level), date: fmtDate(r.completedAt) });
      } else {
        els.last.hidden = true;
      }
    }

    function copyResult() {
      if (!lastResult) return;
      const text = resultText(lastResult);
      const done = () => { els.copied.textContent = t("ptCopied"); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
      ta.remove();
    }

    function onKey(e) {
      if (!s || els.quiz.hidden) return;
      if (e.target.closest("input[type=text], input[type=email], textarea, select")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const opts = els.options.querySelectorAll("input");
      if (/^[1-4]$/.test(e.key)) {
        const inp = opts[Number(e.key) - 1];
        if (inp) { e.preventDefault(); select(Number(inp.value)); inp.focus({ preventScroll: true }); }
      } else if (e.key === "0" || e.key === "?") {
        e.preventDefault(); select(IDK);
      } else if (e.key === "Enter") {
        if (e.target.closest("button, a")) return; // let buttons behave normally
        e.preventDefault(); next();
      }
    }

    function init() {
      els = {
        root: $("placementTest"),
        start: $("ptStart"), quiz: $("ptQuiz"), result: $("ptResult"),
        startBtn: $("ptStartBtn"), resume: $("ptResumeBtn"), last: $("ptLast"),
        current: $("ptCurrent"), total: $("ptTotal"), level: $("ptLevel"),
        progress: $("ptProgress"), bar: $("ptProgressBar"),
        qtext: $("ptQuestionText"), options: $("ptOptions"),
        prev: $("ptPrevBtn"), next: $("ptNextBtn"), nextLabel: $("ptNextLabel"), exit: $("ptExitBtn"),
        resLevel: $("ptResLevel"), resTitle: $("ptResTitle"), resDesc: $("ptResDesc"),
        resScore: $("ptResScore"), resTime: $("ptResTime"), resRuler: $("ptResRuler"),
        breakdown: $("ptBreakdown"), sendWa: $("ptSendWa"), copy: $("ptCopyBtn"), copied: $("ptCopied"),
        retake: $("ptRetakeBtn"), reviewWrap: $("ptReviewWrap"), reviewList: $("ptReviewList"), reviewCount: $("ptReviewCount")
      };
      if (!els.root) return;
      els.startBtn.addEventListener("click", () => begin(false));
      els.resume.addEventListener("click", () => begin(true));
      els.next.addEventListener("click", next);
      els.prev.addEventListener("click", prev);
      els.exit.addEventListener("click", exit);
      els.retake.addEventListener("click", () => begin(false));
      els.copy.addEventListener("click", copyResult);
      document.addEventListener("keydown", onKey);
      window.addEventListener("pagehide", () => { if (s) save(); });
      document.addEventListener("visibilitychange", () => {
        if (!s) return;
        if (document.hidden) save(); else tickStart = Date.now();
      });
      // don't count time while the tab is hidden
      renderStart();
    }

    function refreshLanguage() {
      if (!els.root) return;
      if (s && !els.quiz.hidden) render();
      else if (!els.result.hidden && lastResult) renderResult(lastResult);
      else renderStart();
    }

    return {
      init, refreshLanguage,
      isActive: () => !!s,
      lastResult: () => store.get(RESULT_KEY),
      _computeLevel: computeLevel, _questions: QUESTIONS
    };
  })();

  function renderHeroYou() {
    const r = store.get(RESULT_KEY);
    const you = $("rulerYou");
    document.querySelectorAll("#heroRuler li").forEach((li) => li.classList.toggle("is-you", !!r && li.dataset.level === r.level));
    if (r && LEVELS.includes(r.level)) {
      you.hidden = false;
      you.textContent = t("rulerYou", { level: r.level });
    } else you.hidden = true;
  }

  /* ==========================================================
     Contact form (EmailJS — no backend needed)
     ========================================================== */
  const EMAILJS = { service: "service_ldhy2to", template: "template_801oyf8", publicKey: "xysapK6PQ7Mx_n7io" };

  function initForm() {
    const form = $("contactForm");
    if (!form) return;
    const status = $("formStatus");
    const btn = $("formSubmit");

    const setError = (input, msg) => {
      const field = input.closest(".field");
      let err = field.querySelector(".field-error");
      if (msg) {
        field.classList.add("has-error");
        if (!err) { err = document.createElement("p"); err.className = "field-error"; err.id = input.id + "-err"; field.appendChild(err); }
        err.textContent = msg;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", err.id);
      } else {
        field.classList.remove("has-error");
        if (err) err.remove();
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    };

    const validate = () => {
      let firstBad = null;
      form.querySelectorAll("input[required], textarea[required]").forEach((inp) => {
        let msg = "";
        if (!inp.value.trim()) msg = t("errRequired");
        else if (inp.type === "email" && !inp.checkValidity()) msg = t("errEmail");
        setError(inp, msg);
        if (msg && !firstBad) firstBad = inp;
      });
      return firstBad;
    };

    form.querySelectorAll("input, textarea").forEach((inp) => {
      inp.addEventListener("input", () => { if (inp.closest(".has-error")) validate(); });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      status.className = "form-status";
      status.textContent = "";
      const bad = validate();
      if (bad) { bad.focus(); return; }

      if (typeof window.emailjs === "undefined") {
        status.className = "form-status err";
        status.textContent = t("formUnavailable");
        return;
      }

      // attach the test result, if any, so the teacher sees the level
      const r = store.get(RESULT_KEY);
      const msg = form.elements.message;
      const original = msg.value;
      if (r && r.level && original.indexOf("CEFR") === -1) {
        msg.value = original + "\n\n— " + t("ptShareText", { level: r.level, title: t("lvl" + r.level), score: r.score, total: r.total });
      }
      form.elements.time.value = new Date().toLocaleString();

      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = t("fSending");

      emailjs.sendForm(EMAILJS.service, EMAILJS.template, form, EMAILJS.publicKey)
        .then(() => {
          status.className = "form-status ok";
          status.textContent = t("formOk");
          form.reset();
        })
        .catch(() => {
          msg.value = original;
          status.className = "form-status err";
          status.textContent = t("formErr");
        })
        .finally(() => {
          btn.disabled = false;
          btn.textContent = label;
        });
    });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initHeader();
    initExamGuide();
    Test.init();
    initFloatChat();
    initForm();
    applyLanguage(detectLang());
    Content.load();
  });

  // exposed for automated checks
  window.__learnly = { Test, applyLanguage };
})();
