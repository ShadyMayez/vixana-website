// Vixana accounts on the website: Sign in (Supabase Auth with Google), approve a command-line sign-in
// (login.html?cli=XXXX-XXXX), the account page, downloads that need the owner's approval (download.html?file=... or
// ?install=XXXX-XXXX) and the owner's list of requests (owner.html). The server side is deploy/accounts (a Supabase
// project); see docs/release/DOWNLOADS.md.
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
  var dlPage = $("#download-page");
  var ownPage = $("#owner-page");
  if (!login && !page && !dlPage && !ownPage) return;
  var error = $("#login-error") || $("#account-error") || $("#dl-error") || $("#own-error");
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
      else if (dlPage) downloadPage(session);
      else if (ownPage) ownerPage(session);
      else accountPage(session);
    });

    function signIn(button, query) {
      button.addEventListener("click", function () {
        say(error, "");
        var back = location.origin + location.pathname + query;
        client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } }).then(function (r) {
          if (r.error) say(error, r.error.message);
        });
      });
    }

    // the email a person sends the owner: Gmail in the browser, or their own mail app
    function ownerMail(ask, session, file) {
      var subject = "Vixana download approval: " + session.user.email;
      var text = "Hello,\n\nI would like to download Vixana (" + file + ").\n\nMy account: " + session.user.email +
        "\n\nApprove or refuse it here: " + ask.approve_url + "\n";
      $("#dl-gmail").href = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(ask.owner_email) +
        "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
      $("#dl-mailto").href = "mailto:" + ask.owner_email + "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(text);
    }

    // ---------------------------------------------------------------- download.html
    function downloadPage(session) {
      var params = new URLSearchParams(location.search);
      var code = (params.get("install") || "").toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 9);
      var file = (params.get("file") || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 120);
      var tag = (params.get("tag") || "").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 32);
      var query = code ? "?install=" + code : "?file=" + encodeURIComponent(file) + (tag ? "&tag=" + encodeURIComponent(tag) : "");
      if (params.has("code")) history.replaceState(null, "", location.pathname + query);
      if (!code && !file) { location.replace("./#download"); return; }
      var parts = ["#dl-signin", "#dl-ask", "#dl-sent", "#dl-denied", "#dl-ready", "#dl-allow"];
      function only(sel) { parts.forEach(function (p) { show($(p), p === sel); }); }
      show($("#dl-facts"), true);
      $("#dl-file").textContent = file || "the install command's file";
      if (code) { show($("#dl-code-row"), true); $("#dl-code").textContent = code; }
      if (!session) { only("#dl-signin"); signIn($("#dl-google"), query); return; }
      var timer = null;

      function state() {
        var path = code ? "/api/install/code?code=" + encodeURIComponent(code)
          : "/api/download/state?file=" + encodeURIComponent(file) + (tag ? "&tag=" + encodeURIComponent(tag) : "");
        return call(path).then(function (info) {
          if (code) {
            file = info.file;
            $("#dl-file").textContent = info.file;
            if (info.label) { show($("#dl-from-row"), true); $("#dl-from").textContent = info.label; }
            if (info.code_status !== "pending") { only(""); say($("#dl-done"), "This install was already answered."); return; }
          }
          clearTimeout(timer);
          if (info.status === "approved") only(code ? "#dl-allow" : "#dl-ready");
          else if (info.status === "pending") {
            only("#dl-sent");
            timer = setTimeout(state, 15000); // comes to life when the owner approves
          } else if (info.status === "denied") { only("#dl-ask"); show($("#dl-denied"), true); }
          else only("#dl-ask");
        }, function (err) { say(error, err.message); });
      }

      $("#dl-ask-btn").onclick = function () {
        $("#dl-ask-btn").disabled = true;
        var req = code ? call("/api/install/request", { method: "POST", body: { code: code } })
          : call("/api/download/request", { method: "POST", body: { file: file, tag: tag || "latest" } });
        req.then(function (ask) {
          if (ask.status === "approved") { state(); return; } // approved already: nothing to ask
          ownerMail(ask, session, file);
          only("#dl-sent");
          window.open($("#dl-gmail").href, "_blank", "noopener"); // straight to the email
          timer = setTimeout(state, 15000);
        }, function (err) { say(error, err.message); }).then(function () { $("#dl-ask-btn").disabled = false; });
      };
      $("#dl-get").onclick = function () {
        $("#dl-get").disabled = true;
        call("/api/download/get", { method: "POST", body: { file: file } }).then(function (got) {
          only("");
          say($("#dl-done"), "Your download has started. The next download needs a new approval.");
          location.href = got.url;
        }, function (err) { $("#dl-get").disabled = false; say(error, err.message); });
      };
      function decide(allow) {
        $("#dl-allow-btn").disabled = $("#dl-refuse-btn").disabled = true;
        call("/api/install/allow", { method: "POST", body: { code: code, allow: allow } }).then(function () {
          only("");
          say($("#dl-done"), allow ? "Done. Go back to your terminal: the install continues there."
            : "Refused. Nothing was installed.");
        }, function (err) { say(error, err.message); });
      }
      $("#dl-allow-btn").onclick = function () { decide(true); };
      $("#dl-refuse-btn").onclick = function () { decide(false); };
      // a request made before (pending) still needs its email links
      if (code) call("/api/install/code?code=" + encodeURIComponent(code)).then(function (i) { if (i.status === "pending") return call("/api/install/request", { method: "POST", body: { code: code } }).then(function (a) { ownerMail(a, session, i.file); }); }).catch(function () {});
      else call("/api/download/state?file=" + encodeURIComponent(file)).then(function (i) { if (i.status === "pending") return call("/api/download/request", { method: "POST", body: { file: file, tag: tag || "latest" } }).then(function (a) { ownerMail(a, session, file); }); }).catch(function () {});
      state();
    }

    // ---------------------------------------------------------------- owner.html
    function ownerPage(session) {
      var focus = new URLSearchParams(location.search).get("request") || "";
      if (!session) { show($("#own-signin"), true); signIn($("#own-google"), focus ? "?request=" + encodeURIComponent(focus) : ""); return; }
      var list = $("#own-list");
      function when(t) { return t ? new Date(t).toLocaleString() : ""; }
      function tell(r) {
        var ok = r.status === "approved";
        var subject = ok ? "Your Vixana download is approved" : "Your Vixana download request";
        var link = location.origin + location.pathname.replace(/owner\.html$/, "") + "download.html?file=" + encodeURIComponent(r.file);
        var text = ok ? "Hello " + (r.name || "") + ",\n\nYour request to download Vixana (" + r.file + ") is approved. Download it here: " +
          link + "\n\nThe approval is good for one download.\n" : "Hello " + (r.name || "") + ",\n\nYour request to download Vixana (" + r.file + ") was not approved.\n";
        return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(r.email) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
      }
      function draw(rows) {
        list.textContent = "";
        show($("#own-lede"), true);
        if (!rows.length) { var none = document.createElement("li"); none.textContent = "No requests yet."; list.appendChild(none); return; }
        rows.forEach(function (r) {
          var li = document.createElement("li");
          li.className = "request" + (r.id === focus ? " request-focus" : "");
          var who = document.createElement("div");
          who.className = "request-who";
          var name = document.createElement("strong");
          name.textContent = r.name || r.email;
          var mail = document.createElement("span");
          mail.textContent = r.email;
          who.appendChild(name);
          who.appendChild(mail);
          var what = document.createElement("div");
          what.className = "request-what";
          what.textContent = r.file + " · " + (r.via === "website" ? "website" : r.via) + " · " + when(r.created_at);
          var status = document.createElement("span");
          status.className = "request-status request-" + r.status;
          status.textContent = r.status;
          li.appendChild(who);
          li.appendChild(what);
          li.appendChild(status);
          var actions = document.createElement("div");
          actions.className = "auth-actions";
          if (r.status === "pending" || r.status === "denied") actions.appendChild(button("Approve", true, r));
          if (r.status === "pending" || r.status === "approved") actions.appendChild(button("Refuse", false, r));
          if (r.status === "approved" || r.status === "denied") {
            var t = document.createElement("a");
            t.className = "btn btn-ghost";
            t.target = "_blank";
            t.rel = "noopener";
            t.href = tell(r);
            t.textContent = "Email " + (r.name ? r.name.split(" ")[0] : "them");
            actions.appendChild(t);
          }
          if (actions.children.length) li.appendChild(actions);
          list.appendChild(li);
        });
        var f = list.querySelector(".request-focus");
        if (f) f.scrollIntoView({ block: "center" });
      }
      function button(label, approve, r) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = approve ? "btn" : "btn btn-ghost";
        b.textContent = label;
        b.onclick = function () {
          b.disabled = true;
          call("/api/owner/decide", { method: "POST", body: { id: r.id, approve: approve } }).then(function (got) {
            load();
            window.open(tell(got.request), "_blank", "noopener"); // tell them from your own Gmail
          }, function (err) { b.disabled = false; say(error, err.message); });
        };
        return b;
      }
      function load() {
        call("/api/owner/requests").then(function (got) { draw(got.requests); }, function (err) { say(error, err.message); });
      }
      load();
    }

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
