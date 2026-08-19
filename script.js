// --- VARIÁVEIS GLOBAIS DE CONTROLE DE MODO E AUTENTICAÇÃO ---
let isLoginMode = true; // Controla se o form é de Login (true) ou Cadastro (false)
let modoJogoAtual = 'todos-contra-todos'; // 'todos-contra-todos' ou 'racha-livre'

// Variáveis de controle do modo racha livre
let filaTimes = [];
let timeEmCampoA = null;
let timeEmCampoB = null;
let partidasRachaHistorico = [];
let tipoDesempateRacha = null; // Controla o tipo de desempate escolhido em caso de empate

// --- VERSÃO ATUAL DO APLICATIVO ---
// Lembre-se de atualizar este número toda vez que lançar um novo APK/versão do app!
const VERSAO_ATUAL_APP = "1.0.0";

// --- INTERRUPTOR REMOTO (KILL SWITCH GLOBAL E POR VERSÕES) VIA FIREBASE ---
function verificarStatusAppRemoto() {
    const checar = setInterval(() => {
        if (window.firebaseDb && window.firebaseFns) {
            clearInterval(checar);
            
            // Referência para a pasta de configurações no Realtime Database
            const configRef = window.firebaseFns.ref(window.firebaseDb, 'configuracoes');
            
            window.firebaseFns.get(configRef).then((snapshot) => {
                if (snapshot.exists()) {
                    const config = snapshot.val();
                    
                    // 1. CHECAGEM GLOBAL (Se o app inteiro foi desligado no painel)
                    const globalAtivo = config.global?.app_ativo;
                    if (globalAtivo === false) {
                        const mensagemPersonalizada = config.global?.mensagem_desativacao || "Este aplicativo foi descontinuado permanentemente.";
                        bloquearTelaApp("⚠️ Aplicativo Desativado", mensagemPersonalizada);
                        return;
                    }
                    
                    // 2. CHECAGEM POR VERSÃO MÍNIMA (Bloqueio total)
                    const versaoMinima = config.versoes?.versao_minima_permitida;
                    if (versaoMinima && compararversoes(VERSAO_ATUAL_APP, versaoMinima) < 0) {
                        bloquearTelaApp(
                            "⚠️ Atualização Obrigatória", 
                            `Esta versão (${VERSAO_ATUAL_APP}) do aplicativo está desatualizada. Por favor, baixe a nova versão (mínima: ${versaoMinima}) para continuar jogando!`
                        );
                        return;
                    }

                    // 3. ALTERAÇÃO 1: CHECAGEM SOFT (Aviso de nova versão não-bloqueante)
                    const versaoMaisRecente = config.versoes?.versao_mais_recente;
                    const linkDownload = config.versoes?.link_download;
                    if (versaoMaisRecente && compararversoes(VERSAO_ATUAL_APP, versaoMaisRecente) < 0) {
                        exibirBannerAtualizacao(versaoMaisRecente, linkDownload);
                    }
                }
            }).catch((err) => {
                console.log("Erro ao checar status remoto:", err);
            });
        }
    }, 300);
}

