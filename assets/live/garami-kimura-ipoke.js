// Sincronização ao vivo do painel Garami/Kimura/Ipoke com a planilha única "Kimura | Garami |
// Ipoke — Performance iFood Jan-Nov 2026" (alimentada automaticamente pela IA do iFood/Toqan).
// Trocado em 09/11/2026 a partir das 3 planilhas antigas (uma por marca, cada uma com 3
// unidades) — a nova traz 11 abas, uma por unidade (Garami e Kimura ganharam uma 4ª unidade,
// "Recreio"; Ipoke continua só com Barra/Tijuca/Zona Sul), mais as abas "Cancelamentos" e
// "Itens Cancelados" (esta última lida por parseItensCancelados, adicionada em 23/11/2026).
//
// Formato de cada aba de unidade: igual ao Delli — vários blocos empilhados na mesma aba
// ("── 01-07 ──" / "── 01-14 ──" / "── 01-21 ──" / "── Mês Fechado ──"), cabeçalho "Métrica" e
// colunas de mês abreviadas (Jan, Fev, ...). parseMultiBlockTab lê os blocos em sequência.
//
// Este dashboard guarda DATA/STORES/METRICS como variáveis LOCAIS dentro de initDashboard()
// (não são globais), então não dá pra mutar in-place como no Delli. Em vez disso,
// clientes/garami-kimura-ipoke.html lê `const RAW = window.__LIVE_RAW || {snapshot embutido}`
// — aqui a gente monta um RAW novo (incluindo CANCEL, pra aba de Cancelamentos) e chama
// startDashboardSafely() de novo pra re-renderizar tudo com os dados frescos.
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados.
(function () {
  const SHEET_ID = '1SK6LuFfFWtO-EoeD4hSwrIIpQEhXCsvHvyDFRUuKKx8';
  const GID_CANCELAMENTOS = '218093528';
  const GID_ITENS_CANCELADOS = '442380588'; // aba "Itens Cancelados"

  const UNITS = [
    { id: 'garami-barra', brand: 'Garami', unit: 'Barra da Tijuca', color: '#3E93B7', gid: '1109683142' },
    { id: 'garami-recreio', brand: 'Garami', unit: 'Recreio', color: '#3E93B7', gid: '1884124744' },
    { id: 'garami-tijuca', brand: 'Garami', unit: 'Tijuca', color: '#3E93B7', gid: '204227094' },
    { id: 'garami-zonasul', brand: 'Garami', unit: 'Zona Sul', color: '#3E93B7', gid: '149241204' },
    { id: 'kimura-barra', brand: 'Kimura', unit: 'Barra da Tijuca', color: '#D62828', gid: '1000759339' },
    { id: 'kimura-recreio', brand: 'Kimura', unit: 'Recreio', color: '#D62828', gid: '272077938' },
    { id: 'kimura-tijuca', brand: 'Kimura', unit: 'Tijuca', color: '#D62828', gid: '1657733622' },
    { id: 'kimura-zonasul', brand: 'Kimura', unit: 'Zona Sul', color: '#D62828', gid: '948777685' },
    { id: 'ipoke-barra', brand: 'Ipoke', unit: 'Barra da Tijuca', color: '#D98A2B', gid: '1793832175' },
    { id: 'ipoke-tijuca', brand: 'Ipoke', unit: 'Tijuca', color: '#D98A2B', gid: '88504285' },
    { id: 'ipoke-zonasul', brand: 'Ipoke', unit: 'Zona Sul', color: '#D98A2B', gid: '1078818949' }
  ];

  const MONTH_ABBR_PT = { JAN: 'janeiro', FEV: 'fevereiro', MAR: 'marco', ABR: 'abril', MAI: 'maio', JUN: 'junho', JUL: 'julho', AGO: 'agosto', SET: 'setembro', OUT: 'outubro', NOV: 'novembro', DEZ: 'dezembro' };
  const MONTH_ORDER = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const WINDOW_TO_PERIOD = { w7: '7d', w14: '14d', w21: '21d', w28: '28d' };

  // --- helpers compartilhados com o parser do Delli (ver assets/live/delli.js pros comentários) ---
  function metricKeyFor(name) {
    const n = (name || '').trim().toUpperCase();
    if (/^PEDIDOS/.test(n)) return 'vendas';
    if (/^GMV/.test(n)) return 'gmv';
    if (/^TICKET M/.test(n)) return 'tm';
    if (/^CLIENTES NOVOS/.test(n)) return 'novos';
    if (/^CLIENTES RECORRENTES/.test(n)) return 'recorrentes';
    if (/^CLIENTES RECUPERADOS/.test(n)) return 'recuperados';
    if (/^VISITAS/.test(n)) return 'visitas';
    if (/^CONVERS/.test(n)) return 'conversao';
    if (/^% INVEST/.test(n)) return 'budget';
    if (/^INVEST\. LOJA/.test(n)) return 'investLoja';
    if (/^ADS/.test(n)) return 'ads';
    if (/^TOTAL INVEST/.test(n)) return 'promo';
    if (/^SUBS[IÍ]DIO/.test(n)) return 'subifood';
    if (/^ROI\s*\(GMV/.test(n)) return 'roi';
    if (/^ROI\s*\(SUB/.test(n)) return 'roiSubsidio';
    if (/^CPO/.test(n)) return 'cpo';
    if (/^AVALIA/.test(n)) return 'avaliacao';
    return null;
  }
  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return MONTH_ABBR_PT[h.slice(0, 3)] || null;
  }
  function monthKeyFromAbbr(s) {
    const m = /([A-ZÇ]{3})/i.exec((s || '').toUpperCase());
    if (!m) return null;
    return MONTH_ABBR_PT[m[1]] || null;
  }
  const MONTH_BY_NUM = ['', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function monthKeyFromDDMMYYYY(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
    if (!m) return null;
    return MONTH_BY_NUM[parseInt(m[2], 10)] || null;
  }
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v).trim();
    if (/^[-–—]$/.test(s)) return null;
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function parseBlockLabel(cell) {
    const s = (cell || '').trim();
    const m = /^──\s*(.+?)\s*──$/.exec(s);
    if (!m) return null;
    const label = m[1].trim();
    const plain = label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (plain === 'MES FECHADO') return 'CLOSED';
    const wm = /^(\d{1,2})-(\d{1,2})$/.exec(label);
    if (wm) return 'w' + parseInt(wm[2], 10);
    return null;
  }

  // Lê uma aba de unidade inteira (vários blocos empilhados) -> { '7d':{mes:flat}, '14d':{...},
  // '21d':{...}, 'closed':{mes:flat} }. Guarda contra linha de métrica duplicada no mesmo bloco
  // (mesmo bug visto no Delli: "Conversão %" repetida no bloco 01-21 com valores errados) e
  // corrige 'promo' pra não perder o investimento em ADS quando "Total Invest." não soma Loja+ADS.
  function parseUnitTab(rows) {
    const out = { '7d': {}, '14d': {}, '21d': {}, '28d': {}, closed: {} };
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

      const bucket = blockType === 'CLOSED' ? 'closed' : WINDOW_TO_PERIOD[blockType];
      if (!bucket) continue;
      cols.forEach(function (col) {
        const val = parseNum(row[col.c]);
        out[bucket][col.month] = out[bucket][col.month] || {};
        out[bucket][col.month][key] = val;
      });
    }

    function fixPromo(obj) {
      if (obj.investLoja == null && obj.ads == null) return;
      const soma = (obj.investLoja || 0) + (obj.ads || 0);
      if (soma > (obj.promo || 0)) obj.promo = soma;
    }
    Object.keys(out).forEach(function (bucket) {
      Object.keys(out[bucket]).forEach(function (m) { fixPromo(out[bucket][m]); });
    });
    return out;
  }

  // "Kimura Barra" -> 'kimura-barra' etc. Ordem de checagem importa: "Barra da Tijuca" e
  // "Tijuca" sozinho são unidades DIFERENTES que ambas contêm a palavra "Tijuca", por isso
  // RECREIO/ZONA SUL/BARRA são testados antes do fallback genérico "Tijuca".
  function storeIdForLabel(label) {
    const n = (label || '').trim().toUpperCase();
    if (/^TOTAL/.test(n)) return 'total';
    const brand = ['GARAMI', 'KIMURA', 'IPOKE'].find(function (b) { return n.indexOf(b) === 0; });
    if (!brand) return null;
    let unitId = null;
    if (/RECREIO/.test(n)) unitId = 'recreio';
    else if (/ZONA\s*SUL/.test(n)) unitId = 'zonasul';
    else if (/BARRA/.test(n)) unitId = 'barra';
    else if (/TIJUCA/.test(n)) unitId = 'tijuca';
    if (!unitId) return null;
    return brand.toLowerCase() + '-' + unitId;
  }

  // Extrai pares "Rótulo (n)" de uma célula como "Cliente (10) | Loja (4)".
  function parsePipeList(s) {
    return (s || '').split('|').map(function (part) {
      const m = /^(.+?)\s*\((\d+)\)\s*$/.exec(part.trim());
      return m ? { label: m[1].trim(), qtde: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
  }

  // Lê o bloco "MOTIVOS — <mês>": cabeçalho é "Motivo" + uma coluna por loja + "TOTAL".
  function parseMotivosBlock(rows, headerIdx) {
    const header = rows[headerIdx] || [];
    const cols = [];
    for (let c = 1; c < header.length; c++) {
      const h = (header[c] || '').trim();
      if (!h) continue;
      if (/^total$/i.test(h)) { cols.push({ c: c, key: 'total' }); continue; }
      const sid = storeIdForLabel(h);
      if (sid && sid !== 'total') cols.push({ c: c, key: sid });
    }
    const list = [];
    let r = headerIdx + 1;
    while (r < rows.length && rows[r][0] && !/^total$/i.test(rows[r][0].trim())) {
      const entry = { motivo: rows[r][0], perStore: {}, total: 0 };
      cols.forEach(function (col) {
        const v = parseNum(rows[r][col.c]) || 0;
        if (col.key === 'total') entry.total = v; else entry.perStore[col.key] = v;
      });
      list.push(entry);
      r++;
    }
    return list;
  }

  // Lê a aba "Cancelamentos" -> { meses, resumo, detalhe, periodos, motivos }. Formato igual ao
  // do Delli: um bloco "RESUMO MENSAL POR LOJA" (com linhas "SUBTOTAL <marca>" entre as unidades
  // e "TOTAL GRUPO" no fim — ambas puladas aqui, SUBTOTAL por não ser uma loja real e TOTAL por
  // virar a chave 'total', usada pelo filtro "Rede Toda"), um bloco por mês com o detalhe
  // (reembolso/origem/estágio) por loja, e logo depois "MOTIVOS — <mês>" com a lista de motivos
  // daquele mês (1 coluna por loja + TOTAL). O conjunto de lojas não é fixo: "Garami Recreio" não
  // aparece aqui enquanto não tiver cancelamento algum.
  function parseCancelamentos(rows) {
    const resumo = {}, detalhe = {}, periodos = {}, motivos = {};

    const resumoIdx = rows.findIndex(function (r) { return (r[0] || '').trim().toUpperCase() === 'RESUMO MENSAL POR LOJA'; });
    if (resumoIdx >= 0) {
      const header = rows[resumoIdx + 1] || [];
      const monthCols = [];
      for (let c = 1; c < header.length; c++) {
        const mm = /^(.+?)\s*Canc\.$/.exec((header[c] || '').trim());
        if (mm) { const mes = monthKeyFromAbbr(mm[1]); if (mes) monthCols.push({ month: mes, cCanc: c, cTaxa: c + 1 }); }
      }
      let r = resumoIdx + 2;
      while (r < rows.length && rows[r][0]) {
        const label = rows[r][0].trim();
        if (/^SUBTOTAL/i.test(label)) { r++; continue; }
        const loja = storeIdForLabel(label);
        if (!loja) break;
        monthCols.forEach(function (mc) {
          resumo[mc.month] = resumo[mc.month] || {};
          resumo[mc.month][loja] = { canc: parseNum(rows[r][mc.cCanc]), taxa: parseNum(rows[r][mc.cTaxa]) };
        });
        r++;
      }
    }

    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r][0] || '').trim();

      const motivosMatch = /^MOTIVOS\s*—\s*(.+)$/i.exec(first);
      if (motivosMatch) {
        const mesM = monthKeyFromAbbr(motivosMatch[1]);
        if (mesM && rows[r + 1] && /^motivo$/i.test((rows[r + 1][0] || '').trim())) {
          motivos[mesM] = parseMotivosBlock(rows, r + 1);
        }
        continue;
      }

      const monthHeaderMatch = /^([A-ZÇ]{3}\s*\d{4})\s*—\s*(.+)$/i.exec(first);
      if (!monthHeaderMatch) continue;
      const mes = monthKeyFromAbbr(monthHeaderMatch[1]);
      if (!mes) continue;
      const parcial = /\(parcial\)\s*$/i.test(monthHeaderMatch[2]);
      const label = monthHeaderMatch[2].replace(/\s*\(parcial\)\s*$/i, '').trim();
      periodos[mes] = { label: label, parcial: parcial };

      let rr = r + 1;
      if (!(rows[rr] && /^loja$/i.test((rows[rr][0] || '').trim()))) continue;
      rr++;
      detalhe[mes] = detalhe[mes] || {};
      while (rr < rows.length && rows[rr][0]) {
        const loja = storeIdForLabel(rows[rr][0]);
        if (!loja || loja === 'total') break;
        detalhe[mes][loja] = { canc: parseNum(rows[rr][1]), taxa: parseNum(rows[rr][2]), reembolso: parseNum(rows[rr][3]), origem: rows[rr][4] || '', estagio: rows[rr][5] || '' };
        rr++;
      }
    }

    const meses = [...new Set(Object.keys(resumo))].sort(function (a, b) { return (MONTH_ORDER[a] || 99) - (MONTH_ORDER[b] || 99); });
    return { meses: meses, resumo: resumo, detalhe: detalhe, periodos: periodos, motivos: motivos };
  }

  // Lê a aba "Itens Cancelados" -> lista de registros, um por item afetado num pedido cancelado
  // (Tipo="Total") ou parcialmente cancelado (Tipo="Parcial"). Acumula histórico de vários meses
  // na mesma aba — o filtro por mês/loja acontece no dashboard (ver renderItensCancelados em
  // garami-kimura-ipoke.html), não aqui. Mesmo formato usado pelo Delli.
  function parseItensCancelados(rows) {
    const registros = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const mes = monthKeyFromDDMMYYYY(row[0]);
      if (!mes) continue;
      const loja = storeIdForLabel(row[1]);
      if (!loja || loja === 'total') continue;
      const item = (row[2] || '').trim();
      if (!item) continue;
      let categoria = (row[3] || '').trim();
      if (!categoria || categoria.toUpperCase() === 'NONE') categoria = 'Outros';
      const tipo = /parcial/i.test(row[4] || '') ? 'Parcial' : 'Total';
      const motivo = (row[6] || '').trim() || 'Não informado';
      registros.push({
        mes: mes, loja: loja, item: item, categoria: categoria, tipo: tipo, motivo: motivo,
        qtde: parseNum(row[7]) || 0, pedidos: parseNum(row[8]) || 0, valor: parseNum(row[9]) || 0
      });
    }
    return registros;
  }

  // A planilha tem uma linha de rótulo de bloco ("── 01-07 ──") com só a coluna A preenchida
  // antes do cabeçalho real — o endpoint gviz/tq que SheetsSync.fetchCsvRows usa se confunde com
  // isso e colapsa a linha inteira numa única célula (mesmo problema visto no Delli). Por isso
  // usamos aqui o endpoint de exportação CSV direto, que preserva as colunas corretamente.
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

  async function loadLive() {
    const unitRows = await Promise.all(UNITS.map(function (u) { return fetchCsvRowsExport(SHEET_ID, u.gid); }));
    const DATA = {};
    UNITS.forEach(function (u, i) { DATA[u.id] = parseUnitTab(unitRows[i]); });
    if (!Object.keys(DATA).some(function (id) { return Object.keys(DATA[id].closed).length || Object.keys(DATA[id]['7d']).length; })) {
      throw new Error('Nenhuma unidade com dados encontrada nas 11 abas');
    }

    const STORES = UNITS.map(function (u) {
      return { id: u.id, brand: u.brand, unit: u.unit, color: u.color, closedMonths: Object.keys(DATA[u.id].closed) };
    });

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

    let CANCEL = { meses: [], resumo: {}, detalhe: {}, periodos: {}, motivos: {} };
    try {
      CANCEL = parseCancelamentos(await fetchCsvRowsExport(SHEET_ID, GID_CANCELAMENTOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Cancelamentos" indisponível:', e);
    }

    let ITENS_CANCEL = [];
    try {
      ITENS_CANCEL = parseItensCancelados(await fetchCsvRowsExport(SHEET_ID, GID_ITENS_CANCELADOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Itens Cancelados" indisponível:', e);
    }

    return { DATA: DATA, STORES: STORES, METRICS: METRICS, CANCEL: CANCEL, ITENS_CANCEL: ITENS_CANCEL };
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
        console.warn('[live-sync] Falha ao buscar dados da planilha, mantendo snapshot embutido:', e);
        ui.setStatus('snapshot', isManual ? 'falha ao atualizar' : 'sem conexão com a planilha');
      } finally {
        ui.setBusy(false);
      }
    }

    ui.onRefreshClick(function () { refresh(true); });
    refresh(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
