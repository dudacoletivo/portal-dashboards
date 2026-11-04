// Sincronização ao vivo do dashboard Delli com a planilha "Delli Jardim — Performance iFood
// Jan-Nov 2026" (alimentada automaticamente pela IA do iFood/Toqan, sem depender de input manual).
// Trocado em 04/11/2026 a partir da planilha antiga "[Dashboard] Delli Jardim" — ver commit para
// o registro das divergências encontradas entre as duas fontes.
//
// Formato desta planilha: cada aba de loja ("Padaria Delli Jardim" / "Pizzaria Delli Jardim") traz
// VÁRIOS blocos empilhados na mesma aba, cada um com seu próprio cabeçalho "Métrica" e colunas
// Jan..Nov — um bloco por corte parcial ("── 01-07 ──", "── 01-14 ──", "── 01-21 ──") mais um bloco
// final "── Mês Fechado ──". Isso é diferente da planilha antiga, que tinha abas Mensal/Semanal
// separadas — por isso o parser abaixo (parseMultiBlockTab) lê blocos em sequência, alimentando
// semanal[mes][janela] para os blocos de corte parcial e mensal[mes] para o bloco "Mês Fechado".
//
// Há também uma aba nova "Cancelamentos", com um resumo mensal por loja (cancelamentos + taxa %)
// e, por mês, o detalhamento (reembolso/origens/estágio) e a lista de motivos — parseCancelamentos
// lê isso para alimentar a aba "Cancelamentos" do dashboard (ver delli.html).
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois
// do bloco principal do dashboard (STORES/CANCEL/renderAll já definidos).
(function () {
  const SHEET_ID = '12Dedb3coQoqfCBJVWBzhxK3QpsFTI005eKG1u145dxM';
  const GID_PADARIA = '1789508947'; // aba "Padaria Delli Jardim"
  const GID_PIZZARIA = '838687631'; // aba "Pizzaria Delli Jardim"
  const GID_CANCELAMENTOS = '2059198122'; // aba "Cancelamentos"

  const MONTH_ABBR_PT = { JAN:'janeiro', FEV:'fevereiro', MAR:'marco', ABR:'abril', MAI:'maio', JUN:'junho', JUL:'julho', AGO:'agosto', SET:'setembro', OUT:'outubro', NOV:'novembro', DEZ:'dezembro' };

  // Linhas reconhecidas nas abas "Padaria/Pizzaria Delli Jardim". A ordem dos testes não importa:
  // cada padrão é específico o bastante para não colidir com os outros.
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

  // Cabeçalhos de mês nesta planilha vêm abreviados ("Jan", "Fev", ... "Nov*(01-04)"), não por
  // extenso como na planilha antiga — por isso casa pelas 3 primeiras letras (sem acento).
  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const abbr = h.slice(0, 3);
    return MONTH_ABBR_PT[abbr] || null;
  }

  function monthKeyFromAbbr(s) {
    const m = /([A-ZÇ]{3})\s*\d{4}/i.exec((s || '').toUpperCase());
    if (!m) return null;
    return MONTH_ABBR_PT[m[1]] || null;
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

  // Marca de início de bloco: "── 01-07 ──", "── 01-14 ──", "── 01-21 ──", "── Mês Fechado ──".
  // Retorna a janela ('w7'/'w14'/'w21'/'w28'), 'CLOSED' pro bloco de mês fechado, ou null se não
  // for uma linha de bloco (nesse caso o chamador segue tratando a linha anterior).
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

  // Lê uma aba de loja inteira (vários blocos empilhados) -> { semanal, mensal }.
  // Guarda contra linha de métrica duplicada dentro do MESMO bloco (ex.: a planilha atual tem
  // "Conversão % *" duplicada no bloco 01-21, com uma segunda linha de valores claramente errada
  // — bem menor que todas as outras janelas) mantendo só a primeira ocorrência de cada métrica.
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
        const val = parseNum(row[col.c]);
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
    // "Total Invest." na planilha, por enquanto, não soma "Invest. Loja" + "ADS" nos meses em
    // que ADS tem valor (ex.: Padaria, Mês Fechado, Junho: Invest. Loja=5378,23, ADS=4500,00,
    // mas Total Invest. continua 5378,23) — provável fórmula pendente de ajuste na planilha.
    // Pra não deixar o investimento em ADS de fora das contas (CPO/ROI/insights usam 'promo'),
    // usamos o maior entre o que a planilha chama de "Total Invest." e a soma Loja+ADS.
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

  function lojaKeyFor(cell) {
    const n = (cell || '').trim().toUpperCase();
    if (/^PADARIA/.test(n)) return 'padaria';
    if (/^PIZZARIA/.test(n)) return 'pizzaria';
    if (/^TOTAL/.test(n)) return 'total';
    return null;
  }

  // Lê a aba "Cancelamentos" -> { meses, resumo, detalhe, motivos }. Formato: um bloco "RESUMO
  // MENSAL POR LOJA" (Padaria/Pizzaria/TOTAL GRUPO x um par Canc./Taxa % por mês), seguido de um
  // bloco por mês ("SET 2026 — ...") com o detalhe (reembolso/origens/estágio) por loja e, logo
  // depois, "MOTIVOS — SET 2026" com a lista de motivos. Cresce sozinho conforme novos meses forem
  // adicionados pela IA — não depende de nomes de mês fixos.
  function parseCancelamentos(rows) {
    const resumo = {};
    const detalhe = {};
    const motivos = {};

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
          rr++;
          const list = [];
          while (rr < rows.length && rows[rr][0] && !/^──/.test(rows[rr][0]) && !/—/.test(rows[rr][0])) {
            list.push({ motivo: rows[rr][0], padaria: parseNum(rows[rr][1]), pizzaria: parseNum(rows[rr][2]), total: parseNum(rows[rr][3]) });
            rr++;
          }
          motivos[mes] = list;
        }
        continue;
      }

      const monthHeaderMatch = /^([A-ZÇ]{3}\s*\d{4})\s*—/i.exec(first);
      if (monthHeaderMatch) {
        const mes = monthKeyFromAbbr(monthHeaderMatch[1]);
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

    const meses = [...new Set(Object.keys(resumo))].sort(function (a, b) {
      return (MONTH_ORDER[a] || 99) - (MONTH_ORDER[b] || 99);
    });
    return { meses: meses, resumo: resumo, detalhe: detalhe, motivos: motivos };
  }

  // Esta planilha tem linhas de rótulo de bloco ("── 01-07 ──") com só a coluna A preenchida
  // antes do cabeçalho real ("Métrica"). O endpoint gviz/tq que SheetsSync.fetchCsvRows usa
  // tenta inferir o esquema de colunas a partir das primeiras linhas e se confunde nesse caso,
  // colapsando a linha inteira numa única célula — por isso usamos aqui o endpoint de exportação
  // CSV direto (/export?format=csv), que preserva as colunas corretamente, com o mesmo parser.
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
    const [padariaRows, pizzariaRows] = await Promise.all([
      fetchCsvRowsExport(SHEET_ID, GID_PADARIA),
      fetchCsvRowsExport(SHEET_ID, GID_PIZZARIA)
    ]);
    const padaria = parseMultiBlockTab(padariaRows);
    const pizzaria = parseMultiBlockTab(pizzariaRows);
    if (!Object.keys(padaria.mensal).length && !Object.keys(padaria.semanal).length
      && !Object.keys(pizzaria.mensal).length && !Object.keys(pizzaria.semanal).length) {
      throw new Error('Nenhum mês encontrado nas abas "Padaria Delli Jardim" / "Pizzaria Delli Jardim"');
    }

    // Aba de cancelamentos é isolada: se falhar, o resto do dashboard continua normalmente.
    let cancel = { meses: [], resumo: {}, detalhe: {}, motivos: {} };
    try {
      cancel = parseCancelamentos(await fetchCsvRowsExport(SHEET_ID, GID_CANCELAMENTOS));
    } catch (e) {
      console.warn('[live-sync] Aba "Cancelamentos" indisponível:', e);
    }

    return {
      stores: {
        'padaria-delli': { label: 'Padaria Delli', semanal: padaria.semanal, mensal: padaria.mensal },
        'pizzaria-delli': { label: 'Pizzaria Delli', semanal: pizzaria.semanal, mensal: pizzaria.mensal }
      },
      cancel: cancel
    };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        Object.keys(fresh.stores).forEach(function (id) {
          STORES[id] = STORES[id] || { label: fresh.stores[id].label, semanal: {}, mensal: {} };
          STORES[id].label = fresh.stores[id].label;
          STORES[id].semanal = STORES[id].semanal || {};
          STORES[id].mensal = STORES[id].mensal || {};
          SheetsSync.mutateObjectInPlace(STORES[id].semanal, fresh.stores[id].semanal);
          SheetsSync.mutateObjectInPlace(STORES[id].mensal, fresh.stores[id].mensal);
        });
        CANCEL.meses = fresh.cancel.meses;
        CANCEL.resumo = fresh.cancel.resumo;
        CANCEL.detalhe = fresh.cancel.detalhe;
        CANCEL.motivos = fresh.cancel.motivos;
        renderAll();
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
