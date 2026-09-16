// Sincronização ao vivo do dashboard Bar do Ge com a planilha [Bar do Ge] Comparativo semanal.
//
// A planilha original era um .xlsx cru enviado ao Drive (não uma Google Sheets nativa) — o
// fetch cross-origin ao arquivo bruto do Drive falha por CORS em qualquer navegador real (não
// só na pré-visualização), então o cliente salvou uma cópia como Google Sheets nativa
// (16/09/2026), que agora é a fonte oficial. Isso permite usar o mesmo endpoint gviz/CSV do
// resto do portal (assets/sheets-sync.js), sem depender de biblioteca de parsing de xlsx.
//
// Duas abas usadas:
//   - "ifood fechamento mensal": 1 coluna por mês fechado (JULHO, AGOSTO) -> alimenta
//     STORES[id].mensal[mes]. Usada só pela aba Dash.
//   - "Página1": 1 coluna por corte parcial (ex.: "JULHO (01-15)", "MAIO (01-14)") -> alimenta
//     STORES[id].semanal[mes][janela]. Usada pela aba Investimento (janela mais completa
//     disponível em cada mês) e pela aba Comparativo Parcial (janela escolhida no filtro).
//
//   ATENÇÃO — dado incompleto nesta planilha (16/09/2026, ainda não corrigido na cópia
//   convertida): as colunas "(01-14)", "(01-21)" e "(01-28)" da aba "Página1" trazem valores na
//   casa dos milhares (ex.: "VENDAS,MAIO(01-14)" = 2.912), incompatíveis com o volume real do
//   Bar do Ge (~10 pedidos por mês inteiro na aba mensal) — sobra de um modelo de planilha
//   reaproveitado de outro cliente. Por isso só a janela "(01-15)" é aceita aqui
//   (TRUSTED_WINDOWS); as demais ficam de fora até a planilha ser corrigida. Depois de
//   corrigida, é só tirar a restrição abaixo.
//
// Requer assets/sheets-sync.js e assets/live-status-ui.js já carregados, rodando depois do
// bloco principal do dashboard (STORES/renderAll já definidos).
(function () {
  const SHEET_ID = '1-J2LglJ1bQ9wlhwgJ5WNWc1aAzjEcjjFuL3XGN1vJeM';
  const GID_SEMANAL = '1967870563'; // aba "Página1"
  const GID_MENSAL = '318404404'; // aba "ifood fechamento mensal"

  const TRUSTED_WINDOWS = ['w15']; // ver nota acima — ampliar quando a planilha for corrigida

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

  // Casa cabeçalhos tipo "JULHO (01-15)" ou só "JULHO" com o mês em português, sem se prender
  // ao sufixo do corte de dias.
  function monthKeyFor(header) {
    const h = (header || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let i = 0; i < MONTH_NAMES_PT.length; i++) {
      const plain = MONTH_NAMES_PT[i].normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (h.indexOf(plain) === 0) return MONTH_KEY_PT[i];
    }
    return null;
  }

  // Extrai a janela parcial ("w15"/"w14"/...) do sufixo "(01-XX)" de um cabeçalho. Sem sufixo
  // (aba mensal), retorna null.
  function windowKeyFor(header) {
    const m = /\((\d{1,2})-(\d{1,2})\)/.exec(header || '');
    if (!m) return null;
    return 'w' + parseInt(m[2], 10);
  }

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v).trim();
    if (/^[-–—]$/.test(s)) return null;
    s = s.replace(/R\$\s?/g, '').replace(/%/g, '').trim();
    // pt-BR: vírgula é decimal, ponto é separador de milhar.
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // Acha a linha de cabeçalho ("Métrica") e as colunas de mês reconhecidas. No export CSV da
  // Sheets nativa, o título mesclado ("DASHBOARD DE PERFORMANCE | BAR DO GE") gruda na célula
  // "Métrica" ("...BAR DO GE Métrica") — por isso o teste é "termina com métrica", não
  // igualdade exata (mesmo padrão usado em outros clientes com título mesclado).
  function findHeaderAndMonthCols(rows, opts) {
    opts = opts || {};
    let headerRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r][0] || '').trim().toLowerCase();
      if (/m[eé]trica$/.test(first)) { headerRow = r; break; }
    }
    if (headerRow < 0) throw new Error('Cabeçalho "Métrica" não encontrado na aba');

    const cols = [];
    const headerCells = rows[headerRow];
    for (let c = 1; c < headerCells.length; c++) {
      const header = headerCells[c];
      const mk = monthKeyFor(header);
      if (!mk) continue;
      const win = windowKeyFor(header);
      if (opts.requireWindow && (!win || (opts.trustedOnly && TRUSTED_WINDOWS.indexOf(win) < 0))) continue;
      cols.push({ c: c, month: mk, window: win });
    }
    if (!cols.length) throw new Error('Nenhuma coluna de mês reconhecida na aba');
    return { headerRow: headerRow, cols: cols };
  }

  // Aba "ifood fechamento mensal": 1 coluna por mês fechado -> { mes: {métricas} }.
  function parseMensal(rows) {
    const { headerRow, cols } = findHeaderAndMonthCols(rows, { requireWindow: false });
    const mensal = {};
    for (let r = headerRow + 1; r < rows.length; r++) {
      const metricName = rows[r][0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      cols.forEach(function (col) {
        const val = parseNum(rows[r][col.c]);
        mensal[col.month] = mensal[col.month] || {};
        mensal[col.month][key] = val;
      });
    }
    return mensal;
  }

  // Aba "Página1": 1 coluna por corte parcial -> { mes: { janela: {métricas} } }. Só entram
  // janelas de TRUSTED_WINDOWS (ver nota no topo do arquivo).
  function parseSemanal(rows) {
    const { headerRow, cols } = findHeaderAndMonthCols(rows, { requireWindow: true, trustedOnly: true });
    const semanal = {};
    for (let r = headerRow + 1; r < rows.length; r++) {
      const metricName = rows[r][0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      cols.forEach(function (col) {
        const val = parseNum(rows[r][col.c]);
        semanal[col.month] = semanal[col.month] || {};
        semanal[col.month][col.window] = semanal[col.month][col.window] || {};
        semanal[col.month][col.window][key] = val;
      });
    }
    return semanal;
  }

  async function loadLive() {
    const [semanalRows, mensalRows] = await Promise.all([
      SheetsSync.fetchCsvRows(SHEET_ID, GID_SEMANAL),
      SheetsSync.fetchCsvRows(SHEET_ID, GID_MENSAL)
    ]);
    const semanal = parseSemanal(semanalRows);
    const mensal = parseMensal(mensalRows);
    if (!Object.keys(semanal).length && !Object.keys(mensal).length) {
      throw new Error('Nenhum mês encontrado nas abas da planilha');
    }
    return { 'bar-do-ge': { label: 'Bar do Ge', semanal: semanal, mensal: mensal } };
  }

  function init() {
    const ui = createLiveStatusUI();

    async function refresh(isManual) {
      ui.setStatus('loading');
      ui.setBusy(true);
      try {
        const fresh = await loadLive();
        Object.keys(fresh).forEach(function (id) {
          STORES[id] = STORES[id] || { label: fresh[id].label, mensal: {}, semanal: {} };
          STORES[id].label = fresh[id].label;
          STORES[id].mensal = STORES[id].mensal || {};
          STORES[id].semanal = STORES[id].semanal || {};
          SheetsSync.mutateObjectInPlace(STORES[id].mensal, fresh[id].mensal);
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
