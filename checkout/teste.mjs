// Testes do checkout Asaas (checkout/worker.js) com Asaas, Google e Firebase falsos.
// Rode com:  node checkout/teste.mjs
import assert from 'assert';
import worker, { cpfValido, avaliarPagamento, novoVencimento, precoPlano, vencimentoCobranca, uidDoToken, _limparCacheChaves } from './worker.js';

const PROJETO = 'studio-7737408264-35a36';
const DIA = 86400000;
let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log('✅ ' + nome); };
const b64url = (buf) => Buffer.from(buf).toString('base64url');

// ---- chaves falsas: uma do "Google" (assina o login) e uma da conta de serviço
const google = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwkPublica = { ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const servico = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', servico.privateKey)).toString('base64');
const CONTA = JSON.stringify({ client_email: 'robo@x.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n` });

async function tokenLogin(uid, extra = {}) {
    const agora = Math.floor(Date.now() / 1000);
    const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
    const p = b64url(JSON.stringify({ aud: PROJETO, iss: 'https://securetoken.google.com/' + PROJETO, sub: uid, iat: agora - 10, exp: agora + 3600, ...extra }));
    const s = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', google.privateKey, new TextEncoder().encode(h + '.' + p)));
    return h + '.' + p + '.' + s;
}

// ---- "internet" falsa
function mundo() {
    const db = { configuracoes: { monetizacao: { preco_mensal: 9.9, preco_anual: 59.9 } } };
    const asaas = { clientes: [], pagamentos: {} };
    const painel = [];
    const ler = (c) => c.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);
    const gravar = (c, v) => { const ks = c.split('/').filter(Boolean); let o = db; ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v; };
    const resp = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
    const buscar = async (url, op = {}) => {
        const u = new URL(url); let corpo = op.body; try { corpo = JSON.parse(op.body); } catch (e) { /* formulário */ }
        if (u.host === 'www.googleapis.com') return resp({ keys: [jwkPublica] });
        if (u.host === 'oauth2.googleapis.com') { assert.ok(String(corpo).includes('assertion=')); return resp({ access_token: 'adm' }); }
        if (u.host.endsWith('firebaseio.com')) {
            const caminho = u.pathname.replace(/\.json$/, '');
            if (caminho !== '/configuracoes/monetizacao') assert.strictEqual(op.headers.Authorization, 'Bearer adm', 'Firebase só com o token de admin');
            if (!op.method || op.method === 'GET') return resp(ler(caminho) ?? null);
            if (op.method === 'PUT') { gravar(caminho, corpo); return resp(corpo); }
            if (op.method === 'DELETE') { gravar(caminho, null); return resp(null); }
        }
        if (u.host === 'api.asaas.com') {
            assert.strictEqual(op.headers.access_token, 'chave-asaas');
            if (u.pathname === '/v3/customers' && op.method === 'GET') return resp({ data: asaas.clientes.filter((c) => c.cpfCnpj === u.searchParams.get('cpfCnpj')) });
            if (u.pathname === '/v3/customers') { const c = { id: 'cus_' + (asaas.clientes.length + 1), ...corpo }; asaas.clientes.push(c); return resp(c); }
            if (u.pathname === '/v3/payments' && op.method === 'POST') {
                const id = 'pay_' + (Object.keys(asaas.pagamentos).length + 1);
                asaas.pagamentos[id] = { id, status: 'PENDING', invoiceUrl: 'https://www.asaas.com/i/' + id, ...corpo };
                return resp(asaas.pagamentos[id]);
            }
            const m = u.pathname.match(/^\/v3\/payments\/(.+)$/);
            if (m) return asaas.pagamentos[m[1]] ? resp(asaas.pagamentos[m[1]]) : resp({ errors: [{ code: 'not_found' }] }, 404);
        }
        if (u.host === 'pxtxcbqqbjtmsmwbcise.supabase.co') { painel.push(...corpo.eventos); return resp({ ok: true }); }
        throw new Error('URL inesperada: ' + url);
    };
    const env = { ASAAS_API_KEY: 'chave-asaas', ASAAS_WEBHOOK_TOKEN: 'segredo-webhook', FIREBASE_SERVICE_ACCOUNT: CONTA, PAINEL_CHAVE: 'pnl_x' };
    const chamar = async (caminho, { metodo = 'POST', corpo, cab = {} } = {}) => {
        const r = await worker.fetch(new Request('https://robo.workers.dev' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...cab }, body: corpo ? JSON.stringify(corpo) : undefined }), env, {}, buscar);
        return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    return { db, asaas, painel, chamar };
}
const CPF = '529.982.247-25';   // CPF de exemplo válido (dígitos conferem)

await t('CPF: confere os dígitos', () => {
    assert.ok(cpfValido(CPF) && cpfValido('52998224725'));
    assert.ok(!cpfValido('529.982.247-26') && !cpfValido('111.111.111-11') && !cpfValido('123'));
});

await t('regras: preço, vencimento e renovação somando', () => {
    assert.strictEqual(precoPlano({ preco_anual: 59.9 }, 'anual'), 59.9);
    assert.strictEqual(precoPlano({}, 'mensal'), 9.9);
    const agora = Date.UTC(2026, 10, 20);
    assert.strictEqual(novoVencimento(0, agora, 'anual'), agora + 366 * DIA);
    assert.strictEqual(novoVencimento(agora + 10 * DIA, agora, 'mensal'), agora + 41 * DIA);
    assert.strictEqual(vencimentoCobranca(Date.UTC(2026, 10, 20, 2, 0)), '2026-11-22');   // 23h de Brasília do dia 19 + 3
});

await t('pagamento: só libera pago, com referência e valor certos', () => {
    const cfg = { preco_anual: 59.9, preco_mensal: 9.9 };
    assert.deepStrictEqual(avaliarPagamento({ status: 'RECEIVED', externalReference: 'uidteste1|anual', value: 59.9 }, cfg), { liberar: true, uid: 'uidteste1', plano: 'anual' });
    assert.ok(!avaliarPagamento({ status: 'PENDING', externalReference: 'uidteste1|anual', value: 59.9 }, cfg).liberar);
    assert.ok(!avaliarPagamento({ status: 'CONFIRMED', externalReference: 'uidteste1|anual', value: 9.9 }, cfg).liberar);
    assert.ok(!avaliarPagamento({ status: 'CONFIRMED', externalReference: 'x|vitalicio', value: 99 }, cfg).liberar);
});

await t('login: recusa token vencido, de outro projeto ou adulterado', async () => {
    _limparCacheChaves();
    const { chamar } = mundo();
    assert.strictEqual((await chamar('/checkout', { corpo: { plano: 'anual' } })).status, 401);
    for (const extra of [{ exp: Math.floor(Date.now() / 1000) - 5 }, { aud: 'outro-projeto' }]) {
        assert.strictEqual((await chamar('/checkout', { corpo: { plano: 'anual' }, cab: { Authorization: 'Bearer ' + await tokenLogin('uidteste1', extra) } })).status, 401);
    }
    const bom = await tokenLogin('uidteste1');
    const [h, p, s] = bom.split('.');
    const falso = h + '.' + b64url(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: 'outro' })) + '.' + s;
    assert.strictEqual(await uidDoToken(falso, PROJETO, Date.now(), async () => new Response(JSON.stringify({ keys: [jwkPublica] }))), null);
});

