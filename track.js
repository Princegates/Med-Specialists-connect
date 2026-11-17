(function () {
  var q = new URLSearchParams(location.search), $ = function (i) { return document.getElementById(i); };
  var state = $('state');
  function money(p) { return 'GH₵' + (p / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function say(msg) { state.textContent = msg; state.hidden = false; $('track').hidden = true; }
  var ref = q.get('ref') || '', t = q.get('t') || '';
  if (!ref || !t) { say('Please use the link we sent you to follow your request.'); return; }
  fetch('/api/track?ref=' + encodeURIComponent(ref) + '&t=' + encodeURIComponent(t)).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (r) {
    if (!r.ok || !r.j.ok) { say(r.j.error || 'We could not find that request.'); return; }
    var d = r.j;
    state.hidden = true; $('track').hidden = false;
    document.title = d.headline + ' | MEDs Specialists Connect';
    $('headline').textContent = d.headline; $('text').textContent = d.text;
    $('ref').textContent = d.ref; $('service').textContent = d.service || '';
    $('received').textContent = new Date(d.received).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    if (d.appointments.length) {
      var ul = $('appt-list'); ul.textContent = '';
      d.appointments.forEach(function (a) {
        var li = document.createElement('li');
        li.textContent = new Date(a.when).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + (a.provider ? ' with ' + a.provider : '') + (a.place ? ', ' + a.place : '') + (a.confirmed ? '' : ' (waiting for the provider to confirm)') + (a.instructions ? '. ' + a.instructions : '');
        ul.append(li);
      });
      $('appts').hidden = false;
    }
    if (d.invoice) {
      $('inv-text').textContent = d.invoice.number + ' · ' + money(d.invoice.total) + ' · ' + (d.invoice.status === 'paid' ? 'Paid' : 'Payment due');
      $('inv-link').href = d.invoice.url; $('inv').hidden = false;
    }
  }).catch(function () { say('We could not load your request just now. Please try again.'); });
})();
