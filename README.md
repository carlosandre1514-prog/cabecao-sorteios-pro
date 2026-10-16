# Cabeção Sorteios Pro

App web/PWA (HTML + JS puro + Firebase Auth/Realtime Database) para sortear times de pelada,
controlar campeonato, artilharia e histórico. Tem plano Pro e interruptor remoto.

## Mapa do projeto

```
index.html            telas, menu inferior + inicialização do Firebase (único <script type="module">)
manifest.json         PWA
politica-privacidade.html
css/style.css
img/                  logo e ícones (já redimensionados)
js/
  logica.js           ⚙️ regras puras: sorteio, tabela, pontos, filtros  (TEM TESTES)
  remoto.js           🔌 desligar app / bloquear versão antiga / VERSAO_ATUAL_APP
  js/apito.js         🔔 apito de juiz de fim de partida (6 s), usado no app e no link
  ao-vivo.html        📡 página pública do placar ao vivo (só leitura, sem login)
  auth.js             🔐 formulário de login/cadastro/Google/esqueci a senha
  app.js              🖥️ navegação entre telas, salvar/carregar Firebase, telas, cronômetro
  monetizacao.js      ⭐ plano Pro, limites, patrocinador, Pix
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

## Rodar local

Abra com um servidor estático (o módulo do Firebase não funciona em `file://`):

```
python3 -m http.server 8080
```

## Lançar nova versão

1. Mude `VERSAO_ATUAL_APP` em `js/remoto.js`.
2. Gere o APK.
3. No Firebase, ajuste `configuracoes/versoes/versao_minima_permitida` (veja `docs/`).


## Placar ao vivo

Na aba Campeonato, "Compartilhar ao vivo" gera um link (`ao-vivo.html?c=CODIGO`). A cada resultado lançado,
o app copia o retrato do campeonato (`Logica.montarAoVivo`) para `ao_vivo/CODIGO` no Firebase, e a página
`ao-vivo.html` lê esse caminho em tempo real.
O cronômetro da partida também vai junto (`cron` dentro de `ao_vivo/CODIGO`): quem abre o link vê a contagem e,
tocando em "Ativar som do apito", ouve o apito quando o tempo acaba. O apito (6 s: dois sopros curtos + um longo)
fica em `js/apito.js` e é o mesmo no app e no link. Regras do Firebase: `docs/COMO-CONFIGURAR-MONETIZACAO.md`.
