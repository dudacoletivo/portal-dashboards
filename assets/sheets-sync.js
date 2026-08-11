// Motor genérico de sincronização com Google Sheets (via exportação CSV pública).
// Usado por assets/live/<cliente>.js de cada dashboard. Não depende de nada além do fetch nativo.
const SheetsSync = (function () {
  const MONTH_NAMES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function monthFromHeader(cell) {
    const upper = (cell || '').trim().toUpperCase();
    // Alguns clientes mesclam o título do dashboard dentro da própria célula do mês
    // (ex: "DASHBOARD - CUMBUCA ABRIL"), então usamos busca por palavra inteira, não só prefixo.
    return MONTH_NAMES.find(m => new RegExp('(^|[^A-ZÀ-Ú])' + m + '([^A-ZÀ-Ú]|$)').test(upper)) || null;
  }

  function brNumber(str) {
    if (str == null) return null;
    let s = String(str).trim();
    if (s === '' || s === '-' || /#DIV/i.test(s)) return null;
    const isPct = s.includes('%');
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    s = s.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return isPct ? n / 100 : n;
  }

  // Alguns clientes guardam porcentagem como número puro (6,23% -> 6.23), não como fração (0.0623).
  function brNumberPct100(str) {
    if (str == null) return null;
    let s = String(str).trim();
    if (s === '' || s === '-' || /#DIV/i.test(s)) return null;
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    s = s.replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  async function fetchCsvRows(sheetId, gid, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs || 10000);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || !text.trim()) throw new Error('CSV vazio');
      return parseCsv(text);
    } finally {
      clearTimeout(t);
    }
  }

  function extractUnitName(cell) {
    const text = cell || '';
    let m = /UNIDADE:\s*([^]+?)(?:\s*Métrica\s*)?$/i.exec(text);
    if (m) return m[1].trim().toUpperCase();
    // Clientes de unidade única não usam "UNIDADE:" — o nome vem antes de "Métrica",
    // geralmente depois do último "|" (ex: "DASHBOARD ... | SPESSO SPESSO Métrica").
    m = /\|\s*([^|]+?)\s*Métrica\s*$/i.exec(text);
    if (m) return m[1].trim().toUpperCase();
    // Último recurso: sheets de unidade única às vezes não têm nem "|" (ex: "DASHBOARD
    // DE PERFORMANCE Métrica"). O texto exato não importa aqui — quem chama essa função
    // normalmente só usa a única chave resultante (Object.keys(...)[0]), não o texto em si.
    m = /^([^]+?)\s*Métrica\s*$/i.exec(text);
    if (m && m[1].trim()) return m[1].trim().toUpperCase();
    return null;
  }

  function resolveMetricKey(entry, label) {
    if (Array.isArray(entry)) {
      return entry.find(k => k.toUpperCase() === label.toUpperCase()) || entry[0];
    }
    return entry;
  }

  // Tabelas no formato "Mês Fechado": blocos de unidade lado a lado, com colunas de mês fixas.
  // metricOrder: array na ordem em que as métricas aparecem nas linhas (string ou [alternativas]).
  function parseMonthlyLikeSheet(rows, metricOrder, numberFn) {
    numberFn = numberFn || brNumber;
    if (!rows || !rows.length) throw new Error('Planilha vazia');
    const header = rows[0];
    const labelCols = [];
    header.forEach((cell, j) => { if (/Métrica/i.test(cell || '')) labelCols.push(j); });
    if (!labelCols.length) throw new Error('Cabeçalho não reconhecido (sem coluna "Métrica")');

    const blockLayout = labelCols.map((lc, idx) => {
      const nextLabelCol = labelCols[idx + 1] ?? header.length;
      const months = [];
      for (let j = lc + 1; j < nextLabelCol; j++) {
        const cellText = (header[j] || '').trim();
        if (!cellText) break;
        const mo = monthFromHeader(cellText);
        if (mo) months.push({ col: j, month: mo });
      }
      return { labelCol: lc, months };
    });

    const result = {};
    for (const block of blockLayout) {
      for (let r = 0; r < rows.length; r++) {
        const cellVal = (rows[r][block.labelCol] || '').trim().toUpperCase();
        if (cellVal !== 'VENDAS') continue;
        let unitName = null;
        for (let back = r; back >= Math.max(0, r - 6); back--) {
          const u = extractUnitName(rows[back][block.labelCol]);
          if (u) { unitName = u; break; }
        }
        if (!unitName || result[unitName]) continue;
        const metrics = {};
        for (let mi = 0; mi < metricOrder.length; mi++) {
          const rr = r + mi;
          if (rr >= rows.length) break;
          const label = (rows[rr][block.labelCol] || '').trim();
          const key = resolveMetricKey(metricOrder[mi], label || (Array.isArray(metricOrder[mi]) ? metricOrder[mi][0] : metricOrder[mi]));
          const vals = {};
          for (const mo of block.months) vals[mo.month] = numberFn(rows[rr][mo.col]);
          metrics[key] = vals;
        }
        result[unitName] = metrics;
      }
    }
    if (!Object.keys(result).length) throw new Error('Nenhuma unidade encontrada na planilha');
    return result;
  }

  // Tabelas no formato "Parcial/Comparativo": blocos de unidade com colunas "MÊS (corte)" repetidas por período.
  function parseCumulativeLikeSheet(rows, metricOrder, numberFn) {
    numberFn = numberFn || brNumber;
    if (!rows || !rows.length) throw new Error('Planilha vazia');
    const header = rows[0];
    const labelCols = [];
    header.forEach((cell, j) => { if (/Métrica/i.test(cell || '')) labelCols.push(j); });
    if (!labelCols.length) throw new Error('Cabeçalho não reconhecido (sem coluna "Métrica")');

    const blockLayout = labelCols.map((lc, idx) => {
      const nextLabelCol = labelCols[idx + 1] ?? header.length;
      const cols = [];
      for (let j = lc + 1; j < nextLabelCol; j++) {
        const cellText = (header[j] || '').trim();
        if (!cellText) break;
        // Sem "^" no início: a célula pode trazer o título do dashboard colado antes do mês
        // (ex: "DASHBOARD - CUMBUCA MAIO (01-07)"), então buscamos o padrão "MÊS (período)" no fim da célula.
        const m = /([A-ZÀ-ÚÇ]+)\s*\(([\d\-]+)\)\s*$/i.exec(cellText);
        if (m) cols.push({ col: j, month: monthFromHeader(m[1]), period: m[2] });
      }
      return { labelCol: lc, cols };
    });

    const result = {};
    for (const block of blockLayout) {
      for (let r = 0; r < rows.length; r++) {
        const cellVal = (rows[r][block.labelCol] || '').trim().toUpperCase();
        if (cellVal !== 'VENDAS') continue;
        let unitName = null;
        for (let back = r; back >= Math.max(0, r - 6); back--) {
          const u = extractUnitName(rows[back][block.labelCol]);
          if (u) { unitName = u; break; }
        }
        if (!unitName || result[unitName]) continue;
        const metrics = {};
        for (let mi = 0; mi < metricOrder.length; mi++) {
          const rr = r + mi;
          if (rr >= rows.length) break;
          const key = resolveMetricKey(metricOrder[mi], (rows[rr][block.labelCol] || '').trim());
          metrics[key] = {};
          for (const c of block.cols) {
            metrics[key][c.period] = metrics[key][c.period] || {};
            metrics[key][c.period][c.month] = numberFn(rows[rr][c.col]);
          }
        }
        result[unitName] = metrics;
      }
    }
    if (!Object.keys(result).length) throw new Error('Nenhuma unidade encontrada na planilha');
    return result;
  }

  // Tabela "Status das alavancas": Mês | Unidade | <uma coluna por alavanca>, com "Mês" mesclado (preenche pra baixo).
  function parseLeverSheet(rows, storesList) {
    if (!rows || rows.length < 2) throw new Error('Planilha vazia');
    const header = rows[0];
    const leverNames = header.slice(2).filter(h => (h || '').trim() !== '');
    let currentMes = null;
    const result = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[1] || !row[1].trim()) continue;
      if (row[0] && row[0].trim()) currentMes = row[0].trim().toUpperCase();
      const unidadeRaw = row[1].trim().toUpperCase();
      const store = (storesList || []).find(s => unidadeRaw.includes(s)) || unidadeRaw;
      const alavancas = {};
      leverNames.forEach((name, idx) => {
        const cell = (row[2 + idx] || '').trim();
        if (!cell) { alavancas[name] = { status: null, detail: null }; return; }
        const parts = cell.split('|').map(p => p.trim());
        alavancas[name] = { status: parts[0], detail: parts.length > 1 ? parts.slice(1).join(' | ') : null };
      });
      result.push({ _mes: currentMes, _loja: store, alavancas });
    }
    if (!result.length) throw new Error('Nenhum registro de alavancas encontrado');
    return result;
  }

  // Planilha de cancelamentos: uma linha por pedido cancelado, com data/hora própria.
  // O mês e o "corte" semanal são derivados da data de cada linha (não do nome da aba),
  // já que as abas separam por unidade e acumulam histórico, não por mês.
  function periodFromDay(day) {
    if (day <= 7) return '01-07';
    if (day <= 14) return '01-14';
    if (day <= 21) return '01-21';
    return '01-28';
  }

  const CURRENCY_COLUMNS = ['Valor do pedido (R$)', 'Valor total do cancelamento com entrega (R$)'];

  function parseCancelRecordsSheet(rows, unitName) {
    if (!rows || rows.length < 2) return [];
    const header = rows[0].map(h => (h || '').trim());
    const dateColIdx = header.indexOf('Data e hora do pedido');
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row.some(c => (c || '').trim())) continue;
      const rawDate = dateColIdx >= 0 ? (row[dateColIdx] || '').trim() : '';
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(rawDate);
      if (!m) continue;
      const rec = {};
      header.forEach((h, j) => {
        if (!h) return;
        let v = row[j] !== undefined ? row[j] : '';
        if (CURRENCY_COLUMNS.includes(h)) v = brNumber(v);
        rec[h] = v;
      });
      rec['Data e hora do pedido'] = `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
      rec._loja = unitName;
      rec._mes = MONTH_NAMES[parseInt(m[2], 10) - 1] || null;
      rec._periodo = periodFromDay(parseInt(m[3], 10));
      out.push(rec);
    }
    return out;
  }

  // Igual a parseLeverSheet, mas para clientes de unidade única: "Mês" + uma coluna por alavanca, sem coluna "Unidade".
  function parseLeverSheetSingleStore(rows) {
    if (!rows || rows.length < 2) throw new Error('Planilha vazia');
    const header = rows[0];
    const leverNames = header.slice(1).filter(h => (h || '').trim() !== '');
    const result = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const mesRaw = (row[0] || '').trim();
      if (!mesRaw) continue;
      const key = mesRaw.toLowerCase();
      const levers = leverNames.map((name, idx) => {
        const cell = (row[1 + idx] || '').trim();
        if (!cell) return { name, status: null, detail: null };
        const parts = cell.split('|').map(p => p.trim());
        return { name, status: parts[0].toLowerCase(), detail: parts.length > 1 ? parts.slice(1).join(' | ') : null };
      });
      result[key] = { label: mesRaw.charAt(0).toUpperCase() + mesRaw.slice(1).toLowerCase(), levers };
    }
    if (!Object.keys(result).length) throw new Error('Nenhum registro de alavancas encontrado');
    return result;
  }

  function sentenceCase(s) {
    if (s == null) return s;
    const t = String(s).trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  function mutateObjectInPlace(target, fresh) {
    Object.keys(target).forEach(k => delete target[k]);
    Object.assign(target, fresh);
  }

  function mutateArrayInPlace(target, fresh) {
    target.length = 0;
    fresh.forEach(x => target.push(x));
  }

  return {
    parseCsv, monthFromHeader, brNumber, brNumberPct100, fetchCsvRows,
    parseMonthlyLikeSheet, parseCumulativeLikeSheet, parseLeverSheet, parseLeverSheetSingleStore, parseCancelRecordsSheet,
    sentenceCase, mutateObjectInPlace, mutateArrayInPlace
  };
})();
