// Configuração central do portal — um item por cliente.
// Para trocar a senha de um cliente, gere um novo hash em admin/gerar-senha.html
// e substitua o valor de "passwordHash" abaixo.
const PORTAL_CLIENTS = [
  {
    slug: 'pato-com-laranja',
    name: 'Pato com Laranja',
    file: 'clientes/pato-com-laranja.html',
    color: '#F89E26',
    passwordHash: '6d6fb5c599fd0022089c541558ce1d9c6862b4addbdaad6c9f2fb223dc203996'
  },
  {
    slug: 'spesso',
    name: 'Spesso',
    file: 'clientes/spesso.html',
    color: '#00498e',
    passwordHash: '33a57312e18024915fc357f906cdc59b358be22ce74d660c6735d907f18b4cf6'
  },
  {
    slug: 'sunomono',
    name: 'Sunomono',
    file: 'clientes/sunomono.html',
    color: '#c32525',
    passwordHash: 'eec515e12a117ffa19e5045d6720bef2eebe1ef6a9c251e486a16008db4ac90f'
  },
  {
    slug: 'cumbuca',
    name: 'Cumbuca',
    file: 'clientes/cumbuca.html',
    color: '#5e1255',
    passwordHash: '20682a8a6df6a81252afbf90ba44c1ddf32d60e4528c85c00a72f3ada447ddee'
  },
  {
    slug: 'garami-kimura-ipoke',
    name: 'Garami, Kimura & Ipoke',
    file: 'clientes/garami-kimura-ipoke.html',
    color: '#221F1D',
    passwordHash: '48f657fe5ecdd6c23379e13664e066efab314a447587865b717c8718969adb63'
  }
];

// Sessão fica válida por 12 horas neste navegador.
const PORTAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

async function portalSha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function portalGetSession() {
  try {
    const raw = localStorage.getItem('portal_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.client || !session.ts) return null;
    if (Date.now() - session.ts > PORTAL_SESSION_TTL_MS) return null;
    return session;
  } catch (e) {
    return null;
  }
}

function portalSetSession(slug) {
  localStorage.setItem('portal_session', JSON.stringify({ client: slug, ts: Date.now() }));
}

function portalLogout() {
  localStorage.removeItem('portal_session');
}
