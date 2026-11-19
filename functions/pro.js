// =====================================================================
// pro.js — regras puras da assinatura (sem Firebase, sem internet).
// Testes: node functions/teste-pro.js
// =====================================================================
const crypto = require('crypto');

const DIA = 24 * 60 * 60 * 1000;
const DIAS_PLANO = { mensal: 31, trimestral: 92, anual: 366 };   // um dia de folga para o pagamento cair

// novo vencimento: soma o período a partir de hoje, ou a partir do vencimento atual se ainda estiver valendo
function novoVencimento(ateAtual, agora, plano) {
    const dias = DIAS_PLANO[plano];
    if (!dias) throw new Error('plano inválido: ' + plano);
    const base = Math.max(Number(agora) || 0, Number(ateAtual) || 0);
    return base + dias * DIA;
}

// external_reference = "<uid>|<plano>"
function montarReferencia(uid, plano) { return String(uid) + '|' + String(plano); }
function lerReferencia(ref) {
    const [uid, plano] = String(ref || '').split('|');
    if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid) || !DIAS_PLANO[plano]) return null;
    return { uid, plano };
}

// preço do plano (configuracoes/monetizacao): anual | mensal
function precoPlano(config, plano) {
    const c = config || {};
    const padrao = { mensal: 9.9, trimestral: 24.9, anual: 59.9 };
    const v = Number(c['preco_' + plano] != null ? c['preco_' + plano] : padrao[plano]);
    return Math.round(v * 100) / 100;
}

// O Mercado Pago avisa de vários jeitos: ?type=payment&data.id=1, ?topic=payment&id=1 ou corpo { type, data: { id } }
function extrairIdPagamento(query, body) {
    const q = query || {}, b = body || {};
    const tipo = q.type || q.topic || b.type || b.topic || (b.action && String(b.action).split('.')[0]);
    if (tipo && tipo !== 'payment') return null;
    const id = q['data.id'] || q.id || (b.data && b.data.id) || b.id;
    return id && /^\d{1,30}$/.test(String(id)) ? String(id) : null;
}

// Assinatura do webhook (x-signature: "ts=...,v1=..."), quando o segredo está configurado.
// Manifesto do Mercado Pago: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
function assinaturaValida(segredo, xSignature, xRequestId, dataId) {
    if (!segredo) return true;                     // sem segredo configurado: a consulta ao Mercado Pago já protege
    const partes = {};
    String(xSignature || '').split(',').forEach(p => { const [k, v] = p.split('='); if (k && v) partes[k.trim()] = v.trim(); });
    if (!partes.ts || !partes.v1) return false;
    let manifesto = '';
    if (dataId) manifesto += 'id:' + String(dataId).toLowerCase() + ';';
    if (xRequestId) manifesto += 'request-id:' + xRequestId + ';';
    manifesto += 'ts:' + partes.ts + ';';
    const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
    const a = Buffer.from(esperado), b = Buffer.from(partes.v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Decide o que fazer com um pagamento consultado no Mercado Pago.
// -> { liberar: true, uid, plano } | { liberar: false, motivo }
function avaliarPagamento(pag, config) {
    if (!pag || typeof pag !== 'object') return { liberar: false, motivo: 'sem pagamento' };
    if (pag.status !== 'approved') return { liberar: false, motivo: 'status ' + pag.status };
    const ref = lerReferencia(pag.external_reference);
    if (!ref) return { liberar: false, motivo: 'referência inválida' };
    if (pag.currency_id && pag.currency_id !== 'BRL') return { liberar: false, motivo: 'moeda ' + pag.currency_id };
    // o valor cobrado é o que a função gravou no checkout (metadata.valor); se faltar, usa o preço atual
    const esperado = Number(pag.metadata && pag.metadata.valor) || precoPlano(config, ref.plano);
    if (!(Number(pag.transaction_amount) + 0.01 >= esperado)) return { liberar: false, motivo: 'valor menor que o plano' };
    return { liberar: true, uid: ref.uid, plano: ref.plano };
}

// URL de volta para o app: só http(s) e, se houver lista, só das origens permitidas
function voltaPermitida(url, permitidas) {
    let u;
    try { u = new URL(String(url)); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const lista = Object.values(permitidas || {}).map(String).filter(Boolean);
    if (lista.length && !lista.some(p => u.origin === p.replace(/\/$/, ''))) return null;
    return u.origin + u.pathname;
}

module.exports = { DIA, DIAS_PLANO, novoVencimento, montarReferencia, lerReferencia, precoPlano, extrairIdPagamento, assinaturaValida, avaliarPagamento, voltaPermitida };
