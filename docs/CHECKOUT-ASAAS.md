# Checkout com Pix e cartão (Asaas + Cloudflare) — passo a passo pelo celular

Como funciona:

```
App (Assinar) ──► robô no Cloudflare ──► Asaas cria a cobrança ──► página do Asaas (Pix ou cartão)
                                                                       │ pagou
App mostra PRO ◄── planos/<uid> ◄── robô confere no Asaas ◄── aviso (webhook) ┘
```

- **Custo fixo: zero.** O Cloudflare Workers é grátis (100 mil acessos por dia) e não pede cartão.
  O Asaas não tem mensalidade: cobra só uma **taxa por venda** (Pix e cartão têm taxas diferentes;
  confira os valores atuais no site do Asaas). Cartão de crédito sempre tem taxa, em qualquer empresa.
- Na **primeira compra** o app pede **nome e CPF** (o Asaas exige para emitir a cobrança). Eles vão
  só para o Asaas. No Firebase fica só o código do cliente (`clientes_asaas/<uid>`), para não pedir de novo.
- O robô **nunca libera só pelo aviso**: ele consulta o pagamento no Asaas, confere se foi pago e o
  valor, e libera uma vez só (`pagamentos_asaas/<id>`). Renovou antes de vencer? Os dias somam.

Arquivos: `checkout/worker.js` (o robô) e `checkout/teste.mjs` (testes: `node checkout/teste.mjs`).

---

## 1. Conta no Asaas

1. Baixe o app **Asaas** (ou abra asaas.com) e crie a conta com o seu **CPF**. Mande os documentos que
   ele pedir e espere a aprovação.
2. Cadastre uma **chave Pix** dentro do Asaas (pode ser aleatória). Sem ela, a cobrança não mostra o Pix.
3. Pegue a **chave da API**: menu **Integrações → Chaves de API → Gerar chave**. Ela começa com
   `$aact_`. Copie e guarde: ela só aparece uma vez.

> Para testar sem dinheiro de verdade, crie também uma conta em **sandbox.asaas.com** e pegue a chave
> de lá. Veja o passo 6.

## 2. Chave do Firebase (para o robô liberar o Pro)

1. console.firebase.google.com → seu projeto → **⚙️ Configurações do projeto → Contas de serviço**.
2. Toque em **Gerar nova chave privada** → **Gerar chave**. Baixa um arquivo `.json`.
3. Abra o arquivo (pode ser no app Arquivos/Drive) e **copie todo o texto**, do `{` até o `}`.

> Esse arquivo é uma senha de administrador. Não mande para ninguém nem cole no WhatsApp.

## 3. O robô no Cloudflare

1. Crie a conta grátis em **dash.cloudflare.com** (só e-mail e senha).
2. Menu **Workers e Pages → Criar → Worker** → nome `cabecao-checkout` → **Implantar**.
3. Toque em **Editar código**. Apague tudo o que estiver lá e cole o conteúdo deste arquivo:
   `https://raw.githubusercontent.com/carlosandre1514-prog/cabecao-sorteios-pro/main/checkout/worker.js`
   (abra o link, selecione tudo e copie). Toque em **Implantar**.
4. Volte ao Worker → **Configurações → Variáveis e segredos → Adicionar**, tipo **Segredo**:

   | Nome | Valor |
   |---|---|
   | `ASAAS_API_KEY` | a chave do passo 1 (`$aact_...`) |
   | `ASAAS_WEBHOOK_TOKEN` | um texto comprido inventado por você (ex.: 30 letras e números misturados) |
   | `FIREBASE_SERVICE_ACCOUNT` | o texto inteiro do arquivo `.json` do passo 2 |
   | `PAINEL_CHAVE` | (opcional) a chave `pnl_...` do Cabeção no painel de métricas |

5. Anote o endereço do Worker, algo como `https://cabecao-checkout.SEUNOME.workers.dev`.
   Abrindo esse endereço no navegador tem que aparecer **ok**.

## 4. Ligar o app ao robô

No app: **Mais → Painel de administração → Checkout automático (Pix e cartão)** →
cole o endereço do Worker **terminando em `/checkout`**:

```
https://cabecao-checkout.SEUNOME.workers.dev/checkout
```

Toque em **Salvar configurações**. Os preços que valem são os do mesmo painel (mensal e anual).

## 5. Aviso de pagamento (webhook) no Asaas

No Asaas: **Integrações → Webhooks → Adicionar webhook**:

- **URL:** `https://cabecao-checkout.SEUNOME.workers.dev/webhook`
- **Versão da API:** v3 · **Envio:** sequencial
- **Token de autenticação:** o **mesmo texto** que você pôs em `ASAAS_WEBHOOK_TOKEN`
- **Eventos:** *Cobrança confirmada* (`PAYMENT_CONFIRMED`) e *Cobrança recebida* (`PAYMENT_RECEIVED`)
- Deixe **ativado** e salve.

## 6. Testar sem dinheiro de verdade (recomendado)

1. No Worker, troque `ASAAS_API_KEY` pela chave do **sandbox** e adicione a variável de texto
   `ASAAS_URL` = `https://api-sandbox.asaas.com/v3`.
2. Configure o webhook do passo 5 também na conta do sandbox.
3. No app, entre com outra conta (não a de admin), toque em **Assinar**, preencha nome e um CPF válido.
   Abre a página do Asaas.
4. No painel do **sandbox**, abra a cobrança e use **Confirmar recebimento** (simula o pagamento).
5. Em segundos o app mostra o Pro. No Firebase aparecem `planos/<uid>` e `pagamentos_asaas/<id>`.
6. Deu certo? Volte a `ASAAS_API_KEY` com a chave de **produção**, **apague** `ASAAS_URL` e confira
   o webhook na conta de produção.

## Se algo não funcionar

- **"Não consegui abrir o pagamento"**: abra o endereço do Worker (tem que dizer `ok`) e confira o
  campo do painel de admin (precisa terminar em `/checkout`). Logs: Worker → **Logs** (tempo real).
- **Pagou e o Pro não veio**: no Asaas, **Webhooks → Logs** mostra se o aviso chegou. `401` = o token
  do webhook está diferente do `ASAAS_WEBHOOK_TOKEN`. Você sempre pode liberar na mão no painel de admin.
- **Pix não aparece na página de pagamento**: falta cadastrar uma chave Pix no Asaas (passo 1.2).

## Play Store

Vender o Pro por fora da Play Store (pelo site ou pelo APK que você distribui) não tem problema.
Se um dia o app for para a Play Store, o Google pode exigir o pagamento dele para assinaturas dentro do app.
