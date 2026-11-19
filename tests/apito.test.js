// Teste do apito de fim de partida: dois silvos (1,6 s) e nada toca depois disso.
// Rode com:  node tests/apito.test.js
const assert = require('assert');
const Apito = require('../js/apito.js');

// "Navegador de áudio" falso que só anota os horários agendados
function ctxFalso() {
    const agenda = { starts: [], stops: [], rampas: [] };
    const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime(v, t) { agenda.rampas.push([v, t]); } });
    const no = () => ({ connect() {}, gain: param(), frequency: param(), Q: param(), start(t) { agenda.starts.push(t); }, stop(t) { agenda.stops.push(t); } });
    return {
        agenda, currentTime: 10, sampleRate: 8000, state: 'running', destination: {},
        createOscillator: no, createGain: no, createBiquadFilter: no, createDynamicsCompressor: no,
        createBufferSource() { const n = no(); n.buffer = null; return n; },
        createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) })
    };
}

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log('✅ ' + nome); };

t('apito de fim de partida dura só os dois silvos (1,6 s)', () => {
    assert.strictEqual(Apito.DURACAO, 1.6);
    const ctx = ctxFalso();
    assert.strictEqual(Apito.tocar(ctx), 1.6);
    const inicio = Math.min(...ctx.agenda.starts);
    const fimSom = Math.max(...ctx.agenda.rampas.map(r => r[1]));   // fim do volume (silêncio)
    assert.ok(Math.abs((fimSom - inicio) - 1.6) < 0.1, 'o som deve fechar em 1,6 s, deu ' + (fimSom - inicio));
    assert.ok(Math.max(...ctx.agenda.stops) - inicio < 1.8, 'nenhum oscilador pode ficar ligado depois do fim');
});

t('padrão: exatamente dois silvos iguais, com pausa entre eles', () => {
    assert.strictEqual(Apito.SOPROS.length, 2);
    const [a, b] = Apito.SOPROS;
    assert.ok(Math.abs((a[1] - a[0]) - (b[1] - b[0])) < 0.1, 'os dois silvos têm o mesmo tamanho');
    assert.ok(b[0] - a[1] >= 0.15 && b[0] - a[1] <= 0.4, 'pausa curta entre os silvos');
    assert.strictEqual(b[1], Apito.DURACAO);
});

t('teste de som é curto e sem contexto não quebra', () => {
    assert.ok(Apito.testar(ctxFalso()) < 1);
    assert.strictEqual(Apito.tocar(null), 0);
});

console.log('\n' + ok + ' testes passaram.');
