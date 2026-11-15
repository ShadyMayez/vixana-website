// Vixana accounts on the website: Sign in (Google), approve a command-line sign-in (login.html?code=…), and the
// account page. The accounts server is deploy/accounts (a Cloudflare Worker); this file only talks to its /api.
(function () {
  "use strict";

  // Where the accounts server is. Empty until it is deployed: the Sign in links then stay hidden.
  var ACCOUNTS_API = "";
  var local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var API = (local ? "http://127.0.0.1:8787" : ACCOUNTS_API).replace(/\/$/, "");
  var KEY = "vixana.session";

  function stored() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function store(session) {
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch (e) { /* private window: the session lasts this page only */ }
  }
  var memory = stored();
  function session() {
    return memory && memory.expires_at * 1000 > Date.now() ? memory : null;
  }

  function call(path, opts) {
    opts = opts || {};
    var headers = {};
    var s = session();
    if (s) headers.authorization = "Bearer " + s.token;
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401 && s) { memory = null; store(null); }
          if (!res.ok) throw new Error(data.error || "The accounts server answered " + res.status + ".");
          return data;
        });
      }, function () { throw new Error("Cannot reach the Vixana accounts server. Check your connection and try again."); });
  }

  function signedIn(data) {
    memory = { token: data.token, expires_at: data.expires_at, user: data.user };
    store(memory);
  }

  function $(sel) { return document.querySelector(sel); }
  function show(el, on) { if (el) el.hidden = !on; }
  function say(el, text) { if (el) { el.textContent = text; el.hidden = !text; } }

  // ------------------------------------------------------------------ every page: the bar's account link
  document.querySelectorAll("[data-account-link]").forEach(function (a) {
    if (!API) return; // not live yet
    a.hidden = false;
    var s = session();
    if (s) { a.textContent = "Account"; a.href = "account.html"; }
  });

  // ------------------------------------------------------------------ login.html
  var login = $("#login");
  if (login) {
    var code = (new URLSearchParams(location.search).get("code") || "").toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 9);
    var error = $("#login-error");
    if (!API) {
      say(error, "Sign-in opens soon.");
    } else if (session()) {
      afterSignIn();
    } else {
      startSignIn();
    }

    function startSignIn() {
      show($("#signin"), true);
      if (code) say($("#signin-why"), "Sign in to link the command line to your account. Your code is " + code + ".");
      call("/api/config").then(function (config) {
        if (config.dev_signin) {
          var form = $("#dev-signin");
          show(form, true);
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            call("/api/dev/session", { method: "POST", body: { email: form.email.value } })
              .then(function (data) { signedIn(data); afterSignIn(); }, function (err) { say(error, err.message); });
          });
        }
        if (config.google_client_id) googleButton(config.google_client_id);
        else if (!config.dev_signin) say(error, "Google sign-in is not set up on the server yet.");
      }, function (err) { say(error, err.message); });
    }

    function googleButton(clientId) {
      var script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = function () {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: function (answer) {
            say(error, "");
            call("/api/session", { method: "POST", body: { credential: answer.credential } })
              .then(function (data) { signedIn(data); afterSignIn(); }, function (err) { say(error, err.message); });
          },
        });
        window.google.accounts.id.renderButton($("#google-button"), {
          theme: "filled_black", size: "large", shape: "rectangular", text: "signin_with", width: 300,
        });
      };
      script.onerror = function () { say(error, "Could not load Google sign-in. Check your connection or ad blocker."); };
      document.head.appendChild(script);
    }

    function afterSignIn() {
      show($("#signin"), false);
      if (!code) { location.replace("account.html"); return; }
      // a command-line sign-in waits for this person to allow it
      call("/api/cli/code?code=" + encodeURIComponent(code)).then(function (info) {
        show($("#approve"), true);
        $("#approve-code").textContent = info.code;
        $("#approve-label").textContent = info.label || "Vixana command line";
        $("#approve-user").textContent = session().user.email;
        $("#allow").onclick = function () { decide(true); };
        $("#deny").onclick = function () { decide(false); };
      }, function (err) { say(error, err.message); });
    }

    function decide(allow) {
      $("#allow").disabled = $("#deny").disabled = true;
      call("/api/cli/approve", { method: "POST", body: { code: code, allow: allow } }).then(function () {
        show($("#approve"), false);
        say($("#login-done"), allow
          ? "Done. Go back to your terminal: Vixana is signed in as " + session().user.email + "."
          : "Refused. The command line was not signed in.");
      }, function (err) { say(error, err.message); });
    }
  }

  // ------------------------------------------------------------------ account.html
  var page = $("#account");
  if (page) {
    if (!API || !session()) { location.replace("login.html"); return; }
    call("/api/me").then(function (me) {
      show($("#account-body"), true);
      $("#account-name").textContent = me.user.name;
      $("#account-email").textContent = me.user.email;
      var pic = $("#account-picture");
      if (me.user.picture) { pic.src = me.user.picture; pic.hidden = false; }
      var list = $("#account-apps");
      list.textContent = "";
      if (!me.apps.length) {
        var none = document.createElement("li");
        none.textContent = "None yet. Run vixana login in a terminal to link one.";
        list.appendChild(none);
      }
      me.apps.forEach(function (app) {
        var li = document.createElement("li");
        var name = document.createElement("strong");
        name.textContent = app.label || "Vixana command line";
        var when = document.createElement("span");
        when.textContent = "linked " + new Date(app.created_at * 1000).toLocaleDateString();
        li.appendChild(name);
        li.appendChild(when);
        list.appendChild(li);
      });
    }, function () { location.replace("login.html"); });
    $("#signout").addEventListener("click", function () {
      call("/api/logout", { method: "POST" }).catch(function () {}).then(function () {
        memory = null;
        store(null);
        location.replace("index.html");
      });
    });
  }
})();
