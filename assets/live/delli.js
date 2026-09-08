// Sincronização ao vivo do dashboard Delli com a planilha [Dashboard] Delli Jardim.
// Cliente novo, sincronização própria e simples (mesmo espírito da do Tapí): a planilha tem uma
// única aba de dados hoje ("Delli | Semanal"), com um único bloco de métricas (1 loja, "Padaria
// Delli") e colunas de mês no corte 01-07 — sem "UNIDADE:" por loja, sem separação Mês
// Fechado/Parcial. Por isso não reaproveita o parser genérico de assets/sheets-sync.js
// (parseMonthlyLikeSheet espera o formato com "UNIDADE:"/várias lojas por aba); em vez disso,
// lê a linha "Métrica" e as colunas de mês diretamente.
//
// A aba "Delli | Acompanhamento Cardápio" (datas soltas, não meses) não é usada pelas 3 abas
// deste dashboard (Dash, Investimento, Comparativo Parcial) — fica de fora por ora.
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois
// do bloco principal do dashboard (STORES/renderAll já definidos).
(function () {
  const SHEET_ID = '1qw8inqRLODVKKnjRMpleFspLIv75zZxALNIGmCVQnM4';
  const GID_SEMANAL = '2125793866'; // aba "Delli | Semanal"

  const MONTH_NAMES_PT = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const MONTH_KEY_PT = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  function metricKeyFor(name) {
    const n = (name || '').trim().toUpperCase();
    if (/^VENDAS/.test(n)) return 'vendas';
    if (/^GMV|FATURAMENTO/.test(n)) return 'gmv';
    if (/^TM/.test(n)) return 'tm';
    if (/^NOVOS/.test(n)) return 'novos';
    if (/^VISITAS/.test(n)) return 'visitas';
    if (/CONVERS/.test(n)) return 'conversao';
    if (/BUDGET/.test(n)) return 'budget';
    if (/PROMO/.test(n)) return 'promo';
    if (/SUB\s*IFOOD/.test(n)) return 'subifood';
    if (/^CPO/.test(n)) return 'cpo';
    if (/^ROI/.test(n)) return 'roi';
    return null;
  }

  // Casa cabeçalhos tipo "JULHO (01-07)" ou "JULHO" com o mês em português, sem se prender ao
  // sufixo do corte de dias (assim continua funcionando se a planilha mudar pra outro corte).
  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let i = 0; i < MONTH_NAMES_PT.length; i++) {
      const plain = MONTH_NAMES_PT[i].normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (h.indexOf(plain) === 0) return MONTH_KEY_PT[i];
    }
    return null;
  }

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v).trim();
    if (/^[-–—]$/.test(s)) return null;
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    // pt-BR: vírgula é decimal, ponto é separador de milhar. "1.661" (sem vírgula) tem que virar
    // 1661, não 1.661 — sem essa checagem um parseFloat ingênuo trunca visitas/vendas grandes.
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function parseSemanal(rows) {
    // As 3 linhas de título mescladas ("DASHBOARD - DELLI" / "PADARIA DELLI" / "Métrica") saem
    // do export CSV grudadas numa célula só ("DASHBOARD - DELLI PADARIA DELLI Métrica"), não como
    // uma célula limpa "Métrica" — por isso o teste é "termina com métrica", não igualdade exata.
    let headerRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r][0] || '').trim().toLowerCase();
      if (/m[eé]trica$/.test(first)) { headerRow = r; break; }
    }
    if (headerRow < 0) throw new Error('Cabeçalho "Métrica" não encontrado na aba Semanal');

    const cols = [];
    const headerCells = rows[headerRow];
    for (let c = 1; c < headerCells.length; c++) {
      const mk = monthKeyFor(headerCells[c]);
      if (mk) cols.push({ c: c, month: mk });
    }
    if (!cols.length) throw new Error('Nenhuma coluna de mês reconhecida na aba Semanal');

    const semanal = {};
    for (let r = headerRow + 1; r < rows.length; r++) {
      const metricName = rows[r][0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      cols.forEach(function (col) {
        const val = parseNum(rows[r][col.c]);
        semanal[col.month] = semanal[col.month] || {};
        semanal[col.month][key] = val;
      });
    }
    return semanal;
  }

  async function loadLive() {
    const rows = await SheetsSync.fetchCsvRows(SHEET_ID, GID_SEMANAL);
    const semanal = parseSemanal(rows);
    if (!Object.keys(semanal).length) throw new Error('Nenhum mês encontrado na aba Semanal');
    return { 'delli-jardim': { label: 'Delli Jardim', semanal: semanal } };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        Object.keys(fresh).forEach(function (id) {
          STORES[id] = STORES[id] || { label: fresh[id].label, semanal: {} };
          STORES[id].label = fresh[id].label;
          SheetsSync.mutateObjectInPlace(STORES[id].semanal, fresh[id].semanal);
        });
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
