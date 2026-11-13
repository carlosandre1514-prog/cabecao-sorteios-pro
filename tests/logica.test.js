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

t('offline: gravarNoCaminho/lerDoCaminho criam níveis e null apaga', () => {
    const o = L.gravarNoCaminho({}, 'rachas/r2/jogadores', [1, 2]);
    assert.deepStrictEqual(o, { rachas: { r2: { jogadores: [1, 2] } } });
    assert.deepStrictEqual(L.lerDoCaminho(o, 'rachas/r2/jogadores'), [1, 2]);
    assert.strictEqual(L.lerDoCaminho(o, 'rachas/r9/jogadores'), undefined);
    L.gravarNoCaminho(o, 'rachas/r2/jogadores', null);
    assert.deepStrictEqual(o, { rachas: { r2: {} } });
    assert.deepStrictEqual(L.gravarNoCaminho(null, 'perfil', { a: 1 }), { perfil: { a: 1 } });
});

t('métricas: dias e resumo (hoje, 7 dias, usuários únicos)', () => {
    const ts = new Date(2026, 0, 2, 10).getTime();
    assert.strictEqual(L.diaISO(ts), '2026-01-02');
    assert.deepStrictEqual(L.ultimosDias(3, ts), ['2026-01-02', '2026-01-01', '2025-12-31']);
    const dias = L.ultimosDias(3, ts);
    const r = L.resumirMetricas(
        { '2026-01-02': { sorteio: 2 }, '2026-01-01': { sorteio: 3, cadastro: 1 }, '2025-12-20': { sorteio: 99 } },
        { '2026-01-02': { a: true, b: true }, '2026-01-01': { b: true, c: true } }, dias);
    assert.deepStrictEqual(r.hoje, { sorteio: 2 });
    assert.deepStrictEqual(r.semana, { sorteio: 5, cadastro: 1 });
    assert.strictEqual(r.ativosHoje, 2);
    assert.strictEqual(r.ativosSemana, 3);
});

t('resumo do racha: campeão, jogos, artilharia e texto do WhatsApp', () => {
    const h = {
        data: '13/11/2026 22:00', modo: 'todos-contra-todos',
        classificacao: [null, { nome: 'Time 1', p: 3, j: 2, v: 1, e: 0, d: 1, gp: 3, sg: 1 }, { nome: 'Time 2', p: 4, j: 2, v: 1, e: 1, d: 0, gp: 2, sg: 1 }],
        artilharia: { 'J․ Silva': 2, Ana: 3, Zero: 0 },
        partidas: [
            { rodada: 1, timeA: { nome: 'Time 1' }, timeB: { nome: 'Time 2' }, golsA: 1, golsB: 1, penaltisA: 3, penaltisB: 4 },
            { rodada: 2, timeA: { nome: 'Time 1' }, timeB: { nome: 'Time 2' }, golsA: 2, golsB: 0 }
        ]
    };
    const r = L.resumoCampeonato(h);
    assert.strictEqual(r.campeao, 'Time 2');
    assert.deepStrictEqual(r.artilharia, [{ nome: 'Ana', gols: 3 }, { nome: 'J. Silva', gols: 2 }]);
    assert.strictEqual(r.jogos[0].extra, 'pên. 3 x 4');
    assert.strictEqual(r.totalGols, 4); assert.strictEqual(r.mediaGols, 2);
    const txt = L.textoResumo(r, 'Pelada de Sexta');
    assert.ok(txt.includes('*Campeão: Time 2*') && txt.includes('🥇 Ana — 3 gols') && txt.includes('Rodada 1: Time 1 1 x 1 Time 2 (pên. 3 x 4)'));
    const livre = L.resumoCampeonato({ modo: 'racha-livre', partidas: [{ idPartida: 1, timeA: { nome: 'A' }, timeB: { nome: 'B' }, golsA: 0, golsB: 0, vencedor: 'B' }] });
    assert.strictEqual(livre.jogos[0].extra, 'avançou B');
    assert.strictEqual(L.resumoCampeonato({}).campeao, null);
});

