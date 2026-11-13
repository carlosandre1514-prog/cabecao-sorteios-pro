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
                if (window.Metricas) { Metricas.ativo(user.uid); Metricas.evento('abertura', true); }
                if (authScreen) authScreen.classList.add('hidden');
                if (drawerEmail) drawerEmail.textContent = user.email || 'Usuário Google';
                emailUsuario = user.email || '';
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

    // --- MODO OFFLINE ---
    // Uma cópia de usuarios/<uid> fica no aparelho (localStorage). Sem internet, o app abre
    // com essa cópia; o que for mudado fica marcado como "pendente" e sobe quando a conexão
    // voltar (o próprio Firebase segura a gravação; se o app for fechado antes, as pendentes
    // são reenviadas na próxima vez que os dados carregarem com internet).
    const chaveCache = uid => 'cabecao_dados_' + uid;
    const chavePendentes = uid => 'cabecao_pendentes_' + uid;
    function lerLocal(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; } }
    function salvarLocal(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* cheio ou bloqueado */ } }
    let espelho = null;      // cópia local de usuarios/<uid>
    let modoOffline = false; // true = abriu com a cópia do aparelho
    function marcarPendente(uid, destino) {
        const pend = lerLocal(chavePendentes(uid)) || {};
        const seq = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        pend[destino] = seq;
        salvarLocal(chavePendentes(uid), pend);
        return () => {   // chamado quando o Firebase confirmou a gravação
            const p = lerLocal(chavePendentes(uid)) || {};
            if (p[destino] === seq) { delete p[destino]; salvarLocal(chavePendentes(uid), p); }
        };
    }
    function enviarParaNuvem(uid, destino, limpo) {
        const confirmar = marcarPendente(uid, destino);
        const dbRef = window.firebaseFns.ref(window.firebaseDb, `usuarios/${uid}/${destino}`);
        return window.firebaseFns.set(dbRef, limpo).then(() => {
            confirmar();
            avisouErroSalvar = false;
        });
    }
    // Junta ao que veio da nuvem o que ficou pendente neste aparelho e reenvia
    function reaplicarPendentes(uid, dados) {
        const pend = lerLocal(chavePendentes(uid)) || {};
        const cache = lerLocal(chaveCache(uid));
        const caminhos = Object.keys(pend);
        if (!cache || !caminhos.length) return dados;
        caminhos.forEach(destino => {
            const v = Logica.lerDoCaminho(cache, destino);
            const valor = v === undefined ? null : v;
            Logica.gravarNoCaminho(dados, destino, valor);
            enviarParaNuvem(uid, destino, valor).catch(erroSalvar);
        });
        return dados;
    }

    function gravar(caminho, valor, raiz) {
        if (!currentUserUid || !window.firebaseDb || !dadosCarregados) return;
        try {
            // o JSON remove `undefined` (o Firebase rejeita) e converte NaN em null
            const limpo = valor === null ? null : JSON.parse(JSON.stringify(valor));
            const destino = (raiz || rachaAtivo === 'principal') ? caminho : `rachas/${rachaAtivo}/${caminho}`;
            espelho = Logica.gravarNoCaminho(espelho || {}, destino, limpo === null ? null : JSON.parse(JSON.stringify(limpo)));
            salvarLocal(chaveCache(currentUserUid), espelho);
            return enviarParaNuvem(currentUserUid, destino, limpo).catch(erroSalvar);
        } catch (erro) {
            erroSalvar(erro);
        }
    }
    window.addEventListener('online', () => {
        if (!modoOffline || !currentUserUid) return;
        modoOffline = false;
        toast('📶 Internet de volta: enviando o que você mudou.');
    });
    window.addEventListener('offline', () => {
        if (currentUserUid && dadosCarregados) toast('📴 Sem internet: pode continuar usando, tudo sobe quando a conexão voltar.');
    });

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
            filaTimes, partidasRachaHistorico, placarRacha
        });
        publicarAoVivo(false);
    }
    function limparCampeonatoAtivo() {
        publicarAoVivo(true); // quem está assistindo vê "encerrado" com a tabela final
        gravar('campeonatoAtivo', null);
    }

