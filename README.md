# Cabeção Sorteios Pro

App web/PWA (HTML + JS puro + Firebase Auth/Realtime Database) para sortear times de pelada,
controlar campeonato, artilharia e histórico. Tem plano Pro e interruptor remoto.

## Mapa do projeto

```
index.html            telas, menu inferior + inicialização do Firebase (único <script type="module">)
manifest.json         PWA
politica-privacidade.html
css/style.css         estilos antigos (sendo substituídos aos poucos)
css/base.css          base visual nova: cores, espaços, tipos e componentes (lista, painel de baixo, seletor...)
fonts/                fonte Inter (licença OFL em fonts/LICENSE-Inter.txt), guardada para funcionar offline
img/                  logo e ícones (já redimensionados)
js/
  ui.js               🧩 painel de baixo (UI.abrirSheet), ícones do sprite (UI.icone), títulos limpos
  logica.js           ⚙️ regras puras: sorteio, tabela, pontos, filtros  (TEM TESTES)
  remoto.js           🔌 desligar app / bloquear versão antiga / VERSAO_ATUAL_APP
  js/apito.js         🔔 apito de juiz de fim de partida (6 s), usado no app e no link
  ao-vivo.html        📡 página pública do placar ao vivo (só leitura, sem login)
  presenca.html       📲 página pública da lista de presença (sem login)
  js/futebol3d.js     animações 3D de futebol (Three.js em js/vendor/): abertura, estádio do login,
                      gol ao criar a conta, sorteio e campeão. Sem WebGL ou com "reduzir movimento", o app segue sem elas
  checkout/worker.js  checkout com Pix e cartão (Asaas) no Cloudflare: cria a cobrança e libera o Pro
                      sozinho quando o pagamento entra. Passo a passo: docs/CHECKOUT-ASAAS.md
  conheca.html        página de apresentação para divulgar ("link na bio"), com cenas 3D em Three.js
                      (js/conheca-3d.js; sem WebGL ou sem internet para o Three.js, mostra o ícone)
  auth.js             🔐 formulário de login/cadastro/Google/esqueci a senha
  app.js              🖥️ navegação entre telas, salvar/carregar Firebase, telas, cronômetro
  monetizacao.js      ⭐ plano Pro, limites, patrocinador, Pix
  metricas.js         📊 contadores anônimos de uso (painel só do admin)
  imagem-times.js     📸 imagem dos times sorteados para o WhatsApp
sw.js                 📴 service worker: app abre sem internet
database.rules.json   🔒 TODAS as regras do Realtime Database (firebase deploy --only database)
functions/            💳 Mercado Pago: criarCheckout + webhook que libera o Pro (docs/MERCADO-PAGO.md)
tests/
  logica.test.js      testes das regras         -> node tests/logica.test.js
  fumaca.test.js      app inteiro com navegador falso -> node tests/fumaca.test.js
docs/
  COMO-CONFIGURAR-MONETIZACAO.md
```

Ordem dos scripts no `index.html` importa: `logica → remoto → auth → app → monetizacao`.

## Onde procurar quando algo der errado

| Sintoma | Arquivo |
|---------|---------|
| Time desequilibrado, tabela/pontos errados | `js/logica.js` (rode os testes) |
| App bloqueado / "atualização obrigatória" | `js/remoto.js` + nó `configuracoes` do Firebase |
| Não salva / não carrega / dados trocados | `js/app.js` → `gravar()` e `carregarDadosDoFirebase()` |
| Limite de jogadores, banner, Pro | `js/monetizacao.js` + nós `configuracoes/monetizacao` e `planos/` |
| Login | `js/auth.js` + Firebase Console |
| Trocar de tela / botão voltar | `js/app.js` → `irParaAba()` |

## Como o código está organizado

- **`src/app/`**: o app em 19 arquivos por assunto (`08-elenco.js`, `09-sorteio.js`, `12-jogo.js`, `16-caixa.js`...).
  **Edite aqui.** `npm run build` junta tudo em `js/app.js` (que o navegador carrega) e carimba as versões.
- **`versao.json`**: a versão do app (o que o usuário vê e o bloqueio remoto compara). A versão dos arquivos
  (`?v=` nos HTML e no `sw.js`) é calculada sozinha pelo build a partir do conteúdo: não precisa mexer à mão.
