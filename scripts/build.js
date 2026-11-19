#!/usr/bin/env node
// =====================================================================
// build.js — monta o app e carimba a versão (sem dependências).
//
//   npm run build           junta src/app/*.js em js/app.js e atualiza as versões
//   npm run build -- --check só confere se está tudo montado e carimbado (usado nos testes)
//
// Versões:
//   versao.json "app"  -> VERSAO_ATUAL_APP em js/remoto.js (o que o usuário vê / bloqueio remoto)
//   hash do conteúdo   -> ?v=... nos HTML e VERSAO no sw.js (força o celular a baixar o que mudou)
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const escrever = (f, s) => fs.writeFileSync(path.join(RAIZ, f), s);
const conferir = process.argv.includes('--check');
const problemas = [];

// 1) js/app.js = src/app/*.js em ordem
const CABECALHO = '// ARQUIVO MONTADO por scripts/build.js — edite os arquivos em src/app/ e rode "npm run build".\n';
const partes = fs.readdirSync(path.join(RAIZ, 'src/app')).filter(f => f.endsWith('.js')).sort();
const app = CABECALHO + partes.map(f => ler('src/app/' + f)).join('');
if (ler('js/app.js') !== app) {
    if (conferir) problemas.push('js/app.js está diferente de src/app/ (rode npm run build)');
    else escrever('js/app.js', app);
}

// 2) versão do app (remoto.js)
const versaoApp = JSON.parse(ler('versao.json')).app;
const remoto = ler('js/remoto.js').replace(/const VERSAO_ATUAL_APP = "[^"]*";/, `const VERSAO_ATUAL_APP = "${versaoApp}";`);
if (remoto !== ler('js/remoto.js')) { if (conferir) problemas.push('VERSAO_ATUAL_APP diferente de versao.json'); else escrever('js/remoto.js', remoto); }

// 3) versão dos arquivos: hash do que o celular baixa (sem os próprios carimbos)
const HTML = ['index.html', 'ao-vivo.html', 'presenca.html', 'conheca.html'];
const RE_V = /\?v=[0-9a-z]+/g;
const RE_SW = /const VERSAO = '[^']*';/;
const listar = dir => fs.readdirSync(path.join(RAIZ, dir)).filter(f => /\.(js|css)$/.test(f)).sort().map(f => dir + '/' + f);
const arquivos = [...listar('js'), ...listar('js/vendor'), ...listar('css'), 'manifest.json'];
const h = crypto.createHash('sha1');
arquivos.forEach(f => h.update(f + '\0' + ler(f).replace(/const VERSAO_ATUAL_APP = "[^"]*";/, '')));
HTML.forEach(f => h.update(f + '\0' + ler(f).replace(RE_V, '?v=')));
h.update('sw\0' + ler('sw.js').replace(RE_SW, ''));
const versao = h.digest('hex').slice(0, 10);

HTML.forEach(f => {
    const novo = ler(f).replace(RE_V, '?v=' + versao);
    if (novo !== ler(f)) { if (conferir) problemas.push(f + ' com versão antiga (rode npm run build)'); else escrever(f, novo); }
});
const sw = ler('sw.js').replace(RE_SW, `const VERSAO = '${versao}';`);
if (sw !== ler('sw.js')) { if (conferir) problemas.push('sw.js com versão antiga (rode npm run build)'); else escrever('sw.js', sw); }

if (conferir) {
    if (problemas.length) { console.error('❌ ' + problemas.join('\n❌ ')); process.exit(1); }
    console.log('✅ build em dia (versão dos arquivos ' + versao + ', app ' + versaoApp + ')');
} else {
    console.log(`Montado: js/app.js (${partes.length} partes) · versão dos arquivos ${versao} · app ${versaoApp}`);
}
