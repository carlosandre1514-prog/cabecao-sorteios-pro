// Variáveis globais para controle de autenticação e dados
let isLoginMode = true; // Controla se o form é de Login (true) ou Cadastro (false)

// --- FUNÇÕES DE AUTENTICAÇÃO DO FIREBASE ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById("auth-subtitle");
    const btnAction = document.getElementById("btn-auth-action");
    const btnSwitch = document.getElementById("btn-auth-switch");

    if (!title || !btnAction || !btnSwitch) return;

    if (isLoginMode) {
        title.innerText = "Faça login para continuar";
        btnAction.innerText = "Entrar";
        btnSwitch.innerText = "Não tem conta? Cadastre-se";
    } else {
        title.innerText = "Crie sua nova conta gratuita";
        btnAction.innerText = "Cadastrar";
        btnSwitch.innerText = "Já tem conta? Faça login";
    }
}

async function handleAuthAction() {
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    
    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        alert("Preencha o e-mail e a senha!");
        return;
    }

    try {
        if (isLoginMode) {
            await window.firebaseFns.signInWithEmailAndPassword(window.firebaseAuth, email, password);
            alert("Login realizado com sucesso!");
        } else {
            await window.firebaseFns.createUserWithEmailAndPassword(window.firebaseAuth, email, password);
            alert("Conta criada com sucesso!");
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            alert("Este e-mail já está cadastrado! Use outro ou faça login.");
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            alert("E-mail ou senha incorretos.");
        } else if (error.code === 'auth/weak-password') {
            alert("A senha precisa ter pelo menos 6 caracteres.");
        } else {
            alert("Erro: " + error.message);
        }
    }
}

// --- FUNÇÃO DE LOGIN COM O GOOGLE CORRIGIDA (Redirecionamento Mobile/Acode) ---
async function handleGoogleLogin() {
    if (!window.firebaseAuth || !window.firebaseFns) {
        alert("Erro: O sistema de autenticação do Firebase não foi carregado.");
        return;
    }

    try {
        const provider = new window.firebaseFns.GoogleAuthProvider();
        // Força o uso estrito de redirect para evitar bloqueios de popup no mobile/Acode
        await window.firebaseFns.signInWithRedirect(window.firebaseAuth, provider);
    } catch (error) {
        console.error("Erro detalhado no login com o Google:", error);
        
        if (error.code === 'auth/unauthorized-domain') {
            alert("❌ Erro: Este domínio não está autorizado no painel do Firebase (Authentication > Settings > Authorized domains).");
        } else {
            alert("❌ Erro ao entrar com o Google: " + error.message);
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
        btnTarget.click(); // Simula o clique na aba para acionar toda a lógica nativa
    }
    toggleDrawer(); // Fecha o menu após selecionar a aba
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
        alert("Erro ao sair da conta. Tente novamente.");
    }
}

// --- FERRAMENTA DE MUDAR SENHA ---
function abrirModalSenha() {
    const modal = document.getElementById('modal-mudar-senha');
    if (modal) {
        modal.classList.remove('hidden');
        toggleDrawer(); // Fecha o menu lateral se estiver aberto
    }
}

function fecharModalSenha() {
    const modal = document.getElementById('modal-mudar-senha');
    if (modal) {
        modal.classList.add('hidden');
        const novaSenha = document.getElementById('nova-senha');
        const confirmaSenha = document.getElementById('confirma-nova-senha');
        if (novaSenha) novaSenha.value = '';
        if (confirmaSenha) confirmaSenha.value = '';
    }
}

