// Rode com: node functions/teste-pro.js
const assert = require('assert');
const crypto = require('crypto');
const P = require('./pro.js');
let ok = 0;
function t(nome, fn) { try { fn(); ok++; console.log('✅', nome); } catch (e) { console.log('❌', nome, '\n   ', e.message); process.exitCode = 1; } }

t('vencimento: soma a partir de hoje ou do vencimento que ainda vale', () => {
    const agora = 1000 * P.DIA;
    assert.strictEqual(P.novoVencimento(null, agora, 'mensal'), agora + 31 * P.DIA);
    assert.strictEqual(P.novoVencimento(agora + 10 * P.DIA, agora, 'anual'), agora + 376 * P.DIA);   // renovou antes: não perde dias
    assert.strictEqual(P.novoVencimento(agora - 5 * P.DIA, agora, 'mensal'), agora + 31 * P.DIA);   // vencido: conta de hoje
    assert.throws(() => P.novoVencimento(0, agora, 'vitalicio'));
});

t('referência uid|plano', () => {
    assert.deepStrictEqual(P.lerReferencia(P.montarReferencia('Ab12cd34EF', 'anual')), { uid: 'Ab12cd34EF', plano: 'anual' });
    assert.strictEqual(P.lerReferencia('abc|anual'), null);          // uid curto demais
    assert.strictEqual(P.lerReferencia('Ab12cd34EF|semanal'), null);
    assert.strictEqual(P.lerReferencia('../planos/x|anual'), null);  // nada de caminho no uid
});

t('id do pagamento nos formatos do Mercado Pago', () => {
    assert.strictEqual(P.extrairIdPagamento({ type: 'payment', 'data.id': '123' }, {}), '123');
    assert.strictEqual(P.extrairIdPagamento({ topic: 'payment', id: '456' }, {}), '456');
    assert.strictEqual(P.extrairIdPagamento({}, { type: 'payment', data: { id: 789 } }), '789');
    assert.strictEqual(P.extrairIdPagamento({}, { action: 'payment.updated', data: { id: '9' } }), '9');
    assert.strictEqual(P.extrairIdPagamento({ topic: 'merchant_order', id: '1' }, {}), null);
    assert.strictEqual(P.extrairIdPagamento({ 'data.id': '1; drop' }, {}), null);
});

t('assinatura do webhook (HMAC)', () => {
    const segredo = 's3gr3d0', ts = '1700000000';
    const v1 = crypto.createHmac('sha256', segredo).update('id:123;request-id:req-1;ts:' + ts + ';').digest('hex');
    assert.ok(P.assinaturaValida(segredo, `ts=${ts},v1=${v1}`, 'req-1', '123'));
    assert.ok(!P.assinaturaValida(segredo, `ts=${ts},v1=${v1}`, 'req-1', '124'));
    assert.ok(!P.assinaturaValida(segredo, '', 'req-1', '123'));
    assert.ok(P.assinaturaValida('', '', '', '123'));                // sem segredo configurado
});

t('avaliar pagamento: só aprovado, em reais e com o valor certo', () => {
    const cfg = { preco_mensal: 9.9, preco_anual: 59.9 };
    const base = { status: 'approved', external_reference: 'Ab12cd34EF|anual', currency_id: 'BRL', transaction_amount: 59.9, metadata: { valor: 59.9 } };
    assert.deepStrictEqual(P.avaliarPagamento(base, cfg), { liberar: true, uid: 'Ab12cd34EF', plano: 'anual' });
    assert.strictEqual(P.avaliarPagamento(Object.assign({}, base, { status: 'pending' }), cfg).liberar, false);
    assert.strictEqual(P.avaliarPagamento(Object.assign({}, base, { transaction_amount: 9.9 }), cfg).liberar, false);   // pagou o mensal e pediu o anual
    assert.strictEqual(P.avaliarPagamento(Object.assign({}, base, { external_reference: 'x' }), cfg).liberar, false);
    assert.strictEqual(P.avaliarPagamento(Object.assign({}, base, { currency_id: 'USD' }), cfg).liberar, false);
    assert.strictEqual(P.avaliarPagamento(Object.assign({}, base, { metadata: {} }), cfg).liberar, true);   // usa o preço atual
});

t('preço e URL de volta', () => {
    assert.strictEqual(P.precoPlano({ preco_anual: 49.9 }, 'anual'), 49.9);
    assert.strictEqual(P.precoPlano({}, 'mensal'), 9.9);
    assert.strictEqual(P.voltaPermitida('https://meuapp.web.app/index.html?x=1#y', null), 'https://meuapp.web.app/index.html');
    assert.strictEqual(P.voltaPermitida('javascript:alert(1)', null), null);
    assert.strictEqual(P.voltaPermitida('https://golpe.com/', { a: 'https://meuapp.web.app' }), null);
    assert.strictEqual(P.voltaPermitida('https://meuapp.web.app/', { a: 'https://meuapp.web.app/' }), 'https://meuapp.web.app/');
});

console.log(`\n${ok} testes passaram.`);