- **`npm test`**: confere se o build está em dia e roda todos os testes (lógica, apito, app inteiro simulado e Mercado Pago).
- **`css/base.css`**: a base visual (cores, espaços, tipos e componentes). `css/style.css` guarda o que sobrou do visual antigo.
- Ícones: sprite SVG no topo do `index.html`, usados com `<svg class="i"><use href="#i-nome"/></svg>` ou `UI.icone('nome')`.

## Rodar local

Abra com um servidor estático (o módulo do Firebase não funciona em `file://`):

```
python3 -m http.server 8080
```

## Lançar nova versão

1. Mude `"app"` em `versao.json` e rode `npm run build`.
   (o `?v=` dos arquivos e o `VERSAO` do `sw.js` o build já atualiza sozinho.)
2. Gere o APK.
3. No Firebase, ajuste `configuracoes/versoes/versao_minima_permitida` (veja `docs/`).


## Placar ao vivo

Na aba Campeonato, "Compartilhar ao vivo" gera um link (`ao-vivo.html?c=CODIGO`). A cada resultado lançado,
o app copia o retrato do campeonato (`Logica.montarAoVivo`) para `ao_vivo/CODIGO` no Firebase, e a página
`ao-vivo.html` lê esse caminho em tempo real.
O cronômetro da partida também vai junto (`cron` dentro de `ao_vivo/CODIGO`): quem abre o link vê a contagem e,
tocando em "Ativar som do apito", ouve o apito quando o tempo acaba. O apito (6 s: dois sopros curtos + um longo)
fica em `js/apito.js` e é o mesmo no app e no link. Regras do Firebase: `docs/COMO-CONFIGURAR-MONETIZACAO.md`.

## Visual v3 (novidades)
- Aba **Ranking** (gols somados dos campeonatos finalizados do racha ativo).
- Menu lateral: **foto e apelido**, **Meus rachas** (perfis de racha), **Falar com o suporte**, **Caixa do suporte** (só admin), **Termos de uso** e **Política de privacidade**.
- **Histórico**: toque no campeonato para abrir a tela completa (tabela, confrontos, artilharia).
- **Corrigir placar** (✏️) nos confrontos já encerrados do modo Tabela; a classificação é recalculada.
- Configuração do suporte/admin: veja o fim de `docs/COMO-CONFIGURAR-MONETIZACAO.md`.


## Crescimento (novembro/2026)
- **Funciona sem internet**: `sw.js` guarda o app no aparelho e `app.js` guarda uma cópia dos dados do racha
  (`localStorage`, chave `cabecao_dados_<uid>`). Sem conexão (ou se o banco demorar mais de 6 s) o app abre com
  essa cópia; o que mudar fica em `cabecao_pendentes_<uid>` e é reenviado quando a conexão volta.
  O plano Pro também fica guardado, então quem é Pro continua Pro sem internet.
- **Imagem dos times** (`js/imagem-times.js`): botão "📸 Enviar imagem dos times" depois do sorteio. Gera um PNG
  com a marca do app no rodapé e abre o compartilhamento do celular (WhatsApp).
- **Convite no placar ao vivo**: card "Organiza um racha? Criar meu racha grátis" no `ao-vivo.html`.
- **Métricas** (`js/metricas.js`): contadores anônimos por dia + painel só para o admin. Regras e funil no fim
  de `docs/COMO-CONFIGURAR-MONETIZACAO.md`.
- **Resumo do racha** (depois de "Finalizar campeonato" ou ao abrir um campeonato no Histórico):
  "📸 Enviar resumo em imagem" (campeão, números, classificação, artilharia e confrontos) e
  "📋 Copiar resumo em texto" para o WhatsApp. Lógica em `Logica.resumoCampeonato` / `Logica.textoResumo`
  (com testes), desenho em `ImagemTimes.gerarResumo`.
- **Tabela sem fim** (modo Tabela): quando o turno acaba, o próximo começa sozinho (mandos invertidos nos
  turnos pares; rodadas continuam a contagem). Os jogos só param em "Finalizar campeonato".
  Lógica em `Logica.proximoTurno` (com testes).
