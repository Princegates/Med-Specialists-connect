// Calendar and reports.
(function () {
  var C = window.C, el = C.el;
  var statusTone = function (s) { return s === 'confirmed' || s === 'completed' ? 'good' : s === 'cancelled' || s === 'declined' || s === 'no_show' ? 'warn' : ''; };

  // ============ Calendar: a month of appointments
  C.route('calendar', 'Calendar', 'cases.view', function () {
    var now = new Date(), month = now.toISOString().slice(0, 7);
    var wrap = el('div');
    function shift(m, n) { var d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); }
    function load() {
      wrap.replaceChildren(el('p', { class: 'c-note', role: 'status', text: 'Loading…' }));
      return C.api('calendar?month=' + month).then(function (r) {
        var first = new Date(month + '-01T00:00:00Z'), days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        var lead = (first.getUTCDay() + 6) % 7, byDay = {};
        r.appointments.forEach(function (a) { var d = new Date(a.scheduled_at).getDate(); (byDay[d] = byDay[d] || []).push(a); });
        var today = new Date(), isThisMonth = today.toISOString().slice(0, 7) === month;
        var title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        var grid = el('div', { class: 'c-cal', role: 'list', 'aria-label': 'Appointments in ' + title });
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { grid.append(el('div', { class: 'c-cal-h', 'aria-hidden': 'true', text: d })); });
        for (var i = 0; i < lead; i++) grid.append(el('div', { class: 'c-cal-x', 'aria-hidden': 'true' }));
        for (var d = 1; d <= days; d++) {
          var list = byDay[d] || [], cell = el('div', { class: 'c-cal-d' + (isThisMonth && today.getDate() === d ? ' today' : ''), role: 'listitem' });
          cell.append(el('span', { class: 'c-cal-n', text: String(d) }));
          list.slice(0, 3).forEach(function (a) {
            cell.append(el('a', { class: 'c-cal-e ' + statusTone(a.status), href: '#/cases/' + a.request_id, title: (a.client_name || '') + ' · ' + C.label(a.status) }, el('b', { text: new Date(a.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }), ' ' + (a.provider_name || a.client_name || 'Appointment')));
          });
          if (list.length > 3) cell.append(el('span', { class: 'c-sub', text: '+' + (list.length - 3) + ' more' }));
          grid.append(cell);
        }
        var agenda = C.card('This month as a list', C.table(['When', 'Provider', 'Client', 'Status'], r.appointments.map(function (a) { return [C.dateTime(a.scheduled_at), a.provider_name || '', C.link(a.client_name || a.ref || 'Open case', '#/cases/' + a.request_id), C.tag(C.label(a.status), statusTone(a.status))]; }), 'No appointments this month.'));
        wrap.replaceChildren(el('div', { class: 'c-calbar' },
          el('button', { class: 'c-iconbtn', type: 'button', 'aria-label': 'Previous month', on: { click: function () { month = shift(month, -1); load(); } } }, C.icon('chevl')),
          el('h2', { text: title }),
          el('button', { class: 'c-iconbtn', type: 'button', 'aria-label': 'Next month', on: { click: function () { month = shift(month, 1); load(); } } }, C.icon('chevr')),
          el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Today', on: { click: function () { month = new Date().toISOString().slice(0, 7); load(); } } })), grid, agenda);
      }).catch(C.fail);
    }
    load();
    return el('div', {}, C.pageHead('Calendar', 'Appointments booked with doctors and providers.'), wrap);
  });

  // ============ Reports
  C.route('reports', 'Reports', 'reports.view', function () {
    return C.api('reports').then(function (r) {
      var v = el('div', {}, C.pageHead('Reports', 'The last six months. Totals only, no personal details.'));
      var resp = r.response, pct = resp.answered ? Math.round(resp.withinTarget / resp.answered * 100) : null;
      v.append(el('div', { class: 'c-kpis' },
        kpi('Requests received', r.casesByMonth.reduce(function (t, m) { return t + m.value; }, 0), 'cases'),
        kpi('Average time to first contact', resp.averageMinutes === null ? 'No data yet' : resp.averageMinutes < 90 ? resp.averageMinutes + ' min' : (resp.averageMinutes / 60).toFixed(1) + ' hours', 'clock'),
        kpi('Contacted within ' + resp.targetHours + ' h', pct === null ? 'No data yet' : pct + '%', 'tasks', pct !== null && pct < 80 ? 'warn' : 'good'),
        kpi('Emergency flags', r.safety, 'alert', r.safety ? 'warn' : '')));
      if (r.revenueByMonth) {
        var total = r.revenueByMonth.reduce(function (t, m) { return t + m.value; }, 0);
        v.append(el('div', { class: 'c-grid2' },
          C.card('Money received by month', el('div', {}, C.columns(r.revenueByMonth, { format: function (x) { return x ? 'GH₵' + Math.round(x / 100).toLocaleString('en-GH') : '0'; } }), el('p', { class: 'c-sub', text: 'Total ' + C.money(total) + ' · ' + r.invoices.paid + ' of ' + r.invoices.issued + ' invoices paid' }))),
          C.card('Money received by service', C.bars(r.revenueByService.map(function (x) { return { label: x.label, value: x.t }; }), { format: C.money, empty: 'No payments yet.' }))));
      }
      v.append(el('div', { class: 'c-grid2' },
        C.card('Requests by month', C.columns(r.casesByMonth)),
        C.card('Requests by service', C.bars(r.casesByService.map(function (x) { return { label: x.label, value: x.n }; })))));
      v.append(el('div', { class: 'c-grid2' },
        C.card('Where requests come from', C.bars(r.casesByChannel.map(function (x) { return { label: C.label(x.label), value: x.n }; }))),
        C.card('Cases by status now', C.bars(r.casesByStatus.map(function (x) { return { label: C.label(x.status), value: x.n }; })))));
      v.append(C.card('Busiest providers', C.table(['Provider', 'Cases', 'Appointments completed'], r.providers.map(function (p) { return [p.name, String(p.cases), String(p.completed || 0)]; }), 'No provider activity yet.')));
      return v;
    });
  });
  function kpi(label, value, icon, tone) {
    return el('div', { class: 'c-kpi' + (tone ? ' ' + tone : '') }, el('span', { class: 'c-kpi-ic' }, C.icon(icon)), el('div', {}, el('div', { class: 'c-kpi-n', text: String(value) }), el('div', { class: 'c-kpi-l', text: label })));
  }
  C.kpi = kpi;
})();
