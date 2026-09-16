// Sincronização ao vivo do dashboard Bar do Ge com a planilha [Bar do Ge] Comparativo semanal.
//
// Diferente de todos os outros clientes do portal: esta planilha é um arquivo .xlsx cru
// enviado ao Drive (não uma Google Sheets nativa), então o endpoint gviz/tq (CSV por aba) usado
// em assets/sheets-sync.js não funciona aqui — ele só existe para Sheets nativas. Em vez disso,
// baixa o arquivo .xlsx bruto direto do Drive (link público, sem autenticação) e lê com a
// biblioteca SheetJS (carregada no <head> do dashboard), no mesmo espírito do que já é feito em
// clientes/tapi.html com fetchWorkbookAoas() — só que lá a origem é uma Sheets nativa exportada
// como xlsx; aqui o arquivo já nasce xlsx.
//
// Duas abas usadas:
//   - "ifood fechamento mensal": 1 coluna por mês fechado (JULHO, AGOSTO) -> alimenta
//     STORES[id].mensal[mes]. Usada só pela aba Dash.
//   - "Página1": 1 coluna por corte parcial (ex.: "JULHO (01-15)", "MAIO (01-14)") -> alimenta
//     STORES[id].semanal[mes][janela]. Usada pela aba Investimento (janela mais completa
//     disponível em cada mês) e pela aba Comparativo Parcial (janela escolhida no filtro).
//
//   ATENÇÃO — dado incompleto nesta planilha (16/09/2026): as colunas "(01-14)", "(01-21)" e
//   "(01-28)" da aba "Página1" trazem valores na casa dos milhares (ex.: "VENDAS,MAIO(01-14)"
//   = 2912), incompatíveis com o volume real do Bar do Ge (~10 pedidos por mês inteiro na aba
//   mensal). Isso é sobra de um modelo de planilha reaproveitado de outro cliente (o arquivo
//   antigo "[BAR DO GE] Dashboard IFood" tem um bloco de aba com o cabeçalho "DASHBOARD DE
//   PERFORMANCE - LA JO" misturado) — não é dado real do bar. Por isso só a janela "(01-15)" é
//   aceita aqui (TRUSTED_WINDOWS); as demais ficam de fora até a planilha ser corrigida. Depois
//   de corrigida, é só tirar a restrição abaixo.
//
// Requer assets/sheets-sync.js (usa só mutateObjectInPlace) e assets/live-status-ui.js já
// carregados, e a biblioteca SheetJS (window.XLSX) carregada ANTES deste script.
(function () {
  const FILE_ID = '1M-xBeXXN70ZD54i69gjwwsJ2f2p9y0hG'; // [Bar do Ge] Comparativo semanal.xlsx
  // Usa o host de download direto (drive.usercontent.google.com), não o drive.google.com/uc
  // clássico — este último faz um redirect 303 sem cabeçalho CORS na resposta inicial, o que o
  // fetch() do navegador rejeita mesmo o destino final permitindo CORS (Access-Control-Allow-
  // Origin precisa estar em toda resposta do redirect, não só na última).
  const DOWNLOAD_URL = 'https://drive.usercontent.google.com/download?id=' + FILE_ID + '&export=download';

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
  // (aba mensal), retorna null — quem chama decide o que fazer.
  function windowKeyFor(header) {
    const m = /\((\d{1,2})-(\d{1,2})\)/.exec(header || '');
    if (!m) return null;
    return 'w' + parseInt(m[2], 10);
  }

  // Acha a linha de cabeçalho ("Métrica" — célula limpa nesta planilha, sem título mesclado
  // grudado, diferente de outros clientes) e as colunas de mês reconhecidas.
  function findHeaderAndMonthCols(rows, opts) {
    opts = opts || {};
    let headerRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const first = (rows[r] && rows[r][0] || '').toString().trim().toLowerCase();
      if (first === 'métrica') { headerRow = r; break; }
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
      const metricName = rows[r] && rows[r][0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      cols.forEach(function (col) {
        const val = numericCell(rows[r][col.c]);
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
      const metricName = rows[r] && rows[r][0];
      if (!metricName) continue;
      const key = metricKeyFor(metricName);
      if (!key) continue;
      cols.forEach(function (col) {
        const val = numericCell(rows[r][col.c]);
        semanal[col.month] = semanal[col.month] || {};
        semanal[col.month][col.window] = semanal[col.month][col.window] || {};
        semanal[col.month][col.window][key] = val;
      });
    }
    return semanal;
  }

  // SheetJS já entrega números como number (célula tem <v> cru, sem formatação pt-BR pra
  // desfazer) — só precisa tratar célula vazia/traço.
  function numericCell(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim();
    if (/^[-–—]$/.test(s)) return null;
    const n = parseFloat(s.replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  async function fetchWorkbook() {
    const res = await fetch(DOWNLOAD_URL, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return wb;
  }
  function sheetRows(wb, nameMatch) {
    const name = wb.SheetNames.find(function (n) { return nameMatch.test(n); });
    if (!name) throw new Error('Aba não encontrada na planilha (procurando: ' + nameMatch + ')');
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  }

  async function loadLive() {
    const wb = await fetchWorkbook();
    const mensalRows = sheetRows(wb, /fechamento mensal/i);
    const semanalRows = sheetRows(wb, /^p[aá]gina1$/i);
    const mensal = parseMensal(mensalRows);
    const semanal = parseSemanal(semanalRows);
    if (!Object.keys(mensal).length && !Object.keys(semanal).length) {
      throw new Error('Nenhum mês encontrado nas abas da planilha');
    }
    return { 'bar-do-ge': { label: 'Bar do Ge', mensal: mensal, semanal: semanal } };
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