- **Lista de presença por link** (aba Sorteio → "📲 Criar lista e enviar no grupo"): página pública
  `presenca.html?c=CODIGO`. Cada jogador DIGITA o nome e aperta Vou/Não vou (o nome é reconhecido sem ligar
  para acento/maiúscula: `Logica.acharPorNome`; nome novo entra como convidado); o app marca a presença sozinho
  (limite de vagas na linha + lista de espera por ordem de confirmação; goleiros não ocupam vaga). Quem não está
  no elenco pede para entrar e o organizador adiciona com um toque.
  Configuração por **times x jogadores de linha** (vagas = times x linha, + 1 goleiro por time; o sorteio recebe os
  mesmos números), **suplentes** que sobem sozinhos quando o organizador tira alguém (✕), e **pagamento**: o organizador
  marca quem pagou, define prazo e "como pagar"; depois do prazo aparece "N jogadores sem pagamento confirmado" e ele tira um por um no ✕ (às vezes o pessoal paga em cima da hora). Lógica em `Logica.resumirPresenca` (com testes).
  Regras do Firebase no fim de `docs/COMO-CONFIGURAR-MONETIZACAO.md`.
- **Cara do racha** (menu → "🎨 Personalizar racha", ou toque no escudo do topo): nome (grátis), logo/escudo e cor
  (Pro). A logo aceita PNG (com ou sem fundo) ou foto: PNG transparente é encaixado inteiro, foto com fundo preenche
  o quadrado (dá para trocar entre "Preencher" e "Encaixar inteira"); sai em 256 px (JPEG para foto, PNG se tiver
  transparência). Escudo e cor
  (Pro). Fica em `usuarios/<uid>/[rachas/<id>/]visual` e aparece no app inteiro (a cor troca as variáveis
  `--neon/--verde` do CSS), no link da lista, no placar ao vivo e nas imagens do WhatsApp. Cores em `Logica.CORES_RACHA`.
- **Mensagem da lista no WhatsApp**: "Enviar lista no grupo" / "Copiar lista" mandam a lista numerada com vagas em
  aberto, goleiros, suplentes, pagamento e o link (`Logica.textoListaWhatsApp`, com testes).
- **Repaginada**: avatares com iniciais, estrelas em selo, botões de ícone, interruptor de presença, filtro de
  estrelas recolhido, histórico em cartões e página da lista com cabeçalho do racha e vagas em aberto.
- **Pix copia e cola na lista** (Pro): na configuração da lista o organizador põe tipo/chave Pix, nome, cidade e valor
  (fica salvo em `usuarios/<uid>/[rachas/<id>/]pix` para as próximas listas). Cada jogador com vaga vê na página o
  **QR Code** e o botão **"Copiar código Pix"** com o valor e o nome dele na identificação (txid = código da lista +
  nome). O código é o BR Code estático do Banco Central, gerado no próprio celular (`Logica.montarPix`, CRC conferido
  com o exemplo oficial, com testes); o QR usa `js/vendor/qrcode.js` (qrcode-generator, MIT). O dinheiro cai direto
  na conta do organizador, sem taxa; depois o jogador aperta "Já paguei" e o organizador confirma.
- **Teste grátis de 7 dias + plano anual**: tela do Pro com "🎁 Testar 7 dias grátis" (1 por conta, `testes/<uid>`
  com horário do servidor) e cartões Anual (em destaque, com a economia) / Mensal. Preços e dias em
  `configuracoes/monetizacao` (`preco_mensal`, `preco_anual`, `dias_teste`). Lógica: `Logica.statusPlano` (com testes).
- **Pro automático (Mercado Pago)**: `functions/` (Cloud Functions, plano Blaze). O app chama `criarCheckout`; quando o
  pagamento é aprovado o `webhookMercadoPago` consulta o pagamento no Mercado Pago e grava `planos/<uid>`; o app escuta
  e libera na hora. Passo a passo em `docs/MERCADO-PAGO.md`; testes: `cd functions && npm test`.
- **Caixa do racha** (aba Caixa, Pro): saldo, entradas/saídas do mês, mensalistas (quem pagou/quem deve),
  cobrança pronta no WhatsApp (individual ou do grupo), lançamentos e "puxar diárias pagas da lista de presença".
  Fica em `usuarios/<uid>/[rachas/<id>/]caixa`. Lógica: `Logica.resumoCaixa` (com testes).

## Novo visual (em andamento)
Base em `css/base.css` (tokens + componentes) e ícones num sprite SVG no topo do `index.html` (`<use href="#i-nome">`).
A tela **Jogadores** já está no padrão novo: busca, filtros (Todos/Linha/Goleiros/Nível), lista com toque para editar,
botão flutuante "Adicionar" e painéis de baixo (novo jogador, colar lista, editar, filtro, opções). Regras do padrão:
sem emoji em títulos e botões, letra maiúscula só no começo da frase, uma ação principal por tela, confirmação com o
nome da ação ("Excluir", "Apagar todos") e em vermelho quando não tem volta.
