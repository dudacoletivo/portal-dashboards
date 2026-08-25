// Sincronização ao vivo do dashboard Spesso com a planilha [Spesso] Dashboard (5 abas).
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, e que este script
// rode DEPOIS do bloco principal do dashboard (STORE_DATA/ALAVANCAS_DATA/CANCELAMENTOS_DATA/
// AVALIACOES_DATA/renderAll já definidos).
(function () {
  const SHEET_ID = '1kCPHSI4PMVNIzd1NtctVBlqI2LR6lCGjx8XfgTN6rD0';
  const GID_MONTHLY = '1105013629';    // "[Ifood] Spesso Mensal" — Mês Fechado
  const GID_CUMULATIVE = '1608354459'; // "[Ifood] Comparativo semanal" — Parcial
  const GID_ALAVANCAS = '478384061';   // "Status das alavancas"
  const GID_CANCELAMENTOS = '521464282';
  const GID_AVALIACOES = '1788840864';

  const MONTH_NAMES_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

  // genérico (CSV) -> { targetKey, label, unit } usado tanto no mensal quanto no parcial
  const METRIC_MAP_MONTHLY = [
    ['VENDAS', 'vendas', 'Vendas', 'num'],
    [['FATURAMENTO LÍQUIDO', 'GMV'], 'faturamento', 'Faturamento líquido', 'money'],
    ['TM', 'tm', 'Ticket médio (TM)', 'money'],
    ['NOVOS', 'novos', 'Novos clientes', 'num'],
    ['VISITAS', 'visitas', 'Visitas', 'num'],
    ['CONVERSÃO %', 'conversao', 'Conversão %', 'pct'],
    ['Budget de investimento', 'budget', 'Budget de investimento', 'pct'],
    ['PROMOÇÕES + ADS', 'ads', 'Promoções + Ads', 'money'],
    ['SUB IFOOD', 'subifood', 'Sub iFood', 'money'],
    ['CPO', 'cpo', 'CPO', 'money'],
    ['ROI', 'roi', 'ROI', 'money']
  ];
  const METRIC_MAP_CUM = [
    ['VENDAS', 'vendas', 'Vendas', 'num'],
    ['GMV', 'gmv', 'GMV', 'money'],
    ['TM', 'tm', 'Ticket médio (TM)', 'money'],
    ['NOVOS', 'novos', 'Novos clientes', 'num'],
    ['VISITAS', 'visitas', 'Visitas', 'num'],
    ['CONVERSÃO %', 'conversao', 'Conversão %', 'pct'],
    ['Budget de investimento', 'budget', 'Budget de investimento', 'pct'],
    ['PROMOÇÕES + ADS', 'ads', 'Promoções + Ads', 'money'],
    ['SUB IFOOD', 'subifood', 'Sub iFood', 'money'],
    ['CPO', 'cpo', 'CPO', 'money'],
    ['ROI', 'roi', 'ROI', 'money']
  ];

  function monthKeyFromNumber(mm) { return MONTH_NAMES_PT[mm - 1].toLowerCase(); }

  async function buildMonthly() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_MONTHLY);
    const genericKeys = METRIC_MAP_MONTHLY.map(m => m[0]);
    const generic = SheetsSync.parseMonthlyLikeSheet(rows, genericKeys, SheetsSync.brNumberPct100);
    const storeKey = Object.keys(generic)[0];
    if (!storeKey) throw new Error('Loja não encontrada na aba mensal');
    const genericStore = generic[storeKey];
    const monthsPresent = MONTH_NAMES_PT.filter(m => Object.values(genericStore).some(metric => metric[m] !== undefined));
    const out = {};
    METRIC_MAP_MONTHLY.forEach(([genericKey, targetKey, label, unit]) => {
      const resolvedKey = Array.isArray(genericKey) ? (genericStore[genericKey[0]] ? genericKey[0] : genericKey[1]) : genericKey;
      const src = genericStore[resolvedKey];
      out[targetKey] = { label, unit, values: monthsPresent.map(m => (src && src[m] !== undefined) ? src[m] : null) };
    });
    return { data: out, monthLabels: monthsPresent.map(m => m.charAt(0) + m.slice(1).toLowerCase()) };
  }

  async function buildParcial() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_CUMULATIVE);
    const generic = SheetsSync.parseCumulativeLikeSheet(rows, METRIC_MAP_CUM.map(m => m[0]), SheetsSync.brNumberPct100);
    const storeKey = Object.keys(generic)[0];
    if (!storeKey) throw new Error('Loja não encontrada na aba parcial');
    const genericStore = generic[storeKey];
    const out = {};
    METRIC_MAP_CUM.forEach(([genericKey, targetKey, label, unit]) => {
      const src = genericStore[genericKey];
      if (!src) return;
      Object.keys(src).forEach(period => {
        const dayKey = String(parseInt(period.split('-')[1], 10));
        out[dayKey] = out[dayKey] || {};
        const monthVals = src[period];
        const entry = { label, unit };
        Object.keys(monthVals).forEach(monthName => {
          entry[monthName.slice(0, 3).toLowerCase()] = monthVals[monthName];
        });
        out[dayKey][targetKey] = entry;
      });
    });
    return out;
  }

  async function buildAlavancas() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_ALAVANCAS);
    const parsed = SheetsSync.parseLeverSheetSingleStore(rows);
    // spesso.html imprime lever.detail sem checagem de nulo (<p>${lever.detail}</p>),
    // então precisamos de uma string mesmo quando a planilha não traz detalhe.
    Object.values(parsed).forEach(month => {
      month.levers.forEach(l => { if (l.detail == null) l.detail = 'Sem detalhes informados na planilha.'; });
    });
    return parsed;
  }

  async function buildCancelamentos() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_CANCELAMENTOS);
    const header = rows[0].map(h => (h || '').trim());
    const idx = (name) => header.indexOf(name);
    const iData = idx('Data e hora do pedido');
    const iTurno = idx('Turno');
    const iStatus = idx('Status do pedido');
    const iMotivo = idx('Motivo do cancelamento');
    const iImpactou = idx('Impactou o super?');
    const iValorPedido = idx('Valor do pedido (R$)');
    const iValorCancel = idx('Valor total do cancelamento com entrega (R$)');
    const iItens = idx('Itens cancelados');
    const iOrigem = idx('Origem do cancelamento');
    const iTentativa = idx('Teve tentativa de negociação?');
    const iContestavel = idx('Cancelamento é contestável?');
    const iPrazo = idx('Data limite para contestação');
    const iLojaSolicitou = idx('Loja solicitou contestação?');
    const iMotivoImp = idx('Motivo da impossibilidade de contestar');
    const iStatusContest = idx('Status da contestação');

    const isYes = (v) => (v || '').trim().toUpperCase() === 'SIM';
    const nullDash = (v) => (!v || v.trim() === '-') ? null : SheetsSync.sentenceCase(v);

    const byMonth = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawDate = (row[iData] || '').trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(rawDate);
      if (!m) continue;
      const monthKey = monthKeyFromNumber(parseInt(m[2], 10));
      const order = {
        data: `${m[3]}/${m[2]}/${m[1]} ${m[4]}`,
        turno: SheetsSync.sentenceCase(row[iTurno]),
        status: SheetsSync.sentenceCase(row[iStatus]),
        motivo: SheetsSync.sentenceCase(row[iMotivo]),
        impactouSuper: isYes(row[iImpactou]),
        valorPedido: SheetsSync.brNumber(row[iValorPedido]),
        valorCancelamento: SheetsSync.brNumber(row[iValorCancel]),
        itens: row[iItens] || '',
        origem: SheetsSync.sentenceCase(row[iOrigem]),
        tentativaNegociacao: isYes(row[iTentativa]),
        contestavel: isYes(row[iContestavel]),
        prazoContestacao: nullDash(row[iPrazo]),
        lojaSolicitouContestacao: isYes(row[iLojaSolicitou]),
        motivoImpossibilidade: nullDash(row[iMotivoImp]),
        statusContestacao: nullDash(row[iStatusContest])
      };
      byMonth[monthKey] = byMonth[monthKey] || { label: monthKey.charAt(0).toUpperCase() + monthKey.slice(1), orders: [] };
      byMonth[monthKey].orders.push(order);
    }
    return byMonth;
  }

  async function buildAvaliacoes() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_AVALIACOES);
    const header = rows[0].map(h => (h || '').trim());
    const idx = (name) => header.indexOf(name);
    const iData = idx('Data');
    const iNota = idx('Nota');
    const iAval = idx('Avaliação');
    const iMelhorar = idx('O que pode melhorar?');
    const iStatus = idx('Status');

    const byMonth = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawDate = (row[iData] || '').trim();
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(rawDate);
      if (!m) continue;
      const monthKey = monthKeyFromNumber(parseInt(m[2], 10));
      const review = {
        data: rawDate,
        nota: SheetsSync.brNumber(row[iNota]),
        avaliacao: row[iAval] || '',
        melhorar: row[iMelhorar] || '',
        status: row[iStatus] || ''
      };
      byMonth[monthKey] = byMonth[monthKey] || { label: monthKey.charAt(0).toUpperCase() + monthKey.slice(1), reviews: [] };
      byMonth[monthKey].reviews.push(review);
    }
    return byMonth;
  }

  async function loadLive() {
    const [monthlyRes, parcial, alavancas, cancelamentos, avaliacoes] = await Promise.all([
      buildMonthly(), buildParcial(), buildAlavancas(), buildCancelamentos(), buildAvaliacoes()
    ]);
    if (!Object.keys(parcial).length) throw new Error('Parcial vazio');
    return { monthly: monthlyRes.data, monthLabels: monthlyRes.monthLabels, parcial, alavancas, cancelamentos, avaliacoes };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(STORE_DATA.spesso.monthly, fresh.monthly);
        // MONTH_LABELS é um array posicional (M.<metrica>.values[i] corresponde a MONTH_LABELS[i]) —
        // sem isso, um mes novo entraria nos arrays de dados mas o filtro/rotulos ficariam presos
        // no tamanho antigo. mutateArrayInPlace preserva a mesma referencia (é const em spesso.html).
        SheetsSync.mutateArrayInPlace(MONTH_LABELS, fresh.monthLabels);
        SheetsSync.mutateObjectInPlace(STORE_DATA.spesso.parcial, fresh.parcial);
        SheetsSync.mutateObjectInPlace(ALAVANCAS_DATA, fresh.alavancas);
        SheetsSync.mutateObjectInPlace(CANCELAMENTOS_DATA, fresh.cancelamentos);
        SheetsSync.mutateObjectInPlace(AVALIACOES_DATA, fresh.avaliacoes);
        renderAll();
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