t('tabela sem fim: turno 2 continua rodadas/ids e inverte o mando; turno 3 volta', () => {
    const times = [1, 2, 3, 4].map(id => ({ id, nome: 'Time ' + id }));
    const t1 = L.gerarPartidas(times);
    const t2 = L.proximoTurno(times, t1);
    assert.strictEqual(t2.length, t1.length);
    assert.strictEqual(t2[0].rodada, 4); assert.strictEqual(t2[0].idPartida, 7); assert.strictEqual(t2[0].turno, 2);
    assert.strictEqual(t2[0].timeA.id, t1[0].timeB.id); assert.strictEqual(t2[0].timeB.id, t1[0].timeA.id);
    assert.ok(t2.every(p => !p.finalizada && p.golsA === 0));
    const t3 = L.proximoTurno(times, t1.concat(t2));
    assert.strictEqual(t3[0].turno, 3); assert.strictEqual(t3[0].rodada, 7); assert.strictEqual(t3[0].timeA.id, t1[0].timeA.id);
    // 3 times (com folga): também funciona
    const tres = times.slice(0, 3), a = L.gerarPartidas(tres);
    assert.strictEqual(L.proximoTurno(tres, a).length, a.length);
});

t('lista de presença: ordem de chegada, limite só da linha, espera, convidados e sem resposta', () => {
    const js = [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bia' }, { id: 3, nome: 'Caio' }, { id: 4, nome: 'Gol', g: true }, { id: 5, nome: 'Duda' }];
    const r = L.resumirPresenca(js, {
        2: { status: 'vou', em: 10 }, 1: { status: 'vou', em: 20 }, 4: { status: 'vou', em: 30 },
        3: { status: 'vou', em: 40 }, x9: { status: 'vou', em: 50, nome: 'Zé Convidado', convidado: true },
        99: { status: 'vou', em: 5 },          // jogador apagado: ignorado
        5: { status: 'nao', em: 1 }
    }, 2);
    assert.deepStrictEqual(r.confirmados.map(c => c.nome), ['Bia', 'Ana', 'Gol']);   // goleiro não conta no limite
    assert.deepStrictEqual(r.espera.map(c => c.nome), ['Caio', 'Zé Convidado']);
    assert.deepStrictEqual(r.naoVao.map(c => c.nome), ['Duda']);
    assert.deepStrictEqual(r.semResposta, []);
    assert.strictEqual(r.convidados[0].id, 'x9');
    assert.strictEqual(r.linhaConfirmados, 2); assert.strictEqual(r.goleirosConfirmados, 1);
    const sem = L.resumirPresenca(js, {}, 0);
    assert.strictEqual(sem.semResposta.length, 5); assert.strictEqual(sem.confirmados.length, 0);
    assert.strictEqual(L.resumirPresenca(js, { 1: { status: 'vou', em: 1 }, 2: { status: 'vou', em: 2 }, 3: { status: 'vou', em: 3 } }, 0).espera.length, 0);
});

t('lista por nome digitado: acha o jogador ignorando acento, maiúscula e espaços', () => {
    const ps = [{ id: '1', nome: 'Zé Pereira' }, { id: '2', nome: 'João' }, { id: 'c9', nome: 'Zeca' }];
    assert.strictEqual(L.acharPorNome(ps, '  ze   PEREIRA ').id, '1');
    assert.strictEqual(L.acharPorNome(ps, 'joao').id, '2');
    assert.strictEqual(L.acharPorNome(ps, 'zeca').id, 'c9');
    assert.strictEqual(L.acharPorNome(ps, 'Zé'), null);      // nome parcial não confunde com outro
    assert.strictEqual(L.acharPorNome(ps, '   '), null);
});

t('lista: 4 times x 4 na linha + 1 goleiro por time, suplentes, saída sobe o suplente e pagamento', () => {
    const js = [];
    for (let i = 1; i <= 18; i++) js.push({ id: String(i), nome: 'L' + i });
    for (let i = 1; i <= 5; i++) js.push({ id: 'g' + i, nome: 'G' + i, g: true });
    const resp = {};
    js.forEach((j, k) => { resp[j.id] = { status: 'vou', em: k + 1 }; });
    const cfg = { vagasGoleiro: 4, pagos: { 1: true, 2: true }, prazo: 1000, agora: 500 };
    const r = L.resumirPresenca(js, resp, 16, cfg);
    assert.strictEqual(r.linhaConfirmados, 16); assert.strictEqual(r.goleirosConfirmados, 4);
    assert.deepStrictEqual(r.espera.map(e => e.nome), ['L17', 'L18', 'G5']);   // suplentes em ordem
    assert.strictEqual(r.pagos, 2); assert.strictEqual(r.pendentes, 18); assert.strictEqual(r.atrasados.length, 0);
    // L3 desiste (organizador tira): L17 sobe
    resp['3'] = { status: 'nao', em: 99, removido: true };
    const r2 = L.resumirPresenca(js, resp, 16, cfg);
    assert.ok(r2.confirmados.some(c => c.nome === 'L17') && !r2.confirmados.some(c => c.nome === 'L3'));
    assert.deepStrictEqual(r2.espera.map(e => e.nome), ['L18', 'G5']);
    assert.ok(r2.naoVao.find(n => n.nome === 'L3').removido);
    // passou do prazo: quem não pagou fica "atrasado"
    const r3 = L.resumirPresenca(js, resp, 16, Object.assign({}, cfg, { agora: 2000 }));
    assert.ok(r3.prazoVencido); assert.strictEqual(r3.atrasados.length, 18);
    assert.ok(!r3.atrasados.some(a => a.id === '1' || a.id === '2'));
    // menos goleiros que times: tudo bem, ninguém fica de fora
    const poucos = L.resumirPresenca([{ id: 'g1', nome: 'G1', g: true }], { g1: { status: 'vou', em: 1 } }, 16, { vagasGoleiro: 4 });
    assert.strictEqual(poucos.goleirosConfirmados, 1); assert.strictEqual(poucos.espera.length, 0);
});

t('pagamento: jogador diz "já paguei" -> a confirmar (não conta como atrasado) -> organizador confirma', () => {
    const js = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }, { id: 'c', nome: 'Caio' }];
    const resp = { a: { status: 'vou', em: 1, paguei: 5 }, b: { status: 'vou', em: 2 }, c: { status: 'vou', em: 3, paguei: 6 } };
    const r = L.resumirPresenca(js, resp, 0, { pagos: { c: true }, prazo: 10, agora: 20 });
    const por = id => r.confirmados.find(x => x.id === id);
    assert.ok(por('a').aConfirmar && !por('a').pago && !por('a').atrasado);   // disse que pagou, falta o organizador
    assert.ok(por('b').atrasado && !por('b').aConfirmar);                     // não pagou e o prazo passou
    assert.ok(por('c').pago && !por('c').aConfirmar);                         // confirmado pelo organizador
    assert.deepStrictEqual(r.aConfirmar.map(x => x.nome), ['Ana']);
    assert.deepStrictEqual(r.atrasados.map(x => x.nome), ['Bia']);
    assert.strictEqual(r.pagos, 1); assert.strictEqual(r.pendentes, 1);
});

