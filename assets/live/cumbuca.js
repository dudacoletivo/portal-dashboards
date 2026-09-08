// Sincronização ao vivo do dashboard Cumbuca com a planilha [Cumbuca] Dashboard.
// Cobre Mês Fechado + Parcial (DATA_CLOSED / DATA_PARTIAL), que por sua vez alimentam
// também as abas Status de Alavancas, Investimento e Diagnóstico Parcial (derivadas).
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois
// do bloco principal do dashboard (DATA_CLOSED/DATA_PARTIAL/renderAll ou equivalentes já definidos).
(function () {
  const SHEET_ID = '1MhK4Bx4CZhWJG9ei1TNFvJsVEac8wgdWzFhRSWq245o';

  const BRANDS = [
    { closedGid: '952557577', partialGid: '0', prefix: 'Cumbuca' },
    { closedGid: '1352476829', partialGid: '277359977', prefix: 'Cumbuca Brasileira' },
    { closedGid: '1897441660', partialGid: '352375394', prefix: 'Wraps' }
  ];

  const METRIC_ORDER = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];

  function properCase(s) {
    return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  async function buildClosed() {
    const out = {};
    for (const brand of BRANDS) {
      const rows = await SheetsSync.fetchCsvRows(SHEET_ID, brand.closedGid);
      const generic = SheetsSync.parseMonthlyLikeSheet(rows, METRIC_ORDER);
      Object.keys(generic).forEach(unitRaw => {
        const key = `${brand.prefix} - ${properCase(unitRaw)}`;
        const metrics = {};
        Object.keys(generic[unitRaw]).forEach(metricKey => {
          const vals = {};
          Object.keys(generic[unitRaw][metricKey]).forEach(monthName => { vals[monthName.toLowerCase()] = generic[unitRaw][metricKey][monthName]; });
          metrics[metricKey] = vals;
        });
        out[key] = metrics;
      });
    }
    if (!Object.keys(out).length) throw new Error('Nenhuma loja encontrada (mês fechado)');
    return out;
  }

  async function buildPartial() {
    const out = {};
    for (const brand of BRANDS) {
      const rows = await SheetsSync.fetchCsvRows(SHEET_ID, brand.partialGid);
      const generic = SheetsSync.parseCumulativeLikeSheet(rows, METRIC_ORDER);
      Object.keys(generic).forEach(unitRaw => {
        const key = `${brand.prefix} - ${properCase(unitRaw)}`;
        out[key] = out[key] || {};
        Object.keys(generic[unitRaw]).forEach(metricKey => {
          Object.keys(generic[unitRaw][metricKey]).forEach(period => {
            const dayKey = 'w' + String(parseInt(period.split('-')[1], 10));
            out[key][dayKey] = out[key][dayKey] || {};
            const monthVals = generic[unitRaw][metricKey][period];
            const vals = {};
            Object.keys(monthVals).forEach(monthName => { vals[monthName.toLowerCase()] = monthVals[monthName]; });
            out[key][dayKey][metricKey] = vals;
          });
        });
      });
    }
    if (!Object.keys(out).length) throw new Error('Nenhuma loja encontrada (parcial)');

    // Backstop: cumbuca.html acessa DATA_PARTIAL[loja][janela]['GMV'][mês] direto, sem checar
    // se existe, em vários lugares. Se uma loja ainda não tiver uma janela/métrica na planilha
    // (ex: virada de marca fez faltar 3 das 4 janelas por um tempo), isso quebrava a tela
    // inteira. Preenchendo com objetos vazios aqui, o pior caso vira "undefined" num valor,
    // não mais um erro fatal.
    const ALL_WINDOWS = ['w7', 'w14', 'w21', 'w28'];
    Object.keys(out).forEach(key => {
      ALL_WINDOWS.forEach(w => {
        out[key][w] = out[key][w] || {};
        METRIC_ORDER.forEach(m => { out[key][w][m] = out[key][w][m] || {}; });
      });
    });

    return { partial: out };
  }

  async function loadLive() {
    const [closed, { partial }] = await Promise.all([buildClosed(), buildPartial()]);
    return { closed, partial };
  }

  function rerenderAll() {
    // Espelha o que init() faz em cumbuca.html, sem repetir o registro dos listeners de evento
    // (senão cada "Atualizar" duplicaria os handlers de change nos seletores).
    safe('seletores', () => { populateSelectors('F'); populateSelectors('P'); populateMonthSelects(); });
    safe('sincronizar meses parciais', () => {
      syncMonthOptionsToWindow('P_month', 'P_window');
      syncMonthOptionsToWindow('alavMonth', 'alavWindow');
      syncMonthOptionsToWindow('invMonth', 'invWindow');
      syncMonthOptionsToWindow('parcialA', 'parcialWindow');
      syncMonthOptionsToWindow('parcialB', 'parcialWindow');
    });
    safe('Dash Fechado', () => renderDashScreen('F'));
    safe('Dash Parcial', () => renderDashScreen('P'));
    safe('Alavancas', renderLeverage);
    safe('Investimento', renderInvestimento);
    safe('Diagnóstico Parcial', renderParcial);
    safe('Projeção', () => { populateProjStoreSelect(); renderProjecao(); });
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(DATA_CLOSED, fresh.closed);
        SheetsSync.mutateObjectInPlace(DATA_PARTIAL, fresh.partial);
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
