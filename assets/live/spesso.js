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

  const MONTH_NAMES_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const MONTH_KEY_PT = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const MONTH_ABBR_PT = { JAN:'janeiro', FEV:'fevereiro', MAR:'marco', ABR:'abril', MAI:'maio', JUN:'junho', JUL:'julho', AGO:'agosto', SET:'setembro', OUT:'outubro', NOV:'novembro', DEZ:'dezembro' };
  const MONTH_ORDER_PT = {}; MONTH_KEY_PT.forEach((k, i) => { MONTH_ORDER_PT[k] = i; });

  function monthKeyFromNumber(mm) { return MONTH_NAMES_PT[mm - 1].toLowerCase(); }

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

  // Lê a aba "Cancelamentos" (nova): totais vitalícios (RESUMO GERAL + POR ORIGEM/ESTÁGIO/
  // MOTIVO/CÓDIGO) e a tabela "DETALHAMENTO MÊS A MÊS" (1 linha por mês, sem lista de pedidos
  // individuais — diferente do formato antigo). "Nov (01-06)" vira o mês parcial.
  function parseListSection(rows, startIdx, cols) {
    const list = [];
    let r = startIdx + 2; // pula o título da seção + o cabeçalho de coluna
    while (r < rows.length && rows[r][0] && !/^total$/i.test(rows[r][0].trim())) {
      const entry = { label: rows[r][0] };
      cols.forEach(function (c) { entry[c.key] = c.parse(rows[r][c.idx]); });
      list.push(entry);
      r++;
    }
    return list;
  }

  function parseCancelamentos(rows) {
    const sectionIdx = (title) => rows.findIndex(r => (r[0] || '').trim().toUpperCase().startsWith(title));

    const resumo = {};
    const iResumo = sectionIdx('RESUMO GERAL');
    if (iResumo >= 0) {
      const r1 = rows[iResumo + 1] || [], r2 = rows[iResumo + 2] || [];
      resumo.totalCancelamentos = parseNum(r1[1]);
      resumo.totalPedidos = parseNum(r1[4]);
      resumo.taxaGeral = parsePercent(r1[7]);
      resumo.gmvCancelado = parseNum(r2[1]);
      resumo.valorDevolvido = parseNum(r2[4]);
      resumo.afetaSuper = (r2[7] || '').trim(); // ex.: "17 de 22"
    }

    const origem = parseListSection(rows, sectionIdx('CANCELAMENTOS POR ORIGEM'), [
      { key: 'qtde', idx: 1, parse: parseNum }, { key: 'pct', idx: 2, parse: parsePercent }
    ]);
    const estagio = parseListSection(rows, sectionIdx('CANCELAMENTOS POR ESTÁGIO'), [
      { key: 'qtde', idx: 1, parse: parseNum }, { key: 'pct', idx: 2, parse: parsePercent }, { key: 'desc', idx: 3, parse: (v) => v || '' }
    ]);
    const motivo = parseListSection(rows, sectionIdx('CANCELAMENTOS POR MOTIVO'), [
      { key: 'qtde', idx: 1, parse: parseNum }, { key: 'pct', idx: 2, parse: parsePercent }
    ]);
    const codigo = parseListSection(rows, sectionIdx('CANCELAMENTOS POR C'), [
      { key: 'qtde', idx: 1, parse: parseNum }, { key: 'pct', idx: 2, parse: parsePercent }, { key: 'desc', idx: 3, parse: (v) => v || '' }
    ]);

    const meses = [];
    const iMeses = sectionIdx('DETALHAMENTO M');
    if (iMeses >= 0) {
      let r = iMeses + 2; // título + cabeçalho
      while (r < rows.length && rows[r][0] && !/^total$/i.test(rows[r][0].trim())) {
        const rawMes = rows[r][0].trim();
        const abbr = rawMes.slice(0, 3).toUpperCase();
        const key = MONTH_ABBR_PT[abbr];
        if (!key) { r++; continue; }
        const parcial = /\(/.test(rawMes); // "Nov (01-06)" = mês em andamento
        meses.push({
          key: key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          parcial: parcial,
          pedidosConcl: parseNum(rows[r][1]),
          cancelamentos: parseNum(rows[r][2]),
          taxa: parsePercent(rows[r][3]),
          gmvCancelado: parseNum(rows[r][4]),
          devolvido: parseNum(rows[r][5]),
          afetaSuper: (rows[r][6] || '').trim(),
          origemPrincipal: rows[r][7] || '',
          estagioPrincipal: rows[r][8] || '',
          motivos: rows[r][9] || ''
        });
        r++;
      }
      meses.sort(function (a, b) { return MONTH_ORDER_PT[a.key] - MONTH_ORDER_PT[b.key]; });
    }

    return { resumo: resumo, origem: origem, estagio: estagio, motivo: motivo, codigo: codigo, meses: meses };
  }

  async function loadLive() {
    const [metrics, alavancas, avaliacoes, cancelRows] = await Promise.all([
      buildMonthlyAndParcial(), buildAlavancas(), buildAvaliacoes(),
      fetchCsvRowsExport(NEW_SHEET_ID, GID_CANCELAMENTOS)
    ]);
    const cancelamentos = parseCancelamentos(cancelRows);
    if (!cancelamentos.meses.length) throw new Error('Nenhum mês encontrado na aba Cancelamentos');
    return { metrics, alavancas, avaliacoes, cancelamentos };
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
        CANCEL_RESUMO.data = fresh.cancelamentos.resumo;
        CANCEL_RESUMO.origem = fresh.cancelamentos.origem;
        CANCEL_RESUMO.estagio = fresh.cancelamentos.estagio;
        CANCEL_RESUMO.motivo = fresh.cancelamentos.motivo;
        CANCEL_RESUMO.codigo = fresh.cancelamentos.codigo;
        SheetsSync.mutateArrayInPlace(CANCEL_MESES, fresh.cancelamentos.meses);
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
