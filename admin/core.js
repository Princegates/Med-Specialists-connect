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

  // ---- icons (simple 24px outline icons) and small chart helpers
  var ICONS = {
    home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z', cases: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    tasks: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75', pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
    invoice: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', card: 'M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M1 10h22',
    chart: 'M12 20V10 M18 20V4 M6 20v-4', tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01', sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01', user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9', menu: 'M3 12h18 M3 6h18 M3 18h18',
    alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
    money: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z', plus: 'M12 5v14 M5 12h14', chevl: 'M15 18l-6-6 6-6', chevr: 'M9 18l6-6-6-6'
  };
  C.icon = function (name, size) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size || 20); svg.setAttribute('height', size || 20); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    (ICONS[name] || '').split(' M').forEach(function (d, i) { var p = document.createElementNS(ns, 'path'); p.setAttribute('d', (i ? 'M' : '') + d); svg.appendChild(p); });
    return svg;
  };
  C.initials = function (name) { var p = String(name || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  C.avatar = function (name) { return el('span', { class: 'c-avatar', 'aria-hidden': 'true', text: C.initials(name) }); };

  // Horizontal bars: label, bar, value. Readable without the bar (values are text).
  C.bars = function (rows, o) {
    o = o || {}; var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    if (!rows.length || !rows.some(function (r) { return r.value > 0; })) return el('p', { class: 'c-note', text: o.empty || 'Nothing to show yet.' });
    return el('ul', { class: 'c-bars' }, rows.map(function (r) {
      return el('li', {}, el('span', { class: 'c-bar-l', text: r.label }), el('span', { class: 'c-bar-t', 'aria-hidden': 'true' }, el('span', { class: 'c-bar-f', style: 'width:' + Math.max(2, Math.round(r.value / max * 100)) + '%' })), el('span', { class: 'c-bar-v', text: o.format ? o.format(r.value) : String(r.value) }));
    }));
  };
  // Vertical columns, one per month.
  C.columns = function (rows, o) {
    o = o || {}; var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return el('ul', { class: 'c-cols-chart' }, rows.map(function (r) {
      var mon = new Date(r.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
      return el('li', {}, el('span', { class: 'c-col-v', text: o.format ? o.format(r.value) : String(r.value) }), el('span', { class: 'c-col-t', 'aria-hidden': 'true' }, el('span', { class: 'c-col-f', style: 'height:' + (r.value ? Math.max(4, Math.round(r.value / max * 100)) : 0) + '%' })), el('span', { class: 'c-col-l', text: mon }));
    }));
  };
  C.card = function (title, body, action) { return el('section', { class: 'c-panel' }, el('header', {}, el('h2', { text: title }), action || null), body); };
  C.pageHead = function (title, sub, actions) { return el('div', { class: 'c-pagehead' }, el('div', {}, el('h1', { text: title }), sub ? el('p', { class: 'c-sub', text: sub }) : null), actions ? el('div', { class: 'c-actions' }, actions) : null); };

  // ---- routing
  C.route = function (name, label, perm, fn, inNav, group, icon) { C.routes[name] = { fn: fn, perm: perm, label: label }; if (inNav !== false) C.nav.push({ name: name, label: label, perm: perm, group: group, icon: icon }); };
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
