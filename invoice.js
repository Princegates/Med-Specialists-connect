(function () {
  var q = new URLSearchParams(location.search);
  var id = q.get('id') || '';
  var reference = q.get('reference') || q.get('trxref') || '';
  var $ = function (i) { return document.getElementById(i); };
  var state = $('state');

  function money(p) { return 'GH₵' + (p / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function show(el, on) { el.hidden = !on; }
  function say(msg) { state.textContent = msg; show(state, true); show($('invoice'), false); }

  function render(d) {
    var inv = d.invoice;
    show(state, false); show($('invoice'), true);
    document.title = 'Invoice ' + inv.number + ' | MEDs Specialists Connect';
    $('number').textContent = inv.number;
    $('issued').textContent = new Date(inv.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    $('billto').textContent = inv.billTo;
    $('contact').textContent = inv.contact;
    var tbody = $('lines'); tbody.textContent = '';
    inv.lines.forEach(function (l) {
      var tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
      a.textContent = l.description; b.textContent = money(l.amount); b.className = 'amt';
      tr.appendChild(a); tr.appendChild(b); tbody.appendChild(tr);
    });
    $('total').textContent = money(inv.total);
    var note = $('note'); note.textContent = inv.note || ''; show(note, !!inv.note);

    var badge = $('badge');
    badge.className = 'inv-badge ' + inv.status;
    badge.textContent = inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : 'Payment due';

    var banner = $('banner');
    if (d.testMode) { banner.textContent = 'Test invoice. Prices are not confirmed yet, so this cannot be paid.'; show(banner, true); }
    else if (inv.status === 'paid') { banner.textContent = 'Paid on ' + new Date(inv.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '. Thank you.'; show(banner, true); }
    else if (inv.status === 'void') { banner.textContent = 'This invoice has been cancelled. Please contact us for a new one.'; show(banner, true); }
    else show(banner, false);

    show($('pay'), d.payable); show($('payhelp'), d.payable);

    // What comes with a private or home service.
    var pk = $('package'), pl = $('package-list'); pl.textContent = '';
    if (d.package) { $('package-intro').textContent = d.package.intro; d.package.items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; pl.appendChild(li); }); show(pk, true); } else show(pk, false);

    // What the client has chosen, test by test.
    var inc = $('included'), body = $('included-body'); body.textContent = '';
    if (d.included && window.PackageDetails) { body.appendChild(window.PackageDetails.render(d.included, { labelOf: function (k) { return k; }, packagePrice: inv.total, showPrices: true })); show(inc, true); } else show(inc, false);
  }

  function load() {
    fetch('/api/invoice?id=' + encodeURIComponent(id)).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x.ok || !x.j.ok) say('We could not find this invoice. Please use the link we sent you, or call us on 0243 560 080.'); else render(x.j); })
      .catch(function () { say('We could not load this invoice just now. Please try again, or call us on 0243 560 080.'); });
  }

  $('print').addEventListener('click', function () { window.print(); });
  $('pay').addEventListener('click', function () {
    var btn = $('pay'), err = $('error'); show(err, false); btn.disabled = true; btn.textContent = 'Opening payment…';
    fetch('/api/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok && /^https:\/\//.test(j.url)) { window.location.href = j.url; return; } throw new Error(j.error || 'failed'); })
      .catch(function (e) { err.textContent = 'We could not start the payment. Please try again, or call us on 0243 560 080.'; show(err, true); btn.disabled = false; btn.textContent = 'Pay now'; });
  });

  if (!id) { say('This invoice link is incomplete. Please use the link we sent you.'); return; }
  if (reference) {
    fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, reference: reference }) }).catch(function () {}).then(load);
  } else load();
})();
