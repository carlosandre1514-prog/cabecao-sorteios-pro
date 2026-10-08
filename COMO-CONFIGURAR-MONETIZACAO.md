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
