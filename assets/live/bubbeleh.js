// Sincronização ao vivo do dashboard Bubbeleh — cliente novo, criado em 23/11/2026, já direto
// no formato de planilha alimentado pela IA do iFood/Toqan (sem planilha antiga pra migrar, sem
// Alavancas nem Avaliações como abas separadas).
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, e que este script
// rode DEPOIS do bloco principal do dashboard (STORE_DATA/CANCEL_*/ITENS_CANCEL/renderAll já
// definidos).
(function () {
  const SHEET_ID = '13q1_905KeY34aVmgrlTiUPtoz-jyCftkAChMgEmYG_U';
  const GID_BUBBELEH = '694791440'; // aba "Bubbeleh" — métricas (Mês Fechado + Parcial). Loja
  // única: a aba "Consolidado" da planilha é idêntica a esta, por isso nem é usada aqui.
  const GID_CANCELAMENTOS = '67461720';
  const GID_ITENS_CANCELADOS = '1612235766'; // aba "Itens Cancelados"

  const MONTH_NAMES_PT = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const MONTH_ABBR_PT = { JAN: 'janeiro', FEV: 'fevereiro', MAR: 'marco', ABR: 'abril', MAI: 'maio', JUN: 'junho', JUL: 'julho', AGO: 'agosto', SET: 'setembro', OUT: 'outubro', NOV: 'novembro', DEZ: 'dezembro' };
  const MONTH_LABEL_PT_UP = { janeiro: 'Janeiro', fevereiro: 'Fevereiro', marco: 'Março', abril: 'Abril', maio: 'Maio', junho: 'Junho', julho: 'Julho', agosto: 'Agosto', setembro: 'Setembro', outubro: 'Outubro', novembro: 'Novembro', dezembro: 'Dezembro' };

  // Esta planilha cobre Out/2025 a Nov/2026 (14 meses) — diferente de todo o resto do portal,
  // que só cobre Jan-Nov de um único ano. "Out"/"Nov"/"Dez" se repetem entre os dois anos, então
  // os meses de 2025 ganham uma chave própria com o ano embutido ("outubro25") pra não colidir
  // com "outubro" (2026, implícito — a planilha não marca o ano nos meses do ano corrente).
  const MONTH_KEY_PT = ['outubro25', 'novembro25', 'dezembro25', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro'];
  const MONTH_ORDER_PT = {}; MONTH_KEY_PT.forEach((k, i) => { MONTH_ORDER_PT[k] = i; });

  function monthKeyFromNumber(mm) { return MONTH_NAMES_PT[mm - 1].toLowerCase(); }

  // Deriva a chave de mês a partir de um rótulo que pode ou não trazer o ano explícito:
  // "Nov*(01-22)" -> novembro (2026, implícito); "Nov/25" ou "Nov 2025 (a partir de 22/10)" ->
  // novembro25 (2025, explícito — qualquer menção a "25" no rótulo marca o ano anterior).
  function monthKeyFromLabel(s) {
    const raw = (s || '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const abbrMatch = /^([A-Z]{3})/.exec(upper);
    if (!abbrMatch) return null;
    const base = MONTH_ABBR_PT[abbrMatch[1]];
    if (!base) return null;
    const is2025 = /\/25|2025/.test(raw);
    return is2025 ? base + '25' : base;
  }
  function monthKeyFromDDMMYYYY(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
    if (!m) return null;
    const base = monthKeyFromNumber(parseInt(m[2], 10));
    return m[3] === '2025' ? base + '25' : base;
  }
  // Rótulo bonito pra UI: "outubro25" -> "Out/25" (como a planilha escreve); "novembro" -> "Novembro".
  function prettyMonthLabel(key) {
    const is25 = /25$/.test(key);
    const base = is25 ? key.slice(0, -2) : key;
    const label = MONTH_LABEL_PT_UP[base] || base;
    return is25 ? label.slice(0, 3) + '/25' : label;
  }

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

  // Bloco "── 01-07 ──" / "── Mês Fechado ──" (aceita traço simples, em-dash ou travessão duplo).
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

  // Lê a aba "Bubbeleh" inteira (vários blocos empilhados: 01-07/01-14/01-21/Mês Fechado) ->
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
        for (let c = 1; c < row.length; c++) { const mk = monthKeyFromLabel(row[c]); if (mk) cols.push({ c: c, month: mk }); }
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
    const rows = await fetchCsvRowsExport(SHEET_ID, GID_BUBBELEH);
    const { mensal, parcial } = parseConsolidado(rows);

    const monthsPresent = MONTH_KEY_PT.filter(function (m) { return mensal[m] && Object.keys(mensal[m]).length; });
    if (!monthsPresent.length) throw new Error('Nenhum mês fechado encontrado na aba Bubbeleh');

    const monthly = {};
    Object.keys(METRIC_LABELS).forEach(function (key) {
      monthly[key] = {
        label: METRIC_LABELS[key], unit: METRIC_UNITS[key],
        values: monthsPresent.map(function (m) { return (mensal[m] && mensal[m][key] != null) ? mensal[m][key] : null; })
      };
    });
    const monthLabels = monthsPresent.map(prettyMonthLabel);

    // STORE_DATA.Bubbeleh.parcial usa a chave 'gmv' pra faturamento (STORE_DATA.Bubbeleh.monthly
    // usa 'faturamento') — nomenclatura herdada do dashboard original (Spesso), mantida aqui pra
    // não precisar mexer no HTML.
    const PARCIAL_KEY_RENAME = { faturamento: 'gmv' };
    const parcialOut = {};
    Object.keys(parcial).forEach(function (windowKey) {
      const dayKey = windowKey.replace(/^w/, '');
      parcialOut[dayKey] = {};
      Object.keys(METRIC_LABELS).forEach(function (key) {
        const outKey = PARCIAL_KEY_RENAME[key] || key;
        const entry = { label: METRIC_LABELS[key], unit: METRIC_UNITS[key] };
        Object.keys(parcial[windowKey]).forEach(function (m) {
          // Corte parcial (dias já passados do mês) só faz sentido pro mês em andamento — meses
          // de 2025 já fecharam há muito, por isso ficam de fora daqui (evita também a colisão
          // de chave de 3 letras: "outubro25".slice(0,3) seria igual a "outubro" de 2026).
          if (/25$/.test(m)) return;
          const v = parcial[windowKey][m][key];
          if (v != null) entry[m.slice(0, 3)] = v;
        });
        parcialOut[dayKey][outKey] = entry;
      });
    });

    return { monthly: monthly, monthLabels: monthLabels, parcial: parcialOut };
  }

  // Extrai pares "Rótulo (n)" de uma célula como "Entregador / iFood (6) | Loja (3) | Cliente (1)".
  function parsePipeList(s) {
    return (s || '').split('|').map(function (part) {
      const m = /^(.+?)\s*\((\d+)\)\s*$/.exec(part.trim());
      return m ? { label: m[1].trim(), qtde: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
  }

  // Lê a aba "Cancelamentos" — estrutura HÍBRIDA, só da Bubbeleh: uma tabela "HISTÓRICO MENSAL
  // OUT/25–AGO/26" (1 linha por mês, só cancelamentos/taxa/reembolso/origem/estágio — sem
  // motivos por pedido) cobrindo os primeiros 11 meses, seguida pelos blocos recentes no mesmo
  // formato usado pelo Delli ("SET 2026 — ...", "MOTIVOS — SET 2026", etc.) pros 3 meses mais
  // recentes, que aí sim trazem motivos. A tabela "HISTÓRICO" aparece duplicada na planilha — o
  // guard `!meses.find(...)` abaixo garante que só a primeira ocorrência de cada mês é usada.
  function parseCancelamentos(rows) {
    const meses = [];
    const motivoLifetime = {};
    const origemLifetime = {};

    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r][0] || '').trim();

      // Tabela "HISTÓRICO MENSAL OUT/25–AGO/26": "Mês,Pedidos concl.,Cancelamentos,Taxa %,
      // Reembolsado (R$),Origem principal,Estágio principal".
      if (/^m[eê]s$/i.test(first) && /pedidos concl/i.test(rows[r][1] || '')) {
        let rr = r + 1;
        while (rr < rows.length && rows[rr][0] && !/^\*/.test(rows[rr][0].trim())) {
          const key = monthKeyFromLabel(rows[rr][0]);
          if (key && !meses.find(function (m) { return m.key === key; })) {
            const origemPrincipal = rows[rr][5] || '';
            meses.push({
              key: key, label: prettyMonthLabel(key), parcial: false,
              cancelamentos: parseNum(rows[rr][2]), taxa: parsePercent(rows[rr][3]), devolvido: parseNum(rows[rr][4]),
              origemPrincipal: origemPrincipal, estagioPrincipal: rows[rr][6] || '', motivos: ''
            });
            parsePipeList(origemPrincipal).forEach(function (o) { origemLifetime[o.label] = (origemLifetime[o.label] || 0) + o.qtde; });
          }
          rr++;
        }
        r = rr - 1;
        continue;
      }

      const monthHeaderMatch = /^([A-ZÇ]{3}\s*\d{4})\s*—\s*(.+)$/i.exec(first);
      if (monthHeaderMatch) {
        const key = monthKeyFromLabel(monthHeaderMatch[1]);
        if (!key) continue;
        const parcial = /\(parcial\)\s*$/i.test(monthHeaderMatch[2]);
        let rr = r + 1;
        if (rows[rr] && /^loja$/i.test((rows[rr][0] || '').trim())) {
          rr++;
          const dataRow = rows[rr] || [];
          const origemPrincipal = dataRow[4] || '';
          const estagioPrincipal = dataRow[5] || '';
          const existing = meses.find(function (m) { return m.key === key; });
          const entry = {
            key: key, label: prettyMonthLabel(key), parcial: parcial,
            cancelamentos: parseNum(dataRow[1]), taxa: parsePercent(dataRow[2]), devolvido: parseNum(dataRow[3]),
            origemPrincipal: origemPrincipal, estagioPrincipal: estagioPrincipal, motivos: ''
          };
          if (existing) Object.assign(existing, entry); else meses.push(entry);
          parsePipeList(origemPrincipal).forEach(function (o) { origemLifetime[o.label] = (origemLifetime[o.label] || 0) + o.qtde; });
        }
        continue;
      }

      const motivosMatch = /^MOTIVOS\s*—\s*(.+)$/i.exec(first);
      if (motivosMatch) {
        const key = monthKeyFromLabel(motivosMatch[1]);
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
  // (Tipo="Total") ou parcialmente cancelado (Tipo="Parcial"). Mesmo formato usado pelo Delli,
  // Spesso e Garami/Kimura/Ipoke/Pato. Acumula histórico de vários meses — o filtro por mês
  // acontece no dashboard (ver renderItensCancelados em bubbeleh.html), não aqui.
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
    const metrics = await buildMonthlyAndParcial();
    // Isolado do resto: se a aba de cancelamentos mudar de formato de novo (ou falhar), o
    // resto do dashboard (métricas) continua funcionando normalmente.
    let cancelamentos = { meses: [], motivo: [], origem: [] };
    try {
      cancelamentos = parseCancelamentos(await fetchCsvRowsExport(SHEET_ID, GID_CANCELAMENTOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Cancelamentos" indisponível:', e);
    }
    let itensCancel = [];
    try {
      itensCancel = parseItensCancelados(await fetchCsvRowsExport(SHEET_ID, GID_ITENS_CANCELADOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Itens Cancelados" indisponível:', e);
    }
    return { metrics: metrics, cancelamentos: cancelamentos, itensCancel: itensCancel };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(STORE_DATA.Bubbeleh.monthly, fresh.metrics.monthly);
        SheetsSync.mutateArrayInPlace(MONTH_LABELS, fresh.metrics.monthLabels);
        SheetsSync.mutateObjectInPlace(STORE_DATA.Bubbeleh.parcial, fresh.metrics.parcial);
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