t('cara do racha: cores e mensagem da lista para o WhatsApp', () => {
    assert.strictEqual(L.corRacha('azul').b, '#2f6fd6');
    assert.strictEqual(L.corRacha('inexistente').b, '#2da762');
    assert.strictEqual(L.hexParaRgb('#2da762'), '45, 167, 98');
    const js = [{ id: '1', nome: 'Ana' }, { id: '2', nome: 'Bia', g: true }, { id: '3', nome: 'Caio' }, { id: '4', nome: 'Duda' }];
    const d = { visual: { nome: 'Pelada do Zé' }, quando: 'Sexta 20h', times: 2, porTime: 1, limite: 2, vagasGoleiro: 2, pagamento: 'R$ 15 no Pix', prazo: 1,
        respostas: { 1: { status: 'vou', em: 1, paguei: 9 }, 2: { status: 'vou', em: 2 }, 3: { status: 'vou', em: 3 }, 4: { status: 'vou', em: 4 } }, pagos: { 3: true } };
    const r = L.resumirPresenca(js, d.respostas, d.limite, { vagasGoleiro: 2, pagos: d.pagos, prazo: 1e15 });
    const txt = L.textoListaWhatsApp(d, r, 'https://x/presenca.html?c=ABC', () => 'sex 18h');
    assert.ok(txt.startsWith('⚽ *PELADA DO ZÉ*'));
    assert.ok(txt.includes('✅ *LINHA (2/2)*\n1. Ana 🕐\n2. Caio ✅'));
    assert.ok(txt.includes('🧤 *GOLEIROS (1/2)*\n1. Bia\n2. '));   // vaga de goleiro em aberto
    assert.ok(txt.includes('⏳ *SUPLENTES*\n1. Duda'));
    assert.ok(txt.includes('⏰ Pagar até sex 18h') && txt.endsWith('👉 *Confirme aqui:* https://x/presenca.html?c=ABC'));
});

