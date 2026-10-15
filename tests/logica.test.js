// Rode com:  node tests/logica.test.js
const assert = require('assert');
const L = require('../js/logica.js');
let ok = 0;
function t(nome, fn) { try { fn(); ok++; console.log('✅', nome); } catch (e) { console.log('❌', nome, '\n   ', e.message); process.exitCode = 1; } }

const mk = (n, est, gk) => ({ id: n, nome: 'J' + n, isGoleiro: !!gk, estrelas: est, presente: true });

t('sorteio: usa as estrelas (times com soma parecida)', () => {
    const js = [];
    for (let i = 1; i <= 18; i++) js.push(mk(i, [1, 2, 3, 4, 5][i % 5]));
    for (let k = 0; k < 50; k++) {
        const { times } = L.sortearTimes(js, 3, 6);
        const somas = times.map(t => t.somaEstrelas);
        assert.ok(Math.max(...somas) - Math.min(...somas) <= 3, 'diferença grande: ' + somas);
    }
});

t('sorteio: sem reservas — times cheios e o ÚLTIMO time fica quebrado', () => {
    const q = (n, T, P) => L.sortearTimes(Array.from({ length: n }, (_, i) => mk(i + 1, 3)), T, P).times.map(t => t.jogadores.length);
    assert.deepStrictEqual(q(14, 3, 6), [6, 6, 2]);
    assert.deepStrictEqual(q(18, 3, 6), [6, 6, 6]);
    assert.deepStrictEqual(q(20, 3, 6), [6, 6, 6, 2]);   // sobrou gente: nasce um time extra
    assert.deepStrictEqual(q(10, 3, 6), [6, 4]);         // não cria time vazio
    assert.strictEqual(L.sortearTimes([mk(1, 3)], 2, 6).reservas.length, 0);
});

t('sorteio (exemplo do Carlos): 4 times de 4 de linha, 3 goleiros e 14 de linha', () => {
    const js = [mk(101, 3, true), mk(102, 3, true), mk(103, 3, true)];
    for (let i = 1; i <= 14; i++) js.push(mk(i, (i % 5) + 1));
    const { times, reservas } = L.sortearTimes(js, 4, 4);
    const linha = times.map(t => t.jogadores.filter(j => !j.isGoleiro).length);
    assert.deepStrictEqual(linha, [4, 4, 4, 2]);                       // último time quebrado
    assert.deepStrictEqual(times.map(t => t.temGoleiro), [true, true, true, false]); // time 4 sem goleiro
    assert.strictEqual(reservas.length, 0);
    // o goleiro do Time 1 é sorteado: não é sempre o mesmo
    const quem = new Set();
    for (let k = 0; k < 60; k++) quem.add(L.sortearTimes(js, 4, 4).times[0].jogadores[0].id);
    assert.ok(quem.size >= 2, 'goleiro do Time 1 deveria variar');
});

t('sorteio: goleiro extra (mais goleiros que times) joga na linha', () => {
    const js = [mk(1, 3, true), mk(2, 3, true), mk(3, 3, true)];
    for (let i = 4; i <= 15; i++) js.push(mk(i, 3));
    const { times } = L.sortearTimes(js, 2, 8);
    times.forEach(t => assert.ok(t.temGoleiro));
    assert.strictEqual(times.flatMap(t => t.jogadores).length, 15);
});

t('sorteio: ninguém é perdido nem duplicado', () => {
    const js = Array.from({ length: 23 }, (_, i) => mk(i + 1, (i % 5) + 1, i < 2));
    const { times } = L.sortearTimes(js, 4, 5);
    const ids = times.flatMap(t => t.jogadores).map(j => j.id).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, js.map(j => j.id));
});

t('classificação: gols do Time B NÃO são contados em dobro (bug antigo)', () => {
    const times = [{ id: 1, nome: 'Time 1' }, { id: 2, nome: 'Time 2' }];
    const cl = L.novaClassificacao(times);
    L.aplicarResultado(cl, 1, 2, 1, 3, 0, 0);
    assert.strictEqual(cl[2].gp, 3);
    assert.strictEqual(cl[2].sg, 2);
    assert.strictEqual(cl[1].sg, -2);
    assert.strictEqual(cl[2].p, 3);
});

t('classificação: empate com pênaltis dá vitória a quem ganhou nos pênaltis', () => {
    const cl = L.novaClassificacao([{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }]);
    assert.strictEqual(L.aplicarResultado(cl, 1, 2, 2, 2, 3, 5), 'B');
    assert.strictEqual(cl[2].p, 3);
});

t('classificação: empate sem pênaltis (racha) dá 1 ponto cada', () => {
    const cl = L.novaClassificacao([{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }]);
    assert.strictEqual(L.aplicarResultado(cl, 1, 2, 1, 1, 0, 0), null);
    assert.strictEqual(cl[1].p, 1); assert.strictEqual(cl[2].e, 1);
});

t('tabela: número de jogos = n(n-1)/2 e ninguém joga contra si', () => {
    [2, 3, 4, 5, 6, 8].forEach(n => {
        const times = Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: 'T' + (i + 1) }));
        const ps = L.gerarPartidas(times);
        assert.strictEqual(ps.length, n * (n - 1) / 2, 'n=' + n);
        const pares = new Set(ps.map(p => [p.timeA.id, p.timeB.id].sort().join('-')));
        assert.strictEqual(pares.size, ps.length);
        ps.forEach(p => assert.notStrictEqual(p.timeA.id, p.timeB.id));
    });
});

t('firebase: classificação que volta como ARRAY [null,{..}] vira objeto limpo', () => {
    const vindoDoFirebase = [null, { nome: 'Time 1', p: 3 }, { nome: 'Time 2', p: 0 }];
    const m = L.limparMapa(vindoDoFirebase);
    assert.deepStrictEqual(Object.keys(m), ['1', '2']);
    assert.strictEqual(L.ordenarClassificacao(Object.values(m))[0].nome, 'Time 1');
    // e o histórico antigo (com null) também não quebra mais:
    assert.doesNotThrow(() => L.ordenarClassificacao(vindoDoFirebase));
});

t('firebase: time sem `jogadores` (array vazio some lá) é normalizado', () => {
    assert.deepStrictEqual(L.normalizarTime({ id: 1, nome: 'T' }).jogadores, []);
});

t('firebase: chaves proibidas (. # $ [ ] /) são trocadas', () => {
    const k = L.chaveSegura('Zé Jr. [10]/#1$');
    assert.ok(!/[.#$\[\]\/]/.test(k), k);
});

t('lote: não descarta "Pixote" nem "Chaves", mas descarta linhas de Pix/pagamento', () => {
    const r = L.filtrarLinhasLote('1. Pixote\n2. Chaves\n3 - Carlos\nPIX: 11999\nValor: R$ 20\nhttps://x.com\n\n4) Rachel');
    assert.deepStrictEqual(r.nomes, ['Pixote', 'Chaves', 'Carlos', 'Rachel']);
    assert.strictEqual(r.ignoradas.length, 3);
});

t('versões: comparação', () => {
    assert.strictEqual(L.compararVersoes('1.1.0', '1.2.0'), -1);
    assert.strictEqual(L.compararVersoes('1.10.0', '1.2.0'), 1);
    assert.strictEqual(L.compararVersoes('1.1', '1.1.0'), 0);
});

console.log(`\n${ok} testes passaram.`);
