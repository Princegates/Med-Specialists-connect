(function () {
  var C = window.C, el = C.el;
  function buildNav() {
    var nav = document.getElementById('c-nav'); nav.textContent = '';
    C.nav.forEach(function (n) { if (!n.perm || C.can(n.perm)) nav.append(el('a', { href: '#/' + n.name, 'data-route': n.name, text: n.label })); });
  }
  document.getElementById('menu-btn').addEventListener('click', function () {
    var nav = document.getElementById('c-nav'), open = nav.classList.toggle('open'); this.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', C.render);
  Promise.all([C.api('me'), C.api('meta')]).then(function (r) {
    C.me = r[0].me; C.meta = r[1];
    document.getElementById('who').textContent = C.me.name + ' · ' + C.me.roleLabel;
    buildNav(); C.render();
  }).catch(function (e) {
    var msg = e.status === 401 ? 'Please sign in through Cloudflare Access to use the console.' : e.status === 403 ? e.message : e.status === 503 ? 'The console is not set up yet. Connect the database in Cloudflare, then reload.' : e.message;
    document.getElementById('view').replaceChildren(el('p', { class: 'c-error', role: 'alert', text: msg }));
  });
})();
