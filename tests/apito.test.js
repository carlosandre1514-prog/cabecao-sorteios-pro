// Teste do apito de fim de partida: confere que dura 6 s e que nada toca depois disso.
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

t('apito de fim de partida dura exatamente 6 segundos', () => {
    assert.strictEqual(Apito.DURACAO, 6);
    const ctx = ctxFalso();
    assert.strictEqual(Apito.tocar(ctx), 6);
    const inicio = Math.min(...ctx.agenda.starts);
    const fimSom = Math.max(...ctx.agenda.rampas.map(r => r[1]));   // fim do volume (silêncio)
    assert.ok(Math.abs((fimSom - inicio) - 6) < 0.1, 'o som deve fechar em 6 s, deu ' + (fimSom - inicio));
    assert.ok(Math.max(...ctx.agenda.stops) - inicio < 6.2, 'nenhum oscilador pode ficar ligado depois do fim');
});

t('padrão: dois sopros curtos e um longo', () => {
    const [a, b, c] = Apito.SOPROS;
    assert.ok(a[1] - a[0] < 1 && b[1] - b[0] < 1 && c[1] - c[0] > 3);
    assert.strictEqual(c[1], 6);
});

t('teste de som é curto e sem contexto não quebra', () => {
    assert.ok(Apito.testar(ctxFalso()) < 1);
    assert.strictEqual(Apito.tocar(null), 0);
});

console.log('\n' + ok + ' testes passaram.');
