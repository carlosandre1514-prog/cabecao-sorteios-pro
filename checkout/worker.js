// =====================================================================
// Checkout do Cabeção Sorteios Pro — Asaas (Pix e cartão) no Cloudflare Workers (plano grátis)
//
// Este arquivo é colado inteiro no Worker (Cloudflare → Workers → Editar código).
// Passo a passo: docs/CHECKOUT-ASAAS.md
//
//   POST /checkout   o app manda o login (Firebase) e o plano; o robô cria a cobrança no Asaas
//                    e devolve o endereço da página de pagamento (Pix ou cartão)
//   POST /webhook    o Asaas avisa que o pagamento entrou; o robô CONSULTA o pagamento no Asaas,
//                    confere status e valor e libera o Pro em planos/<uid> (nunca libera 2 vezes)
//   GET  /           "ok" (para conferir se está no ar)
//
// Segredos (Worker → Configurações → Variáveis e segredos), nunca no código:
//   ASAAS_API_KEY             chave da API do Asaas ($aact_...)
//   ASAAS_WEBHOOK_TOKEN       o "token de autenticação" que você escreve no webhook do Asaas
//   FIREBASE_SERVICE_ACCOUNT  o JSON inteiro da conta de serviço do Firebase
//   PAINEL_CHAVE              (opcional) chave do painel de métricas: manda o evento "assinatura"
// Variáveis (opcionais):
//   ASAAS_URL     padrão https://api.asaas.com/v3  (teste: https://api-sandbox.asaas.com/v3)
//
// O CPF e o nome de quem paga vão só para o Asaas (ele exige para emitir a cobrança).
// No Firebase fica só o código do cliente no Asaas (clientes_asaas/<uid>), para não pedir de novo.
// =====================================================================
const PROJETO = 'studio-7737408264-35a36';
const BANCO = 'https://studio-7737408264-35a36-default-rtdb.firebaseio.com';
const PAINEL_URL = 'https://pxtxcbqqbjtmsmwbcise.supabase.co/rest/v1/rpc/painel_enviar';
const PAINEL_APIKEY = 'sb_publishable_URNeHmQn-EuIyqXbkbMSag_gWTtX2rf';
const DIA = 24 * 60 * 60 * 1000;
const DIAS_PLANO = { mensal: 31, trimestral: 92, anual: 366 };   // um dia de folga para o pagamento cair
const PRECO_PADRAO = { mensal: 9.9, trimestral: 24.9, anual: 59.9 };
const PAGO = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

