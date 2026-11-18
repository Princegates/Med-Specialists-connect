(function () {
  var C = window.C, el = C.el, $ = function (i) { return document.getElementById(i); };
  var NAV = {
    dashboard: ['Work', 'home'], cases: ['Work', 'cases'], tasks: ['Work', 'tasks'], calendar: ['Work', 'calendar'],
    clients: ['People', 'users'], providers: ['People', 'pulse'],
    invoices: ['Money', 'invoice'], accounts: ['Money', 'card'], reports: ['Money', 'chart'],
    services: ['Set-up', 'tag'], settings: ['Set-up', 'sliders'], staff: ['Set-up', 'shield'], audit: ['Set-up', 'list'], account: ['You', 'user']
  };
  function link(n, label) { return el('a', { href: '#/' + n, 'data-route': n }, C.icon(NAV[n][1]), el('span', { text: label })); }
  function buildNav(limited) {
    var nav = $('c-nav'); nav.textContent = '';
    if (limited) { nav.append(link('account', 'My account')); }
    else {
      var groups = {}, order = [];
      C.nav.forEach(function (n) { if (n.name === 'account' || !NAV[n.name] || (n.perm && !C.can(n.perm))) return; var g = NAV[n.name][0]; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(n); });
      order.forEach(function (g) { nav.append(el('p', { class: 'c-nav-h', text: g })); groups[g].forEach(function (n) { nav.append(link(n.name, n.label)); }); });
      nav.append(el('p', { class: 'c-nav-h', text: 'You' }), link('account', 'My account'));
    }
    nav.append(el('button', { class: 'c-nav-out', type: 'button', id: 'signout' }, C.icon('logout'), el('span', { text: 'Sign out' })));
    $('signout').addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(function () { location.replace('login.html'); });
    });
  }

  // chrome: icons, menu, theme
  $('menu-btn').append(C.icon('menu')); $('search-ic').append(C.icon('search', 18));
  $('menu-btn').addEventListener('click', function () { var nav = $('c-nav'), open = nav.classList.toggle('open'); this.setAttribute('aria-expanded', String(open)); });
  var root = document.documentElement, themeBtn = $('theme-btn');
  function dark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function syncTheme() { themeBtn.replaceChildren(C.icon(dark() ? 'sun' : 'moon')); themeBtn.setAttribute('aria-label', dark() ? 'Switch to day mode' : 'Switch to night mode'); }
  themeBtn.addEventListener('click', function () { var next = dark() ? 'light' : 'dark'; root.setAttribute('data-theme', next); try { localStorage.setItem('theme', next); } catch (e) {} syncTheme(); });
  syncTheme();

  // global search
  var box = $('gsearch'), results = $('gresults'), timer;
  function closeResults() { results.hidden = true; }
  function group(title, rows, href, text) { if (!rows.length) return null; return el('div', {}, el('p', { class: 'c-res-h', text: title }), el('ul', {}, rows.map(function (r) { return el('li', {}, el('a', { href: href(r), on: { click: closeResults } }, el('span', { text: text(r)[0] }), el('small', { text: text(r)[1] }))); }))); }
  box.addEventListener('input', function () {
    clearTimeout(timer); var q = box.value.trim();
    if (q.length < 2) { closeResults(); return; }
    timer = setTimeout(function () {
      C.api('search?q=' + encodeURIComponent(q)).then(function (r) {
        var parts = [group('Cases', r.cases, function (x) { return '#/cases/' + x.id; }, function (x) { return [x.name + ' · ' + (x.service || ''), x.ref + ' · ' + C.label(x.status)]; }),
          group('Clients', r.clients, function (x) { return '#/clients/' + x.id; }, function (x) { return [x.name, x.phone]; }),
          group('Providers', r.providers, function (x) { return '#/providers/' + x.id; }, function (x) { return [x.name, [x.specialty, C.label(x.verification)].filter(Boolean).join(' · ')]; })].filter(Boolean);
        results.replaceChildren.apply(results, parts.length ? parts : [el('p', { class: 'c-note', text: 'No matches.' })]); results.hidden = false;
      }).catch(function () {});
    }, 250);
  });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeResults(); box.blur(); } });
  document.addEventListener('click', function (e) { if (!e.target.closest('.c-search')) closeResults(); });
  window.addEventListener('hashchange', function () { closeResults(); box.value = ''; });

  window.addEventListener('hashchange', C.render);
  C.api('me').then(function (r) {
    C.me = r.me;
    // Automatic log-off after a period with no use, so patient records are not left open on an unattended screen.
    (function (mins) {
      var t, ms = (mins || 20) * 60000;
      function out() { fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {}).then(function () { location.replace('login.html?idle=1'); }); }
      function reset() { clearTimeout(t); t = setTimeout(out, ms); }
      ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, reset, { passive: true }); });
      reset();
    })(r.idleMinutes);
    $('who').textContent = C.me.name + ' · ' + C.me.roleLabel; $('who-av').replaceChildren(C.avatar(C.me.name));
    // Someone who must change their password or set up their authenticator app can only reach My account until they do.
    C.limited = C.me.mustChange || (C.me.mfaRequired && !C.me.mfaEnabled);
    if (C.limited) { C.meta = {}; buildNav(true); $('gsearch').disabled = true; location.hash = '#/account'; C.render(); return; }
    return C.api('meta').then(function (m) { C.meta = m; buildNav(false); C.render(); });
  }).catch(function (e) {
    if (e.status === 401) return;
    $('view').replaceChildren(el('p', { class: 'c-error', role: 'alert', text: e.status === 503 ? 'The console is not set up yet. Connect the database in Cloudflare, then reload.' : e.message }));
  });
})();
