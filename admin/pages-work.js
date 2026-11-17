// Day-to-day screens: dashboard, cases, clients, doctors and providers, invoices, accounts.
(function () {
  var C = window.C, el = C.el;
  var CASE_STATUSES = ['new', 'safety_escalation', 'under_review', 'awaiting_patient', 'awaiting_provider', 'options_presented', 'awaiting_payment', 'confirmed', 'in_progress', 'follow_up_due', 'completed', 'cancelled', 'closed', 'reopened'];
  var FINISHED = ['completed', 'cancelled', 'closed'];
  var URGENCY = ['Routine', 'Soon (a few days)', 'Urgent (ASAP)', 'Emergency (right now)'];
  var statusTone = function (s) { return s === 'paid' || s === 'completed' || s === 'confirmed' || s === 'active' || s === 'verified' ? 'good' : s === 'safety_escalation' || s === 'cancelled' || s === 'void' || s === 'suspended' || s === 'expired' || s === 'rejected' || s === 'expiring_soon' || s === 'declined' || s === 'no_show' ? 'warn' : ''; };
  var overdue = function (c) { return !FINISHED.includes(c.status) && c.next_action_due && Date.parse(c.next_action_due) < Date.now(); };
  var outcomes = function () { return (C.meta.outcomes || ['other']).map(function (o) { return [o, C.label(o)]; }); };
  var statusTag = function (s) { return C.tag(C.label(s), statusTone(s)); };
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { C.say('Link copied.'); }).catch(function () { C.say(text); }); }
  function download(name, text, type) { var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name }); document.body.append(a); a.click(); a.remove(); }

  // ============ Dashboard
  function hashQuery() { var q = {}; (location.hash.split('?')[1] || '').split('&').forEach(function (p) { if (!p) return; var kv = p.split('='); q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '1'); }); return q; }
  C.route('dashboard', 'Dashboard', null, function () {
    return Promise.all([C.api('dashboard'), C.can('reports.view') ? C.api('reports').catch(function () { return null; }) : Promise.resolve(null)]).then(function (res) {
      var d = res[0], rep = res[1], hr = new Date().getHours();
      var hello = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', ' + String(C.me.name).split(' ')[0];
      var v = el('div', {}, C.pageHead(hello, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        C.can('cases.edit') ? el('button', { class: 'btn btn-small', type: 'button', text: 'Log a request', on: { click: logRequestDialog } }) : null));

      if (d.cases) {
        var needs = [];
        if (d.cases.safety) needs.push(['alert', d.cases.safety + (d.cases.safety === 1 ? ' possible emergency' : ' possible emergencies') + ' flagged', '#/cases?status=safety_escalation', 'warn']);
        if (d.cases.overdueActions) needs.push(['clock', d.cases.overdueActions + ' next ' + (d.cases.overdueActions === 1 ? 'action is' : 'actions are') + ' overdue', '#/cases?overdue=1', 'warn']);
        if (d.cases.unassigned) needs.push(['users', d.cases.unassigned + ' open ' + (d.cases.unassigned === 1 ? 'case has' : 'cases have') + ' no owner', '#/cases?assigned=none', '']);
        if (d.money && d.money.overdueCount) needs.push(['money', d.money.overdueCount + ' overdue ' + (d.money.overdueCount === 1 ? 'invoice' : 'invoices'), '#/invoices', '']);
        v.append(needs.length ? el('ul', { class: 'c-attn', 'aria-label': 'Needs attention' }, needs.map(function (n) { return el('li', { class: n[3] }, el('a', { href: n[2] }, C.icon(n[0]), el('span', { text: n[1] }), C.icon('chevr', 16))); })) : el('p', { class: 'c-allclear' }, C.icon('tasks'), ' Nothing urgent right now.'));
        v.append(el('div', { class: 'c-kpis' }, C.kpi('Open cases', d.cases.open, 'cases'), C.kpi('Waiting for payment', d.cases.awaitingPayment, 'card'), C.kpi('Assigned to me', d.cases.mine, 'user'), C.kpi('My open tasks', d.cases.myTasks, 'tasks'), C.kpi('New today', d.cases.today, 'plus')));
      }
      if (d.money) v.append(el('div', { class: 'c-kpis' }, C.kpi('Collected this month', C.money(d.money.collectedThisMonth), 'money', 'good'), C.kpi('Waiting to be paid', C.money(d.money.outstanding), 'invoice'), C.kpi('Overdue invoices', d.money.overdueCount, 'alert', d.money.overdueCount ? 'warn' : '')));

      var left = [], right = [];
      if (d.cases) left.push(C.card('Coming up', C.table(['When', 'Provider', 'Status', ''], (d.upcoming || []).map(function (u) { return [C.dateTime(u.scheduled_at), u.provider_name || '', statusTag(u.status), C.link('Open case', '#/cases/' + u.request_id)]; }), 'No upcoming appointments.'), C.link('Open calendar', '#/calendar')));
      if (rep && rep.revenueByMonth) right.push(C.card('Money received', C.columns(rep.revenueByMonth, { format: function (x) { return x ? 'GH₵' + Math.round(x / 100).toLocaleString('en-GH') : '0'; } }), C.link('All reports', '#/reports')));
      else if (rep) right.push(C.card('Requests per month', C.columns(rep.casesByMonth), C.link('All reports', '#/reports')));
      if (d.expiringCredentials && d.expiringCredentials.length) left.push(C.card('Credentials expiring within 60 days', C.table(['Doctor or provider', 'Expires', ''], d.expiringCredentials.map(function (p) { return [p.name, C.date(p.credential_expiry), C.link('Open', '#/providers/' + p.id)]; }))));
      if (d.setup) {
        var s = d.setup, items = [
          ['Encryption key saved in Cloudflare', s.encryptionKey, 'settings'], ['Email connected and tested', s.emailReady && s.emailVerified, 'settings'], ['Paystack key saved and tested', s.paymentsKey && s.paymentsVerified, 'settings'],
          ['Prices confirmed', s.pricesConfirmed, 'services'], ['Online requests, invoices and payment switched on', s.billingEnabled, 'settings']
        ], todo = items.filter(function (i) { return !i[1]; }).length;
        right.push(C.card(todo ? 'Go-live checklist' : 'Go-live checklist: all done', el('div', {}, el('ul', { class: 'c-check-list' }, items.map(function (i) { return el('li', {}, C.tag(i[1] ? 'Done' : 'To do', i[1] ? 'good' : 'warn'), ' ', C.link(i[0], '#/' + i[2])); })),
          d.emailFailures ? el('p', { class: 'c-error', text: d.emailFailures + ' email(s) failed to send in the last 7 days. See Settings, Email.' }) : null)));
      }
      if (left.length || right.length) v.append(el('div', { class: 'c-grid2' }, el('div', { class: 'c-stack' }, left), el('div', { class: 'c-stack' }, right)));
      return v;
    });
  }, true);

  // ============ Cases
  function logRequestDialog() {
    var services = (C.meta.services || []).filter(function (s) { return s.active; });
    var f = {
      service: C.select(services.map(function (s) { return [s.value, s.label]; }), ''), name: C.input('text', '', { required: true, maxlength: 100 }), phone: C.input('tel', '', { required: true }), email: C.input('email', ''), area: C.input('text', ''),
      channel: C.select([['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['referral', 'Doctor referral'], ['walk-in', 'Walk-in'], ['email', 'Email']], 'phone'), urgency: C.select(URGENCY.map(function (u) { return [u, u]; }), 'Routine'),
      for_whom: C.select([['Myself', 'Themselves'], ['A family member or someone I care for', 'A family member']], 'Myself'), date: C.input('date', ''), message: C.textarea('', { maxlength: 2000 })
    };
    var consent = C.check('The client agreed to be contacted and to the privacy notice', false);
    C.dialog({ title: 'Log a request', submit: 'Create case', body: el('div', {},
      C.field('Service', f.service), el('div', { class: 'c-row2' }, C.field('Client name', f.name), C.field('Phone number', f.phone)), el('div', { class: 'c-row2' }, C.field('Email (optional)', f.email), C.field('Area (optional)', f.area)),
      el('div', { class: 'c-row2' }, C.field('How did it arrive?', f.channel), C.field('How urgent?', f.urgency)), el('div', { class: 'c-row2' }, C.field('Who is it for?', f.for_whom), C.field('Preferred date (optional)', f.date)),
      C.field('Notes', f.message, 'Health details here are visible only to roles allowed to see them.'), consent.box),
      onSubmit: function () {
        return C.api('cases', { service: f.service.value, name: f.name.value, phone: f.phone.value, email: f.email.value, area: f.area.value, channel: f.channel.value, urgency: f.urgency.value, for_whom: f.for_whom.value, preferred_date: f.date.value, message: f.message.value, consent_confirmed: consent.input.checked })
          .then(function (r) { location.hash = '#/cases/' + r.id; });
      } });
  }

  var BOARD = [['New and in review', ['new', 'safety_escalation', 'under_review', 'reopened']], ['Waiting on someone', ['awaiting_patient', 'awaiting_provider', 'options_presented']], ['Payment', ['awaiting_payment']], ['In delivery', ['confirmed', 'in_progress', 'follow_up_due']]];
  function caseCard(c) {
    return el('a', { class: 'c-kcard' + (c.priority === 'emergency' ? ' urgent' : ''), href: '#/cases/' + c.id },
      el('strong', { text: c.service_label || c.service }), el('span', { class: 'c-sub', text: c.name + (c.ref ? ' · ' + c.ref : '') }),
      el('span', { class: 'c-ktags' }, statusTag(c.status), c.priority === 'emergency' ? C.tag('Emergency', 'warn') : /^Urgent/.test(c.urgency || '') || c.priority === 'high' ? C.tag('Urgent', 'warn') : null, c.invoice_id ? C.tag(c.invoice_status === 'paid' ? 'Paid' : 'Payment due', c.invoice_status === 'paid' ? 'good' : '') : null),
      c.next_action ? el('span', { class: 'c-knext' + (overdue(c) ? ' c-late' : ''), text: (overdue(c) ? 'Overdue: ' : 'Next: ') + c.next_action }) : null,
      el('span', { class: 'c-kfoot' }, c.assigned_name ? C.avatar(c.assigned_name) : el('span', { class: 'c-sub', text: 'Not assigned' }), c.assigned_name ? el('span', { class: 'c-sub', text: c.assigned_name }) : null));
  }

  C.route('cases', 'Cases', 'cases.view', function () {
    var hq = hashQuery(), view = 'list';
    try { view = localStorage.getItem('cases-view') === 'board' ? 'board' : 'list'; } catch (e) {}
    var q = { status: hq.status || 'open', assigned: hq.assigned || '', urgent: '', q: '', overdue: hq.overdue ? '1' : '' }, body = el('div');
    function load() {
      body.replaceChildren(el('p', { class: 'c-note', role: 'status', text: 'Loading…' }));
      return C.api('cases?' + C.qs(Object.assign({ limit: 200 }, q))).then(function (r) {
        if (view === 'board' && (q.status === 'open' || q.status === '')) {
          body.replaceChildren(el('div', { class: 'c-board' }, BOARD.map(function (col) {
            var list = r.cases.filter(function (c) { return col[1].indexOf(c.status) > -1; });
            return el('section', { class: 'c-kcol', 'aria-label': col[0] }, el('h2', {}, col[0], el('span', { class: 'c-count', text: String(list.length) })), list.length ? list.map(caseCard) : el('p', { class: 'c-note', text: 'Nothing here.' }));
          })));
          return;
        }
        body.replaceChildren(C.table(['Received', 'Case', 'Client', 'Status', 'Next action', 'Assigned to', 'Invoice'], r.cases.map(function (c) {
          var row = [C.dateTime(c.created_at), el('div', {}, C.link(c.service_label || c.service, '#/cases/' + c.id), el('div', { class: 'c-sub', text: c.ref || '' })), el('div', {}, c.name, el('div', { class: 'c-sub', text: [c.phone, c.area].filter(Boolean).join(' · ') })),
            el('div', {}, statusTag(c.status), c.priority === 'emergency' ? C.tag('Emergency', 'warn') : /^Urgent/.test(c.urgency || '') || c.priority === 'high' ? C.tag('Urgent', 'warn') : null),
            el('div', {}, c.next_action || '', c.next_action_due ? el('div', { class: 'c-sub' + (overdue(c) ? ' c-late' : ''), text: (overdue(c) ? 'Overdue · ' : 'Due ') + C.dateTime(c.next_action_due) }) : null), c.assigned_name || '',
            c.invoice_id ? el('div', {}, c.invoice_number, ' ', C.tag(c.invoice_status === 'paid' ? 'Paid' : 'Due', c.invoice_status === 'paid' ? 'good' : '')) : ''];
          row.cls = c.priority === 'emergency' || /^Urgent/.test(c.urgency || '') ? 'urgent' : ''; return row;
        }), 'No cases match.'));
      }).catch(C.fail);
    }
    var status = C.select([['open', 'Open cases'], ['', 'All cases']].concat(CASE_STATUSES.map(function (s) { return [s, C.label(s)]; })), q.status, { on: { change: function () { q.status = this.value; load(); } } });
    var assigned = C.select([['', 'Anyone'], ['me', 'Assigned to me'], ['none', 'Not assigned']], q.assigned, { on: { change: function () { q.assigned = this.value; load(); } } });
    var urgent = C.check('Urgent only', false); urgent.input.addEventListener('change', function () { q.urgent = this.checked ? '1' : ''; load(); });
    var search = C.input('search', '', { placeholder: 'Name, phone, service or case reference', on: { input: function () { clearTimeout(search.t); var s = this; search.t = setTimeout(function () { q.q = s.value; load(); }, 300); } } });
    var tabs = el('div', { class: 'c-seg', role: 'group', 'aria-label': 'View' }, [['list', 'List', 'list'], ['board', 'Board', 'grid']].map(function (t) {
      var b = el('button', { type: 'button', 'aria-pressed': String(view === t[0]), on: { click: function () { view = t[0]; try { localStorage.setItem('cases-view', view); } catch (e) {} tabs.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); load(); } } }, C.icon(t[2], 16), el('span', { text: t[1] })); return b;
    }));
    var v = el('div', {}, C.pageHead('Cases', 'Every request, from first contact to closing.', [tabs, C.can('cases.edit') ? el('button', { class: 'btn btn-small', type: 'button', text: 'Log a request', on: { click: logRequestDialog } }) : null]),
      el('div', { class: 'c-filters' }, C.field('Show', status), C.field('Assigned', assigned), C.field('Search', search), urgent.box), body);
    load(); return v;
  });

  function invoiceDialog(c, svc) {
    var editor = C.lineEditor((svc && svc.lines) || []), note = C.input('text', '', { maxlength: 500 });
    C.dialog({ title: 'Issue an invoice', submit: 'Issue invoice', intro: 'Show the provider charge and our coordination fee as separate lines. Once issued, an invoice cannot be edited; void it to change it.',
      body: el('div', {}, editor, C.field('Note on the invoice (optional)', note)),
      onSubmit: function () { return C.api('cases/' + c.id + '/invoice', { lines: editor.read(), note: note.value }).then(function () { C.say('Invoice issued.'); C.render(); }); } });
  }

  C.routes.cases = Object.assign({}, C.routes.cases, { fn: (function (listFn) {
    return function (id) { return id ? caseDetail(id) : listFn(); };
  })(C.routes.cases.fn) });

  function caseDetail(id) {
    return Promise.all([C.api('cases/' + id), C.api('staff-lite'), C.can('providers.view') ? C.api('providers') : Promise.resolve({ providers: [] })]).then(function (r) {
      var d = r[0], c = d.case, staff = r[1].staff, providers = r[2].providers.filter(function (p) { return p.effective === 'active' || p.effective === 'expiring_soon'; });
      var svc = (C.meta.services || []).filter(function (s) { return s.value === c.service; })[0];
      var v = el('div', {}, el('p', {}, C.link('← All cases', '#/cases')), C.h(c.service_label || c.service, 1),
        el('p', {}, statusTag(c.status), ' ', c.priority === 'emergency' ? C.tag('Emergency', 'warn') : /^Urgent/.test(c.urgency || '') || c.priority === 'high' ? C.tag('Urgent', 'warn') : null, ' ', el('span', { class: 'c-sub', text: (c.ref || '') + ' · received ' + C.dateTime(c.created_at) })));
      if (c.status === 'safety_escalation') v.append(el('p', { class: 'c-alert', role: 'alert', text: 'Possible emergency. Call the client now and, if there is any danger, direct them to call 112 or go to the nearest hospital. Record what you did below.' }));

      var details = el('dl', { class: 'c-dl' });
      [['Client', d.client ? C.link(c.name, '#/clients/' + d.client.id) : c.name], ['Phone', c.phone], ['Email', c.email], ['Area', c.area], ['For', c.for_whom], ['Patient', d.patient && !d.patient.self ? d.patient.name + ' (' + C.label(d.patient.authority) + ')' : ''], ['Urgency', c.urgency], ['Came in by', c.channel], ['Preferred date', c.preferred_date], ['Best time to call', c.call_time], ['Note from the client', c.message]].forEach(function (p) {
        if (p[1]) details.append(el('dt', { text: p[0] }), el('dd', {}, p[1]));
      });
      if (c.phone && c.phone !== 'removed') details.append(el('dt', { text: 'Message' }), el('dd', {}, el('a', { href: C.waLink(c.phone, 'Hello ' + c.name + ', this is MEDs Specialists Connect about your request ' + (c.ref || '') + '.'), target: '_blank', rel: 'noopener', text: 'Open WhatsApp' })));
      if (c.track_token) details.append(el('dt', { text: 'Tracking link' }), el('dd', {}, el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy the client\'s tracking link', on: { click: function () { copy(location.origin + '/track?ref=' + c.ref + '&t=' + c.track_token); } } })));
      if (c.status === 'closed' || c.status === 'completed' || c.status === 'cancelled') details.append(el('dt', { text: 'Closed' }), el('dd', {}, C.dateTime(c.closed_at) + ' · ' + C.label(c.closure_outcome) + (c.closure_reason ? ': ' + c.closure_reason : '')));
      if (c.escalated_name) details.append(el('dt', { text: 'Escalated to' }), el('dd', {}, c.escalated_name + (c.escalation_outcome ? ' · outcome: ' + c.escalation_outcome : '')));

      var f = {
        status: C.select(CASE_STATUSES.map(function (s) { return [s, C.label(s)]; }), c.status), reason: C.input('text', '', { maxlength: 500 }),
        closeReason: C.input('text', '', { maxlength: 300 }), outcome: C.select([['', 'Choose the outcome']].concat(outcomes()), ''),
        next: C.input('text', c.next_action || '', { maxlength: 200 }), due: C.input('datetime-local', c.next_action_due ? new Date(Date.parse(c.next_action_due) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''),
        priority: C.select([['normal', 'Normal'], ['high', 'High'], ['emergency', 'Emergency']], c.priority || 'normal'),
        assigned: C.select([['', 'Not assigned']].concat(staff.map(function (s) { return [s.id, s.name]; })), c.assigned_to || ''), escalate: C.select([['', 'Do not escalate']].concat(staff.filter(function (s) { return ['supervisor', 'owner'].indexOf(s.role) > -1; }).map(function (s) { return [s.id, s.name]; })), '')
      };
      var closeBox = el('div', { hidden: true }, C.field('Why is it being closed or cancelled?', f.closeReason), C.field('Outcome', f.outcome));
      f.status.addEventListener('change', function () { closeBox.hidden = FINISHED.indexOf(f.status.value) < 0 || f.status.value === c.status; });
      var canAssign = C.can('cases.assign');
      if (!canAssign && c.assigned_to) f.assigned.disabled = true;
      var manage = C.can('cases.edit') ? el('form', { class: 'c-form', on: { submit: function (e) {
        e.preventDefault(); var b = { note: f.reason.value };
        if (f.status.value !== c.status) { b.status = f.status.value; b.closure_reason = f.closeReason.value; b.closure_outcome = f.outcome.value; }
        if (f.next.value !== (c.next_action || '')) b.next_action = f.next.value;
        if (f.due.value) b.next_action_due = f.due.value;
        if (f.priority.value !== (c.priority || 'normal')) b.priority = f.priority.value;
        if (f.assigned.value !== (c.assigned_to || '')) b.assigned_to = f.assigned.value || null;
        if (f.escalate.value) b.escalate_to = f.escalate.value;
        C.api('cases/' + id + '/update', b).then(function () { C.say('Saved.'); C.render(); }).catch(C.fail);
      } } }, C.field('Status', f.status), C.field('Reason or note', f.reason, 'Needed for Awaiting patient, Cancelled, Reopened and escalations.'), closeBox,
        C.field('Next action', f.next, 'Every open case needs one.'), C.field('Due', f.due), C.field('Priority', f.priority), C.field('Assigned to', f.assigned, canAssign ? '' : 'Only a supervisor can move a case between people.'),
        C.can('cases.edit') ? C.field('Escalate to', f.escalate) : null, el('button', { class: 'btn btn-small', type: 'submit', text: 'Save changes' })) : null;
      v.append(el('div', { class: 'c-cols' }, el('div', {}, C.section('Details', details), manage ? C.section('Manage this case', manage) : null, tasksPanel(c, d, staff)), el('div', {}, billingPanel(c, d, svc), matchPanel(c, d, providers), appointmentPanel(c, d, providers))));

      v.append(contactPanel(c, d));
      var noteBox = C.textarea('', { maxlength: 1000, placeholder: 'Add a note to the timeline' });
      v.append(C.section('Timeline', el('ol', { class: 'c-timeline' }, d.timeline.map(function (t) { return el('li', {}, el('strong', { text: C.label(t.action) }), ' ', t.detail || '', el('div', { class: 'c-sub', text: C.dateTime(t.at) + (t.actor ? ' · ' + t.actor : '') })); })),
        C.can('cases.edit') ? el('form', { class: 'c-form', on: { submit: function (e) { e.preventDefault(); C.api('cases/' + id + '/note', { text: noteBox.value }).then(function () { C.render(); }).catch(C.fail); } } }, noteBox, el('button', { class: 'btn btn-small', type: 'submit', text: 'Add note' })) : null));
      return v;
    });
  }

  function tasksPanel(c, d, staff) {
    var s = C.section('Tasks');
    if (!d.tasks.length) s.append(el('p', { class: 'c-note', text: 'No tasks on this case.' }));
    d.tasks.forEach(function (t) {
      var late = t.status === 'open' && t.due && Date.parse(t.due) < Date.now();
      s.append(el('div', { class: 'c-card' }, el('strong', { text: t.title }), ' ', t.status === 'done' ? C.tag('Done', 'good') : late ? C.tag('Overdue', 'warn') : '',
        el('div', { class: 'c-sub', text: [t.assignee_name, t.due ? 'due ' + C.dateTime(t.due) : ''].filter(Boolean).join(' · ') }),
        t.status === 'open' && C.can('tasks.edit') ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Mark done', on: { click: function () { C.api('tasks/' + t.id + '/done', {}).then(function () { C.render(); }).catch(C.fail); } } }) : null));
    });
    if (C.can('tasks.edit')) s.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Add a task', on: { click: function () {
      var f = { title: C.input('text', '', { required: true, maxlength: 160 }), type: C.select((C.meta.taskTypes || ['other']).map(function (t) { return [t, C.label(t)]; }), 'call_client'), who: C.select(staff.map(function (x) { return [x.id, x.name]; }), C.me.id), due: C.input('datetime-local', '') };
      C.dialog({ title: 'Add a task', body: el('div', {}, C.field('What needs doing?', f.title), C.field('Type', f.type), C.field('Who does it?', f.who), C.field('Due (optional)', f.due)),
        onSubmit: function () { return C.api('tasks', { request_id: c.id, title: f.title.value, type: f.type.value, assignee: f.who.value, due: f.due.value }).then(function () { C.render(); }); } });
    } } }));
    return s;
  }

  // Providers put forward for this case, and how they answered.
  function matchPanel(c, d, providers) {
    var s = C.section('Provider options');
    if (!d.assignments.length) s.append(el('p', { class: 'c-note', text: 'No provider has been asked yet.' }));
    d.assignments.forEach(function (a) {
      var card = el('div', { class: 'c-card' }, el('strong', { text: a.provider_name }), ' ', C.tag(C.label(a.response), a.response === 'accepted' ? 'good' : a.response === 'declined' ? 'warn' : ''),
        a.rationale ? el('div', { class: 'c-sub', text: a.rationale }) : null, a.override_reason ? el('div', { class: 'c-sub', text: 'Override: ' + a.override_reason }) : null, a.response_note ? el('div', { class: 'c-sub', text: a.response_note }) : null);
      if (a.response === 'pending' && C.can('cases.edit')) {
        card.append(el('div', { class: 'c-actions left' }, ['accepted', 'declined', 'no_response'].map(function (r) {
          return el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: r === 'accepted' ? 'They accepted' : r === 'declined' ? 'They declined' : 'No reply', on: { click: function () { C.api('assignments/' + a.id, { response: r }).then(function () { C.render(); }).catch(C.fail); } } });
        })));
      }
      s.append(card);
    });
    if (C.can('cases.edit') && !FINISHED.includes(c.status)) s.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Ask a provider', on: { click: function () {
      if (!providers.length) { C.say('No verified providers yet. A network manager has to verify one first.', true); return; }
      var f = { provider: C.select(providers.map(function (p) { return [p.id, p.name + (p.specialty ? ' (' + p.specialty + ')' : '') + (p.effective === 'expiring_soon' ? ' · credential expiring' : '')]; }), ''), why: C.input('text', '', { maxlength: 500 }), override: C.input('text', '', { maxlength: 300 }) };
      C.dialog({ title: 'Ask a provider', submit: 'Record request', intro: 'Only verified providers appear here. Record that you have asked them; then note their answer.',
        body: el('div', {}, C.field('Provider', f.provider), C.field('Why this provider', f.why, 'For example closest to the client, speaks the language, earliest slot.'), C.field('Override reason (only if this is not the usual first choice)', f.override)),
        onSubmit: function () { return C.api('cases/' + c.id + '/propose', { provider_id: f.provider.value, rationale: f.why.value, override_reason: f.override.value }).then(function () { C.render(); }); } });
    } } }));
    return s;
  }

  // Calls, messages and visits with the client, newest first.
  function contactPanel(c, d) {
    var s = C.section('Contact log');
    if (!d.communications.length) s.append(el('p', { class: 'c-note', text: C.can('health.view') ? 'Nothing recorded yet. Log each call or message so a colleague can pick up where you left off.' : 'Not available to your role.' }));
    d.communications.forEach(function (m) {
      s.append(el('div', { class: 'c-card' }, el('strong', { text: C.label(m.direction) + ' · ' + C.label(m.channel) }), el('div', { class: 'c-sub', text: C.dateTime(m.at) + (m.by_name ? ' · ' + m.by_name : '') }), el('p', { text: m.body })));
    });
    if (C.can('cases.edit')) s.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Log a call or message', on: { click: function () {
      var f = { dir: C.select([['outbound', 'We contacted the client'], ['inbound', 'The client contacted us']], 'outbound'), ch: C.select([['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'Email'], ['in_person', 'In person'], ['other', 'Other']], 'phone'), body: C.textarea('', { required: true, maxlength: 2000 }) };
      C.dialog({ title: 'Log a call or message', body: el('div', {}, C.field('Direction', f.dir), C.field('How', f.ch), C.field('What was said or agreed', f.body)),
        onSubmit: function () { return C.api('cases/' + c.id + '/contact', { direction: f.dir.value, channel: f.ch.value, body: f.body.value }).then(function () { C.render(); }); } });
    } } }));
    return s;
  }

  function billingPanel(c, d, svc) {
    var s = C.section('Invoice');
    if (!d.invoices.length) s.append(el('p', { class: 'c-note', text: 'No invoice yet.' }));
    d.invoices.forEach(function (i) {
      var link = location.origin + '/invoice?id=' + i.id;
      s.append(el('div', { class: 'c-card' }, el('strong', { text: i.number + ' · ' + C.money(i.total) }), ' ', C.tag(i.status === 'paid' ? 'Paid' : i.status === 'void' ? 'Void' : 'Payment due', i.status === 'paid' ? 'good' : i.status === 'void' ? 'warn' : ''),
        el('div', { class: 'c-actions left' }, el('a', { href: '/invoice?id=' + i.id, target: '_blank', rel: 'noopener', text: 'Open' }), el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy link', on: { click: function () { copy(link); } } }),
          c.phone !== 'removed' ? el('a', { href: C.waLink(c.phone, 'Hello ' + c.name + ', your MEDs Specialists Connect invoice ' + i.number + ' (' + C.money(i.total) + '): ' + link), target: '_blank', rel: 'noopener', text: 'Send on WhatsApp' }) : null)));
    });
    if (C.can('billing.create') && !d.invoices.some(function (i) { return i.status !== 'void'; })) s.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Create invoice', on: { click: function () { invoiceDialog(c, svc); } } }));
    s.append(el('p', {}, C.link('Open all invoices', '#/invoices')));
    return s;
  }

  function appointmentDialog(c, providers) {
    if (!providers.length) { C.say('No verified providers yet. A network manager has to verify one first.', true); return; }
    var f = { provider: C.select(providers.map(function (p) { return [p.id, p.name + (p.specialty ? ' (' + p.specialty + ')' : '')]; }), c.provider_id || ''), when: C.input('datetime-local', ''),
      mode: C.select([['facility', 'At the facility'], ['home', 'At home'], ['virtual', 'Online'], ['mobile', 'Mobile service']], 'facility'), place: C.input('text', '', { maxlength: 200 }), instr: C.input('text', '', { maxlength: 500 }), cost: C.input('text', '', { maxlength: 300 }) };
    var confirmed = C.check('The provider has confirmed this time', false);
    C.dialog({ title: 'Book an appointment', submit: 'Save booking', intro: 'It shows as requested until the provider has confirmed. Only tick the box once they have.',
      body: el('div', {}, C.field('Doctor or provider', f.provider), C.field('Date and time', f.when), C.field('Type', f.mode), C.field('Place or address', f.place, 'The clinic, or the patient\'s home address.'), C.field('Instructions for the client (optional)', f.instr), C.field('What the client should expect to pay the provider (optional)', f.cost), confirmed.box),
      onSubmit: function () { return C.api('cases/' + c.id + '/appointments', { provider_id: f.provider.value, scheduled_at: f.when.value, mode: f.mode.value, place: f.place.value, instructions: f.instr.value, cost_info: f.cost.value, provider_confirmed: confirmed.input.checked }).then(function () { C.say('Booking saved.'); C.render(); }); } });
  }

  function apptActions(a) {
    var box = el('div', { class: 'c-actions left' });
    if (!C.can('cases.edit') || ['cancelled', 'completed', 'rescheduled', 'declined', 'no_show'].indexOf(a.status) > -1) return box;
    var act = function (label, status, needReason) {
      return el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: label, on: { click: function () {
        if (!needReason) { C.api('appointments/' + a.id, { status: status }).then(function () { C.render(); }).catch(C.fail); return; }
        var why = C.input('text', '', { required: true, maxlength: 300 });
        C.dialog({ title: label, body: C.field('Reason', why), onSubmit: function () { return C.api('appointments/' + a.id, { status: status, reason: why.value }).then(function () { C.render(); }); } });
      } } });
    };
    if (a.status !== 'confirmed') box.append(act('Provider confirmed', 'confirmed'));
    if (a.status === 'confirmed') box.append(act('Completed', 'completed'), act('No-show', 'no_show', true));
    box.append(el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Change time', on: { click: function () {
      var when = C.input('datetime-local', '', { required: true }), why = C.input('text', '', { required: true, maxlength: 300 });
      C.dialog({ title: 'Change the time', intro: 'The old booking is kept as history and a new one is created.', body: el('div', {}, C.field('New date and time', when), C.field('Reason', why)), onSubmit: function () { return C.api('appointments/' + a.id, { scheduled_at: when.value, reason: why.value }).then(function () { C.render(); }); } });
    } } }), act('Cancel', 'cancelled', true));
    return box;
  }

  function appointmentPanel(c, d, providers) {
    var s = C.section('Appointments');
    if (!d.appointments.length) s.append(el('p', { class: 'c-note', text: 'No appointment booked.' }));
    d.appointments.forEach(function (a) {
      s.append(el('div', { class: 'c-card' }, el('strong', { text: C.dateTime(a.scheduled_at) }), ' ', statusTag(a.status), el('div', { class: 'c-sub', text: [a.provider_name, C.label(a.mode), a.place].filter(Boolean).join(' · ') }),
        a.instructions ? el('div', { class: 'c-sub', text: a.instructions }) : null, a.cancel_reason ? el('div', { class: 'c-sub', text: 'Reason: ' + a.cancel_reason }) : null, apptActions(a)));
    });
    if (C.can('cases.edit') && !FINISHED.includes(c.status)) s.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Book an appointment', on: { click: function () { appointmentDialog(c, providers); } } }));
    return s;
  }

  // ============ Clients
  C.route('clients', 'Clients', 'clients.view', function (id) {
    if (id) return clientDetail(id);
    var body = el('div'), q = '';
    function load() {
      return C.api('clients?' + C.qs({ q: q })).then(function (r) {
        body.replaceChildren(C.table(['Client', 'Phone', 'Area', 'Cases', 'Last request'], r.clients.map(function (c) { return [C.link(c.name, '#/clients/' + c.id), c.phone, c.area || '', String(c.cases), C.date(c.last_case)]; }), 'No clients yet. They appear here when someone makes a request.'));
      }).catch(C.fail);
    }
    var search = C.input('search', '', { placeholder: 'Name, phone or email', on: { input: function () { clearTimeout(search.t); var s = this; search.t = setTimeout(function () { q = s.value; load(); }, 300); } } });
    var v = el('div', {}, C.h('Clients', 1), el('div', { class: 'c-filters' }, C.field('Search', search), C.can('clients.edit') ? el('button', { class: 'btn btn-small', type: 'button', text: 'New client', on: { click: function () {
      var f = { name: C.input('text', '', { required: true }), phone: C.input('tel', '', { required: true }), email: C.input('email', ''), area: C.input('text', '') };
      C.dialog({ title: 'New client', body: el('div', {}, C.field('Name', f.name), C.field('Phone number', f.phone), C.field('Email (optional)', f.email), C.field('Area (optional)', f.area)),
        onSubmit: function () { return C.api('clients', { name: f.name.value, phone: f.phone.value, email: f.email.value, area: f.area.value }).then(function (r) { location.hash = '#/clients/' + r.id; }); } });
    } } }) : null), body);
    load(); return v;
  });

  function clientDetail(id) {
    return C.api('clients/' + id).then(function (d) {
      var c = d.client, erased = c.status === 'anonymised';
      var v = el('div', {}, el('p', {}, C.link('← All clients', '#/clients')), C.h(c.name, 1), el('div', { class: 'c-tiles' }, C.tile('Cases', d.cases.length), C.tile('Invoiced', C.money(d.totals.invoiced)), C.tile('Paid', C.money(d.totals.paid), 'good')));
      if (!erased) {
        var f = { name: C.input('text', c.name), email: C.input('email', c.email), area: C.input('text', c.area), language: C.input('text', c.language), tags: C.input('text', c.tags, { placeholder: 'for example: diaspora, vip' }), notes: C.textarea(c.notes, { maxlength: 2000 }), status: C.select(['active', 'archived'], c.status) };
        v.append(C.section('Profile', el('p', { class: 'c-sub', text: 'Phone ' + c.phone + (c.consent_at ? ' · agreed to the privacy notice on ' + C.date(c.consent_at) : ' · consent not recorded') }),
          C.can('clients.edit') ? el('form', { class: 'c-form', on: { submit: function (e) { e.preventDefault(); C.api('clients/' + id + '/update', { name: f.name.value, email: f.email.value, area: f.area.value, language: f.language.value, tags: f.tags.value, notes: f.notes.value, status: f.status.value }).then(function () { C.say('Saved.'); C.render(); }).catch(C.fail); } } },
            el('div', { class: 'c-row2' }, C.field('Name', f.name), C.field('Email', f.email)), el('div', { class: 'c-row2' }, C.field('Area', f.area), C.field('Language', f.language)), C.field('Tags', f.tags), d.client.notes !== undefined ? C.field('Notes', f.notes) : null, C.field('Status', f.status), el('button', { class: 'btn btn-small', type: 'submit', text: 'Save profile' })) : null));
      } else v.append(el('p', { class: 'c-note', text: 'This client\'s personal details have been erased. Invoices and payments are kept for the accounts.' }));
      v.append(C.section('Cases', C.table(['Received', 'Service', 'Status'], d.cases.map(function (k) { return [C.dateTime(k.created_at), C.link(k.service_label || k.service, '#/cases/' + k.id), statusTag(k.status)]; }), 'No cases.')));
      v.append(C.section('Invoices', C.table(['Number', 'Date', 'Total', 'Status'], d.invoices.map(function (i) { return [i.number, C.date(i.created_at), C.money(i.total), statusTag(i.status === 'issued' ? 'due' : i.status)]; }), 'No invoices.')));
      var note = C.textarea('', { placeholder: 'Add a note', maxlength: 1000 });
      v.append(C.section('History', el('ol', { class: 'c-timeline' }, d.timeline.map(function (t) { return el('li', {}, el('strong', { text: C.label(t.action) }), ' ', t.detail || '', el('div', { class: 'c-sub', text: C.dateTime(t.at) + (t.actor ? ' · ' + t.actor : '') })); })),
        !erased && C.can('clients.edit') ? el('form', { class: 'c-form', on: { submit: function (e) { e.preventDefault(); C.api('clients/' + id + '/note', { text: note.value }).then(function () { C.render(); }).catch(C.fail); } } }, note, el('button', { class: 'btn btn-small', type: 'submit', text: 'Add note' })) : null));
      var privacy = el('div', { class: 'c-actions left' });
      if (C.can('clients.export') && !erased) privacy.append(el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Download a copy of their data', on: { click: function () { C.api('clients/' + id + '/export').then(function (r) { download('client-' + id.slice(0, 8) + '.json', JSON.stringify(r, null, 2), 'application/json'); }).catch(C.fail); } } }));
      if (C.can('clients.anonymise') && !erased) privacy.append(el('button', { class: 'btn btn-ghost btn-small danger', type: 'button', text: 'Erase personal details', on: { click: function () {
        var conf = C.input('text', '', { autocomplete: 'off' });
        C.dialog({ title: 'Erase personal details', submit: 'Erase', intro: 'This removes the name, phone, email, notes and health details from this client and every case. Invoices and payments are kept for the accounts. It cannot be undone.', body: C.field('Type ANONYMISE to confirm', conf), onSubmit: function () { return C.api('clients/' + id + '/anonymise', { confirm: conf.value }).then(function () { C.say('Personal details erased.'); C.render(); }); } });
      } } }));
      if (privacy.children.length) v.append(C.section('Privacy', privacy));
      return v;
    });
  }

  // ============ Doctors and providers
  var PTYPES = ['specialist', 'hospital', 'clinic', 'laboratory', 'imaging', 'ambulance', 'home_nursing', 'other'];
  function providerForm(p, onSave) {
    var f = { name: C.input('text', p.name, { required: true }), type: C.select(PTYPES, p.type || 'specialist'), specialty: C.input('text', p.specialty), phone: C.input('tel', p.phone), email: C.input('email', p.email), area: C.input('text', p.area), languages: C.input('text', p.languages),
      rate: C.input('text', p.rate_note, { placeholder: 'For example: consultation about GH₵400' }), cno: C.input('text', p.credential_no), cexp: C.input('date', p.credential_expiry), notes: C.textarea(p.notes, { maxlength: 1000 }),
      legal: C.input('text', p.legal_name), modes: C.input('text', p.service_modes, { placeholder: 'facility, home, virtual' }), locs: C.input('text', p.locations), svcs: C.input('text', p.services, { placeholder: 'For example: MRI or CT scan, Laboratory tests' }) };
    var form = el('div', {}, el('div', { class: 'c-row2' }, C.field('Name', f.name), C.field('Type', f.type)), el('div', { class: 'c-row2' }, C.field('Specialty', f.specialty), C.field('Area', f.area)), el('div', { class: 'c-row2' }, C.field('Phone', f.phone), C.field('Email', f.email)),
      C.field('Languages', f.languages), C.field('Registered or legal name (if different)', f.legal), C.field('Services offered', f.svcs), el('div', { class: 'c-row2' }, C.field('How they see patients', f.modes, 'facility, home, virtual or mobile'), C.field('Locations', f.locs)), C.field('Fees (note)', f.rate), el('div', { class: 'c-row2' }, C.field('Registration or licence number', f.cno), C.field('Registration expires', f.cexp)), C.field('Notes', f.notes));
    form.read = function () { return { name: f.name.value, type: f.type.value, specialty: f.specialty.value, phone: f.phone.value, email: f.email.value, area: f.area.value, languages: f.languages.value, rate_note: f.rate.value, credential_no: f.cno.value, credential_expiry: f.cexp.value, notes: f.notes.value, legal_name: f.legal.value, service_modes: f.modes.value, locations: f.locs.value, services: f.svcs.value }; };
    return form;
  }

  C.route('providers', 'Doctors and providers', 'providers.view', function (id) {
    if (id) return providerDetail(id);
    var q = { q: '', type: '', status: '' }, body = el('div');
    function load() {
      return C.api('providers?' + C.qs(q)).then(function (r) {
        body.replaceChildren(C.table(['Name', 'Type', 'Specialty', 'Area', 'Phone', 'Open cases', 'Verification'], r.providers.map(function (p) { return [C.link(p.name, '#/providers/' + p.id), C.label(p.type), p.specialty || '', p.area || '', p.phone || '', String(p.open_cases), C.tag(C.label(p.effective), statusTone(p.effective))]; }), 'No doctors or providers yet.'));
      }).catch(C.fail);
    }
    var search = C.input('search', '', { placeholder: 'Name, specialty or area', on: { input: function () { clearTimeout(search.t); var s = this; search.t = setTimeout(function () { q.q = s.value; load(); }, 300); } } });
    var type = C.select([['', 'All types']].concat(PTYPES.map(function (t) { return [t, C.label(t)]; })), '', { on: { change: function () { q.type = this.value; load(); } } });
    var status = C.select([['', 'All']].concat((C.meta.providerStatuses || []).map(function (t) { return [t, C.label(t)]; })), '', { on: { change: function () { q.status = this.value; load(); } } });
    var v = el('div', {}, C.h('Doctors and providers', 1), el('div', { class: 'c-filters' }, C.field('Search', search), C.field('Type', type), C.field('Status', status), C.can('providers.edit') ? el('button', { class: 'btn btn-small', type: 'button', text: 'Add a doctor or provider', on: { click: function () {
      var form = providerForm({}); C.dialog({ title: 'Add a doctor or provider', body: form, onSubmit: function () { return C.api('providers', form.read()).then(function (r) { location.hash = '#/providers/' + r.id; }); } });
    } } }) : null), body);
    load(); return v;
  });

  function providerDetail(id) {
    return C.api('providers/' + id).then(function (d) {
      var p = d.provider, form = providerForm(p), canVerify = C.can('providers.verify');
      var status = C.select((C.meta.providerStatuses || []).map(function (t) { return [t, C.label(t)]; }), p.verification), why = C.input('text', '', { maxlength: 300 });
      var v = el('div', {}, el('p', {}, C.link('← All doctors and providers', '#/providers')), C.h(p.name, 1), el('p', {}, C.tag(C.label(p.effective), statusTone(p.effective)), p.status_reason ? el('span', { class: 'c-sub', text: ' ' + p.status_reason }) : null));
      if (p.effective === 'expired') v.append(el('p', { class: 'c-alert', role: 'alert', text: 'A credential has expired, so this provider cannot be proposed or booked until it is renewed and verified.' }));
      v.append(C.section('Details', C.can('providers.edit') ? el('form', { class: 'c-form', on: { submit: function (e) {
        e.preventDefault(); var b = form.read(); if (status.value !== p.verification) { b.status = status.value; b.reason = why.value; }
        C.api('providers/' + id + '/update', b).then(function () { C.say('Saved.'); C.render(); }).catch(C.fail); } } }, form,
        C.field('Verification status', status, canVerify ? 'To activate, at least one credential must be verified. Giving a reason is required to reject, suspend or archive.' : 'Only the network manager or owner can change this.'), C.field('Reason (when rejecting, suspending or archiving)', why), el('button', { class: 'btn btn-small', type: 'submit', text: 'Save' })) : el('p', { text: [p.specialty, p.area, p.phone].filter(Boolean).join(' · ') })));
      if (!canVerify) status.disabled = true;

      var cred = C.section('Credentials and contracts', C.table(['Type', 'Issued by', 'Number', 'Expires', 'Check', ''], d.credentials.map(function (c) {
        var expired = c.expires_on && c.expires_on < new Date().toISOString().slice(0, 10);
        return [C.label(c.type), c.issuing_body || '', c.number || '', c.expires_on ? el('span', {}, C.date(c.expires_on), ' ', expired ? C.tag('Expired', 'warn') : null) : '', C.tag(C.label(c.result), statusTone(c.result)),
          canVerify ? el('div', { class: 'c-actions left' }, ['verified', 'rejected'].map(function (r) { return c.result === r ? null : el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: r === 'verified' ? 'Mark verified' : 'Reject', on: { click: function () { C.api('credentials/' + c.id, { result: r }).then(function () { C.render(); }).catch(C.fail); } } }); })) : ''];
      }), 'No credentials recorded yet.'));
      if (C.can('providers.edit')) cred.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Add a credential', on: { click: function () {
        var f = { type: C.select((C.meta.credentialTypes || ['other']).map(function (t) { return [t, C.label(t)]; }), 'licence'), body: C.input('text', '', { maxlength: 120 }), number: C.input('text', '', { maxlength: 80 }), exp: C.input('date', ''), ev: C.input('text', '', { maxlength: 300, placeholder: 'Where the document is kept' }) };
        C.dialog({ title: 'Add a credential', body: el('div', {}, C.field('Type', f.type), C.field('Issued by', f.body), C.field('Number', f.number), C.field('Expires on', f.exp), C.field('Where the proof is kept', f.ev)),
          onSubmit: function () { return C.api('providers/' + id + '/credentials', { type: f.type.value, issuing_body: f.body.value, number: f.number.value, expires_on: f.exp.value, evidence: f.ev.value }).then(function () { C.render(); }); } });
      } } }));
      v.append(cred);
      v.append(C.section('Cases', C.table(['Received', 'Case', 'Status'], d.cases.map(function (k) { return [C.dateTime(k.created_at), C.link(k.ref || k.service, '#/cases/' + k.id), statusTag(k.status)]; }), 'No cases assigned.')));
      v.append(C.section('Appointments', C.table(['When', 'Place', 'Status'], d.appointments.map(function (a) { return [C.dateTime(a.scheduled_at), a.place || '', statusTag(a.status)]; }), 'No appointments.')));
      v.append(C.section('History', el('ol', { class: 'c-timeline' }, d.timeline.map(function (t) { return el('li', {}, el('strong', { text: C.label(t.action) }), ' ', t.detail || '', el('div', { class: 'c-sub', text: C.dateTime(t.at) + (t.actor ? ' · ' + t.actor : '') })); }))));
      return v;
    });
  }

  // ============ My tasks
  C.route('tasks', 'Tasks', 'tasks.view', function () {
    var q = { assignee: 'me', status: 'open' }, body = el('div');
    function load() {
      return C.api('tasks?' + C.qs(q)).then(function (r) {
        body.replaceChildren(C.table(['Due', 'Task', 'Case', 'Who', ''], r.tasks.map(function (t) {
          var late = t.status === 'open' && t.due && Date.parse(t.due) < Date.now();
          return [t.due ? el('span', { class: late ? 'c-late' : '' }, (late ? 'Overdue · ' : '') + C.dateTime(t.due)) : 'No date', t.title, t.request_id ? C.link(t.ref || 'Open case', '#/cases/' + t.request_id) : '', t.assignee_name || '',
            t.status === 'open' && C.can('tasks.edit') ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Mark done', on: { click: function () { C.api('tasks/' + t.id + '/done', {}).then(load).catch(C.fail); } } }) : C.tag('Done', 'good')];
        }), q.status === 'open' ? 'Nothing waiting. Well done.' : 'No finished tasks.'));
      }).catch(C.fail);
    }
    var who = C.select([['me', 'Mine'], ['', 'Everyone\'s']], 'me', { on: { change: function () { q.assignee = this.value; load(); } } });
    var st = C.select([['open', 'To do'], ['done', 'Done']], 'open', { on: { change: function () { q.status = this.value; load(); } } });
    var v = el('div', {}, C.h('Tasks', 1), el('div', { class: 'c-filters' }, C.field('Show', who), C.field('Status', st)), body);
    load(); return v;
  });

  // ============ Invoices and payments
  C.route('invoices', 'Invoices', 'billing.view', function () {
    var q = { status: '', q: '' }, inv = el('div'), pay = el('div');
    function load() {
      return Promise.all([C.api('invoices?' + C.qs(q)), C.api('payments')]).then(function (r) {
        inv.replaceChildren(C.table(['Number', 'Date', 'Client', 'Service', 'Total', 'Status', 'Actions'], r[0].invoices.map(function (i) {
          var link = location.origin + '/invoice?id=' + i.id, acts = el('div', { class: 'c-actions left' }, el('a', { href: '/invoice?id=' + i.id, target: '_blank', rel: 'noopener', text: 'Open' }), el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy link', on: { click: function () { copy(link); } } }));
          if (i.status === 'issued') {
            if (i.email && C.can('billing.create')) acts.append(el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Email again', on: { click: function () { C.api('invoices/' + i.id + '/resend', {}).then(function () { C.say('Invoice emailed.'); }).catch(C.fail); } } }));
            acts.append(el('a', { href: C.waLink(i.phone, 'Hello ' + i.name + ', your invoice ' + i.number + ' (' + C.money(i.total) + '): ' + link), target: '_blank', rel: 'noopener', text: 'WhatsApp' }));
            if (C.can('billing.manage')) {
              acts.append(el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Mark paid', on: { click: function () {
                var ref = C.input('text', '', { required: true, maxlength: 80, placeholder: 'For example the bank or Mobile Money reference' });
                C.dialog({ title: 'Record a payment for ' + i.number, submit: 'Mark paid', body: C.field('Payment reference', ref), onSubmit: function () { return C.api('invoices/' + i.id + '/status', { status: 'paid', reference: ref.value }).then(function () { C.say('Marked paid.'); load(); }); } });
              } } }), el('button', { class: 'btn btn-ghost btn-small danger', type: 'button', text: 'Void', on: { click: function () {
                var why = C.input('text', '', { required: true, maxlength: 300 });
                C.dialog({ title: 'Void ' + i.number, submit: 'Void invoice', intro: 'A voided invoice cannot be paid. Its number is never reused.', body: C.field('Reason', why), onSubmit: function () { return C.api('invoices/' + i.id + '/status', { status: 'void', reason: why.value }).then(function () { C.say('Voided.'); load(); }); } });
              } } }));
            }
          }
          return [i.number, C.date(i.created_at), el('div', {}, i.name, el('div', { class: 'c-sub', text: i.phone })), i.service_label || '', C.money(i.total), statusTag(i.status === 'issued' ? 'due' : i.status), acts];
        }), 'No invoices yet.'));
        pay.replaceChildren(C.table(['Received', 'Invoice', 'Client', 'Amount', 'Channel', 'Reference', 'Source'], r[1].payments.map(function (p) { return [C.dateTime(p.received_at), p.invoice_number, p.name, C.money(p.amount), C.label(p.channel || ''), p.reference || '', C.label(p.source)]; }), 'No payments yet.'));
      }).catch(C.fail);
    }
    var status = C.select([['', 'All'], ['issued', 'Payment due'], ['paid', 'Paid'], ['void', 'Void']], '', { on: { change: function () { q.status = this.value; load(); } } });
    var search = C.input('search', '', { placeholder: 'Number, name or phone', on: { input: function () { clearTimeout(search.t); var s = this; search.t = setTimeout(function () { q.q = s.value; load(); }, 300); } } });
    var v = el('div', {}, C.h('Invoices and payments', 1), el('div', { class: 'c-filters' }, C.field('Status', status), C.field('Search', search)), inv, C.section('Payments received', pay));
    load(); return v;
  });

  // ============ Accounts
  C.route('accounts', 'Accounts', 'accounts.view', function () {
    var to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    var body = el('div'), f = C.input('date', from), t = C.input('date', to);
    function load() {
      return C.api('accounts/summary?' + C.qs({ from: f.value, to: t.value })).then(function (s) {
        var ex = C.can('accounts.export') ? el('div', { class: 'c-actions left' }, el('a', { class: 'btn btn-ghost btn-small', href: '/api/admin/accounts/export?' + C.qs({ type: 'invoices', from: f.value, to: t.value }), text: 'Download invoices (CSV)' }), el('a', { class: 'btn btn-ghost btn-small', href: '/api/admin/accounts/export?' + C.qs({ type: 'payments', from: f.value, to: t.value }), text: 'Download payments (CSV)' })) : null;
        body.replaceChildren(el('div', { class: 'c-tiles' }, C.tile('Invoiced (' + s.issued.n + ')', C.money(s.issued.total)), C.tile('Collected (' + s.paid.n + ')', C.money(s.paid.total), 'good'), C.tile('Voided (' + s.voided.n + ')', C.money(s.voided.total)), C.tile('Owed to us now (' + s.outstanding.count + ')', C.money(s.outstanding.total), s.outstanding.count ? 'warn' : '')), ex,
          C.section('Collected by service', C.table(['Service', 'Payments', 'Amount'], s.byService.map(function (r) { return [r.label, String(r.n), C.money(r.total)]; }), 'No payments in this period.')),
          C.section('Collected by payment method', C.table(['Method', 'Payments', 'Amount'], s.byChannel.map(function (r) { return [C.label(r.channel), String(r.n), C.money(r.total)]; }), 'No payments in this period.')),
          C.section('Collected by month', C.table(['Month', 'Payments', 'Amount'], s.byMonth.map(function (r) { return [r.month, String(r.n), C.money(r.total)]; }), 'No payments in this period.')),
          C.section('Unpaid invoices by age (as of today)', C.table(['Age', 'Invoices', 'Amount'], s.outstanding.ageing.map(function (r) { return [r.band, String(r.count), C.money(r.total)]; }))));
      }).catch(C.fail);
    }
    var v = el('div', {}, C.h('Accounts', 1), el('div', { class: 'c-filters' }, C.field('From', f), C.field('To', t), el('button', { class: 'btn btn-small', type: 'button', text: 'Update', on: { click: load } })), body);
    load(); return v;
  });
})();
