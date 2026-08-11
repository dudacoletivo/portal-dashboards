// Indicador visual (● dados ao vivo / ○ snapshot) + botão Atualizar, reutilizado por todo cliente com sync ativo.
function createLiveStatusUI() {
  const wrap = document.createElement('div');
  wrap.setAttribute(
    'style',
    'position:fixed;top:14px;right:100px;z-index:99998;display:flex;align-items:center;gap:8px;' +
    'font-family:Calibri,Arial,sans-serif;'
  );
  wrap.innerHTML =
    '<span id="liveStatusPill" style="background:#eef1f5;color:#5b6675;padding:8px 14px;border-radius:999px;' +
    'font-size:12.5px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.15);white-space:nowrap;">○ snapshot</span>' +
    '<button id="liveRefreshBtn" type="button" style="background:#00498e;color:#fff;border:none;padding:9px 16px;' +
    'border-radius:999px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);">' +
    '🔄 Atualizar</button>';
  document.body.appendChild(wrap);

  const pill = wrap.querySelector('#liveStatusPill');
  const btn = wrap.querySelector('#liveRefreshBtn');

  function setStatus(mode, note) {
    if (mode === 'live') {
      const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      pill.textContent = '● dados ao vivo (' + now + ')';
      pill.style.background = '#e7f6ee';
      pill.style.color = '#1c8a53';
    } else if (mode === 'loading') {
      pill.textContent = '… atualizando';
      pill.style.background = '#eef1f5';
      pill.style.color = '#5b6675';
    } else {
      pill.textContent = '○ snapshot' + (note ? ' — ' + note : '');
      pill.style.background = '#faf3e0';
      pill.style.color = '#8a6d1a';
    }
  }

  return {
    setStatus,
    onRefreshClick: (fn) => btn.addEventListener('click', fn),
    setBusy: (busy) => { btn.disabled = busy; btn.style.opacity = busy ? .6 : 1; }
  };
}
