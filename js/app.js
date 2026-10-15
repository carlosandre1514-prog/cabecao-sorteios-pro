// =====================================================================
// app.js — TELAS e ESTADO do app (login, jogadores, sorteio, campeonato, histórico)
//
// Onde procurar cada erro:
//   cálculo de sorteio / tabela / pontos  -> js/logica.js  (tem testes)
//   bloquear app / versão mínima          -> js/remoto.js
//   plano Pro, limites, patrocinador      -> js/monetizacao.js
//   login (formulário)                    -> js/auth.js
//   salvar/carregar no Firebase, telas    -> ESTE arquivo
// =====================================================================

// --- VARIÁVEIS GLOBAIS ---
let modoJogoAtual = 'todos-contra-todos'; // 'todos-contra-todos' ou 'racha-livre'

// Variáveis do modo racha livre
let filaTimes = [];
let timeEmCampoA = null;
let timeEmCampoB = null;
let partidasRachaHistorico = [];
let tipoDesempateRacha = null;

// --- FUNÇÕES DE CONTROLE DO MENU LATERAL (DRAWER) ---
function toggleDrawer() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('hidden');
    }
}

// Aviso rápido no topo (não trava a tela). tipo: 'ok' | 'erro'
function toast(mensagem, tipo = 'ok') {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    el.textContent = mensagem;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 320); }, 2800);
}

function esconderSplash() {
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('saindo')) return;
    sp.classList.add('saindo');
    setTimeout(() => sp.remove(), 350);
}
function mostrarCarregando(on, texto) {
    const el = document.getElementById('carregando-dados');
    if (!el) return;
    if (texto) document.getElementById('carregando-texto').textContent = texto;
    el.classList.toggle('hidden', !on);
}

