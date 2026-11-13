# Pro automático com Mercado Pago (passo a passo)

Quando alguém assina, o app abre o pagamento do Mercado Pago (Pix ou cartão). Quando o pagamento é **aprovado**,
o Mercado Pago avisa uma função no Firebase, que **consulta o pagamento direto no Mercado Pago**, confere valor e
status e grava `planos/<uid>` com o novo vencimento. O app está "escutando" esse caminho, então o Pro aparece na hora,
com o aviso "⭐ Pagamento aprovado! Seu Pro está liberado".

```
App (Assinar anual) ──► criarCheckout ──► Mercado Pago (Pix/cartão)
                                              │ pagamento aprovado
App ◄── planos/<uid> ◄── webhookMercadoPago ◄─┘  (consulta o pagamento e libera; nunca libera 2x)
```

Arquivos: `functions/index.js` (liga no Firebase), `functions/handlers.js` (as duas funções),
`functions/pro.js` (regras: vencimento, valor, referência). Testes: `cd functions && npm test`.

---

## 1. Antes de tudo

1. **Plano Blaze no Firebase** (Console → ⚙️ → Uso e faturamento → Modificar plano). É "pague pelo que usar";
   neste volume custa centavos ou nada, mas exige cartão. Dá para pôr um alerta de orçamento de R$ 10.
2. **Conta Mercado Pago** (de preferência como vendedor, com seu CPF ou MEI).
3. **Node 20** e o **Firebase CLI** no seu computador:
   ```
   npm install -g firebase-tools
   firebase login
   ```

## 2. Pegar as credenciais do Mercado Pago

Em <https://www.mercadopago.com.br/developers/panel/app> → **Criar aplicação** ("Pagamentos online", produto
"Checkout Pro"). Dentro da aplicação:

- **Credenciais de teste → Access Token** (começa com `TEST-`): use primeiro, para testar sem dinheiro de verdade.
- **Credenciais de produção → Access Token** (começa com `APP_USR-`): use quando estiver tudo certo.

> O Access Token é uma senha. **Nunca** coloque no código, no Firebase Realtime Database ou no WhatsApp.

## 3. Publicar as funções

Na pasta do projeto:

```
cd functions && npm install && cd ..
firebase functions:secrets:set MP_ACCESS_TOKEN        # cole o Access Token (TEST- primeiro)
firebase functions:secrets:set MP_WEBHOOK_SECRET      # veja o passo 5 (pode pôr qualquer texto agora e trocar depois)
firebase deploy --only functions
```

No final aparecem duas URLs, parecidas com:

```
criarCheckout:       https://criarcheckout-xxxxxxxx-uc.a.run.app
webhookMercadoPago:  https://webhookmercadopago-xxxxxxxx-uc.a.run.app
```

## 4. Dizer ao app onde estão as funções

No Realtime Database, em `configuracoes/monetizacao`, acrescente:

```json
{
  "preco_mensal": 9.9,
  "preco_anual": 59.9,
  "dias_teste": 7,
  "checkout_api": "https://criarcheckout-xxxxxxxx-uc.a.run.app",
  "webhook_url": "https://webhookmercadopago-xxxxxxxx-uc.a.run.app",
  "urls_permitidas": { "1": "https://SEU-SITE-DO-APP" }
}
```

- `urls_permitidas`: os endereços onde o app roda (para onde o Mercado Pago volta depois de pagar). Se o app roda
  dentro de um APK que abre um site, coloque esse site. Pode deixar sem esse campo enquanto testa.
- Sem `checkout_api`, o app usa os links fixos `link_checkout_mensal` / `link_checkout_anual` (sem liberar sozinho).

## 5. Webhook no painel do Mercado Pago (recomendado)

Na aplicação do Mercado Pago → **Webhooks** → **Configurar notificações**:

- URL (modo teste e produção): a URL do `webhookMercadoPago`
- Evento: **Pagamentos**
- Salve e copie a **Assinatura secreta** → `firebase functions:secrets:set MP_WEBHOOK_SECRET` e publique de novo
  (`firebase deploy --only functions`). Com ela, avisos falsos são recusados antes de qualquer coisa.

## 6. Regras do banco

Publique o arquivo `database.rules.json` (tem tudo: lista, métricas, teste grátis...):

```
firebase deploy --only database
```

ou copie o conteúdo para Realtime Database → Regras → Publicar.

## 7. Testar

1. Com o Access Token **de teste**, abra o app → menu → **Meu Plano** → Assinar anual.
2. Pague com um **usuário de teste** do Mercado Pago (painel → Contas de teste) e cartão de teste
   (<https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards>).
3. Volte ao app: em segundos aparece "⭐ Pagamento aprovado!" e o menu mostra **PRO até …**.
4. No Console do Firebase confira `planos/<uid>` e `pagamentos_mp/<id>`. Logs: `firebase functions:log`.
5. Tudo certo? Troque o segredo para o Access Token **de produção** (`firebase functions:secrets:set MP_ACCESS_TOKEN`)
   e publique de novo.

## Como o Pro é calculado

- Mensal: +31 dias. Anual: +366 dias (um dia de folga).
- Renovou antes de vencer? Os dias somam ao vencimento atual (ninguém perde dias).
- O mesmo pagamento nunca libera duas vezes (`pagamentos_mp/<id>`), mesmo que o Mercado Pago repita o aviso.
- Só libera se o pagamento estiver **aprovado**, em **reais** e com o **valor do plano**.

## Teste grátis

`testes/<uid> = { inicio }`, gravado pelo próprio app com o horário do servidor. A regra só deixa gravar **uma vez
por conta**. `dias_teste: 0` desliga o teste.

## Atenção: Play Store

Vender o Pro por Mercado Pago **dentro do app da Play Store** pode violar a política de pagamentos do Google (bens
digitais). Opções: vender o Pro pela versão web do app, ou usar o faturamento do Google Play na versão da loja.
Confira a regra atual para o Brasil antes de divulgar.
