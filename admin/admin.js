(function () {
  var $ = function (i) { return document.getElementById(i); };
  var state = { requests: [], services: {}, flags: {} };
  var rows = $('rows'), msg = $('msg');

  function el(tag, props) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') e.textContent = props[k]; else if (k === 'class') e.className = props[k]; else e.setAttribute(k, props[k]); });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  }
  function money(p) { return 'GH₵' + (p / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function say(text, bad) { msg.textContent = text || ''; msg.className = 'adm-msg' + (bad ? ' err' : ''); }
  function api(path, body) {
    var opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch('/api/admin/' + path, opts).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || 'Something went wrong.'); return j; }); });
  }
  function waLink(phone, text) {
    var d = String(phone).replace(/\D/g, '');
    if (d.charAt(0) === '0') d = '233' + d.slice(1);
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text);
  }
  var STATUS = { received: 'Received', awaiting_quote: 'Awaiting quote', invoiced: 'Invoiced', paid: 'Paid', scheduled: 'Scheduled', closed: 'Closed' };

  function render() {
    var f = $('filter').value;
    var list = state.requests.filter(function (r) { return !f || (f === 'open' ? (r.status === 'received' || r.status === 'awaiting_quote') : r.status === f); });
    rows.textContent = '';
    if (!list.length) { rows.appendChild(el('tr', {}, el('td', { colspan: 6, text: 'No requests to show.' }))); return; }
    list.forEach(function (r) {
      var tr = el('tr', { class: /^Urgent/.test(r.urgency || '') ? 'urgent' : '' });
      var when = new Date(r.created_at);
      tr.appendChild(el('td', {}, el('div', { text: when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }), el('div', { class: 'adm-small', text: when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })));
      var svc = (state.services[r.service] || {}).label || r.service;
      var sTd = el('td', {}, el('div', { text: svc }), el('div', { class: 'adm-small', text: [r.urgency, r.preferred_date ? 'wants ' + r.preferred_date : '', r.for_whom].filter(Boolean).join(' · ') }));
      if (r.message) sTd.appendChild(el('div', { class: 'adm-small', text: r.message }));
      tr.appendChild(sTd);
      tr.appendChild(el('td', {}, el('div', { text: r.name }), el('div', { class: 'adm-small', text: [r.phone, r.email, r.area, r.call_time].filter(Boolean).join(' · ') })));

      var sel = el('select', { 'aria-label': 'Status for ' + r.name });
      Object.keys(STATUS).forEach(function (k) { var o = el('option', { value: k, text: STATUS[k] }); if (k === r.status) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { api('request-status', { requestId: r.id, status: sel.value }).then(function () { r.status = sel.value; say('Status updated.'); }).catch(function (e) { say(e.message, true); load(); }); });
      tr.appendChild(el('td', {}, sel));

      var invTd = el('td');
      var acts = el('div', { class: 'adm-actions' });
      if (r.invoice_id) {
        invTd.appendChild(el('div', { text: r.invoice_number + ' · ' + money(r.invoice_total) }));
        invTd.appendChild(el('span', { class: 'tag ' + r.invoice_status, text: r.invoice_status === 'paid' ? 'Paid' : 'Payment due' }));
        var link = location.origin + '/invoice?id=' + r.invoice_id;
        var copy = el('button', { type: 'button', text: 'Copy link' });
        copy.addEventListener('click', function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { say('Invoice link copied.'); }).catch(function () { say(link); }); });
        acts.appendChild(copy);
        acts.appendChild(el('a', { href: waLink(r.phone, 'Hello ' + r.name + ', your MEDs Specialists Connect invoice ' + r.invoice_number + ' (' + money(r.invoice_total) + '): ' + link), target: '_blank', rel: 'noopener', text: 'WhatsApp' }));
        if (r.invoice_status === 'issued') {
          var paid = el('button', { type: 'button', text: 'Mark paid' });
          paid.addEventListener('click', function () { var ref = prompt('Payment reference (for example the bank or Mobile Money reference):', ''); if (ref === null) return; api('invoice-status', { invoiceId: r.invoice_id, status: 'paid', reference: ref }).then(load).catch(function (e) { say(e.message, true); }); });
          var vd = el('button', { type: 'button', class: 'danger', text: 'Void' });
          vd.addEventListener('click', function () { if (confirm('Void invoice ' + r.invoice_number + '? This cannot be undone.')) api('invoice-status', { invoiceId: r.invoice_id, status: 'void' }).then(load).catch(function (e) { say(e.message, true); }); });
          acts.appendChild(paid); acts.appendChild(vd);
        }
      } else {
        invTd.appendChild(el('span', { class: 'adm-small', text: 'None yet' }));
        var mk = el('button', { type: 'button', text: 'Create invoice' });
        mk.addEventListener('click', function () { openDialog(r); });
        acts.appendChild(mk);
      }
      tr.appendChild(invTd);
      tr.appendChild(el('td', {}, acts));
      rows.appendChild(tr);
    });
  }

  // ----- invoice dialog
  var dlg = $('dlg'), linesBox = $('dlg-lines'), current = null;
  function lineRow(desc, amt) {
    var row = el('div', { class: 'line-row' });
    var d = el('input', { type: 'text', 'aria-label': 'Description', maxlength: 120, placeholder: 'Description' }); d.value = desc || '';
    var a = el('input', { type: 'number', 'aria-label': 'Amount in cedis', min: '0', step: '0.01', placeholder: '0.00', inputmode: 'decimal' }); a.value = amt ? (amt / 100).toFixed(2) : '';
    var x = el('button', { type: 'button', 'aria-label': 'Remove line', text: '×' });
    x.addEventListener('click', function () { row.remove(); total(); });
    a.addEventListener('input', total);
    row.appendChild(d); row.appendChild(a); row.appendChild(x);
    linesBox.appendChild(row);
  }
  function lines() {
    return Array.prototype.map.call(linesBox.querySelectorAll('.line-row'), function (r) { var i = r.querySelectorAll('input'); return { description: i[0].value.trim(), amountGhs: parseFloat(i[1].value) }; }).filter(function (l) { return l.description || l.amountGhs; });
  }
  function total() { var t = lines().reduce(function (s, l) { return s + (l.amountGhs > 0 ? l.amountGhs : 0); }, 0); $('dlg-total').textContent = money(Math.round(t * 100)); }
  function openDialog(r) {
    current = r; linesBox.textContent = ''; $('dlg-err').hidden = true; $('dlg-note').value = '';
    $('dlg-for').textContent = r.name + ' · ' + ((state.services[r.service] || {}).label || r.service);
    var s = state.services[r.service];
    ((s && s.lines.length) ? s.lines : [{ description: '', amount: 0 }]).forEach(function (l) { lineRow(l.description, l.amount); });
    total(); dlg.showModal();
  }
  $('add-line').addEventListener('click', function () { lineRow('', 0); });
  $('dlg-cancel').addEventListener('click', function () { dlg.close(); });
  $('inv-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('dlg-err'), ok = $('dlg-ok'); err.hidden = true; ok.disabled = true;
    api('invoice', { requestId: current.id, lines: lines(), note: $('dlg-note').value }).then(function () { dlg.close(); say('Invoice issued.'); return load(); })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; }).then(function () { ok.disabled = false; });
  });

  function load() {
    say('Loading…');
    return Promise.all([api('catalogue'), api('requests')]).then(function (res) {
      state.flags = res[0].flags; state.services = {}; res[0].services.forEach(function (s) { state.services[s.value] = s; });
      state.requests = res[1].requests;
      $('who').textContent = 'Signed in as ' + res[0].admin;
      var f = res[0].flags;
      $('flags').textContent = !f.pricesConfirmed ? 'Prices are NOT confirmed: invoices cannot be paid online and fixed-fee invoices are not created automatically.' : 'Prices are confirmed: patients can pay invoices online.';
      say(''); render();
    }).catch(function (e) { say(e.message === 'Sign-in required.' ? 'Please sign in through Cloudflare Access to use this page.' : e.message, true); });
  }
  $('filter').addEventListener('change', render);
  $('refresh').addEventListener('click', load);
  load();
})();