// ---------------------------------------------------------------- regras (puras)
export function novoVencimento(ateAtual, agora, plano) {
    const dias = DIAS_PLANO[plano];
    if (!dias) throw new Error('plano inválido');
    return Math.max(Number(agora) || 0, Number(ateAtual) || 0) + dias * DIA;
}
export function precoPlano(config, plano) {
    const c = config || {};
    const v = Number(c['preco_' + plano] != null ? c['preco_' + plano] : PRECO_PADRAO[plano]);
    return Math.round(v * 100) / 100;
}
export function lerReferencia(ref) {
    const [uid, plano] = String(ref || '').split('|');
    if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid) || !DIAS_PLANO[plano]) return null;
    return { uid, plano };
}
export function cpfValido(c) {
    const d = String(c || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dig = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}
// o que fazer com um pagamento consultado no Asaas -> { liberar, uid, plano } | { liberar: false, motivo }
export function avaliarPagamento(pag, config) {
    if (!pag || typeof pag !== 'object') return { liberar: false, motivo: 'sem pagamento' };
    if (!PAGO.has(pag.status)) return { liberar: false, motivo: 'status ' + pag.status };
    const ref = lerReferencia(pag.externalReference);
    if (!ref) return { liberar: false, motivo: 'referência inválida' };
    if (!(Number(pag.value) + 0.01 >= precoPlano(config, ref.plano))) return { liberar: false, motivo: 'valor menor que o plano' };
    return { liberar: true, uid: ref.uid, plano: ref.plano };
}
// vencimento da cobrança: hoje + 3 dias, no horário de Brasília (AAAA-MM-DD)
export function vencimentoCobranca(agora) {
    return new Date(Number(agora) - 3 * 60 * 60 * 1000 + 3 * DIA).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- utilitários
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlTexto = (s) => b64url(new TextEncoder().encode(s));
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const json = (dados, status = 200, extra = {}) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// confere o login do Firebase (token do app) e devolve o uid; null se não valer
let chavesGoogle = { em: 0, jwks: null };
export async function uidDoToken(token, projeto = PROJETO, agora = Date.now(), buscar = fetch) {
    try {
        const [h, p, s] = String(token || '').split('.');
        if (!h || !p || !s) return null;
        const cab = JSON.parse(new TextDecoder().decode(deB64url(h)));
        const dados = JSON.parse(new TextDecoder().decode(deB64url(p)));
        if (cab.alg !== 'RS256' || !cab.kid) return null;
        const seg = agora / 1000;
        if (dados.aud !== projeto || dados.iss !== 'https://securetoken.google.com/' + projeto) return null;
        if (!(dados.exp > seg) || !(dados.iat <= seg + 300) || !dados.sub) return null;
        if (!chavesGoogle.jwks || agora - chavesGoogle.em > 3600 * 1000) {
            const r = await buscar('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
            chavesGoogle = { em: agora, jwks: (await r.json()).keys || [] };
        }
        const jwk = chavesGoogle.jwks.find((k) => k.kid === cab.kid);
        if (!jwk) return null;
        const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, deB64url(s), new TextEncoder().encode(h + '.' + p));
        return ok ? String(dados.sub) : null;
    } catch (e) { return null; }
}
export function _limparCacheChaves() { chavesGoogle = { em: 0, jwks: null }; tokenFirebase = { ate: 0, valor: '' }; }

// acesso de administrador ao Realtime Database (conta de serviço -> token OAuth)
let tokenFirebase = { ate: 0, valor: '' };
async function tokenAdmin(env, buscar) {
    if (tokenFirebase.valor && Date.now() < tokenFirebase.ate) return tokenFirebase.valor;
    const conta = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const agora = Math.floor(Date.now() / 1000);
    const corpo = b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlTexto(JSON.stringify({
        iss: conta.client_email, aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
        scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
    }));
    const pem = conta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const chave = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const assin = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo)));
    const r = await buscar('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + corpo + '.' + assin
    });
    const j = await r.json();
    if (!j.access_token) throw new Error('firebase: sem token');
    tokenFirebase = { valor: j.access_token, ate: Date.now() + 50 * 60 * 1000 };
    return j.access_token;
}
async function banco(env, buscar, metodo, caminho, dados) {
    const t = await tokenAdmin(env, buscar);
    const r = await buscar(`${BANCO}/${caminho}.json`, {
        method: metodo, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: dados === undefined ? undefined : JSON.stringify(dados)
    });
    if (!r.ok) throw new Error('firebase ' + metodo + ' ' + caminho + ': ' + r.status);
    return r.json();
}
async function asaas(env, buscar, metodo, caminho, dados) {
    const base = (env.ASAAS_URL || 'https://api.asaas.com/v3').replace(/\/$/, '');
    const r = await buscar(base + caminho, {
        method: metodo,
        headers: { access_token: env.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'cabecao-sorteios-pro' },
        body: dados === undefined ? undefined : JSON.stringify(dados)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error('asaas ' + caminho + ': ' + r.status + ' ' + JSON.stringify(j.errors || j).slice(0, 200)); e.status = r.status; e.erros = j.errors; throw e; }
    return j;
}
async function painel(env, buscar, evento) {
    if (!env.PAINEL_CHAVE) return;
    try {
        await buscar(PAINEL_URL, { method: 'POST', headers: { apikey: PAINEL_APIKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: env.PAINEL_CHAVE, eventos: [evento] }) });
    } catch (e) { /* o pagamento não depende do painel */ }
}

