// Vixana website: install commands that point at wherever this site is served, the download button for the
// visitor's system, the terminal tabs and the copy buttons. Works without this script too (links still go to the
// right sections).
(function () {
  "use strict";

  // Where the install scripts live: this site when it is served over http(s), else the public address.
  var PUBLIC_SITE = "https://vixana.is-a.dev";
  var REPO = "https://github.com/ShadyMayez/vixana-v6";
  // the folder this page is served from, so a site under a path (user.github.io/vixana-website/) works too
  var site = /^https?:$/.test(location.protocol)
    ? (location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/$/, "")
    : PUBLIC_SITE;

  var commands = {
    unix: "curl -fsSL " + site + "/install.sh | sh",
    win: "irm " + site + "/install.ps1 | iex",
  };
  document.querySelectorAll("[data-cmd]").forEach(function (el) {
    el.textContent = commands[el.getAttribute("data-cmd")];
  });
  document.querySelectorAll("[data-repo]").forEach(function (a) { a.href = REPO; });
  document.querySelectorAll("[data-release]").forEach(function (a) { a.href = REPO + "/releases/latest"; });
  document.querySelectorAll("[data-repo-path]").forEach(function (a) {
    a.href = REPO + "/blob/main/" + a.getAttribute("data-repo-path");
  });

  // The hero's download button names the visitor's system.
  var ua = navigator.userAgent;
  var os = /Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) && !/Mobile/i.test(ua) ? "mac"
    : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "other";
  var primary = document.getElementById("primary-download");
  if (primary) {
    if (os === "windows") { primary.textContent = "Download for Windows"; primary.href = "#windows"; }
    else if (os === "linux") { primary.textContent = "Download for Linux"; primary.href = "#linux"; }
    else if (os === "mac") { primary.textContent = "Install on macOS"; primary.href = "#terminal"; }
  }

  // Terminal tabs (arrow keys move between them, as a tab list should).
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(t); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
  if (os === "windows") select(document.getElementById("tab-win"));

  // Copy buttons say "Copied" for a moment, so it is clear something happened.
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = commands[btn.getAttribute("data-copy")];
      var done = function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      };
      // Without clipboard access: select the command so one key press copies it.
      var selectIt = function () {
        var range = document.createRange();
        range.selectNodeContents(btn.previousElementSibling);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = /Mac/i.test(navigator.platform) ? "Press ⌘C" : "Press Ctrl+C";
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, selectIt);
      } else {
        selectIt();
      }
    });
  });
})();