// Função para exibir o aviso soft de atualização no topo
function exibirBannerAtualizacao(novaVersao, linkDownload) {
    if (document.getElementById('banner-soft-update')) return;

    const banner = document.createElement('div');
    banner.id = 'banner-soft-update';
    banner.style.cssText = `
        background-color: #1976D2;
        color: #ffffff;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.9rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        position: sticky;
        top: 0;
        z-index: 9999;
    `;

    banner.innerHTML = `
        <span>🚀 Uma nova versão (<strong>v${novaVersao}</strong>) está disponível!</span>
        <div style="display: flex; gap: 8px; align-items: center;">
            ${linkDownload ? `<button id="btn-atualizar-soft" style="background:#ffffff; color:#1976D2; border:none; padding:4px 10px; border-radius:4px; font-weight:bold; cursor:pointer;">Atualizar agora</button>` : ''}
            <button id="btn-fechar-soft" style="background:transparent; color:#ffffff; border:none; font-size:1.1rem; cursor:pointer; padding:0 4px;">✕</button>
        </div>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    const btnAtualizar = document.getElementById('btn-atualizar-soft');
    if (btnAtualizar && linkDownload) {
        btnAtualizar.addEventListener('click', () => {
            window.open(linkDownload, '_blank');
        });
    }

    const btnFechar = document.getElementById('btn-fechar-soft');
    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            banner.remove();
        });
    }
}

// Função auxiliar para comparar números de versão (Ex: "1.0.0" vs "1.1.0")
function compararversoes(v1, v2) {
    const p1 = String(v1).split('.').map(Number);
    const p2 = String(v2).split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

// Função para injetar a tela de bloqueio se alguma regra for acionada
function bloquearTelaApp(titulo, mensagem) {
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#121212; color:#fff; text-align:center; padding:20px; font-family:sans-serif;">
            <h2 style="color:#ff5252; margin-bottom:10px;">${titulo}</h2>
            <p style="color:#aaa; font-size:0.95rem; max-width:320px; line-height:1.5;">
                ${mensagem}
            </p>
        </div>
    `;
}

// Inicia a verificação de segurança/atualização assim que o script carrega
verificarStatusAppRemoto();

// --- FUNÇÕES DE AUTENTICAÇÃO DO FIREBASE ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById("auth-subtitle");
    const btnAction = document.getElementById("btn-auth-action");
    const btnSwitch = document.getElementById("btn-auth-switch");
    const linkEsqueciSenha = document.getElementById("btn-esqueci-senha");

    if (!title || !btnAction || !btnSwitch) return;

    if (isLoginMode) {
        title.innerText = "Faça login para continuar";
        btnAction.innerText = "Entrar";
        btnSwitch.innerText = "Não tem conta? Cadastre-se";
        if (linkEsqueciSenha) linkEsqueciSenha.style.display = "block";
    } else {
        title.innerText = "Crie sua nova conta gratuita";
        btnAction.innerText = "Cadastrar";
        btnSwitch.innerText = "Já tem conta? Faça login";
        if (linkEsqueciSenha) linkEsqueciSenha.style.display = "none";
    }
}

async function handleAuthAction() {
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    
    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        await mostrarAlerta("Preencha o e-mail e a senha!", "⚠️ AVISO");
        return;
    }

    try {
        if (isLoginMode) {
            await window.firebaseFns.signInWithEmailAndPassword(window.firebaseAuth, email, password);
            await mostrarAlerta("Login realizado com sucesso!", "🚀 SUCESSO");
        } else {
            await window.firebaseFns.createUserWithEmailAndPassword(window.firebaseAuth, email, password);
            await mostrarAlerta("Conta criada com sucesso!", "🚀 SUCESSO");
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            await mostrarAlerta("Este e-mail já está cadastrado! Use outro ou faça login.", "⚠️ ERRO");
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            await mostrarAlerta("E-mail ou senha incorretos.", "⚠️ ERRO");
        } else if (error.code === 'auth/weak-password') {
            await mostrarAlerta("A senha precisa ter pelo menos 6 caracteres.", "⚠️ AVISO");
        } else {
            await mostrarAlerta("Erro: " + error.message, "❌ ERRO");
        }
    }
}

// --- FUNÇÃO DE RECUPERAÇÃO DE SENHA ---
async function handleForgotPassword() {
    const emailInput = document.getElementById("auth-email");
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (!email) {
        await mostrarAlerta("Digite o seu e-mail no campo acima para recuperar a senha.", "⚠️ AVISO");
        emailInput.focus();
        return;
    }

    if (!window.firebaseAuth || !window.firebaseFns) {
        await mostrarAlerta("❌ Erro: O sistema de autenticação do Firebase não foi carregado.", "❌ ERRO");
        return;
    }

    try {
        await window.firebaseFns.sendPasswordResetEmail(window.firebaseAuth, email);
        await mostrarAlerta("✅ E-mail de recuperação de senha enviado! Verifique sua caixa de entrada e spam.", "📧 RECUPERAÇÃO");
    } catch (error) {
        console.error("Erro ao enviar e-mail de recuperação:", error);
        if (error.code === 'auth/user-not-found') {
            await mostrarAlerta("❌ Não há usuário cadastrado com este e-mail.", "❌ ERRO");
        } else if (error.code === 'auth/invalid-email') {
            await mostrarAlerta("❌ O formato do e-mail é inválido.", "❌ ERRO");
        } else {
            await mostrarAlerta("❌ Erro ao enviar e-mail de recuperação: " + error.message, "❌ ERRO");
        }
    }
}

