// Sincronização ao vivo do dashboard Spesso.
// Monthly/Parcial/Cancelamentos vêm da planilha NOVA (alimentada automaticamente pela IA do
// iFood/Toqan) — trocado em 09/11/2026. Status de Alavancas e Avaliações continuam vindo da
// planilha ANTIGA (ainda mantida manualmente pela agência) — por isso este script lê de DUAS
// planilhas diferentes.
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, e que este script
// rode DEPOIS do bloco principal do dashboard (STORE_DATA/ALAVANCAS_DATA/CANCEL_*/
// AVALIACOES_DATA/renderAll já definidos).
(function () {
  const OLD_SHEET_ID = '1kCPHSI4PMVNIzd1NtctVBlqI2LR6lCGjx8XfgTN6rD0';
  const GID_ALAVANCAS = '478384061';   // "Status das alavancas" (planilha antiga, mantida manualmente)
  const GID_AVALIACOES = '1788840864'; // "Avaliações" (planilha antiga, mantida manualmente)

  const NEW_SHEET_ID = '1uNfyAiXgXnoC23ErJHgcVyjXk4_ra1R-poqCXIgVeTk';
  const GID_CONSOLIDADO = '138674290'; // aba "Consolidado" — métricas (Mês Fechado + Parcial).
  // Usa "Consolidado", não a aba principal "Spesso Cucina & Pizza": a planilha tem 1 loja só,
  // então os valores são idênticos — mas a aba principal tem um bug na linha "Visitas" dos
  // blocos 01-14/01-21 (vem formatada como percentual, ex. "7400,0%" em vez de "74"); a
  // Consolidado não tem esse bug.
  const GID_CANCELAMENTOS = '249275755';
  const GID_ITENS_CANCELADOS = '1480709717'; // aba "Itens Cancelados"

  const MONTH_NAMES_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const MONTH_KEY_PT = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const MONTH_ABBR_PT = { JAN:'janeiro', FEV:'fevereiro', MAR:'marco', ABR:'abril', MAI:'maio', JUN:'junho', JUL:'julho', AGO:'agosto', SET:'setembro', OUT:'outubro', NOV:'novembro', DEZ:'dezembro' };
  const MONTH_ORDER_PT = {}; MONTH_KEY_PT.forEach((k, i) => { MONTH_ORDER_PT[k] = i; });

  function monthKeyFromNumber(mm) { return MONTH_NAMES_PT[mm - 1].toLowerCase(); }
  function monthKeyFromDDMMYYYY(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
    if (!m) return null;
    return monthKeyFromNumber(parseInt(m[2], 10));
  }

  // Esta planilha mistura decimal BR (vírgula, ex. "251,7") com decimal US (ponto, ex. "306.17")
  // na mesma linha — a coluna de Novembro vem sempre em formato diferente das demais. Também
  // mistura percentual com "%" (raro aqui) e fração pura sem "%" (padrão na aba Consolidado,
  // ex. "0,032" = 3,2%) — por isso parsePercent trata os dois casos.
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v).trim();
    if (/^(n\/a|n\/d|-|–|—)$/i.test(s)) return null;
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function parsePercent(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (/^(n\/a|n\/d|-|–|—)$/i.test(s)) return null;
    const n = parseNum(s);
    if (n === null) return null;
    return /%/.test(s) ? n : n * 100;
  }

  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const abbr = h.slice(0, 3);
    return MONTH_ABBR_PT[abbr] || null;
  }

  // Bloco "— 01-07 —" / "— Mês Fechado —" (aceita traço simples, em-dash ou travessão duplo,
  // conforme o estilo que cada planilha de cliente usar).
  function parseBlockLabel(cell) {
    const s = (cell || '').trim();
    const m = /^[—–\-─]{1,2}\s*(.+?)\s*[—–\-─]{1,2}$/.exec(s);
    if (!m) return null;
    const label = m[1].trim();
    const plain = label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (plain === 'MES FECHADO') return 'CLOSED';
    const wm = /^(\d{1,2})-(\d{1,2})$/.exec(label);
    if (wm) return 'w' + parseInt(wm[2], 10);
    return null;
  }

  function metricKeyFor(name) {
    const n = (name || '').trim().toUpperCase();
    if (/^PEDIDOS/.test(n)) return 'vendas';
    if (/^GMV/.test(n)) return 'faturamento';
    if (/^TICKET M/.test(n)) return 'tm';
    if (/^CLIENTES NOVOS/.test(n)) return 'novos';
    if (/^VISITAS/.test(n)) return 'visitas';
    if (/^CONVERS/.test(n)) return 'conversao';
    if (/^% INVEST/.test(n)) return 'budget';
    if (/^TOTAL INVEST/.test(n)) return 'ads'; // nome histórico do campo (valor total investido)
    if (/^SUBS[IÍ]DIO/.test(n)) return 'subifood';
    if (/^ROI/.test(n)) return 'roi';
    if (/^CPO/.test(n)) return 'cpo';
    return null;
  }
  const PERCENT_KEYS = new Set(['conversao', 'budget']);
  const METRIC_LABELS = {
    vendas: 'Vendas', faturamento: 'Faturamento líquido', tm: 'Ticket médio (TM)', novos: 'Novos clientes',
    visitas: 'Visitas', conversao: 'Conversão %', budget: 'Budget de investimento', ads: 'Promoções + Ads',
    subifood: 'Sub iFood', cpo: 'CPO', roi: 'ROI'
  };
  const METRIC_UNITS = {
    vendas: 'num', faturamento: 'money', tm: 'money', novos: 'num', visitas: 'num', conversao: 'pct',
    budget: 'pct', ads: 'money', subifood: 'money', cpo: 'money', roi: 'money'
  };

  // Lê a aba Consolidado inteira (vários blocos empilhados: 01-07/01-14/01-21/Mês Fechado) ->
  // { mensal: {mes: {metrica: valor}}, parcial: {janela: {mes: {metrica: valor}}} }.
  function parseConsolidado(rows) {
    const mensal = {};
    const parcial = {};
    let blockType = null, cols = null, seenInBlock = null;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const first = (row[0] || '').trim();

      const blockKind = parseBlockLabel(first);
      if (blockKind) { blockType = blockKind; cols = null; seenInBlock = new Set(); continue; }
      if (/m[eé]trica$/i.test(first)) {
        cols = [];
        for (let c = 1; c < row.length; c++) { const mk = monthKeyFor(row[c]); if (mk) cols.push({ c: c, month: mk }); }
        seenInBlock = new Set();
        continue;
      }
      if (!blockType || !cols || !cols.length) continue;

      const metricName = row[0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      if (seenInBlock.has(key)) continue;
      seenInBlock.add(key);

      cols.forEach(function (col) {
        const raw = row[col.c];
        const val = PERCENT_KEYS.has(key) ? parsePercent(raw) : parseNum(raw);
        if (blockType === 'CLOSED') {
          mensal[col.month] = mensal[col.month] || {};
          mensal[col.month][key] = val;
        } else {
          parcial[blockType] = parcial[blockType] || {};
          parcial[blockType][col.month] = parcial[blockType][col.month] || {};
          parcial[blockType][col.month][key] = val;
        }
      });
    }
    return { mensal: mensal, parcial: parcial };
  }

  async function fetchCsvRowsExport(sheetId, gid, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(function () { controller.abort(); }, timeoutMs || 10000);
    try {
      const url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv&gid=' + gid;
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || !text.trim()) throw new Error('CSV vazio');
      return SheetsSync.parseCsv(text);
    } finally {
      clearTimeout(t);
    }
  }

  async function buildMonthlyAndParcial() {
    const rows = await fetchCsvRowsExport(NEW_SHEET_ID, GID_CONSOLIDADO);
    const { mensal, parcial } = parseConsolidado(rows);

    const monthsPresent = MONTH_KEY_PT.filter(function (m) { return mensal[m] && Object.keys(mensal[m]).length; });
    if (!monthsPresent.length) throw new Error('Nenhum mês fechado encontrado na Consolidado');

    const monthly = {};
    Object.keys(METRIC_LABELS).forEach(function (key) {
      monthly[key] = {
        label: METRIC_LABELS[key], unit: METRIC_UNITS[key],
        values: monthsPresent.map(function (m) { return (mensal[m] && mensal[m][key] != null) ? mensal[m][key] : null; })
      };
    });
    const monthLabels = monthsPresent.map(function (m) { return m.charAt(0).toUpperCase() + m.slice(1); });

    // STORE_DATA.spesso.parcial usa a chave 'gmv' pra faturamento (STORE_DATA.spesso.monthly
    // usa 'faturamento') — nomenclatura herdada do dashboard original, mantida aqui pra não
    // precisar mexer no HTML.
    const PARCIAL_KEY_RENAME = { faturamento: 'gmv' };
    const parcialOut = {};
    Object.keys(parcial).forEach(function (windowKey) {
      const dayKey = windowKey.replace(/^w/, '');
      parcialOut[dayKey] = {};
      Object.keys(METRIC_LABELS).forEach(function (key) {
        const outKey = PARCIAL_KEY_RENAME[key] || key;
        const entry = { label: METRIC_LABELS[key], unit: METRIC_UNITS[key] };
        Object.keys(parcial[windowKey]).forEach(function (m) {
          const v = parcial[windowKey][m][key];
          if (v != null) entry[m.slice(0, 3)] = v;
        });
        parcialOut[dayKey][outKey] = entry;
      });
    });

    return { monthly: monthly, monthLabels: monthLabels, parcial: parcialOut };
  }

  async function buildAlavancas() {
    const rows = await SheetsSync.fetchCsvRows(OLD_SHEET_ID, GID_ALAVANCAS);
    const parsed = SheetsSync.parseLeverSheetSingleStore(rows);
    Object.values(parsed).forEach(month => {
      month.levers.forEach(l => { if (l.detail == null) l.detail = 'Sem detalhes informados na planilha.'; });
    });
    return parsed;
  }

  async function buildAvaliacoes() {
    const rows = await SheetsSync.fetchCsvRows(OLD_SHEET_ID, GID_AVALIACOES);
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

  // Extrai pares "Rótulo (n)" de uma célula como "Entregador / iFood (6) | Loja (3) | Cliente (1)".
  function parsePipeList(s) {
    return (s || '').split('|').map(function (part) {
      const m = /^(.+?)\s*\((\d+)\)\s*$/.exec(part.trim());
      return m ? { label: m[1].trim(), qtde: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
  }

  // Lê a aba "Cancelamentos" — formato trocado em ~20/11/2026 pelo mesmo que os outros clientes
  // Toqan usam (ver delli.js): não tem mais "RESUMO GERAL"/"DETALHAMENTO MÊS A MÊS" acumulado,
  // e sim um bloco "RESUMO MENSAL POR LOJA", um bloco por mês ("SET 2026 — 01/09 a 30/09/2026")
  // com cancelamentos/taxa/reembolso/origem/estágio principal daquele mês, e logo depois
  // "MOTIVOS — SET 2026" com a lista de motivos do mês. Não existe mais detalhe de GMV
  // cancelado, pedidos concluídos nem "afeta Super" — por isso o dashboard (ver spesso.html)
  // só usa cancelamentos/taxa/reembolso/origem/estágio/motivos. Motivo e origem "acumulados"
  // são somados aqui a partir dos blocos de cada mês (a planilha não traz mais isso pronto).
  function parseCancelamentos(rows) {
    const meses = [];
    const motivoLifetime = {};
    const origemLifetime = {};

    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r][0] || '').trim();

      const monthHeaderMatch = /^([A-ZÇ]{3}\s*\d{4})\s*—\s*(.+)$/i.exec(first);
      if (monthHeaderMatch) {
        const abbr = monthHeaderMatch[1].trim().slice(0, 3).toUpperCase();
        const key = MONTH_ABBR_PT[abbr];
        if (!key) continue;
        const parcial = /\(parcial\)\s*$/i.test(monthHeaderMatch[2]);
        let rr = r + 1;
        if (rows[rr] && /^loja$/i.test((rows[rr][0] || '').trim())) {
          rr++;
          const dataRow = rows[rr] || [];
          const origemPrincipal = dataRow[4] || '';
          const estagioPrincipal = dataRow[5] || '';
          meses.push({
            key: key, label: key.charAt(0).toUpperCase() + key.slice(1), parcial: parcial,
            cancelamentos: parseNum(dataRow[1]), taxa: parsePercent(dataRow[2]), devolvido: parseNum(dataRow[3]),
            origemPrincipal: origemPrincipal, estagioPrincipal: estagioPrincipal, motivos: ''
          });
          parsePipeList(origemPrincipal).forEach(function (o) { origemLifetime[o.label] = (origemLifetime[o.label] || 0) + o.qtde; });
        }
        continue;
      }

      const motivosMatch = /^MOTIVOS\s*—\s*(.+)$/i.exec(first);
      if (motivosMatch) {
        const abbr = motivosMatch[1].trim().slice(0, 3).toUpperCase();
        const key = MONTH_ABBR_PT[abbr];
        let rr = r + 1;
        if (key && rows[rr] && /^motivo$/i.test((rows[rr][0] || '').trim())) {
          const header = rows[rr];
          let totalCol = header.findIndex(function (h) { return /^total$/i.test((h || '').trim()); });
          if (totalCol < 0) totalCol = 1;
          rr++;
          const list = [];
          while (rr < rows.length && rows[rr][0] && !/^total$/i.test(rows[rr][0].trim())) {
            const label = rows[rr][0];
            const qtde = parseNum(rows[rr][totalCol]) || 0;
            list.push({ label: label, qtde: qtde });
            motivoLifetime[label] = (motivoLifetime[label] || 0) + qtde;
            rr++;
          }
          const mesObj = meses.find(function (m) { return m.key === key; });
          if (mesObj) mesObj.motivos = list.map(function (m) { return m.label + ' (' + m.qtde + ')'; }).join(', ');
        }
      }
    }

    meses.sort(function (a, b) { return MONTH_ORDER_PT[a.key] - MONTH_ORDER_PT[b.key]; });
    const motivo = Object.keys(motivoLifetime).map(function (label) { return { label: label, qtde: motivoLifetime[label] }; });
    const origem = Object.keys(origemLifetime).map(function (label) { return { label: label, qtde: origemLifetime[label] }; });
    return { meses: meses, motivo: motivo, origem: origem };
  }

  // Lê a aba "Itens Cancelados" -> lista de registros, um por item afetado num pedido cancelado
  // (Tipo="Total") ou parcialmente cancelado (Tipo="Parcial"). Mesmo formato usado pelo Delli e
  // pelo Garami/Kimura/Ipoke. Acumula histórico de vários meses — o filtro por mês acontece no
  // dashboard (ver renderItensCancelados em spesso.html), não aqui.
  function parseItensCancelados(rows) {
    const registros = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const mes = monthKeyFromDDMMYYYY(row[0]);
      if (!mes) continue;
      const item = (row[2] || '').trim();
      if (!item) continue;
      let categoria = (row[3] || '').trim();
      if (!categoria || categoria.toUpperCase() === 'NONE') categoria = 'Outros';
      const tipo = /parcial/i.test(row[4] || '') ? 'Parcial' : 'Total';
      const motivo = (row[6] || '').trim() || 'Não informado';
      registros.push({
        mes: mes, item: item, categoria: categoria, tipo: tipo, motivo: motivo,
        qtde: parseNum(row[7]) || 0, pedidos: parseNum(row[8]) || 0, valor: parseNum(row[9]) || 0
      });
    }
    return registros;
  }

  async function loadLive() {
    const [metrics, alavancas, avaliacoes] = await Promise.all([
      buildMonthlyAndParcial(), buildAlavancas(), buildAvaliacoes()
    ]);
    // Isolado do resto: se a aba de cancelamentos mudar de formato de novo (ou falhar), o
    // resto do dashboard (métricas/alavancas/avaliações) continua funcionando normalmente.
    let cancelamentos = { meses: [], motivo: [], origem: [] };
    try {
      cancelamentos = parseCancelamentos(await fetchCsvRowsExport(NEW_SHEET_ID, GID_CANCELAMENTOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Cancelamentos" indisponível:', e);
    }
    let itensCancel = [];
    try {
      itensCancel = parseItensCancelados(await fetchCsvRowsExport(NEW_SHEET_ID, GID_ITENS_CANCELADOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Itens Cancelados" indisponível:', e);
    }
    return { metrics, alavancas, avaliacoes, cancelamentos, itensCancel };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(STORE_DATA.spesso.monthly, fresh.metrics.monthly);
        SheetsSync.mutateArrayInPlace(MONTH_LABELS, fresh.metrics.monthLabels);
        SheetsSync.mutateObjectInPlace(STORE_DATA.spesso.parcial, fresh.metrics.parcial);
        SheetsSync.mutateObjectInPlace(ALAVANCAS_DATA, fresh.alavancas);
        SheetsSync.mutateObjectInPlace(AVALIACOES_DATA, fresh.avaliacoes);
        CANCEL_RESUMO.origem = fresh.cancelamentos.origem;
        CANCEL_RESUMO.motivo = fresh.cancelamentos.motivo;
        SheetsSync.mutateArrayInPlace(CANCEL_MESES, fresh.cancelamentos.meses);
        SheetsSync.mutateArrayInPlace(ITENS_CANCEL, fresh.itensCancel);
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
