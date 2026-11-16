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
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncTheme();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);
  syncTheme();

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Photos: if a file has not been added yet, show a labelled slot instead of a broken image.
  document.querySelectorAll('.photo').forEach(function (fig) {
    var img = fig.querySelector('img');
    function missing() { fig.classList.add('missing'); }
    if (img.complete && img.naturalWidth === 0) missing();
    img.addEventListener('error', missing);
  });

  // The forms have no server behind them, so build a mailto: link from the answers.
  document.querySelectorAll('form[data-subject]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form);
      var lines = [];
      if (f.get('service')) lines.push('Service needed: ' + f.get('service'));
      lines.push('Name: ' + f.get('name'));
      if (f.get('organisation')) lines.push('Organisation: ' + f.get('organisation'));
      lines.push('Phone: ' + f.get('phone'));
      lines.push('', f.get('message') || '');
      var subject = form.dataset.subject + (f.get('service') ? ': ' + f.get('service') : '') + ' from ' + f.get('name');
      window.location.href = 'mailto:medspecialistsconnect@gmail.com' +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(lines.join('\n'));
    });
  });
})();
