// Sincronização ao vivo do dashboard Pato com Laranja com a planilha [Pato com Laranja] Dashboard.
// Requer que assets/sheets-sync.js e assets/live-status-ui.js já tenham sido carregados,
// e que este script rode DEPOIS do bloco principal do dashboard (MONTHLY/CUM/ALAV/renderXxx já definidos).
(function () {
  const SHEET_ID = '1G3yEReZrhYEDo6js0zz0FC62fr8Y_LJgEH1KvdIZtoc';
  const GID_MONTHLY = '824083556';    // aba "[Ifood] Dash Pato mensal" — Mês Fechado
  const GID_CUMULATIVE = '885201399'; // aba "[Ifood] Comparativo mensal" — Parcial
  const GID_ALAVANCAS = '14456487';   // aba "Status das alavancas"

  const CANCEL_SHEET_ID = '1egzISBKxkvqVy-RuiXMni40-Fu2oONPnOmzpiKfIutw';
  // A planilha ganha uma aba nova por unidade a cada mês (ex: "[BARRA] Agosto"), então em vez
  // de fixar os gids aqui (que ficam desatualizados todo mês), descobrimos as abas na hora lendo
  // a lista de abas publicada da própria planilha e pegando todas que começam com "[BARRA]" ou
  // "[LEBLON]" — cobre qualquer aba nova sem precisar editar este arquivo de novo.
  const CANCEL_UNIT_PREFIXES = [
    { prefix: '[BARRA]', unit: 'BARRA DA TIJUCA' },
    { prefix: '[LEBLON]', unit: 'LEBLON' }
  ];

  async function discoverCancelSources() {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${CANCEL_SHEET_ID}/htmlview`, { cache: 'no-store' });
    const text = await res.text();
    const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:[^,]+,\s*gid:\s*"(-?\d+)"/g;
    const decode = s => s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/');
    const sources = [];
    let m;
    while ((m = re.exec(text))) {
      const name = decode(m[1]).trim().toUpperCase();
      const found = CANCEL_UNIT_PREFIXES.find(p => name.startsWith(p.prefix));
      if (found) sources.push({ gid: m[2], unit: found.unit });
    }
    if (!sources.length) throw new Error('Nenhuma aba de cancelamentos encontrada na planilha');
    return sources;
  }

  const METRIC_ORDER_MONTHLY = ['VENDAS', ['FATURAMENTO LÍQUIDO', 'GMV'], 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const METRIC_ORDER_CUM = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];

  async function loadCancelamentos() {
    const sources = await discoverCancelSources();
    const perTab = await Promise.all(sources.map(async (s) => {
      const rows = await SheetsSync.fetchCsvRows(CANCEL_SHEET_ID, s.gid);
      return SheetsSync.parseCancelRecordsSheet(rows, s.unit);
    }));
    return perTab.flat();
  }

  async function loadLive() {
    const [monthlyRows, cumRows, alavRows, cancelamentos] = await Promise.all([
      SheetsSync.fetchCsvRows(SHEET_ID, GID_MONTHLY),
      SheetsSync.fetchCsvRows(SHEET_ID, GID_CUMULATIVE),
      SheetsSync.fetchCsvRows(SHEET_ID, GID_ALAVANCAS),
      loadCancelamentos()
    ]);
    if (!cancelamentos.length) throw new Error('Nenhum cancelamento encontrado');
    return {
      monthly: SheetsSync.parseMonthlyLikeSheet(monthlyRows, METRIC_ORDER_MONTHLY),
      cumulative: SheetsSync.parseCumulativeLikeSheet(cumRows, METRIC_ORDER_CUM),
      alavancas: SheetsSync.parseLeverSheet(alavRows, STORES),
      cancelamentos
    };
  }

  function rerenderAll() {
    try { renderMesFechado(); } catch (e) { console.error('renderMesFechado falhou:', e); }
    try { renderParcial(); } catch (e) { console.error('renderParcial falhou:', e); }
    try { renderInvestimento(); } catch (e) { console.error('renderInvestimento falhou:', e); }
    try { renderComp7(); } catch (e) { console.error('renderComp7 falhou:', e); }
    try { renderAlavancas(); } catch (e) { console.error('renderAlavancas falhou:', e); }
    try { renderCancelamentos(); } catch (e) { console.error('renderCancelamentos falhou:', e); }
    try { renderProjecao(); } catch (e) { console.error('renderProjecao falhou:', e); }
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(MONTHLY, fresh.monthly);
        SheetsSync.mutateObjectInPlace(CUM, fresh.cumulative);
        SheetsSync.mutateArrayInPlace(ALAV, fresh.alavancas);
        SheetsSync.mutateArrayInPlace(CANCEL, fresh.cancelamentos);
        rerenderAll();
        ui.setStatus('live');
      } catch (e) {
        console.warn('[live-sync] Falha ao buscar dados da planilha, mantendo snapshot embutido:', e);
        ui.setStatus('snapshot', isManual ? 'falha ao atualizar' : 'sem conexão com a planilha');
      } finally {
        ui.setBusy(false);
      }
    }

    ui.onRefreshClick(() => refresh(true));
    refresh(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
