(function () {
  var $ = function (i) { return document.getElementById(i); };
  var err = $('error'), forms = ['login', 'mfa', 'recovery', 'setup'];
  var creds = { email: '', password: '' };

  function show(which) {
    forms.forEach(function (f) { $('form-' + f).hidden = f !== which; });
    err.hidden = true;
    var t = { login: ['Staff sign in', 'Use the email and password your owner gave you.'], mfa: ['Check your authenticator app', 'Open your authenticator app and type the current code.'],
      recovery: ['Use a recovery code', 'Each recovery code works once.'], setup: ['Set up your platform', 'Create the owner account. This only works the first time.'] }[which];
    $('title').textContent = t[0]; $('sub').textContent = t[1];
    var first = $('form-' + which).querySelector('input'); if (first) first.focus();
  }
  function say(msg) { err.textContent = msg; err.hidden = false; }
  function post(path, body) {
    return fetch('/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || 'Something went wrong. Please try again.'); return j; }); });
  }
  function busy(form, on) { var b = form.querySelector('button[type=submit]'); b.disabled = on; }
  function submit(form, fn) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true; busy(form, true);
      fn().catch(function (x) { say(x.message); }).then(function () { busy(form, false); });
    });
  }
  function done() { location.replace('./'); }

  document.querySelectorAll('.pw-show').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = $(b.dataset['for']), on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
    });
  });

  submit($('form-login'), function () {
    creds.email = $('email').value.trim(); creds.password = $('password').value;
    return post('login', creds).then(function (j) { if (j.mfa) { show('mfa'); return; } done(); });
  });
  submit($('form-mfa'), function () { return post('login', { email: creds.email, password: creds.password, code: $('code').value }).then(done); });
  submit($('form-recovery'), function () { return post('login', { email: creds.email, password: creds.password, recovery: $('recovery').value }).then(done); });
  submit($('form-setup'), function () { return post('setup', { code: $('s-code').value, name: $('s-name').value, email: $('s-email').value, password: $('s-pass').value }).then(done); });
  $('use-recovery').addEventListener('click', function () { show('recovery'); });
  $('back-mfa').addEventListener('click', function () { show('mfa'); });

  fetch('/api/auth/state').then(function (r) { return r.json(); }).then(function (s) {
    if (s.signedIn) { done(); return; }
    show(s.setupNeeded ? 'setup' : 'login');
  }).catch(function () { show('login'); say('The platform is not reachable right now. Please try again in a moment.'); });
})();
