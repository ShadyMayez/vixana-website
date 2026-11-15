// Vixana accounts on the website: Sign in (Supabase Auth with Google), approve a command-line sign-in
// (login.html?cli=XXXX-XXXX), and the account page. The server side is deploy/accounts (a Supabase project).
(function () {
  "use strict";

  // The Supabase project (vixana-accounts). The anon key is public by design: row level security protects the data,
  // and the account tables are not reachable with it at all. Empty values hide the Sign in links.
  var SUPABASE_URL = "https://atwozbhkjbuvqzdbpgam.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d296YmhramJ1dnF6ZGJwZ2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NjYwMTMsImV4cCI6MjExMDM0MjAxM30.FyEVcJiDWowRhhc4F0_OiS7wJWgUkqOx_lg---9ybFw";
  var API = SUPABASE_URL ? SUPABASE_URL + "/functions/v1/accounts" : "";
  var SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  var STORAGE_KEY = SUPABASE_URL ? "sb-" + SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0] + "-auth-token" : "";

  function $(sel) { return document.querySelector(sel); }
  function show(el, on) { if (el) el.hidden = !on; }
  function say(el, text) { if (el) { el.textContent = text; el.hidden = !text; } }

  function hasSession() {
    try { return !!(STORAGE_KEY && localStorage.getItem(STORAGE_KEY)); } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ every page: the bar's account link
  document.querySelectorAll("[data-account-link]").forEach(function (a) {
    if (!API) return; // not live yet
    a.hidden = false;
    if (hasSession()) { a.textContent = "Account"; a.href = "account.html"; }
  });

  var login = $("#login");
  var page = $("#account");
  if (!login && !page) return;
  var error = $("#login-error") || $("#account-error");
  if (!API) { say(error, "Sign-in opens soon."); return; }

  // the sign-in pages load Supabase's client (pinned version)
  var script = document.createElement("script");
  script.src = SUPABASE_JS;
  script.onload = start;
  script.onerror = function () { say(error, "Could not load the sign-in. Check your connection or ad blocker."); };
  document.head.appendChild(script);

  function start() {
    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
    });

    function call(path, opts) {
      opts = opts || {};
      return client.auth.getSession().then(function (got) {
        var s = got.data.session;
        var headers = {};
        if (s) headers.authorization = "Bearer " + s.access_token;
        if (opts.body) headers["content-type"] = "application/json";
        return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "The accounts server answered " + res.status + ".");
          return data;
        });
      }, function (err) {
        throw new Error(err && err.message ? err.message : "Cannot reach the Vixana accounts server.");
      });
    }

    client.auth.getSession().then(function (got) {
      var session = got.data.session;
      if (login) loginPage(session);
      else accountPage(session);
    });

    // ---------------------------------------------------------------- login.html
    function loginPage(session) {
      var params = new URLSearchParams(location.search);
      var code = (params.get("cli") || "").toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 9);
      // drop Supabase's one-time ?code= from the address bar once it has been used
      if (params.has("code")) history.replaceState(null, "", location.pathname + (code ? "?cli=" + code : ""));
      if (!session) {
        show($("#signin"), true);
        if (code) say($("#signin-why"), "Sign in to link the command line to your account. Your code is " + code + ".");
        $("#google").addEventListener("click", function () {
          say(error, "");
          var back = location.origin + location.pathname + (code ? "?cli=" + code : "");
          client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } }).then(function (r) {
            if (r.error) say(error, r.error.message);
          });
        });
        return;
      }
      if (!code) { location.replace("account.html"); return; }
      // a command-line sign-in waits for this person to allow it
      call("/api/cli/code?code=" + encodeURIComponent(code)).then(function (info) {
        show($("#approve"), true);
        $("#approve-code").textContent = info.code;
        $("#approve-label").textContent = info.label || "Vixana command line";
        $("#approve-user").textContent = session.user.email;
        $("#allow").onclick = function () { decide(true); };
        $("#deny").onclick = function () { decide(false); };
      }, function (err) { say(error, err.message); });

      function decide(allow) {
        $("#allow").disabled = $("#deny").disabled = true;
        call("/api/cli/approve", { method: "POST", body: { code: code, allow: allow } }).then(function () {
          show($("#approve"), false);
          say($("#login-done"), allow
            ? "Done. Go back to your terminal: Vixana is signed in as " + session.user.email + "."
            : "Refused. The command line was not signed in.");
        }, function (err) { say(error, err.message); });
      }
    }

    // ---------------------------------------------------------------- account.html
    function accountPage(session) {
      if (!session) { location.replace("login.html"); return; }
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
      }, function (err) { say(error, err.message); });
      $("#signout").addEventListener("click", function () {
        client.auth.signOut().then(function () { location.replace("index.html"); });
      });
    }
  }
})();
