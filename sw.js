// =====================================================================
// sw.js — deixa o app abrir SEM INTERNET (quadra com sinal ruim).
//
// - Arquivos com ?v=... (css/js): usa a cópia do aparelho (o ?v muda a cada versão).
// - Firebase SDK (gstatic, versão fixa na URL): cópia do aparelho.
// - Páginas e imagens: tenta a internet por até 3,5 s; se não der, usa a cópia.
// - Banco de dados e login do Firebase NÃO passam por aqui (o app guarda os dados à parte).
//
// AO LANÇAR VERSÃO NOVA: troque VERSAO abaixo pelo mesmo ?v= usado no index.html.
// =====================================================================
const VERSAO = '20261113i';
const CACHE = 'cabecao-' + VERSAO;
const FIREBASE = 'https://www.gstatic.com/firebasejs/11.0.0/';

const PRECACHE = [
    './', 'index.html', 'ao-vivo.html', 'presenca.html', 'manifest.json',
    'termos-uso.html', 'politica-privacidade.html',
    'img/icon-192.png', 'img/icon-512.png', 'img/icon-512-maskable.png',
    'css/style.css?v=' + VERSAO,
    ...['logica', 'apito', 'remoto', 'auth', 'app', 'monetizacao', 'icones', 'metricas', 'imagem-times']
        .map(n => 'js/' + n + '.js?v=' + VERSAO),
    FIREBASE + 'firebase-app.js', FIREBASE + 'firebase-auth.js', FIREBASE + 'firebase-database.js'
];

self.addEventListener('install', (e) => {
    // um arquivo que falhar não impede o resto (ex.: instalou com internet fraca)
    e.waitUntil(caches.open(CACHE)
        .then(c => Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })))))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then(ks => Promise.all(ks.filter(k => k.startsWith('cabecao-') && k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

function guardar(req, res) {
    if (res && (res.ok || res.type === 'opaque')) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return res;
}

async function primeiroCache(req) {
    const salvo = await caches.match(req);
    if (salvo) return salvo;
    try { return guardar(req, await fetch(req)); }
    catch (e) { return (await caches.match(req, { ignoreSearch: true })) || Response.error(); }
}

async function primeiroRede(req) {
    const rede = fetch(req).then(r => guardar(req, r));
    const limite = new Promise(res => setTimeout(() => res(null), 3500));
    try {
        const r = await Promise.race([rede, limite]);
        if (r) return r;
    } catch (e) { /* sem internet */ }
    // ignoreSearch: ao-vivo.html?c=CODIGO usa a mesma página guardada (o código é lido da URL)
    const salvo = await caches.match(req, { ignoreSearch: true });
    if (salvo) return salvo;
    if (req.mode === 'navigate') {
        const inicio = await caches.match('index.html');
        if (inicio) return inicio;
    }
    return rede; // espera a internet mesmo (ou falha)
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.href.startsWith(FIREBASE)) { e.respondWith(primeiroCache(req)); return; }
    if (url.origin !== self.location.origin) return;
    if (url.searchParams.has('v')) { e.respondWith(primeiroCache(req)); return; }
    e.respondWith(primeiroRede(req));
});