await t('checkout: primeira vez pede nome e CPF; CPF errado não passa', async () => {
    const { chamar, asaas } = mundo();
    const cab = { Authorization: 'Bearer ' + await tokenLogin('uidteste1') };
    let r = await chamar('/checkout', { corpo: { plano: 'anual' }, cab });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.j.precisaCpf, true);
    r = await chamar('/checkout', { corpo: { plano: 'anual', nome: 'Carlos Teste', cpf: '111.111.111-11' }, cab });
    assert.ok(r.j.precisaCpf && r.j.erro);
    assert.strictEqual(asaas.clientes.length, 0, 'nada vai para o Asaas com CPF errado');
});

await t('checkout: cria o cliente, a cobrança (Pix ou cartão) e devolve a página de pagamento', async () => {
    const { chamar, asaas, db } = mundo();
    const cab = { Authorization: 'Bearer ' + await tokenLogin('uidteste1') };
    const r = await chamar('/checkout', { corpo: { plano: 'anual', nome: 'Carlos Teste', cpf: CPF }, cab });
    assert.strictEqual(r.status, 200);
    assert.ok(r.j.url.startsWith('https://www.asaas.com/i/'));
    const pag = asaas.pagamentos[r.j.id];
    assert.strictEqual(pag.billingType, 'UNDEFINED');
    assert.strictEqual(pag.value, 59.9);
    assert.strictEqual(pag.externalReference, 'uidteste1|anual');
    assert.strictEqual(asaas.clientes[0].cpfCnpj, '52998224725');
    assert.strictEqual(db.clientes_asaas.uidteste1, 'cus_1');
    assert.ok(!JSON.stringify(db).includes('52998224725'), 'o CPF não fica no Firebase');
    // segunda vez: sem pedir CPF de novo
    const r2 = await chamar('/checkout', { corpo: { plano: 'mensal' }, cab });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(asaas.pagamentos[r2.j.id].value, 9.9);
    assert.strictEqual(asaas.clientes.length, 1);
});

