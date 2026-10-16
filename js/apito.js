// =====================================================================
// apito.js — APITO DE JUIZ DE FIM DE PARTIDA (dura 6 segundos)
// Usado pelo app (index.html) e pela página do link (ao-vivo.html).
// Se o som do apito estiver errado (tempo, volume, timbre), o erro está AQUI.
// =====================================================================
(function (raiz, fabrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabrica();
    else raiz.Apito = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
    const DURACAO = 6; // segundos, do primeiro sopro até o silêncio

    // Fim de jogo: dois sopros curtos e um LONGO que fecha exatamente em 6 s.
    // [início, fim] em segundos
    const SOPROS = [[0, 0.5], [0.75, 1.25], [1.5, DURACAO]];

    // Ruído branco = o "ar" do sopro (dá o chiado de apito de verdade)
    function criarRuido(ctx, segundos) {
        const n = Math.ceil(ctx.sampleRate * segundos);
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    // Um sopro de apito com bolinha (pea whistle): duas "câmaras" (2 frequências)
    // + trinado de ~24 vezes por segundo + chiado do ar.
    function soprar(ctx, destino, ruido, t0, ini, fim) {
        const a = t0 + ini, b = t0 + fim, dur = fim - ini;
        const solta = Math.min(0.12, dur * 0.3);      // quanto demora para o som sumir
        const ataque = 0.025;

        const env = ctx.createGain();                  // volume geral do sopro
        env.gain.setValueAtTime(0.0001, a);
        env.gain.linearRampToValueAtTime(1, a + ataque);
        env.gain.setValueAtTime(1, b - solta);
        env.gain.linearRampToValueAtTime(0.0001, b);   // termina exatamente em "b"
        env.connect(destino);

        // trinado: a bolinha faz o volume e a nota tremerem
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(24, a);
        const lfoVol = ctx.createGain();   // quanto o volume treme
        const lfoNota = ctx.createGain();  // quanto a nota treme (± Hz)
        lfoVol.gain.setValueAtTime(0.28, a);
        lfoNota.gain.setValueAtTime(70, a);
        lfo.connect(lfoVol);
        lfo.connect(lfoNota);

        const tom = ctx.createGain();      // nível base + tremor de volume
        tom.gain.setValueAtTime(0.72, a);
        lfoVol.connect(tom.gain);
        tom.connect(env);

        const notas = [[2860, 0.55], [3190, 0.4]];
        const osc = notas.map(([hz, nivel]) => {
            const o = ctx.createOscillator();
            o.type = 'sine';
            // o apito "sobe" um pouco quando o ar entra e cai no fim do sopro longo
            o.frequency.setValueAtTime(hz * 0.94, a);
            o.frequency.linearRampToValueAtTime(hz, a + 0.06);
            if (dur > 2) o.frequency.linearRampToValueAtTime(hz * 0.97, b);
            lfoNota.connect(o.frequency);
            const g = ctx.createGain();
            g.gain.setValueAtTime(nivel, a);
            o.connect(g);
            g.connect(tom);
            return o;
        });

        // chiado do ar (filtrado perto da nota do apito)
        const src = ctx.createBufferSource();
        src.buffer = ruido;
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'bandpass';
        filtro.frequency.setValueAtTime(3100, a);
        filtro.Q.setValueAtTime(1.4, a);
        const gRuido = ctx.createGain();
        gRuido.gain.setValueAtTime(0.16, a);
        src.connect(filtro);
        filtro.connect(gRuido);
        gRuido.connect(env);

        const parar = b + 0.05;
        osc.forEach(o => { o.start(a); o.stop(parar); });
        lfo.start(a); lfo.stop(parar);
        src.start(a, 0); src.stop(parar);
    }

    // Toca o apito de fim de partida (6 s). Devolve a duração.
    function tocar(ctx) {
        if (!ctx) return 0;
        const t0 = ctx.currentTime + 0.05;
        const comp = ctx.createDynamicsCompressor(); // evita estourar o alto-falante
        const mestre = ctx.createGain();
        mestre.gain.setValueAtTime(0.85, t0);
        mestre.connect(comp);
        comp.connect(ctx.destination);
        const ruido = criarRuido(ctx, DURACAO);
        SOPROS.forEach(([ini, fim]) => soprar(ctx, mestre, ruido, t0, ini, fim));
        return DURACAO;
    }

    // Um "piu" curto só para a pessoa conferir se o som está ligado.
    function testar(ctx) {
        if (!ctx) return 0;
        const t0 = ctx.currentTime + 0.05;
        const comp = ctx.createDynamicsCompressor();
        const mestre = ctx.createGain();
        mestre.gain.setValueAtTime(0.6, t0);
        mestre.connect(comp);
        comp.connect(ctx.destination);
        soprar(ctx, mestre, criarRuido(ctx, 0.5), t0, 0, 0.35);
        return 0.35;
    }

    // Celulares (principalmente iPhone) só liberam som depois de um toque:
    // chame isto DENTRO de um clique para "destravar" o áudio.
    function desbloquear(ctx) {
        try {
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume();
            const src = ctx.createBufferSource();
            src.buffer = ctx.createBuffer(1, 1, 22050);
            src.connect(ctx.destination);
            src.start(0);
        } catch (e) { /* sem áudio, segue o jogo */ }
    }

    return { DURACAO, SOPROS, tocar, testar, desbloquear };
});
