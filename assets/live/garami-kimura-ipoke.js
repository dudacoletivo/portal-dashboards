// Sincronização ao vivo do painel Garami/Kimura/Ipoke com as 3 planilhas de origem
// ([GARAMI] Comparativo semanal, [KIMURA] Comparativo semanal, [IPoke] Comparativo semanal).
//
// Este dashboard guarda RAW/DATA/STORES/METRICS como variáveis LOCAIS dentro de
// initDashboard() (não são globais), então não dá pra mutar in-place como nos outros
// clientes. Em vez disso, clientes/garami-kimura-ipoke.html foi ajustado para ler
// `const RAW = window.__LIVE_RAW || {snapshot embutido}` — aqui a gente monta um RAW
// novo, guarda em window.__LIVE_RAW e chama startDashboardSafely() de novo pra
// re-renderizar tudo com os dados frescos.
(function () {
  const BRANDS = {
    garami: { sheetId: '1c_powOd8OiVtUklTr-2UsBNEz32X1AK8', mensalGid: '355980983', units: { 'TIJUCA': '1888630153', 'ZONA SUL': '391980038', 'BARRA DA TIJUCA': '851230337' } },
    kimura: { sheetId: '1oSzxN3RdWgizyN9aTLnKufPxh1i1pOZC', mensalGid: '190482939', units: { 'TIJUCA': '1888630153', 'ZONA SUL': '391980038', 'BARRA DA TIJUCA': '851230337' } },
    ipoke: { sheetId: '1YqrViXiMUPWx-Zo_iT-aGouMUExnaDDe', mensalGid: '1613983242', units: { 'TIJUCA': '1888630153', 'BARRA DA TIJUCA': '1014280698', 'ZONA SUL': '1966828362' } }
  };
  const UNIT_TO_ID = { 'TIJUCA': 'tijuca', 'ZONA SUL': 'zonasul', 'BARRA DA TIJUCA': 'barra' };
  const UNIT_PROPER = { 'TIJUCA': 'Tijuca', 'ZONA SUL': 'Zona Sul', 'BARRA DA TIJUCA': 'Barra da Tijuca' };
  const BRAND_LABEL = { garami: 'Garami', kimura: 'Kimura', ipoke: 'Ipoke' };
  const BRAND_COLOR = { garami: '#3E93B7', kimura: '#D62828', ipoke: '#D98A2B' };

  const METRIC_ORDER_CLOSED = ['VENDAS', ['FATURAMENTO LÍQUIDO', 'GMV'], 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const METRIC_ORDER_PARTIAL = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const TARGET_KEYS = ['vendas', 'gmv', 'tm', 'novos', 'visitas', 'conversao', 'budget', 'promo', 'subifood', 'cpo', 'roi'];

  const METRICS = [
    { id: 'gmv', label: 'GMV', fmt: 'money' },
    { id: 'vendas', label: 'Pedidos', fmt: 'int' },
    { id: 'tm', label: 'Ticket Médio', fmt: 'money' },
    { id: 'novos', label: 'Clientes Novos', fmt: 'int' },
    { id: 'visitas', label: 'Visitas Cardápio', fmt: 'int' },
    { id: 'conversao', label: 'Conversão', fmt: 'pct' },
    { id: 'cpo', label: 'CPO', fmt: 'money' },
    { id: 'budget', label: '% Investimento', fmt: 'pct' },
    { id: 'promo', label: 'Promoções + Ads', fmt: 'money' },
    { id: 'subifood', label: 'Sub iFood', fmt: 'money' },
    { id: 'roi', label: 'ROI', fmt: 'money' }
  ];

  async function buildPartialForBrand(brandKey, brand) {
    const out = {};
    for (const [unitName, gid] of Object.entries(brand.units)) {
      const rows = await SheetsSync.fetchCsvRows(brand.sheetId, gid);
      const generic = SheetsSync.parseCumulativeLikeSheet(rows, METRIC_ORDER_PARTIAL, SheetsSync.brNumberPct100);
      const unitKey = Object.keys(generic)[0];
      if (!unitKey) continue;
      const storeId = `${brandKey}-${UNIT_TO_ID[unitName]}`;
      out[storeId] = out[storeId] || {};
      const byPeriod = generic[unitKey];
      // byPeriod[metricLabel][period][month] -> queremos [period(dKey)][month][targetKey]
      const periods = new Set();
      Object.values(byPeriod).forEach(m => Object.keys(m).forEach(p => periods.add(p)));
      periods.forEach(period => {
        const dKey = String(parseInt(period.split('-')[1], 10)) + 'd';
        const monthsSet = new Set();
        Object.values(byPeriod).forEach(m => { if (m[period]) Object.keys(m[period]).forEach(mo => monthsSet.add(mo)); });
        out[storeId][dKey] = out[storeId][dKey] || {};
        monthsSet.forEach(monthName => {
          const genericMetrics = {};
          Object.keys(byPeriod).forEach(metricLabel => { if (byPeriod[metricLabel][period]) genericMetrics[metricLabel] = byPeriod[metricLabel][period][monthName]; });
          out[storeId][dKey][monthName.toLowerCase()] = remapMetricsFlat(genericMetrics, METRIC_ORDER_PARTIAL);
        });
      });
    }
    return out;
  }

  function remapMetricsFlat(genericFlat, order) {
    const out = {};
    TARGET_KEYS.forEach((targetKey, i) => {
      const genericKey = order[i];
      const resolvedKey = Array.isArray(genericKey) ? (genericFlat[genericKey[0]] !== undefined ? genericKey[0] : genericKey[1]) : genericKey;
      if (genericFlat[resolvedKey] !== undefined) out[targetKey] = genericFlat[resolvedKey];
    });
    return out;
  }

  async function buildClosedForBrand(brandKey, brand) {
    const out = {};
    if (!brand.mensalGid) return out;
    const rows = await SheetsSync.fetchCsvRows(brand.sheetId, brand.mensalGid);
    const generic = SheetsSync.parseMonthlyLikeSheet(rows, METRIC_ORDER_CLOSED);
    Object.keys(generic).forEach(unitRaw => {
      const unitId = UNIT_TO_ID[unitRaw];
      if (!unitId) return; // unidade não mapeada (nome inesperado na planilha) — ignora com segurança
      const storeId = `${brandKey}-${unitId}`;
      const months = new Set();
      Object.values(generic[unitRaw]).forEach(m => Object.keys(m).forEach(mo => months.add(mo)));
      const closed = {};
      months.forEach(monthName => {
        const genericFlat = {};
        Object.keys(generic[unitRaw]).forEach(metricLabel => { genericFlat[metricLabel] = generic[unitRaw][metricLabel][monthName]; });
        closed[monthName.toLowerCase()] = remapMetricsFlat(genericFlat, METRIC_ORDER_CLOSED);
      });
      out[storeId] = closed;
    });
    return out;
  }

  async function loadLive() {
    const brandKeys = Object.keys(BRANDS);
    const partials = await Promise.all(brandKeys.map(k => buildPartialForBrand(k, BRANDS[k])));
    const closeds = await Promise.all(brandKeys.map(k => buildClosedForBrand(k, BRANDS[k])));

    const DATA = {};
    brandKeys.forEach((brandKey, i) => {
      Object.keys(partials[i]).forEach(storeId => {
        DATA[storeId] = DATA[storeId] || {};
        Object.assign(DATA[storeId], partials[i][storeId]);
      });
      Object.keys(closeds[i]).forEach(storeId => {
        DATA[storeId] = DATA[storeId] || {};
        DATA[storeId].closed = closeds[i][storeId];
      });
    });

    if (!Object.keys(DATA).length) throw new Error('Nenhuma loja encontrada em nenhuma das 3 planilhas');

    const STORES = [];
    brandKeys.forEach(brandKey => {
      Object.keys(BRANDS[brandKey].units).forEach(unitName => {
        const unitId = UNIT_TO_ID[unitName];
        const storeId = `${brandKey}-${unitId}`;
        const closedMonths = DATA[storeId] && DATA[storeId].closed ? Object.keys(DATA[storeId].closed) : [];
        STORES.push({ id: storeId, brand: BRAND_LABEL[brandKey], unit: UNIT_PROPER[unitName] || unitName, color: BRAND_COLOR[brandKey], closedMonths });
      });
    });

    return { DATA, STORES, METRICS };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        window.__LIVE_RAW = fresh;
        if (typeof startDashboardSafely === 'function') startDashboardSafely();
        else if (typeof initDashboard === 'function') initDashboard();
        ui.setStatus('live');
      } catch (e) {
        console.warn('[live-sync] Falha ao buscar dados das planilhas, mantendo snapshot embutido:', e);
        ui.setStatus('snapshot', isManual ? 'falha ao atualizar' : 'sem conexão com as planilhas');
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