async function fazerLogout() {
    try {
        if (window.firebaseAuth && window.firebaseFns) {
            await window.firebaseFns.signOut(window.firebaseAuth);
            toggleDrawer();
        } else {
            console.warn("Módulo de autenticação do Firebase não encontrado.");
        }
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        await mostrarAlerta("Erro ao sair da conta. Tente novamente.", "❌ ERRO");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let currentUserUid = null;
    let jogadores = [];
    let historico = [];
    let dadosCarregados = false;   // só salva no Firebase depois de ter carregado (evita apagar dados por engano)
    let sorteioAtual = [];         // resultado do sorteio na aba Sorteio (ainda NÃO é o campeonato)

    const elVersao = document.getElementById('versao-app');
    if (elVersao) elVersao.textContent = VERSAO_ATUAL_APP;
    
    // ALTERAÇÃO 2: Contador de sorteios por sessão
    let contadorSorteios = 0;

    let timesSorteados = [];
    let partidas = [];
    let partidaAtualIndex = 0;
    let classificacao = {};
    let artilharia = {};
    let nivelCadastroTemp = 3.0;
    let nivelEdicaoTemp = 3.0;

    // --- VARIÁVEIS DO CRONÔMETRO ---
    let timerInterval = null;
    let tempoTotalSegundos = 600;
    let tempoRestante = 600;

    // --- CONTROLE DOS BOTÕES DE INCREMENTO/DECREMENTO DE ESTRELAS (CADASTRO) ---
    const btnCadMenos = document.getElementById('btn-cad-menos');
    const btnCadMais = document.getElementById('btn-cad-mais');
    const displayEstrelasCad = document.getElementById('display-estrelas-cad');

    function atualizarDisplayCad() {
        if (displayEstrelasCad) {
            displayEstrelasCad.textContent = `⭐ ${nivelCadastroTemp.toFixed(1).replace('.', ',')}`;
        }
    }

    if (btnCadMenos) {
        btnCadMenos.addEventListener('click', () => {
            if (nivelCadastroTemp > 0.5) {
                nivelCadastroTemp -= 0.5;
                atualizarDisplayCad();
            }
        });
    }

    if (btnCadMais) {
        btnCadMais.addEventListener('click', () => {
            if (nivelCadastroTemp < 5.0) {
                nivelCadastroTemp += 0.5;
                atualizarDisplayCad();
            }
        });
    }

    // --- CONTROLE DOS BOTÕES DE INCREMENTO/DECREMENTO DE ESTRELAS (EDIÇÃO) ---
    const btnEditMenos = document.getElementById('btn-edit-menos');
    const btnEditMais = document.getElementById('btn-edit-mais');
    const displayEstrelasEdit = document.getElementById('display-estrelas-edit');

    function atualizarDisplayEdit() {
        if (displayEstrelasEdit) {
            displayEstrelasEdit.textContent = `⭐ ${nivelEdicaoTemp.toFixed(1).replace('.', ',')}`;
        }
    }

    if (btnEditMenos) {
        btnEditMenos.addEventListener('click', () => {
            if (nivelEdicaoTemp > 0.5) {
                nivelEdicaoTemp -= 0.5;
                atualizarDisplayEdit();
            }
        });
    }

    if (btnEditMais) {
        btnEditMais.addEventListener('click', () => {
            if (nivelEdicaoTemp < 5.0) {
                nivelEdicaoTemp += 0.5;
                atualizarDisplayEdit();
            }
        });
    }

    // Zera tudo que é do usuário (usado ao sair da conta ou trocar de conta)
    function limparEstadoLocal() {
        jogadores = [];
        historico = [];
        sorteioAtual = [];
        timesSorteados = [];
        partidas = [];
        partidaAtualIndex = 0;
        classificacao = {};
        artilharia = {};
        modoJogoAtual = 'todos-contra-todos';
        timeEmCampoA = null;
        timeEmCampoB = null;
        filaTimes = [];
        partidasRachaHistorico = [];
        tipoDesempateRacha = null;
        dadosCarregados = false;
    }

    // --- MONITOR DE SESSÃO DO FIREBASE ---
    // Única porta de entrada/saída do app: login, logout e "já estava logado".
    const authScreen = document.getElementById('auth-screen');
    const drawerEmail = document.getElementById('drawer-user-email');
    setTimeout(esconderSplash, 6000); // segurança: se o Firebase não responder, mostra o login

    if (window.firebaseAuth && window.firebaseFns) {
        window.firebaseFns.onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                if (currentUserUid !== user.uid) limparEstadoLocal();
                currentUserUid = user.uid;
                if (authScreen) authScreen.classList.add('hidden');
                if (drawerEmail) drawerEmail.textContent = user.email || 'Usuário Google';
                const senha = document.getElementById('auth-password');
                if (senha) senha.value = '';
                irParaAba('tab-jogadores', true);
                carregarDadosDoFirebase();
            } else {
                currentUserUid = null;
                limparEstadoLocal();
                mostrarCarregando(false);
                const resSorteio = document.getElementById('resultado-sorteio');
                if (resSorteio) resSorteio.classList.add('hidden');
                renderizarElenco();
                renderizarHistorico();
                renderizarCampeonato();
                if (authScreen) authScreen.classList.remove('hidden');
                if (drawerEmail) drawerEmail.textContent = '';
            }
            esconderSplash();
        });
    } else {
        // Firebase não carregou (sem internet no 1º acesso): mostra o login, que avisa ao tentar entrar
        if (authScreen) authScreen.classList.remove('hidden');
        esconderSplash();
    }

    // --- SALVAR NO FIREBASE (um único ponto; avisa se der erro) ---
    let avisouErroSalvar = false;
    function gravar(caminho, valor) {
        if (!currentUserUid || !window.firebaseDb || !dadosCarregados) return;
        try {
            // o JSON remove `undefined` (o Firebase rejeita) e converte NaN em null
            const limpo = valor === null ? null : JSON.parse(JSON.stringify(valor));
            const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}/${caminho}`);
            window.firebaseFns.set(dbRef, limpo).then(() => {
                avisouErroSalvar = false;
            }).catch(erroSalvar);
        } catch (erro) {
            erroSalvar(erro);
        }
    }

    function erroSalvar(erro) {
        console.error('Erro ao salvar no Firebase:', erro);
        if (avisouErroSalvar) return;
        avisouErroSalvar = true;
        mostrarAlerta('Não foi possível salvar seus dados na nuvem (' + ((erro && (erro.code || erro.message)) || 'erro') + '). Confira a internet e tente de novo.', '❌ ERRO AO SALVAR');
    }

    function salvarCampeonatoAtivo() {
        gravar('campeonatoAtivo', {
            modoJogoAtual, timesSorteados, partidas, partidaAtualIndex,
            classificacao, artilharia, timeEmCampoA, timeEmCampoB,
            filaTimes, partidasRachaHistorico
        });
    }
    function limparCampeonatoAtivo() { gravar('campeonatoAtivo', null); }
    function salvarJogadores() { gravar('jogadores', jogadores); }
    function salvarHistoricoFirebase() { gravar('historico', historico); }

    // Firebase devolve listas como array OU objeto, e apaga listas vazias -> sempre normalizamos
    const comoLista = (v) => Object.values(v || {}).filter(Boolean);

    // O banco do Firebase demora um instante para conectar logo depois do login e a
    // primeira leitura pode falhar com "Client is offline". Tentamos de novo em silêncio.
    async function lerComTentativas(userRef, uid) {
        let ultimoErro;
        for (let i = 0; i < 4; i++) {
            try {
                return await window.firebaseFns.get(userRef);
            } catch (erro) {
                ultimoErro = erro;
                if (uid !== currentUserUid) throw erro;
                if (/permission/i.test((erro && (erro.code || erro.message)) || '')) throw erro; // repetir não adianta
                await new Promise(r => setTimeout(r, 700 * (i + 1)));
            }
        }
        throw ultimoErro;
    }

    function carregarDadosDoFirebase() {
        if (!currentUserUid || !window.firebaseDb) return;
        const uid = currentUserUid;
        const userRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${uid}`);
        mostrarCarregando(true, 'Carregando seus dados...');

        lerComTentativas(userRef, uid).then((snapshot) => {
            if (uid !== currentUserUid) return; // trocou de conta no meio do caminho
            const dados = snapshot.exists() ? (snapshot.val() || {}) : {};

            jogadores = comoLista(dados.jogadores);
            historico = comoLista(dados.historico).map(h => Object.assign({}, h, {
                classificacao: Logica.limparMapa(h.classificacao),
                artilharia: Logica.limparMapa(h.artilharia),
                times: comoLista(h.times).map(Logica.normalizarTime)
            }));

            const c = dados.campeonatoAtivo;
            if (c) {
                const normPartida = p => Object.assign({}, p, {
                    timeA: Logica.normalizarTime(p.timeA),
                    timeB: Logica.normalizarTime(p.timeB)
                });
                modoJogoAtual = c.modoJogoAtual || 'todos-contra-todos';
                timesSorteados = comoLista(c.timesSorteados).map(Logica.normalizarTime);
                partidas = comoLista(c.partidas).map(normPartida);
                partidaAtualIndex = c.partidaAtualIndex || 0;
                classificacao = Logica.limparMapa(c.classificacao);
                artilharia = Logica.limparMapa(c.artilharia);
                timeEmCampoA = c.timeEmCampoA ? Logica.normalizarTime(c.timeEmCampoA) : null;
                timeEmCampoB = c.timeEmCampoB ? Logica.normalizarTime(c.timeEmCampoB) : null;
                filaTimes = comoLista(c.filaTimes).map(Logica.normalizarTime);
                partidasRachaHistorico = comoLista(c.partidasRachaHistorico).map(normPartida);
            }

            dadosCarregados = true;
            mostrarCarregando(false);
            renderizarElenco();
            renderizarHistorico();
            if (timesSorteados.length > 0) renderizarCampeonato();
        }).catch(async (error) => {
            if (uid !== currentUserUid) return;
            console.error("Erro ao carregar dados do Firebase:", error);
            mostrarCarregando(false);
            // dadosCarregados continua false: nada será salvo por cima dos seus dados
            const detalhe = String((error && (error.code || error.message)) || 'erro desconhecido');
            let dica = 'Confira a internet.';
            if (/permission/i.test(detalhe)) dica = 'O Firebase negou a leitura: as regras do Realtime Database não liberam "usuarios".';
            else if (/offline|unavailable|network/i.test(detalhe)) dica = 'Não conectou ao banco: confira a internet e o endereço (databaseURL) do Realtime Database.';
            const tentar = await mostrarConfirmacao(`Não consegui carregar seus dados. ${dica} (Código: ${detalhe}) Tentar de novo?`, '❌ ERRO AO CARREGAR');
            if (tentar && uid === currentUserUid) carregarDadosDoFirebase();
        });
    }

    // --- SISTEMA DE DIÁLOGOS E ALERTAS CUSTOMIZADOS ---
    function criarContainerAlertas() {
        if (document.getElementById('modal-alerta-custom')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'modal-alerta-custom';
        modalDiv.className = 'modal hidden';
        modalDiv.style.zIndex = '99999';

        modalDiv.innerHTML = `
            <div class="modal-content card" style="text-align: center; max-width: 360px;">
                <h2 id="alerta-titulo" style="margin-bottom: 10px;">⚠️ AVISO</h2>
                <p id="alerta-mensagem" class="subtext" style="font-size: 0.95rem; margin-bottom: 20px; line-height: 1.4;"></p>
                <div id="alerta-botoes" class="modal-actions" style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-alerta-ok" class="btn btn-primary">OK</button>
                    <button id="btn-alerta-cancelar" class="btn btn-secondary hidden">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    criarContainerAlertas();

    window.mostrarAlerta = function(mensagem, titulo = '⚠️ AVISO') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

            if (!modal) {
                alert(mensagem);
                resolve(true);
                return;
            }

            elTitulo.textContent = titulo;
            elMensagem.textContent = mensagem;

            btnCancelar.classList.add('hidden');
            btnOk.textContent = 'OK';

            const fechar = () => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', okHandler);
            };

            const okHandler = () => {
                fechar();
                resolve(true);
            };

            btnOk.addEventListener('click', okHandler);
            modal.classList.remove('hidden');
        });
    };

    function mostrarConfirmacao(mensagem, titulo = '❓ CONFIRMAÇÃO') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

            if (!modal) {
                const res = confirm(mensagem);
                resolve(res);
                return;
            }

            elTitulo.textContent = titulo;
            elMensagem.textContent = mensagem;

            btnCancelar.classList.remove('hidden');
            btnOk.textContent = 'Sim';
            btnCancelar.textContent = 'Cancelar';

            const fechar = () => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', okHandler);
                btnCancelar.removeEventListener('click', cancelHandler);
            };

            const okHandler = () => {
                fechar();
                resolve(true);
            };

            const cancelHandler = () => {
                fechar();
                resolve(false);
            };

            btnOk.addEventListener('click', okHandler);
            btnCancelar.addEventListener('click', cancelHandler);
            modal.classList.remove('hidden');
        });
    }

    function escapeHtml(texto) {
        return String(texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- 1. NAVEGAÇÃO ENTRE TELAS ---
    // Menu inferior + botão "voltar" do Android (volta para a tela anterior em vez de sair do app).
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const tituloTela = document.getElementById('titulo-tela');
    let abaAtual = 'tab-jogadores';
    // O placar digitado não pode sumir quando a tela é redesenhada ao trocar de aba
    const IDS_PLACAR = ['gols-a', 'gols-b', 'racha-gols-a', 'racha-gols-b'];

    function irParaAba(id, semHistorico) {
        const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
        const alvo = document.getElementById(id);
        if (!btn || !alvo) return;
        const mudou = id !== abaAtual;

        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        tabContents.forEach(c => c.classList.toggle('active', c === alvo));
        if (tituloTela) tituloTela.textContent = btn.dataset.title || '';
        abaAtual = id;

        if (id === 'tab-sorteio') renderizarPresenca();
        if (id === 'tab-historico') renderizarHistorico();
        if (id === 'tab-campeonato') {
            const placar = IDS_PLACAR.map(i => [i, document.getElementById(i)]).filter(([, el]) => el).map(([i, el]) => [i, el.value]);
            renderizarCampeonato();
            placar.forEach(([i, v]) => {
                const el = document.getElementById(i);
                if (el && v !== '' && v !== el.value) { el.value = v; el.dispatchEvent(new Event('input')); }
            });
        }

        if (mudou) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (!semHistorico) history.pushState({ aba: id }, '', '#' + id);
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => irParaAba(btn.dataset.tab)));
    window.addEventListener('popstate', (e) => {
        const drawer = document.getElementById('side-drawer');
        if (drawer && drawer.classList.contains('open')) toggleDrawer();
        irParaAba((e.state && e.state.aba) || 'tab-jogadores', true);
    });
    history.replaceState({ aba: 'tab-jogadores' }, '', location.pathname);

    // --- 2. CRONÔMETRO COM APITO AUTOMÁTICO ---
    const timerDisplay = document.getElementById('timer-display');
    const selectTempo = document.getElementById('select-tempo-predefinido');
    const inputTempoCustom = document.getElementById('input-tempo-custom');
    let fimEm = 0;       // horário real em que o tempo acaba (não atrasa com a tela bloqueada)
    let audioCtx = null;

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
            tocarApitoJuiz();
            if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
            mostrarAlerta('⏰ Fim de jogo! Tempo esgotado.', '⏱️ CRONÔMETRO');
        }
    }

    function definirNovoTempo(minutos) {
        pararTimer();
        tempoTotalSegundos = minutos * 60;
        tempoRestante = tempoTotalSegundos;
        atualizarDisplayTimer();
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
        });
    }

    const btnPause = document.getElementById('btn-timer-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (!timerInterval) return;
            tickTimer();   // atualiza o tempo restante antes de parar
            pararTimer();
        });
    }

    const btnReset = document.getElementById('btn-timer-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            pararTimer();
            tempoRestante = tempoTotalSegundos;
            atualizarDisplayTimer();
        });
    }

    function tocarApitoJuiz() {
        try {
            prepararAudio();
            if (!audioCtx) return;
            const agora = audioCtx.currentTime;

            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc1.frequency.setValueAtTime(2800, agora);
            osc2.frequency.setValueAtTime(3200, agora);

            // trinado do apito: o LFO precisa passar por um ganho (±300 Hz).
            // Antes ele ia direto no oscilador (±1 Hz) e o trinado não existia.
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.frequency.setValueAtTime(25, agora);
            lfoGain.gain.setValueAtTime(300, agora);
            lfo.connect(lfoGain);
            lfoGain.connect(osc1.frequency);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            gain.gain.setValueAtTime(0.3, agora);
            gain.gain.setValueAtTime(0, agora + 0.3);
            gain.gain.setValueAtTime(0.3, agora + 0.4);
            gain.gain.setValueAtTime(0, agora + 0.7);
            gain.gain.setValueAtTime(0.4, agora + 0.8);
            gain.gain.setValueAtTime(0, agora + 1.5);

            [osc1, osc2, lfo].forEach(o => { o.start(agora); o.stop(agora + 1.5); });
        } catch (e) {
            console.log("Erro ao tocar áudio:", e);
        }
    }

    // --- 3. ABA JOGADORES & IMPORTAÇÃO EM LOTE ---
    const btnImportarLote = document.getElementById('btn-importar-lote');
    if (btnImportarLote) {
        btnImportarLote.addEventListener('click', async () => {
            const inputLote = document.getElementById('lista-lote');
            if (!inputLote) return;
            const textoLote = inputLote.value;
            if (!textoLote.trim()) {
                await mostrarAlerta('Cole uma lista de nomes!', '⚠️ AVISO');
                return;
            }

            const { nomes, ignoradas } = Logica.filtrarLinhasLote(textoLote);
            let adicionados = 0;

            const limiteLote = window.Monetizacao ? window.Monetizacao.limiteJogadores() : Infinity;
            let passouDoLimite = false;

            nomes.forEach(nome => {
                if (jogadores.length >= limiteLote) { passouDoLimite = true; return; }
                jogadores.push({
                    id: Logica.idUnico(),
                    nome: nome,
                    isGoleiro: false,
                    estrelas: 3.0,
                    presente: true
                });
                adicionados++;
            });

            salvarJogadores();
            renderizarElenco();
            inputLote.value = '';
            const extra = ignoradas.length ? `\n\nLinhas ignoradas (pareciam Pix, pagamento ou link): ${ignoradas.length}` : '';
            toast(`${adicionados} jogadores adicionados!${extra}`);
            if (passouDoLimite && window.Monetizacao) {
                window.Monetizacao.abrirModal(`Alguns nomes ficaram de fora: o plano grátis permite até ${limiteLote} jogadores. Seja Pro para cadastrar quantos quiser!`);
            }
        });
    }

    const btnAddJogador = document.getElementById('btn-add-jogador');
    if (btnAddJogador) {
        btnAddJogador.addEventListener('click', async () => {
            const nomeInput = document.getElementById('novo-nome');
            if (!nomeInput) return;
            const nome = nomeInput.value.trim();
            const tipoEl = document.querySelector('input[name="tipo-jogador"]:checked');
            const tipo = tipoEl ? tipoEl.value : 'linha';

            if (!nome) {
                await mostrarAlerta('Digite o nome do jogador!', '⚠️ AVISO');
                return;
            }

            if (window.Monetizacao && !window.Monetizacao.checarLimiteJogadores(jogadores.length, 1)) return;

            jogadores.push({
                id: Logica.idUnico(),
                nome: nome,
                isGoleiro: tipo === 'goleiro',
                estrelas: nivelCadastroTemp,
                presente: true
            });

            salvarJogadores();
            nomeInput.value = '';
            nivelCadastroTemp = 3.0;
            atualizarDisplayCad();
            renderizarElenco();
        });
    }

    function renderizarElenco() {
        const container = document.getElementById('lista-jogadores-cadastrados');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('button[data-acao]');
            if (!btn) return;
            if (btn.dataset.acao === 'editar') window.abrirEdicao(btn.dataset.id);
            if (btn.dataset.acao === 'excluir') window.excluirJogador(btn.dataset.id);
        };
        
        container.innerHTML = '';

        if (jogadores.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum jogador cadastrado.</p>';
            return;
        }

        jogadores.forEach(j => {
            const div = document.createElement('div');
            div.className = 'item-jogador';
            
            const nomeTratado = escapeHtml(j.nome);
            const estrelasFormatadas = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');

            div.innerHTML = `
                <div>
                    <strong>${nomeTratado}</strong> ${j.isGoleiro ? '🧤' : ''}
                    <small style="color:#FFC400; font-weight: bold;">(⭐ ${estrelasFormatadas})</small>
                </div>
                <div class="acoes-item">
                    <button class="btn-edit" data-acao="editar" data-id="${j.id}">✏️ Editar</button>
                    <button class="btn btn-danger" style="padding: 2px 8px; margin-left: 5px;" data-acao="excluir" data-id="${j.id}">🗑️ Excluir</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    window.excluirJogador = async function(id) {
        const confirmou = await mostrarConfirmacao("Tem certeza que deseja excluir este jogador?", "🗑️ EXCLUIR JOGADOR");
        if (confirmou) {
            jogadores = jogadores.filter(j => j.id != id);
            salvarJogadores();
            renderizarElenco();
        }
    };

    window.abrirEdicao = function(id) {
        const j = jogadores.find(item => item.id == id);
        if (!j) return;

        const editId = document.getElementById('edit-id');
        const editNome = document.getElementById('edit-nome');
        const editGoleiro = document.getElementById('edit-goleiro');
        const editLinha = document.getElementById('edit-linha');
        const modal = document.getElementById('modal-edicao');

        if (editId) editId.value = j.id;
        if (editNome) editNome.value = j.nome;
        
        nivelEdicaoTemp = Number(j.estrelas || 3.0);
        atualizarDisplayEdit();

        if (j.isGoleiro) {
            if (editGoleiro) editGoleiro.checked = true;
        } else {
            if (editLinha) editLinha.checked = true;
        }

        if (modal) modal.classList.remove('hidden');
    };

    const btnFecharModal = document.getElementById('btn-fechar-modal');
    if (btnFecharModal) {
        btnFecharModal.addEventListener('click', () => {
            const modal = document.getElementById('modal-edicao');
            if (modal) modal.classList.add('hidden');
        });
    }

    const btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
    if (btnSalvarEdicao) {
        btnSalvarEdicao.addEventListener('click', () => {
            const id = document.getElementById('edit-id').value;
            const j = jogadores.find(item => item.id == id);

            if (j) {
                const editNome = document.getElementById('edit-nome');
                const editGoleiro = document.getElementById('edit-goleiro');

                j.nome = (editNome && editNome.value.trim()) ? editNome.value.trim() : j.nome;
                j.estrelas = nivelEdicaoTemp;
                j.isGoleiro = editGoleiro ? editGoleiro.checked : false;

                salvarJogadores();
                renderizarElenco();
                
                const modal = document.getElementById('modal-edicao');
                if (modal) modal.classList.add('hidden');
            }
        });
    }

    // --- 4. ABA SORTEIO ---
    function renderizarPresenca() {
        const container = document.getElementById('lista-presenca');
        if (!container) return;
        container.innerHTML = '';

        if (jogadores.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum jogador cadastrado!</p>';
            return;
        }

        jogadores.forEach(j => {
            const div = document.createElement('div');
            div.className = 'item-presenca';
            const estrelasFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
            div.innerHTML = `
                <input type="checkbox" id="p-${j.id}" ${j.presente ? 'checked' : ''}>
                <label for="p-${j.id}">${escapeHtml(j.nome)} ${j.isGoleiro ? '🧤' : ''} (⭐ ${estrelasFmt})</label>
            `;
            container.appendChild(div);

            const check = div.querySelector('input');
            if (check) {
                check.addEventListener('change', (e) => {
                    j.presente = e.target.checked;
                    salvarJogadores();
                });
            }
        });
    }

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', async () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimes = parseInt(document.getElementById('qtd-times')?.value) || 2;
            const porTime = parseInt(document.getElementById('qtd-por-time')?.value) || 0;

            if (qtdTimes < 2 || qtdTimes > 8) {
                await mostrarAlerta('Escolha entre 2 e 8 times.', '🎲 SORTEIO');
                return;
            }
            if (presentes.length < qtdTimes) {
                await mostrarAlerta(`Só ${presentes.length} jogador(es) presente(s) para ${qtdTimes} times!`, '🎲 SORTEIO');
                return;
            }

            contadorSorteios++;
            const resultado = Logica.sortearTimes(presentes, qtdTimes, porTime);
            sorteioAtual = resultado.times;
            exibirTimesSorteados();
        });
    }

    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        if (!container) return;
        
        container.className = 'grid-times-container';
        container.innerHTML = '';

        // ALTERAÇÃO 2: Exibição visual do contador de sorteios realizados
        let divContador = document.getElementById('contador-sorteios-info');
        if (!divContador) {
            divContador = document.createElement('div');
            divContador.id = 'contador-sorteios-info';
            divContador.style.cssText = 'background: rgba(255, 196, 0, 0.15); border: 1px solid #FFC400; color: #FFC400; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; text-align: center; font-weight: bold; font-size: 0.9rem;';
            container.parentNode.insertBefore(divContador, container);
        }
        divContador.innerHTML = `🔁 Sorteio realizado <strong>${contadorSorteios}x</strong> nesta sessão`;

        sorteioAtual.forEach(t => {
            const card = document.createElement('div');
            card.className = 'card-time';

            const avisoGoleiro = t.temGoleiro ? '' : ' <span class="badge-sem-goleiro">(Sem goleiro fixo)</span>';
            const mediaEstrelas = (t.jogadores.length > 0 ? (t.somaEstrelas / t.jogadores.length) : 0).toFixed(1).replace('.', ',');
            
            const listaJogadoresHtml = t.jogadores.map(j => {
                const estFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
                return `
                    <li class="item-jogador-time">
                        <span>${escapeHtml(j.nome)} ${j.isGoleiro ? '🧤' : ''}</span>
                        <small class="estrelas-jogador">⭐ ${estFmt}</small>
                    </li>
                `;
            }).join('');

            card.innerHTML = `
                <div class="card-time-header">
                    <h3>🟢 ${t.nome}</h3>
                    <span class="badge-estrelas">⭐ Média: ${mediaEstrelas}</span>
                </div>
                ${avisoGoleiro}
                <ul class="lista-jogadores-card">
                    ${listaJogadoresHtml}
                </ul>
            `;

            container.appendChild(card);
        });

        let btnCopiar = document.getElementById('btn-copiar-lista');
        if (!btnCopiar) {
            btnCopiar = document.createElement('button');
            btnCopiar.id = 'btn-copiar-lista';
            btnCopiar.className = 'btn btn-primary';
            btnCopiar.style.width = '100%';
            btnCopiar.style.marginTop = '12px';
            btnCopiar.innerHTML = '📋 Copiar Lista de Times';
            
            btnCopiar.addEventListener('click', copiarListaTimes);
            
            if (container.parentNode) {
                container.parentNode.appendChild(btnCopiar);
            }
        }

        const resDiv = document.getElementById('resultado-sorteio');
        if (resDiv) resDiv.classList.remove('hidden');
    }

    async function copiarListaTimes() {
        if (!sorteioAtual || sorteioAtual.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }

        let textoFormatado = `*RESULTADO DO SORTEIO*\n\n`;

        sorteioAtual.forEach((t, i) => {
            const media = (t.jogadores.length > 0 ? (t.somaEstrelas / t.jogadores.length) : 0).toFixed(1).replace('.', ',');
            textoFormatado += `*${t.nome.toUpperCase()}* (Média: ⭐ ${media})\n`;
            t.jogadores.forEach((j, index) => {
                const tagGoleiro = j.isGoleiro ? ' 🧤' : '';
                const estFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
                textoFormatado += `${index + 1}. ${j.nome}${tagGoleiro} (⭐ ${estFmt})\n`;
            });

            if (i < sorteioAtual.length - 1) {
                textoFormatado += `\n`;
            }
        });

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textoFormatado).then(async () => {
                toast('Lista copiada! Agora é só colar no WhatsApp.');
            }).catch(err => {
                fallbackCopiarTexto(textoFormatado);
            });
        } else {
            fallbackCopiarTexto(textoFormatado);
        }
    }

    async function fallbackCopiarTexto(texto) {
        const textArea = document.createElement('textarea');
        textArea.value = texto;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            toast('Lista copiada! Agora é só colar no WhatsApp.');
        } catch (err) {
            await mostrarAlerta('❌ Erro ao copiar automaticamente. Tente novamente.', 'ERRO');
        }

        document.body.removeChild(textArea);
    }

    // --- 5. ABA CAMPEONATO & SELETOR DE MODOS ---
    const btnIniciarCamp = document.getElementById('btn-iniciar-campeonato');
    if (btnIniciarCamp) {
        btnIniciarCamp.addEventListener('click', async () => {
            if (sorteioAtual.length < 2) {
                await mostrarAlerta('Realize o sorteio dos times primeiro!', '🏆 CAMPEONATO');
                return;
            }

            // sortear de novo NÃO mexe no campeonato em andamento; só "Iniciar" substitui
            const emAndamento = timesSorteados.length > 0 && (partidas.some(p => p.finalizada) || partidasRachaHistorico.length > 0);
            if (emAndamento) {
                const ok = await mostrarConfirmacao('Já existe um campeonato em andamento. Iniciar um novo substitui o atual (sem salvar no histórico). Continuar?', '⚠️ SUBSTITUIR CAMPEONATO');
                if (!ok) return;
            }
            timesSorteados = sorteioAtual.map(Logica.normalizarTime);
            partidasRachaHistorico = [];
            tipoDesempateRacha = null;
            
            // ALTERAÇÃO 2: Reseta o contador ao iniciar um campeonato
            contadorSorteios = 0;

            inicializarClassificacao();
            if (modoJogoAtual === 'todos-contra-todos') {
                gerarTabelaTodosContraTodos();
            } else {
                iniciarModoRachaLivre(true);
            }
            
            artilharia = {};
            partidaAtualIndex = 0;

            // ALTERAÇÃO 3: Salva o estado inicial do campeonato no Firebase
            salvarCampeonatoAtivo();

            irParaAba('tab-campeonato');
        });
    }

    function gerarTabelaTodosContraTodos() {
        partidas = Logica.gerarPartidas(timesSorteados);
    }

    function iniciarModoRachaLivre(resetar = false) {
        if (resetar) {
            partidasRachaHistorico = [];
            if (timesSorteados.length >= 2) {
                timeEmCampoA = timesSorteados[0];
                timeEmCampoB = timesSorteados[1];
                filaTimes = timesSorteados.slice(2);
            }
        }
    }

    function inicializarClassificacao() {
        classificacao = Logica.novaClassificacao(timesSorteados);
    }

    // garante uma linha na tabela para cada time (dados antigos/incompletos)
    function garantirClassificacao() {
        const base = Logica.novaClassificacao(timesSorteados);
        Object.keys(base).forEach(k => { if (!classificacao[k]) classificacao[k] = base[k]; });
    }

    function renderizarCampeonato() {
        renderizarSeletorModoDisputa();
        renderizarTabela();

        if (modoJogoAtual === 'todos-contra-todos') {
            renderizarPartidaAtualTodosContraTodos();
            renderizarConfrontosEncerrados();
        } else {
            renderizarPartidaAtualRachaLivre();
            renderizarConfrontosEncerradosRacha();
        }
        renderizarArtilharia();
    }

    function renderizarSeletorModoDisputa() {
        const container = document.getElementById('painel-partida-atual');
        if (!container) return;

        let seletorDiv = document.getElementById('box-seletor-modo');
        if (!seletorDiv) {
            seletorDiv = document.createElement('div');
            seletorDiv.id = 'box-seletor-modo';
            seletorDiv.style.cssText = 'background: rgba(255,255,255,0.05); padding: 8px; border-radius: 6px; margin-bottom: 12px;';
            seletorDiv.innerHTML = `
                <label style="font-size: 0.85rem; font-weight: bold; display: block; margin-bottom: 4px;">🎯 Modo de Disputa:</label>
                <select id="select-modo-disputa" style="width: 100%; padding: 6px; border-radius: 4px; font-weight: bold;">
                    <option value="todos-contra-todos">Tabela (Todos contra Todos)</option>
                    <option value="racha-livre">Racha Livre (Vencedor Fica)</option>
                </select>
            `;
            container.parentNode.insertBefore(seletorDiv, container);

            const sel = document.getElementById('select-modo-disputa');
            if (sel) {
                sel.value = modoJogoAtual;
                sel.addEventListener('change', async (e) => {
                    const novoModo = e.target.value;
                    if (novoModo === modoJogoAtual) return;

                    const temResultados = partidas.some(p => p.finalizada) || partidasRachaHistorico.length > 0 || Object.keys(artilharia).length > 0;
                    if (temResultados) {
                        const ok = await mostrarConfirmacao('Trocar o modo de disputa apaga os resultados e a artilharia deste campeonato. Continuar?', '⚠️ TROCAR MODO');
                        if (!ok) { e.target.value = modoJogoAtual; return; }
                    }

                    modoJogoAtual = novoModo;
                    partidas = [];
                    partidaAtualIndex = 0;
                    artilharia = {};
                    partidasRachaHistorico = [];
                    tipoDesempateRacha = null;
                    inicializarClassificacao();
                    if (modoJogoAtual === 'racha-livre') {
                        iniciarModoRachaLivre(true);
                    } else if (timesSorteados.length >= 2) {
                        gerarTabelaTodosContraTodos();
                    }
                    salvarCampeonatoAtivo();
                    renderizarCampeonato();
                });
            }
        } else {
            const sel = document.getElementById('select-modo-disputa');
            if (sel) sel.value = modoJogoAtual;
        }
    }

    function renderizarTabela() {
        const body = document.getElementById('body-classificacao');
        if (!body) return;
        body.innerHTML = '';

        const listaClass = Logica.ordenarClassificacao(Object.values(classificacao));

        listaClass.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:left;"><strong>${escapeHtml(c.nome)}</strong></td>
                <td><strong>${c.p}</strong></td>
                <td>${c.j}</td>
                <td>${c.v}</td>
                <td>${c.e}</td>
                <td>${c.d}</td>
                <td>${c.gp}</td>
                <td>${c.sg}</td>
            `;
            body.appendChild(tr);
        });
    }

    // --- MODO 1: TODOS CONTRA TODOS ---
    function renderizarPartidaAtualTodosContraTodos() {
        const container = document.getElementById('painel-partida-atual');
        if (!container) return;

        if (timesSorteados.length < 2) {
            container.innerHTML = '<p class="subtext">Realize o sorteio dos times primeiro no menu Sorteio!</p>';
            return;
        }

        if (partidas.length === 0) {
            container.innerHTML = `
                <p class="subtext" style="text-align:center;">Nenhuma tabela gerada para este campeonato.</p>
                <button id="btn-gerar-tabela-direto" class="btn btn-primary" style="margin-top:10px; width:100%;">Gerar Tabela de Confrontos</button>
            `;
            document.getElementById('btn-gerar-tabela-direto')?.addEventListener('click', () => {
                gerarTabelaTodosContraTodos();
                inicializarClassificacao();
                partidaAtualIndex = 0;
                salvarCampeonatoAtivo();
                renderizarCampeonato();
            });
            return;
        }

        if (partidaAtualIndex >= partidas.length) {
            container.innerHTML = '<h3 style="text-align:center;">✅ Todos os jogos da tabela foram realizados!</h3><p class="subtext" style="text-align:center; margin-top:4px;">Clique em "Finalizar Campeonato" abaixo para salvar no histórico.</p>';
            return;
        }

        const p = partidas[partidaAtualIndex];

        const opcoesTimesA = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeA.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');
        const opcoesTimesB = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeB.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');

        container.innerHTML = `
            <p class="subtext" style="text-align:center; margin-bottom: 6px; font-size: 0.8rem;">
               <strong>Rodada ${p.rodada}</strong> - Escolha os times que vão jogar abaixo:
            </p>
            <div class="placar-box" style="gap:10px;">
                <div class="time-placar" style="flex:1;">
                    <select id="select-mudar-time-a" style="width:100%; padding:6px; font-weight:bold; border-radius:4px; text-align:center; margin-bottom:6px;">
                        ${opcoesTimesA}
                    </select>
                    <input type="number" id="gols-a" value="0" min="0">
                </div>
                
                <span style="font-size:1.2rem; font-weight:bold; align-self:center;">X</span>
                
                <div class="time-placar" style="flex:1;">
                    <select id="select-mudar-time-b" style="width:100%; padding:6px; font-weight:bold; border-radius:4px; text-align:center; margin-bottom:6px;">
                        ${opcoesTimesB}
                    </select>
                    <input type="number" id="gols-b" value="0" min="0">
                </div>
            </div>

            <div id="box-penaltis" class="penaltis-box hidden">
                <p class="subtext" style="text-align:center;">Empate! Decisão nos Pênaltis:</p>
                <div class="form-group-row">
                    <label id="lbl-pen-a">${escapeHtml(p.timeA.nome)}:</label>
                    <input type="number" id="pen-a" value="0" min="0">
                </div>
                <div class="form-group-row">
                    <label id="lbl-pen-b">${escapeHtml(p.timeB.nome)}:</label>
                    <input type="number" id="pen-b" value="0" min="0">
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <label class="subtext">Registrar Gol Individual:</label>
                <div class="form-group-row">
                    <select id="select-artilheiro" style="width:70%; padding:6px; border-radius:4px;"></select>
                    <button id="btn-add-gol" class="btn btn-secondary" style="width:25%;">+ Gol</button>
                </div>
            </div>

            <button id="btn-finalizar-partida" class="btn btn-primary">Finalizar Partida</button>
        `;

        const atualizarListaArtilheiros = () => {
            const selectArt = document.getElementById('select-artilheiro');
            if (!selectArt) return;
            const todosJogadores = p.timeA.jogadores.concat(p.timeB.jogadores);
            selectArt.innerHTML = todosJogadores.map(j => `<option value="${escapeHtml(j.nome)}">${escapeHtml(j.nome)}</option>`).join('');
            
            const lblPenA = document.getElementById('lbl-pen-a');
            const lblPenB = document.getElementById('lbl-pen-b');
            if (lblPenA) lblPenA.textContent = `${p.timeA.nome}:`;
            if (lblPenB) lblPenB.textContent = `${p.timeB.nome}:`;
        };

        const selectA = document.getElementById('select-mudar-time-a');
        const selectB = document.getElementById('select-mudar-time-b');

        if (selectA) {
            selectA.addEventListener('change', (e) => {
                const idEscolhido = parseInt(e.target.value);
                const timeEncontrado = timesSorteados.find(t => t.id === idEscolhido);
                if (timeEncontrado) {
                    p.timeA = timeEncontrado;
                    atualizarListaArtilheiros();
                    salvarCampeonatoAtivo();
                }
            });
        }

        if (selectB) {
            selectB.addEventListener('change', (e) => {
                const idEscolhido = parseInt(e.target.value);
                const timeEncontrado = timesSorteados.find(t => t.id === idEscolhido);
                if (timeEncontrado) {
                    p.timeB = timeEncontrado;
                    atualizarListaArtilheiros();
                    salvarCampeonatoAtivo();
                }
            });
        }

        atualizarListaArtilheiros();

        const inputA = document.getElementById('gols-a');
        const inputB = document.getElementById('gols-b');
        const boxPenaltis = document.getElementById('box-penaltis');

        const checarEmpate = () => {
            if (parseInt(inputA.value) === parseInt(inputB.value)) {
                boxPenaltis.classList.remove('hidden');
            } else {
                boxPenaltis.classList.add('hidden');
            }
        };

        if (inputA && inputB) {
            inputA.addEventListener('input', checarEmpate);
            inputB.addEventListener('input', checarEmpate);
        }

        const btnAddGol = document.getElementById('btn-add-gol');
        if (btnAddGol) {
            btnAddGol.addEventListener('click', () => {
                const selectArtilheiro = document.getElementById('select-artilheiro');
                if (!selectArtilheiro) return;
                const nomeArtilheiro = selectArtilheiro.value;
                const chave = Logica.chaveSegura(nomeArtilheiro);
                artilharia[chave] = (artilharia[chave] || 0) + 1;
                salvarCampeonatoAtivo();
                renderizarArtilharia();
            });
        }

        const btnFinPartida = document.getElementById('btn-finalizar-partida');
        if (btnFinPartida) {
            btnFinPartida.addEventListener('click', async () => {
                if (p.timeA.id === p.timeB.id) {
                    await mostrarAlerta('Um time não pode jogar contra ele mesmo! Escolha times diferentes.', '⚠️ AVISO');
                    return;
                }

                const gA = parseInt(inputA.value) || 0;
                const gB = parseInt(inputB.value) || 0;

                let pA = 0, pB = 0;
                if (gA === gB) {
                    const elPenA = document.getElementById('pen-a');
                    const elPenB = document.getElementById('pen-b');
                    pA = elPenA ? (parseInt(elPenA.value) || 0) : 0;
                    pB = elPenB ? (parseInt(elPenB.value) || 0) : 0;
                    if (pA === pB) {
                        await mostrarAlerta('Defina o vencedor nos pênaltis!', '⚽ PÊNALTIS');
                        return;
                    }
                }

                p.golsA = gA;
                p.golsB = gB;
                p.penaltisA = pA;
                p.penaltisB = pB;

                garantirClassificacao();
                Logica.aplicarResultado(classificacao, p.timeA.id, p.timeB.id, gA, gB, pA, pB);

                p.finalizada = true;
                partidaAtualIndex++;
                salvarCampeonatoAtivo();
                renderizarCampeonato();
            });
        }
    }

    // --- MODO 2: RACHA LIVRE ---
    function renderizarPartidaAtualRachaLivre() {
        const container = document.getElementById('painel-partida-atual');
        if (!container) return;

        if (!timeEmCampoA || !timeEmCampoB) {
            container.innerHTML = '<p class="subtext">Defina os times sorteados para começar o Racha Livre.</p>';
            return;
        }

        const filaHtml = filaTimes.length > 0
            ? filaTimes.map((t, idx) => `<li><strong>${idx + 1}º Próximo:</strong> ${escapeHtml(t.nome)}</li>`).join('')
            : '<li>Nenhum time na fila de espera.</li>';

        container.innerHTML = `
            <div style="margin-bottom:12px; background:rgba(255,255,255,0.03); padding:8px; border-radius:6px;">
                <p class="subtext" style="margin-bottom:4px; font-weight:bold;">⏳ Fila de Espera (Próximos a jogar):</p>
                <ul style="list-style:none; padding:0; margin:0; font-size:0.85rem;">
                    ${filaHtml}
                </ul>
            </div>

            <div class="placar-box">
                <div class="time-placar">
                    <p><strong>${escapeHtml(timeEmCampoA.nome)}</strong></p>
                    <input type="number" id="racha-gols-a" value="0" min="0">
                </div>
                
                <span style="font-size:1.5rem; font-weight:bold;">X</span>
                
                <div class="time-placar">
                    <p><strong>${escapeHtml(timeEmCampoB.nome)}</strong></p>
                    <input type="number" id="racha-gols-b" value="0" min="0">
                </div>
            </div>

            <div id="box-desempate-racha" class="penaltis-box hidden">
                <p class="subtext" style="text-align:center;">Empate! Escolha quem avança:</p>
                <div style="display:flex; gap:10px; justify-content:center; margin-top:6px;">
                    <button id="btn-empate-sai-a" class="btn btn-secondary">${escapeHtml(timeEmCampoA.nome)} Avança</button>
                    <button id="btn-empate-sai-b" class="btn btn-secondary">${escapeHtml(timeEmCampoB.nome)} Avança</button>
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <label class="subtext">Registrar Gol Individual:</label>
                <div class="form-group-row">
                    <select id="select-artilheiro-racha" style="width:70%; padding:6px; border-radius:4px;"></select>
                    <button id="btn-add-gol-racha" class="btn btn-secondary" style="width:25%;">+ Gol</button>
                </div>
            </div>

            <button id="btn-finalizar-racha" class="btn btn-primary">Finalizar Partida e Rodar Fila</button>
        `;

        const selectArt = document.getElementById('select-artilheiro-racha');
        if (selectArt) {
            const todosJ = timeEmCampoA.jogadores.concat(timeEmCampoB.jogadores);
            selectArt.innerHTML = todosJ.map(j => `<option value="${escapeHtml(j.nome)}">${escapeHtml(j.nome)}</option>`).join('');
        }

        const btnAddGolRacha = document.getElementById('btn-add-gol-racha');
        if (btnAddGolRacha) {
            btnAddGolRacha.addEventListener('click', () => {
                if (!selectArt) return;
                const nomeArt = selectArt.value;
                const chave = Logica.chaveSegura(nomeArt);
                artilharia[chave] = (artilharia[chave] || 0) + 1;
                salvarCampeonatoAtivo();
                renderizarArtilharia();
            });
        }

        const inputA = document.getElementById('racha-gols-a');
        const inputB = document.getElementById('racha-gols-b');
        const boxDesempate = document.getElementById('box-desempate-racha');

        const checarEmpateRacha = () => {
            if (parseInt(inputA.value) === parseInt(inputB.value)) {
                boxDesempate.classList.remove('hidden');
            } else {
                boxDesempate.classList.add('hidden');
                tipoDesempateRacha = null;
            }
        };

        if (inputA && inputB) {
            inputA.addEventListener('input', checarEmpateRacha);
            inputB.addEventListener('input', checarEmpateRacha);
        }

        document.getElementById('btn-empate-sai-a')?.addEventListener('click', () => {
            tipoDesempateRacha = 'A';
            mostrarAlerta(`${timeEmCampoA.nome} configurado para avançar!`, '🤝 EMPATE');
        });

        document.getElementById('btn-empate-sai-b')?.addEventListener('click', () => {
            tipoDesempateRacha = 'B';
            mostrarAlerta(`${timeEmCampoB.nome} configurado para avançar!`, '🤝 EMPATE');
        });

        const btnFinRacha = document.getElementById('btn-finalizar-racha');
        if (btnFinRacha) {
            btnFinRacha.addEventListener('click', async () => {
                const gA = parseInt(inputA.value) || 0;
                const gB = parseInt(inputB.value) || 0;

                let vencedor = null;
                let perdedor = null;

                if (gA > gB) {
                    vencedor = timeEmCampoA;
                    perdedor = timeEmCampoB;
                } else if (gB > gA) {
                    vencedor = timeEmCampoB;
                    perdedor = timeEmCampoA;
                } else {
                    if (!tipoDesempateRacha) {
                        await mostrarAlerta('Em caso de empate, escolha qual time avança nos botões acima!', '🤝 DESEMPATE');
                        return;
                    }
                    if (tipoDesempateRacha === 'A') {
                        vencedor = timeEmCampoA;
                        perdedor = timeEmCampoB;
                    } else {
                        vencedor = timeEmCampoB;
                        perdedor = timeEmCampoA;
                    }
                }

                // Atualiza classificação (no racha, empate vale 1 ponto; quem avança é o desempate)
                garantirClassificacao();
                Logica.aplicarResultado(classificacao, timeEmCampoA.id, timeEmCampoB.id, gA, gB, 0, 0);

                partidasRachaHistorico.push({
                    idPartida: partidasRachaHistorico.length + 1,
                    timeA: timeEmCampoA,
                    timeB: timeEmCampoB,
                    golsA: gA,
                    golsB: gB,
                    vencedor: vencedor.nome
                });

                // Atualiza a fila
                if (filaTimes.length > 0) {
                    filaTimes.push(perdedor);
                    timeEmCampoA = vencedor;
                    timeEmCampoB = filaTimes.shift();
                } else {
                    // Sem fila, apenas mantem
                }

                tipoDesempateRacha = null;
                salvarCampeonatoAtivo();
                renderizarCampeonato();
            });
        }
    }

    function renderizarConfrontosEncerrados() {
        const container = document.getElementById('lista-confrontos-encerrados');
        if (!container) return;

        const partidasFinalizadas = partidas.filter(p => p.finalizada);
        if (partidasFinalizadas.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum confronto finalizado ainda.</p>';
            return;
        }

        container.innerHTML = partidasFinalizadas.map(p => {
            const penaltisTxt = p.golsA === p.golsB ? ` (Pênaltis: ${p.penaltisA} x ${p.penaltisB})` : '';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                    <span><strong>Rodada ${p.rodada}:</strong> ${escapeHtml(p.timeA.nome)} ${p.golsA} x ${p.golsB} ${escapeHtml(p.timeB.nome)}${penaltisTxt}</span>
                </div>
            `;
        }).join('');
    }

    function renderizarConfrontosEncerradosRacha() {
        const container = document.getElementById('lista-confrontos-encerrados');
        if (!container) return;

        if (partidasRachaHistorico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum confronto finalizado ainda.</p>';
            return;
        }

        container.innerHTML = partidasRachaHistorico.map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <span><strong>Jogo ${p.idPartida}:</strong> ${escapeHtml(p.timeA.nome)} ${p.golsA} x ${p.golsB} ${escapeHtml(p.timeB.nome)} (Avançou: ${escapeHtml(p.vencedor)})</span>
            </div>
        `).join('');
    }

    function renderizarArtilharia() {
        const container = document.getElementById('lista-artilharia');
        if (!container) return;

        const lista = Object.entries(artilharia).sort((a, b) => b[1] - a[1]);
        if (lista.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum gol marcado ainda.</p>';
            return;
        }

        container.innerHTML = lista.map(([nome, gols]) => `
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <span>⚽ ${escapeHtml(nome)}</span>
                <strong>${gols} gol(s)</strong>
            </div>
        `).join('');
    }

    // --- 6. FINALIZAR CAMPEONATO E SALVAR HISTÓRICO ---
    const btnFinalizarCamp = document.getElementById('btn-finalizar-campeonato');
    if (btnFinalizarCamp) {
        btnFinalizarCamp.addEventListener('click', async () => {
            if (timesSorteados.length === 0) {
                await mostrarAlerta('Não há campeonato ativo para finalizar!', '⚠️ AVISO');
                return;
            }

            const confirmou = await mostrarConfirmacao('Tem certeza que deseja finalizar este campeonato e enviá-lo para o histórico?', '🏁 FINALIZAR');
            if (!confirmou) return;

            const dataAtual = new Date().toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const edicaoHistorico = {
                id: Date.now(),
                data: dataAtual,
                modo: modoJogoAtual,
                times: timesSorteados,
                classificacao: { ...classificacao },
                artilharia: { ...artilharia },
                partidas: modoJogoAtual === 'todos-contra-todos' ? partidas.filter(p => p.finalizada) : partidasRachaHistorico
            };

            historico.unshift(edicaoHistorico);
            salvarHistoricoFirebase();

            // ALTERAÇÃO 3: Apaga o registro do campeonato ativo no Firebase ao finalizar
            limparCampeonatoAtivo();

            // Reseta variáveis locais
            timesSorteados = [];
            partidas = [];
            partidasRachaHistorico = [];
            classificacao = {};
            artilharia = {};
            partidaAtualIndex = 0;
            timeEmCampoA = null;
            timeEmCampoB = null;
            filaTimes = [];

            renderizarCampeonato();
            renderizarHistorico();

            irParaAba('tab-historico');

            toast('🏁 Campeonato finalizado e salvo no histórico!');
        });
    }

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('button[data-acao="excluir-hist"]');
            if (btn) window.excluirHistorico(btn.dataset.id);
        };

        if (historico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum campeonato finalizado até o momento.</p>';
            return;
        }

        const limiteHist = window.Monetizacao ? window.Monetizacao.limiteHistorico() : Infinity;
        const visiveis = historico.slice(0, limiteHist);
        const ocultos = historico.length - visiveis.length;

        container.innerHTML = visiveis.map((h, i) => {
            const classLista = Logica.ordenarClassificacao(Object.values(h.classificacao || {}));
            const campeao = classLista.length > 0 ? classLista[0].nome : 'N/A';

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>🏆 Edição de ${h.data}</h3>
                        <button class="btn btn-danger" style="padding:2px 8px; font-size:0.8rem;" data-acao="excluir-hist" data-id="${h.id}">🗑️ Excluir</button>
                    </div>
                    <p class="subtext">Modo: ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha Livre'} | 🥇 Campeão: <strong>${escapeHtml(campeao)}</strong></p>
                </div>
            `;
        }).join('') + (ocultos > 0 ? `
            <div class="card card-bloqueado" onclick="window.Monetizacao && window.Monetizacao.abrirModal('Você tem ${ocultos} campeonato(s) antigo(s) guardados. Seja Pro para ver todo o histórico!')">
                <h3>🔒 +${ocultos} campeonato(s) no histórico</h3>
                <p class="subtext" style="margin:6px 0 0;">Seus dados estão salvos. Toque para liberar com o Plano Pro.</p>
            </div>` : '');
    }

    // Quando o plano do usuário carregar/mudar, redesenha o que depende dele
    window.aoMudarPlano = function() { renderizarHistorico(); };

    window.excluirHistorico = async function(id) {
        const confirmou = await mostrarConfirmacao('Deseja excluir este registro do histórico?', '🗑️ EXCLUIR HISTÓRICO');
        if (confirmou) {
            historico = historico.filter(h => h.id != id);
            salvarHistoricoFirebase();
            renderizarHistorico();
        }
    };
});
