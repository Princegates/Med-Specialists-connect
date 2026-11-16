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
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#0f1117' : '#fe0054');
  }
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    if (!reduceMotion) {
      root.classList.add('theme-anim'); themeBtn.classList.add('spin');
      setTimeout(function () { root.classList.remove('theme-anim'); themeBtn.classList.remove('spin'); }, 550);
    }
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncTheme();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);
  syncTheme();

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

  // Reveal sections as they scroll into view. Skipped entirely for reduced motion
  // or old browsers, so content is never left hidden.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll(
      '.section-head, .cards > li, .steps > li, .faq > *, .split > *, .two-up > *, .two-col > *, .photo-wide'
    );
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        el.classList.add('in');
        function done() { el.classList.remove('reveal', 'in'); el.style.removeProperty('--d'); }
        el.addEventListener('transitionend', function te(e) {
          if (e.propertyName === 'transform') { el.removeEventListener('transitionend', te); done(); }
        });
        setTimeout(done, 1800); // fallback so hover effects are never blocked
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(function (el) {
      var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--d', (Math.min(siblings, 5) * 0.08).toFixed(2) + 's');
      el.classList.add('reveal');
      io.observe(el);
    });
  }

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
  var TEAM_EMAIL = 'medspecialistsconnect@gmail.com';
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
      if (el.value === '') return;
      var label = el.name;
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

    form.addEventListener('submit', function (e) {
      e.preventDefault();
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

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (!data.success) throw new Error(data.message || 'failed');
        say(success, 'ok');
        form.reset();
      }).catch(function () {
        say('We could not send that just now, and your details are still here. Please try again, or reach us on ' +
          '<a href="tel:+233243560080">0243 560 080</a> or <a href="' + WHATSAPP_URL + '" target="_blank" rel="noopener">WhatsApp</a>.', 'err', true);
      }).then(function () {
        button.disabled = false; button.textContent = label;
      });
    });
  });
})();
