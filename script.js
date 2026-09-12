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