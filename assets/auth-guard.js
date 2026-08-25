// Inclua este script no <head> de cada dashboard, ANTES de qualquer outro script/estilo:
// <script src="../assets/portal-config.js"></script>
// <script src="../assets/auth-guard.js" data-client="slug-do-cliente"></script>
(function () {
  var thisScript = document.currentScript;
  var slug = thisScript.getAttribute('data-client');
  var session = (typeof portalGetSession === 'function') ? portalGetSession() : null;
  var authorized = session && session.client === slug;

  if (!authorized) {
    // Sem slug/nome do cliente na URL de redirecionamento — a tela de login é única
    // e não deve vazar qual cliente estava sendo acessado, nem na barra de endereço.
    window.location.replace('../index.html');
    return;
  }

  window.addEventListener('DOMContentLoaded', function () {
    // Quem entrou via painel admin (admin/painel.html) volta pro painel ao sair deste
    // dashboard, em vez de cair no login único — não precisa digitar a senha de admin de novo
    // a cada troca de cliente, só quando a sessão de admin expirar (12h) ou clicar "Sair" lá.
    var isAdmin = (typeof portalGetAdminSession === 'function') && !!portalGetAdminSession();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = isAdmin ? '← Painel admin' : 'Sair';
    btn.setAttribute(
      'style',
      'position:fixed;top:14px;right:14px;z-index:99999;background:#221F1D;color:#fff;' +
      'border:none;padding:9px 18px;border-radius:999px;font-family:Calibri,Arial,sans-serif;' +
      'font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);opacity:.82;transition:opacity .15s;'
    );
    btn.addEventListener('mouseenter', function () { btn.style.opacity = 1; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = .82; });
    btn.addEventListener('click', function () {
      if (isAdmin) {
        window.location.href = '../admin/painel.html';
        return;
      }
      portalLogout();
      window.location.href = '../index.html';
    });
    document.body.appendChild(btn);
  });
})();