await t('webhook: token errado é recusado e nada é liberado', async () => {
    const { chamar, db } = mundo();
    const r = await chamar('/webhook', { corpo: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }, cab: { 'asaas-access-token': 'errado' } });
    assert.strictEqual(r.status, 401);
    assert.ok(!db.planos);
});

await t('webhook: pagamento confirmado libera o Pro uma vez só, e manda "assinatura" ao painel', async () => {
    const { chamar, asaas, db, painel } = mundo();
    const cab = { Authorization: 'Bearer ' + await tokenLogin('uidteste1') };
    const c = await chamar('/checkout', { corpo: { plano: 'anual', nome: 'Carlos Teste', cpf: CPF }, cab });
    const wh = { 'asaas-access-token': 'segredo-webhook' };
    // aviso chegando antes de pagar (ou falso): o robô consulta e não libera
    let r = await chamar('/webhook', { corpo: { event: 'PAYMENT_RECEIVED', payment: { id: c.j.id, status: 'RECEIVED' } }, cab: wh });
    assert.ok(r.j.ignorado && !db.planos);
    asaas.pagamentos[c.j.id].status = 'RECEIVED'; asaas.pagamentos[c.j.id].billingType = 'PIX';
    r = await chamar('/webhook', { corpo: { event: 'PAYMENT_RECEIVED', payment: { id: c.j.id } }, cab: wh });
    assert.strictEqual(r.j.liberado, 'uidteste1');
    const p = db.planos.uidteste1;
    assert.ok(p.ativo && p.plano === 'anual' && p.origem === 'asaas');
    assert.ok(Math.abs(p.ate - (Date.now() + 366 * DIA)) < 5000);
    assert.strictEqual(db.pagamentos_asaas[c.j.id].forma, 'PIX');
    assert.strictEqual(painel.length, 1); assert.strictEqual(painel[0].tipo, 'assinatura'); assert.strictEqual(painel[0].dados.valor, 59.9);
    const ate = p.ate;
    r = await chamar('/webhook', { corpo: { event: 'PAYMENT_CONFIRMED', payment: { id: c.j.id } }, cab: wh });
    assert.strictEqual(r.j.ignorado, 'já liberado');
    assert.strictEqual(db.planos.uidteste1.ate, ate, 'aviso repetido não soma dias');
    // renovação antes de vencer: soma ao vencimento atual
    const c2 = await chamar('/checkout', { corpo: { plano: 'mensal' }, cab });
    asaas.pagamentos[c2.j.id].status = 'CONFIRMED';
    await chamar('/webhook', { corpo: { event: 'PAYMENT_CONFIRMED', payment: { id: c2.j.id } }, cab: wh });
    assert.strictEqual(db.planos.uidteste1.ate, ate + 31 * DIA);
    assert.strictEqual(painel.at(-1).dados.status, 'renovada');
});

await t('webhook: outros eventos são aceitos e ignorados (o Asaas não pausa a fila)', async () => {
    const { chamar } = mundo();
    const r = await chamar('/webhook', { corpo: { event: 'PAYMENT_CREATED', payment: { id: 'pay_9' } }, cab: { 'asaas-access-token': 'segredo-webhook' } });
    assert.strictEqual(r.status, 200);
});

console.log('\n' + ok + ' testes do checkout passaram.');
