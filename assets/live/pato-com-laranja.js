// Sincronização ao vivo do dashboard Pato com Laranja com a planilha [Pato com Laranja] Dashboard.
// Requer que assets/sheets-sync.js e assets/live-status-ui.js já tenham sido carregados,
// e que este script rode DEPOIS do bloco principal do dashboard (MONTHLY/CUM/ALAV/renderXxx já definidos).
(function () {
  const SHEET_ID = '1G3yEReZrhYEDo6js0zz0FC62fr8Y_LJgEH1KvdIZtoc';
  const GID_MONTHLY = '824083556';    // aba "[Ifood] Dash Pato mensal" — Mês Fechado
  const GID_CUMULATIVE = '885201399'; // aba "[Ifood] Comparativo mensal" — Parcial
  const GID_ALAVANCAS = '14456487';   // aba "Status das alavancas"

  const CANCEL_SHEET_ID = '1egzISBKxkvqVy-RuiXMni40-Fu2oONPnOmzpiKfIutw';
  const CANCEL_SOURCES = [
    { gid: '1278186316', unit: 'BARRA DA TIJUCA' }, // [BARRA] Julho
    { gid: '977972087', unit: 'LEBLON' },           // [LEBLON] Julho
    { gid: '1534779477', unit: 'LEBLON' },          // [LEBLON] Maio (01-28) — nome da aba não reflete o conteúdo
    { gid: '461897780', unit: 'BARRA DA TIJUCA' }   // [BARRA] Maio (01-28) — idem
  ];

  const METRIC_ORDER_MONTHLY = ['VENDAS', ['FATURAMENTO LÍQUIDO', 'GMV'], 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const METRIC_ORDER_CUM = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];

  async function loadCancelamentos() {
    const perTab = await Promise.all(CANCEL_SOURCES.map(async (s) => {
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
    try { renderAlavancas(); } catch (e) { console.error('renderAlavancas falhou:', e); }
    try { renderCancelamentos(); } catch (e) { console.error('renderCancelamentos falhou:', e); }
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
