// Function for inline form onsubmit="sendMessage(event)"
function sendMessage(event) {
  event.preventDefault();

  // 1. Safety check: ensure EmailJS library is loaded
  if (typeof emailjs === "undefined") {
    alert("EmailJS SDK is not loaded. Please make sure the script tag is added to index.html");
    return;
  }

  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;

  // Disable button and show loading state
  submitBtn.disabled = true;
  submitBtn.innerHTML = "Sending...";

  // Create or update hidden time field with current date & time
  let timeInput = form.querySelector('input[name="time"]');
  if (!timeInput) {
    timeInput = document.createElement("input");
    timeInput.type = "hidden";
    timeInput.name = "time";
    form.appendChild(timeInput);
  }
  timeInput.value = new Date().toLocaleString();

  // EmailJS Credentials
  const serviceID = "service_ldhy2to";
  const templateID = "template_801oyf8";
  const publicKey = "xysapK6PQ7Mx_n7io"; 

  emailjs.sendForm(serviceID, templateID, form, publicKey)
    .then((response) => {
      console.log("SUCCESS!", response.status, response.text);
      alert("Thank you! Your message has been sent successfully.");
      form.reset();
    })
    .catch((error) => {
      console.error("EmailJS Error:", error);
      alert("Failed to send message: " + (error.text || error.message || "Unknown error"));
    })
    .finally(() => {
      // Re-enable button and restore original text
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const navMenu = document.getElementById("navMenu");
  const languageButton = document.getElementById("languageButton");
  const languageOptions = document.getElementById("languageOptions");
  const currentLangText = document.getElementById("currentLang");

  // Toggle Mobile Navigation Menu
  if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }

  // Close Mobile Menu on Nav Link Click
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      if (navMenu) navMenu.classList.remove("active");
    });
  });

  // Toggle Language Menu Dropdown
  if (languageButton && languageOptions) {
    languageButton.addEventListener("click", (e) => {
      e.stopPropagation();
      languageOptions.classList.toggle("active");
    });
  }

  // Change Language Function
  function changeLanguage(lang) {
    if (typeof translations === "undefined" || !translations[lang]) return;

    const selected = translations[lang];

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (selected[key]) {
        el.innerHTML = selected[key];
      }
    });

    if (currentLangText) {
      currentLangText.textContent = lang.toUpperCase();
    }
    if (languageOptions) {
      languageOptions.classList.remove("active");
    }
    localStorage.setItem("selectedLanguage", lang);
  }

  // Attach Event Listeners to Language Buttons
  document.querySelectorAll("[data-language]").forEach((btn) => {
    btn.addEventListener("click", () => {
      changeLanguage(btn.dataset.language);
    });
  });

  // Close Language Menu On Outside Click
  document.addEventListener("click", (e) => {
    if (languageOptions && !e.target.closest(".language-switcher")) {
      languageOptions.classList.remove("active");
    }
  });

  // Load Initial Saved Language
  const savedLanguage = localStorage.getItem("selectedLanguage") || "en";
  changeLanguage(savedLanguage);
});

function openCertModal() {
  const modal = document.getElementById("certModal");
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden"; // Freeze background scroll
  }
}

function closeCertModal(event) {
  if (!event || event.target.classList.contains("modal-overlay") || event.target.classList.contains("modal-close")) {
    const modal = document.getElementById("certModal");
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = ""; // Restore scrolling
    }
  }
}

// Close modal on Escape key press
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeCertModal();
  }
});


/* ============================================================
   Learnly English Placement Test
   Original question bank, CEFR-oriented A1–C1 placement estimate.
   ============================================================ */
