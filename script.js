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