// --- FUNÇÃO DE LOGIN COM O GOOGLE ---
async function handleGoogleLogin() {
    if (!window.firebaseAuth || !window.firebaseFns) {
        await mostrarAlerta("❌ Erro: O sistema de autenticação do Firebase não foi carregado.", "❌ ERRO");
        return;
    }

    try {
        const provider = new window.firebaseFns.GoogleAuthProvider();
        await window.firebaseFns.signInWithPopup(window.firebaseAuth, provider);
        console.log("Login com o Google realizado com sucesso!");
    } catch (error) {
        console.error("Erro detalhado no login com o Google:", error);
        
        if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
            console.log("Ação de login com o Google cancelada ou fechada pelo usuário.");
            return;
        }

        if (error.code === 'auth/unauthorized-domain') {
            await mostrarAlerta("❌ Erro: Este domínio não está autorizado no painel do Firebase (Authentication > Settings > Authorized domains).", "❌ ERRO");
        } else {
            await mostrarAlerta("❌ Erro ao entrar com o Google: " + error.message, "❌ ERRO");
        }
    }
}

// --- FUNÇÕES DE CONTROLE DO MENU LATERAL (DRAWER) ---
function toggleDrawer() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('hidden');
    }
}

function navegarParaAba(targetTabId) {
    const btnTarget = document.querySelector(`.tab-btn[data-tab="${targetTabId}"]`);
    if (btnTarget) {
        btnTarget.click();
    }
    toggleDrawer();
}