const placementQuestions = [
  // A1
  {level:"A1", q:"My name _____ Sara.", o:["am","is","are","be"], a:1},
  {level:"A1", q:"We _____ from Tajikistan.", o:["is","are","am","be"], a:1},
  {level:"A1", q:"I have _____ brother and two sisters.", o:["a","an","the","—"], a:0},
  {level:"A1", q:"She _____ coffee every morning.", o:["drink","drinks","drinking","is drink"], a:1},
  {level:"A1", q:"_____ you like music?", o:["Are","Do","Does","Have"], a:1},
  {level:"A1", q:"There _____ two books on the table.", o:["is","are","has","be"], a:1},
  {level:"A1", q:"I usually go to work _____ bus.", o:["on","with","by","at"], a:2},
  {level:"A1", q:"Look! The children _____ in the garden.", o:["play","plays","are playing","played"], a:2},

  // A2
  {level:"A2", q:"I _____ to the cinema last Saturday.", o:["go","went","have gone","am going"], a:1},
  {level:"A2", q:"We haven't got _____ milk.", o:["some","many","any","a"], a:2},
  {level:"A2", q:"This bag is _____ than that one.", o:["cheap","cheaper","cheapest","more cheap"], a:1},
  {level:"A2", q:"How long _____ in this city?", o:["do you live","are you live","have you lived","you live"], a:2},
  {level:"A2", q:"I'm tired because I _____ all morning.", o:["work","worked","have been working","am work"], a:2},
  {level:"A2", q:"Could you tell me _____ the station is?", o:["where","where is","is where","what"], a:0},
  {level:"A2", q:"We _____ visit our grandparents next weekend.", o:["are going to","going","have","did"], a:0},
  {level:"A2", q:"You _____ wear a seat belt in a car.", o:["must","might","could","would"], a:0},

  // B1
  {level:"B1", q:"If it rains tomorrow, we _____ at home.", o:["stay","stayed","will stay","would stay"], a:2},
  {level:"B1", q:"I used _____ football when I was younger.", o:["play","to play","playing","played"], a:1},
  {level:"B1", q:"She has worked here _____ 2021.", o:["for","since","during","from"], a:1},
  {level:"B1", q:"The meeting _____ before I arrived.", o:["has started","had started","starts","was start"], a:1},
  {level:"B1", q:"This book _____ by a famous journalist.", o:["wrote","was written","has writing","is wrote"], a:1},
  {level:"B1", q:"I don't enjoy _____ up early at weekends.", o:["get","to get","getting","got"], a:2},
  {level:"B1", q:"He said he _____ call me later.", o:["will","would","can","has"], a:1},
  {level:"B1", q:"The train was delayed, _____ we took a taxi.", o:["although","so","unless","because"], a:1},

  // B2
  {level:"B2", q:"If I _____ more time, I would take another course.", o:["have","had","would have","will have"], a:1},
  {level:"B2", q:"By next June, she _____ here for ten years.", o:["will work","will have worked","has worked","is working"], a:1},
  {level:"B2", q:"I'd rather you _____ me before making that decision.", o:["tell","told","have told","will tell"], a:1},
  {level:"B2", q:"The project was cancelled _____ a lack of funding.", o:["because","because of","although","despite"], a:1},
  {level:"B2", q:"He denied _____ the confidential document.", o:["to copy","copy","copying","copied"], a:2},
  {level:"B2", q:"The new policy is expected _____ next month.", o:["introducing","to introduce","to be introduced","being introduced"], a:2},
  {level:"B2", q:"She speaks English fluently, _____ she?", o:["doesn't","isn't","does","is"], a:0},
  {level:"B2", q:"We need to _____ a solution before Friday.", o:["come up with","come across","come into","come after"], a:0},

  // C1
  {level:"C1", q:"Had I known about the delay, I _____ earlier.", o:["would leave","would have left","will have left","had left"], a:1},
  {level:"C1", q:"The report, _____ was published yesterday, has attracted criticism.", o:["that","what","which","where"], a:2},
  {level:"C1", q:"The manager insisted that the figures _____ checked again.", o:["are","were","be","will be"], a:2},
  {level:"C1", q:"Rarely _____ such a dramatic change in policy.", o:["we see","do we see","we have seen","have we see"], a:1},
  {level:"C1", q:"The evidence is not sufficient to _____ the claim.", o:["substantiate","estimate","presume","retain"], a:0},
  {level:"C1", q:"Much _____ the proposal may seem attractive, it has serious drawbacks.", o:["although","as","despite","however"], a:1},
  {level:"C1", q:"She was _____ to agree to the terms without further discussion.", o:["reluctant","reluctance","reluctantly","relucted"], a:0},
  {level:"C1", q:"The company needs to _____ the risks before expanding overseas.", o:["assess","assure","assume","assert"], a:0}
];

const placementLevelInfo = {
  A1: {
    title:"Beginner",
    description:"You can handle familiar everyday words, simple sentences, basic questions, and common personal information. Focus next on building core vocabulary and confidence with everyday communication.",
    marker:10
  },
  A2: {
    title:"Elementary",
    description:"You can understand and produce common expressions and communicate in routine situations. Your next step is expanding grammar range, vocabulary, and longer conversations.",
    marker:30
  },
  B1: {
    title:"Intermediate",
    description:"You can deal with many everyday and familiar professional situations and express ideas in connected sentences. Work next on accuracy, range, and more complex structures.",
    marker:50
  },
  B2: {
    title:"Upper-Intermediate",
    description:"You can communicate with good independence and understand more complex language. Focus on precision, nuance, advanced vocabulary, and natural expression.",
    marker:70
  },
  C1: {
    title:"Advanced",
    description:"You can handle complex language with a high degree of independence. Continued work on nuance, style, collocation, and precision can help you reach very advanced proficiency.",
    marker:90
  }
};

let placementState = {
  index: 0,
  answers: new Array(placementQuestions.length).fill(null),
  active: false
};

