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

t('ao vivo: retrato público só tem nomes/placares e vem ordenado', () => {
    const times = [{ id: 1, nome: 'Time 1', jogadores: [mk(1, 3), mk(2, 3)] }, { id: 2, nome: 'Time 2', jogadores: [mk(3, 3)] }];
    const cl = L.novaClassificacao(times);
    L.aplicarResultado(cl, 1, 2, 0, 2, 0, 0);
    const partidas = [
        { rodada: 1, timeA: times[0], timeB: times[1], golsA: 0, golsB: 2, penaltisA: 0, penaltisB: 0, finalizada: true },
        { rodada: 2, timeA: times[1], timeB: times[0], golsA: 0, golsB: 0, penaltisA: 0, penaltisB: 0, finalizada: false }
    ];
    const s = L.montarAoVivo({ modo: 'todos-contra-todos', times, classificacao: cl, partidas, partidaAtualIndex: 1, artilharia: { Ana: 1, Bia: 2 } }, 'uid1', 123, false);
    assert.strictEqual(s.classificacao[0].nome, 'Time 2');            // líder primeiro
    assert.deepStrictEqual(s.jogos, [{ r: 1, a: 'Time 1', b: 'Time 2', ga: 0, gb: 2, pa: 0, pb: 0 }]);
    assert.deepStrictEqual(s.proxima, { a: 'Time 2', b: 'Time 1', r: 2, ga: 0, gb: 0 });
    assert.deepStrictEqual(s.artilharia[0], { nome: 'Bia', gols: 2 });
    assert.deepStrictEqual(s.times[0].jogadores.length, 2);
    assert.strictEqual(s.encerrado, false);
    assert.ok(!JSON.stringify(s).includes('@'), 'não pode vazar e-mail');
});

t('ao vivo: o cronômetro vai junto no retrato (e some se não houver)', () => {
    const times = [{ id: 1, nome: 'A', jogadores: [] }, { id: 2, nome: 'B', jogadores: [] }];
    const cron = { estado: 'rodando', total: 600, restante: 540, fimEm: 999 };
    const com = L.montarAoVivo({ modo: 'todos-contra-todos', times, classificacao: L.novaClassificacao(times), partidas: [], partidaAtualIndex: 0, cron }, 'u', 1, false);
    assert.deepStrictEqual(com.cron, cron);
    const sem = L.montarAoVivo({ modo: 'todos-contra-todos', times, classificacao: L.novaClassificacao(times), partidas: [], partidaAtualIndex: 0 }, 'u', 1, false);
    assert.strictEqual(sem.cron, null);
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

t('ordem dos confrontos com 4 times: 1x2,3x4 | 1x3,2x4 | 1x4,2x3', () => {
    const times = [1, 2, 3, 4].map(id => ({ id, nome: 'T' + id }));
    const ordem = L.gerarPartidas(times).map(p => p.timeA.id + 'x' + p.timeB.id);
    assert.deepStrictEqual(ordem, ['1x2', '3x4', '1x3', '2x4', '1x4', '2x3']);
});

t('desempate: pontos, depois menos gols sofridos, depois saldo', () => {
    const o = L.ordenarClassificacao([
        { nome: 'A', p: 3, gp: 5, sg: 1 },   // gc 4
        { nome: 'B', p: 3, gp: 3, sg: 1 },   // gc 2
        { nome: 'C', p: 6, gp: 1, sg: 0 }    // gc 1
    ]);
    assert.deepStrictEqual(o.map(x => x.nome), ['C', 'B', 'A']);
});

t('estrelas: aceita vírgula, decimais de 0,1 e limita entre 0,1 e 5', () => {
    assert.strictEqual(L.normalizarEstrelas('1,7'), 1.7);
    assert.strictEqual(L.normalizarEstrelas('2'), 2);
    assert.strictEqual(L.normalizarEstrelas(9), 5);
    assert.strictEqual(L.normalizarEstrelas(0), 0.1);
    assert.strictEqual(L.normalizarEstrelas('abc', 3), 3);
    assert.strictEqual(L.normalizarEstrelas(1.1 + 0.2), 1.3);
});

t('filtro de estrelas: maior/menor que, com e sem igualdade', () => {
    const js = [1.1, 1.2, 1.5, 1.9, 2, 3].map((e, i) => ({ id: i, nome: 'J' + e, estrelas: e }));
    const nomes = f => L.filtrarPorEstrelas(js, f).map(j => j.estrelas);
    assert.deepStrictEqual(nomes({ min: 1.5, opMin: '>', max: 2, opMax: '<' }), [1.9]);
    assert.deepStrictEqual(nomes({ min: 1.5, opMin: '>=', max: 2, opMax: '<=' }), [1.5, 1.9, 2]);
    assert.deepStrictEqual(nomes({ max: '1,2', opMax: '<' }), [1.1]);
    assert.deepStrictEqual(nomes({ min: 1.9 }), [1.9, 2, 3]);
    assert.deepStrictEqual(nomes({}), [1.1, 1.2, 1.5, 1.9, 2, 3]);
});
