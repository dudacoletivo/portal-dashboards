// Sincronização ao vivo do dashboard Pato com Laranja.
//
// A partir de 11/2026 as métricas principais e os cancelamentos passam a vir da planilha nova
// "Pato Com Laranja — Performance iFood" (alimentada pela IA do iFood/Toqan), no mesmo formato
// de blocos empilhados usado no Delli (ver assets/live/delli.js para o histórico dessa migração).
// Essa planilha já separa por loja (4 unidades) — ganho de granularidade em relação à planilha
// antiga, que trazia as métricas principais num bloco só, sem separar por loja.
//
// "Status das Alavancas" continua vindo da planilha ANTIGA (sem mudança) — a nova não tem esse
// dado, e a usuária pediu explicitamente pra manter essa aba como está.
(function () {
  const SHEET_ID = '1CotFWpXiXcyWB3r_5CrgjPSPN5GdUGlyfvkdqKUrP8c';
  const STORE_TABS = [
    { gid: '1460716610', key: 'JAPA BARRA' },
    { gid: '1372548011', key: 'JAPA LEBLON' },
    { gid: '1250604524', key: 'PATO NA BRASA BARRA' },
    { gid: '303705438', key: 'AHIRU LEBLON' }
  ];
  const GID_CANCELAMENTOS = '1219132979';

  // Alavancas continua na planilha antiga, sem mudança nenhuma.
  const OLD_SHEET_ID = '1G3yEReZrhYEDo6js0zz0FC62fr8Y_LJgEH1KvdIZtoc';
  const GID_ALAVANCAS = '14456487';

  const MONTH_ABBR_PT_UP = { JAN: 'JANEIRO', FEV: 'FEVEREIRO', MAR: 'MARÇO', ABR: 'ABRIL', MAI: 'MAIO', JUN: 'JUNHO', JUL: 'JULHO', AGO: 'AGOSTO', SET: 'SETEMBRO', OUT: 'OUTUBRO', NOV: 'NOVEMBRO', DEZ: 'DEZEMBRO' };

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
  // Linhas que guardam fração ou percentual já formatado com "%" — usadas no parser pra decidir
  // quando normalizar (ver parsePercent abaixo).
  const PERCENT_KEYS = { conversao: true, budget: true };

  // Cabeçalhos abreviados ("Jan", "Fev", ... "Nov*(01-09)"). As 2 colunas históricas do ano
  // anterior ("Nov/25", "Dez/25") têm as mesmas 3 primeiras letras do mês atual — por isso são
  // descartadas explicitamente antes de casar pelo prefixo.
  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase();
    if (/\/25\b/.test(h)) return null;
    const plain = h.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const abbr = plain.slice(0, 3);
    return MONTH_ABBR_PT_UP[abbr] || null;
  }

  // Na aba de Cancelamentos do Pato os meses vêm por extenso ("NOVEMBRO 2026"), diferente do
  // Delli que usa abreviação de 3 letras ("NOV 2026") — aceita os dois formatos.
  function monthKeyFromAbbr(s) {
    const m = /([A-ZÇÃÕ]+)\s*\d{4}/i.exec((s || '').toUpperCase());
    if (!m) return null;
    const word = m[1].replace(/Ç/g, 'C').normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (word.length <= 3) return MONTH_ABBR_PT_UP[word] || null;
    const full = Object.keys(MONTH_ABBR_PT_UP).map(function (k) { return MONTH_ABBR_PT_UP[k]; })
      .find(function (name) { return name.replace(/Ç/g, 'C').normalize('NFD').replace(/[̀-ͯ]/g, '') === word; });
    return full || null;
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

  // Linhas de % nesta planilha às vezes vêm como percentual formatado ("19.8%" => 19.8) e às
  // vezes como fração crua sem o sinal de % ("0.198" => deveria ser 19.8 também) — mesmo bug
  // visto na migração do Delli. Regra: se não tem "%", trata como fração e multiplica por 100.
  function parsePercent(raw) {
    const n = parseNum(raw);
    if (n === null) return null;
    const hasPct = typeof raw === 'string' && raw.indexOf('%') !== -1;
    return hasPct ? n : n * 100;
  }

  // pato-com-laranja.html espera as janelas parciais no formato literal da planilha ("01-07",
  // "01-14", "01-21"), não no formato "w7"/"w14" usado no Delli.
  function parseBlockLabel(cell) {
    const s = (cell || '').trim();
    const m = /^──\s*(.+?)\s*──$/.exec(s);
    if (!m) return null;
    const label = m[1].trim();
    const plain = label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (plain === 'MES FECHADO') return 'CLOSED';
    const wm = /^(\d{1,2})-(\d{1,2})$/.exec(label);
    if (wm) return wm[1] + '-' + wm[2];
    return null;
  }

  // Lê uma aba de loja inteira (blocos "01-07"/"01-14"/"01-21"/"Mês Fechado" empilhados) ->
  // { semanal, mensal }, com chaves internas (vendas/gmv/tm/...) — convertidas depois pro
  // formato antigo que pato-com-laranja.html espera (ver remapToLegacy).
  function parseMultiBlockTab(rows) {
    const semanal = {};
    const mensal = {};
    let blockType = null;
    let cols = null;
    let seenInBlock = null;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const first = (row[0] || '').trim();

      const blockKind = parseBlockLabel(first);
      if (blockKind) {
        blockType = blockKind;
        cols = null;
        seenInBlock = new Set();
        continue;
      }
      if (/m[eé]trica$/i.test(first)) {
        cols = [];
        for (let c = 1; c < row.length; c++) {
          const mk = monthKeyFor(row[c]);
          if (mk) cols.push({ c: c, month: mk });
        }
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
        const val = PERCENT_KEYS[key] ? parsePercent(row[col.c]) : parseNum(row[col.c]);
        if (blockType === 'CLOSED') {
          mensal[col.month] = mensal[col.month] || {};
          mensal[col.month][key] = val;
        } else {
          semanal[col.month] = semanal[col.month] || {};
          semanal[col.month][blockType] = semanal[col.month][blockType] || {};
          semanal[col.month][blockType][key] = val;
        }
      });
    }

    function fixPromo(obj) {
      if (obj.investLoja == null && obj.ads == null) return;
      const soma = (obj.investLoja || 0) + (obj.ads || 0);
      if (soma > (obj.promo || 0)) obj.promo = soma;
    }
    Object.keys(mensal).forEach(function (m) { fixPromo(mensal[m]); });
    Object.keys(semanal).forEach(function (m) {
      Object.keys(semanal[m]).forEach(function (w) { fixPromo(semanal[m][w]); });
    });

    return { semanal: semanal, mensal: mensal };
  }

  // Converte do formato interno (vendas/gmv/budget em fração .198/...) pro formato que
  // pato-com-laranja.html já usa (chaves em maiúsculo tipo a planilha antiga, budget/conversão
  // como fração 0-1, não percentual).
  function remapMonthly(obj) {
    return {
      'VENDAS': obj.vendas,
      'FATURAMENTO LÍQUIDO': obj.gmv,
      'TM': obj.tm,
      'NOVOS': obj.novos,
      'VISITAS': obj.visitas,
      'CONVERSÃO %': obj.conversao != null ? obj.conversao / 100 : null,
      'Budget de investimento': obj.budget != null ? obj.budget / 100 : null,
      'PROMOÇÕES + ADS': obj.promo,
      'SUB IFOOD': obj.subifood,
      'CPO': obj.cpo,
      'ROI': obj.roi
    };
  }
  function remapCum(obj) {
    const m = remapMonthly(obj);
    m['GMV'] = obj.gmv;
    return m;
  }

  function lojaKeyFor(cell) {
    const n = (cell || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/^TOTAL/.test(n)) return 'total';
    const temJapa = /JAPA/.test(n), temBarra = /BARRA/.test(n), temLeblon = /LEBLON/.test(n);
    const temPato = /PATO/.test(n) && /BRASA/.test(n);
    const temAhiru = /AHIRU/.test(n);
    if (temJapa && temBarra) return 'japa-barra';
    if (temJapa && temLeblon) return 'japa-leblon';
    if (temPato) return 'pato-brasa-barra';
    if (temAhiru) return 'ahiru-leblon';
    return null;
  }

  // Aba "Cancelamentos": mesmo formato usado no Delli (RESUMO MENSAL POR LOJA + bloco por mês
  // com detalhe + "MOTIVOS — MES ANO"), só que os nomes de loja usados no resumo/detalhe
  // ("Japa do Pato - Barra da Tijuca") e na tabela de motivos ("Japa Barra") são diferentes entre
  // si — por isso lojaKeyFor normaliza os dois formatos pra mesma chave.
  function parseCancelamentos(rows) {
    const resumo = {};
    const detalhe = {};
    const motivos = {};
    const periodos = {};

    const resumoIdx = rows.findIndex(function (r) { return (r[0] || '').trim().toUpperCase() === 'RESUMO MENSAL POR LOJA'; });
    if (resumoIdx >= 0) {
      const header = rows[resumoIdx + 1] || [];
      const monthCols = [];
      for (let c = 1; c < header.length; c++) {
        const mm = /^(.+?)\s*Canc\.$/.exec((header[c] || '').trim());
        if (mm) {
          const mes = monthKeyFromAbbr(mm[1]);
          if (mes) monthCols.push({ month: mes, cCanc: c, cTaxa: c + 1 });
        }
      }
      let r = resumoIdx + 2;
      while (r < rows.length && rows[r][0]) {
        const loja = lojaKeyFor(rows[r][0]);
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
        const mes = monthKeyFromAbbr(motivosMatch[1]);
        let rr = r + 1;
        if (mes && rows[rr] && /^motivo$/i.test((rows[rr][0] || '').trim())) {
          const header = rows[rr];
          // colunas de loja na tabela de motivos (nomes curtos: "Japa Barra", "Pato na Brasa"...)
          const lojaCols = [];
          for (let c = 1; c < header.length; c++) {
            const lk = lojaKeyFor(header[c]);
            if (lk) lojaCols.push({ c: c, key: lk });
          }
          const totalCol = header.findIndex(function (h) { return /^total$/i.test((h || '').trim()); });
          rr++;
          const list = [];
          while (rr < rows.length && rows[rr][0] && !/^──/.test(rows[rr][0]) && !/—/.test(rows[rr][0])) {
            const entry = { motivo: rows[rr][0], total: totalCol >= 0 ? parseNum(rows[rr][totalCol]) : null };
            lojaCols.forEach(function (lc) { entry[lc.key] = parseNum(rows[rr][lc.c]); });
            list.push(entry);
            rr++;
          }
          motivos[mes] = list;
        }
        continue;
      }

      const monthHeaderMatch = /^([A-ZÇÃÕ]+\s*\d{4})\s*—\s*(.+)$/i.exec(first);
      if (monthHeaderMatch) {
        const mes = monthKeyFromAbbr(monthHeaderMatch[1]);
        if (mes) {
          const parcial = /\(parcial\)\s*$/i.test(monthHeaderMatch[2]);
          const label = monthHeaderMatch[2].replace(/\s*\(parcial\)\s*$/i, '').trim();
          periodos[mes] = { label: label, parcial: parcial };
        }
        let rr = r + 1;
        if (mes && rows[rr] && /^loja$/i.test((rows[rr][0] || '').trim())) {
          rr++;
          detalhe[mes] = detalhe[mes] || {};
          while (rr < rows.length && rows[rr][0]) {
            const loja = lojaKeyFor(rows[rr][0]);
            if (!loja || loja === 'total') break;
            detalhe[mes][loja] = {
              canc: parseNum(rows[rr][1]),
              taxa: parseNum(rows[rr][2]),
              reembolso: parseNum(rows[rr][3]),
              origens: rows[rr][4] || '',
              estagio: rows[rr][5] || ''
            };
            rr++;
          }
        }
      }
    }

    const order = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const meses = [...new Set(Object.keys(resumo))].sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return { meses: meses, resumo: resumo, detalhe: detalhe, motivos: motivos, periodos: periodos };
  }

  // O endpoint gviz/tq (SheetsSync.fetchCsvRows) se confunde com a linha de rótulo de bloco
  // ("── 01-07 ──", só a coluna A preenchida) antes do cabeçalho real — mesmo problema visto na
  // migração do Delli. Usa o endpoint de exportação CSV direto, que preserva as colunas certas.
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

  async function loadMetrics() {
    const perStore = await Promise.all(STORE_TABS.map(function (t) {
      return fetchCsvRowsExport(SHEET_ID, t.gid).then(parseMultiBlockTab);
    }));
    const monthly = {}, cumulative = {};
    STORE_TABS.forEach(function (t, i) {
      const parsed = perStore[i];
      // MONTHLY[s] e CUM[s] são indexados por MÉTRICA primeiro, depois mês/janela (formato que
      // pato-com-laranja.html já usa) — por isso inverte a ordem de aninhamento que parseMultiBlockTab
      // devolve (mês primeiro).
      monthly[t.key] = {};
      Object.keys(parsed.mensal).forEach(function (mes) {
        const remapped = remapMonthly(parsed.mensal[mes]);
        Object.keys(remapped).forEach(function (metricKey) {
          monthly[t.key][metricKey] = monthly[t.key][metricKey] || {};
          monthly[t.key][metricKey][mes] = remapped[metricKey];
        });
      });
      cumulative[t.key] = {};
      Object.keys(parsed.semanal).forEach(function (mes) {
        Object.keys(parsed.semanal[mes]).forEach(function (janela) {
          const remapped = remapCum(parsed.semanal[mes][janela]);
          Object.keys(remapped).forEach(function (metricKey) {
            cumulative[t.key][metricKey] = cumulative[t.key][metricKey] || {};
            cumulative[t.key][metricKey][janela] = cumulative[t.key][metricKey][janela] || {};
            cumulative[t.key][metricKey][janela][mes] = remapped[metricKey];
          });
        });
      });
    });
    const hasData = STORE_TABS.some(function (t) { return Object.keys(monthly[t.key]).length || Object.keys(cumulative[t.key]).length; });
    if (!hasData) throw new Error('Nenhum mês encontrado nas abas de loja');
    return { monthly: monthly, cumulative: cumulative };
  }

  async function loadAlavancas() {
    const rows = await SheetsSync.fetchCsvRows(OLD_SHEET_ID, GID_ALAVANCAS);
    return SheetsSync.parseLeverSheet(rows, ['BARRA DA TIJUCA', 'LEBLON']);
  }

  async function loadLive() {
    const [metrics, alavancas] = await Promise.all([loadMetrics(), loadAlavancas()]);
    let cancel = { meses: [], resumo: {}, detalhe: {}, motivos: {}, periodos: {} };
    try {
      cancel = parseCancelamentos(await fetchCsvRowsExport(SHEET_ID, GID_CANCELAMENTOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Cancelamentos" indisponível:', e);
    }
    return { monthly: metrics.monthly, cumulative: metrics.cumulative, alavancas: alavancas, cancel: cancel };
  }

  function rerenderAll() {
    try { renderMesFechado(); } catch (e) { console.error('renderMesFechado falhou:', e); }
    try { renderParcial(); } catch (e) { console.error('renderParcial falhou:', e); }
    try { renderInvestimento(); } catch (e) { console.error('renderInvestimento falhou:', e); }
    try { renderComp7(); } catch (e) { console.error('renderComp7 falhou:', e); }
    try { renderAlavancas(); } catch (e) { console.error('renderAlavancas falhou:', e); }
    try { renderCancelamentos(); } catch (e) { console.error('renderCancelamentos falhou:', e); }
    try { renderProjecao(); } catch (e) { console.error('renderProjecao falhou:', e); }
    try { updateLastUpdateBadge(); } catch (e) { console.error('updateLastUpdateBadge falhou:', e); }
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        STORES.forEach(function (s) {
          MONTHLY[s] = MONTHLY[s] || {};
          CUM[s] = CUM[s] || {};
          SheetsSync.mutateObjectInPlace(MONTHLY[s], fresh.monthly[s] || {});
          SheetsSync.mutateObjectInPlace(CUM[s], fresh.cumulative[s] || {});
        });
        SheetsSync.mutateArrayInPlace(ALAV, fresh.alavancas);
        CANCEL = fresh.cancel;
        rerenderAll();
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
