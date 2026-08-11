// Sincronização ao vivo do dashboard Cumbuca com a planilha [Cumbuca] Dashboard.
// Cobre Mês Fechado + Parcial (DATA_CLOSED / DATA_PARTIAL), que por sua vez alimentam
// também as abas Status de Alavancas, Investimento e Diagnóstico Parcial (derivadas),
// e Top 10 Produtos (DATA_PRODUCTS) — que vive nas mesmas 3 abas "Semanal" da Parcial,
// mais abaixo na planilha, uma seção por corte de dias (01-07, 01-14...).
//
// Limitação conhecida: na planilha original, "produto novo" é marcado com a CÉLULA
// pintada de amarelo — isso não existe na exportação CSV (só valores, sem formatação).
// Como alternativa, mantemos abaixo uma lista manual (NEW_PRODUCT_KEYWORDS) dos nomes
// que a Maria Eduarda confirmou serem "novos no cardápio" — comparamos por substring,
// sem acento/caixa, então cobre pequenas variações de escrita na planilha. Se um produto
// novo não estiver marcando aqui, é só adicionar um trecho do nome dele na lista.
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois
// do bloco principal do dashboard (DATA_CLOSED/DATA_PARTIAL/DATA_PRODUCTS/renderAll ou equivalentes já definidos).
(function () {
  const SHEET_ID = '1MhK4Bx4CZhWJG9ei1TNFvJsVEac8wgdWzFhRSWq245o';

  const BRANDS = [
    { closedGid: '952557577', partialGid: '0', prefix: 'Cumbuca' },
    { closedGid: '1352476829', partialGid: '277359977', prefix: 'Cumbuca Brasileira' },
    { closedGid: '1897441660', partialGid: '352375394', prefix: 'Wraps' }
  ];

  const METRIC_ORDER = ['VENDAS', 'GMV', 'TM', 'NOVOS', 'VISITAS', 'CONVERSÃO %', 'Budget de investimento', 'PROMOÇÕES + ADS', 'SUB IFOOD', 'CPO', 'ROI'];

  function properCase(s) {
    return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  async function buildClosed() {
    const out = {};
    for (const brand of BRANDS) {
      const rows = await SheetsSync.fetchCsvRows(SHEET_ID, brand.closedGid);
      const generic = SheetsSync.parseMonthlyLikeSheet(rows, METRIC_ORDER);
      Object.keys(generic).forEach(unitRaw => {
        const key = `${brand.prefix} - ${properCase(unitRaw)}`;
        const metrics = {};
        Object.keys(generic[unitRaw]).forEach(metricKey => {
          const vals = {};
          Object.keys(generic[unitRaw][metricKey]).forEach(monthName => { vals[monthName.toLowerCase()] = generic[unitRaw][metricKey][monthName]; });
          metrics[metricKey] = vals;
        });
        out[key] = metrics;
      });
    }
    if (!Object.keys(out).length) throw new Error('Nenhuma loja encontrada (mês fechado)');
    return out;
  }

  // Colunas ficam sempre na ordem Tijuca (esquerda) / Zona Sul (direita) — mesma convenção
  // usada nos blocos de métricas dessas mesmas abas. Não confiamos no texto do cabeçalho
  // pra identificar a unidade porque a aba da Wraps tem um erro de digitação real (os dois
  // blocos dizem "Tijuca Wraps"), então a ordem das colunas é o sinal confiável aqui.
  const UNIT_COLUMN_ORDER = ['TIJUCA', 'ZONA SUL'];

  // Confirmado por Maria Eduarda em 2026-08-11 — ver comentário no topo do arquivo.
  const NEW_PRODUCT_KEYWORDS = [
    'leve 3 cumbucas',
    'leva logo duas',
    'leva logo dois wraps',
    'wrap do seu jeito',
    'wrap + acompanhamento + bebida',
    'monte seu combo'
  ];

  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '');
  }

  function isNewProduct(name) {
    const n = normalize(name);
    return NEW_PRODUCT_KEYWORDS.some(k => n.includes(normalize(k)));
  }

  function parseTopProdutos(rows) {
    const results = {};
    for (let r = 0; r < rows.length; r++) {
      const headers = [];
      for (let c = 0; c < rows[r].length; c++) {
        const cell = (rows[r][c] || '').trim();
        const m = /^TOP\s*10\s*Produtos\s+([\d\-]+)\s*\(([^)]+)\)/i.exec(cell);
        if (m) headers.push({ col: c, period: m[1] });
      }
      if (!headers.length) continue;
      headers.sort((a, b) => a.col - b.col);
      headers.forEach((h, idx) => {
        const unit = UNIT_COLUMN_ORDER[idx];
        if (!unit) return;
        const products = [];
        for (let rr = r + 2; rr < r + 12 && rr < rows.length; rr++) {
          const name = (rows[rr][h.col] || '').trim();
          if (!name) break;
          products.push({
            produto: name,
            pedidos: SheetsSync.brNumber(rows[rr][h.col + 1]),
            vendas: SheetsSync.brNumber(rows[rr][h.col + 2]),
            novo: isNewProduct(name)
          });
        }
        if (products.length) {
          const dayKey = 'w' + String(parseInt(h.period.split('-')[1], 10));
          results[unit] = results[unit] || {};
          results[unit][dayKey] = products;
        }
      });
    }
    return results;
  }

  async function buildPartial() {
    const out = {};
    const products = {};
    for (const brand of BRANDS) {
      const rows = await SheetsSync.fetchCsvRows(SHEET_ID, brand.partialGid);
      const generic = SheetsSync.parseCumulativeLikeSheet(rows, METRIC_ORDER);
      Object.keys(generic).forEach(unitRaw => {
        const key = `${brand.prefix} - ${properCase(unitRaw)}`;
        out[key] = out[key] || {};
        Object.keys(generic[unitRaw]).forEach(metricKey => {
          Object.keys(generic[unitRaw][metricKey]).forEach(period => {
            const dayKey = 'w' + String(parseInt(period.split('-')[1], 10));
            out[key][dayKey] = out[key][dayKey] || {};
            const monthVals = generic[unitRaw][metricKey][period];
            const vals = {};
            Object.keys(monthVals).forEach(monthName => { vals[monthName.toLowerCase()] = monthVals[monthName]; });
            out[key][dayKey][metricKey] = vals;
          });
        });
      });

      const topProdutos = parseTopProdutos(rows);
      Object.keys(topProdutos).forEach(unitRaw => {
        const key = `${brand.prefix} - ${properCase(unitRaw)}`;
        products[key] = topProdutos[unitRaw];
      });
    }
    if (!Object.keys(out).length) throw new Error('Nenhuma loja encontrada (parcial)');

    // Backstop: cumbuca.html acessa DATA_PARTIAL[loja][janela]['GMV'][mês] direto, sem checar
    // se existe, em vários lugares. Se uma loja ainda não tiver uma janela/métrica na planilha
    // (ex: virada de marca fez faltar 3 das 4 janelas por um tempo), isso quebrava a tela
    // inteira. Preenchendo com objetos vazios aqui, o pior caso vira "undefined" num valor,
    // não mais um erro fatal.
    const ALL_WINDOWS = ['w7', 'w14', 'w21', 'w28'];
    Object.keys(out).forEach(key => {
      ALL_WINDOWS.forEach(w => {
        out[key][w] = out[key][w] || {};
        METRIC_ORDER.forEach(m => { out[key][w][m] = out[key][w][m] || {}; });
      });
    });

    return { partial: out, products };
  }

  async function loadLive() {
    const [closed, { partial, products }] = await Promise.all([buildClosed(), buildPartial()]);
    return { closed, partial, products };
  }

  function rerenderAll() {
    // Espelha o que init() faz em cumbuca.html, sem repetir o registro dos listeners de evento
    // (senão cada "Atualizar" duplicaria os handlers de change nos seletores).
    safe('seletores', () => { populateSelectors('F'); populateSelectors('P'); });
    safe('sincronizar meses parciais', () => {
      syncMonthOptionsToWindow('P_month', 'P_window');
      syncMonthOptionsToWindow('alavMonth', 'alavWindow');
      syncMonthOptionsToWindow('invMonth', 'invWindow');
      syncMonthOptionsToWindow('parcialA', 'parcialWindow');
      syncMonthOptionsToWindow('parcialB', 'parcialWindow');
    });
    safe('Dash Fechado', () => renderDashScreen('F'));
    safe('Dash Parcial', () => renderDashScreen('P'));
    safe('Alavancas', renderLeverage);
    safe('Investimento', renderInvestimento);
    safe('Diagnóstico Parcial', renderParcial);
    safe('Top 10 Produtos', () => { populateTopStoreSelector(); syncTopWindowOptions(); renderTopProducts(); });
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        SheetsSync.mutateObjectInPlace(DATA_CLOSED, fresh.closed);
        SheetsSync.mutateObjectInPlace(DATA_PARTIAL, fresh.partial);
        // produtos: só sobrescreve as lojas/cortes que vieram na planilha desta vez,
        // preserva o resto do snapshot (novos cortes como 01-14 vão aparecendo aos poucos).
        Object.keys(fresh.products).forEach(key => {
          DATA_PRODUCTS[key] = DATA_PRODUCTS[key] || {};
          Object.assign(DATA_PRODUCTS[key], fresh.products[key]);
        });
        rerenderAll();
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
