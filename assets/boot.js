/* Runs before the page is drawn: applies the saved theme and display options so there is no flash. Kept as a file
   (not inline) so the site can use a strict Content-Security-Policy. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    var prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
    ['size', 'contrast', 'motion', 'font'].forEach(function (k) { if (prefs[k]) root.setAttribute('data-' + k, prefs[k]); });
  } catch (e) {}
})();