async function salvarNovaSenha() {
    if (!window.firebaseAuth || !window.firebaseFns) {
        alert("Erro: O sistema de autenticação do Firebase não foi carregado.");
        return;
    }

    const user = window.firebaseAuth.currentUser;
    if (!user) {
        alert("⚠️ Nenhum usuário logado detectado.");
        return;
    }

    const inputNova = document.getElementById('nova-senha');
    const inputConfirma = document.getElementById('confirma-nova-senha');

    if (!inputNova || !inputConfirma) return;

    const senhaNova = inputNova.value.trim();
    const senhaConfirma = inputConfirma.value.trim();

    if (!senhaNova || !senhaConfirma) {
        alert("Preencha todos os campos de senha!");
        return;
    }

    if (senhaNova.length < 6) {
        alert("A nova senha precisa ter pelo menos 6 dígitos.");
        return;
    }

    if (senhaNova !== senhaConfirma) {
        alert("As senhas não coincidem!");
        return;
    }

    try {
        await window.firebaseFns.updatePassword(user, senhaNova);
        alert("✅ Senha alterada com sucesso!");
        fecharModalSenha();
    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("❌ Por segurança, esta operação exige um login recente. Faça logout e entre novamente para alterar a senha.");
        } else {
            alert("❌ Erro ao alterar senha: " + error.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let currentUserUid = null;
    let jogadores = [];
    let historico = [];
    
    let timesSorteados = [];
    let partidas = [];
    let partidaAtualIndex = 0;
    let classificacao = {};
    let artilharia = {};
    let nivelCadastroTemp = 3;

    // --- VARIÁVEIS DO CRONÔMETRO ---
    let timerInterval = null;
    let tempoTotalSegundos = 600; // Default 10 min
    let tempoRestante = 600;

    // Vincular evento ao botão do Google do HTML
    const btnGoogle = document.getElementById('btn-google-auth');
    if (btnGoogle) {
        btnGoogle.addEventListener('click', handleGoogleLogin);
    }

    // --- MONITOR DE SESSÃO DO FIREBASE ---
    setTimeout(async () => {
        if (window.firebaseAuth && window.firebaseFns) {
            // Processa o retorno do redirecionamento do Google caso tenha ocorrido
            try {
                await window.firebaseFns.getRedirectResult(window.firebaseAuth);
            } catch (redirError) {
                console.error("Erro no resultado do redirecionamento:", redirError);
            }

            window.firebaseFns.onAuthStateChanged(window.firebaseAuth, (user) => {
                const authScreen = document.getElementById("auth-screen");
                const drawerEmail = document.getElementById("drawer-user-email");
                
                if (user) {
                    currentUserUid = user.uid;
                    if (authScreen) authScreen.classList.add("hidden");
                    if (drawerEmail) drawerEmail.textContent = user.email || "Usuário Google"; // Preenche o e-mail no menu lateral
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
            } else {
                jogadores = [];
                historico = [];
            }
            renderizarElenco();
            renderizarHistorico();
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

    function mostrarAlerta(mensagem, titulo = '⚠️ AVISO') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

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
    }

    function mostrarConfirmacao(mensagem, titulo = '❓ CONFIRMAÇÃO') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-alerta-custom');
            const elTitulo = document.getElementById('alerta-titulo');
            const elMensagem = document.getElementById('alerta-mensagem');
            const btnOk = document.getElementById('btn-alerta-ok');
            const btnCancelar = document.getElementById('btn-alerta-cancelar');

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
            if (!textoLote.trim()) return mostrarAlerta('Cole uma lista de nomes!');

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
                        estrelas: 3,
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

    const starsCadastro = document.querySelectorAll('#stars-cadastro .star-cad');
    starsCadastro.forEach(star => {
        star.addEventListener('click', (e) => {
            const target = e.currentTarget || e.target;
            nivelCadastroTemp = parseInt(target.getAttribute('data-star')) || 3;
            starsCadastro.forEach((s, idx) => {
                if (idx < nivelCadastroTemp) s.classList.add('active');
                else s.classList.remove('active');
            });
        });
    });

    const btnAddJogador = document.getElementById('btn-add-jogador');
    if (btnAddJogador) {
        btnAddJogador.addEventListener('click', async () => {
            const nomeInput = document.getElementById('novo-nome');
            if (!nomeInput) return;
            const nome = nomeInput.value.trim();
            const tipoEl = document.querySelector('input[name="tipo-jogador"]:checked');
            const tipo = tipoEl ? tipoEl.value : 'linha';

            if (!nome) return mostrarAlerta('Digite o nome do jogador!');

            jogadores.push({
                id: Date.now() + Math.random(),
                nome: nome,
                isGoleiro: tipo === 'goleiro',
                estrelas: nivelCadastroTemp,
                presente: true
            });

            salvarJogadores();
            nomeInput.value = '';
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

            div.innerHTML = `
                <div>
                    <strong>${nomeTratado}</strong> ${j.isGoleiro ? '🧤' : ''}
                    <small style="color:#94a3b8">(${'⭐'.repeat(j.estrelas)})</small>
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
        const editEstrelas = document.getElementById('edit-estrelas');
        const editGoleiro = document.getElementById('edit-goleiro');
        const editLinha = document.getElementById('edit-linha');
        const modal = document.getElementById('modal-edicao');

        if (editId) editId.value = j.id;
        if (editNome) editNome.value = j.nome;
        if (editEstrelas) editEstrelas.value = j.estrelas;
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
                const editEstrelas = document.getElementById('edit-estrelas');
                const editGoleiro = document.getElementById('edit-goleiro');

                j.nome = (editNome && editNome.value.trim()) ? editNome.value.trim() : j.nome;
                j.estrelas = editEstrelas ? (parseInt(editEstrelas.value) || 3) : j.estrelas;
                j.isGoleiro = editGoleiro ? editGoleiro.checked : false;

                salvarJogadores();
                renderizarElenco();
                
                const modal = document.getElementById('modal-edicao');
                if (modal) modal.classList.add('hidden');
            }
        });
    }

    // --- 4. ABA SORTEIO & ALGORITMO MONTE CARLO ---
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
            div.innerHTML = `
                <input type="checkbox" id="p-${j.id}" ${j.presente ? 'checked' : ''}>
                <label for="p-${j.id}">${escapeHtml(j.nome)} ${j.isGoleiro ? '🧤' : ''} (${'⭐'.repeat(j.estrelas)})</label>
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

    function sortearTimesAleatorioBalanceado(jogadoresPresentes, qtdTimes, limiteDiferencaEstrelas = 2) {
        const goleiros = jogadoresPresentes.filter(j => j.isGoleiro);
        const linha = jogadoresPresentes.filter(j => !j.isGoleiro);

        let tentativa = 0;
        const maxTentativas = 2000;
        let melhorSorteio = null;
        let menorDiferencaEncontrada = Infinity;

        while (tentativa < maxTentativas) {
            tentativa++;

            const goleirosEmbaralhados = embaralharArray(goleiros);
            const linhaEmbaralhada = embaralharArray(linha);

            const goleirosParaTimes = goleirosEmbaralhados.slice(0, qtdTimes);
            const goleirosSobrando = goleirosEmbaralhados.slice(qtdTimes);
            const linhaCompleta = embaralharArray([...linhaEmbaralhada, ...goleirosSobrando]);

            let timesTemp = Array.from({ length: qtdTimes }, (_, i) => ({
                id: i + 1,
                nome: `Time ${i + 1}`,
                jogadores: [],
                temGoleiro: false,
                somaEstrelas: 0
            }));

            goleirosParaTimes.forEach((g, index) => {
                timesTemp[index].jogadores.push(g);
                timesTemp[index].somaEstrelas += g.estrelas;
                timesTemp[index].temGoleiro = true;
            });

            linhaCompleta.forEach((j, index) => {
                const timeIndex = index % qtdTimes;
                timesTemp[timeIndex].jogadores.push(j);
                timesTemp[timeIndex].somaEstrelas += j.estrelas;
            });

            const somas = timesTemp.map(t => t.somaEstrelas);
            const diferenca = Math.max(...somas) - Math.min(...somas);

            if (diferenca < menorDiferencaEncontrada) {
                menorDiferencaEncontrada = diferenca;
                melhorSorteio = timesTemp;
            }

            if (diferenca <= limiteDiferencaEstrelas) {
                return timesTemp;
            }
        }

        return melhorSorteio;
    }

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', async () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimesEl = document.getElementById('qtd-times');
            const qtdTimes = qtdTimesEl ? parseInt(qtdTimesEl.value) : 2;

            if (presentes.length < qtdTimes * 2) {
                return mostrarAlerta('Poucos jogadores presentes para a quantidade de times!', '🎲 SORTEIO');
            }

            const limiteDiferencaEstrelas = 2;
            timesSorteados = sortearTimesAleatorioBalanceado(presentes, qtdTimes, limiteDiferencaEstrelas);
            exibirTimesSorteados();
        });
    }

    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        if (!container) return;
        
        container.className = 'grid-times-container';
        container.innerHTML = '';

        timesSorteados.forEach(t => {
            const card = document.createElement('div');
            card.className = 'card-time';

            const avisoGoleiro = t.temGoleiro ? '' : ' <span class="badge-sem-goleiro">(Sem goleiro fixo)</span>';
            
            const listaJogadoresHtml = t.jogadores.map(j => `
                <li class="item-jogador-time">
                    <span>${escapeHtml(j.nome)} ${j.isGoleiro ? '🧤' : ''}</span>
                    <small class="estrelas-jogador">${'⭐'.repeat(j.estrelas)}</small>
                </li>
            `).join('');

            card.innerHTML = `
                <div class="card-time-header">
                    <h3>🟢 ${t.nome}</h3>
                    <span class="badge-estrelas">⭐ ${t.somaEstrelas} Nível</span>
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
            return mostrarAlerta('Nenhum sorteio realizado ainda!');
        }

        let textoFormatado = `*SORTEIO DE TIMES*\n\n`;

        timesSorteados.forEach((t, i) => {
            textoFormatado += `*${t.nome.toUpperCase()}*\n`;
            t.jogadores.forEach((j, index) => {
                const tagGoleiro = j.isGoleiro ? ' (Goleiro)' : '';
                textoFormatado += `${index + 1}. ${j.nome}${tagGoleiro}\n`;
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

    // --- 5. ABA CAMPEONATO ---
    const btnIniciarCamp = document.getElementById('btn-iniciar-campeonato');
    if (btnIniciarCamp) {
        btnIniciarCamp.addEventListener('click', async () => {
            if (timesSorteados.length < 2) {
                return mostrarAlerta('Realize o sorteio dos times primeiro!', '🏆 CAMPEONATO');
            }
            gerarTabelaTodosContraTodos();
            inicializarClassificacao();
            artilharia = {};
            partidaAtualIndex = 0;

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

        for (let r = 0; r < totalRodadas; r++) {
            for (let i = 0; i < jogosPorRodada; i++) {
                let tA = tempTimes[i];
                let tB = tempTimes[n - 1 - i];

                if (tA !== null && tB !== null) {
                    partidas.push({
                        idPartida: partidas.length + 1,
                        rodada: r + 1,
                        timeA: tA,
                        timeB: tB,
                        golsA: 0,
                        golsB: 0,
                        penaltisA: 0,
                        penaltisB: 0,
                        finalizada: false
                    });
                }
            }
            tempTimes.splice(1, 0, tempTimes.pop());
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
        renderizarTabela();
        renderizarPartidaAtual();
        renderizarConfrontosEncerrados();
        renderizarArtilharia();
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

    function renderizarPartidaAtual() {
        const container = document.getElementById('painel-partida-atual');
        if (!container) return;

        if (partidas.length === 0) {
            container.innerHTML = '<p class="subtext">Inicie um campeonato no menu Sorteio!</p>';
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
                renderizarArtilharia();
            });
        }

        const btnFinPartida = document.getElementById('btn-finalizar-partida');
        if (btnFinPartida) {
            btnFinPartida.addEventListener('click', async () => {
                if (p.timeA.id === p.timeB.id) {
                    return mostrarAlerta('Um time não pode jogar contra ele mesmo! Escolha times diferentes.', '⚠️ AVISO');
                }

                const gA = parseInt(inputA.value) || 0;
                const gB = parseInt(inputB.value) || 0;

                let pA = 0, pB = 0;
                if (gA === gB) {
                    const elPenA = document.getElementById('pen-a');
                    const elPenB = document.getElementById('pen-b');
                    pA = elPenA ? (parseInt(elPenA.value) || 0) : 0;
                    pB = elPenB ? (parseInt(elPenB.value) || 0) : 0;
                    if (pA === pB) return mostrarAlerta('Defina o vencedor nos pênaltis!', '⚽ PÊNALTIS');
                }

                p.golsA = gA;
                p.golsB = gB;
                p.penaltisA = pA;
                p.penaltisB = pB;

                const tA = classificacao[p.timeA.id];
                const tB = classificacao[p.timeB.id];

                tA.j++; tB.j++;
                tA.gp += gA; tB.gp += gB;
                tA.sg += (gA - gB); tB.sg += (gB - gA);

                if (gA > gB || (gA === gB && pA > pB)) {
                    tA.p += 3; tA.v++; tB.d++;
                    if(gA === gB) { tA.e++; tB.e++; }
                } else {
                    tB.p += 3; tB.v++; tA.d++;
                    if(gA === gB) { tA.e++; tB.e++; }
                }

                p.finalizada = true;
                partidaAtualIndex++;
                renderizarCampeonato();
            });
        }
    }

    function renderizarConfrontosEncerrados() {
        const container = document.getElementById('lista-confrontos-encerrados');
        if (!container) return;
        container.innerHTML = '';

        const encerradas = partidas.filter(p => p.finalizada);

        if (encerradas.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum confronto finalizado ainda.</p>';
            return;
        }

        encerradas.forEach(p => {
            const div = document.createElement('div');
            div.className = 'item-confronto-encerrado';

            let txtPen = (p.golsA === p.golsB) ? `<small>(Pen: ${p.penaltisA}x${p.penaltisB})</small>` : '';

            div.innerHTML = `
                <span><strong>${escapeHtml(p.timeA.nome)}</strong> ${p.golsA} x ${p.golsB} <strong>${escapeHtml(p.timeB.nome)}</strong> ${txtPen}</span>
                <span style="font-weight:bold;">✓ Finalizado</span>
            `;
            container.appendChild(div);
        });
    }

    function renderizarArtilharia() {
        const container = document.getElementById('lista-artilharia');
        if (!container) return;
        container.innerHTML = '';

        let lista = Object.entries(artilharia);
        if (lista.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum gol marcado ainda.</p>';
            return;
        }

        lista.sort((a, b) => b[1] - a[1]);
        lista.forEach(([nome, gols]) => {
            const div = document.createElement('div');
            div.className = 'artilheiro-item';
            div.innerHTML = `<span><strong>${escapeHtml(nome)}</strong></span><span>⚽ ${gols} gol(s)</span>`;
            container.appendChild(div);
        });
    }

    // --- 6. HISTÓRICO ---
    const btnFinalizarCamp = document.getElementById('btn-finalizar-campeonato');
    if (btnFinalizarCamp) {
        btnFinalizarCamp.addEventListener('click', async () => {
            if (partidas.length === 0) {
                return mostrarAlerta('Nenhum campeonato ativo no momento!', '🏆 CAMPEONATO');
            }

            const confirmacao = await mostrarConfirmacao('Deseja realmente finalizar o campeonato atual e salvar os dados no Histórico?', '🏁 FINALIZAR CAMPEONATO');
            if (!confirmacao) return;

            let listaClass = Object.values(classificacao);
            listaClass.sort((a, b) => b.p - a.p || b.sg - a.sg || b.gp - a.gp);
            const campeao = listaClass[0] ? listaClass[0].nome : 'Nenhum';

            const confrontosResumo = partidas.filter(p => p.finalizada).map(p => {
                let pen = (p.golsA === p.golsB) ? ` (Pen: ${p.penaltisA}x${p.penaltisB})` : '';
                return `${escapeHtml(p.timeA.nome)} ${p.golsA} x ${p.golsB} ${escapeHtml(p.timeB.nome)}${pen}`;
            });

            const novoCamp = {
                id: Date.now(),
                data: new Date().toLocaleDateString('pt-BR') + ' - ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
                campeao: campeao,
                classificacao: listaClass,
                confrontos: confrontosResumo,
                artilharia: artilharia
            };

            historico.unshift(novoCamp);
            salvarHistoricoFirebase();

            partidas = [];
            timesSorteados = [];
            classificacao = {};
            artilharia = {};
            partidaAtualIndex = 0;

            await mostrarAlerta('🏆 Campeonato finalizado e salvo com sucesso no Histórico!', '🏆 SUCESSO');
            const tabHist = document.querySelector('[data-tab="tab-historico"]');
            if (tabHist) tabHist.click();
        });
    }

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        if (!container) return;
        container.innerHTML = '';

        if (historico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum histórico salvo ainda.</p>';
            return;
        }

        historico.forEach(h => {
            const div = document.createElement('div');
            div.className = 'card-historico';

            let artilheiroTop = Object.entries(h.artilharia || {}).sort((a,b)=>b[1]-a[1])[0];
            let txtArtilheiro = artilheiroTop ? `${escapeHtml(artilheiroTop[0])} (${artilheiroTop[1]} gols)` : 'Nenhum';
            let txtConfrontos = h.confrontos && h.confrontos.length > 0 ? h.confrontos.join('<br>• ') : 'Nenhum';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong>📅 ${h.data}</strong>
                    <button class="btn btn-danger" onclick="excluirHistorico(${h.id})">Excluir</button>
                </div>
                <p style="font-size:0.85rem; margin-bottom:4px;">🏆 <strong>Campeão:</strong> ${escapeHtml(h.campeao)}</p>
                <p style="font-size:0.85rem; margin-bottom:8px;">🎯 <strong>Artilheiro:</strong> ${txtArtilheiro}</p>
                
                <details style="font-size:0.8rem; padding:6px; border-radius:4px;">
                    <summary style="cursor:pointer;"><strong>Ver Confrontos Realizados</strong></summary>
                    <div style="margin-top:6px; line-height:1.4;">
                        • ${txtConfrontos}
                    </div>
                </details>
            `;
            container.appendChild(div);
        });
    }

    window.excluirHistorico = async function(id) {
        const confirmou = await mostrarConfirmacao("Deseja realmente excluir este histórico?", "🗑️ EXCLUIR HISTÓRICO");
        if (confirmou) {
            historico = historico.filter(h => h.id != id);
            salvarHistoricoFirebase();
            renderizarHistorico();
        }
    };
});
