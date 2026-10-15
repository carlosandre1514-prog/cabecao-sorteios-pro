// Teste de fumaça: roda js/*.js com um "navegador falso" (sem tela) e simula
// login + dados vindos do Firebase no formato problemático (arrays com null).
// Rode com:  node tests/fumaca.test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const raiz = path.join(__dirname, '..');

class El {
    constructor(id) { this.id = id; this.listeners = {}; this.children = []; this.value = ''; this.textContent = ''; this.innerHTML = '';
        this.style = {}; this.dataset = {}; this.checked = false; this.parentNode = { insertBefore() {}, appendChild() {} };
        const set = new Set(['hidden']); this.classList = { add: c => set.add(c), remove: c => set.delete(c), toggle: (c, forcar) => ((forcar === undefined ? !set.has(c) : forcar) ? (set.add(c), true) : (set.delete(c), false)), contains: c => set.has(c) }; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
    appendChild(c) { this.children.push(c); return c; } insertBefore(c) { this.children.push(c); return c; } append() {}
    remove() {} focus() {} select() {} click() { this.fire('click'); } closest() { return null; }
    querySelector(sel) { return new El(sel); } querySelectorAll() { return []; } setAttribute() {} getAttribute() { return null; }
    fire(t, extra) { (this.listeners[t] || []).slice().forEach(f => f(Object.assign({ target: this, preventDefault() {} }, extra))); }
}
const els = {};
const document = {
    readyState: 'loading', body: new El('body'), listeners: {},
    getElementById: id => els[id] || (els[id] = new El(id)),
    createElement: t => new El(t), querySelector: s => new El(s), querySelectorAll: () => [],
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, hidden: false, execCommand() {}
};
const alertas = [];
const win = { listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, dispatchEvent(e) { (this.listeners[e.type] || []).forEach(f => f(e)); }, open() {}, scrollTo() {} };
const ctx = vm.createContext(Object.assign(win, {
    window: win, document, self: win, console: { log() {}, error() {}, warn() {} }, setInterval: () => 0, clearInterval() {}, setTimeout: f => { setImmediate(f); return 0; }, history: { replaceState() {}, pushState() {} }, location: { pathname: '/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {}, Event: class { constructor(t) { this.type = t; } },
    Date, Math, JSON, Object, Array, Number, String, Set, Promise, parseInt, parseFloat, isFinite, Infinity, encodeURIComponent
}));
const rodar = f => vm.runInContext(fs.readFileSync(path.join(raiz, f), 'utf8'), ctx, { filename: f });

// ---- "Firebase" falso: o banco devolve classificação como ARRAY com null (comportamento real) ----
const time = (id, js) => ({ id, nome: 'Time ' + id, jogadores: js });
const banco = {
    jogadores: [{ id: 1, nome: 'Ana', estrelas: 4, isGoleiro: false, presente: true }, { id: 2, nome: 'Bia', estrelas: 2, isGoleiro: true, presente: true }],
    historico: [{ id: 9, data: '01/01/2026', modo: 'todos-contra-todos', classificacao: [null, { nome: 'Time 1', p: 6, sg: 3, gp: 5 }, { nome: 'Time 2', p: 0, sg: -3, gp: 2 }], artilharia: { Ana: 2 } }],
    campeonatoAtivo: {
        modoJogoAtual: 'todos-contra-todos', partidaAtualIndex: 0,
        timesSorteados: [time(1, [{ id: 1, nome: 'Ana', estrelas: 4 }]), { id: 2, nome: 'Time 2' /* jogadores sumiu */ }],
        classificacao: [null, { nome: 'Time 1', p: 3, j: 1, v: 1, e: 0, d: 0, gp: 2, sg: 2 }, { nome: 'Time 2', p: 0, j: 1, v: 0, e: 0, d: 1, gp: 0, sg: -2 }],
        partidas: [{ idPartida: 1, rodada: 1, timeA: time(1, [{ id: 1, nome: 'Ana' }]), timeB: { id: 2, nome: 'Time 2' }, finalizada: false }]
    }
};
const gravados = [];
const authCbs = [];
let falhasGet = 0;      // quantas leituras do banco vão falhar antes de funcionar ("Client is offline")
let loginErro = null;   // erro que o signIn vai devolver
win.firebaseAuth = {};
win.firebaseDb = {};
win.firebaseFns = {
    onAuthStateChanged: (a, cb) => { authCbs.push(cb); },
    ref: (db, caminho) => caminho,
    signInWithEmailAndPassword: () => loginErro ? Promise.reject(loginErro) : Promise.resolve({}),
    get: caminho => falhasGet-- > 0 ? Promise.reject(Object.assign(new Error('Client is offline'), { code: 'unavailable' })) : Promise.resolve({ exists: () => true, val: () => JSON.parse(JSON.stringify(banco[caminho.split('/').pop()] ? banco[caminho.split('/').pop()] : banco)) }),
    set: (caminho, v) => { gravados.push([caminho, v]); return Promise.resolve(); }
};
win.firebaseReady = true;

['js/logica.js', 'js/remoto.js', 'js/auth.js', 'js/app.js', 'js/monetizacao.js'].forEach(rodar);
(document.listeners.DOMContentLoaded || []).forEach(f => f());
assert.ok(authCbs.length >= 1, 'app.js deveria registrar o monitor de sessão (antes dependia de um setTimeout de 500ms)');

(async () => {
    // login
    authCbs.forEach(cb => cb({ uid: 'u1', email: 'a@b.com' }));
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    assert.ok(els['auth-screen'].classList.contains('hidden'), 'tela de login deveria esconder');
    assert.ok(els['body-classificacao'].children.some(c => c.innerHTML.includes('Time 1')), 'tabela deveria renderizar mesmo com array/null vindo do Firebase');
    assert.ok(els['container-historico'].innerHTML.includes('Time 1'), 'histórico deveria renderizar o campeão (antes quebrava com null)');
    console.log('✅ login + carregamento com dados no formato problemático do Firebase');

    // 1ª leitura do banco falha (ainda conectando) → tenta de novo sozinho, sem abrir erro na tela
    const tick = async n => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
    authCbs.forEach(cb => cb(null));
    falhasGet = 2;
    authCbs.forEach(cb => cb({ uid: 'u2', email: 'c@d.com' }));
    await tick(30);
    assert.ok(els['modal-alerta-custom'].classList.contains('hidden'), 'não pode aparecer erro quando a leitura funciona na 3ª tentativa');
    assert.ok(els['carregando-dados'].classList.contains('hidden'), 'a tela "carregando" deve sumir');
    assert.ok(els['body-classificacao'].children.length > 0, 'dados deveriam carregar após as tentativas');
    console.log('✅ banco conectando devagar: o app tenta de novo sozinho e não mostra erro');

    // senha errada → erro dentro do formulário, sem pop-up
    authCbs.forEach(cb => cb(null));
    document.getElementById('auth-email').value = 'a@b.com'; document.getElementById('auth-password').value = '123456';
    loginErro = { code: 'auth/invalid-credential' };
    els['auth-form'].fire('submit');
    await tick(10);
    assert.ok(els['auth-aviso'].textContent.includes('incorretos') && !els['auth-aviso'].classList.contains('hidden'), 'erro deveria aparecer no formulário');
    assert.ok(els['modal-alerta-custom'].classList.contains('hidden'), 'login errado não deve abrir pop-up');
    assert.strictEqual(els['btn-auth-action'].disabled, false, 'botão deve voltar a funcionar depois do erro');
    loginErro = null;
    authCbs.forEach(cb => cb({ uid: 'u1', email: 'a@b.com' }));
    await tick(10);
    console.log('✅ login com erro: mensagem no formulário, sem pop-up, botão volta ao normal');

    // salvar jogador → grava
    document.getElementById('novo-nome').value = 'Caio';
    els['btn-add-jogador'].fire('click');
    await new Promise(r => setImmediate(r));
    assert.ok(gravados.some(([c, v]) => c.endsWith('/jogadores') && v.some(j => j.nome === 'Caio')), 'deveria salvar jogadores');
    console.log('✅ cadastrar jogador salva no caminho certo');

    // sorteio
    document.getElementById('qtd-times').value = '2'; document.getElementById('qtd-por-time').value = '6';
    els['btn-sortear'].fire('click');
    await new Promise(r => setImmediate(r));
    assert.ok(els['times-sorteados-container'].children.length >= 2, 'sorteio deveria desenhar os times');
    console.log('✅ sorteio roda e desenha os times');

    // logout limpa estado e não grava lixo
    const antes = gravados.length;
    authCbs.forEach(cb => cb(null));
    els['btn-add-jogador'].fire('click');
    assert.strictEqual(gravados.length, antes, 'sem usuário não pode gravar');
    console.log('✅ logout limpa o estado e não grava nada');
    console.log('\nFumaça OK');
})().catch(e => { console.log('❌', e.stack || e.message); process.exit(1); });
