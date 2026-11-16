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

  // The form has no server behind it, so build a mailto: link with the answers.
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form);
      var body = [
        'Name: ' + f.get('name'),
        'Organisation: ' + (f.get('organisation') || '-'),
        'Phone: ' + f.get('phone'),
        '',
        f.get('message')
      ].join('\n');
      window.location.href = 'mailto:medspecialistsconnect@gmail.com' +
        '?subject=' + encodeURIComponent('Website enquiry from ' + f.get('name')) +
        '&body=' + encodeURIComponent(body);
    });
  }
})();