t('Pix copia e cola: CRC oficial, chaves e código completo válido', () => {
    assert.strictEqual(L.crc16Pix('123456789'), '29B1');                       // valor de referência do CRC-16/CCITT-FALSE
    assert.strictEqual(L.normalizarChavePix('telefone', '(11) 99999-8888'), '+5511999998888');
    assert.strictEqual(L.normalizarChavePix('telefone', '+55 11 99999-8888'), '+5511999998888');
    assert.strictEqual(L.normalizarChavePix('cpf', '123.456.789-09'), '12345678909');
    assert.strictEqual(L.normalizarChavePix('cpf', '123'), '');
    assert.strictEqual(L.normalizarChavePix('email', 'Zé@Racha.com'), 'zé@racha.com');
    assert.strictEqual(L.normalizarChavePix('email', 'semarroba'), '');
    assert.strictEqual(L.normalizarChavePix('aleatoria', '123E4567-E12B-12D1-A456-426655440000'), '123e4567-e12b-12d1-a456-426655440000');
    const pix = L.montarPix({ chave: '+5511999998888', nome: 'Carlos André da Silva Júnior Neto', cidade: 'São José dos Campos', valor: 15, txid: 'ABCD1234-Ana Souza', mensagem: 'Pelada dos Crias - Ana' });
    // estrutura: começa com 000201, tem a chave, o valor, BR, nome/cidade sem acento e cortados, txid limpo e CRC no fim
    assert.ok(pix.startsWith('000201'));
    assert.ok(pix.includes('0014br.gov.bcb.pix0114+5511999998888'));
    assert.ok(pix.includes('540515.00') && pix.includes('5802BR'));
    assert.ok(pix.includes('5925CARLOS ANDRE DA SILVA JUN') && pix.includes('6015SAO JOSE DOS CA'));
    assert.ok(pix.includes('62200516ABCD1234AnaSouza'));
    assert.strictEqual(pix.slice(-8, -4), '6304');
    assert.strictEqual(pix.slice(-4), L.crc16Pix(pix.slice(0, -4)));
    // cada campo tem o tamanho certo (lê o código como o banco lê)
    const ler = str => { const o = {}; let i = 0; while (i < str.length) { const id = str.substr(i, 2), n = +str.substr(i + 2, 2); o[id] = str.substr(i + 4, n); i += 4 + n; } return o; };
    const campos = ler(pix);
    assert.strictEqual(campos['53'], '986'); assert.strictEqual(campos['54'], '15.00');
    assert.strictEqual(ler(campos['26'])['01'], '+5511999998888');
    assert.ok(campos['26'].length <= 99);
    assert.strictEqual(L.montarPix({ chave: '' }), '');
    assert.ok(L.montarPix({ chave: 'a@b.co', nome: 'X', cidade: 'Y' }).includes('0503***'));   // sem valor e sem txid
});

