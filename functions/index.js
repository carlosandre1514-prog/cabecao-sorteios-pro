// =====================================================================
// Cloud Functions do Cabeção Sorteios Pro (exige o plano Blaze do Firebase)
// Passo a passo: docs/MERCADO-PAGO.md
// =====================================================================
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { criarHandlers } = require('./handlers.js');

admin.initializeApp();

// segredos (nunca no código): firebase functions:secrets:set MP_ACCESS_TOKEN
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');

const handlers = () => criarHandlers({
    db: admin.database(),
    fetch: globalThis.fetch,
    verificarToken: (token) => admin.auth().verifyIdToken(token),
    tokenMP: MP_ACCESS_TOKEN.value(),
    segredoWebhook: MP_WEBHOOK_SECRET.value()
});

exports.criarCheckout = onRequest({ cors: true, secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] },
    (req, res) => handlers().criarCheckout(req, res));

exports.webhookMercadoPago = onRequest({ secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] },
    (req, res) => handlers().webhookMercadoPago(req, res));
