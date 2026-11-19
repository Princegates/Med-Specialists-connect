(function () {
  var $ = function (i) { return document.getElementById(i); };
  var err = $('error'), forms = ['login', 'mfa', 'recovery', 'setup'];
  var creds = { email: '', password: '' };

  function show(which) {
    forms.forEach(function (f) { $('form-' + f).hidden = f !== which; });
    err.hidden = true;
    var t = { login: ['Staff sign in', 'Use the email and password your owner gave you.'], mfa: ['Check your authenticator app', 'Open your authenticator app and type the current code.'],
      recovery: ['Use a recovery code', 'Each recovery code works once.'], setup: ['Set up your platform', 'Create the super administrator account. This only works the first time.'] }[which];
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
  if (/[?&]idle=1/.test(location.search)) say('You were signed out because the page was not used for a while. This protects patient records. Please sign in again.');

  document.querySelectorAll('.pw-show').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = $(b.dataset['for']), on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
    });
  });

  submit($('form-login'), function () {
    creds.email = $('email').value.trim(); creds.password = $('password').value;
    return post('login', creds).then(function (j) {
      if (!j.mfa) { done(); return; }
      show('mfa');
      $('mfa-code-part').hidden = !j.totp; $('code').required = !!j.totp; $('use-recovery').hidden = !j.totp;
      $('use-passkey').hidden = !(j.passkey && window.PublicKeyCredential); $('passkey-hint').hidden = $('use-passkey').hidden;
      if (!j.totp) { $('sub').textContent = 'Use your phone or a passkey to finish signing in.'; }
    });
  });
  submit($('form-mfa'), function () { return post('login', { email: creds.email, password: creds.password, code: $('code').value }).then(done); });
  // Passkey: ask for a fresh challenge, let the browser and phone prove who you are, then send the proof.
  var b64 = {
    enc: function (buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec: function (str) { var s = String(str).replace(/-/g, '+').replace(/_/g, '/'); s += '==='.slice((s.length + 3) % 4); var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
  };
  $('use-passkey').addEventListener('click', function () {
    err.hidden = true; var btn = $('use-passkey'); btn.disabled = true;
    post('login', creds).then(function (j) {
      if (!j.passkey) throw new Error('No passkey is set up for this account.');
      var o = j.passkey.publicKey;
      return navigator.credentials.get({ publicKey: { challenge: b64.dec(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
        allowCredentials: o.allowCredentials.map(function (c) { return { type: c.type, id: b64.dec(c.id) }; }) } }).then(function (cred) {
        return post('login', { email: creds.email, password: creds.password, passkey: { challengeId: j.passkey.challengeId, credential: { id: cred.id, response: {
          clientDataJSON: b64.enc(cred.response.clientDataJSON), authenticatorData: b64.enc(cred.response.authenticatorData), signature: b64.enc(cred.response.signature) } } } });
      });
    }).then(done).catch(function (x) {
      say(x && x.name === 'NotAllowedError' ? 'The passkey was cancelled or did not work. Please try again.' : (x && x.message) || 'The passkey did not work. Please try again.');
    }).then(function () { btn.disabled = false; });
  });
  submit($('form-recovery'), function () { return post('login', { email: creds.email, password: creds.password, recovery: $('recovery').value }).then(done); });
  submit($('form-setup'), function () { return post('setup', { code: $('s-code').value, name: $('s-name').value, email: $('s-email').value, password: $('s-pass').value }).then(done); });
  $('use-recovery').addEventListener('click', function () { show('recovery'); });
  $('back-mfa').addEventListener('click', function () { show('mfa'); });

  fetch('/api/auth/state').then(function (r) { return r.json(); }).then(function (s) {
    if (s.signedIn) { done(); return; }
    show(s.setupNeeded ? 'setup' : 'login');
  }).catch(function () { show('login'); say('The platform is not reachable right now. Please try again in a moment.'); });
})();
