# APK do Cabeção Sorteios Pro (Android)

O APK é um app Android que abre o Cabeção Sorteios Pro direto do site (GitHub Pages), em tela cheia.

- **Atualiza sozinho** junto com o site: mudou o app no GitHub, o celular recebe na próxima abertura.
- **Funciona sem internet** depois da primeira abertura (sinal ruim na quadra).
- Compartilhar (imagem dos times, resumo, lista) abre o compartilhar do Android, e links de WhatsApp,
  pagamento e e-mail abrem no app certo.
- **Login com Google não funciona dentro do APK** (o Google bloqueia login em apps desse tipo). No APK
  a pessoa entra com e-mail e senha. Quem criou a conta pelo Google digita o mesmo e-mail e toca em
  "Esqueci minha senha" para criar uma senha. No site, o Google continua funcionando.

Só é preciso gerar um APK novo quando mudar algo da pasta `android/` ou a versão em `versao.json`.

## Baixar o APK

GitHub → repositório → **Releases** (na página inicial do repositório, à direita ou embaixo) →
o mais recente → toque no arquivo `cabecao-sorteios-pro-X.Y.Z.apk`.

Para gerar de novo na hora: **Actions → APK do app → Run workflow**.

## Chave de assinatura (fazer uma vez)

O Android só instala uma versão nova **por cima** da antiga se as duas tiverem a mesma assinatura.
Por isso a chave fica guardada nos **segredos** do repositório (não aparece para ninguém):

1. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**.
2. Crie `ANDROID_KEYSTORE_B64` com o conteúdo do arquivo `ANDROID_KEYSTORE_B64.txt` (texto comprido).
3. Crie `ANDROID_KEYSTORE_SENHA` com o conteúdo de `ANDROID_KEYSTORE_SENHA.txt`.
4. Rode **Actions → APK do app → Run workflow**. Na release aparece "Assinatura: oficial".

Guarde os dois arquivos num lugar seguro (por exemplo, no seu Google Drive). **Se perder a chave,
os próximos APKs não instalam por cima**: cada pessoa teria que desinstalar e instalar de novo.

Sem os segredos o workflow usa uma chave provisória: o APK instala, mas não atualiza por cima.

## Play Store (se um dia quiser)

Para a Play Store é preciso uma conta de desenvolvedor do Google (taxa única) e gerar um AAB em vez de
APK. Lá o Google pode exigir o pagamento dele para assinaturas vendidas dentro do app.
