// =====================================================================
// handlers.js — as duas funções do Mercado Pago, sem depender do Firebase
// diretamente (recebem db/fetch/verificarToken prontos) para dar para testar.
//   criarCheckout:       app -> cria o pagamento (Checkout Pro: Pix ou cartão)
//   webhookMercadoPago:  Mercado Pago -> confere o pagamento e libera o Pro
// =====================================================================
const P = require('./pro.js');
const API = 'https://api.mercadopago.com';

function criarHandlers({ db, fetch, verificarToken, tokenMP, segredoWebhook, agora = () => Date.now(), log = console }) {
    const lerConfig = async () => ((await db.ref('configuracoes/monetizacao').once('value')).val()) || {};

    async function criarCheckout(req, res) {
        if (req.method !== 'POST') return res.status(405).json({ erro: 'use POST' });
        const auth = String(req.get ? req.get('authorization') || '' : (req.headers || {}).authorization || '');
        const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        let usuario;
        try { usuario = await verificarToken(idToken); } catch (e) { return res.status(401).json({ erro: 'faça login de novo' }); }
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const plano = body.plano === 'mensal' ? 'mensal' : body.plano === 'anual' ? 'anual' : null;
        if (!plano) return res.status(400).json({ erro: 'plano inválido' });
        const config = await lerConfig();
        const valor = P.precoPlano(config, plano);
        if (!(valor > 0)) return res.status(400).json({ erro: 'preço não configurado' });
        const volta = P.voltaPermitida(body.voltar, config.urls_permitidas);
        if (!volta) return res.status(400).json({ erro: 'endereço de volta não permitido' });
        const pref = {
            items: [{ id: 'pro-' + plano, title: 'Cabeção Sorteios Pro — plano ' + plano, quantity: 1, currency_id: 'BRL', unit_price: valor }],
            external_reference: P.montarReferencia(usuario.uid, plano),
            metadata: { uid: usuario.uid, plano, valor },
            back_urls: { success: volta + '?pro=ok', pending: volta + '?pro=pendente', failure: volta + '?pro=erro' },
            auto_return: 'approved',
            statement_descriptor: 'CABECAO PRO'
        };
        if (usuario.email) pref.payer = { email: usuario.email };
        if (config.webhook_url) pref.notification_url = String(config.webhook_url);
        const r = await fetch(API + '/checkout/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenMP },
            body: JSON.stringify(pref)
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.init_point) {
            log.error('Mercado Pago recusou o checkout', r.status, j && j.message);
            return res.status(502).json({ erro: 'Mercado Pago indisponível' });
        }
        return res.json({ url: j.init_point });
    }

    async function webhookMercadoPago(req, res) {
        const id = P.extrairIdPagamento(req.query, typeof req.body === 'object' ? req.body : {});
        if (!id) return res.status(200).send('ignorado');            // outros avisos (pedido, teste etc.)
        const h = n => (req.get ? req.get(n) : (req.headers || {})[n]) || '';
        if (!P.assinaturaValida(segredoWebhook, h('x-signature'), h('x-request-id'), id)) {
            log.warn('Webhook com assinatura inválida', id);
            return res.status(401).send('assinatura inválida');
        }
        // nunca confia no aviso: consulta o pagamento direto no Mercado Pago
        const r = await fetch(API + '/v1/payments/' + id, { headers: { Authorization: 'Bearer ' + tokenMP } });
        if (!r.ok) { log.error('Não consegui consultar o pagamento', id, r.status); return res.status(500).send('tente de novo'); }
        const pag = await r.json();
        const config = await lerConfig();
        const decisao = P.avaliarPagamento(pag, config);
        if (!decisao.liberar) { log.info('Pagamento sem liberar', id, decisao.motivo); return res.status(200).send('ok'); }
        // o mesmo pagamento nunca libera duas vezes (o Mercado Pago repete avisos)
        const reg = db.ref('pagamentos_mp/' + id);
        const t = await reg.transaction(atual => (atual ? undefined : { uid: decisao.uid, plano: decisao.plano, valor: Number(pag.transaction_amount) || 0, em: agora() }));
        if (!t.committed) return res.status(200).send('já processado');
        const refPlano = db.ref('planos/' + decisao.uid);
        const atual = (await refPlano.once('value')).val() || {};
        const ate = P.novoVencimento(atual.ativo ? atual.ate : 0, agora(), decisao.plano);
        await refPlano.set({ ativo: true, ate, plano: decisao.plano, origem: 'mercadopago', ultimoPagamento: id });
        log.info('Pro liberado', decisao.uid, decisao.plano, new Date(ate).toISOString());
        return res.status(200).send('ok');
    }

    return { criarCheckout, webhookMercadoPago };
}

module.exports = { criarHandlers };
