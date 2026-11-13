# Monetização – Cabeção Sorteios Pro (v1.1.0)

## 1. Configuração remota (Firebase > Realtime Database)
Crie o nó `configuracoes/monetizacao`:

```json
{
  "ativo": true,
  "preco_texto": "R$ 9,90/mês",
  "link_checkout": "https://link-de-pagamento",
  "chave_pix": "sua-chave-pix",
  "nome_pix": "Seu Nome",
  "whatsapp_suporte": "5511999999999",
  "limite_jogadores_gratis": 25,
  "limite_historico_gratis": 3,
  "patrocinador": {
    "ativo": true,
    "texto": "Barbearia do Zé – 10% de desconto pros boleiros",
    "link": "https://wa.me/5511999999999",
    "imagem": "https://.../logo.png"
  }
}
```
`"ativo": false` desliga tudo e libera o app para todos.

## 2. Liberar um usuário Pro
Depois de receber o pagamento, crie `planos/<UID do usuário>`:
```json
{ "ativo": true, "ate": 1798761600000 }
```
(`ate` é opcional, em milissegundos. O UID aparece na mensagem de comprovante do WhatsApp.)

## 3. Regras de segurança (IMPORTANTE)
O usuário NÃO pode conseguir se dar o plano Pro sozinho:

```json
{
  "rules": {
    "configuracoes": { ".read": true, ".write": false },
    "planos": {
      "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": false }
    },
    "usuarios": {
      "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" }
    }
  }
}
```
Você edita `configuracoes` e `planos` direto pelo Console do Firebase (o console ignora as regras).

## 4. Próximo passo (automático)
Para liberar o Pro sozinho após o pagamento: webhook do Mercado Pago/Kiwify -> Cloud Function que grava em `planos/<uid>` (exige plano Blaze do Firebase).


---

# Desligar o app / bloquear versões antigas (Firebase > Realtime Database > nó `configuracoes`)

## A) ENCERRAR O APP GERAL (todas as versões) e reativar depois
```json
"global": {
  "app_ativo": false,
  "mensagem_desativacao": "Estamos em manutenção. Voltamos em breve!"
}
```
- `app_ativo: false` -> o app inteiro vira uma tela de "Aplicativo Desativado" (qualquer versão).
- Para reativar: troque para `true` (ou apague o nó). O app volta sozinho, sem precisar baixar nada.

## B) BLOQUEAR VERSÕES ANTIGAS depois de lançar uma atualização
```json
"versoes": {
  "versao_mais_recente": "1.2.0",
  "versao_minima_permitida": "1.2.0",
  "link_download": "https://link-do-novo-apk",
  "mensagem_versao_minima": "Baixe a nova versão para continuar!"
}
```
- Versão do app MENOR que `versao_minima_permitida` -> bloqueada, com botão "Baixar nova versão".
- `versao_mais_recente` maior que a do app (e acima do mínimo) -> só mostra um aviso, sem bloquear.
- Cada vez que lançar um APK novo: mude o número em `VERSAO_ATUAL_APP` (topo do script.js) e depois ajuste o `versao_minima_permitida` no Firebase.

## Como funciona (já testado)
- Checa ao abrir, a cada 5 minutos e sempre que a pessoa volta pro app (quem deixou aberto também é bloqueado).
- Quem foi bloqueado e abre o app SEM internet continua bloqueado (o bloqueio fica guardado no aparelho).
- Regras do Firebase: o nó `configuracoes` precisa ter `".read": true`, pois a checagem acontece antes do login.
- Limite: o bloqueio só pega versões que já têm este código (a partir da 1.1.0 / a que tinha o interruptor). Versões muito antigas sem o interruptor não conseguem ser bloqueadas.


---

## Regras completas do Realtime Database (com placar ao vivo)

Cole em Realtime Database → Regras → Publicar. Esta versão substitui a anterior e acrescenta o `ao_vivo`.

```json
{
  "rules": {
    "configuracoes": { ".read": true, ".write": false },
    "planos": {
      "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": false }
    },
    "usuarios": {
      "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" }
    },
    "ao_vivo": {
      "$codigo": {
        ".read": true,
        ".write": "auth != null && (!data.exists() || data.child('dono').val() === auth.uid)",
        ".validate": "newData.hasChildren(['dono']) && newData.child('dono').val() === auth.uid"
      }
    }
  }
}
```

- `ao_vivo/<codigo>`: qualquer pessoa com o link lê; só o dono grava ou apaga. Não há leitura em `ao_vivo` como um todo, então ninguém consegue listar os códigos.
- O código tem 8 letras/números sorteados (cerca de 1 trilhão de combinações).


## Suporte (Falar com o suporte + Caixa do suporte) e rachas

1. No Realtime Database, crie `configuracoes/admin_email` com o **e-mail da sua conta** (em minúsculas). Só esse e-mail enxerga a "Caixa do suporte" no menu.
2. Acrescente o nó `suporte` nas regras (mantenha os nós que já existem):

```json
"suporte": {
  ".read": "auth != null && auth.token.email === root.child('configuracoes/admin_email').val()",
  "$id": {
    ".write": "auth != null && ((!data.exists() && newData.child('uid').val() === auth.uid) || auth.token.email === root.child('configuracoes/admin_email').val())",
    ".validate": "newData.hasChildren(['texto', 'em', 'uid'])"
  }
}
```

- Qualquer usuário logado envia mensagem; só o administrador lê e marca como resolvido.
- Os perfis de racha ficam dentro de `usuarios/<uid>/rachas/<idDoRacha>/...` (mesma regra de `usuarios`, nada a mudar). O "Racha principal" continua nos caminhos de antes (`usuarios/<uid>/jogadores`, `historico`...), então nenhum dado antigo é perdido.


