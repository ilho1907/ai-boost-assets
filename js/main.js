/* =========================================================
   ilhova — Interaktionen, Animationen & Login
   ========================================================= */
(function () {
  "use strict";

  /* ---- Jahr im Footer ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Sticky-Nav Zustand ---- */
  var nav = document.getElementById("nav");
  function onScroll() {
    if (window.scrollY > 40) nav.classList.add("is-scrolled");
    else nav.classList.remove("is-scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile-Menü ---- */
  var burger = document.getElementById("navBurger");
  var navLinks = document.getElementById("navLinks");
  if (burger) {
    burger.addEventListener("click", function () {
      navLinks.classList.toggle("is-open");
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("is-open");
      });
    });
  }

  /* ---- Reveal beim Scrollen ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---- Zahlen hochzählen ---- */
  var counters = document.querySelectorAll("[data-count]");
  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var dur = 1600, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target).toLocaleString("de-DE");
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString("de-DE") + (target >= 100 ? "+" : "");
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { animateCount(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* =========================================================
     AUTH MODAL
     ========================================================= */
  var modal = document.getElementById("authModal");
  var tabs = modal.querySelectorAll(".auth__tab, [data-tab]");
  var forms = modal.querySelectorAll(".auth__form");
  var tabButtons = modal.querySelectorAll(".auth__tab");

  function setTab(name) {
    tabButtons.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
    });
    forms.forEach(function (f) {
      f.classList.toggle("is-active", f.getAttribute("data-form") === name);
    });
  }

  function openAuth(name) {
    setTab(name || "login");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeAuth() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-open-auth]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      openAuth(btn.getAttribute("data-open-auth"));
    });
  });
  modal.querySelectorAll("[data-close-auth]").forEach(function (el) {
    el.addEventListener("click", closeAuth);
  });
  tabs.forEach(function (t) {
    if (t.hasAttribute("data-tab")) {
      t.addEventListener("click", function () { setTab(t.getAttribute("data-tab")); });
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeAuth();
  });

  /* ---- Formular-Demo (Frontend) ---- */
  function flash(form, msg, ok) {
    var el = form.querySelector(".auth__msg");
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? "#5a8a5a" : "#b5793f";
  }

  modal.querySelectorAll(".auth__form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { flash(form, "Bitte fülle alle Felder aus.", false); return; }
      var btn = form.querySelector("button[type=submit]");
      var original = btn.textContent;
      btn.textContent = "Einen Moment …";
      btn.disabled = true;
      setTimeout(function () {
        var name = (form.querySelector("[name=name]") || {}).value || "willkommen";
        flash(form, "❀ Schön, dass du da bist, " + name + "! (Demo)", true);
        btn.textContent = original;
        btn.disabled = false;
        form.reset();
      }, 1100);
    });
  });

  /* ---- Newsletter ---- */
  var nlForm = document.getElementById("newsletterForm");
  if (nlForm) {
    nlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = document.getElementById("newsletterMsg");
      if (!nlForm.checkValidity()) { msg.textContent = "Bitte trage Name und E-Mail ein."; return; }
      msg.textContent = "❀ Danke! Dein Brief ist auf dem Weg zu dir.";
      nlForm.reset();
    });
  }
})();
