// Configuração central do portal — um item por cliente.
// Para trocar a senha de um cliente, gere um novo hash em admin/gerar-senha.html
// e substitua o valor de "passwordHash" abaixo.
const PORTAL_CLIENTS = [
  {
    slug: 'pato-com-laranja',
    name: 'Pato com Laranja',
    file: 'clientes/pato-com-laranja.html',
    color: '#F89E26',
    logo: 'assets/logos/pato-com-laranja.jpg',
    passwordHash: '6724ce288d8f10ae1dae28997d7778437a94ad62c16872ec084bd9683b9d7924'
  },
  {
    slug: 'spesso',
    name: 'Spesso',
    file: 'clientes/spesso.html',
    color: '#00498e',
    logo: 'assets/logos/spesso.png',
    passwordHash: '650e511a40711779f68667cce0dc1bcf82ea36c0bc17b29d34420dbd757f6857'
  },
  {
    slug: 'sunomono',
    name: 'Sunomono',
    file: 'clientes/sunomono.html',
    color: '#c32525',
    logo: 'assets/logos/sunomono.png',
    passwordHash: '98f48599263b706b4410d29cc05fc9ddb26a4c9ff49a43584a5f1bab6896bf8b'
  },
  {
    slug: 'cumbuca',
    name: 'Cumbuca',
    file: 'clientes/cumbuca.html',
    color: '#5e1255',
    logo: 'assets/logos/cumbuca.png',
    passwordHash: 'ee8e0058c81d80504f417a0223a3b3fd2b03397e21306e490919d27d470c533e'
  },
  {
    slug: 'garami-kimura-ipoke',
    name: 'Garami, Kimura & Ipoke',
    file: 'clientes/garami-kimura-ipoke.html',
    color: '#221F1D',
    logos: ['assets/logos/garami.png', 'assets/logos/kimura.jpg'],
    passwordHash: '0507a6306c35c2aeaa12bbfa69be2d95306367e1b4c62c0fa6d7003449c70356'
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