---

## Métricas (painel "📊 Métricas do app") e convite do placar ao vivo

O app conta, por dia, eventos anônimos (sorteios, imagens enviadas, visitas ao placar ao vivo,
cliques em "Criar meu racha", quem abriu a tela do Pro, quem clicou em Assinar...). Só o e-mail de
`configuracoes/admin_email` enxerga o painel (menu lateral → **Métricas do app**).

Acrescente estes nós nas regras (mantenha os que já existem):

```json
"metricas": {
  ".read": "auth != null && auth.token.email === root.child('configuracoes/admin_email').val()",
  "$dia": {
    "$evento": {
      ".write": "$dia.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && $evento.matches(/^[a-z_]{1,40}$/)",
      ".validate": "newData.isNumber() && newData.val() === (data.exists() ? data.val() : 0) + 1"
    }
  }
},
"metricas_ativos": {
  ".read": "auth != null && auth.token.email === root.child('configuracoes/admin_email').val()",
  "$dia": {
    "$uid": {
      ".write": "auth != null && auth.uid === $uid",
      ".validate": "newData.val() === true"
    }
  }
}
```

- Cada gravação só consegue somar **+1** (ninguém consegue zerar ou inflar de uma vez).
- `metricas` aceita escrita sem login porque a página pública `ao-vivo.html` também conta visitas.
- Sem essas regras o app funciona normalmente; só o painel fica vazio.

### Link do botão "Criar meu racha grátis" (página do placar ao vivo)
Crie `configuracoes/divulgacao/link` com o link da Play Store (ou do app web).
Sem esse nó, o botão abre o `index.html` do mesmo site.

### Como ler o funil
`Sorteios → Imagens enviadas → Visitas ao placar → Cliques em Criar meu racha → Cadastros`
mostra se o app está se espalhando sozinho. `Bateram no limite → Abriram o Pro → Clicaram em Assinar`
mostra onde a venda trava.

---

## Lista de presença por link (`presenca.html?c=CODIGO`)

Na aba **Sorteio**, "📲 Criar lista e enviar no grupo" gera um link. Cada jogador abre, digita o próprio nome e
responde **Vou** ou **Não vou**, sem login. Quem não está no elenco pode "pedir para entrar". O app do organizador
escuta as respostas e marca a presença sozinho; se houver limite de vagas na linha, quem confirmou depois vai para a
lista de espera (goleiros não ocupam vaga).

Acrescente este nó nas regras (mantenha os que já existem):

```json
"presenca": {
  "$codigo": {
    ".read": true,
    ".write": "auth != null && (!data.exists() || data.child('dono').val() === auth.uid)",
    "dono": { ".validate": "newData.val() === auth.uid" },
    "aberta": { ".validate": "newData.isBoolean()" },
    "limite": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200" },
    "pagos": { "$id": { ".validate": "newData.val() === true" } },
    "respostas": {
      "$id": {
        ".write": "root.child('presenca/' + $codigo + '/aberta').val() === true || (auth != null && root.child('presenca/' + $codigo + '/dono').val() === auth.uid)",
        ".validate": "newData.hasChildren(['status', 'em']) && $id.matches(/^[A-Za-z0-9_-]{1,40}$/)",
        "status": { ".validate": "newData.val() === 'vou' || newData.val() === 'nao'" },
        "em": { ".validate": "newData.isNumber()" },
        "nome": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
        "convidado": { ".validate": "newData.isBoolean()" },
        "goleiro": { ".validate": "newData.isBoolean()" },
        "removido": { ".validate": "newData.isBoolean()" },
        "paguei": { ".validate": "newData.isNumber()" },
        "$outro": { ".validate": false }
      }
    }
  }
}
```

- Só o dono (organizador logado) cria, fecha, reabre, ajusta ou apaga a lista, mexe nos nomes e marca quem **pagou**
  (`pagos/<id>`). Pela página o jogador só consegue **avisar** "Já paguei" (`respostas/<id>/paguei`): ele fica
  "🕐 pagou (a confirmar)" até o organizador conferir e tocar em **Confirmar**. Quem avisou que pagou não entra no
  "Tirar quem não pagou" (o organizador confere antes).
- **Vagas:** o organizador escolhe quantos times e quantos de linha por time (ex.: 4 x 4 = 16 na linha + 4 goleiros,
  1 por time, igual ao sorteio). Passou disso, vira **suplente**, em ordem de confirmação. Se tiver menos goleiros que
  times, tudo bem (o sorteio já reparte os goleiros do Time 1 para baixo).
- **Desistência / falta de pagamento:** o organizador toca no ✕ ao lado do nome (ou em "Tirar quem não pagou" depois
  do prazo) e o primeiro suplente sobe sozinho. A pessoa vê "O organizador tirou você da lista"; se confirmar de novo,
  volta para o fim da fila de suplentes.
- Qualquer pessoa com o link responde, mas só enquanto a lista estiver **aberta**. "Fechar lista" congela as respostas.
- Não dá para listar todas as listas (não há leitura em `presenca` inteiro); o código tem 8 caracteres sorteados.
- A página pública mostra **só os nomes** dos jogadores, nunca as estrelas.
- **Pix copia e cola** (`presenca/<codigo>/pix` = chave, nome, cidade, valor): só o dono grava (já coberto pela regra
  de escrita do `$codigo`, nada novo a publicar). A chave fica visível para quem tem o link, como quando o organizador
  manda a chave no grupo.
- Limitação conhecida: como não há login na página, alguém com o link poderia responder no lugar de outro.
  Para um grupo de pelada isso é aceitável; se virar problema, dá para exigir login anônimo do Firebase.
