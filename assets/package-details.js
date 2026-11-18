/* Draws "what is included" for a laboratory package. Shared by the home page (request form and price list) and the
   invoice page. Everything is built with text nodes, never HTML, so nothing from the server can run as code. */
(function () {
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function money(p) { return 'GH₵' + (p / 100).toLocaleString('en-GH', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function more(title, body) { var d = el('details', 'pkg-more'); d.append(el('summary', null, title), body); return d; }

  function render(d, opts) {
    opts = opts || {};
    var box = el('div', 'pkg');
    if (d.summary) box.append(el('p', 'pkg-summary', d.summary));
    if (d.base && opts.labelOf) box.append(el('p', 'pkg-base', 'Includes everything in the ' + opts.labelOf(d.base.key) + ', plus the tests marked New.'));

    box.append(el('h4', 'pkg-h', 'Tests included (' + d.tests.length + ')'));
    var ul = el('ul', 'pkg-tests');
    d.tests.forEach(function (t) {
      var li = el('li');
      li.append(el('span', 'pkg-tick', '✓'));
      var txt = el('span', 'pkg-name'); txt.append(document.createTextNode(t.name + (t.flag ? ' *' : '')));
      if (t.note) txt.append(el('small', null, t.note));
      li.append(txt);
      if (t.added) li.append(el('span', 'pkg-new', 'New'));
      if (t.price) li.append(el('span', 'pkg-price', money(t.price)));
      ul.append(li);
    });
    if (d.tests.some(function (t) { return t.price; })) ul.className += ' pkg-priced';
    box.append(ul);
    // Individual prices are the clinic's; say how they relate to the package price.
    if (d.priceBasis === 'clinic') {
      var sum = d.tests.reduce(function (n, t) { return n + (t.price || 0); }, 0);
      var line = el('p', 'pkg-total');
      line.append(el('span', null, 'Clinic price of the tests above, added up'), el('strong', null, money(sum)));
      box.append(line);
      if (opts.packagePrice) { var pk = el('p', 'pkg-total pkg-total-main'); pk.append(el('span', null, 'On-call package price for all ' + d.tests.length + ' tests'), el('strong', null, money(opts.packagePrice))); box.append(pk); }
    }
    if (d.footnote) box.append(el('p', 'pkg-foot', d.footnote));

    if (d.also && d.also.length) {
      box.append(el('h4', 'pkg-h', 'Also included'));
      var al = el('ul', 'pkg-tests'); d.also.forEach(function (a) { var li = el('li'); li.append(el('span', 'pkg-tick', '✓'), el('span', 'pkg-name', a)); al.append(li); });
      box.append(al);
    }
    if (d.who && d.who.length) {
      var dl = el('dl', 'pkg-who'); d.who.forEach(function (w) { dl.append(el('dt', null, w.band), el('dd', null, w.text)); });
      box.append(more('Who should get checked', dl));
    }
    var good = [].concat(d.before || [], d.notes || []);
    if (good.length) { var gl = el('ul', 'pkg-list'); good.forEach(function (g) { gl.append(el('li', null, g)); }); box.append(more(d.before ? 'Before your appointment' : 'Good to know', gl)); }
    if (d.process && d.process.length) { var ol = el('ol', 'pkg-steps'); d.process.forEach(function (s) { ol.append(el('li', null, s)); }); box.append(more('How it works', ol)); }
    if (d.important) { var imp = el('p', 'pkg-important'); imp.append(el('strong', null, 'Important: '), document.createTextNode(d.important)); box.append(imp); }
    return box;
  }

  window.PackageDetails = { render: render, money: money };
})();
