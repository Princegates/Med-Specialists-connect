// Shared helpers for the staff console: building elements safely, talking to the API, dialogs and formatting.
(function () {
  var C = window.C = { me: null, meta: null, routes: {}, nav: [] };

  // Builds an element. Text always goes in as text, never as HTML, so nothing a client typed can run as code.
  C.el = function (tag, props) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else if (['value', 'checked', 'selected', 'disabled', 'hidden', 'required'].indexOf(k) > -1) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    [].slice.call(arguments, 2).forEach(function add(c) {
      if (c === undefined || c === null || c === false) return;
      if (Array.isArray(c)) c.forEach(add); else e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  };
  var el = C.el;

  C.money = function (p) { return 'GH₵' + ((p || 0) / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  C.date = function (s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  C.dateTime = function (s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  C.label = function (s) { return String(s || '').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); };
  C.can = function (perm) { var p = (C.me && C.me.perms) || []; return p[0] === '*' || p.indexOf(perm) > -1; };

  var toastTimer;
  C.say = function (text, bad) {
    var t = document.getElementById('toast'); t.textContent = text; t.className = 'c-toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'c-toast'; }, bad ? 7000 : 3500);
  };

  C.api = function (path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch('/api/admin/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { location.replace('login.html'); }
        if (!r.ok || j.ok === false) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; e.code = j.code; throw e; }
        return j;
      });
    });
  };
  C.fail = function (e) { C.say(e.message || 'Something went wrong.', true); };

  // ---- form pieces
  var uid = 0;
  C.field = function (label, input, hint) {
    var id = 'f' + (++uid); input.id = id;
    return el('div', { class: 'c-field' }, el('label', { for: id, text: label }), input, hint ? el('p', { class: 'c-hint', text: hint }) : null);
  };
  C.input = function (type, value, extra) { return el('input', Object.assign({ type: type, value: value == null ? '' : value }, extra || {})); };
  C.select = function (options, value, extra) {
    return el('select', extra || {}, options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : C.label(o);
      return el('option', { value: v, text: t, selected: String(v) === String(value) });
    }));
  };
  C.textarea = function (value, extra) { var t = el('textarea', Object.assign({ rows: 3 }, extra || {})); t.value = value == null ? '' : value; return t; };
  C.check = function (label, checked) {
    var i = el('input', { type: 'checkbox', checked: !!checked }); var id = 'f' + (++uid); i.id = id;
    return { box: el('div', { class: 'c-check' }, i, el('label', { for: id, text: label })), input: i };
  };

  // ---- dialogs
  C.dialog = function (o) {
    var dlg = el('dialog', { 'aria-labelledby': 'dlg-t' });
    var err = el('p', { class: 'c-error', role: 'alert', hidden: true });
    var ok = el('button', { class: 'btn', type: 'submit', text: o.submit || 'Save' });
    var form = el('form', { method: 'dialog' }, el('h2', { id: 'dlg-t', text: o.title }), o.intro ? el('p', { class: 'c-hint', text: o.intro }) : null, o.body, err,
      el('div', { class: 'c-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancel', on: { click: function () { dlg.close(); } } }), ok));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true; ok.disabled = true;
      Promise.resolve(o.onSubmit()).then(function () { dlg.close(); }).catch(function (x) { err.textContent = x.message || 'Something went wrong.'; err.hidden = false; }).then(function () { ok.disabled = false; });
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.append(form); document.body.append(dlg); dlg.showModal();
    var first = dlg.querySelector('input,select,textarea'); if (first) first.focus();
    return dlg;
  };

  // ---- tables and tiles
  C.table = function (heads, rows, empty) {
    if (!rows.length) return el('p', { class: 'c-note', text: empty || 'Nothing to show.' });
    return el('div', { class: 'c-tablewrap' }, el('table', { class: 'c-table' },
      el('thead', {}, el('tr', {}, heads.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
      el('tbody', {}, rows.map(function (r) { return el('tr', { class: r.cls }, (r.cells || r).map(function (c) { return el('td', {}, c); })); }))));
  };
  C.tile = function (label, value, tone) { return el('div', { class: 'c-tile' + (tone ? ' ' + tone : '') }, el('div', { class: 'c-tile-n', text: String(value) }), el('div', { class: 'c-tile-l', text: label })); };
  C.tag = function (text, tone) { return el('span', { class: 'c-tag' + (tone ? ' ' + tone : ''), text: text }); };
  C.link = function (text, href) { return el('a', { href: href, text: text }); };
  C.h = function (text, level) { return el('h' + (level || 2), { text: text }); };
  C.section = function (title) { return el('section', { class: 'c-sec' }, el('h2', { text: title }), [].slice.call(arguments, 1)); };
  C.qs = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); };
  C.waLink = function (phone, text) { var d = String(phone || '').replace(/\D/g, ''); if (d.charAt(0) === '0') d = '233' + d.slice(1); return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text); };

  // Line editor used for invoices and service prices: description + amount in cedis.
  C.lineEditor = function (lines, opts) {
    var box = el('div', { class: 'c-lines' }), total = el('p', { class: 'c-total' });
    function sum() { var t = 0; box.querySelectorAll('.c-line').forEach(function (r) { var a = parseFloat(r.querySelectorAll('input')[1].value); if (a > 0) t += a; }); total.textContent = 'Total ' + C.money(Math.round(t * 100)); }
    function add(d, a) {
      var row = el('div', { class: 'c-line' },
        el('input', { type: 'text', 'aria-label': 'Description', maxlength: 120, placeholder: 'Description', value: d || '' }),
        el('input', { type: 'number', 'aria-label': 'Amount in cedis', min: '0', step: '0.01', placeholder: '0.00', inputmode: 'decimal', value: a ? (a / 100).toFixed(2) : '', on: { input: sum } }),
        el('button', { type: 'button', class: 'c-x', 'aria-label': 'Remove line', text: '×', on: { click: function () { row.remove(); sum(); } } }));
      box.append(row); sum();
    }
    (lines && lines.length ? lines : [{ description: '', amount: 0 }]).forEach(function (l) { add(l.description, l.amount); });
    var wrap = el('div', {}, box, el('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Add a line', on: { click: function () { add('', 0); } } }), (opts && opts.noTotal) ? null : total);
    wrap.read = function () { return [].map.call(box.querySelectorAll('.c-line'), function (r) { var i = r.querySelectorAll('input'); return { description: i[0].value.trim(), amountGhs: i[1].value === '' ? 0 : parseFloat(i[1].value) }; }).filter(function (l) { return l.description || l.amountGhs; }); };
    return wrap;
  };

  // ---- routing
  C.route = function (name, label, perm, fn, inNav) { C.routes[name] = { fn: fn, perm: perm, label: label }; if (inNav !== false) C.nav.push({ name: name, label: label, perm: perm }); };
  C.render = function () {
    var parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/'), name = parts[0].split('?')[0], id = parts[1] && decodeURIComponent(parts[1]);
    var r = C.routes[name]; var view = document.getElementById('view');
    if (!r || (r.perm && !C.can(r.perm))) { view.replaceChildren(el('p', { class: 'c-note', text: 'This page is not available to your role.' })); return; }
    document.querySelectorAll('.c-nav a').forEach(function (a) { a.setAttribute('aria-current', a.dataset.route === name ? 'page' : 'false'); });
    document.title = r.label + ' | Staff console';
    view.replaceChildren(el('p', { class: 'c-note', role: 'status', text: 'Loading…' }));
    document.getElementById('c-nav').classList.remove('open'); document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
    Promise.resolve(r.fn(id)).then(function (node) {
      view.replaceChildren(node); view.focus({ preventScroll: true });
    }).catch(function (e) { view.replaceChildren(el('p', { class: 'c-error', role: 'alert', text: e.message })); });
  };
})();
