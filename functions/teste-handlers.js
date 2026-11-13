// Testa as duas funções com Firebase e Mercado Pago de mentira. Rode: node functions/teste-handlers.js
const assert = require('assert');
const { criarHandlers } = require('./handlers.js');
let ok = 0;
async function t(nome, fn) { try { await fn(); ok++; console.log('✅', nome); } catch (e) { console.log('❌', nome, '\n   ', e.stack); process.exitCode = 1; } }

function bancoFalso(inicial) {
    const dados = JSON.parse(JSON.stringify(inicial || {}));
    const ler = p => p.split('/').reduce((a, k) => (a == null ? undefined : a[k]), dados);
    const gravar = (p, v) => { const ks = p.split('/'); let o = dados; ks.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); if (v === undefined || v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v; };
    return {
        dados,
        ref: p => ({
            once: async () => ({ val: () => { const v = ler(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
            set: async v => gravar(p, v),
            transaction: async fn => { const r = fn(ler(p) === undefined ? null : ler(p)); if (r === undefined) return { committed: false }; gravar(p, r); return { committed: true }; }
        })
    };
}
function resposta() {
    const r = { codigo: 200, corpo: null };
    r.status = c => { r.codigo = c; return r; };
    r.json = c => { r.corpo = c; return r; };
    r.send = c => { r.corpo = c; return r; };
    return r;
}
const pedido = (o) => Object.assign({ method: 'POST', query: {}, body: {}, headers: {}, get(n) { return this.headers[n.toLowerCase()]; } }, o);
const DIA = 864e5;

(async () => {
    const UID = 'Uid1234567890abc';
    const config = { configuracoes: { monetizacao: { preco_mensal: 9.9, preco_anual: 59.9 } } };

    await t('criarCheckout: cria o pagamento com o preço do servidor e a referência do usuário', async () => {
        const db = bancoFalso(config);
        let enviado;
        const fetch = async (url, op) => { enviado = { url, corpo: JSON.parse(op.body), auth: op.headers.Authorization }; return { ok: true, json: async () => ({ init_point: 'https://mp/checkout/1' }) }; };
        const h = criarHandlers({ db, fetch, verificarToken: async tk => { assert.strictEqual(tk, 'TOKEN'); return { uid: UID, email: 'a@b.com' }; }, tokenMP: 'MPTOKEN', log: { error() {}, info() {}, warn() {} } });
        const res = resposta();
        await h.criarCheckout(pedido({ headers: { authorization: 'Bearer TOKEN' }, body: { plano: 'anual', voltar: 'https://app.web.app/index.html', preco: 0.01 } }), res);
        assert.strictEqual(res.corpo.url, 'https://mp/checkout/1');
        assert.ok(enviado.url.endsWith('/checkout/preferences') && enviado.auth === 'Bearer MPTOKEN');
        assert.strictEqual(enviado.corpo.items[0].unit_price, 59.9);           // ignora o "preco" que veio do app
        assert.strictEqual(enviado.corpo.external_reference, UID + '|anual');
        assert.strictEqual(enviado.corpo.back_urls.success, 'https://app.web.app/index.html?pro=ok');
    });

    await t('criarCheckout: sem login ou com plano errado não cria nada', async () => {
        const db = bancoFalso(config);
        let chamou = false;
        const h = criarHandlers({ db, fetch: async () => { chamou = true; }, verificarToken: async () => { throw new Error('inválido'); }, tokenMP: 'x', log: { error() {} } });
        const r1 = resposta(); await h.criarCheckout(pedido({ headers: { authorization: 'Bearer ruim' }, body: { plano: 'anual', voltar: 'https://a.b/' } }), r1);
        assert.strictEqual(r1.codigo, 401);
        const h2 = criarHandlers({ db, fetch: async () => { chamou = true; }, verificarToken: async () => ({ uid: UID }), tokenMP: 'x', log: { error() {} } });
        const r2 = resposta(); await h2.criarCheckout(pedido({ headers: { authorization: 'Bearer ok' }, body: { plano: 'vitalicio', voltar: 'https://a.b/' } }), r2);
        assert.strictEqual(r2.codigo, 400);
        assert.ok(!chamou);
    });

    await t('webhook: pagamento aprovado libera o Pro uma vez só (aviso repetido não soma de novo)', async () => {
        const agora = 1000 * DIA;
        const db = bancoFalso(config);
        const pag = { id: 55, status: 'approved', external_reference: UID + '|mensal', currency_id: 'BRL', transaction_amount: 9.9, metadata: { valor: 9.9 } };
        let consultas = 0;
        const fetch = async (url, op) => { consultas++; assert.ok(url.endsWith('/v1/payments/55') && op.headers.Authorization === 'Bearer MP'); return { ok: true, json: async () => pag }; };
        const h = criarHandlers({ db, fetch, verificarToken: null, tokenMP: 'MP', agora: () => agora, log: { info() {}, error() {}, warn() {} } });
        const r1 = resposta(); await h.webhookMercadoPago(pedido({ query: { type: 'payment', 'data.id': '55' } }), r1);
        assert.strictEqual(r1.codigo, 200);
        assert.deepStrictEqual(db.dados.planos[UID], { ativo: true, ate: agora + 31 * DIA, plano: 'mensal', origem: 'mercadopago', ultimoPagamento: '55' });
        const r2 = resposta(); await h.webhookMercadoPago(pedido({ body: { type: 'payment', data: { id: '55' } } }), r2);
        assert.strictEqual(r2.corpo, 'já processado');
        assert.strictEqual(db.dados.planos[UID].ate, agora + 31 * DIA);
        assert.strictEqual(consultas, 2);
    });

    await t('webhook: renovação soma ao vencimento atual; pendente e valor errado não liberam', async () => {
        const agora = 1000 * DIA;
        const db = bancoFalso(Object.assign({ planos: { [UID]: { ativo: true, ate: agora + 5 * DIA } } }, config));
        const pagamentos = {
            1: { status: 'approved', external_reference: UID + '|anual', currency_id: 'BRL', transaction_amount: 59.9, metadata: { valor: 59.9 } },
            2: { status: 'pending', external_reference: UID + '|anual', currency_id: 'BRL', transaction_amount: 59.9 },
            3: { status: 'approved', external_reference: UID + '|anual', currency_id: 'BRL', transaction_amount: 1, metadata: { valor: 59.9 } }
        };
        const fetch = async url => ({ ok: true, json: async () => pagamentos[url.split('/').pop()] });
        const h = criarHandlers({ db, fetch, tokenMP: 'MP', agora: () => agora, log: { info() {}, error() {}, warn() {} } });
        await h.webhookMercadoPago(pedido({ query: { topic: 'payment', id: '1' } }), resposta());
        assert.strictEqual(db.dados.planos[UID].ate, agora + 5 * DIA + 366 * DIA);
        const antes = db.dados.planos[UID].ate;
        await h.webhookMercadoPago(pedido({ query: { topic: 'payment', id: '2' } }), resposta());
        await h.webhookMercadoPago(pedido({ query: { topic: 'payment', id: '3' } }), resposta());
        assert.strictEqual(db.dados.planos[UID].ate, antes);
        assert.ok(!db.dados.pagamentos_mp[2] && !db.dados.pagamentos_mp[3]);
    });

    await t('webhook: com segredo configurado, assinatura errada é recusada antes de consultar', async () => {
        let consultou = false;
        const h = criarHandlers({ db: bancoFalso(config), fetch: async () => { consultou = true; }, tokenMP: 'MP', segredoWebhook: 'segredo', log: { warn() {} } });
        const r = resposta(); await h.webhookMercadoPago(pedido({ query: { type: 'payment', 'data.id': '7' }, headers: { 'x-signature': 'ts=1,v1=errado' } }), r);
        assert.strictEqual(r.codigo, 401); assert.ok(!consultou);
    });

    console.log(`\n${ok} testes passaram.`);
})();
