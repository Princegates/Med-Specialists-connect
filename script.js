(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');

  function setOpen(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function () {
    setOpen(!nav.classList.contains('open'));
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Day / night mode. Without a saved choice the page follows the device setting.
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme-toggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : !!(mq && mq.matches);
  }
  function syncTheme() {
    var dark = isDark();
    var label = dark ? 'Switch to day mode' : 'Switch to night mode';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.setAttribute('title', label);
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#120b0f' : '#1f1a1d');
  }
  function applyTheme(next) {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncTheme();
  }
  // Where the browser can, the new colours grow out of the switch as a circle; otherwise they simply change.
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    if (!document.startViewTransition || !motionOk()) { applyTheme(next); return; }
    var b = themeBtn.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    var reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add('theme-vt');
    var vt = document.startViewTransition(function () { applyTheme(next); });
    vt.ready.then(function () {
      root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + reach + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 650, easing: 'cubic-bezier(.2, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
    vt.finished.then(function () { root.classList.remove('theme-vt'); }, function () { root.classList.remove('theme-vt'); });
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);
  syncTheme();

  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = false;
  function motionOk() { return !(mqReduce && mqReduce.matches) && document.documentElement.getAttribute('data-motion') !== 'reduced'; }
  reduceMotion = !motionOk();

  // Header shadow once the page has scrolled
  var header = document.querySelector('.site-header');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Under "How it works", the line between the stations draws once when it comes into view.
  var stepsEl = document.querySelector('.steps');
  if (stepsEl && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { stepsEl.classList.add('in'); sio.disconnect(); } }); }, { threshold: .3 });
    sio.observe(stepsEl);
  } else if (stepsEl) { stepsEl.classList.add('in'); }

  // Date pickers can't pick a day that has already passed
  var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  document.querySelectorAll('input[type="date"]').forEach(function (d) { d.min = today.toISOString().slice(0, 10); });

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Photos: if a file has not been added yet, show a labelled slot instead of a broken image.
  document.querySelectorAll('.photo').forEach(function (fig) {
    var img = fig.querySelector('img');
    function missing() { fig.classList.add('missing'); }
    if (img.complete && img.naturalWidth === 0) missing();
    img.addEventListener('error', missing);
  });

  // Forms. When FORM_ACCESS_KEY is set, requests are sent to the team's inbox through
  // Web3Forms (https://web3forms.com, free key tied to your email). With no key,
  // the forms fall back to opening the visitor's email app with the message filled in.
  var FORM_ACCESS_KEY = '11912d53-78d8-40a3-8eda-9004e9c63938';
  var TEAM_EMAIL = 'info@medspecialistconnect.com';
  var WHATSAPP_URL = 'https://wa.me/233243560080';

  // Reads the labelled fields of a form as [label, value, name] rows, so emails
  // show readable questions and answers.
  function collect(form) {
    var rows = [];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === 'botcheck' || el.disabled || el.tagName === 'BUTTON') return;
      if (el.type === 'checkbox') {
        if (el.checked && el.name === 'consent') rows.push(['Consent', 'Agreed to the privacy notice', 'consent']);
        return;
      }
      if (el.type === 'radio' && !el.checked) return;
      if (el.value === '') return;
      var label = el.name;
      if (el.name === 'visit') { rows.push(['Visit', el.value === 'home' ? 'Home visit' : 'Private consultation', 'visit']); return; }
      if (el.name === 'name') label = 'name';
      else if (el.id) {
        var l = form.querySelector('label[for="' + el.id + '"]');
        if (l) {
          var copy = l.cloneNode(true), opt = copy.querySelector('.opt');
          if (opt) opt.remove();
          label = copy.textContent.replace(/\s+/g, ' ').replace(/\?$/, '').trim();
        }
      }
      rows.push([label, el.value, el.name]);
    });
    return rows;
  }

  function mailtoFallback(subject, rows) {
    var body = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
    window.location.href = 'mailto:' + TEAM_EMAIL +
      '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  // Billing backend: switched on from Cloudflare settings. Until then these calls fail quietly
  // and the forms behave exactly as before.
  var billing = { on: false };
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) { billing.on = !!c.billingEnabled; }).catch(function () {});

  // Safety notice: shown as soon as someone says it is an emergency, before they send anything.
  var urgSel = document.getElementById('r-urgency'), safety = document.getElementById('r-safety');
  if (urgSel && safety) urgSel.addEventListener('change', function () { safety.hidden = !/^Emergency/.test(urgSel.value); });

  function money(pesewas) { return 'GH\u20B5' + (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Stores the care request. A refusal with a message (for example a bad phone number) is shown to the person;
  // anything else (backend off or unreachable) returns {skipped:true} so the email path carries on alone.
  function postApi(form) {
    var f = new FormData(form);
    var body = {
      service: f.get('service'), for_whom: f.get('for_whom'), urgency: f.get('urgency'), message: f.get('message'),
      name: f.get('name'), phone: f.get('phone'), email: f.get('email'), preferred_date: f.get('preferred_date'),
      call_time: f.get('call_time'), area: f.get('area'), visit: f.get('visit') || '', consent: !!f.get('consent'), botcheck: f.get('botcheck') ? 'x' : ''
    };
    return fetch('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().then(function (j) {
          if (r.ok && j.ok) return j;
          if (r.status >= 400 && r.status < 500 && j.error) { var e = new Error(j.error); e.user = true; throw e; }
          return { skipped: true };
        });
      })
      .catch(function (e) { if (e && e.user) throw e; return { skipped: true }; });
  }

  document.querySelectorAll('form[data-subject]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    var hint = form.querySelector('.hint');
    var success = form.dataset.success || 'Thank you. We have your message and will be in touch soon.';
    if (FORM_ACCESS_KEY && hint && form.dataset.hint) hint.textContent = form.dataset.hint;

    function say(text, kind, html) {
      status.className = 'form-status ' + kind;
      if (html) status.innerHTML = text; else status.textContent = text;
    }

    // After a care request the whole form is replaced by one clear thank-you panel, so nobody has to scroll to find it.
    function thankYou(res) {
      var h = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      var ref = res.ref ? '<p class="thanks-ref">Your case reference: <strong>' + h(res.ref) + '</strong></p>' : '';
      var follow = res.track ? '<a class="btn btn-ghost" href="' + res.track + '">Follow your request</a>' : '';
      var html, kind = 'ok';
      if (res.emergency) {
        kind = 'err';
        html = '<h3 tabindex="-1">If someone is in danger, call 112 now</h3><p>We have flagged your request as urgent and will call you straight away.</p>' + ref +
          '<div class="thanks-actions"><a class="btn" href="tel:112">Call 112</a>' + follow + '</div>';
      } else if (res.invoice) {
        html = '<h3 tabindex="-1">Thank you. Your request has been received.</h3><p>Your invoice <strong>' + h(res.invoice.number) + '</strong> (' + money(res.invoice.total) + ') is ready. Pay it to confirm your request.</p>' + ref +
          '<div class="thanks-actions"><a class="btn" href="' + res.invoice.url + '" target="_blank" rel="noopener">View and pay your invoice<span class="sr"> (opens in a new tab)</span></a>' + follow + '</div>';
      } else if (res.billing === 'quote') {
        html = '<h3 tabindex="-1">Thank you. Your request has been received.</h3><p>We will confirm the cost and send you an estimate before you pay.</p>' + ref + (follow ? '<div class="thanks-actions">' + follow + '</div>' : '');
      } else {
        html = '<h3 tabindex="-1">Thank you. Your request has been received.</h3><p>' + h(success.replace(/^Thank you\.\s*/, '')) + '</p>' + ref + (follow ? '<div class="thanks-actions">' + follow + '</div>' : '');
      }
      html += '<p class="thanks-again"><button type="button" class="linkish" data-again>Make another request</button></p>';
      status.className = 'form-status thanks ' + kind; status.innerHTML = html;
      form.classList.add('done');
      var reduce = document.documentElement.getAttribute('data-motion') === 'reduced' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      status.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      var hd = status.querySelector('h3'); if (hd) hd.focus({ preventScroll: true });
    }
    status.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('[data-again]')) return;
      form.classList.remove('done'); say('', '');
      if (form.wizard) form.wizard.go(0);
      form.scrollIntoView({ block: 'start' });
      var first = form.querySelector('select, input:not([type=hidden]):not(.hp)'); if (first) first.focus({ preventScroll: true });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.wizard && !form.wizard.atLast()) { form.wizard.next(); return; } // Enter pressed before the last step
      var rows = collect(form);
      function get(n) { var r = rows.filter(function (x) { return x[2] === n; })[0]; return r ? r[1] : ''; }
      var urgent = /^Urgent/.test(get('urgency'));
      var topic = get('service') || get('specialty');
      var subject = (urgent ? '[URGENT] ' : '') + form.dataset.subject + (topic ? ': ' + topic : '') + ' from ' + get('name');

      if (!FORM_ACCESS_KEY) { mailtoFallback(subject, rows); return; }

      // Spam trap: real visitors never tick the hidden box.
      if (new FormData(form).get('botcheck')) { say(success, 'ok'); form.reset(); return; }

      var label = button.textContent;
      button.disabled = true; button.textContent = 'Sending…';
      say('', '');

      var payload = { access_key: FORM_ACCESS_KEY, subject: subject, from_name: 'MEDs Specialists Connect website' };
      rows.forEach(function (r) { payload[r[0]] = r[1]; });

      // When the billing system is switched on, the request is stored first (and a fixed-fee invoice is
      // issued); the team email is sent either way. If the billing system is off or unreachable, only the email goes.
      var apiStep = (form.id === 'request-form' && billing.on) ? postApi(form) : Promise.resolve({ skipped: true });
      apiStep.then(function (res) {
        if (res.invoice) { payload['Invoice number'] = res.invoice.number; payload['Invoice link'] = location.origin + res.invoice.url; }
        if (res.requestId) { payload['Case reference'] = res.ref || res.requestId.slice(0, 8); payload['Billing status'] = res.status; }
        if (res.teamNotified) return res; // our own system has already emailed the team: do not send a second copy to a third-party service
        return fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data.success) throw new Error(data.message || 'failed');
          return res;
        }).catch(function (e) {
          if (res.requestId) return res; // already stored, so the request is not lost
          throw e;
        });
      }).then(function (res) {
        var trackNote = res.track ? ' Your case reference is ' + res.ref + '. <a href="' + res.track + '">Follow your request here</a>.' : '';
        if (form.id === 'request-form') { thankYou(res); form.reset(); return; }
        if (res.emergency) {
          say('<strong>If someone is in danger, call 112 now.</strong> We have flagged your request as urgent and will call you straight away.' + trackNote, 'err', true);
        } else if (res.invoice) {
          say('Thank you. Your invoice ' + res.invoice.number + ' (' + money(res.invoice.total) + ') is ready. ' +
            '<a href="' + res.invoice.url + '" target="_blank" rel="noopener">View and pay your invoice<span class="sr"> (opens in a new tab)</span></a>.' + trackNote, 'ok', true);
        } else if (res.billing === 'quote') {
          say('Thank you. We have your request. We will confirm the cost and send you an estimate before you pay.' + trackNote, 'ok', true);
        } else if (res.track) {
          say(success + trackNote, 'ok', true);
        } else {
          say(success, 'ok');
        }
        form.reset();
      }).catch(function (e) {
        if (e && e.user) { say(e.message, 'err'); return; }
        say('We could not send that just now, and your details are still here. Please try again, or reach us on ' +
          '<a href="tel:+233243560080">0243 560 080</a> or <a href="' + WHATSAPP_URL + '" target="_blank" rel="noopener">WhatsApp</a>.', 'err', true);
      }).then(function () {
        button.disabled = false; button.textContent = label;
      });
    });
  });

  /* ================= Display options (saved on this device only) ================= */
  var optsBtn = document.getElementById('opts-btn'), optsDlg = document.getElementById('opts');
  function readPrefs() { try { return JSON.parse(localStorage.getItem('prefs') || '{}'); } catch (e) { return {}; } }
  function writePrefs(p) { try { localStorage.setItem('prefs', JSON.stringify(p)); } catch (e) {} }
  function applyPref(k, v) { if (v) root.setAttribute('data-' + k, v); else root.removeAttribute('data-' + k); }
  if (optsBtn && optsDlg && optsDlg.showModal) {
    var optsForm = optsDlg.querySelector('form');
    function syncOpts() {
      var p = readPrefs();
      ['size', 'font', 'motion'].forEach(function (k) { var v = p[k] || ''; var r = optsForm.querySelector('input[name="' + k + '"][value="' + v + '"]'); if (r) r.checked = true; });
      optsForm.querySelector('input[name="contrast"]').checked = p.contrast === 'high';
      var t = optsForm.querySelector('input[name="theme"][value="' + (isDark() ? 'dark' : 'light') + '"]'); if (t) t.checked = true;
    }
    optsBtn.addEventListener('click', function () { syncOpts(); optsDlg.showModal(); });
    optsForm.addEventListener('change', function (e) {
      var n = e.target.name, p = readPrefs();
      if (n === 'theme') { root.setAttribute('data-theme', e.target.value); try { localStorage.setItem('theme', e.target.value); } catch (x) {} syncTheme(); return; }
      if (n === 'contrast') p.contrast = e.target.checked ? 'high' : ''; else p[n] = e.target.value;
      applyPref(n, p[n]); writePrefs(p);
    });
    document.getElementById('opts-reset').addEventListener('click', function () {
      writePrefs({}); ['size', 'contrast', 'motion', 'font'].forEach(function (k) { root.removeAttribute('data-' + k); });
      root.removeAttribute('data-theme'); try { localStorage.removeItem('theme'); } catch (e) {} syncTheme(); syncOpts();
    });
    optsDlg.addEventListener('click', function (e) { if (e.target === optsDlg) optsDlg.close(); });
  } else if (optsBtn) { optsBtn.hidden = true; }

  /* ================= Listen to this (the browser's own voice; nothing is sent anywhere) ================= */
  var synth = window.speechSynthesis;
  var listenBtns = document.querySelectorAll('[data-listen]');
  function stopListening() { if (synth) synth.cancel(); listenBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); b.querySelector('span').textContent = 'Listen to this'; }); }
  listenBtns.forEach(function (btn) {
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-pressed') === 'true') { stopListening(); return; }
      stopListening();
      var text = btn.getAttribute('data-listen').split(',').map(function (sel) { var n = document.querySelector(sel.trim()); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }).filter(Boolean).join('. ');
      var u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = .95;
      u.onend = u.onerror = stopListening;
      btn.setAttribute('aria-pressed', 'true'); btn.querySelector('span').textContent = 'Stop listening';
      synth.speak(u);
    });
  });
  window.addEventListener('pagehide', function () { if (synth) synth.cancel(); });

  /* ================= Request form in three steps ================= */
  var rform = document.getElementById('request-form');
  if (rform) {
    var steps = [].slice.call(rform.querySelectorAll('.step')), head = rform.querySelector('.wiz-head'), bar = rform.querySelector('.wiz-bar'),
      back = document.getElementById('wiz-back'), next = document.getElementById('wiz-next'), nEl = document.getElementById('wiz-n'), nameEl = document.getElementById('wiz-name'), at = 0;
    var DRAFT = 'draft-v1', FIELDS = ['service', 'for_whom', 'urgency', 'call_time', 'area', 'name', 'phone', 'email'];

    function msg(el) {
      if (el.validity.valueMissing) return el.tagName === 'SELECT' || el.type === 'radio' ? 'Please choose one.' : el.type === 'checkbox' ? 'Please tick this box to continue.' : 'Please fill this in.';
      if (el.validity.typeMismatch) return el.type === 'email' ? 'Please check the email address.' : 'Please check this.';
      return el.validationMessage || 'Please check this.';
    }
    function clearError(el) { el.removeAttribute('aria-invalid'); var id = el.getAttribute('data-err'); if (id) { var n = document.getElementById(id); if (n) n.remove(); el.removeAttribute('data-err'); el.removeAttribute('aria-describedby'); } }
    function showError(el) {
      clearError(el); var id = 'err-' + (el.id || el.name);
      var p = document.createElement('p'); p.className = 'field-error'; p.id = id; p.textContent = msg(el);
      (el.type === 'radio' ? el.closest('.visit') : (el.closest('label.consent') || el)).insertAdjacentElement('afterend', p);
      el.setAttribute('aria-invalid', 'true'); el.setAttribute('data-err', id); el.setAttribute('aria-describedby', id);
    }
    function validStep(i) {
      var bad = null;
      [].slice.call(steps[i].querySelectorAll('input, select, textarea')).forEach(function (el) {
        if (el.type === 'checkbox' && el.name === 'botcheck') return;
        if (!el.checkValidity()) { showError(el); if (!bad) bad = el; } else clearError(el);
      });
      if (bad) { bad.focus(); return false; }
      return true;
    }
    function show(i, dir, focus) {
      at = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (st, k) { st.classList.toggle('active', k === at); });
      steps[at].style.setProperty('--from', dir === 'back' ? '-24px' : '24px');
      nEl.textContent = String(at + 1); nameEl.textContent = steps[at].getAttribute('data-name');
      bar.setAttribute('aria-valuenow', String(at + 1)); bar.firstElementChild.style.width = (at / (steps.length - 1) * 100) + '%'; // the line reaches the station you are on
      rform.classList.toggle('last', at === steps.length - 1);
      rform.setAttribute('data-at', String(at));
      back.hidden = at === 0;
      if (focus) { var lg = steps[at].querySelector('legend'); lg.setAttribute('tabindex', '-1'); lg.focus({ preventScroll: false }); }
    }
    function save() { try { var d = {}; FIELDS.forEach(function (n) { var el = rform.elements[n]; if (el && el.value) d[n] = el.value; }); sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) {} }
    function restore() { try { var d = JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); FIELDS.forEach(function (n) { var el = rform.elements[n]; if (el && d[n]) el.value = d[n]; }); } catch (e) {} }

    // What the chosen service includes, shown right under the choice.
    var svcMap = null, svcLoad = null, info = document.getElementById('svc-info');
    function loadServices() {
      if (!svcLoad) svcLoad = fetch('/api/services').then(function (r) { return r.ok ? r.json() : { services: [] }; }).then(function (d) { svcMap = {}; (d.services || []).forEach(function (s) { svcMap[s.value] = s; }); return svcMap; }).catch(function () { svcMap = {}; return svcMap; });
      return svcLoad;
    }
    function labelOf(key) { return svcMap && svcMap[key] ? svcMap[key].label : key; }
    // Private or home: asked only for the consultations that offer both.
    var CHOOSE_VISIT = ['Urologist consult (private or home)', 'Nephrologist service (private or home)', 'Hematologist consult (private or home)', 'Gynecologist consult (private or home)', 'Physician specialist (private or home)', 'Psychiatrist consult (private or home)']; // also asked if the service list could not load
    var visitBox = document.getElementById('visit-choice');
    function setVisit(on) {
      if (!visitBox) return;
      visitBox.hidden = !on;
      [].forEach.call(visitBox.querySelectorAll('input'), function (r) { r.disabled = !on; r.required = on; if (!on) { r.checked = false; clearError(r); } });
    }
    // Shows what the chosen service includes. Prices are never shown here: they appear only on the invoice.
    function showInfo() {
      if (!info) return;
      loadServices().then(function (map) {
        var s = map[rform.elements.service.value];
        info.replaceChildren();
        setVisit((s && s.visit === 'choose') || CHOOSE_VISIT.indexOf(rform.elements.service.value) > -1);
        // A priced service with no list of tests has nothing to explain, so nothing is shown.
        var about = s && s.visit ? document.getElementById('home-services') : null; // private or home services carry the "about" text
        if (!s || !window.PackageDetails || (!s.details && s.billing === 'fixed' && !about)) { info.hidden = true; return; }
        var h = document.createElement('h3'); h.textContent = s.label;
        info.append(h);
        if (about) { var copy = about.cloneNode(true); copy.removeAttribute('id'); info.append(copy); info.hidden = false; return; }
        if (s.details) info.append(window.PackageDetails.render(s.details, { labelOf: labelOf }));
        else { var p = document.createElement('p'); p.className = 'svc-price'; p.textContent = s.billing === 'none' ? 'No charge.' : 'We confirm the price with you before you pay.'; info.append(p); }
        info.hidden = false;
      });
    }
    rform.elements.service.addEventListener('change', showInfo);

    // On the price list, each package gets a "What's included" button that opens its details in place.
    loadServices().then(function (map) {
      document.querySelectorAll('#fees tr').forEach(function (row) {
        var a = row.querySelector('a[data-service]'), s = a && map[a.getAttribute('data-service')];
        if (!s || !s.details || !window.PackageDetails) return;
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'inc-btn'; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'What\u2019s included';
        var open = null;
        btn.addEventListener('click', function () {
          if (open) { open.remove(); open = null; btn.setAttribute('aria-expanded', 'false'); btn.textContent = 'What\u2019s included'; return; }
          open = document.createElement('tr'); open.className = 'inc-row';
          var td = document.createElement('td'); td.colSpan = row.cells.length; td.append(window.PackageDetails.render(s.details, { labelOf: labelOf })); open.append(td);
          row.after(open); btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Hide what\u2019s included';
        });
        row.querySelector('td.act').prepend(btn);
      });
    });

    rform.classList.add('on'); head.hidden = false; back.hidden = true; next.hidden = false;
    restore(); show(0, 'fwd', false); if (rform.elements.service.value) showInfo();
    next.addEventListener('click', function () { if (validStep(at)) { show(at + 1, 'fwd', true); } });
    back.addEventListener('click', function () { show(at - 1, 'back', true); });
    rform.addEventListener('input', function (e) { if (e.target.getAttribute && e.target.getAttribute('aria-invalid')) clearError(e.target); save(); });
    rform.addEventListener('change', function (e) { if (e.target.getAttribute && e.target.getAttribute('aria-invalid')) clearError(e.target); save(); });
    rform.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && at < steps.length - 1) { e.preventDefault(); next.click(); } });
    // On the last step, show what is wrong before the browser's own check refuses to send.
    document.getElementById('wiz-send').addEventListener('click', function (e) { if (!validStep(at)) { e.preventDefault(); } });
    rform.addEventListener('reset', function () { try { sessionStorage.removeItem(DRAFT); } catch (e) {} setTimeout(function () { show(0, 'back', false); }, 0); });
    rform.wizard = { info: showInfo, next: function () { next.click(); }, atLast: function () { return at === steps.length - 1; }, go: function (i) { show(i, 'fwd', false); } };

    // The big buttons at the top of the page pick the service, then take the person to the urgency question.
    var pickStatus = document.createElement('p'); pickStatus.className = 'sr'; pickStatus.setAttribute('role', 'status'); document.body.append(pickStatus);
    document.querySelectorAll('[data-service]').forEach(function (a) {
      a.addEventListener('click', function () {
        var v = a.getAttribute('data-service'), sel = rform.elements.service;
        if (v) { sel.value = v; clearError(sel); save(); showInfo(); pickStatus.textContent = 'Selected: ' + a.textContent.trim() + '. Check how urgent it is, then choose Next.'; }
        show(0, 'back', false);
        setTimeout(function () { (v ? rform.elements.urgency : sel).focus({ preventScroll: true }); }, 450);
      });
    });
  }

  /* ================= Quiet helpers: scroll progress (phones) and the current section in the menu ================= */
  var prog = document.querySelector('#progress span');
  if (prog) {
    var pTick = false;
    window.addEventListener('scroll', function () { if (pTick) return; pTick = true; requestAnimationFrame(function () { var h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; pTick = false; }); }, { passive: true });
  }
  // Every section is watched, so reading a part of the page that has no menu entry clears the old highlight
  // instead of leaving it on whatever came before. A section inside the About menu marks "About us".
  function sectionSpy(sel, attr, value, onChange) {
    var map = {}; document.querySelectorAll(sel).forEach(function (a) { map[(a.getAttribute('href') || '').replace(/^.*#/, '') || a.getAttribute('data-tab')] = a; });
    var watch = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(map).forEach(function (k) { map[k].removeAttribute(attr); });
        var a = map[e.target.id]; if (a) a.setAttribute(attr, value);
        if (onChange) onChange(a || null);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section[id]').forEach(function (s) { watch.observe(s); });
  }
  if ('IntersectionObserver' in window) {
    sectionSpy('.nav a[href^="#"]', 'aria-current', 'true', function (a) {
      document.querySelectorAll('.nav-drop').forEach(function (d) { d.classList.toggle('has-current', !!(a && d.parentNode.contains(a))); });
    });
  }

  /* ================= Works like an app on a phone ================= */
  function buzz(ms) { if (navigator.vibrate && motionOk()) { try { navigator.vibrate(ms || 8); } catch (e) {} } }
  document.addEventListener('click', function (e) { if (e.target.closest('.pick a, .actionbar a, .actionbar button, #wiz-next, #wiz-back')) buzz(8); });

  // "More" sheet
  var more = document.getElementById('more'), moreBtn = document.getElementById('more-btn');
  if (more && moreBtn && more.showModal) {
    moreBtn.addEventListener('click', function () { more.showModal(); });
    document.getElementById('more-close').addEventListener('click', function () { more.close(); });
    more.addEventListener('click', function (e) { if (e.target === more || e.target.closest('.sheet-links a')) more.close(); });
    var mo = document.getElementById('more-opts');
    if (mo) mo.addEventListener('click', function () { more.close(); if (optsBtn) optsBtn.click(); });
  } else if (moreBtn) { moreBtn.hidden = true; }

  // Install the app (Android and desktop browsers offer it; iPhones need the Share menu)
  var deferred = null, installBtn = document.getElementById('install-btn'), iosHint = document.getElementById('install-ios');
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (installBtn && !standalone) installBtn.hidden = false; });
  if (installBtn) installBtn.addEventListener('click', function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; installBtn.hidden = true; }); });
  window.addEventListener('appinstalled', function () { if (installBtn) installBtn.hidden = true; });
  if (iosHint && !standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) iosHint.hidden = false;

  // Offline notice
  var offline = document.getElementById('offline');
  function net() { if (offline) offline.hidden = navigator.onLine; }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();

  // The top bar tucks away while reading down a page and returns on the way up (phones only)
  var hdr = document.querySelector('.site-header'), lastY = 0, hTick = false;
  window.addEventListener('scroll', function () {
    if (hTick) return; hTick = true;
    requestAnimationFrame(function () {
      var y = scrollY, narrow = innerWidth <= 760;
      if (narrow && y > 140 && y > lastY + 4) hdr.classList.add('tuck');
      else if (y < lastY - 4 || y < 80) hdr.classList.remove('tuck');
      lastY = y; hTick = false;
    });
  }, { passive: true });

  // Highlight the tab for the part of the page being read
  if ('IntersectionObserver' in window) sectionSpy('.actionbar a[data-tab]', 'aria-current', 'page');

  // Service worker: faster opening and a friendly page when the signal drops
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }

  /* ================= About menu and Find a specialist ================= */
  document.querySelectorAll('.nav-group').forEach(function (g) {
    var btn = g.querySelector('.nav-drop'), menu = g.querySelector('.nav-menu');
    function set(open) { btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open; }
    btn.addEventListener('click', function () { set(menu.hidden); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    g.addEventListener('focusout', function (e) { if (!g.contains(e.relatedTarget)) set(false); });
    document.addEventListener('click', function (e) { if (!g.contains(e.target)) set(false); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  });


  /* ================= The services index and the request steps ================= */

  // The front desk: pointing at (or tabbing to) a service shows its photo beside the list.
  var desk = document.querySelector('.desk');
  if (desk) {
    var deskRows = [].slice.call(desk.querySelectorAll('.dir li')), deskShots = [].slice.call(desk.querySelectorAll('.desk-view img'));
    var showShot = function (li) {
      var k = Number(li.getAttribute('data-shot'));
      deskRows.forEach(function (r) { r.classList.toggle('on', r === li); });
      deskShots.forEach(function (im, i) { im.classList.toggle('on', i === k); });
    };
    deskRows.forEach(function (li) {
      li.addEventListener('mouseenter', function () { showShot(li); });
      li.addEventListener('focusin', function () { showShot(li); });
    });
    if (deskRows[0]) showShot(deskRows[0]);
  }

  /* ================= Motion: the headline, sections rising, photographs uncovered =================
     site.css only moves these while motion is allowed ("Less movement" and the device setting both turn it off),
     so the classes added here are harmless when it is not. Text is moved, never faded; images are never hidden or enlarged. */

  // The headline rises word by word. The words stay plain text with spaces, so it reads, copies and is spoken as before.
  var h1 = document.querySelector('.hero h1');
  if (h1 && !h1.querySelector('*')) {
    var words = h1.textContent.trim().split(/\s+/);
    h1.textContent = '';
    words.forEach(function (w, i) {
      var outer = document.createElement('span'), inner = document.createElement('span');
      outer.className = 'w'; inner.textContent = w; inner.style.setProperty('--i', String(i));
      outer.appendChild(inner); h1.appendChild(outer);
      if (i < words.length - 1) h1.appendChild(document.createTextNode(' '));
    });
    h1.classList.add('words');
  }

  // Sections rise into place as they reach you; photographs are uncovered. Each element goes back to normal once
  // it has arrived, and switching to "Less movement" (or printing) settles everything at once.
  if ('IntersectionObserver' in window && motionOk()) {
    var RISE = 'main .section-head, main .two-col > *, main .split > *, main .dir, main .steps > li, main .cards > li, main .table-wrap, main .product-card, main .statement, main .faq, main .founder > *, main .photo-wide, main .cta-row, main .product-note, main .vm-link, main .net-kinds > li, main .net-checks, main .net-empty';
    var CURTAIN = '.founder-photo, #dialysis .photo, .board-section .photo, .photo-wide';
    var moving = [], perParent = new Map();
    document.querySelectorAll(RISE).forEach(function (el) {
      if (el.closest('.hero') || moving.some(function (m) { return m.contains(el); })) return;
      moving.push(el);
      var n = perParent.get(el.parentNode) || 0; perParent.set(el.parentNode, n + 1);
      el.style.setProperty('--d', (Math.min(n, 4) * 0.09).toFixed(2) + 's');
      el.classList.add('rise');
    });
    document.querySelectorAll(CURTAIN).forEach(function (el) { el.classList.add('curtain'); if (moving.indexOf(el) < 0) moving.push(el); });
    var settleEl = function (el) { el.classList.remove('rise', 'curtain', 'in'); el.style.removeProperty('--d'); };
    var arrive = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; arrive.unobserve(el);
        el.classList.add('in');
        setTimeout(function () { settleEl(el); }, 2200 + parseFloat(el.style.getPropertyValue('--d') || 0) * 1000);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    moving.forEach(function (el) { arrive.observe(el); });
    window.addEventListener('beforeprint', function () { moving.forEach(settleEl); });
    document.addEventListener('change', function (e) { if (e.target.name === 'motion' && e.target.value === 'reduced') moving.forEach(settleEl); });
  }

  // Depth: the hero photograph drifts slower than the page as you scroll away from it.
  var heroSec = document.querySelector('.hero'), heroImg = document.querySelector('.hero .photo-hero img');
  if (heroSec && heroImg) {
    var dTick = false;
    var depth = function () {
      dTick = false;
      heroImg.style.translate = motionOk() && window.scrollY < heroSec.offsetHeight ? '0 ' + (window.scrollY * 0.28).toFixed(1) + 'px' : '';
    };
    window.addEventListener('scroll', function () { if (!dTick) { dTick = true; requestAnimationFrame(depth); } }, { passive: true });
    depth();
  }

  // The dark panels catch a soft light that follows the pointer (desktop only).
  if (window.matchMedia && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.board-section, .contact').forEach(function (panel) {
      var lt = false, lx = 0, ly = 0;
      panel.addEventListener('pointermove', function (e) {
        var r = panel.getBoundingClientRect(); lx = e.clientX - r.left; ly = e.clientY - r.top;
        if (lt) return; lt = true;
        requestAnimationFrame(function () { panel.style.setProperty('--mx', lx + 'px'); panel.style.setProperty('--my', ly + 'px'); lt = false; });
      });
    });
  }

  // The WhatsApp button steps aside while WhatsApp is already on screen (the hero, the contact panel, the footer).
  var fab = document.querySelector('.wa-fab');
  if (fab && 'IntersectionObserver' in window) {
    var showing = new Set();
    var fio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) showing.add(e.target); else showing.delete(e.target); });
      fab.classList.toggle('away', showing.size > 0);
    }, { threshold: 0.2 });
    ['.hero', '#contact', '.site-footer'].forEach(function (s) { var n = document.querySelector(s); if (n) fio.observe(n); });
  }

})();
