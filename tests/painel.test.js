// Testa js/painel.js (painel de métricas) num ambiente falso: fila, lotes, usuário anônimo -> uid, saiu,
// filtro de dados pessoais, rede caindo e chave recusada. Nada é enviado de verdade.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let falhas = 0, total = 0;
function ok(cond, msg) { total++; if (cond) console.log('✅ ' + msg); else { falhas++; console.log('❌ ' + msg); } }

function ambiente({ chave = 'pnl_teste', respostas = [], ua = 'Mozilla/5.0 (Linux; Android 14)', guardado = {} } = {}) {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'js', 'painel.js'), 'utf8')
        .replace(/const CHAVE = '[^']*';/, `const CHAVE = '${chave}';`);
    const pedidos = [], ouvintes = {}, timers = [];
    const ls = { ...guardado };
    const doc = { hidden: false, addEventListener: (t, f) => { (ouvintes['doc:' + t] = ouvintes['doc:' + t] || []).push(f); } };
    const win = { addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); } };
    const ctx = {
        window: win, document: doc, location: { pathname: '/cabecao-sorteios-pro/presenca.html' },
        navigator: { userAgent: ua, onLine: true, platform: 'Linux' },
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        setTimeout: (f, ms) => { timers.push({ f, ms, rep: false }); }, setInterval: (f, ms) => { timers.push({ f, ms, rep: true }); },
        fetch: async (url, op) => {
            pedidos.push({ url, op, corpo: JSON.parse(op.body) });
            const r = respostas.length ? respostas.shift() : 200;
            if (r === 'rede') throw new Error('sem rede');
            return { status: r, ok: r < 300 };
        },
        Date, Math, JSON, String, Number, Object, Array, Error, RegExp, Promise,
    };
    vm.createContext(ctx);
    vm.runInContext(fonte, ctx);
    const P = win.Painel;
    const disparar = (t, e = {}) => (ouvintes[t] || []).forEach(f => f(e));
    const esperar = () => new Promise(r => setImmediate(r));
    const enviar = async () => { await P.enviar(); await esperar(); };
    return { P, pedidos, ls, doc, disparar, enviar, timers };
}

(async () => {
    // 1) primeira vez no aparelho
    let a = ambiente();
    await a.enviar();
    let c = a.pedidos[0] && a.pedidos[0].corpo;
    ok(a.pedidos.length === 1 && a.pedidos[0].url.endsWith('/rpc/painel_enviar'), 'manda para painel_enviar');
    ok(a.pedidos[0].op.headers.apikey && a.pedidos[0].op.headers['Content-Type'] === 'application/json', 'cabeçalhos apikey e Content-Type');
    ok(c.chave === 'pnl_teste', 'corpo leva a chave');
    ok(c.eventos.map(e => e.tipo).join(',') === 'instalar,abrir', 'primeira vez: instalar e abrir');
    ok(/^anon_/.test(c.eventos[0].usuario), 'antes do login: id anônimo do aparelho');
    ok(c.eventos[1].dados.icone.startsWith('https://') && c.eventos[1].dados.pagina === 'presenca', 'abrir leva o ícone público e a página');
    ok(c.eventos[0].plataforma === 'Android', 'plataforma Android');
    ok(a.timers.some(t => t.rep && t.ms === 60000) && a.timers.some(t => t.rep && t.ms === 2000), 'ping a cada 60 s e lote a cada 2 s');

    // 2) segunda vez: não repete instalar; login troca o usuário; nome de exibição
    a = ambiente({ guardado: { painel_instalado: '1', painel_aparelho: 'anon_x' }, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
    a.P.usuario('uid123'); a.P.nome('Carlos');
    a.P.ev('login', { metodo: 'google', email: 'a@b.com', senha: 'x', chave_pix: '123' });
    await a.enviar();
    c = a.pedidos[0].corpo;
    ok(!c.eventos.some(e => e.tipo === 'instalar'), 'segunda vez: sem instalar');
    ok(c.eventos.every(e => e.usuario === 'uid123' && e.nome === 'Carlos'), 'depois do login: uid e nome de exibição');
    const login = c.eventos.find(e => e.tipo === 'login');
    ok(login && login.dados.metodo === 'google' && !('email' in login.dados) && !('senha' in login.dados) && !('chave_pix' in login.dados), 'login com método, sem e-mail, senha ou Pix');
    ok(c.eventos[0].plataforma === 'iOS', 'plataforma iOS');

    // 3) assinatura liberada pelo admin vai com o uid de quem recebeu
    a.P.ev('assinatura', { plano: 'anual', valor: 59.9, status: 'ativa' }, { usuario: 'outro' });
    await a.enviar();
    const ass = a.pedidos[1].corpo.eventos[0];
    ok(ass.usuario === 'outro' && ass.dados.valor === 59.9 && !ass.nome, 'assinatura com o uid de quem recebeu e valor em número');

    // 4) minimizou: saiu na hora; voltou: ping
    a.doc.hidden = true; a.disparar('doc:visibilitychange'); await a.esperar?.();
    await new Promise(r => setImmediate(r));
    ok(a.pedidos.at(-1).corpo.eventos.some(e => e.tipo === 'saiu'), 'minimizou: manda "saiu" na hora');
    ok(a.pedidos.at(-1).op.keepalive === true, 'saiu usa keepalive (termina de mandar mesmo fechando)');
    a.doc.hidden = false; a.disparar('doc:visibilitychange');
    ok(a.P._fila.some(e => e.tipo === 'ping'), 'voltou: ping (online de novo)');

    // 5) erro não tratado vira evento
    a.disparar('error', { message: 'x is not defined', filename: 'https://site/js/app.js?v=1', lineno: 10 });
    const er = a.P._fila.find(e => e.tipo === 'erro');
    ok(er && er.dados.mensagem === 'x is not defined' && er.dados.onde === 'app.js:10', 'erro não tratado vira evento "erro"');

    // 6) rede caiu: o lote volta para a fila; 401 desliga
    a = ambiente({ respostas: ['rede', 200] });
    await a.enviar();
    ok(a.P._fila.length === 2, 'sem rede: os eventos voltam para a fila');
    await a.enviar();
    ok(a.P._fila.length === 0 && a.pedidos.length === 2, 'na próxima tentativa sai tudo');
    a = ambiente({ respostas: [401] });
    await a.enviar();
    a.P.ev('sorteio', {}); await a.enviar();
    ok(a.pedidos.length === 1 && a.P._fila.length === 0, 'chave recusada (401): para de enviar e não acumula');

    // 7) lotes de até 200
    a = ambiente({ guardado: { painel_instalado: '1' } });
    for (let i = 0; i < 450; i++) a.P.ev('sorteio', { i });
    await a.enviar();
    ok(a.pedidos[0].corpo.eventos.length === 200, 'no máximo 200 eventos por envio');

    // 8) sem chave: desligado, nada é enviado
    a = ambiente({ chave: '' });
    a.P.ev('sorteio', {}); await a.enviar();
    ok(a.pedidos.length === 0, 'sem chave: não envia nada');

    console.log(`\n${total - falhas}/${total} testes do painel passaram.`);
    if (falhas) process.exit(1);
})();