function initPlacementTest() {
  const start = document.getElementById("startPlacementBtn");
  const next = document.getElementById("placementNextBtn");
  const prev = document.getElementById("placementPrevBtn");
  const retake = document.getElementById("placementRetakeBtn");
  const exit = document.getElementById("placementExitBtn");

  if (!start) return;

  start.addEventListener("click", startPlacementTest);
  next.addEventListener("click", nextPlacementQuestion);
  prev.addEventListener("click", previousPlacementQuestion);
  retake.addEventListener("click", startPlacementTest);
  exit.addEventListener("click", exitPlacementTest);

  document.getElementById("placementTotal").textContent = placementQuestions.length;
  renderPlacementQuestion();
}

function startPlacementTest() {
  placementState = {
    index: 0,
    answers: new Array(placementQuestions.length).fill(null),
    active: true
  };
  document.getElementById("placementStart").hidden = true;
  document.getElementById("placementResult").hidden = true;
  document.getElementById("placementQuiz").hidden = false;
  renderPlacementQuestion();
  document.getElementById("placement-test").scrollIntoView({behavior:"smooth", block:"start"});
}

function exitPlacementTest() {
  placementState.active = false;
  document.getElementById("placementQuiz").hidden = true;
  document.getElementById("placementResult").hidden = true;
  document.getElementById("placementStart").hidden = false;
}

function renderPlacementQuestion() {
  const item = placementQuestions[placementState.index];
  if (!item) return;

  document.getElementById("placementCurrent").textContent = placementState.index + 1;
  document.getElementById("placementDifficulty").textContent = item.level;
  document.getElementById("placementQuestion").textContent = item.q;

  const options = document.getElementById("placementOptions");
  options.innerHTML = "";

  item.o.forEach((option, i) => {
    const label = document.createElement("label");
    label.className = "placement-option" + (placementState.answers[placementState.index] === i ? " selected" : "");
    label.innerHTML = `
      <input type="radio" name="placement-answer" value="${i}" ${placementState.answers[placementState.index] === i ? "checked" : ""}>
      <span class="option-letter">${String.fromCharCode(65+i)}</span>
      <span class="option-text"></span>
    `;
    label.querySelector(".option-text").textContent = option;
    label.addEventListener("click", () => {
      placementState.answers[placementState.index] = i;
      options.querySelectorAll(".placement-option").forEach(el => el.classList.remove("selected"));
      label.classList.add("selected");
      updatePlacementNavigation();
    });
    options.appendChild(label);
  });

  const pct = ((placementState.index + 1) / placementQuestions.length) * 100;
  document.getElementById("placementProgressBar").style.width = pct + "%";
  updatePlacementNavigation();
}

function updatePlacementNavigation() {
  const prev = document.getElementById("placementPrevBtn");
  const next = document.getElementById("placementNextBtn");
  prev.disabled = placementState.index === 0;
  next.disabled = placementState.answers[placementState.index] === null;
  next.innerHTML = placementState.index === placementQuestions.length - 1
    ? 'Finish <i class="fa-solid fa-flag-checkered"></i>'
    : 'Next <i class="fa-solid fa-arrow-right"></i>';
}

function nextPlacementQuestion() {
  if (placementState.answers[placementState.index] === null) return;
  if (placementState.index < placementQuestions.length - 1) {
    placementState.index++;
    renderPlacementQuestion();
  } else {
    finishPlacementTest();
  }
}

function previousPlacementQuestion() {
  if (placementState.index > 0) {
    placementState.index--;
    renderPlacementQuestion();
  }
}

function finishPlacementTest() {
  const score = placementQuestions.reduce((sum, q, i) => sum + (placementState.answers[i] === q.a ? 1 : 0), 0);
  const accuracy = Math.round((score / placementQuestions.length) * 100);

  // Each band contains 8 questions. A conservative threshold avoids
  // assigning a higher level based on a handful of lucky answers.
  let level;
  if (score <= 10) level = "A1";
  else if (score <= 17) level = "A2";
  else if (score <= 24) level = "B1";
  else if (score <= 31) level = "B2";
  else level = "C1";

  const info = placementLevelInfo[level];
  document.getElementById("placementQuiz").hidden = true;
  document.getElementById("placementResult").hidden = false;
  document.getElementById("placementResultLevel").textContent = level;
  document.getElementById("placementResultTitle").textContent = info.title;
  document.getElementById("placementResultDescription").textContent = info.description;
  document.getElementById("placementScore").textContent = `${score} / ${placementQuestions.length}`;
  document.getElementById("placementAccuracy").textContent = `${accuracy}%`;
  document.getElementById("placementResultMarker").style.left = info.marker + "%";

  localStorage.setItem("learnlyPlacementResult", JSON.stringify({
    level, score, total: placementQuestions.length, accuracy, completedAt: new Date().toISOString()
  }));

  document.getElementById("placementResult").scrollIntoView({behavior:"smooth", block:"center"});
}

document.addEventListener("DOMContentLoaded", initPlacementTest);
