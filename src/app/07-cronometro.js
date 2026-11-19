    // --- 2. CRONÔMETRO COM APITO AUTOMÁTICO ---
    const timerDisplay = document.getElementById('timer-display');
    const selectTempo = document.getElementById('select-tempo-predefinido');
    const inputTempoCustom = document.getElementById('input-tempo-custom');
    let audioCtx = null;

    // Relógio do Firebase: o celular de quem assiste pode estar com a hora diferente,
    // então o cronômetro do link é calculado em cima do horário do servidor.
    function lerRelogioServidor() {
        try {
            const f = window.firebaseFns;
            f.onValue(f.ref(window.firebaseDb, '.info/serverTimeOffset'), snap => { offsetServidor = Number(snap.val()) || 0; });
        } catch (e) { /* sem relógio do servidor, usa o do celular */ }
    }
    if (window.firebaseReady) lerRelogioServidor();
    else window.addEventListener('firebase-ready', lerRelogioServidor, { once: true });

    // Retrato do cronômetro que vai junto com o placar ao vivo.
    // estado: rodando | pausado | parado | fim.  fimEm está no horário do servidor.
    function montarCron() {
        const base = { total: tempoTotalSegundos, restante: tempoRestante };
        if (timerInterval) return Object.assign(base, { estado: 'rodando', fimEm: fimEm + offsetServidor });
        if (tempoRestante <= 0) return { total: tempoTotalSegundos, restante: 0, estado: 'fim', fimEm: (fimEm || 0) + offsetServidor };
        if (tempoRestante < tempoTotalSegundos) return Object.assign(base, { estado: 'pausado' });
        return Object.assign(base, { estado: 'parado' });
    }
    function publicarCronometro() { publicarAoVivo(ultimoEncerrado); }

    // O celular só libera som depois de um toque: por isso o áudio é preparado no clique em "Iniciar"
    function prepararAudio() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!audioCtx) audioCtx = new AudioCtx();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* sem áudio, segue o jogo */ }
    }

    function atualizarDisplayTimer() {
        if (!timerDisplay) return;
        const min = Math.floor(tempoRestante / 60);
        const seg = tempoRestante % 60;
        timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }

    function pararTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    function tickTimer() {
        tempoRestante = Math.max(0, Math.ceil((fimEm - Date.now()) / 1000));
        atualizarDisplayTimer();
        if (tempoRestante <= 0) {
            pararTimer();
            publicarCronometro();   // o link recebe "fim" e apita junto
            tocarApitoJuiz();
            if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
            estadoBotoesTimer();
            mostrarAlerta('O tempo da partida acabou.', 'Fim de jogo');
        }
    }

    function definirNovoTempo(minutos) {
        pararTimer();
        tempoTotalSegundos = minutos * 60;
        tempoRestante = tempoTotalSegundos;
        atualizarDisplayTimer();
        publicarCronometro();
        const t = document.getElementById('tempo-partida-txt');
        if (t) t.textContent = minutos + ' min';
        estadoBotoesTimer();
    }
    // um botão principal: Iniciar -> Pausar -> Continuar
    function estadoBotoesTimer() {
        const rodando = !!timerInterval;
        const ini = document.getElementById('btn-timer-start'), pau = document.getElementById('btn-timer-pause');
        if (ini) ini.classList.toggle('hidden', rodando);
        if (pau) pau.classList.toggle('hidden', !rodando);
        const txt = document.getElementById('txt-timer-start');
        if (txt) txt.textContent = tempoRestante > 0 && tempoRestante < tempoTotalSegundos ? 'Continuar' : 'Iniciar';
        const card = document.getElementById('card-relogio');
        if (card) { card.classList.toggle('rodando', rodando); card.classList.toggle('fim', tempoRestante <= 0); }
    }

    if (selectTempo) {
        selectTempo.addEventListener('change', (e) => {
            if (inputTempoCustom) inputTempoCustom.value = '';
            definirNovoTempo(parseInt(e.target.value) || 10);
        });
    }

    if (inputTempoCustom) {
        inputTempoCustom.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (val && val > 0) definirNovoTempo(val);
        });
    }

    const btnStart = document.getElementById('btn-timer-start');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            prepararAudio();
            if (timerInterval) return;
            if (tempoRestante <= 0) tempoRestante = tempoTotalSegundos;
            fimEm = Date.now() + tempoRestante * 1000;
            timerInterval = setInterval(tickTimer, 250);
            publicarCronometro();
            estadoBotoesTimer();
        });
    }

    const btnPause = document.getElementById('btn-timer-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (!timerInterval) return;
            tickTimer();   // atualiza o tempo restante antes de parar
            pararTimer();
            publicarCronometro();
            estadoBotoesTimer();
        });
    }

    const btnReset = document.getElementById('btn-timer-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            pararTimer();
            tempoRestante = tempoTotalSegundos;
            atualizarDisplayTimer();
            publicarCronometro();
            estadoBotoesTimer();
        });
    }

    // Apito de juiz de fim de partida (dois silvos). O som em si está em js/apito.js
    function tocarApitoJuiz() {
        try {
            prepararAudio();
            if (!audioCtx || !window.Apito) return;
            window.Apito.tocar(audioCtx);
        } catch (e) {
            console.log("Erro ao tocar áudio:", e);
        }
    }