t('plano Pro: assinatura, teste grátis de 7 dias e economia do anual', () => {
    const dia = 864e5, agora = 100 * dia;
    assert.deepStrictEqual(L.statusPlano(null, null, agora, 7), { pro: false, origem: null, ate: null, diasTeste: 0, testeUsado: false });
    const t1 = L.statusPlano(null, { inicio: agora - 2 * dia }, agora, 7);
    assert.ok(t1.pro && t1.origem === 'teste' && t1.diasTeste === 5 && t1.testeUsado);
    const acabou = L.statusPlano(null, { inicio: agora - 8 * dia }, agora, 7);
    assert.ok(!acabou.pro && acabou.testeUsado);                                   // teste só uma vez
    assert.strictEqual(L.statusPlano({ ativo: true, ate: agora + dia }, null, agora, 7).origem, 'plano');
    assert.ok(!L.statusPlano({ ativo: true, ate: agora - 1 }, null, agora, 7).pro);  // assinatura vencida
    assert.ok(L.statusPlano({ ativo: true }, null, agora, 7).pro);                    // vitalício
    assert.strictEqual(L.economiaAnual(9.9, 59.9), 50);
    assert.strictEqual(L.reais(59.9), 'R$ 59,90');
});

t('caixa: saldo, mês, mensalistas pagos/devendo e cobrança', () => {
    assert.strictEqual(L.mesISO(new Date(2026, 10, 13).getTime()), '2026-11');
    assert.strictEqual(L.nomeMes('2026-11'), 'novembro de 2026');
    assert.strictEqual(L.somarMes('2026-12', 1), '2027-01'); assert.strictEqual(L.somarMes('2026-01', -1), '2025-12');
    const js = [{ id: 1, nome: 'Ana Souza' }, { id: 2, nome: 'Bia' }, { id: 3, nome: 'Caio' }];
    const caixa = {
        config: { mensalidade: 50, diaria: 15, vencimento: 10 },
        mensalistas: { 1: true, 2: true },
        lancamentos: {
            a: { tipo: 'entrada', valor: 50, mes: '2026-11', categoria: 'mensalidade', jogadorId: 1, data: 3 },
            b: { tipo: 'entrada', valor: 15, mes: '2026-11', categoria: 'diaria', jogadorId: 3, data: 2 },
            c: { tipo: 'saida', valor: 120.5, mes: '2026-11', categoria: 'quadra', desc: 'Quadra', data: 1 },
            d: { tipo: 'entrada', valor: 200, mes: '2026-10', categoria: 'mensalidade', jogadorId: 2, data: 0 }
        }
    };
    const r = L.resumoCaixa(caixa, js, '2026-11');
    assert.strictEqual(r.saldo, 144.5);                 // 50 + 15 - 120,5 + 200 (outubro também conta no saldo)
    assert.strictEqual(r.entradasMes, 65); assert.strictEqual(r.saidasMes, 120.5); assert.strictEqual(r.saldoMes, -55.5);
    assert.deepStrictEqual(r.mensalistas.map(m => [m.nome, m.pago]), [['Bia', false], ['Ana Souza', true]]);   // quem deve primeiro
    assert.strictEqual(r.pagaram, 1); assert.strictEqual(r.aReceber, 50); assert.strictEqual(r.previsto, 100);
    assert.strictEqual(r.lancamentos[0].id, 'a');      // mais recente primeiro
    const g = L.textoCobrancaGrupo(r, '2026-11', 'Pelada dos Crias', { chave: '+5511999998888', nome: 'Carlos' });
    assert.ok(g.startsWith('💰 *MENSALIDADE DE NOVEMBRO DE 2026* — Pelada dos Crias'));
    assert.ok(g.includes('⏳ *Ainda não pagaram (1):*\n1. Bia') && g.includes('💠 Pix: +5511999998888 (Carlos)'));
    assert.ok(L.textoCobrancaIndividual('Ana Souza', r, '2026-11', 'Pelada', null).startsWith('Fala Ana! 👋 A mensalidade de novembro de 2026 do Pelada (R$ 50,00)'));
    const todos = L.resumoCaixa(Object.assign({}, caixa, { mensalistas: { 1: true } }), js, '2026-11');
    assert.ok(L.textoCobrancaGrupo(todos, '2026-11', '', null).includes('Todo mundo pagou'));
});
