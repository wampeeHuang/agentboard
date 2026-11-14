(function () {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'agentboard-back-top';
  button.setAttribute('aria-label', '返回顶部');
  button.setAttribute('title', '返回顶部');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.hidden = true;
  document.body.appendChild(button);
  function update() {
    var current = document.querySelector('.page.show');
    // Embedded pages own their scrolling and provide their own button.
    var embedded = current && (current.id === 'page-capabilities' || current.id === 'page-docs');
    button.hidden = !!embedded || window.scrollY < 300;
  }
  button.addEventListener('click', function () {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top: 0, behavior: reduced ? 'auto' : 'smooth'});
  });
  window.addEventListener('scroll', update, {passive: true});
  var main = document.querySelector('main.main');
  if (main && window.MutationObserver) {
    new MutationObserver(update).observe(main, {attributes: true, subtree: true, attributeFilter: ['class']});
  }
  update();
})();
