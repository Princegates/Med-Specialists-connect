(function () {
  var C = window.C, el = C.el;
  function buildNav(limited) {
    var nav = document.getElementById('c-nav'); nav.textContent = '';
    if (limited) { nav.append(el('a', { href: '#/account', 'data-route': 'account', text: 'My account' })); return; }
    C.nav.forEach(function (n) { if (!n.perm || C.can(n.perm)) nav.append(el('a', { href: '#/' + n.name, 'data-route': n.name, text: n.label })); });
    nav.append(el('a', { href: '#/account', 'data-route': 'account', text: 'My account' }));
  }
  document.getElementById('menu-btn').addEventListener('click', function () {
    var nav = document.getElementById('c-nav'), open = nav.classList.toggle('open'); this.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('signout').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(function () { location.replace('login.html'); });
  });
  window.addEventListener('hashchange', C.render);
  C.api('me').then(function (r) {
    C.me = r.me;
    document.getElementById('who').textContent = C.me.name + ' · ' + C.me.roleLabel;
    // Someone who must change their password or set up their authenticator app can only reach My account until they do.
    C.limited = C.me.mustChange || (C.me.mfaRequired && !C.me.mfaEnabled);
    if (C.limited) { C.meta = {}; buildNav(true); location.hash = '#/account'; C.render(); return; }
    return C.api('meta').then(function (m) { C.meta = m; buildNav(false); C.render(); });
  }).catch(function (e) {
    if (e.status === 401) return;
    document.getElementById('view').replaceChildren(el('p', { class: 'c-error', role: 'alert', text: e.status === 503 ? 'The console is not set up yet. Connect the database in Cloudflare, then reload.' : e.message }));
  });
})();
