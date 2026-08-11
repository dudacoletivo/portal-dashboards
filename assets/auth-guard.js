// Inclua este script no <head> de cada dashboard, ANTES de qualquer outro script/estilo:
// <script src="../assets/portal-config.js"></script>
// <script src="../assets/auth-guard.js" data-client="slug-do-cliente"></script>
(function () {
  var thisScript = document.currentScript;
  var slug = thisScript.getAttribute('data-client');
  var session = (typeof portalGetSession === 'function') ? portalGetSession() : null;
  var authorized = session && session.client === slug;

  if (!authorized) {
    window.location.replace('../index.html?client=' + encodeURIComponent(slug) + '&reason=login');
    return;
  }

  window.addEventListener('DOMContentLoaded', function () {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Sair';
    btn.setAttribute(
      'style',
      'position:fixed;top:14px;right:14px;z-index:99999;background:#221F1D;color:#fff;' +
      'border:none;padding:9px 18px;border-radius:999px;font-family:Calibri,Arial,sans-serif;' +
      'font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);opacity:.82;transition:opacity .15s;'
    );
    btn.addEventListener('mouseenter', function () { btn.style.opacity = 1; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = .82; });
    btn.addEventListener('click', function () {
      portalLogout();
      window.location.href = '../index.html';
    });
    document.body.appendChild(btn);
  });
})();