// ---------------------------------------------------------------- /checkout
async function checkout(req, env, buscar) {
    const token = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = await uidDoToken(token, PROJETO, Date.now(), buscar);
    if (!uid) return json({ erro: 'Entre na sua conta de novo.' }, 401, CORS);
    const corpo = await req.json().catch(() => ({}));
    const plano = DIAS_PLANO[corpo.plano] ? String(corpo.plano) : null;
    if (!plano) return json({ erro: 'plano inválido' }, 400, CORS);

    const config = await (await buscar(`${BANCO}/configuracoes/monetizacao.json`)).json().catch(() => ({})) || {};
    const valor = precoPlano(config, plano);
    if (!(valor >= 5)) return json({ erro: 'preço do plano não configurado' }, 500, CORS);

    // cliente no Asaas: reaproveita; na primeira vez precisa de nome e CPF
    let cliente = await banco(env, buscar, 'GET', 'clientes_asaas/' + uid).catch(() => null);
    if (!cliente) {
        const cpf = String(corpo.cpf || '').replace(/\D/g, '');
        const nome = String(corpo.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        if (!cpfValido(cpf) || nome.length < 3) return json({ precisaCpf: true, erro: !cpf ? '' : 'Confira o nome e o CPF.' }, 400, CORS);
        const achou = await asaas(env, buscar, 'GET', '/customers?cpfCnpj=' + cpf + '&limit=1');
        const c = (achou.data && achou.data[0]) || await asaas(env, buscar, 'POST', '/customers', { name: nome, cpfCnpj: cpf, externalReference: uid, notificationDisabled: true });
        cliente = c.id;
        await banco(env, buscar, 'PUT', 'clientes_asaas/' + uid, cliente);
    }

    let pag;
    try {
        pag = await asaas(env, buscar, 'POST', '/payments', {
            customer: cliente, billingType: 'UNDEFINED', value: valor, dueDate: vencimentoCobranca(Date.now()),
            description: 'Cabeção Sorteios Pro – plano ' + plano, externalReference: uid + '|' + plano
        });
    } catch (e) {
        // cliente apagado no Asaas: esquece e pede os dados de novo
        if (e.status === 404 || /customer/i.test(String(e.message))) { await banco(env, buscar, 'DELETE', 'clientes_asaas/' + uid).catch(() => {}); return json({ precisaCpf: true, erro: '' }, 400, CORS); }
        throw e;
    }
    if (!/^https:\/\//.test(pag.invoiceUrl || '')) throw new Error('asaas sem invoiceUrl');
    return json({ url: pag.invoiceUrl, id: pag.id }, 200, CORS);
}

// ---------------------------------------------------------------- /webhook
async function webhook(req, env, buscar) {
    const tokenRecebido = req.headers.get('asaas-access-token') || '';
    if (!env.ASAAS_WEBHOOK_TOKEN || tokenRecebido !== env.ASAAS_WEBHOOK_TOKEN) return json({ ok: false }, 401);
    const ev = await req.json().catch(() => ({}));
    const id = ev && ev.payment && ev.payment.id;
    if (!['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(ev.event) || !/^[A-Za-z0-9_]{4,60}$/.test(String(id || ''))) return json({ ok: true, ignorado: ev.event || 'sem evento' });

    // nunca confia só no aviso: consulta o pagamento direto no Asaas
    const pag = await asaas(env, buscar, 'GET', '/payments/' + id);
    const config = await (await buscar(`${BANCO}/configuracoes/monetizacao.json`)).json().catch(() => ({})) || {};
    const r = avaliarPagamento(pag, config);
    if (!r.liberar) return json({ ok: true, ignorado: r.motivo });

    if (await banco(env, buscar, 'GET', 'pagamentos_asaas/' + id)) return json({ ok: true, ignorado: 'já liberado' });   // o Asaas repete avisos
    const atual = await banco(env, buscar, 'GET', 'planos/' + r.uid) || {};
    const agora = Date.now();
    const ateAtual = atual.ativo && atual.ate ? Number(atual.ate) : 0;
    const ate = novoVencimento(ateAtual, agora, r.plano);
    await banco(env, buscar, 'PUT', 'planos/' + r.uid, { ativo: true, plano: r.plano, ate, origem: 'asaas', pagamento: id, atualizado: agora });
    await banco(env, buscar, 'PUT', 'pagamentos_asaas/' + id, { uid: r.uid, plano: r.plano, valor: Number(pag.value), forma: pag.billingType || '', em: agora });
    await painel(env, buscar, { tipo: 'assinatura', usuario: r.uid, dados: { plano: r.plano, valor: Number(pag.value), status: ateAtual > agora ? 'renovada' : 'ativa', expira_em: new Date(ate).toISOString(), forma: pag.billingType || '', origem: 'asaas' } });
    return json({ ok: true, liberado: r.uid, ate });
}

// ---------------------------------------------------------------- entrada
export default {
    async fetch(req, env, ctx, buscar = fetch) {
        const url = new URL(req.url);
        try {
            if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
            if (url.pathname === '/checkout' && req.method === 'POST') return await checkout(req, env, buscar);
            if (url.pathname === '/webhook' && req.method === 'POST') return await webhook(req, env, buscar);
            if (url.pathname === '/' && req.method === 'GET') return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
            return json({ erro: 'não encontrado' }, 404);
        } catch (e) {
            console.error(e && e.message);
            return json({ erro: 'Não consegui falar com o pagamento agora. Tente de novo.' }, 500, url.pathname === '/checkout' ? CORS : {});
        }
    }
};
