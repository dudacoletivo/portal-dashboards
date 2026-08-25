// Sincronização ao vivo do painel Sunomono com as 20 planilhas por unidade
// ("[Sunomono - <Unidade>] Comparativo semanal", cada uma com 2 abas: semanal e fechamento mensal).
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois
// do bloco principal do dashboard (DATA/STORE_NAMES/renderXxx já definidos como globais).
(function () {
  // slug (nome do arquivo na planilha) -> nome exato usado em DATA/STORE_NAMES no dashboard
  const UNITS = [
    { label: 'Bangu', sheetId: '1w9pWohSrIQeqtVpp_gxKrCpqxlj3MImg', weeklyGid: '1888630153', monthlyGid: '1189931320' },
    { label: 'Barra da Tijuca', sheetId: '1H-J6o57bIFUGsk7pIbALdCmrpjVTarFq', weeklyGid: '953120159', monthlyGid: '1063843961' },
    { label: 'Campo Grande', sheetId: '1d0T32vr-2oDe9VDdIVT6lZtsYF8WFiMH', weeklyGid: '542669795', monthlyGid: '1274014167' },
    { label: 'Caxias', sheetId: '1gAFK1dS-Y2Zw7LbNjbZ7jwqQE0lw_w-N', weeklyGid: '1161026240', monthlyGid: '1706712726' },
    { label: 'Centro', sheetId: '1pjbsR-0WJGd58xgx5TsKPiZI7o-kMUpl', weeklyGid: '1787160061', monthlyGid: '1523559115' },
    { label: 'Copacabana', sheetId: '1itrI0FY0lZX8qfoBDbk8ws6Em_G0wvM1', weeklyGid: '1346879619', monthlyGid: '387247302' },
    { label: 'Jacarepaguá', sheetId: '1qoDY-GYed_RO7rq9z0UvMphLkiAXy2nT', weeklyGid: '2076935676', monthlyGid: '552657316' },
    { label: 'Jardim Oceânico', sheetId: '1LSe7Rtw7GztCqyIy2jl17uFi7Q7FLS0V', weeklyGid: '589560409', monthlyGid: '1658684910' },
    { label: 'Méier', sheetId: '1616rdiBZdUl3Vq34jlEfUG8_q9qmolH9', weeklyGid: '682929533', monthlyGid: '1607571229' },
    { label: 'Nilópolis', sheetId: '1IvEfwwAy0b2K_GAqd9ZhmuTLPYutmD1q', weeklyGid: '1808654358', monthlyGid: '574507012' },
    { label: 'Niterói', sheetId: '1KpWX3pT4xy4oquwLMC127BvMVrv0z788', weeklyGid: '1735919363', monthlyGid: '1433213092' },
    { label: 'Nova Iguaçu', sheetId: '1CKh3ADuzLTzHh7fbEJP3wJSZAy2YmZn_', weeklyGid: '1401554713', monthlyGid: '192736103' },
    { label: 'Realengo', sheetId: '1em83v9O6Ziu7ErNkVXmt2J3h_VLgaDlO', weeklyGid: '1298163148', monthlyGid: '1186645203' },
    { label: 'Recreio', sheetId: '1IEm7-cISj64p83k87s82aafvJCrTQ6DR', weeklyGid: '1744245779', monthlyGid: '1085598717' },
    { label: 'Rio 2', sheetId: '1fgroEU8mqIKlVXHgsoVQZWj2qLoP5qRN', weeklyGid: '2068008843', monthlyGid: '1842388431' },
    { label: 'São Gonçalo', sheetId: '1ejAt4s58dTXfdnTCSbIZwO75X6l6EIso', weeklyGid: '488691062', monthlyGid: '1872014387' },
    { label: 'Tijuca', sheetId: '1dfmfC80b6Oy32hQq8_EbdcNLy3PkxODW', weeklyGid: '1594545176', monthlyGid: '253474564' },
    { label: 'Valqueire', sheetId: '1kUKhdrGi3wvox4WyQXbR6n-CKt60rjMT', weeklyGid: '1951305660', monthlyGid: '2076394421' },
    { label: 'Vila da Penha', sheetId: '12DfT18goxBnAuNu1mlqgPbGOECWPN3BQ', weeklyGid: '1772337824', monthlyGid: '1851225872' },
    { label: 'Zona Sul', sheetId: '12dS55LaIQtei2gIp_hpNvcE5s9L_iiYr', weeklyGid: '1967870563', monthlyGid: '318404404' }
  ];

  const METRIC_ORDER_MONTHLY = ['VENDAS', ['FATURAMENTO LÍQUIDO', 'GMV'], 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const METRIC_ORDER_WEEKLY = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];
  const TARGET_KEYS = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSAO', 'BUDGET', 'PROMOADS', 'SUBIFOOD', 'CPO', 'ROI'];

  function remapFlat(genericFlat, order) {
    const out = {};
    TARGET_KEYS.forEach((targetKey, i) => {
      const genericKey = order[i];
      const resolvedKey = Array.isArray(genericKey) ? (genericFlat[genericKey[0]] !== undefined ? genericKey[0] : genericKey[1]) : genericKey;
      if (genericFlat[resolvedKey] !== undefined) out[targetKey] = genericFlat[resolvedKey];
    });
    return out;
  }

  async function buildUnit(unit) {
    const [weeklyRows, monthlyRows] = await Promise.all([
      SheetsSync.fetchCsvRows(unit.sheetId, unit.weeklyGid),
      SheetsSync.fetchCsvRows(unit.sheetId, unit.monthlyGid)
    ]);

    const weeklyGeneric = SheetsSync.parseCumulativeLikeSheet(weeklyRows, METRIC_ORDER_WEEKLY, SheetsSync.brNumberPct100);
    const weeklyKey = Object.keys(weeklyGeneric)[0];
    if (!weeklyKey) throw new Error('Unidade não encontrada na aba semanal de ' + unit.label);
    const weekly = {};
    TARGET_KEYS.forEach(targetKey => { weekly[targetKey] = {}; });
    Object.keys(weeklyGeneric[weeklyKey]).forEach(genericLabel => {
      const idx = METRIC_ORDER_WEEKLY.indexOf(genericLabel);
      if (idx === -1) return;
      const targetKey = TARGET_KEYS[idx];
      Object.keys(weeklyGeneric[weeklyKey][genericLabel]).forEach(period => {
        const monthVals = weeklyGeneric[weeklyKey][genericLabel][period];
        const entry = {};
        Object.keys(monthVals).forEach(monthName => { entry[monthName.toLowerCase()] = monthVals[monthName]; });
        weekly[targetKey][period] = entry;
      });
    });

    const monthlyGeneric = SheetsSync.parseMonthlyLikeSheet(monthlyRows, METRIC_ORDER_MONTHLY);
    const monthlyKey = Object.keys(monthlyGeneric)[0];
    if (!monthlyKey) throw new Error('Unidade não encontrada na aba mensal de ' + unit.label);
    const monthly = {};
    METRIC_ORDER_MONTHLY.forEach((genericKey, i) => {
      const resolvedKey = Array.isArray(genericKey) ? (monthlyGeneric[monthlyKey][genericKey[0]] ? genericKey[0] : genericKey[1]) : genericKey;
      const src = monthlyGeneric[monthlyKey][resolvedKey];
      if (!src) return;
      const targetKey = TARGET_KEYS[i];
      const entry = {};
      Object.keys(src).forEach(monthName => { entry[monthName.toLowerCase()] = src[monthName]; });
      monthly[targetKey] = entry;
    });

    return { weekly, monthly };
  }

  async function loadLive() {
    const results = await Promise.allSettled(UNITS.map(u => buildUnit(u)));
    const DATA_FRESH = {};
    let okCount = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { DATA_FRESH[UNITS[i].label] = r.value; okCount++; }
      else console.warn('[live-sync] Falha ao carregar unidade ' + UNITS[i].label + ':', r.reason);
    });
    // Exige uma maioria clara das 20 unidades OK — algumas falhas isoladas (rede/planilha)
    // não devem jogar o painel inteiro de volta pro snapshot.
    if (okCount < UNITS.length * 0.6) throw new Error(`Só ${okCount} de ${UNITS.length} unidades carregaram — abortando para manter o snapshot.`);
    return DATA_FRESH;
  }

  function rerenderAll() {
    // syncMonthSegs primeiro: redescobre os meses reais em DATA (que acabou de ser atualizado
    // via Object.assign) e reconstrói os 3 filtros de mês + o seletor de comparação antes de
    // qualquer renderXxx() rodar — senão os filtros ficam presos no tamanho antigo.
    ['syncMonthSegs', 'renderDashFechado', 'renderDashParcial', 'renderInvest', 'renderParcial'].forEach(fn => {
      if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) { console.error(fn + ' falhou:', e); } }
    });
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        // Object.assign (não mutateObjectInPlace): unidade que falhou nesta rodada mantém
        // o valor anterior (snapshot ou última busca OK) em vez de sumir de DATA/STORE_NAMES.
        Object.assign(DATA, fresh);
        rerenderAll();
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