async function fazerLogout() {
    try {
        if (window.firebaseAuth && window.firebaseFns) {
            await window.firebaseFns.signOut(window.firebaseAuth);
            toggleDrawer();
            console.log("Usuário deslogado com sucesso.");
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

    const btnGoogle = document.getElementById('btn-google-auth');
    if (btnGoogle) {
        btnGoogle.addEventListener('click', handleGoogleLogin);
    }

    const btnEsqueciSenha = document.getElementById('btn-esqueci-senha');
    if (btnEsqueciSenha) {
        btnEsqueciSenha.addEventListener('click', handleForgotPassword);
    }

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

    // --- MONITOR DE SESSÃO DO FIREBASE ---
    setTimeout(async () => {
        if (window.firebaseAuth && window.firebaseFns) {
            window.firebaseFns.onAuthStateChanged(window.firebaseAuth, (user) => {
                const authScreen = document.getElementById("auth-screen");
                const drawerEmail = document.getElementById("drawer-user-email");
                
                if (user) {
                    currentUserUid = user.uid;
                    if (authScreen) authScreen.classList.add("hidden");
                    if (drawerEmail) drawerEmail.textContent = user.email || "Usuário Google";
                    console.log("Usuário logado:", user.email);
                    carregarDadosDoFirebase();
                } else {
                    currentUserUid = null;
                    if (authScreen) authScreen.classList.remove("hidden");
                    if (drawerEmail) drawerEmail.textContent = "Carregando...";
                }
            });
        }
    }, 500);

    // --- ALTERAÇÃO 3: FUNÇÕES DE PERSISTÊNCIA DO CAMPEONATO ATIVO ---
    function salvarCampeonatoAtivo() {
        if (!currentUserUid || !window.firebaseDb) return;
        const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}/campeonatoAtivo`);
        const estadoCamp = {
            modoJogoAtual,
            timesSorteados,
            partidas,
            partidaAtualIndex,
            classificacao,
            artilharia,
            timeEmCampoA,
            timeEmCampoB,
            filaTimes,
            partidasRachaHistorico
        };
        window.firebaseFns.set(dbRef, estadoCamp);
    }

    function limparCampeonatoAtivo() {
        if (!currentUserUid || !window.firebaseDb) return;
        const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}/campeonatoAtivo`);
        window.firebaseFns.set(dbRef, null);
    }

    // --- SINCRONIZAÇÃO COM O FIREBASE ---
    function salvarJogadores() {
        if (!currentUserUid || !window.firebaseDb) return;
        const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}/jogadores`);
        window.firebaseFns.set(dbRef, jogadores);
    }

    function salvarHistoricoFirebase() {
        if (!currentUserUid || !window.firebaseDb) return;
        const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}/historico`);
        window.firebaseFns.set(dbRef, historico);
    }

    function carregarDadosDoFirebase() {
        if (!currentUserUid || !window.firebaseDb) return;
        const userRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${currentUserUid}`);
        
        window.firebaseFns.get(userRef).then((snapshot) => {
            if (snapshot.exists()) {
                const dados = snapshot.val();
                jogadores = dados.jogadores || [];
                historico = dados.historico || [];

                // Restaurar Campeonato Ativo se existir
                if (dados.campeonatoAtivo) {
                    const c = dados.campeonatoAtivo;
                    modoJogoAtual = c.modoJogoAtual || 'todos-contra-todos';
                    timesSorteados = c.timesSorteados || [];
                    partidas = c.partidas || [];
                    partidaAtualIndex = c.partidaAtualIndex || 0;
                    classificacao = c.classificacao || {};
                    artilharia = c.artilharia || {};
                    timeEmCampoA = c.timeEmCampoA || null;
                    timeEmCampoB = c.timeEmCampoB || null;
                    filaTimes = c.filaTimes || [];
                    partidasRachaHistorico = c.partidasRachaHistorico || [];
                }
            } else {
                jogadores = [];
                historico = [];
            }
            renderizarElenco();
            renderizarHistorico();
            if (timesSorteados.length > 0) {
                renderizarCampeonato();
            }
        }).catch((error) => {
            console.error("Erro ao carregar dados do Firebase:", error);
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

    // --- 1. NAVEGAÇÃO DE ABAS ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.add('active');

            if (target === 'tab-sorteio') renderizarPresenca();
            if (target === 'tab-historico') renderizarHistorico();
            if (target === 'tab-campeonato') renderizarCampeonato();
        });
    });

    // --- 2. CRONÔMETRO COM APITO AUTOMÁTICO ---
    const timerDisplay = document.getElementById('timer-display');
    const selectTempo = document.getElementById('select-tempo-predefinido');
    const inputTempoCustom = document.getElementById('input-tempo-custom');

    function atualizarDisplayTimer() {
        if (!timerDisplay) return;
        const min = Math.floor(tempoRestante / 60);
        const seg = tempoRestante % 60;
        timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }

    function definirNovoTempo(minutos) {
        clearInterval(timerInterval);
        timerInterval = null;
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
            if (val && val > 0) {
                definirNovoTempo(val);
            }
        });
    }

    const btnStart = document.getElementById('btn-timer-start');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (timerInterval) return;

            timerInterval = setInterval(() => {
                if (tempoRestante > 0) {
                    tempoRestante--;
                    atualizarDisplayTimer();
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    tocarApitoJuiz();
                    mostrarAlerta('⏰ Fim de jogo! Tempo esgotado.', '⏱️ CRONÔMETRO');
                }
            }, 1000);
        });
    }

    const btnPause = document.getElementById('btn-timer-pause');
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            clearInterval(timerInterval);
            timerInterval = null;
        });
    }

    const btnReset = document.getElementById('btn-timer-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            clearInterval(timerInterval);
            timerInterval = null;
            tempoRestante = tempoTotalSegundos;
            atualizarDisplayTimer();
        });
    }

    function tocarApitoJuiz() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const audioCtx = new AudioCtx();
            
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.frequency.setValueAtTime(2800, audioCtx.currentTime);
            osc2.frequency.setValueAtTime(3200, audioCtx.currentTime);

            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(25, audioCtx.currentTime);
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(300, audioCtx.currentTime);
            lfo.connect(osc1.frequency);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            const agora = audioCtx.currentTime;
            
            gain.gain.setValueAtTime(0.3, agora);
            gain.gain.setValueAtTime(0, agora + 0.3);
            
            gain.gain.setValueAtTime(0.3, agora + 0.4);
            gain.gain.setValueAtTime(0, agora + 0.7);
            
            gain.gain.setValueAtTime(0.4, agora + 0.8);
            gain.gain.setValueAtTime(0, agora + 1.5);

            osc1.start(agora);
            osc2.start(agora);
            lfo.start(agora);

            osc1.stop(agora + 1.5);
            osc2.stop(agora + 1.5);
            lfo.stop(agora + 1.5);
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

            const linhas = textoLote.split('\n');
            let adicionados = 0;

            const filtroInvalido = /pix|pagamento|racha|chegada|chaves|http|@|complexo|arena|valor|\(r\$/i;

            linhas.forEach(linha => {
                let nomeLimpo = linha.replace(/^[0-9]+[\.\-\)\s]*/, '').trim();
                
                if (nomeLimpo.length > 0 && !filtroInvalido.test(nomeLimpo)) {
                    jogadores.push({
                        id: Date.now() + Math.random(),
                        nome: nomeLimpo,
                        isGoleiro: false,
                        estrelas: 3.0,
                        presente: true
                    });
                    adicionados++;
                }
            });

            salvarJogadores();
            renderizarElenco();
            inputLote.value = '';
            await mostrarAlerta(`${adicionados} jogadores válidos adicionados com sucesso!`, '🚀 SUCESSO');
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

            jogadores.push({
                id: Date.now() + Math.random(),
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
                    <small style="color:#D4AF37; font-weight: bold;">(⭐ ${estrelasFormatadas})</small>
                </div>
                <div class="acoes-item">
                    <button class="btn-edit" onclick="abrirEdicao(${j.id})">✏️ Editar</button>
                    <button class="btn btn-danger" style="padding: 2px 8px; margin-left: 5px;" onclick="excluirJogador(${j.id})">🗑️ Excluir</button>
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

    function embaralharArray(array) {
        let copia = [...array];
        for (let i = copia.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    }

    function sortearTimesEstrelasEGoleiros(jogadoresPresentes, qtdTimes) {
        let timesTemp = Array.from({ length: qtdTimes }, (_, i) => ({
            id: i + 1,
            nome: `Time ${i + 1}`,
            jogadores: [],
            temGoleiro: false,
            somaEstrelas: 0
        }));

        let goleiros = jogadoresPresentes.filter(j => j.isGoleiro);
        let linhas = jogadoresPresentes.filter(j => !j.isGoleiro);

        goleiros = embaralharArray(goleiros);
        linhas = embaralharArray(linhas);

        let limitePorTime = 4;
        let indiceTime = 0;
        
        linhas.forEach(j => {
            while (indiceTime < qtdTimes - 1 && timesTemp[indiceTime].jogadores.filter(x => !x.isGoleiro).length >= limitePorTime) {
                indiceTime++;
            }
            timesTemp[indiceTime].jogadores.push(j);
        });

        goleiros.forEach((g, idx) => {
            if (idx < qtdTimes) {
                timesTemp[idx].jogadores.unshift(g);
            } else {
                timesTemp[qtdTimes - 1].jogadores.push(g);
            }
        });

        timesTemp.forEach(t => {
            t.somaEstrelas = t.jogadores.reduce((acc, curr) => acc + Number(curr.estrelas || 3.0), 0);
            t.temGoleiro = t.jogadores.some(j => j.isGoleiro);
        });

        return timesTemp;
    }

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', async () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimesEl = document.getElementById('qtd-times');
            const qtdTimes = qtdTimesEl ? parseInt(qtdTimesEl.value) : 2;

            if (presentes.length < 2) {
                await mostrarAlerta('Poucos jogadores presentes para a quantidade de times!', '🎲 SORTEIO');
                return;
            }

            // ALTERAÇÃO 2: Incrementa o contador de sorteios
            contadorSorteios++;

            timesSorteados = sortearTimesEstrelasEGoleiros(presentes, qtdTimes);
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
            divContador.style.cssText = 'background: rgba(212, 175, 55, 0.15); border: 1px solid #D4AF37; color: #D4AF37; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; text-align: center; font-weight: bold; font-size: 0.9rem;';
            container.parentNode.insertBefore(divContador, container);
        }
        divContador.innerHTML = `🔁 Sorteio realizado <strong>${contadorSorteios}x</strong> nesta sessão`;

        timesSorteados.forEach(t => {
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
        if (!timesSorteados || timesSorteados.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }

        let textoFormatado = `*SORTEIO DE TIMES (EQUILIBRADO)*\n\n`;

        timesSorteados.forEach((t, i) => {
            const mediaEstrelas = (t.jogadores.length > 0 ? (t.somaEstrelas / t.jogadores.length) : 0).toFixed(1).replace('.', ',');
            textoFormatado += `*${t.nome.toUpperCase()}* (Média: ⭐ ${mediaEstrelas})\n`;
            t.jogadores.forEach((j, index) => {
                const tagGoleiro = j.isGoleiro ? ' 🧤' : '';
                const estFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
                textoFormatado += `${index + 1}. ${j.nome}${tagGoleiro} (⭐ ${estFmt})\n`;
            });

            if (i < timesSorteados.length - 1) {
                textoFormatado += `\n\n`;
            }
        });

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textoFormatado).then(async () => {
                await mostrarAlerta('✅ Lista copiada com sucesso! Agora é só colar no WhatsApp.', '📋 COPIAR LISTA');
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
            await mostrarAlerta('✅ Lista copiada com sucesso! Agora é só colar no WhatsApp.', '📋 COPIAR LISTA');
        } catch (err) {
            await mostrarAlerta('❌ Erro ao copiar automaticamente. Tente novamente.', 'ERRO');
        }

        document.body.removeChild(textArea);
    }

    // --- 5. ABA CAMPEONATO & SELETOR DE MODOS ---
    const btnIniciarCamp = document.getElementById('btn-iniciar-campeonato');
    if (btnIniciarCamp) {
        btnIniciarCamp.addEventListener('click', async () => {
            if (timesSorteados.length < 2) {
                await mostrarAlerta('Realize o sorteio dos times primeiro!', '🏆 CAMPEONATO');
                return;
            }
            
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

            const tabCamp = document.querySelector('[data-tab="tab-campeonato"]');
            if (tabCamp) tabCamp.click();
            renderizarCampeonato();
        });
    }

    function gerarTabelaTodosContraTodos() {
        partidas = [];
        let list = [...timesSorteados];
        let n = list.length;

        let tempTimes = [...list];
        if (n % 2 !== 0) {
            tempTimes.push(null);
            n++;
        }

        const totalRodadas = n - 1;
        const jogosPorRodada = n / 2;
        const rodadasGeradas = [];

        for (let r = 0; r < totalRodadas; r++) {
            const jogosRodada = [];
            for (let i = 0; i < jogosPorRodada; i++) {
                let tA = tempTimes[i];
                let tB = tempTimes[n - 1 - i];

                if (tA !== null && tB !== null) {
                    jogosRodada.push({ timeA: tA, timeB: tB });
                }
            }
            rodadasGeradas.push(jogosRodada);
            tempTimes.splice(1, 0, tempTimes.pop());
        }

        rodadasGeradas.reverse();

        rodadasGeradas.forEach((jogosRodada, idx) => {
            jogosRodada.forEach(jogo => {
                partidas.push({
                    idPartida: partidas.length + 1,
                    rodada: idx + 1,
                    timeA: jogo.timeA,
                    timeB: jogo.timeB,
                    golsA: 0,
                    golsB: 0,
                    penaltisA: 0,
                    penaltisB: 0,
                    finalizada: false
                });
            });
        });
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
        classificacao = {};
        timesSorteados.forEach(t => {
            classificacao[t.id] = {
                nome: t.nome,
                p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, sg: 0
            };
        });
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
                sel.addEventListener('change', (e) => {
                    modoJogoAtual = e.target.value;
                    inicializarClassificacao();
                    if (modoJogoAtual === 'racha-livre') {
                        iniciarModoRachaLivre(true);
                    } else {
                        if (timesSorteados.length >= 2) {
                            gerarTabelaTodosContraTodos();
                        }
                    }
                    // ALTERAÇÃO 3: Salva o modo e o estado atual
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

        let listaClass = Object.values(classificacao);
        listaClass.sort((a, b) => b.p - a.p || b.sg - a.sg || b.gp - a.gp);

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
                artilharia[nomeArtilheiro] = (artilharia[nomeArtilheiro] || 0) + 1;
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

                const tA = classificacao[p.timeA.id];
                const tB = classificacao[p.timeB.id];

                tA.j++; tB.j++;
                tA.gp += gA; tB.gp += gB;
                tA.sg += (gA - gB); tB.gp += gB; tB.sg += (gB - gA);

                if (gA > gB || (gA === gB && pA > pB)) {
                    tA.p += 3;
                    tA.v++;
                    tB.d++;
                } else if (gB > gA || (gA === gB && pB > pA)) {
                    tB.p += 3;
                    tB.v++;
                    tA.d++;
                } else {
                    tA.p += 1; tB.p += 1;
                    tA.e++; tB.e++;
                }

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
                artilharia[nomeArt] = (artilharia[nomeArt] || 0) + 1;
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

                // Atualiza classificação
                const tA = classificacao[timeEmCampoA.id];
                const tB = classificacao[timeEmCampoB.id];

                tA.j++; tB.j++;
                tA.gp += gA; tB.gp += gB;
                tA.sg += (gA - gB); tB.sg += (gB - gA);

                if (gA > gB) {
                    tA.p += 3; tA.v++; tB.d++;
                } else if (gB > gA) {
                    tB.p += 3; tB.v++; tA.d++;
                } else {
                    tA.p += 1; tB.p += 1;
                    tA.e++; tB.e++;
                }

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

            const tabHist = document.querySelector('[data-tab="tab-historico"]');
            if (tabHist) tabHist.click();

            await mostrarAlerta('🏁 Campeonato finalizado com sucesso e salvo no histórico!', '🏆 FIM DE CAMPEONATO');
        });
    }

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        if (!container) return;

        if (historico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum campeonato finalizado até o momento.</p>';
            return;
        }

        container.innerHTML = historico.map((h, i) => {
            const classLista = Object.values(h.classificacao || {}).sort((a, b) => b.p - a.p || b.sg - a.sg);
            const campeao = classLista.length > 0 ? classLista[0].nome : 'N/A';

            return `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>🏆 Edição de ${h.data}</h3>
                        <button class="btn btn-danger" style="padding:2px 8px; font-size:0.8rem;" onclick="excluirHistorico(${h.id})">🗑️ Excluir</button>
                    </div>
                    <p class="subtext">Modo: ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha Livre'} | 🥇 Campeão: <strong>${escapeHtml(campeao)}</strong></p>
                </div>
            `;
        }).join('');
    }

    window.excluirHistorico = async function(id) {
        const confirmou = await mostrarConfirmacao('Deseja excluir este registro do histórico?', '🗑️ EXCLUIR HISTÓRICO');
        if (confirmou) {
            historico = historico.filter(h => h.id != id);
            salvarHistoricoFirebase();
            renderizarHistorico();
        }
    };
});
