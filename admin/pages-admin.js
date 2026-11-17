// Set-up and oversight screens: services and prices, settings (email, payments), staff, audit log.
(function () {
  var C = window.C, el = C.el;

  // ============ Services and prices
  function serviceDialog(s) {
    var isNew = !s; s = s || { billing: 'fixed', lines: [], active: true };
    var f = { value: C.input('text', s.value || '', { required: true, maxlength: 80, disabled: !isNew }), label: C.input('text', s.label || '', { required: true, maxlength: 120 }),
      billing: C.select([['fixed', 'Fixed fee: invoice issued at once'], ['quote', 'Quote: staff issue the invoice after agreeing the price'], ['none', 'No charge']], s.billing) };
    var editor = C.lineEditor(s.lines), active = C.check('Offered on the website', s.active);
    var priceBox = el('div', {}, el('p', { class: 'c-hint', text: 'For a fixed fee, list the lines the client will be invoiced for. Show the provider charge and our coordination fee separately.' }), editor);
    function sync() { priceBox.hidden = f.billing.value === 'none'; } f.billing.addEventListener('change', sync); sync();
    C.dialog({ title: isNew ? 'Add a service' : 'Edit ' + s.label, body: el('div', {}, isNew ? C.field('Short key (as stored with each request)', f.value, 'Letters, numbers, spaces and hyphens. Cannot be changed later.') : null, C.field('Name shown to clients', f.label), C.field('How it is billed', f.billing), priceBox, active.box),
      onSubmit: function () {
        var body = { label: f.label.value, billing: f.billing.value, lines: f.billing.value === 'none' ? [] : editor.read(), active: active.input.checked };
        if (isNew) body.value = f.value.value;
        return C.api(isNew ? 'services' : 'services/' + encodeURIComponent(s.value) + '/update', body).then(function () { C.say('Saved.'); return C.api('meta').then(function (m) { C.meta = m; C.render(); }); });
      } });
  }
  C.route('services', 'Services and prices', 'services.view', function () {
    return C.api('services').then(function (r) {
      var total = function (s) { return s.lines.reduce(function (t, l) { return t + l.amount; }, 0); };
      var v = el('div', {}, C.h('Services and prices', 1),
        el('p', { class: 'c-note', text: 'These are the services visitors can choose on the website and what each costs. Prices stay as placeholders until you turn on "Prices are confirmed" under Settings, Billing and prices.' }),
        C.table(['Service', 'Billing', 'Price', 'On the website', ''], r.services.map(function (s) {
          return [s.label, C.label(s.billing === 'fixed' ? 'fixed fee' : s.billing === 'quote' ? 'quote' : 'no charge'), s.billing === 'fixed' ? C.money(total(s)) : '', s.active ? C.tag('Shown', 'good') : C.tag('Hidden', 'warn'),
            C.can('services.edit') ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Edit', on: { click: function () { serviceDialog(s); } } }) : ''];
        })));
      if (C.can('services.edit')) v.append(el('button', { class: 'btn btn-small', type: 'button', text: 'Add a service', on: { click: function () { serviceDialog(null); } } }));
      return v;
    });
  });

  // ============ Settings
  C.route('settings', 'Settings', 'settings.view', function () {
    return C.api('settings').then(function (d) {
      var tab = (location.hash.split('?tab=')[1]) || d.groups[0].id, canEdit = C.can('settings.edit');
      var v = el('div', {}, C.h('Settings', 1));
      if (!d.encryptionKeySet) v.append(el('p', { class: 'c-alert', role: 'alert', text: 'The encryption key is missing, so API keys cannot be saved yet. In Cloudflare add a secret called SETTINGS_ENC_KEY (at least 24 random characters), redeploy, then come back.' }));
      v.append(el('div', { class: 'c-tabs', role: 'tablist' }, d.groups.map(function (g) {
        return el('a', { href: '#/settings?tab=' + g.id, role: 'tab', 'aria-selected': String(g.id === tab), text: g.label });
      })));
      var inputs = {}, clears = {};
      var form = el('form', { class: 'c-form' });
      d.settings.filter(function (s) { return s.group === tab; }).forEach(function (s) {
        var inp, hint = s.help || '';
        if (s.type === 'bool') { var ck = C.check(s.label, s.value === 'true'); ck.input.disabled = !canEdit || !!s.readonly; inputs[s.key] = ck.input; form.append(ck.box); if (hint) form.append(el('p', { class: 'c-hint', text: hint })); return; }
        if (s.type === 'select') inp = C.select(s.options, s.value || s.default);
        else if (s.type === 'textarea') inp = C.textarea(s.value, { maxlength: 600 });
        else if (s.type === 'secret') { inp = C.input('password', '', { autocomplete: 'off', placeholder: s.set ? 'Saved. Type a new one to replace it.' : 'Not saved yet' }); hint = (s.set ? 'A key is saved and cannot be shown again. ' : '') + hint; }
        else inp = C.input(s.type === 'email' ? 'email' : 'text', s.value);
        inp.disabled = !canEdit; inputs[s.key] = inp;
        var fieldNode = C.field(s.label, inp, hint); form.append(fieldNode);
        if (s.type === 'secret' && s.set && canEdit) { var cl = C.check('Remove the saved key', false); clears[s.key] = cl.input; form.append(cl.box); }
      });
      if (canEdit) form.append(el('button', { class: 'btn btn-small', type: 'submit', text: 'Save settings' }));
      form.addEventListener('submit', function (e) {
        e.preventDefault(); var values = {}, clear = [];
        Object.keys(inputs).forEach(function (k) {
          var i = inputs[k], def = d.settings.filter(function (s) { return s.key === k; })[0];
          if (def.readonly) return;
          if (def.type === 'bool') { if (String(i.checked) !== (def.value || 'false')) values[k] = String(i.checked); }
          else if (def.type === 'secret') { if (i.value) values[k] = i.value; if (clears[k] && clears[k].checked) clear.push(k); }
          else if (i.value !== (def.value || '')) values[k] = i.value;
        });
        if (!Object.keys(values).length && !clear.length) { C.say('Nothing changed.'); return; }
        C.api('settings', { values: values, clear: clear }).then(function () { C.say('Settings saved.'); C.render(); }).catch(C.fail);
      });
      v.append(form);

      if (tab === 'email' && canEdit) {
        var to = C.input('email', C.me.email);
        v.append(C.section('Check that email works', el('p', { class: 'c-note', text: 'Save your settings first, then send a test message.' }), C.field('Send the test to', to),
          el('button', { class: 'btn btn-small', type: 'button', text: 'Send a test email', on: { click: function () { C.api('settings/test-email', { to: to.value }).then(function (r) { C.say('Test email sent to ' + r.to + '.'); C.render(); }).catch(C.fail); } } })));
        v.append(C.section('Recent emails', C.table(['When', 'Kind', 'To', 'Result'], d.emailLog.map(function (m) { return [C.dateTime(m.at), m.kind || '', m.recipient || '', m.ok ? C.tag('Sent', 'good') : C.tag('Failed: ' + (m.error || ''), 'warn')]; }), 'No emails sent yet.')));
      }
      if (tab === 'payments') {
        v.append(C.section('Set up Paystack', el('ol', { class: 'c-steps' },
          el('li', { text: 'In your Paystack dashboard open Settings, then API Keys and Webhooks.' }),
          el('li', {}, 'Set the webhook URL to ', el('code', { text: d.webhookUrl }), ' ', el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy', on: { click: function () { navigator.clipboard && navigator.clipboard.writeText(d.webhookUrl).then(function () { C.say('Copied.'); }); } } })),
          el('li', { text: 'Paste your secret key above (start with the test key), save, and press the test button.' })),
          canEdit ? el('button', { class: 'btn btn-small', type: 'button', text: 'Test the Paystack connection', on: { click: function () { C.api('settings/test-payments', {}).then(function (r) { C.say('Paystack accepted the key (' + r.mode + ' mode).'); C.render(); }).catch(C.fail); } } }) : null));
      }
      return v;
    });
  });

  // ============ My account: password and two-step sign-in
  function authPost(path, body) {
    return fetch('/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || 'Something went wrong.'); return j; }); });
  }
  C.route('account', 'My account', null, function () {
    var me = C.me, v = el('div', {}, C.h('My account', 1), el('p', { class: 'c-note', text: me.name + ' · ' + me.email + ' · ' + me.roleLabel }));
    if (me.mustChange) v.append(el('p', { class: 'c-alert', role: 'alert', text: 'Please choose your own password now. The one you were given was only for your first sign-in.' }));
    else if (me.mfaRequired && !me.mfaEnabled) v.append(el('p', { class: 'c-alert', role: 'alert', text: 'Your role needs an authenticator app. Set it up below to continue.' }));

    var cur = C.input('password', '', { autocomplete: 'current-password', required: true }), nxt = C.input('password', '', { autocomplete: 'new-password', required: true }), again = C.input('password', '', { autocomplete: 'new-password', required: true });
    v.append(C.section('Change password', el('form', { class: 'c-form', on: { submit: function (e) {
      e.preventDefault(); if (nxt.value !== again.value) { C.say('The two new passwords are different.', true); return; }
      authPost('password', { current: cur.value, next: nxt.value }).then(function () { C.say('Password changed.'); return C.api('me').then(function (r) { C.me = r.me; location.reload(); }); }).catch(C.fail);
    } } }, C.field('Current password', cur), C.field('New password', nxt, 'At least 10 characters, with letters and a number or symbol.'), C.field('New password again', again), el('button', { class: 'btn btn-small', type: 'submit', text: 'Change password' }))));

    var box = C.section('Two-step sign-in (authenticator app)');
    function showCodes(codes) {
      box.replaceChildren(el('h2', { text: 'Two-step sign-in (authenticator app)' }), el('p', { class: 'c-alert', text: 'Authenticator app is on. Save these recovery codes now. They are shown only once. Each works one time if you lose your phone.' }),
        el('ul', { class: 'c-codes' }, codes.map(function (c) { return el('li', {}, el('code', { text: c })); })),
        el('button', { class: 'btn btn-small', type: 'button', text: 'I have saved them', on: { click: function () { C.api('me').then(function (r) { C.me = r.me; location.hash = '#/dashboard'; location.reload(); }); } } }));
    }
    if (me.mfaEnabled) {
      box.append(el('p', {}, C.tag('On', 'good'), ' You will be asked for a code from your phone each time you sign in.'));
      if (!me.mfaRequired) {
        var pw = C.input('password', '', { autocomplete: 'current-password' });
        box.append(C.field('Password (to turn it off)', pw), el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Turn off', on: { click: function () { authPost('mfa/disable', { password: pw.value }).then(function () { C.say('Turned off.'); location.reload(); }).catch(C.fail); } } }));
      } else box.append(el('p', { class: 'c-hint', text: 'Your role must use this, so it cannot be turned off. If you lose your phone, use a recovery code, or ask the owner to reset it.' }));
    } else {
      box.append(el('p', { class: 'c-note', text: 'Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy). It makes a new 6-digit code every 30 seconds.' }),
        el('button', { class: 'btn btn-small', type: 'button', text: 'Set up the authenticator app', on: { click: function () {
          authPost('mfa/begin').then(function (r) {
            var code = C.input('text', '', { inputmode: 'numeric', maxlength: 7, autocomplete: 'one-time-code', required: true });
            box.replaceChildren(el('h2', { text: 'Two-step sign-in (authenticator app)' }), el('ol', { class: 'c-steps' },
              el('li', { text: 'In the app choose Add account, then Enter a setup key.' }),
              el('li', {}, 'Account: ', el('strong', { text: me.email }), '. Key: ', el('code', { class: 'c-key', text: r.secret.replace(/(.{4})/g, '$1 ').trim() })),
              el('li', {}, 'Or on a phone, tap this link: ', el('a', { href: r.uri, text: 'open in my authenticator app' })),
              el('li', { text: 'Type the 6-digit code the app shows.' })),
              el('form', { class: 'c-form', on: { submit: function (e) { e.preventDefault(); authPost('mfa/confirm', { code: code.value }).then(function (res) { showCodes(res.recoveryCodes); }).catch(C.fail); } } }, C.field('Code from the app', code), el('button', { class: 'btn btn-small', type: 'submit', text: 'Turn on' })));
          }).catch(C.fail);
        } } }));
    }
    v.append(box);
    return v;
  });

  // ============ Staff
  C.route('staff', 'Staff', 'staff.edit', function () {
    return C.api('staff').then(function (r) {
      var roleOptions = Object.keys(r.roles).filter(function (k) { return C.me.role === 'superadmin' || ['superadmin', 'owner'].indexOf(k) < 0; }).map(function (k) { return [k, r.roles[k]]; });
      function tempDialog(name, pw) {
        C.dialog({ title: 'One-time password for ' + name, submit: 'Done', body: el('div', {}, el('p', { class: 'c-note', text: 'Shown only once. They must choose a new password when they sign in.' }), el('p', {}, el('code', { class: 'c-key', text: pw })), el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Copy', on: { click: function () { navigator.clipboard && navigator.clipboard.writeText(pw).then(function () { C.say('Copied.'); }); } } })), onSubmit: function () { return Promise.resolve(); } });
      }
      function staffDialog(s) {
        var isNew = !s; s = s || { role: 'coordinator', active: 1 };
        var tools = isNew ? null : el('div', { class: 'c-actions left' },
          el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Reset password', on: { click: function () { C.api('staff/' + s.id + '/update', { reset_password: true }).then(function (res) { tempDialog(s.name, res.tempPassword); }).catch(C.fail); } } }),
          s.totp_enabled ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Reset authenticator', on: { click: function () { C.api('staff/' + s.id + '/update', { reset_mfa: true }).then(function () { C.say('Authenticator reset. They set it up again at next sign-in.'); C.render(); }).catch(C.fail); } } }) : null);
        var f = { name: C.input('text', s.name || '', { required: true }), email: C.input('email', s.email || '', { required: true, disabled: !isNew }), role: C.select(roleOptions, s.role) }, act = C.check('Can sign in', !!s.active);
        C.dialog({ title: isNew ? 'Add a staff member' : 'Edit ' + s.name, intro: isNew ? 'You will be shown a one-time password. Give it to them in person or by phone. They choose their own when they first sign in.' : '',
          body: el('div', {}, C.field('Name', f.name), C.field('Email', f.email), C.field('Role', f.role), isNew ? null : act.box, tools),
          onSubmit: function () { return (isNew ? C.api('staff', { name: f.name.value, email: f.email.value, role: f.role.value }) : C.api('staff/' + s.id + '/update', { name: f.name.value, role: f.role.value, active: act.input.checked })).then(function (res) { if (res.tempPassword) tempDialog(f.name.value, res.tempPassword); else C.say('Saved.'); C.render(); }); } });
      }
      return el('div', {}, C.h('Staff', 1), el('p', { class: 'c-note', text: 'Each role sees only what it needs. Coordinators see health details; finance sees money; administrators see settings.' }),
        C.table(['Name', 'Email', 'Role', 'Last seen', 'Two-step', 'Status', ''], r.staff.map(function (s) {
          return [s.name, s.email, r.roles[s.role] || s.role, s.last_seen ? C.dateTime(s.last_seen) : 'Never', s.totp_enabled ? C.tag('On', 'good') : C.tag('Off'), s.active ? C.tag('Active', 'good') : C.tag('Switched off', 'warn'), el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Edit', on: { click: function () { staffDialog(s); } } })];
        })), el('button', { class: 'btn btn-small', type: 'button', text: 'Add a staff member', on: { click: function () { staffDialog(null); } } }));
    });
  });

  // ============ Audit log
  C.route('audit', 'Audit log', 'audit.view', function () {
    var body = el('div'), entity = '', result = el('p', { class: 'c-note', role: 'status' });
    function load() {
      return C.api('audit?' + C.qs({ entity: entity, limit: 200 })).then(function (r) {
        body.replaceChildren(C.table(['When', 'Who', 'What', 'Detail'], r.events.map(function (e) { return [C.dateTime(e.at), e.actor || 'system', C.label(e.entity) + ' · ' + C.label(e.action), e.detail || '']; }), 'Nothing recorded.'));
      }).catch(C.fail);
    }
    var sel = C.select([['', 'Everything'], ['case', 'Cases'], ['client', 'Clients'], ['provider', 'Providers'], ['invoice', 'Invoices'], ['settings', 'Settings'], ['staff', 'Staff'], ['service', 'Services']], '', { on: { change: function () { entity = this.value; load(); } } });
    var v = el('div', {}, C.h('Audit log', 1), el('p', { class: 'c-note', text: 'Every change is recorded with who made it and when. Entries are chained together, so an entry that was removed or edited afterwards is detected.' }),
      el('div', { class: 'c-filters' }, C.field('Show', sel), el('button', { class: 'btn btn-small', type: 'button', text: 'Check the log is intact', on: { click: function () {
        C.api('audit/verify').then(function (r) { result.textContent = r.ok ? 'The log is intact (' + r.checked + ' protected entries checked).' : 'Warning: ' + r.reason + ' (entry ' + r.brokenAt + ').'; result.className = r.ok ? 'c-note' : 'c-error'; }).catch(C.fail);
      } } })), result, body);
    load(); return v;
  });
})();
