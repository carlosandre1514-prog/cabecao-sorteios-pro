// ARQUIVO MONTADO por scripts/build.js — edite os arquivos em src/app/ e rode "npm run build".
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
let placarRacha = { a: 0, b: 0 }; // placar da partida em andamento (modo racha)
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
    el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    el.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;
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
            const d = document.getElementById('side-drawer');
            if (d && d.classList.contains('open')) toggleDrawer();
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
    let perfil = {}; // { apelido, foto } — fica em usuarios/UID/perfil
    // Perfis de racha: o "principal" usa os caminhos de sempre; os outros ficam em usuarios/UID/rachas/ID/...
    let rachas = [{ id: 'principal', nome: 'Racha principal' }];
    let rachaAtivo = 'principal';
    let rachaEscolhida = false;   // true depois que o usuário trocou de racha nesta sessão
    let resumoRachas = {};        // { id: { j: jogadores, h: campeonatos } } dos rachas que não estão ativos
    let emailUsuario = '';
    let souAdmin = false;
    let jogadores = [];
    let historico = [];
    let dadosCarregados = false;   // só salva no Firebase depois de ter carregado (evita apagar dados por engano)
    let sorteioAtual = [];         // resultado do sorteio na aba Sorteio (ainda NÃO é o campeonato)

    const elVersao = document.getElementById('versao-app');
    if (elVersao) elVersao.textContent = VERSAO_ATUAL_APP;
    
    // quantos sorteios foram feitos nesta sessão (aparece no resultado)
    let contadorSorteios = 0;

    let timesSorteados = [];
    let partidas = [];
    let partidaAtualIndex = 0;
    let classificacao = {};
    let artilharia = {};
    let aoVivoCodigo = null;     // código do placar ao vivo (null = não está compartilhando)
    let aoVivoTimer = null;
    let aoVivoPendente = null;
    let aoVivoAvisouErro = false;
    let nivelCadastroTemp = 3.0;
    let nivelEdicaoTemp = 3.0;

    // --- VARIÁVEIS DO CRONÔMETRO ---
    let timerInterval = null;
    let tempoTotalSegundos = 600;
    let tempoRestante = 600;
    let fimEm = 0;               // horário real em que o tempo acaba (não atrasa com a tela bloqueada)
    let offsetServidor = 0;      // diferença entre o relógio do celular e o do Firebase (para o link bater certo)
    let ultimoEncerrado = false; // último estado "encerrado" publicado no link (o cronômetro reaproveita)

    // --- ESTRELAS: campo digitável (0,1 a 5) + botões −/+ de 0,1 em 0,1 ---
    function ligarSeletorEstrelas(pref, ler, gravarTemp) {
        const input = document.getElementById('input-estrelas-' + pref);
        const menos = document.getElementById('btn-' + pref + '-menos');
        const mais = document.getElementById('btn-' + pref + '-mais');
        const mostrar = () => { if (input) input.value = ler().toFixed(1).replace('.', ','); };   // 3,5 (vírgula, como no Brasil)
        const mudar = delta => {
            const atual = Logica.normalizarEstrelas(input ? input.value : ler(), ler());
            gravarTemp(Logica.normalizarEstrelas(atual + delta, atual));
            mostrar();
        };
        if (menos) menos.addEventListener('click', () => mudar(-0.1));
        if (mais) mais.addEventListener('click', () => mudar(0.1));
        if (input) {
            input.addEventListener('input', () => {
                if (input.value.trim() !== '') gravarTemp(Logica.normalizarEstrelas(input.value, ler()));
            });
            input.addEventListener('change', mostrar); // ao sair do campo, arruma o valor (ex.: "9" vira 5,0)
        }
        return mostrar;
    }
    const atualizarDisplayCad = ligarSeletorEstrelas('cad', () => nivelCadastroTemp, v => { nivelCadastroTemp = v; });
    const atualizarDisplayEdit = ligarSeletorEstrelas('edit', () => nivelEdicaoTemp, v => { nivelEdicaoTemp = v; });

    // --- FILTRO POR FAIXA DE ESTRELAS (aba Jogadores e aba Sorteio) ---
    // Ex.: "maior que 1,5 e menor que 2". Campo vazio = sem limite.
    const filtrosEstrelas = {};
    function montarFiltroEstrelas(chave, aoMudar) {
        const box = document.getElementById('filtro-' + chave);
        const f = filtrosEstrelas[chave] = { min: '', max: '', opMin: '>=', opMax: '<=' };
        if (!box) return;
        box.className = 'filtro-estrelas';
        box.innerHTML = `<details${box.closest && box.closest('.sheet') ? ' open' : ''}><summary>Filtrar por nível</summary>
            <div class="filtro-linha">
                <select data-f="opMin" aria-label="Comparação mínima"><option value=">=">maior ou igual a</option><option value=">">maior que</option></select>
                <input type="number" data-f="min" step="0.1" min="0" max="5" inputmode="decimal" placeholder="ex: 1,5">
            </div>
            <div class="filtro-linha">
                <select data-f="opMax" aria-label="Comparação máxima"><option value="<=">menor ou igual a</option><option value="<">menor que</option></select>
                <input type="number" data-f="max" step="0.1" min="0" max="5" inputmode="decimal" placeholder="ex: 2">
                <button type="button" class="btn btn-secondary" data-f-limpar style="padding: 4px 10px;">Limpar</button>
            </div>
            </details><small class="filtro-resumo subtext"></small>`;
        const sync = () => { box.querySelectorAll('[data-f]').forEach(el => { f[el.dataset.f] = el.value; }); aoMudar(); };
        box.querySelectorAll('[data-f]').forEach(el => {
            el.addEventListener('input', sync);
            el.addEventListener('change', sync);
        });
        const limpar = box.querySelector('[data-f-limpar]');
        if (limpar) limpar.addEventListener('click', () => {
            box.querySelectorAll('input[data-f]').forEach(el => { el.value = ''; });
            sync();
        });
    }
    // Aplica o filtro da lista `chave` e escreve "Mostrando X de Y".
    function listaFiltrada(chave, lista) {
        const f = filtrosEstrelas[chave];
        const res = f ? Logica.filtrarPorEstrelas(lista, f) : lista;
        const resumo = document.querySelector('#filtro-' + chave + ' .filtro-resumo');
        if (resumo) {
            const ativo = f && (String(f.min).trim() !== '' || String(f.max).trim() !== '');
            resumo.textContent = ativo ? `Mostrando ${res.length} de ${lista.length} jogadores` : '';
        }
        return res;
    }
    montarFiltroEstrelas('elenco', () => renderizarElenco());
    montarFiltroEstrelas('presenca', () => renderizarPresenca());

    // Zera tudo que é do usuário (usado ao sair da conta ou trocar de conta)
    function limparEstadoLocal(manterRacha) {
        if (!manterRacha) {
            perfil = {}; renderizarPerfil();
            rachas = [{ id: 'principal', nome: 'Racha principal' }];
            rachaAtivo = 'principal'; rachaEscolhida = false; resumoRachas = {}; souAdmin = false;
            renderizarRachas(); atualizarBotaoAdmin();
        }
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
        placarRacha = { a: 0, b: 0 };
        tipoDesempateRacha = null;
        aoVivoCodigo = null;
        aoVivoPendente = null;
        clearTimeout(aoVivoTimer);
        atualizarCardAoVivo();
        pararEscutaPresenca();
        presencaCodigo = null; presencaDados = null; presencaAssinatura = '';
        renderizarCardPresenca();
        visualRacha = {}; aplicarVisual(); pixPadrao = null; caixa = {};
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

    // --- PLACAR AO VIVO (link público, só leitura) ---
    // Cada resultado lançado é copiado para ao_vivo/<codigo> no Firebase; a página
    // ao-vivo.html lê esse caminho em tempo real. O código tem 8 letras/números sorteados,
    // então só quem recebe o link consegue abrir.
    const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    function gerarCodigoAoVivo() {
        const b = new Uint8Array(8);
        crypto.getRandomValues(b);
        return Array.from(b, x => ALFABETO_CODIGO[x % ALFABETO_CODIGO.length]).join('');
    }
    // ---------- ENDEREÇO PÚBLICO dos links (lista de presença e placar ao vivo) ----------
    // Dentro do APK o app roda dos arquivos do aparelho: um link "daqui" não abre no celular dos outros.
    // Então os links usam o site público: configuracoes/divulgacao/url_publica (Firebase) ou o GitHub Pages.
    const URL_PUBLICA_PADRAO = 'https://carlosandre1514-prog.github.io/cabecao-sorteios-pro/';
    let urlPublicaConfig = '';
    (function lerUrlPublica() {
        const ler = () => {
            try {
                const f = window.firebaseFns;
                f.get(f.ref(window.firebaseDb, 'configuracoes/divulgacao/url_publica'))
                    .then(s => { const v = String(s && s.exists && s.exists() ? s.val() : ''); if (/^https:\/\//i.test(v)) urlPublicaConfig = v; })
                    .catch(() => {});
            } catch (e) { /* sem Firebase: fica o padrão */ }
        };
        if (window.firebaseReady) ler(); else window.addEventListener('firebase-ready', ler, { once: true });
    })();
    function basePublica() {
        if (urlPublicaConfig) return urlPublicaConfig.replace(/\/?$/, '/');
        const local = !/^https?:$/.test(location.protocol || '') || /^(localhost|127\.|10\.|192\.168\.)/.test(location.hostname || '');
        return local ? URL_PUBLICA_PADRAO : new URL('.', String(location.href).split('#')[0].split('?')[0]).href;
    }
    function linkPublico(pagina, codigo) { return basePublica() + pagina + '?c=' + codigo; }
    function linkAoVivo() { return linkPublico('ao-vivo.html', aoVivoCodigo); }
    function atualizarCardAoVivo() {
        const off = document.getElementById('ao-vivo-off');
        const on = document.getElementById('ao-vivo-on');
        if (!off || !on) return;
        off.classList.toggle('hidden', !!aoVivoCodigo);
        on.classList.toggle('hidden', !aoVivoCodigo);
        const campo = document.getElementById('ao-vivo-link');
        if (campo) campo.value = aoVivoCodigo ? linkAoVivo() : '';
        const st = document.getElementById('ao-vivo-status');
        if (st) st.textContent = aoVivoCodigo ? 'Ligado · quem tem o link acompanha em tempo real' : 'Quem está esperando acompanha pelo celular';
        const ac = document.getElementById('abrir-ao-vivo');
        if (ac) ac.classList.toggle('ativo', !!aoVivoCodigo);
    }
    // Monta o retrato na hora (o estado pode ser zerado logo depois) e grava com um pequeno atraso
    // para juntar várias mudanças seguidas em uma só escrita.
    function publicarAoVivo(encerrado) {
        if (!aoVivoCodigo || !currentUserUid || !window.firebaseDb || !dadosCarregados) return;
        if (!timesSorteados.length) return;
        ultimoEncerrado = !!encerrado;
        aoVivoPendente = Logica.montarAoVivo({
            modo: modoJogoAtual, times: timesSorteados, classificacao, partidas, partidaAtualIndex,
            partidasRacha: partidasRachaHistorico, artilharia, timeA: timeEmCampoA, timeB: timeEmCampoB, fila: filaTimes,
            placarRacha, cron: montarCron(), visual: visualRacha
        }, currentUserUid, Date.now(), encerrado);
        const codigo = aoVivoCodigo;
        clearTimeout(aoVivoTimer);
        aoVivoTimer = setTimeout(() => {
            if (codigo !== aoVivoCodigo || !aoVivoPendente) return;
            const f = window.firebaseFns;
            const limpo = JSON.parse(JSON.stringify(aoVivoPendente));
            aoVivoPendente = null;
            f.set(f.ref(window.firebaseDb, 'ao_vivo/' + codigo), limpo)
                .then(() => { aoVivoAvisouErro = false; })
                .catch(e => {
                    console.error('Placar ao vivo:', e);
                    if (aoVivoAvisouErro) return;
                    aoVivoAvisouErro = true;
                    const cod = String((e && (e.code || e.message)) || 'erro');
                    const dica = /permission/i.test(cod) ? ' O Firebase negou a gravação: publique as regras novas (com "ao_vivo") em Realtime Database → Regras.' : ' Confira a internet.';
                    mostrarAlerta('Não consegui publicar o placar ao vivo.' + dica + ' (Código: ' + cod + ')', '❌ PLACAR AO VIVO');
                });
        }, 400);
    }
    async function copiarTexto(texto) {
        try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
    }
    function configurarAoVivo() {
        const $ = id => document.getElementById(id);
        $('btn-ao-vivo-iniciar')?.addEventListener('click', () => {
            if (!dadosCarregados) {
                mostrarAlerta('Seus dados ainda não carregaram. Feche e abra o app e tente de novo.', 'Placar ao vivo');
                return;
            }
            if (!timesSorteados.length) {
                mostrarAlerta('Comece um jogo primeiro: sorteie os times e toque em Começar jogo.', 'Placar ao vivo');
                return;
            }
            aoVivoCodigo = gerarCodigoAoVivo();
            gravar('aoVivo', { codigo: aoVivoCodigo });
            publicarAoVivo(false);
            atualizarCardAoVivo();
            toast('Placar ao vivo ligado. Envie o link para o grupo.');
            if (window.Metricas) Metricas.evento('ao_vivo_ligado');
        });
        $('btn-ao-vivo-enviar')?.addEventListener('click', async () => {
            const url = linkAoVivo();
            if (navigator.share) {
                try { await navigator.share({ title: 'Placar ao vivo', text: 'Acompanhe o jogo ao vivo:', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            toast(await copiarTexto(url) ? 'Link copiado!' : 'Copie o link no campo acima.');
        });
        $('btn-ao-vivo-copiar')?.addEventListener('click', async () => {
            toast(await copiarTexto(linkAoVivo()) ? 'Link copiado!' : 'Copie o link no campo acima.');
        });
        $('btn-ao-vivo-parar')?.addEventListener('click', async () => {
            const ok = await mostrarConfirmacao('O link para de funcionar para todo mundo.', 'Desligar o placar ao vivo?', { ok: 'Desligar', perigo: true });
            if (!ok || !aoVivoCodigo) return;
            const codigo = aoVivoCodigo;
            clearTimeout(aoVivoTimer);
            aoVivoPendente = null;
            aoVivoCodigo = null;
            const f = window.firebaseFns;
            f.set(f.ref(window.firebaseDb, 'ao_vivo/' + codigo), null).catch(e => console.error('Placar ao vivo:', e));
            gravar('aoVivo', null);
            atualizarCardAoVivo();
            toast('Placar ao vivo desligado');
        });
    }
    configurarAoVivo();

    // --- LISTA DE PRESENÇA POR LINK (presenca.html?c=CODIGO, sem login) ---
    // presenca/<codigo> = { dono, titulo, quando, limite, aberta, criadoEm, jogadores: [{id,nome,g}],
    //                       respostas: { id: {status:'vou'|'nao', em, nome?, convidado?, goleiro?} },
    //                       migrados: { idConvidado: idNovoJogador } }
    // O app escuta as respostas e marca a presença dos jogadores sozinho.
    let presencaCodigo = null;
    let presencaDados = null;
    let presencaParar = null;     // desliga o "escutar" do Firebase
    let presencaAssinatura = '';  // evita republicar a lista de nomes sem mudança
    const refPresenca = (sub) => window.firebaseFns.ref(window.firebaseDb, 'presenca/' + presencaCodigo + (sub ? '/' + sub : ''));
    function linkPresenca() { return linkPublico('presenca.html', presencaCodigo); }
    const jogadoresPublicos = () => jogadores.map(j => ({ id: String(j.id), nome: String(j.nome), g: !!j.isGoleiro }));
    function publicarJogadoresPresenca() {
        if (!presencaCodigo || !currentUserUid || !dadosCarregados) return;
        const lista = jogadoresPublicos();
        const sig = JSON.stringify(lista);
        if (sig === presencaAssinatura) return;
        presencaAssinatura = sig;
        window.firebaseFns.set(refPresenca('jogadores'), lista).catch(e => console.error('Lista de presença:', e));
    }
    function pararEscutaPresenca() {
        if (typeof presencaParar === 'function') { try { presencaParar(); } catch (e) { /* ignora */ } }
        presencaParar = null;
    }
    function escutarPresenca() {
        pararEscutaPresenca();
        const f = window.firebaseFns;
        if (!presencaCodigo || !f || typeof f.onValue !== 'function') { renderizarCardPresenca(); return; }
        const codigo = presencaCodigo;
        presencaParar = f.onValue(refPresenca(), (snap) => {
            if (codigo !== presencaCodigo) return;
            if (!snap.exists()) {   // encerrado em outro aparelho
                presencaCodigo = null; presencaDados = null; pararEscutaPresenca();
                gravar('presenca', null);
                renderizarCardPresenca();
                return;
            }
            presencaDados = snap.val() || {};
            sincronizarSorteioComLista();
            aplicarRespostasPresenca();
            renderizarCardPresenca();
        }, (e) => console.error('Lista de presença:', e));
        publicarJogadoresPresenca();
    }
    // quem confirmou fica presente; quem está na espera ou não vai fica ausente; sem resposta não mexe
    const opcoesPresenca = d => ({ vagasGoleiro: d.vagasGoleiro, pagos: d.pagos, prazo: d.prazo, promovidos: d.promovidos });
    const resumoPresencaAtual = () => {
        const d = presencaDados || {};
        return Logica.resumirPresenca(d.jogadores, d.respostas, d.limite, opcoesPresenca(d));
    };
    let pixPadrao = null;   // usuarios/<uid>/[rachas/<id>/]pix: última chave Pix usada nas listas
    const fmtPrazo = ms => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    // o sorteio usa os mesmos times x jogadores de linha da lista (só quando a configuração da lista muda)
    let cfgListaAplicada = '';
    function sincronizarSorteioComLista() {
        const d = presencaDados || {};
        if (!d.times || !d.porTime) return;
        const cfg = d.times + 'x' + d.porTime;
        if (cfg === cfgListaAplicada) return;
        cfgListaAplicada = cfg;
        const qt = document.getElementById('qtd-times'), qp = document.getElementById('qtd-por-time');
        if (qt) qt.value = String(d.times);
        if (qp) qp.value = String(d.porTime);
        atualizarBarraSorteio();
    }
    function aplicarRespostasPresenca() {
        if (!presencaDados) return;
        const r = resumoPresencaAtual();
        const vai = new Set(r.confirmados.map(c => c.id));
        const naoVai = new Set(r.espera.concat(r.naoVao).map(c => c.id));
        let mudou = false;
        jogadores.forEach(j => {
            const id = String(j.id);
            const quer = vai.has(id) ? true : naoVai.has(id) ? false : null;
            if (quer !== null && !!j.presente !== quer) { j.presente = quer; mudou = true; }
        });
        if (mudou) { salvarJogadores(); renderizarPresenca(); }
    }
    function renderizarCardPresenca() {
        const off = document.getElementById('presenca-off');
        const on = document.getElementById('presenca-on');
        if (!off || !on) return;
        off.classList.toggle('hidden', !!presencaCodigo);
        on.classList.toggle('hidden', !presencaCodigo);
        const status = document.getElementById('lista-link-status');
        const acesso = document.getElementById('abrir-lista-link');
        if (acesso) acesso.classList.toggle('ativo', !!presencaCodigo);
        if (!presencaCodigo) { if (status) status.textContent = 'Mande no grupo: quem confirmar já fica marcado'; return; }
        const campo = document.getElementById('presenca-link');
        if (campo) campo.value = linkPresenca();
        const d = presencaDados || {};
        const r = resumoPresencaAtual();
        const resumo = document.getElementById('presenca-resumo');
        const cfg = d.times ? `${d.times} times de ${d.porTime} + goleiro` : (d.limite ? `${d.limite} vagas na linha` : 'Sem limite de vagas');
        if (status) status.textContent = (d.aberta === false ? 'Fechada' : 'Aberta') + ` · ${r.linhaConfirmados}${r.limite ? '/' + r.limite : ''} na linha`
            + (r.espera.length ? ` · ${r.espera.length} suplente${r.espera.length > 1 ? 's' : ''}` : '') + (r.aConfirmar.length ? ` · ${r.aConfirmar.length} a confirmar` : '');
        if (resumo) resumo.innerHTML = `
            ${d.aberta === false ? '<p class="aviso-faixa perigo">Lista fechada. Ninguém consegue mudar a resposta.</p>' : ''}
            <div class="lp-cfg"><span>${d.quando ? escapeHtml(d.quando) + ' · ' : ''}${cfg}</span><button type="button" class="btn-texto" id="btn-presenca-config">Ajustar</button></div>
            <div class="presenca-numeros">
                <div><strong>${r.linhaConfirmados}${r.limite ? '/' + r.limite : ''}</strong><small>na linha</small></div>
                <div><strong>${r.goleirosConfirmados}${r.vagasGoleiro ? '/' + r.vagasGoleiro : ''}</strong><small>goleiros</small></div>
                <div><strong>${r.espera.length}</strong><small>suplentes</small></div>
                <div><strong>${r.pagos}</strong><small>pagos</small></div>
                <div><strong>${r.pendentes}</strong><small>a pagar</small></div>
            </div>
            ${d.pix && d.pix.chave || d.prazo ? `<div class="lp-pag">
                ${d.pix && d.pix.chave ? `<span>Pix ${escapeHtml(d.pix.chave)}${d.pix.valor ? ' · ' + Logica.reais(d.pix.valor) : ''}</span>` : ''}
                ${d.prazo ? `<span class="${r.prazoVencido ? 'vencido' : ''}">Pagamento até ${escapeHtml(fmtPrazo(d.prazo))}${r.prazoVencido ? ' · vencido' : ''}</span>` : ''}
            </div>` : ''}
            ${r.aConfirmar.length ? `<p class="aviso-faixa ouro"><strong>${r.aConfirmar.length}</strong> ${r.aConfirmar.length === 1 ? 'avisou que pagou' : 'avisaram que pagaram'}: ${r.aConfirmar.map(c => escapeHtml(c.nome)).join(', ')}. Confira o Pix e toque em Confirmar.</p>` : ''}
            ${r.prazoVencido && r.atrasados.length ? `<div class="aviso-faixa perigo"><span><strong>${r.atrasados.length} ${r.atrasados.length === 1 ? 'jogador' : 'jogadores'}</strong> sem pagamento confirmado</span></div>` : ''}`;
        const conv = document.getElementById('presenca-convidados');
        if (conv) {
            const linhaPessoa = (c, i, suplente) => `<div class="pessoa-lista ${c.atrasado ? 'atrasado' : ''}">
                <span class="pos">${i + 1}</span>
                <span class="nome">${c.goleiro && window.UI ? UI.icone('glove', 'i-sm') + ' ' : ''}${escapeHtml(c.nome)}${c.convidado ? ' <small class="tag-conv">convidado</small>' : ''}${c.promovido && !suplente ? ' <small class="tag-conv">colocado por você</small>' : ''}</span>
                ${suplente ? `<button type="button" class="btn-pag subir" data-subir="${escapeHtml(c.id)}">Subir</button>` : `<button type="button" class="btn-pag ${c.pago ? 'pago' : c.aConfirmar ? 'aconfirmar' : ''}" data-pago="${escapeHtml(c.id)}">${c.pago ? 'Pago' : c.aConfirmar ? 'Confirmar' : c.atrasado ? 'Não pagou' : 'A pagar'}</button>`}
                <button type="button" class="btn-tirar" data-tirar="${escapeHtml(c.id)}" aria-label="Tirar da lista">${window.UI ? UI.icone('x', 'i-sm') : '✕'}</button>
            </div>`;
            const pedidos = r.convidados.filter(c => r.confirmados.some(x => x.id === c.id) || r.espera.some(x => x.id === c.id));
            conv.innerHTML = `
                <details class="presenca-gestao" open><summary>Confirmados <span>${r.confirmados.length}</span></summary>
                    ${r.confirmados.length ? r.confirmados.map((c, i) => linhaPessoa(c, i, false)).join('') : '<p class="subtext">Ninguém confirmou ainda.</p>'}
                </details>
                ${r.espera.length ? `<details class="presenca-gestao" open><summary>Suplentes <span>${r.espera.length}</span></summary><p class="dica">Quando alguém sai, você escolhe quem entra. Ou toque em Subir para colocar na lista.</p>
                    ${r.espera.map((c, i) => linhaPessoa(c, i, true)).join('')}</details>` : ''}
                ${pedidos.length ? `<div class="presenca-pedidos"><p class="rotulo">Convidados (fora do elenco)</p>
                    ${pedidos.map(c => `<div class="item-jogador"><span>${c.goleiro && window.UI ? UI.icone('glove', 'i-sm') + ' ' : ''}${escapeHtml(c.nome)}</span><button type="button" class="btn btn-secondary btn-mini" data-add-conv="${escapeHtml(c.id)}">Pôr no elenco</button></div>`).join('')}</div>` : ''}`;
        }
        const bf = document.getElementById('btn-presenca-fechar');
        if (bf) bf.textContent = d.aberta === false ? 'Reabrir lista' : 'Fechar lista';
    }
    // mensagem no formato das listas do WhatsApp: vagas numeradas, goleiros, suplentes, pagamento e o link
    function textoListaPresenca() {
        const d = Object.assign({}, presencaDados || {}, { titulo: (presencaDados && presencaDados.titulo) || tituloRacha(), visual: visualRacha });
        return Logica.textoListaWhatsApp(d, resumoPresencaAtual(), linkPresenca(), fmtPrazo);
    }
    async function compartilharPresenca() {
        if (!presencaCodigo) return;
        const texto = textoListaPresenca();
        if (window.Metricas) Metricas.evento('presenca_enviada');
        if (navigator.share) {
            try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        toast(await copiarTexto(texto) ? '📋 Lista copiada! Cole no grupo.' : 'Copie o link no campo acima.');
    }
    // datetime-local <-> ms (hora do aparelho)
    const paraCampoData = ms => { if (!ms) return ''; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    // Criar (editar = false) ou ajustar (editar = true) a lista
    function abrirConfigPresenca(editar) {
        if (!dadosCarregados || !currentUserUid) {
            mostrarAlerta('Seus dados ainda não carregaram. Espere um instante e tente de novo.', '📲 LISTA DE PRESENÇA');
            return;
        }
        if (!editar && !jogadores.length) {
            mostrarAlerta('Cadastre os jogadores do racha primeiro (aba Jogadores). Quem não estiver no elenco pode entrar pelo link como convidado.', '📲 LISTA DE PRESENÇA');
            return;
        }
        const d = editar ? (presencaDados || {}) : {};
        const times0 = d.times || parseInt(document.getElementById('qtd-times')?.value, 10) || 4;
        const pix0 = (d.pix && d.pix.chave) ? d.pix : (pixPadrao || {});   // última chave usada neste racha
        const linha0 = d.porTime || parseInt(document.getElementById('qtd-por-time')?.value, 10) || 4;
        const m = abrirModalHtml(`<h2>${editar ? '⚙️ Ajustar lista' : '📲 Nova lista de presença'}</h2>
            <div class="form-group-row"><label for="pr-times">Quantidade de times</label><input type="number" id="pr-times" min="2" max="8" value="${times0}"></div>
            <div class="form-group-row"><label for="pr-linha">Jogadores de linha por time</label><input type="number" id="pr-linha" min="1" max="12" value="${linha0}"></div>
            <p class="subtext" id="pr-conta" style="margin:2px 0 10px;"></p>
            <label class="subtext" for="pr-quando">Quando é o racha? (opcional)</label>
            <input type="text" id="pr-quando" maxlength="60" placeholder="Ex.: Sábado, 16h — Quadra do Zé" value="${escapeHtml(d.quando || '')}">
            <label class="subtext" for="pr-pag" style="margin-top:10px;display:block;">Como pagar (opcional)</label>
            <input type="text" id="pr-pag" maxlength="80" placeholder="Ex.: R$ 15 no Pix 11 99999-9999" value="${escapeHtml(d.pagamento || '')}">
            <div class="pix-config">
                <p class="pix-titulo">Pix copia e cola ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
                <p class="subtext" style="margin:0 0 8px;">Cada jogador com vaga recebe o QR Code e o "copiar Pix" já com o valor. O dinheiro cai direto na sua conta, sem taxa.</p>
                <div class="pix-linha">
                    <select id="pr-pix-tipo" aria-label="Tipo da chave">
                        ${[['telefone', 'Celular'], ['cpf', 'CPF'], ['email', 'E-mail'], ['cnpj', 'CNPJ'], ['aleatoria', 'Aleatória']].map(([v, t]) => `<option value="${v}" ${pix0.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <input type="text" id="pr-pix-chave" maxlength="80" placeholder="Sua chave Pix" value="${escapeHtml(pix0.chaveDigitada || '')}" autocomplete="off">
                </div>
                <p class="dica-pix" id="pr-pix-dica"></p>
                <div class="pix-linha">
                    <input type="text" id="pr-pix-nome" maxlength="25" placeholder="Nome de quem recebe" value="${escapeHtml(pix0.nome || '')}">
                    <input type="text" id="pr-pix-cidade" maxlength="15" placeholder="Cidade" value="${escapeHtml(pix0.cidade || '')}">
                </div>
                <div class="form-group-row" style="margin:8px 0 0;"><label for="pr-pix-valor">Valor por pessoa (R$)</label><input type="number" id="pr-pix-valor" min="0" step="0.5" inputmode="decimal" placeholder="15" value="${pix0.valor || ''}"></div>
            </div>
            <label class="subtext" for="pr-prazo" style="margin-top:10px;display:block;">Prazo para pagar (opcional)</label>
            <input type="datetime-local" id="pr-prazo" value="${paraCampoData(d.prazo)}">
            <p class="subtext" style="margin:4px 0 0;">Quem não for marcado como pago até o prazo fica pendente, e você pode tirar da lista para subir os suplentes.</p>
            ${editar ? '' : '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;"><input type="checkbox" id="pr-zerar" checked> <span class="subtext" style="margin:0;">Desmarcar todo mundo agora (só fica marcado quem confirmar)</span></label>'}
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="pr-criar">${editar ? 'Salvar' : 'Criar e enviar'}</button><button type="button" class="btn btn-secondary" id="pr-cancelar">Cancelar</button></div>`);
        const ler = () => {
            const times = Math.max(2, Math.min(8, parseInt(m.querySelector('#pr-times').value, 10) || 2));
            const porTime = Math.max(1, Math.min(12, parseInt(m.querySelector('#pr-linha').value, 10) || 1));
            return { times, porTime, limite: times * porTime, vagasGoleiro: times };
        };
        const conta = () => {
            const c = ler(), el = m.querySelector('#pr-conta');
            if (el) el.textContent = `= ${c.limite} vagas na linha + ${c.vagasGoleiro} goleiros (1 por time). Passou disso, vira suplente.`;
        };
        ['#pr-times', '#pr-linha'].forEach(sel => { const el = m.querySelector(sel); if (el && el.addEventListener) el.addEventListener('input', conta); });
        conta();
        const lerPix = () => {
            const digitada = (m.querySelector('#pr-pix-chave').value || '').trim();
            if (!digitada) return null;
            const tipo = m.querySelector('#pr-pix-tipo').value;
            return {
                tipo, chaveDigitada: digitada, chave: Logica.normalizarChavePix(tipo, digitada),
                nome: (m.querySelector('#pr-pix-nome').value || '').trim().slice(0, 25),
                cidade: (m.querySelector('#pr-pix-cidade').value || '').trim().slice(0, 15),
                valor: Math.max(0, Math.round((parseFloat(String(m.querySelector('#pr-pix-valor').value).replace(',', '.')) || 0) * 100) / 100)
            };
        };
        const dicaPix = () => {
            const el = m.querySelector('#pr-pix-dica'); if (!el) return;
            const px = lerPix();
            el.className = 'dica-pix' + (px ? (px.chave ? ' ok' : ' erro') : '');
            el.textContent = !px ? '' : px.chave ? 'Chave válida: ' + px.chave : 'Essa chave não parece um ' + ({ telefone: 'celular com DDD', cpf: 'CPF (11 números)', cnpj: 'CNPJ (14 números)', email: 'e-mail', aleatoria: 'chave aleatória' }[px.tipo]);
        };
        ['#pr-pix-chave', '#pr-pix-tipo'].forEach(sel => { const el = m.querySelector(sel); if (el && el.addEventListener) { el.addEventListener('input', dicaPix); el.addEventListener('change', dicaPix); } });
        dicaPix();
        m.querySelector('#pr-cancelar').onclick = () => m.remove();
        m.querySelector('#pr-criar').onclick = async () => {
            const c = ler();
            const px = lerPix();
            if (px && !px.chave) { dicaPix(); toast('Confira a chave Pix (ou deixe em branco).', 'erro'); return; }
            if (px && !px.nome) { toast('Coloque o nome de quem recebe o Pix.', 'erro'); return; }
            if (px && !podeVisualPro()) {
                m.remove();
                if (window.Monetizacao) window.Monetizacao.abrirModal('O Pix copia e cola na lista é do plano Pro. Seus jogadores pagam com um toque e você não precisa ficar mandando a chave!');
                return;
            }
            const prazoTxt = m.querySelector('#pr-prazo').value;
            const prazo = prazoTxt ? new Date(prazoTxt).getTime() || 0 : 0;
            let pagamento = m.querySelector('#pr-pag').value.trim().slice(0, 80);
            if (px && !pagamento && px.valor) pagamento = 'R$ ' + px.valor.toFixed(2).replace('.', ',') + ' no Pix (copia e cola no link)';
            const cfg = Object.assign(c, {
                quando: m.querySelector('#pr-quando').value.trim().slice(0, 60),
                pagamento,
                prazo,
                pix: px || null
            });
            // lembra a chave para as próximas listas deste racha
            if (px) { pixPadrao = px; gravar('pix', px); }
            // o sorteio usa a mesma configuração
            const qt = document.getElementById('qtd-times'), qp = document.getElementById('qtd-por-time');
            if (qt) qt.value = String(c.times);
            if (qp) qp.value = String(c.porTime);
            const f = window.firebaseFns;
            const btn = m.querySelector('#pr-criar');
            btn.disabled = true;
            if (editar) {
                try { await Promise.all(Object.entries(cfg).map(([k, v]) => f.set(refPresenca(k), v))); }
                catch (e) { btn.disabled = false; toast('Não foi possível salvar (' + ((e && e.code) || 'erro') + ')', 'erro'); return; }
                m.remove();
                toast('Lista ajustada. Os suplentes sobem ou descem sozinhos.');
                return;
            }
            const zerar = m.querySelector('#pr-zerar').checked;
            const codigo = gerarCodigoAoVivo();
            const dados = Object.assign({ dono: currentUserUid, titulo: tituloRacha(), aberta: true, criadoEm: Date.now(), jogadores: jogadoresPublicos(), visual: visualRacha }, cfg);
            try {
                await f.set(f.ref(window.firebaseDb, 'presenca/' + codigo), dados);
            } catch (e) {
                btn.disabled = false;
                const cod = String((e && (e.code || e.message)) || 'erro');
                const dica = /permission/i.test(cod) ? ' O Firebase negou: publique as regras com "presenca" (docs/COMO-CONFIGURAR-MONETIZACAO.md).' : ' Confira a internet.';
                mostrarAlerta('Não consegui criar a lista.' + dica + ' (Código: ' + cod + ')', '❌ LISTA DE PRESENÇA');
                return;
            }
            m.remove();
            presencaCodigo = codigo;
            presencaDados = dados;
            presencaAssinatura = JSON.stringify(dados.jogadores);
            gravar('presenca', { codigo });
            if (zerar) { jogadores.forEach(j => { j.presente = false; }); salvarJogadores(); renderizarPresenca(); }
            escutarPresenca();
            renderizarCardPresenca();
            if (window.Metricas) Metricas.evento('presenca_criada');
            toast('📲 Lista criada! Agora mande o link no grupo.');
            compartilharPresenca();
        };
    }
    // Organizador tira alguém da lista (desistiu ou não pagou): o primeiro suplente sobe sozinho
    // tira da lista; `quemSobe` (opcional) é o suplente escolhido pelo organizador para a vaga
    async function tirarDaLista(ids, quemSobe) {
        const d = presencaDados || {};
        const f = window.firebaseFns;
        if (quemSobe) await f.set(refPresenca('promovidos/' + quemSobe), Date.now()).catch(e => console.error('Lista de presença:', e));
        await Promise.all(ids.map(id => {
            const atual = (d.respostas || {})[id] || {};
            const conv = atual.convidado ? { nome: atual.nome, convidado: true, goleiro: !!atual.goleiro } : {};
            return Promise.all([
                f.set(refPresenca('respostas/' + id), Object.assign({ status: 'nao', em: Date.now(), removido: true }, conv)),
                f.set(refPresenca('pagos/' + id), null),
                f.set(refPresenca('promovidos/' + id), null)
            ]);
        })).catch(e => { console.error('Lista de presença:', e); toast('Não foi possível tirar da lista', 'erro'); });
        if (window.Metricas) Metricas.evento('presenca_removido');
    }
    // ✕ de um confirmado: o organizador escolhe qual suplente entra no lugar (mesma posição: linha ou goleiro)
    async function escolherTirada(id) {
        const r = resumoPresencaAtual();
        const sai = r.confirmados.find(c => c.id === id) || r.espera.find(c => c.id === id);
        if (!sai) return;
        const ehSuplente = r.espera.some(c => c.id === id);
        const opcoes = ehSuplente ? [] : r.espera.filter(c => c.goleiro === sai.goleiro);
        if (!opcoes.length) {
            const ok = await mostrarConfirmacao(ehSuplente ? 'Sai da fila de suplentes.' : 'A vaga fica livre para quem confirmar.', `Tirar ${sai.nome} da lista?`, { ok: 'Tirar', perigo: true });
            if (ok) { await tirarDaLista([id]); toast(`${sai.nome} saiu da lista`); }
            return;
        }
        const m = abrirModalHtml(`<h2>Tirar ${escapeHtml(sai.nome)}</h2>
            <p class="dica-painel">Quem entra no lugar?</p>
            <div class="lista escolha-suplente">${opcoes.map((c, i) => `<label class="lista-item">
                <input type="radio" name="quem-sobe" value="${escapeHtml(c.id)}" ${i === 0 ? 'checked' : ''}>
                ${avatarHtml(c.nome)}<span class="li-txt"><span class="li-titulo">${escapeHtml(c.nome)}</span><span class="li-sub">${i + 1}º da fila${c.convidado ? ' · convidado' : ''}</span></span>
                <span class="radio-marca" aria-hidden="true"></span></label>`).join('')}</div>
            <div class="modal-actions">
                <button type="button" class="btn btn-perigo" id="tirar-ok">Tirar e colocar ${escapeHtml(opcoes[0].nome)}</button>
                <button type="button" class="btn btn-secondary" id="tirar-cancelar">Cancelar</button>
            </div>`);
        const ok = m.querySelector('#tirar-ok');
        m.querySelector('.escolha-suplente').addEventListener('change', () => {
            const sel = m.querySelector('input[name="quem-sobe"]:checked');
            const c = opcoes.find(x => x.id === (sel && sel.value));
            if (c) ok.textContent = 'Tirar e colocar ' + c.nome;
        });
        m.querySelector('#tirar-cancelar').onclick = () => m.remove();
        ok.onclick = async () => {
            const sel = m.querySelector('input[name="quem-sobe"]:checked');
            const quem = opcoes.find(x => x.id === (sel && sel.value)) || opcoes[0];
            ok.disabled = true;
            // o primeiro da fila sobe sozinho; só marca como "colocado" se o organizador escolheu outro
            await tirarDaLista([id], quem.id === opcoes[0].id ? null : quem.id);
            m.remove();
            toast(`${sai.nome} saiu · ${quem.nome} entrou`);
        };
    }
    // "Subir" de um suplente: entra na lista; se estiver cheia, quem confirmou por último vira suplente
    async function subirSuplente(id) {
        const d = presencaDados || {};
        const antes = resumoPresencaAtual();
        const quem = antes.espera.find(c => c.id === id);
        if (!quem) return;
        const agora = Date.now();
        const depois = Logica.resumirPresenca(d.jogadores, d.respostas, d.limite, Object.assign(opcoesPresenca(d), { promovidos: Object.assign({}, d.promovidos, { [id]: agora }) }));
        const caem = antes.confirmados.filter(c => !depois.confirmados.some(x => x.id === c.id));
        const ok = await mostrarConfirmacao(caem.length ? `${caem.map(c => c.nome).join(', ')} ${caem.length > 1 ? 'viram suplentes' : 'vira suplente'} para abrir a vaga.` : 'Ele entra na vaga livre.',
            `Colocar ${quem.nome} na lista?`, { ok: 'Colocar' });
        if (!ok) return;
        try { await window.firebaseFns.set(refPresenca('promovidos/' + id), agora); toast(`${quem.nome} entrou na lista`); }
        catch (e) { toast('Não foi possível mudar a lista', 'erro'); }
        if (window.Metricas) Metricas.evento('presenca_subiu');
    }
    async function adicionarConvidadoPresenca(idConv) {
        const d = presencaDados || {};
        const resp = (d.respostas || {})[idConv];
        if (!resp || !presencaCodigo) return;
        if (window.Monetizacao && !window.Monetizacao.checarLimiteJogadores(jogadores.length, 1)) return;
        const novoId = Logica.idUnico();
        jogadores.push({ id: novoId, nome: String(resp.nome || 'Convidado').slice(0, 40), isGoleiro: !!resp.goleiro, estrelas: 3.0, presente: resp.status === 'vou' });
        salvarJogadores();           // também publica o nome novo na lista
        renderizarElenco();
        const f = window.firebaseFns;
        try {
            // a resposta (e o pagamento) passa a ser do jogador do elenco; mantém o horário: não perde a vaga
            await f.set(refPresenca('respostas/' + novoId), { status: resp.status, em: resp.em || Date.now() });
            if (d.pagos && d.pagos[idConv]) { await f.set(refPresenca('pagos/' + novoId), true); await f.set(refPresenca('pagos/' + idConv), null); }
            await f.set(refPresenca('migrados/' + idConv), String(novoId));
            await f.set(refPresenca('respostas/' + idConv), null);
        } catch (e) { console.error('Lista de presença:', e); }
        if (window.Metricas) Metricas.evento('presenca_convidado_add');
        toast(`${resp.nome} entrou no elenco com 3 estrelas. Ajuste na aba Jogadores.`);
    }
    function configurarPresenca() {
        const $ = id => document.getElementById(id);
        $('btn-presenca-criar')?.addEventListener('click', () => abrirConfigPresenca(false));
        $('btn-presenca-enviar')?.addEventListener('click', compartilharPresenca);
        $('btn-presenca-copiar')?.addEventListener('click', async () => {
            if (window.Metricas) Metricas.evento('presenca_lista_copiada');
            toast(await copiarTexto(textoListaPresenca()) ? '📋 Lista atualizada copiada! Cole no grupo.' : 'Copie o link no campo acima.');
        });
        $('btn-presenca-fechar')?.addEventListener('click', async () => {
            if (!presencaCodigo) return;
            const abrir = presencaDados && presencaDados.aberta === false;
            try { await window.firebaseFns.set(refPresenca('aberta'), abrir); toast(abrir ? '🔓 Lista reaberta' : '🔒 Lista fechada'); }
            catch (e) { toast('Não foi possível mudar a lista', 'erro'); }
        });
        $('btn-presenca-encerrar')?.addEventListener('click', async () => {
            const ok = await mostrarConfirmacao('O link para de funcionar e as respostas são apagadas. A presença marcada aqui no app continua.', 'Encerrar a lista?', { ok: 'Encerrar', perigo: true });
            if (!ok || !presencaCodigo) return;
            const ref = refPresenca();
            pararEscutaPresenca();
            presencaCodigo = null; presencaDados = null; presencaAssinatura = '';
            window.firebaseFns.set(ref, null).catch(e => console.error('Lista de presença:', e));
            gravar('presenca', null);
            renderizarCardPresenca();
            toast('Lista encerrada.');
        });
        // botões dentro do card (são redesenhados a cada resposta)
        $('card-presenca')?.addEventListener('click', async (e) => {
            const alvo = sel => e.target.closest && e.target.closest(sel);
            if (!presencaCodigo) return;
            const r = resumoPresencaAtual();
            const nomeDe = id => ((r.confirmados.concat(r.espera).find(c => c.id === id)) || {}).nome || 'essa pessoa';
            let b;
            if ((b = alvo('[data-add-conv]'))) { adicionarConvidadoPresenca(b.dataset.addConv); return; }
            if (alvo('#btn-presenca-config')) { abrirConfigPresenca(true); return; }
            if ((b = alvo('[data-pago]'))) {
                const id = b.dataset.pago;
                const pago = !((presencaDados.pagos || {})[id]);
                if (!pago && !(await mostrarConfirmacao(`Desmarcar o pagamento de ${nomeDe(id)}?`, '💰 PAGAMENTO'))) return;
                b.disabled = true;
                try { await window.firebaseFns.set(refPresenca('pagos/' + id), pago ? true : null); if (window.Metricas && pago) Metricas.evento('presenca_pago'); }
                catch (er) { toast('Não foi possível marcar', 'erro'); }
                b.disabled = false;
                return;
            }
            if ((b = alvo('[data-tirar]'))) { escolherTirada(b.dataset.tirar); return; }
            if ((b = alvo('[data-subir]'))) { subirSuplente(b.dataset.subir); return; }
        });
    }
    configurarPresenca();

    function salvarJogadores() { gravar('jogadores', jogadores); publicarJogadoresPresenca(); }
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
        const cache = lerLocal(chaveCache(uid));
        let resolvido = false;
        const usarCache = () => {
            if (resolvido || uid !== currentUserUid) return;
            resolvido = true;
            modoOffline = true;
            espelho = cache;
            aplicarDados(JSON.parse(JSON.stringify(cache)));
            toast('📴 Sem internet: usando os dados salvos neste aparelho. O que mudar sobe quando a conexão voltar.');
            if (window.Metricas) Metricas.evento('abriu_offline');
        };
        // sem internet e com cópia no aparelho: abre na hora
        if (cache && typeof navigator !== 'undefined' && navigator.onLine === false) { usarCache(); return; }
        mostrarCarregando(true, 'Carregando seus dados...');
        // internet ruim (comum na quadra): não deixa o usuário esperando mais que 6 s
        if (cache) setTimeout(usarCache, 6000);

        lerComTentativas(userRef, uid).then((snapshot) => {
            if (uid !== currentUserUid || resolvido) return; // trocou de conta ou já abriu com a cópia
            resolvido = true;
            modoOffline = false;
            const dados = reaplicarPendentes(uid, snapshot.exists() ? (snapshot.val() || {}) : {});
            espelho = JSON.parse(JSON.stringify(dados));
            salvarLocal(chaveCache(uid), espelho);
            aplicarDados(dados);
        }).catch(async (error) => {
            if (uid !== currentUserUid || resolvido) return;
            const detalhe = String((error && (error.code || error.message)) || 'erro desconhecido');
            if (cache && !/permission/i.test(detalhe)) { usarCache(); return; }
            resolvido = true;
            console.error("Erro ao carregar dados do Firebase:", error);
            mostrarCarregando(false);
            // dadosCarregados continua false: nada será salvo por cima dos seus dados
            let dica = 'Confira a internet.';
            if (/permission/i.test(detalhe)) dica = 'O Firebase negou a leitura: as regras do Realtime Database não liberam "usuarios".';
            else if (/offline|unavailable|network/i.test(detalhe)) dica = 'Não conectou ao banco: confira a internet e o endereço (databaseURL) do Realtime Database.';
            const tentar = await mostrarConfirmacao(`Não consegui carregar seus dados. ${dica} (Código: ${detalhe}) Tentar de novo?`, '❌ ERRO AO CARREGAR');
            if (tentar && uid === currentUserUid) carregarDadosDoFirebase();
        });
    }

    // Coloca na tela os dados de usuarios/<uid> (vindos da nuvem ou da cópia do aparelho)
    function aplicarDados(dados) {
            dados = dados || {};

            perfil = (dados.perfil && typeof dados.perfil === 'object') ? dados.perfil : {};
            renderizarPerfil();

            // perfis de racha: principal + os criados pelo usuário
            const extras = comoLista(dados.rachasLista).filter(r => r && r.id && r.nome).map(r => ({ id: String(r.id), nome: String(r.nome) }));
            rachas = [{ id: 'principal', nome: 'Racha principal' }].concat(extras);
            if (!rachaEscolhida) {
                const salvo = dados.rachaAtivo ? String(dados.rachaAtivo) : 'principal';
                rachaAtivo = rachas.some(r => r.id === salvo) ? salvo : 'principal';
                rachaEscolhida = true;
            }
            if (!rachas.some(r => r.id === rachaAtivo)) rachaAtivo = 'principal';
            const todosExtras = (dados.rachas && typeof dados.rachas === 'object') ? dados.rachas : {};
            resumoRachas = { principal: { j: comoLista(dados.jogadores).length, h: comoLista(dados.historico).length } };
            extras.forEach(r => { const d = todosExtras[r.id] || {}; resumoRachas[r.id] = { j: comoLista(d.jogadores).length, h: comoLista(d.historico).length }; });
            const base = rachaAtivo === 'principal' ? dados : (todosExtras[rachaAtivo] || {});

            jogadores = comoLista(base.jogadores);
            historico = comoLista(base.historico).map(h => Object.assign({}, h, {
                classificacao: Logica.limparMapa(h.classificacao),
                artilharia: Logica.limparMapa(h.artilharia),
                times: comoLista(h.times).map(Logica.normalizarTime)
            }));

            const c = base.campeonatoAtivo;
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
                placarRacha = { a: Number(c.placarRacha && c.placarRacha.a) || 0, b: Number(c.placarRacha && c.placarRacha.b) || 0 };
            }

            aoVivoCodigo = (base.aoVivo && base.aoVivo.codigo) || null;
            presencaCodigo = (base.presenca && base.presenca.codigo) || null;
            visualRacha = (base.visual && typeof base.visual === 'object') ? base.visual : {};
            pixPadrao = (base.pix && typeof base.pix === 'object') ? base.pix : null;
            caixa = (base.caixa && typeof base.caixa === 'object') ? base.caixa : {};
            caixaMes = Logica.mesISO();
            presencaAssinatura = '';
            dadosCarregados = true;
            aplicarVisual();
            escutarPresenca();
            renderizarRachas();
            verificarAdmin();
            atualizarCardAoVivo();
            publicarAoVivo(false);
            mostrarCarregando(false);
            renderizarElenco();
            renderizarHistorico();
            if (timesSorteados.length > 0) renderizarCampeonato();
    }

    // --- SISTEMA DE DIÁLOGOS E ALERTAS CUSTOMIZADOS ---
    function criarContainerAlertas() {
        if (document.getElementById('modal-alerta-custom')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'modal-alerta-custom';
        modalDiv.className = 'modal hidden';
        modalDiv.style.zIndex = '99999';

        modalDiv.setAttribute('role', 'alertdialog');
        modalDiv.setAttribute('aria-labelledby', 'alerta-titulo');
        modalDiv.setAttribute('aria-describedby', 'alerta-mensagem');
        modalDiv.innerHTML = `
            <div class="modal-content dialogo">
                <h2 id="alerta-titulo">Aviso</h2>
                <p id="alerta-mensagem"></p>
                <div id="alerta-botoes" class="dialogo-botoes">
                    <button id="btn-alerta-cancelar" class="btn btn-secondary hidden">Cancelar</button>
                    <button id="btn-alerta-ok" class="btn btn-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
    }

    criarContainerAlertas();

    window.mostrarAlerta = function(mensagem, titulo = 'Aviso') {
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

            elTitulo.textContent = window.UI ? UI.tituloLimpo(titulo) : titulo;
            elMensagem.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;

            btnCancelar.classList.add('hidden');
            btnOk.textContent = 'OK';
            btnOk.className = 'btn btn-primary';

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

    // opcoes: { ok: 'Apagar', perigo: true } -> botão com o nome da ação (vermelho quando não tem volta)
    function mostrarConfirmacao(mensagem, titulo = 'Confirmar', opcoes) {
        opcoes = opcoes || {};
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

            elTitulo.textContent = window.UI ? UI.tituloLimpo(titulo) : titulo;
            elMensagem.textContent = window.UI ? UI.semEmoji(mensagem) : mensagem;

            btnCancelar.classList.remove('hidden');
            btnOk.textContent = opcoes.ok || 'Confirmar';
            btnOk.className = 'btn ' + (opcoes.perigo ? 'btn-perigo' : 'btn-primary');
            btnCancelar.textContent = opcoes.cancelar || 'Cancelar';

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

    // bolinha com as iniciais (cor fixa por nome) — usada nas listas de jogadores
    function avatarHtml(nome) {
        const n = String(nome || '?').trim();
        const partes = n.split(/\s+/);
        const ini = ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || ''))).toUpperCase();
        let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
        return `<span class="av" style="background:hsl(${h} 62% 68%)">${escapeHtml(ini)}</span>`;
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

    // Telas: as 5 do menu de baixo + as que ficam "dentro" de outra (data-pai), que mostram o botão voltar
    function abaRaiz(id) {
        let el = document.getElementById(id), n = 0;
        while (el && el.dataset && el.dataset.pai && n++ < 5) el = document.getElementById(el.dataset.pai);
        return el ? el.id : id;
    }
    function irParaAba(id, semHistorico, titulo) {
        const alvo = document.getElementById(id);
        if (!alvo) return;
        const btn = document.querySelector(`.tab-btn[data-tab="${abaRaiz(id)}"]`);
        const mudou = id !== abaAtual;

        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        tabContents.forEach(c => c.classList.toggle('active', c === alvo));
        if (tituloTela) tituloTela.textContent = titulo || (alvo.dataset && alvo.dataset.title) || (btn ? btn.textContent.trim() : '');
        const temPai = !!(alvo.dataset && alvo.dataset.pai);
        const bv = document.getElementById('btn-voltar'), bm = document.getElementById('btn-menu');
        if (bv) bv.classList.toggle('hidden', !temPai);
        if (bm) bm.classList.toggle('hidden', temPai);
        abaAtual = id;
        if (document.body && document.body.dataset) document.body.dataset.aba = id;

        if (id === 'tab-sorteio') renderizarPresenca();
        if (id === 'tab-historico') renderizarHistorico();
        if (id === 'tab-ranking') renderizarRanking();
        if (id === 'tab-mais') atualizarTelaMais();
        if (id === 'tab-financeiro') renderizarCaixa();
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

    // Apito de juiz de fim de partida (6 s). O som em si está em js/apito.js
    function tocarApitoJuiz() {
        try {
            prepararAudio();
            if (!audioCtx || !window.Apito) return;
            window.Apito.tocar(audioCtx);
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
                toast('Cole a lista de nomes primeiro.', 'erro');
                if (inputLote.focus) inputLote.focus();
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
            const extra = ignoradas.length ? ` · ${ignoradas.length} linha${ignoradas.length > 1 ? 's' : ''} ignorada${ignoradas.length > 1 ? 's' : ''}` : '';
            toast(`${adicionados} jogador${adicionados === 1 ? '' : 'es'} adicionado${adicionados === 1 ? '' : 's'}${extra}`);
            if (adicionados && window.UI) UI.fecharSheet('sheet-novo-jogador');
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
                toast('Digite o nome do jogador.', 'erro');
                if (nomeInput.focus) nomeInput.focus();
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
            // o painel continua aberto para cadastrar o próximo
            toast(`${nome} adicionado`);
            if (nomeInput.focus) nomeInput.focus();
        });
    }

    // --- ELENCO: busca, posição e nível; toque no jogador para editar ---
    let buscaElenco = '';
    let posicaoElenco = 'todos';   // todos | linha | goleiro
    function renderizarElenco() {
        const container = document.getElementById('lista-jogadores-cadastrados');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('[data-acao]');
            if (!btn) return;
            if (btn.dataset.acao === 'editar') window.abrirEdicao(btn.dataset.id);
            if (btn.dataset.acao === 'novo') abrirNovoJogador('um');
            if (btn.dataset.acao === 'limpar-filtros') limparFiltrosElenco();
        };

        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const resumo = document.getElementById('elenco-resumo');
        const goleiros = jogadores.filter(j => j.isGoleiro).length;
        if (resumo) resumo.textContent = !jogadores.length ? 'Nenhum jogador'
            : `${jogadores.length} jogador${jogadores.length > 1 ? 'es' : ''}${goleiros ? ` · ${goleiros} goleiro${goleiros > 1 ? 's' : ''}` : ''}`;

        if (jogadores.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('users')}
                <h3>Seu elenco está vazio</h3>
                <p>Cadastre quem joga no racha. Dá para colar a lista do grupo de uma vez.</p>
                <button type="button" class="btn btn-primary" data-acao="novo">Adicionar jogadores</button></div>`;
            return;
        }

        const termo = Logica.normalizarNome(buscaElenco);
        let visiveis = listaFiltrada('elenco', jogadores)
            .filter(j => posicaoElenco === 'todos' || (posicaoElenco === 'goleiro' ? j.isGoleiro : !j.isGoleiro))
            .filter(j => !termo || Logica.normalizarNome(j.nome).includes(termo));
        visiveis = visiveis.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

        const fNivel = filtrosEstrelas.elenco || {};
        const nivelAtivo = String(fNivel.min || '').trim() !== '' || String(fNivel.max || '').trim() !== '';
        const chipNivel = document.getElementById('chip-nivel');
        if (chipNivel) chipNivel.classList.toggle('ativo-filtro', nivelAtivo);
        if (resumo && (termo || posicaoElenco !== 'todos' || nivelAtivo)) resumo.textContent = `${visiveis.length} de ${jogadores.length} jogadores`;

        if (visiveis.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('search')}
                <h3>Ninguém encontrado</h3>
                <p>Nenhum jogador com esses filtros.</p>
                <button type="button" class="btn btn-secondary" data-acao="limpar-filtros">Limpar filtros</button></div>`;
            return;
        }

        container.innerHTML = '<div class="lista">' + visiveis.map(j => {
            const nivel = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
            return `<button type="button" class="lista-item" data-acao="editar" data-id="${escapeHtml(String(j.id))}">
                ${avatarHtml(j.nome)}
                <span class="li-txt"><span class="li-titulo">${escapeHtml(j.nome)}</span>
                    <span class="li-sub">${j.isGoleiro ? ic('glove', 'i-sm') + 'Goleiro' : 'Linha'}</span></span>
                <span class="li-fim"><span class="nivel">${ic('star', 'i-cheio')}${nivel}</span>${ic('chevron', 'i-sm')}</span>
            </button>`;
        }).join('') + '</div>';
    }
    function limparFiltrosElenco() {
        buscaElenco = ''; posicaoElenco = 'todos';
        const busca = document.getElementById('busca-elenco'); if (busca) busca.value = '';
        document.querySelectorAll('#chips-elenco [data-pos]').forEach(c => c.classList.toggle('on', c.dataset.pos === 'todos'));
        const box = document.getElementById('filtro-elenco');
        if (box && box.querySelectorAll) box.querySelectorAll('input[data-f]').forEach(el => { el.value = ''; });
        const f = filtrosEstrelas.elenco; if (f) { f.min = ''; f.max = ''; }
        renderizarElenco();
    }
    function abrirNovoJogador(modo) {
        if (!window.UI) return;
        mudarModoNovo(modo || 'um');
        UI.abrirSheet('sheet-novo-jogador');
        const alvo = document.getElementById(modo === 'lista' ? 'lista-lote' : 'novo-nome');
        if (alvo && alvo.focus) setTimeout(() => alvo.focus(), 260);
    }
    function mudarModoNovo(modo) {
        document.querySelectorAll('#seg-novo-modo [data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modo));
        const um = document.getElementById('novo-modo-um'), lista = document.getElementById('novo-modo-lista');
        if (um) um.classList.toggle('hidden', modo !== 'um');
        if (lista) lista.classList.toggle('hidden', modo !== 'lista');
    }
    (function ligarTelaElenco() {
        const $ = id => document.getElementById(id);
        const busca = $('busca-elenco');
        if (busca) busca.addEventListener('input', () => { buscaElenco = busca.value; renderizarElenco(); });
        const chips = $('chips-elenco');
        if (chips) chips.addEventListener('click', (e) => {
            const c = e.target.closest('.chip');
            if (!c) return;
            if (c.id === 'chip-nivel') { if (window.UI) UI.abrirSheet('sheet-filtro-elenco'); return; }
            posicaoElenco = c.dataset.pos || 'todos';
            chips.querySelectorAll('[data-pos]').forEach(x => x.classList.toggle('on', x === c));
            renderizarElenco();
        });
        $('btn-novo-jogador')?.addEventListener('click', () => abrirNovoJogador('um'));
        $('btn-elenco-opcoes')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-elenco-opcoes'); });
        $('btn-elenco-colar')?.addEventListener('click', () => { if (window.UI) UI.fecharSheet('sheet-elenco-opcoes'); abrirNovoJogador('lista'); });
        $('seg-novo-modo')?.addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b) mudarModoNovo(b.dataset.modo); });
        $('novo-nome')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-add-jogador')?.click(); } });
        $('btn-excluir-jogador')?.addEventListener('click', async () => {
            const id = $('edit-id') ? $('edit-id').value : '';
            if (await window.excluirJogador(id) && window.UI) UI.fecharSheet('modal-edicao');
        });
    })();

    window.excluirJogador = async function(id) {
        const j = jogadores.find(x => x.id == id);
        const confirmou = await mostrarConfirmacao(`${j ? j.nome : 'O jogador'} sai do elenco. O histórico dos campeonatos continua.`, 'Excluir jogador?', { ok: 'Excluir', perigo: true });
        if (confirmou) {
            jogadores = jogadores.filter(x => x.id != id);
            salvarJogadores();
            renderizarElenco();
            toast(`${j ? j.nome : 'Jogador'} excluído`);
        }
        return confirmou;
    };

    const btnApagarTodos = document.getElementById('btn-apagar-todos');
    if (btnApagarTodos) {
        btnApagarTodos.addEventListener('click', async () => {
            if (jogadores.length === 0) {
                toast('O elenco já está vazio.');
                return;
            }
            const confirmou = await mostrarConfirmacao(
                `Os ${jogadores.length} jogadores do elenco serão apagados. Não dá para desfazer.`,
                'Apagar todos os jogadores?', { ok: 'Apagar todos', perigo: true }
            );
            if (!confirmou) return;
            if (window.UI) UI.fecharSheet('sheet-elenco-opcoes');
            jogadores = [];
            salvarJogadores();
            renderizarElenco();
            toast('Elenco apagado');
        });
    }

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

        if (window.UI) UI.abrirSheet('modal-edicao'); else if (modal) modal.classList.remove('hidden');
    };

    const btnFecharModal = document.getElementById('btn-fechar-modal');
    if (btnFecharModal) {
        btnFecharModal.addEventListener('click', () => {
            const modal = document.getElementById('modal-edicao');
            if (modal) modal.classList.add('hidden');
            if (window.UI) UI.fecharSheet('modal-edicao');
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
                if (window.UI) UI.fecharSheet('modal-edicao');
                toast('Alterações salvas');
            }
        });
    }

    // --- 4. ABA SORTEIO ---
    // --- SORTEIO: quem veio (busca, presentes/fora, nível) ---
    let buscaPresenca = '';
    let filtroPresenca = 'todos';   // todos | presentes | fora
    function renderizarPresenca() {
        const container = document.getElementById('lista-presenca');
        atualizarBarraSorteio();
        if (!container) return;
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const presentes = jogadores.filter(j => j.presente);
        const golsPres = presentes.filter(j => j.isGoleiro).length;
        const resumo = document.getElementById('presenca-resumo-tela');
        if (resumo) resumo.textContent = !jogadores.length ? 'Nenhum jogador no elenco'
            : `${presentes.length} de ${jogadores.length} presentes${golsPres ? ` · ${golsPres} goleiro${golsPres > 1 ? 's' : ''}` : ''}`;

        if (jogadores.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('users')}<h3>Cadastre o elenco primeiro</h3>
                <p>O sorteio usa os jogadores do elenco e o nível de cada um.</p>
                <button type="button" class="btn btn-primary" data-ir-elenco>Ir para o elenco</button></div>`;
            container.onclick = (e) => { if (e.target.closest('[data-ir-elenco]')) irParaAba('tab-jogadores'); };
            return;
        }
        const termo = Logica.normalizarNome(buscaPresenca);
        const visiveis = listaFiltrada('presenca', jogadores)
            .filter(j => filtroPresenca === 'todos' || (filtroPresenca === 'presentes' ? j.presente : !j.presente))
            .filter(j => !termo || Logica.normalizarNome(j.nome).includes(termo))
            .slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const fN = filtrosEstrelas.presenca || {};
        const chipN = document.getElementById('chip-nivel-presenca');
        if (chipN) chipN.classList.toggle('ativo-filtro', String(fN.min || '').trim() !== '' || String(fN.max || '').trim() !== '');

        if (visiveis.length === 0) {
            container.innerHTML = `<div class="vazio">${ic('search')}<h3>Ninguém aqui</h3><p>Nenhum jogador com esses filtros.</p></div>`;
            return;
        }
        container.innerHTML = '<div class="lista">' + visiveis.map(j => {
            const nivel = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
            return `<div class="item-presenca">
                <input type="checkbox" class="chk-presenca" id="p-${escapeHtml(String(j.id))}" data-id="${escapeHtml(String(j.id))}" ${j.presente ? 'checked' : ''}>
                <label for="p-${escapeHtml(String(j.id))}" class="lbl-presenca">${avatarHtml(j.nome)}
                    <span class="li-txt"><span class="li-titulo">${escapeHtml(j.nome)}</span><span class="li-sub">${j.isGoleiro ? ic('glove', 'i-sm') + 'Goleiro' : 'Linha'} · <span class="nivel-txt">${ic('star', 'i-cheio')}${nivel}</span></span></span>
                    <span class="switch" aria-hidden="true"></span></label>
            </div>`;
        }).join('') + '</div>';
        container.onchange = (e) => {
            const c = e.target.closest && e.target.closest('.chk-presenca');
            if (!c) return;
            const j = jogadores.find(x => String(x.id) === c.dataset.id);
            if (!j) return;
            j.presente = c.checked;
            salvarJogadores();
            const pres = jogadores.filter(x => x.presente), g = pres.filter(x => x.isGoleiro).length;
            if (resumo) resumo.textContent = `${pres.length} de ${jogadores.length} presentes${g ? ` · ${g} goleiro${g > 1 ? 's' : ''}` : ''}`;
            atualizarBarraSorteio();
        };
    }
    function atualizarBarraSorteio() {
        const t = parseInt(document.getElementById('qtd-times')?.value, 10) || 0;
        const l = parseInt(document.getElementById('qtd-por-time')?.value, 10) || 0;
        const r = document.getElementById('resumo-config-sorteio');
        if (r) r.textContent = `${t} times de ${l}`;
        const p = document.getElementById('bc-presentes');
        const n = jogadores.filter(j => j.presente).length;
        if (p) p.textContent = `${n} presente${n === 1 ? '' : 's'}`;
    }
    (function ligarTelaSorteio() {
        const $ = id => document.getElementById(id);
        const busca = $('busca-presenca');
        if (busca) busca.addEventListener('input', () => { buscaPresenca = busca.value; renderizarPresenca(); });
        $('chips-presenca')?.addEventListener('click', (e) => {
            const c = e.target.closest('.chip');
            if (!c) return;
            if (c.id === 'chip-nivel-presenca') { if (window.UI) UI.abrirSheet('sheet-filtro-presenca'); return; }
            filtroPresenca = c.dataset.pres || 'todos';
            $('chips-presenca').querySelectorAll('[data-pres]').forEach(x => x.classList.toggle('on', x === c));
            renderizarPresenca();
        });
        $('btn-presenca-opcoes')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-presenca-opcoes'); });
        const marcarTodos = (v) => {
            jogadores.forEach(j => { j.presente = v; });
            salvarJogadores(); renderizarPresenca();
            if (window.UI) UI.fecharSheet('sheet-presenca-opcoes');
            toast(v ? 'Todos marcados como presentes' : 'Presença zerada');
        };
        $('btn-marcar-todos')?.addEventListener('click', () => marcarTodos(true));
        $('btn-desmarcar-todos')?.addEventListener('click', () => marcarTodos(false));
        $('btn-config-sorteio')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-config-sorteio'); });
        $('abrir-lista-link')?.addEventListener('click', () => { renderizarCardPresenca(); if (window.UI) UI.abrirSheet('sheet-lista-link'); });
        // − e + dos seletores de quantidade (data-alvo = id do campo)
        document.querySelectorAll('.stepper[data-alvo]').forEach(st => {
            const campo = $(st.dataset.alvo);
            const min = Number(st.dataset.min) || 0, max = Number(st.dataset.max) || 99;
            const ajustar = v => { if (campo) { campo.value = String(Math.min(max, Math.max(min, v))); atualizarBarraSorteio(); } };
            st.addEventListener('click', (e) => { const b = e.target.closest('[data-passo]'); if (b) ajustar((parseInt(campo.value, 10) || 0) + Number(b.dataset.passo)); });
            if (campo) campo.addEventListener('change', () => ajustar(parseInt(campo.value, 10) || min));
        });
        $('btn-copiar-lista')?.addEventListener('click', copiarListaTimes);
        $('btn-imagem-times')?.addEventListener('click', compartilharImagemTimes);
        $('btn-sortear-de-novo')?.addEventListener('click', () => $('btn-sortear')?.click());
        atualizarBarraSorteio();
    })();

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', async () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimes = parseInt(document.getElementById('qtd-times')?.value) || 2;
            const porTime = parseInt(document.getElementById('qtd-por-time')?.value) || 0;

            if (qtdTimes < 2 || qtdTimes > 8) {
                toast('Escolha entre 2 e 8 times.', 'erro');
                return;
            }
            if (presentes.length < qtdTimes) {
                toast(presentes.length ? `Só ${presentes.length} presente${presentes.length > 1 ? 's' : ''} para ${qtdTimes} times. Marque mais gente.` : 'Marque quem veio jogar primeiro.', 'erro');
                return;
            }

            contadorSorteios++;
            if (window.Metricas) Metricas.evento('sorteio');
            const resultado = Logica.sortearTimes(presentes, qtdTimes, porTime);
            sorteioAtual = resultado.times;
            exibirTimesSorteados();
        });
    }

    // Resultado do sorteio (painel): um card por time, nível médio e goleiro em destaque
    const CORES_TIMES = ['#2da762', '#e3b341', '#4f8fe0', '#ef6b6b', '#a66be0', '#e08a3c', '#3cc4c4', '#c9cfd3'];
    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        if (!container) return;
        container.innerHTML = '';
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const fmt = v => (Number(v) || 0).toFixed(1).replace('.', ',');
        const medias = sorteioAtual.map(t => t.jogadores.length ? t.somaEstrelas / t.jogadores.length : 0);
        const dif = medias.length ? Math.max(...medias) - Math.min(...medias) : 0;
        const sub = document.getElementById('resultado-sub');
        if (sub) sub.textContent = `${sorteioAtual.length} times · diferença de nível ${fmt(dif)}${contadorSorteios > 1 ? ` · ${contadorSorteios}º sorteio` : ''}`;

        sorteioAtual.forEach((t, i) => {
            const card = document.createElement('div');
            card.className = 'time-card';
            const linhas = t.jogadores.map(j => `<li>
                    <span class="tc-pos">${j.isGoleiro ? ic('glove', 'i-sm') : ''}</span>
                    <span class="tc-nome">${escapeHtml(j.nome)}</span>
                    <span class="tc-nivel">${fmt(j.estrelas || 3)}</span>
                </li>`).join('');
            card.innerHTML = `
                <div class="tc-cab">
                    <span class="tc-cor" style="background:${CORES_TIMES[i % CORES_TIMES.length]}"></span>
                    <b>${escapeHtml(t.nome)}</b>
                    <span class="nivel">${ic('star', 'i-cheio')}${fmt(medias[i])}</span>
                </div>
                <ul>${linhas}</ul>
                ${t.temGoleiro ? '' : '<p class="tc-aviso">Sem goleiro fixo</p>'}`;
            container.appendChild(card);
        });
        const res = document.getElementById('resultado-sorteio');
        if (window.UI) UI.abrirSheet('resultado-sorteio'); else if (res) res.classList.remove('hidden');
    }

    // ---------- CARA DO RACHA (🎨 Personalizar): nome, escudo e cor ----------
    // Fica em usuarios/<uid>/[rachas/<id>/]visual = { nome, cor, escudo (imagem pequena) }.
    // Aparece no app, no link da lista, no placar ao vivo e nas imagens do WhatsApp.
    let visualRacha = {};
    function aplicarVisual() {
        const c = Logica.corRacha(visualRacha.cor);
        const raiz = document.documentElement && document.documentElement.style;
        if (raiz && raiz.setProperty) {
            raiz.setProperty('--neon', c.a); raiz.setProperty('--verde', c.b);
            raiz.setProperty('--neon-rgb', Logica.hexParaRgb(c.a)); raiz.setProperty('--verde-rgb', Logica.hexParaRgb(c.b));
        }
        const logo = document.querySelector('.app-header .app-logo');
        if (logo && 'src' in logo) logo.src = visualRacha.escudo || 'img/icon-192.png';
        const sub = document.getElementById('sub-racha');
        if (sub) sub.textContent = visualRacha.nome || nomeRachaAtivo();
    }
    const podeVisualPro = () => !window.Monetizacao || window.Monetizacao.isPro();
    // Logo do racha: aceita PNG transparente ou foto com fundo.
    // abrirImagem -> { img, transparente }; desenharLogo -> dataURL quadrado de `lado` px:
    //   'encaixar'  = imagem inteira dentro do quadrado (bom para escudo PNG sem fundo)
    //   'preencher' = cobre o quadrado e corta as sobras (bom para foto com fundo)
    function abrirImagem(arquivo) {
        return new Promise((ok, falha) => {
            if (!arquivo || !/^image\//.test(arquivo.type || 'image/')) { falha(new Error('não é imagem')); return; }
            const leitor = new FileReader();
            leitor.onerror = falha;
            leitor.onload = () => {
                const img = new Image();
                img.onerror = falha;
                img.onload = () => {
                    // tem transparência? (olha uma versão pequena da imagem)
                    let transparente = false;
                    try {
                        const t = document.createElement('canvas'); t.width = t.height = 48;
                        const cx = t.getContext('2d'); cx.drawImage(img, 0, 0, 48, 48);
                        const px = cx.getImageData(0, 0, 48, 48).data;
                        for (let i = 3; i < px.length; i += 4) if (px[i] < 245) { transparente = true; break; }
                    } catch (e) { /* ignora */ }
                    ok({ img, transparente });
                };
                img.src = leitor.result;
            };
            leitor.readAsDataURL(arquivo);
        });
    }
    function desenharLogo(origem, modo, lado) {
        const { img, transparente } = origem;
        const c = document.createElement('canvas'); c.width = c.height = lado;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        const k = (modo === 'preencher' ? Math.max : Math.min)(lado / img.width, lado / img.height);
        const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        // sobra transparente (encaixar) ou imagem transparente -> PNG; foto cobrindo tudo -> JPEG (bem mais leve)
        const temTransparencia = transparente || (modo !== 'preencher' && Math.abs(img.width - img.height) > 2);
        return temTransparencia ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
    }

    function abrirPersonalizar() {
        if (!dadosCarregados) return;
        fecharDrawer();
        const temp = Object.assign({ nome: '', cor: 'verde', escudo: '' }, visualRacha);
        let origem = null;          // imagem escolhida agora (para trocar entre preencher/encaixar)
        let modoLogo = 'encaixar';
        const sugestao = rachaAtivo !== 'principal' ? nomeRachaAtivo() : ((perfil && perfil.apelido) ? 'Racha do ' + perfil.apelido : '');
        const m = abrirModalHtml(`<h2>🎨 Cara do racha</h2>
            <div class="vis-preview" id="vis-preview"></div>
            <label class="subtext" for="vis-nome" style="display:block;margin-top:12px;">Nome do racha</label>
            <input type="text" id="vis-nome" maxlength="32" placeholder="Ex.: Pelada de Sexta" value="${escapeHtml(temp.nome || sugestao)}">
            <p class="subtext" style="margin:14px 0 6px;">Logo / escudo do racha ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
            <div class="vis-escudo-acoes">
                <button type="button" class="btn btn-secondary" id="vis-escudo-btn">${window.UI ? UI.icone('image', 'i-sm') : ''}Escolher foto ou PNG</button>
                <button type="button" class="btn btn-secondary" id="vis-escudo-tirar">Tirar</button>
            </div>
            <input type="file" id="vis-escudo-arq" accept="image/*" class="hidden">
            <div class="vis-modo hidden" id="vis-modo" role="group" aria-label="Como a imagem fica">
                <button type="button" data-modo="preencher">Preencher<small>foto com fundo</small></button>
                <button type="button" data-modo="encaixar">Encaixar inteira<small>escudo sem fundo</small></button>
            </div>
            <p class="subtext" style="margin:6px 0 0;">Pode ser escudo em PNG (com ou sem fundo) ou uma foto do grupo.</p>
            <p class="subtext" style="margin:14px 0 6px;">Cor ${podeVisualPro() ? '' : '<span class="tag-pro">PRO</span>'}</p>
            <div class="vis-cores">${Object.entries(Logica.CORES_RACHA).map(([k, c]) => `<button type="button" class="vis-cor" data-cor="${k}" title="${c.nome}" aria-label="${c.nome}" style="background:linear-gradient(135deg, ${c.a}, ${c.b})"></button>`).join('')}</div>
            <p class="subtext" style="margin:12px 0 0;">Aparece no app, no link da lista de presença, no placar ao vivo e nas imagens que você manda no grupo.</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="vis-salvar">Salvar</button><button type="button" class="btn btn-secondary" id="vis-cancelar">Cancelar</button></div>`);
        const $m = sel => m.querySelector(sel);
        const desenhar = () => {
            const c = Logica.corRacha(temp.cor);
            const nome = ($m('#vis-nome').value || '').trim() || 'Seu racha';
            const prev = $m('#vis-preview');
            if (prev) {
                prev.style.background = `linear-gradient(135deg, ${c.b}55, transparent 70%), rgba(0,0,0,.3)`;
                prev.style.borderColor = c.a + '88';
                prev.innerHTML = `<img src="${temp.escudo || 'img/icon-192.png'}" alt=""><div><b style="color:${c.a}">${escapeHtml(nome)}</b><small>Times sorteados · placar ao vivo</small></div>`;
            }
            m.querySelectorAll('.vis-cor').forEach(b => b.classList.toggle('on', b.dataset.cor === temp.cor));
            const vm = $m('#vis-modo');
            if (vm) {
                vm.classList.toggle('hidden', !origem || !temp.escudo);
                vm.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modoLogo));
            }
            const tirar = $m('#vis-escudo-tirar'); if (tirar) tirar.disabled = !temp.escudo;
        };
        const exigirPro = () => {
            if (podeVisualPro()) return true;
            m.remove();
            if (window.Monetizacao) window.Monetizacao.abrirModal('Escudo e cor do racha são do plano Pro. O nome é grátis!');
            return false;
        };
        $m('#vis-nome').addEventListener('input', desenhar);
        m.querySelectorAll('.vis-cor').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.cor !== temp.cor && !exigirPro()) return;
            temp.cor = b.dataset.cor; desenhar();
        }));
        $m('#vis-escudo-btn').onclick = () => { if (exigirPro()) $m('#vis-escudo-arq').click(); };
        $m('#vis-escudo-tirar').onclick = () => { temp.escudo = ''; origem = null; desenhar(); };
        $m('#vis-escudo-arq').addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            try {
                origem = await abrirImagem(f);
                // PNG sem fundo: encaixa inteira; foto com fundo: preenche o quadrado
                modoLogo = origem.transparente ? 'encaixar' : 'preencher';
                temp.escudo = desenharLogo(origem, modoLogo, 256);
                desenhar();
            } catch (er) { toast('Não consegui abrir essa imagem. Tente uma foto PNG ou JPG.', 'erro'); }
            e.target.value = '';
        });
        m.querySelectorAll('#vis-modo [data-modo]').forEach(b => b.addEventListener('click', () => {
            if (!origem) return;
            modoLogo = b.dataset.modo;
            temp.escudo = desenharLogo(origem, modoLogo, 256);
            desenhar();
        }));
        $m('#vis-cancelar').onclick = () => m.remove();
        $m('#vis-salvar').onclick = () => {
            const v = { nome: ($m('#vis-nome').value || '').trim().slice(0, 32), cor: temp.cor || 'verde', escudo: temp.escudo || '' };
            visualRacha = v;
            gravar('visual', v);
            aplicarVisual();
            // lista de presença e placar ao vivo abertos já mudam de cara
            if (presencaCodigo) {
                const f = window.firebaseFns;
                f.set(refPresenca('visual'), v).catch(() => {});
                f.set(refPresenca('titulo'), tituloRacha()).catch(() => {});
            }
            publicarAoVivo(false);
            m.remove();
            if (window.Metricas) Metricas.evento('visual_salvo');
            toast('🎨 Pronto! O racha está com a cara nova.');
        };
        desenhar();
    }

    function tituloRacha() {
        if (visualRacha.nome) return visualRacha.nome;
        if (rachaAtivo !== 'principal') return nomeRachaAtivo();
        return (perfil && perfil.apelido) ? 'Racha do ' + perfil.apelido : 'Racha de hoje';
    }

    // ---------- RESUMO DO RACHA (imagem + texto) ----------
    async function enviarResumoImagem(h, btn) {
        if (!window.ImagemTimes) return;
        if (btn) btn.disabled = true;
        try {
            const r = await ImagemTimes.compartilharResumo(Logica.resumoCampeonato(h), { titulo: tituloRacha(), escudo: visualRacha.escudo, cor: Logica.corRacha(visualRacha.cor) });
            if (r === 'baixado') toast('Imagem salva! Agora é só mandar no grupo.');
            if (r !== 'cancelado' && window.Metricas) Metricas.evento('resumo_imagem');
        } catch (e) {
            console.error('Resumo do racha:', e);
            await mostrarAlerta('Não consegui gerar a imagem. Use "Copiar resumo".', '❌ ERRO');
        } finally {
            if (btn) btn.disabled = false;
        }
    }
    async function copiarResumoTexto(h) {
        const texto = Logica.textoResumo(Logica.resumoCampeonato(h), tituloRacha());
        if (window.Metricas) Metricas.evento('resumo_texto');
        if (await copiarTexto(texto)) toast('Resumo copiado! Agora é só colar no WhatsApp.');
        else fallbackCopiarTexto(texto);
    }

    async function compartilharImagemTimes() {
        if (!sorteioAtual || sorteioAtual.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }
        const btn = document.getElementById('btn-imagem-times');
        if (btn) btn.disabled = true;
        try {
            const titulo = tituloRacha();
            const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
            const r = await ImagemTimes.compartilhar(sorteioAtual, { titulo, subtitulo: dia.charAt(0).toUpperCase() + dia.slice(1), escudo: visualRacha.escudo, cor: Logica.corRacha(visualRacha.cor) });
            if (r === 'baixado') toast('Imagem salva! Agora é só mandar no grupo.');
            if (r !== 'cancelado' && window.Metricas) Metricas.evento('imagem_times');
        } catch (e) {
            console.error('Imagem dos times:', e);
            await mostrarAlerta('Não consegui gerar a imagem. Use "Copiar Lista de Times".', '❌ ERRO');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function copiarListaTimes() {
        if (window.Metricas) Metricas.evento('lista_copiada');
        if (!sorteioAtual || sorteioAtual.length === 0) {
            await mostrarAlerta('Nenhum sorteio realizado ainda!', '⚠️ AVISO');
            return;
        }

        let textoFormatado = `*RESULTADO DO SORTEIO*\n\n`;

        sorteioAtual.forEach((t, i) => {
            const media = (t.jogadores.length > 0 ? (t.somaEstrelas / t.jogadores.length) : 0).toFixed(1).replace('.', ',');
            textoFormatado += `*${t.nome.toUpperCase()}* (Média: ⭐ ${media})\n`;
            t.jogadores.forEach((j, index) => {
                const tagGoleiro = j.isGoleiro ? '🧤 ' : '';
                const estFmt = Number(j.estrelas || 3.0).toFixed(1).replace('.', ',');
                textoFormatado += `${index + 1}. ${tagGoleiro}${j.nome} (⭐ ${estFmt})\n`;
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
            placarRacha = { a: 0, b: 0 };
            tipoDesempateRacha = null;
            
            // novo campeonato: o contador de sorteios recomeça
            contadorSorteios = 0;

            inicializarClassificacao();
            if (modoJogoAtual === 'todos-contra-todos') {
                gerarTabelaTodosContraTodos();
            } else {
                iniciarModoRachaLivre(true);
            }
            
            artilharia = {};
            partidaAtualIndex = 0;

            // grava o campeonato já no início (se o app fechar, ele volta daqui)
            salvarCampeonatoAtivo();
            if (window.Metricas) Metricas.evento('campeonato_iniciado');

            if (window.UI) UI.fecharSheet('resultado-sorteio');
            irParaAba('tab-campeonato');
        });
    }

    function gerarTabelaTodosContraTodos() {
        partidas = Logica.gerarPartidas(timesSorteados);
    }

    function iniciarModoRachaLivre(resetar = false) {
        if (resetar) {
            partidasRachaHistorico = [];
            placarRacha = { a: 0, b: 0 };
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
        const temJogo = timesSorteados.length >= 2;
        const vazio = document.getElementById('jogo-vazio'), conteudo = document.getElementById('jogo-conteudo');
        if (vazio) vazio.classList.toggle('hidden', temJogo);
        if (conteudo) conteudo.classList.toggle('hidden', !temJogo);
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

    let seletorModoLigado = false;
    function renderizarSeletorModoDisputa() {
        const sel = document.getElementById('select-modo-disputa');
        const selo = document.getElementById('selo-modo');
        if (selo) selo.textContent = modoJogoAtual === 'racha-livre' ? 'Racha livre' : 'Tabela';
        if (!sel) return;
        sel.value = modoJogoAtual;
        if (seletorModoLigado) return;
        seletorModoLigado = true;
        sel.addEventListener('change', async (e) => {
            const novoModo = e.target.value;
            if (novoModo === modoJogoAtual) return;
            const temResultados = partidas.some(p => p.finalizada) || partidasRachaHistorico.length > 0 || Object.keys(artilharia).length > 0;
            if (temResultados) {
                const ok = await mostrarConfirmacao('Os resultados e a artilharia deste campeonato serão apagados.', 'Trocar o modo de disputa?', { ok: 'Trocar', perigo: true });
                if (!ok) { e.target.value = modoJogoAtual; return; }
            }
            modoJogoAtual = novoModo;
            partidas = [];
            partidaAtualIndex = 0;
            artilharia = {};
            partidasRachaHistorico = [];
            placarRacha = { a: 0, b: 0 };
            tipoDesempateRacha = null;
            inicializarClassificacao();
            if (modoJogoAtual === 'racha-livre') iniciarModoRachaLivre(true);
            else if (timesSorteados.length >= 2) gerarTabelaTodosContraTodos();
            salvarCampeonatoAtivo();
            renderizarCampeonato();
            if (window.UI) UI.fecharSheet('sheet-jogo-opcoes');
            toast(modoJogoAtual === 'racha-livre' ? 'Modo racha livre' : 'Modo tabela');
        });
    }

    function renderizarTabela() {
        const body = document.getElementById('body-classificacao');
        if (!body) return;
        body.innerHTML = '';

        const listaClass = Logica.ordenarClassificacao(Object.values(classificacao));

        listaClass.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(c.nome)}</td>
                <td class="pts">${c.p}</td>
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

    // Placar "− 0 +": troca o <input> por botões de menos/mais. O input continua existindo
    // (mesmo id) e dispara 'input' a cada toque, então o resto do código não muda.
    function montarStepperPlacar(input, aoMudar) {
        if (!input) return;
        const wrap = document.createElement('div');
        wrap.className = 'stepper-placar';
        const menos = document.createElement('button');
        menos.type = 'button'; menos.className = 'step-btn'; menos.innerHTML = window.UI ? UI.icone('minus') : '−';
        menos.setAttribute('aria-label', 'Tirar um gol');
        const mais = document.createElement('button');
        mais.type = 'button'; mais.className = 'step-btn step-mais'; mais.innerHTML = window.UI ? UI.icone('plus') : '+';
        mais.setAttribute('aria-label', 'Adicionar um gol');
        input.parentNode.insertBefore(wrap, input);
        wrap.append(menos, input, mais);
        input.readOnly = true; input.inputMode = 'none';
        const mudar = d => {
            input.value = Math.max(0, (parseInt(input.value) || 0) + d);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            if (aoMudar) aoMudar(parseInt(input.value) || 0);
        };
        menos.addEventListener('click', () => mudar(-1));
        mais.addEventListener('click', () => mudar(1));
    }

    // --- MODO 1: TODOS CONTRA TODOS ---
    function renderizarPartidaAtualTodosContraTodos() {
        const container = document.getElementById('painel-partida-atual');
        if (!container) return;

        if (timesSorteados.length < 2) {
            container.innerHTML = '';
            return;
        }

        if (partidas.length === 0) {
            container.innerHTML = `
                <p class="dica-painel">Ainda não há jogos neste campeonato.</p>
                <button type="button" id="btn-gerar-tabela-direto" class="btn btn-primary">Gerar os confrontos</button>
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

        // acabou o turno: os confrontos continuam (novo turno) até você finalizar o campeonato
        // aponta sempre para um jogo que ainda não foi jogado
        if (!partidas[partidaAtualIndex] || partidas[partidaAtualIndex].finalizada) {
            const pendente = partidas.findIndex(x => !x.finalizada);
            partidaAtualIndex = pendente === -1 ? partidas.length : pendente;
        }
        if (partidaAtualIndex >= partidas.length) {
            const novos = Logica.proximoTurno(timesSorteados, partidas);
            if (!novos.length) return;
            partidas = partidas.concat(novos);
            partidaAtualIndex = partidas.findIndex(x => !x.finalizada);
            salvarCampeonatoAtivo();
            toast(`${novos[0].turno}º turno começou`);
            renderizarCampeonato();
            return;
        }

        const p = partidas[partidaAtualIndex];

        const opcoesTimesA = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeA.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');
        const opcoesTimesB = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeB.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');

        container.innerHTML = `
            <p class="partida-info">Rodada ${p.rodada}${p.turno > 1 ? ` · ${p.turno}º turno` : ''}</p>
            <div class="placar-box">
                <div class="time-placar">
                    <select id="select-mudar-time-a" aria-label="Time da esquerda">${opcoesTimesA}</select>
                    <input type="number" id="gols-a" value="${p.golsA || 0}" min="0" aria-label="Gols do time da esquerda">
                </div>
                <span class="placar-x">×</span>
                <div class="time-placar">
                    <select id="select-mudar-time-b" aria-label="Time da direita">${opcoesTimesB}</select>
                    <input type="number" id="gols-b" value="${p.golsB || 0}" min="0" aria-label="Gols do time da direita">
                </div>
            </div>

            <div id="box-penaltis" class="penaltis-box hidden">
                <p class="rotulo">Empate · pênaltis</p>
                <div class="penaltis-linha">
                    <label id="lbl-pen-a" for="pen-a">${escapeHtml(p.timeA.nome)}</label>
                    <input type="number" id="pen-a" value="0" min="0" inputmode="numeric">
                    <span class="placar-x">×</span>
                    <input type="number" id="pen-b" value="0" min="0" inputmode="numeric">
                    <label id="lbl-pen-b" for="pen-b">${escapeHtml(p.timeB.nome)}</label>
                </div>
            </div>

            <div class="gol-linha">
                <select id="select-artilheiro" aria-label="Quem fez o gol"></select>
                <button type="button" id="btn-add-gol" class="btn btn-secondary">${window.UI ? UI.icone('ball', 'i-sm') : ''}Gol</button>
            </div>

            <button type="button" id="btn-finalizar-partida" class="btn btn-primary">Encerrar partida</button>
        `;

        const atualizarListaArtilheiros = () => {
            const selectArt = document.getElementById('select-artilheiro');
            if (!selectArt) return;
            const todosJogadores = p.timeA.jogadores.concat(p.timeB.jogadores);
            selectArt.innerHTML = todosJogadores.map(j => `<option value="${escapeHtml(j.nome)}">${escapeHtml(j.nome)}</option>`).join('');
            
            const lblPenA = document.getElementById('lbl-pen-a');
            const lblPenB = document.getElementById('lbl-pen-b');
            if (lblPenA) lblPenA.textContent = p.timeA.nome;
            if (lblPenB) lblPenB.textContent = p.timeB.nome;
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
            // cada gol contado já vai para o estado, é salvo e aparece no link ao vivo
            const guardar = () => {
                p.golsA = parseInt(inputA.value) || 0;
                p.golsB = parseInt(inputB.value) || 0;
                salvarCampeonatoAtivo();
            };
            montarStepperPlacar(inputA, guardar);
            montarStepperPlacar(inputB, guardar);
            if (p.golsA || p.golsB) checarEmpate();
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
                toast(`Gol de ${nomeArtilheiro}`);
            });
        }

        const btnFinPartida = document.getElementById('btn-finalizar-partida');
        if (btnFinPartida) {
            btnFinPartida.addEventListener('click', async () => {
                if (p.timeA.id === p.timeB.id) {
                    toast('Escolha dois times diferentes.', 'erro');
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
                        toast('Empate: defina o vencedor nos pênaltis.', 'erro');
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
            ? filaTimes.map(t => `<li>${escapeHtml(t.nome)}</li>`).join('')
            : '<li class="fila-vazia">Ninguém esperando</li>';

        container.innerHTML = `
            <div class="placar-box">
                <div class="time-placar">
                    <p class="time-nome">${escapeHtml(timeEmCampoA.nome)}</p>
                    <input type="number" id="racha-gols-a" value="${placarRacha.a || 0}" min="0" aria-label="Gols de ${escapeHtml(timeEmCampoA.nome)}">
                </div>
                <span class="placar-x">×</span>
                <div class="time-placar">
                    <p class="time-nome">${escapeHtml(timeEmCampoB.nome)}</p>
                    <input type="number" id="racha-gols-b" value="${placarRacha.b || 0}" min="0" aria-label="Gols de ${escapeHtml(timeEmCampoB.nome)}">
                </div>
            </div>

            <div id="box-desempate-racha" class="penaltis-box hidden">
                <p class="rotulo">Empate · quem continua em campo?</p>
                <div class="dois-botoes">
                    <button type="button" id="btn-empate-sai-a" class="btn btn-secondary">${escapeHtml(timeEmCampoA.nome)}</button>
                    <button type="button" id="btn-empate-sai-b" class="btn btn-secondary">${escapeHtml(timeEmCampoB.nome)}</button>
                </div>
            </div>

            <div class="gol-linha">
                <select id="select-artilheiro-racha" aria-label="Quem fez o gol"></select>
                <button type="button" id="btn-add-gol-racha" class="btn btn-secondary">${window.UI ? UI.icone('ball', 'i-sm') : ''}Gol</button>
            </div>

            <button type="button" id="btn-finalizar-racha" class="btn btn-primary">Encerrar partida e chamar o próximo</button>

            <div class="fila">
                <p class="rotulo">Próximos na fila</p>
                <ol>${filaHtml}</ol>
            </div>
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
            const guardarRacha = () => {
                placarRacha = { a: parseInt(inputA.value) || 0, b: parseInt(inputB.value) || 0 };
                salvarCampeonatoAtivo();
            };
            montarStepperPlacar(inputA, guardarRacha);
            montarStepperPlacar(inputB, guardarRacha);
            if (placarRacha.a || placarRacha.b) checarEmpateRacha();
        }

        document.getElementById('btn-empate-sai-a')?.addEventListener('click', () => {
            tipoDesempateRacha = 'A';
            document.getElementById('btn-empate-sai-a')?.classList.add('escolhido');
            document.getElementById('btn-empate-sai-b')?.classList.remove('escolhido');
        });

        document.getElementById('btn-empate-sai-b')?.addEventListener('click', () => {
            tipoDesempateRacha = 'B';
            document.getElementById('btn-empate-sai-b')?.classList.add('escolhido');
            document.getElementById('btn-empate-sai-a')?.classList.remove('escolhido');
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
                        toast('Empate: escolha quem continua em campo.', 'erro');
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
                placarRacha = { a: 0, b: 0 };
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
            container.innerHTML = '<p class="dica-painel">Nenhum jogo encerrado ainda.</p>';
            return;
        }

        container.onclick = (e) => {
            const b = e.target.closest('[data-corrigir]');
            if (b) abrirCorrigirPlacar(Number(b.dataset.corrigir));
        };
        container.innerHTML = partidasFinalizadas.slice().reverse().map(p => {
            const pen = p.golsA === p.golsB ? `<span class="jogo-pen">pên. ${p.penaltisA}–${p.penaltisB}</span>` : '';
            return `<div class="jogo-linha">
                    <span class="jogo-rod">R${p.rodada}</span>
                    <span class="jogo-a ${p.golsA > p.golsB || (p.golsA === p.golsB && p.penaltisA > p.penaltisB) ? 'venceu' : ''}">${escapeHtml(p.timeA.nome)}</span>
                    <span class="jogo-meio"><span class="jogo-placar">${p.golsA}<i>×</i>${p.golsB}</span>${pen}</span>
                    <span class="jogo-b ${p.golsB > p.golsA || (p.golsA === p.golsB && p.penaltisB > p.penaltisA) ? 'venceu' : ''}">${escapeHtml(p.timeB.nome)}</span>
                    <button type="button" class="btn-corrigir" data-corrigir="${p.idPartida}" aria-label="Corrigir placar">${window.UI ? UI.icone('edit', 'i-sm') : 'Editar'}</button>
                </div>`;
        }).join('');
    }

    function renderizarConfrontosEncerradosRacha() {
        const container = document.getElementById('lista-confrontos-encerrados');
        if (!container) return;
        container.onclick = null;

        if (partidasRachaHistorico.length === 0) {
            container.innerHTML = '<p class="dica-painel">Nenhum jogo encerrado ainda.</p>';
            return;
        }

        container.innerHTML = partidasRachaHistorico.slice().reverse().map(p => `<div class="jogo-linha">
                <span class="jogo-rod">J${p.idPartida}</span>
                <span class="jogo-a ${p.vencedor === p.timeA.nome ? 'venceu' : ''}">${escapeHtml(p.timeA.nome)}</span>
                <span class="jogo-placar">${p.golsA}<i>×</i>${p.golsB}</span>
                <span class="jogo-b ${p.vencedor === p.timeB.nome ? 'venceu' : ''}">${escapeHtml(p.timeB.nome)}</span>
            </div>`).join('');
    }

    function renderizarArtilharia() {
        const container = document.getElementById('lista-artilharia');
        if (!container) return;

        const lista = Object.entries(artilharia).sort((a, b) => b[1] - a[1]);
        if (lista.length === 0) {
            container.innerHTML = '<p class="dica-painel">Nenhum gol marcado ainda.</p>';
            return;
        }

        container.innerHTML = lista.map(([nome, gols], i) => {
            const n = String(nome).replace(/\u2024/g, '.');
            return `<div class="art-linha"><span class="art-pos">${i + 1}</span>${avatarHtml(n)}<span class="art-nome">${escapeHtml(n)}</span><strong class="art-gols">${gols}</strong></div>`;
        }).join('');
    }

    // --- 6. FINALIZAR CAMPEONATO E SALVAR HISTÓRICO ---
    const btnFinalizarCamp = document.getElementById('btn-finalizar-campeonato');
    if (btnFinalizarCamp) {
        btnFinalizarCamp.addEventListener('click', async () => {
            if (timesSorteados.length === 0) {
                toast('Não há campeonato em andamento.');
                return;
            }

            const confirmou = await mostrarConfirmacao('O campeonato vai para o histórico, com a tabela, os jogos e a artilharia.', 'Encerrar campeonato?', { ok: 'Encerrar' });
            if (!confirmou) return;
            if (window.UI) UI.fecharSheet('sheet-jogo-opcoes');

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
            if (window.Metricas) Metricas.evento('campeonato_finalizado');

            // o campeonato terminou: sai do "em andamento" no Firebase
            limparCampeonatoAtivo();

            // Reseta variáveis locais
            timesSorteados = [];
            partidas = [];
            partidasRachaHistorico = [];
            placarRacha = { a: 0, b: 0 };
            classificacao = {};
            artilharia = {};
            partidaAtualIndex = 0;
            timeEmCampoA = null;
            timeEmCampoB = null;
            filaTimes = [];

            renderizarCampeonato();
            renderizarHistorico();

            // abre o resultado completo, já com os botões para mandar no grupo
            irParaAba('tab-historico');
            abrirDetalheHistorico(edicaoHistorico.id);

            toast('Campeonato salvo no histórico');
        });
    }

    // ---------- MODAL SIMPLES, TELAS EXTRAS E MENU ----------
    // Painel de baixo montado na hora (formulários curtos). Fecha pelo fundo, pelo X ou com m.remove().
    // O primeiro <h2> do html vira o título do painel.
    function abrirModalHtml(html) {
        const m = document.createElement('div');
        m.className = 'sheet sheet-dinamico';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        const corpo = String(html).replace(/^\s*<h2([^>]*)>([\s\S]*?)<\/h2>/, (x, attrs, titulo) =>
            `<div class="sheet-cab"><h2${attrs}>${window.UI ? UI.semEmoji(titulo) : titulo}</h2><button type="button" class="icon-btn" data-fechar-dinamico aria-label="Fechar">${window.UI ? UI.icone('x') : '✕'}</button></div>`);
        m.innerHTML = '<div class="sheet-fundo" data-fechar-dinamico></div><div class="sheet-painel"><div class="sheet-alca"></div>' + corpo + '</div>';
        m.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-fechar-dinamico]')) m.remove(); });
        document.body.appendChild(m);
        return m;
    }
    function fecharDrawer() {
        const d = document.getElementById('side-drawer');
        if (d && d.classList.contains('open')) toggleDrawer();
    }
    // Telas que não têm botão no menu de baixo (detalhe do histórico, caixa do suporte)
    function irParaTelaExtra(id, titulo) { irParaAba(id, false, titulo); }

    // ---------- TELA "JOGO": atalhos, abas e painéis ----------
    (function ligarTelaJogo() {
        const $ = id => document.getElementById(id);
        $('btn-ir-sorteio')?.addEventListener('click', () => irParaAba('tab-sorteio'));
        $('abrir-ao-vivo')?.addEventListener('click', () => { atualizarCardAoVivo(); if (window.UI) UI.abrirSheet('sheet-ao-vivo'); });
        $('btn-tempo-partida')?.addEventListener('click', () => { if (window.UI) UI.abrirSheet('sheet-tempo'); });
        $('btn-jogo-opcoes')?.addEventListener('click', () => { renderizarSeletorModoDisputa(); if (window.UI) UI.abrirSheet('sheet-jogo-opcoes'); });
        $('seg-jogo')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-aba-jogo]');
            if (!b) return;
            $('seg-jogo').querySelectorAll('[data-aba-jogo]').forEach(x => x.classList.toggle('on', x === b));
            document.querySelectorAll('[data-painel-jogo]').forEach(p => p.classList.toggle('hidden', p.dataset.painelJogo !== b.dataset.abaJogo));
        });
    })();

    // ---------- TELA "MAIS" ----------
    function atualizarTelaMais() {
        const $ = id => document.getElementById(id);
        if ($('mais-racha-ativo')) $('mais-racha-ativo').textContent = (visualRacha && visualRacha.nome) || nomeRachaAtivo();
        if ($('mais-email')) $('mais-email').textContent = emailUsuario || '';
        if ($('mais-versao')) $('mais-versao').textContent = typeof VERSAO_ATUAL_APP !== 'undefined' ? VERSAO_ATUAL_APP : '';
        const st = window.Monetizacao ? window.Monetizacao.status() : null;
        if ($('mais-plano')) $('mais-plano').textContent = !st ? '' : st.origem === 'plano' ? 'Pro' + (st.ate ? ' até ' + new Date(st.ate).toLocaleDateString('pt-BR') : '')
            : st.origem === 'teste' ? `Teste grátis · ${st.diasTeste} dia${st.diasTeste > 1 ? 's' : ''}` : 'Plano grátis';
    }
    (function ligarNavegacao() {
        const $ = id => document.getElementById(id);
        $('btn-menu')?.addEventListener('click', () => toggleDrawer());
        $('btn-fechar-menu')?.addEventListener('click', () => toggleDrawer());
        $('drawer-overlay')?.addEventListener('click', () => toggleDrawer());
        $('btn-voltar')?.addEventListener('click', () => {
            const alvo = $(abaAtual);
            const pai = alvo && alvo.dataset ? alvo.dataset.pai : '';
            if (history.state && history.state.aba && history.length > 1) history.back();
            else irParaAba(pai || 'tab-mais');
        });
        $('tab-mais')?.addEventListener('click', (e) => {
            const ir = e.target.closest('[data-ir]');
            if (ir) { irParaAba(ir.dataset.ir); if (ir.dataset.ir === 'tab-caixa') carregarCaixa(); if (ir.dataset.ir === 'tab-metricas') carregarMetricas(); return; }
            const b = e.target.closest('[data-mais]');
            if (!b) return;
            const a = b.dataset.mais;
            if (a === 'personalizar') abrirPersonalizar();
            if (a === 'rachas') toggleDrawer();
            if (a === 'plano' && window.Monetizacao) window.Monetizacao.abrirModal();
            if (a === 'suporte') abrirSuporte();
            if (a === 'sair') mostrarConfirmacao('Você vai precisar entrar de novo para ver seus rachas.', 'Sair da conta?', { ok: 'Sair', perigo: true }).then(ok => { if (ok) fazerLogout(); });
        });
    })();

    // ---------- PERFIS DE RACHA ----------
    function nomeRachaAtivo() {
        const r = rachas.find(x => String(x.id) === String(rachaAtivo));
        return r ? r.nome : 'Racha principal';
    }
    function renderizarRachas() {
        const sub = document.getElementById('sub-racha');
        if (sub) sub.textContent = visualRacha.nome || nomeRachaAtivo();
        const box = document.getElementById('lista-rachas');
        if (!box) return;
        box.innerHTML = rachas.map(r => {
            const ativo = String(r.id) === String(rachaAtivo);
            const info = ativo ? { j: jogadores.length, h: historico.length } : (resumoRachas[r.id] || { j: 0, h: 0 });
            return `<button type="button" class="racha-item${ativo ? ' on' : ''}" data-racha="${escapeHtml(String(r.id))}">
                <span class="racha-ic">${window.UI ? UI.icone("ball") : ""}</span>
                <span class="racha-txt"><b>${escapeHtml(r.nome)}</b><small>${info.j} jogadores · ${info.h} campeonatos</small></span>
                ${ativo ? '<span class="racha-tag">Ativo</span>' : ''}
            </button>`;
        }).join('');
    }
    function trocarRacha(id) {
        id = String(id);
        if (id === String(rachaAtivo) || !dadosCarregados) { fecharDrawer(); return; }
        gravar('rachaAtivo', id, true);      // lembra o racha escolhido para a próxima vez
        rachaAtivo = id; rachaEscolhida = true;
        limparEstadoLocal(true);
        fecharDrawer();
        irParaAba('tab-jogadores', true);
        carregarDadosDoFirebase();
        toast('Racha: ' + nomeRachaAtivo());
    }
    function abrirNovoRacha() {
        if (!dadosCarregados) return;
        fecharDrawer();
        const m = abrirModalHtml(`<h2>Novo perfil de racha</h2>
            <input type="text" id="in-novo-racha" maxlength="30" placeholder="Ex.: Pelada de Sexta">
            <p class="subtext" style="margin-top:8px;">Os jogadores do racha atual (${jogadores.length}) serão copiados, desativados, para o novo perfil.</p>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="ok-novo-racha">Criar racha</button><button type="button" class="btn btn-secondary" id="cancela-novo-racha">Cancelar</button></div>`);
        m.querySelector('#cancela-novo-racha').onclick = () => m.remove();
        m.querySelector('#ok-novo-racha').onclick = async () => {
            const nome = m.querySelector('#in-novo-racha').value.trim().slice(0, 30);
            if (!nome) return;
            const id = String(Date.now());
            const copia = jogadores.map((j, i) => ({ id: Logica.idUnico() + i, nome: j.nome, estrelas: j.estrelas, isGoleiro: !!j.isGoleiro, presente: false }));
            const extras = rachas.filter(r => r.id !== 'principal').concat([{ id, nome }]);
            m.remove();
            try {
                if (copia.length) await gravar(`rachas/${id}/jogadores`, copia, true);
                await gravar('rachasLista', extras, true);
            } catch (e) { return; }
            rachas = [{ id: 'principal', nome: 'Racha principal' }].concat(extras);
            resumoRachas[id] = { j: copia.length, h: 0 };
            trocarRacha(id);
            toast('Racha criado');
        };
    }

    // ---------- SUPORTE ----------
    function atualizarBotaoAdmin() {
        const b = document.getElementById('btn-caixa-suporte');
        if (b) b.classList.toggle('hidden', !souAdmin);
        const m = document.getElementById('btn-metricas');
        if (m) m.classList.toggle('hidden', !souAdmin);
        ['mais-caixa-suporte', 'mais-metricas'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !souAdmin); });
    }
    async function verificarAdmin() {
        souAdmin = false;
        try {
            const s = await window.firebaseFns.get(window.firebaseFns.ref(window.firebaseDb, 'configuracoes/admin_email'));
            const adm = String(s.exists() ? s.val() : '').trim().toLowerCase();
            souAdmin = !!adm && adm === String(emailUsuario).trim().toLowerCase();
        } catch (e) { /* sem permissão ou sem admin configurado: segue sem a caixa */ }
        atualizarBotaoAdmin();
    }
    function abrirSuporte() {
        fecharDrawer();
        const m = abrirModalHtml(`<h2>💬 Falar com o suporte</h2>
            <textarea id="tx-suporte" rows="4" maxlength="800" placeholder="Conte o problema ou a sugestão..."></textarea>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="env-suporte">Enviar mensagem</button><button type="button" class="btn btn-secondary" id="cancela-suporte">Cancelar</button></div>`);
        m.querySelector('#cancela-suporte').onclick = () => m.remove();
        m.querySelector('#env-suporte').onclick = () => {
            const texto = m.querySelector('#tx-suporte').value.trim();
            if (!texto || !currentUserUid) return;
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const msg = { de: (perfil && perfil.apelido) || 'Sem apelido', email: emailUsuario, racha: nomeRachaAtivo(), texto, em: Date.now(), ok: false, uid: currentUserUid };
            window.firebaseFns.set(window.firebaseFns.ref(window.firebaseDb, 'suporte/' + id), msg)
                .then(() => { m.remove(); toast('Mensagem enviada ao suporte'); })
                .catch((e) => toast('Não foi possível enviar (' + ((e && e.code) || 'erro') + ')', 'erro'));
        };
    }
    async function carregarCaixa() {
        const box = document.getElementById('lista-caixa');
        if (!box) return;
        box.innerHTML = '<p class="subtext">Carregando...</p>';
        try {
            const s = await window.firebaseFns.get(window.firebaseFns.ref(window.firebaseDb, 'suporte'));
            const obj = s.exists() ? (s.val() || {}) : {};
            const lista = Object.entries(obj).map(([id, m]) => Object.assign({ id }, m)).sort((a, b) => (b.em || 0) - (a.em || 0));
            box.innerHTML = lista.length ? lista.map(m => `<div class="msg-suporte">
                <b>${escapeHtml(m.de || '')}</b> ${m.ok ? '<span class="tag-ok">resolvido</span>' : '<span class="tag-novo">novo</span>'}
                <div class="msg-texto">${escapeHtml(m.texto || '')}</div>
                <small>${escapeHtml(m.email || '')} · ${escapeHtml(m.racha || '')} · ${new Date(m.em || 0).toLocaleString('pt-BR')}</small>
                ${m.ok ? '' : `<button type="button" class="btn btn-secondary" data-resolver="${escapeHtml(m.id)}" style="margin-top:8px;">Marcar como resolvido</button>`}
            </div>`).join('') : '<p class="subtext">Nenhuma mensagem.</p>';
        } catch (e) {
            box.innerHTML = '<p class="subtext">Não foi possível ler as mensagens. Confira as regras do Firebase em docs/COMO-CONFIGURAR-MONETIZACAO.md.</p>';
        }
    }
    function abrirCaixa() {
        if (!souAdmin) return;
        fecharDrawer();
        irParaTelaExtra('tab-caixa', 'Caixa do suporte');
        carregarCaixa();
    }

    // ---------- MÉTRICAS (só admin) ----------
    // nome do evento -> texto da tela (a ordem aqui é a ordem do funil)
    const NOMES_METRICAS = [
        ['abertura', 'Aberturas do app'],
        ['cadastro', 'Novos cadastros'],
        ['sorteio', 'Sorteios feitos'],
        ['imagem_times', 'Imagens dos times enviadas'],
        ['lista_copiada', 'Listas copiadas'],
        ['campeonato_iniciado', 'Campeonatos iniciados'],
        ['campeonato_finalizado', 'Campeonatos finalizados'],
        ['resumo_imagem', 'Resumos do racha enviados (imagem)'],
        ['resumo_texto', 'Resumos do racha copiados (texto)'],
        ['visual_salvo', 'Rachas personalizados'],
        ['presenca_criada', 'Listas de presença criadas'],
        ['presenca_enviada', 'Listas enviadas no grupo'],
        ['presenca_visita', 'Visitas à lista de presença'],
        ['presenca_resposta', 'Respostas na lista (vou/não vou)'],
        ['presenca_convidado_add', 'Convidados adicionados ao elenco'],
        ['presenca_paguei', 'Jogadores que avisaram "já paguei"'],
        ['presenca_pago', 'Pagamentos confirmados pelo organizador'],
        ['presenca_pix_copiado', 'Pix copiados na lista (copia e cola)'],
        ['presenca_removido', 'Tirados da lista pelo organizador'],
        ['presenca_cta', 'Cliques em "Criar meu racha" (lista)'],
        ['ao_vivo_ligado', 'Placares ao vivo ligados'],
        ['ao_vivo_visita', 'Visitas ao placar ao vivo'],
        ['ao_vivo_cta', 'Cliques em "Criar meu racha" (ao vivo)'],
        ['limite_jogadores', 'Bateram no limite de jogadores'],
        ['pro_aberto', 'Abriram a tela do Pro'],
        ['pro_assinar', 'Clicaram em Assinar'],
        ['pro_pix_copiado', 'Copiaram a chave Pix'],
        ['pro_comprovante', 'Enviaram comprovante'],
        ['abriu_offline', 'Abriram sem internet'],
        ['teste_iniciado', 'Começaram o teste grátis'],
        ['pro_assinar_anual', 'Clicaram em assinar (anual)'],
        ['pro_assinar_mensal', 'Clicaram em assinar (mensal)'],
        ['caixa_aberto', 'Abriram o caixa (Pro)'],
        ['caixa_lancamento', 'Lançamentos no caixa'],
        ['caixa_cobranca', 'Cobranças enviadas pelo caixa'],
        ['caixa_diarias_lista', 'Diárias puxadas da lista']
    ];
    async function carregarMetricas() {
        const box = document.getElementById('conteudo-metricas');
        if (!box) return;
        box.innerHTML = '<p class="subtext">Carregando...</p>';
        const f = window.firebaseFns, db = window.firebaseDb;
        const dias = Logica.ultimosDias(7);
        try {
            const ler = caminho => f.get(f.ref(db, caminho)).then(s => (s.exists() ? s.val() : null));
            const [eventos, ativos] = await Promise.all([
                Promise.all(dias.map(d => ler('metricas/' + d))),
                Promise.all(dias.map(d => ler('metricas_ativos/' + d)))
            ]);
            const porDia = {}, ativosPorDia = {};
            dias.forEach((d, i) => { porDia[d] = eventos[i] || {}; ativosPorDia[d] = ativos[i] || {}; });
            const r = Logica.resumirMetricas(porDia, ativosPorDia, dias);
            const conhecidos = new Set(NOMES_METRICAS.map(n => n[0]));
            const linhas = NOMES_METRICAS.concat(Object.keys(r.semana).filter(k => !conhecidos.has(k)).map(k => [k, k]));
            const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '–';
            box.innerHTML = `
                <div class="metricas-destaques">
                    <div><strong>${r.ativosHoje}</strong><small>usuários hoje</small></div>
                    <div><strong>${r.ativosSemana}</strong><small>usuários em 7 dias</small></div>
                    <div><strong>${pct(r.semana.pro_assinar || 0, r.semana.pro_aberto || 0)}</strong><small>abriu Pro → assinar</small></div>
                </div>
                <div class="table-responsive"><table class="tabela-classificacao tabela-metricas">
                    <thead><tr><th>Evento</th><th>Hoje</th><th>7 dias</th></tr></thead>
                    <tbody>${linhas.map(([k, nome]) => `<tr><td>${escapeHtml(nome)}</td><td>${r.hoje[k] || 0}</td><td>${r.semana[k] || 0}</td></tr>`).join('')}</tbody>
                </table></div>
                <button type="button" class="btn btn-secondary" id="btn-atualizar-metricas" style="margin-top:12px;">↻ Atualizar</button>`;
            const bt = document.getElementById('btn-atualizar-metricas');
            if (bt) bt.onclick = carregarMetricas;
        } catch (e) {
            box.innerHTML = '<p class="subtext">Não foi possível ler as métricas. Publique as regras de "metricas" (docs/COMO-CONFIGURAR-MONETIZACAO.md).</p>';
        }
    }
    function abrirMetricas() {
        if (!souAdmin) return;
        fecharDrawer();
        irParaTelaExtra('tab-metricas', 'Métricas');
        carregarMetricas();
    }

    // ---------- CAIXA DO RACHA (Pro): mensalistas, diárias, gastos e saldo ----------
    // Fica em usuarios/<uid>/[rachas/<id>/]caixa (formato em Logica.resumoCaixa).
    let caixa = {};
    let caixaMes = Logica.mesISO();
    const CATEGORIAS_CAIXA = {
        mensalidade: ['calendar', 'Mensalidade'], diaria: ['users', 'Diária'], quadra: ['flag', 'Quadra / aluguel'],
        material: ['ball', 'Bola, colete, material'], outros: ['dots', 'Outros']
    };
    function salvarCaixa() { gravar('caixa', caixa); }
    // chave Pix para as cobranças: a última usada nas listas deste racha (ou a da lista aberta)
    const pixDoRacha = () => (pixPadrao && pixPadrao.chave) ? pixPadrao : (presencaDados && presencaDados.pix && presencaDados.pix.chave ? presencaDados.pix : null);
    function novoLancamento(l) {
        caixa.lancamentos = caixa.lancamentos || {};
        const id = 'l' + Logica.idUnico();
        caixa.lancamentos[id] = Object.assign({ data: Date.now(), mes: caixaMes }, l, { valor: Math.round((Number(l.valor) || 0) * 100) / 100 });
        salvarCaixa();
        if (window.Metricas) Metricas.evento('caixa_lancamento');
        return id;
    }
    async function compartilharTexto(texto, titulo) {
        if (navigator.share) {
            try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        toast(await copiarTexto(texto) ? (titulo || 'Mensagem copiada! Cole no WhatsApp.') : 'Não consegui copiar.');
    }
    function renderizarCaixa() {
        const box = document.getElementById('conteudo-financeiro');
        if (!box) return;
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        box.onclick = cliqueCaixa;
        const pro = !window.Monetizacao || window.Monetizacao.isPro();
        if (!pro) {
            const st = window.Monetizacao ? window.Monetizacao.status() : {};
            box.innerHTML = `<div class="card caixa-bloqueado">
                <div class="caixa-cadeado">${ic('wallet')}</div>
                <h2 style="justify-content:center;">Caixa do racha</h2>
                <p class="subtext" style="text-align:center;">Chega de caderninho e de "quem não pagou?" no grupo.</p>
                <ul class="pro-beneficios">
                    <li>${ic('calendar', 'i-sm')}<span><strong>Mensalistas</strong>: quem pagou e quem está devendo no mês</span></li>
                    <li>${ic('share', 'i-sm')}<span><strong>Cobrança pronta</strong> no WhatsApp, para um ou para o grupo</span></li>
                    <li>${ic('users', 'i-sm')}<span><strong>Diárias</strong> puxadas da lista de presença com um toque</span></li>
                    <li>${ic('wallet', 'i-sm')}<span>Gastos com quadra e bola, e o <strong>saldo do caixa</strong></span></li>
                </ul>
                <button class="btn btn-primary" data-cx="pro">${st.testeUsado ? 'Liberar com o Pro' : 'Testar 7 dias grátis'}</button>
            </div>`;
            return;
        }
        if (window.Metricas) Metricas.evento('caixa_aberto', true);
        const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
        const cfg = r.config;
        const R = Logica.reais;
        const nomeM = Logica.nomeMes(caixaMes);
        const dataCurta = ms => new Date(ms || 0).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const linhaMensalista = m => `<div class="cx-pessoa ${m.pago ? 'pago' : ''}">
                ${avatarHtml(m.nome)}<span class="nm">${escapeHtml(m.nome)}</span>
                ${m.pago ? `<button type="button" class="btn-pag pago" data-cx-despagar="${escapeHtml(m.lancId)}">Pago</button>`
                    : `<button type="button" class="btn-pag" data-cx-pagar="${escapeHtml(m.id)}">Marcar pago</button>
                       <button type="button" class="btn-icone" data-cx-cobrar="${escapeHtml(m.id)}" aria-label="Cobrar ${escapeHtml(m.nome)}" title="Cobrar no WhatsApp">${ic('share', 'i-sm')}</button>`}
            </div>`;
        const linhaLanc = l => {
            const c = CATEGORIAS_CAIXA[l.categoria] || CATEGORIAS_CAIXA.outros;
            return `<div class="cx-lanc">
                <span class="cx-ic">${ic(c[0], 'i-sm')}</span>
                <span class="cx-desc"><b>${escapeHtml(l.desc || c[1])}</b><small>${dataCurta(l.data)} · ${c[1]}</small></span>
                <strong class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'entrada' ? '+' : '−'} ${R(l.valor)}</strong>
                <button type="button" class="btn-tirar" data-cx-apagar="${escapeHtml(l.id)}" aria-label="Apagar lançamento">${ic('x', 'i-sm')}</button>
            </div>`;
        };
        const pct = r.mensalistas.length ? Math.round(r.pagaram / r.mensalistas.length * 100) : 0;
        box.innerHTML = `
            <div class="card caixa-topo">
                <div class="mes-nav">
                    <button type="button" data-cx="mes-ant" aria-label="Mês anterior">${ic('back')}</button>
                    <b>${nomeM.charAt(0).toUpperCase() + nomeM.slice(1)}</b>
                    <button type="button" data-cx="mes-prox" aria-label="Próximo mês">${ic('chevron')}</button>
                </div>
                <div class="caixa-saldo"><small>Saldo do caixa</small><strong class="${r.saldo < 0 ? 'neg' : ''}">${R(r.saldo)}</strong></div>
                <div class="caixa-tiles">
                    <div><span>Entrou no mês</span><b class="pos">${R(r.entradasMes)}</b></div>
                    <div><span>Saiu no mês</span><b class="neg">${R(r.saidasMes)}</b></div>
                    <div><span>A receber</span><b>${R(r.aReceber)}</b></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-success" data-cx="entrada">${ic('plus', 'i-sm')}Entrada</button>
                    <button type="button" class="btn btn-secondary" data-cx="saida">${ic('minus', 'i-sm')}Saída</button>
                </div>
            </div>

            <div class="card">
                <h2>Mensalistas</h2>
                <p class="subtext" style="margin-bottom:8px;">${cfg.mensalidade ? `${R(cfg.mensalidade)} por mês · vence dia ${cfg.vencimento || 10}` : 'Defina o valor da mensalidade.'}
                    <button type="button" class="btn-texto" data-cx="config">Valores</button></p>
                ${r.mensalistas.length ? `
                    <div class="cx-progresso"><span><b>${r.pagaram}</b> de ${r.mensalistas.length} pagaram</span><span>${R(r.previsto - r.aReceber)} de ${R(r.previsto)}</span></div>
                    <div class="barra-cx"><div style="width:${pct}%"></div></div>
                    ${r.mensalistas.map(linhaMensalista).join('')}
                    ${r.devedores.length ? `<button type="button" class="btn btn-primary" data-cx="cobrar-grupo" style="margin-top:12px;">${ic('share', 'i-sm')}Cobrar quem deve no grupo (${r.devedores.length})</button>` : `<p class="cx-tudo-pago">${ic('check', 'i-sm')} Todo mundo pagou este mês</p>`}
                ` : '<p class="subtext">Escolha quem paga por mês. O app mostra quem pagou, quem deve e monta a cobrança.</p>'}
                <button type="button" class="btn btn-secondary" data-cx="mensalistas" style="margin-top:8px;">Escolher mensalistas</button>
            </div>

            <div class="card">
                <h2>Lançamentos</h2>
                ${presencaCodigo ? `<button type="button" class="btn btn-secondary" data-cx="puxar-lista" style="margin-bottom:10px;">Puxar diárias pagas da lista</button>` : ''}
                ${r.lancamentos.length ? r.lancamentos.map(linhaLanc).join('') : `<p class="subtext">Nenhum lançamento em ${nomeM}.</p>`}
            </div>`;
    }
    function abrirLancamento(tipo) {
        const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
        const cats = tipo === 'entrada' ? ['diaria', 'mensalidade', 'outros'] : ['quadra', 'material', 'outros'];
        const hoje = Logica.mesISO() === caixaMes ? new Date() : new Date(caixaMes + '-15T12:00:00');
        const p2 = n => String(n).padStart(2, '0');
        const dataPadrao = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-${p2(hoje.getDate())}`;
        const m = abrirModalHtml(`<h2>${tipo === 'entrada' ? 'Nova entrada' : 'Nova saída'}</h2>
            <label class="subtext" for="cx-valor">Valor (R$)</label>
            <input type="number" id="cx-valor" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="${tipo === 'entrada' && r.config.diaria ? r.config.diaria : ''}">
            <label class="subtext" for="cx-cat" style="display:block;margin-top:10px;">Tipo</label>
            <select id="cx-cat">${cats.map(c => `<option value="${c}">${CATEGORIAS_CAIXA[c][1]}</option>`).join('')}</select>
            ${tipo === 'entrada' ? `<label class="subtext" for="cx-jog" style="display:block;margin-top:10px;">De quem? (opcional)</label>
                <select id="cx-jog"><option value="">—</option>${jogadores.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map(j => `<option value="${escapeHtml(String(j.id))}">${escapeHtml(j.nome)}</option>`).join('')}</select>` : ''}
            <label class="subtext" for="cx-desc" style="display:block;margin-top:10px;">Descrição (opcional)</label>
            <input type="text" id="cx-desc" maxlength="50" placeholder="${tipo === 'entrada' ? 'Ex.: Diária do Zé' : 'Ex.: Aluguel da quadra'}">
            <label class="subtext" for="cx-data" style="display:block;margin-top:10px;">Data</label>
            <input type="date" id="cx-data" value="${dataPadrao}">
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Lançar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        const cat = m.querySelector('#cx-cat');
        if (cat && tipo === 'entrada') cat.addEventListener('change', () => {
            const v = m.querySelector('#cx-valor');
            if (cat.value === 'mensalidade' && r.config.mensalidade) v.value = r.config.mensalidade;
            if (cat.value === 'diaria' && r.config.diaria) v.value = r.config.diaria;
        });
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const valor = parseFloat(String(m.querySelector('#cx-valor').value).replace(',', '.'));
            if (!(valor > 0)) { toast('Digite o valor.', 'erro'); return; }
            const dataTxt = m.querySelector('#cx-data').value;
            const data = dataTxt ? new Date(dataTxt + 'T12:00:00').getTime() : Date.now();
            const jogEl = m.querySelector('#cx-jog');
            const jogadorId = jogEl && jogEl.value ? jogEl.value : null;
            const j = jogadorId ? jogadores.find(x => String(x.id) === jogadorId) : null;
            const categoria = m.querySelector('#cx-cat').value;
            const desc = m.querySelector('#cx-desc').value.trim().slice(0, 50) || (j ? CATEGORIAS_CAIXA[categoria][1] + ' · ' + j.nome : '');
            const l = { tipo, valor, categoria, desc, data, mes: Logica.mesISO(data) };
            if (jogadorId) l.jogadorId = jogadorId;
            novoLancamento(l);
            m.remove();
            renderizarCaixa();
            toast(tipo === 'entrada' ? 'Entrada lançada' : 'Saída lançada');
        };
    }
    function abrirValoresCaixa() {
        const cfg = Object.assign({ mensalidade: '', diaria: '', vencimento: 10 }, caixa.config || {});
        const m = abrirModalHtml(`<h2>⚙️ Valores do caixa</h2>
            <div class="form-group-row"><label for="cx-mens">Mensalidade (R$)</label><input type="number" id="cx-mens" min="0" step="0.5" inputmode="decimal" value="${cfg.mensalidade || ''}" placeholder="50"></div>
            <div class="form-group-row"><label for="cx-dia">Diária (R$)</label><input type="number" id="cx-dia" min="0" step="0.5" inputmode="decimal" value="${cfg.diaria || ''}" placeholder="15"></div>
            <div class="form-group-row"><label for="cx-venc">Vence todo dia</label><input type="number" id="cx-venc" min="1" max="31" value="${cfg.vencimento || 10}"></div>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Salvar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const n = sel => Math.max(0, Math.round((parseFloat(String(m.querySelector(sel).value).replace(',', '.')) || 0) * 100) / 100);
            caixa.config = { mensalidade: n('#cx-mens'), diaria: n('#cx-dia'), vencimento: Math.min(31, Math.max(1, parseInt(m.querySelector('#cx-venc').value, 10) || 10)) };
            salvarCaixa(); m.remove(); renderizarCaixa(); toast('Valores salvos');
        };
    }
    function abrirMensalistas() {
        if (!jogadores.length) { mostrarAlerta('Cadastre os jogadores primeiro (aba Jogadores).', '👥 MENSALISTAS'); return; }
        const marcados = Object.assign({}, caixa.mensalistas || {});
        const lista = jogadores.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
        const m = abrirModalHtml(`<h2>👥 Quem é mensalista?</h2>
            <p class="subtext">Mensalista paga por mês. Quem não está marcado paga diária.</p>
            <div class="cx-escolha">${lista.map(j => `<label class="item-presenca"><input type="checkbox" class="chk-presenca" data-mens="${escapeHtml(String(j.id))}" ${marcados[String(j.id)] ? 'checked' : ''}>
                <span class="lbl-presenca">${avatarHtml(j.nome)}<span class="nm">${escapeHtml(j.nome)}</span><span class="switch"></span></span></label>`).join('')}</div>
            <div class="modal-actions"><button type="button" class="btn btn-primary" id="cx-ok">Salvar</button><button type="button" class="btn btn-secondary" id="cx-cancelar">Cancelar</button></div>`);
        m.querySelector('#cx-cancelar').onclick = () => m.remove();
        m.querySelector('#cx-ok').onclick = () => {
            const novo = {};
            m.querySelectorAll('[data-mens]').forEach(c => { if (c.checked) novo[c.dataset.mens] = true; });
            caixa.mensalistas = novo;
            salvarCaixa(); m.remove(); renderizarCaixa();
            toast(Object.keys(novo).length + ' mensalista(s)');
        };
    }
    // diárias de quem o organizador marcou como pago na lista (e não é mensalista); não lança duas vezes
    function puxarDiariasDaLista() {
        if (!presencaCodigo || !presencaDados) return;
        const r = resumoPresencaAtual();
        const mens = caixa.mensalistas || {};
        const jaLancados = new Set(Object.values(caixa.lancamentos || {}).map(l => l && l.origem).filter(Boolean));
        const valor = Number(presencaDados.pix && presencaDados.pix.valor) || Number(caixa.config && caixa.config.diaria) || 0;
        if (!valor) { toast('Defina o valor da diária em ⚙️ Valores (ou o valor do Pix na lista).', 'erro'); abrirValoresCaixa(); return; }
        let n = 0;
        r.confirmados.filter(c => c.pago && !mens[c.id]).forEach(c => {
            const origem = 'lista:' + presencaCodigo + ':' + c.id;
            if (jaLancados.has(origem)) return;
            const l = { tipo: 'entrada', valor, categoria: 'diaria', desc: 'Diária · ' + c.nome, origem, mes: Logica.mesISO(), data: Date.now() };
            if (!c.convidado) l.jogadorId = c.id;
            caixa.lancamentos = caixa.lancamentos || {};
            caixa.lancamentos['l' + Logica.idUnico() + n] = l;
            n++;
        });
        if (!n) { toast('Nenhuma diária nova: confirme os pagamentos na lista (💰 Pago) primeiro.'); return; }
        salvarCaixa();
        caixaMes = Logica.mesISO();
        renderizarCaixa();
        toast(`⬇️ ${n} diária(s) lançada(s): ${Logica.reais(n * valor)}`);
        if (window.Metricas) Metricas.evento('caixa_diarias_lista');
    }
    async function cliqueCaixa(e) {
        const alvo = sel => e.target.closest && e.target.closest(sel);
        let b;
        if ((b = alvo('[data-cx]'))) {
            const a = b.dataset.cx;
            if (a === 'pro') { if (window.Monetizacao) window.Monetizacao.abrirModal('O caixa do racha é do plano Pro. Teste grátis e veja quem está devendo em segundos!'); return; }
            if (a === 'mes-ant') { caixaMes = Logica.somarMes(caixaMes, -1); renderizarCaixa(); return; }
            if (a === 'mes-prox') { caixaMes = Logica.somarMes(caixaMes, 1); renderizarCaixa(); return; }
            if (a === 'entrada' || a === 'saida') { abrirLancamento(a); return; }
            if (a === 'config') { abrirValoresCaixa(); return; }
            if (a === 'mensalistas') { abrirMensalistas(); return; }
            if (a === 'puxar-lista') { puxarDiariasDaLista(); return; }
            if (a === 'cobrar-grupo') {
                const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
                if (window.Metricas) Metricas.evento('caixa_cobranca');
                compartilharTexto(Logica.textoCobrancaGrupo(r, caixaMes, tituloRacha(), pixDoRacha()), '📢 Cobrança copiada! Cole no grupo.');
                return;
            }
        }
        if ((b = alvo('[data-cx-pagar]'))) {
            const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
            if (!r.config.mensalidade) { toast('Defina primeiro o valor da mensalidade.', 'erro'); abrirValoresCaixa(); return; }
            const j = jogadores.find(x => String(x.id) === b.dataset.cxPagar);
            if (!j) return;
            const dataPag = Logica.mesISO() === caixaMes ? Date.now() : new Date(caixaMes + '-15T12:00:00').getTime();
            novoLancamento({ tipo: 'entrada', valor: r.config.mensalidade, categoria: 'mensalidade', jogadorId: String(j.id), desc: 'Mensalidade · ' + j.nome, data: dataPag, mes: caixaMes });
            renderizarCaixa();
            toast(`💰 ${j.nome} pagou a mensalidade`);
            return;
        }
        if ((b = alvo('[data-cx-despagar]'))) {
            if (!(await mostrarConfirmacao('Desmarcar esse pagamento? O lançamento sai do caixa.', '💰 MENSALIDADE'))) return;
            if (caixa.lancamentos) delete caixa.lancamentos[b.dataset.cxDespagar];
            salvarCaixa(); renderizarCaixa();
            return;
        }
        if ((b = alvo('[data-cx-cobrar]'))) {
            const r = Logica.resumoCaixa(caixa, jogadores, caixaMes);
            const d = r.devedores.find(x => x.id === b.dataset.cxCobrar);
            if (!d) return;
            if (window.Metricas) Metricas.evento('caixa_cobranca');
            compartilharTexto(Logica.textoCobrancaIndividual(d.nome, r, caixaMes, tituloRacha(), pixDoRacha()), `📲 Cobrança do ${d.nome.split(' ')[0]} copiada!`);
            return;
        }
        if ((b = alvo('[data-cx-apagar]'))) {
            if (!(await mostrarConfirmacao('Apagar este lançamento do caixa?', '🧾 LANÇAMENTO'))) return;
            if (caixa.lancamentos) delete caixa.lancamentos[b.dataset.cxApagar];
            salvarCaixa(); renderizarCaixa();
        }
    }

    // ---------- HISTÓRICO: tela do campeonato ----------
    function abrirDetalheHistorico(id) {
        const h = historico.find(x => String(x.id) === String(id));
        if (!h) return;
        irParaTelaExtra('tab-hist-detalhe', 'Campeonato de ' + String(h.data || '').slice(0, 5));
        const cl = Logica.ordenarClassificacao(Object.values(h.classificacao || {}));
        const art = Object.entries(h.artilharia || {}).map(([n, g]) => [String(n).replace(/\u2024/g, '.'), Number(g) || 0]).sort((a, b) => b[1] - a[1]);
        const jogos = comoLista(h.partidas);
        const ic = (n, c) => (window.UI ? UI.icone(n, c) : '');
        const linhaJogo = (p) => {
            const rot = p.rodada !== undefined ? 'R' + p.rodada : 'J' + p.idPartida;
            const venceA = p.rodada !== undefined ? (p.golsA > p.golsB || (p.golsA === p.golsB && (p.penaltisA || 0) > (p.penaltisB || 0))) : p.vencedor === p.timeA.nome;
            const venceB = p.rodada !== undefined ? (p.golsB > p.golsA || (p.golsA === p.golsB && (p.penaltisB || 0) > (p.penaltisA || 0))) : p.vencedor === p.timeB.nome;
            const pen = p.rodada !== undefined && p.golsA === p.golsB ? `<span class="jogo-pen">pên. ${p.penaltisA || 0}–${p.penaltisB || 0}</span>` : '';
            return `<div class="jogo-linha"><span class="jogo-rod">${rot}</span>
                <span class="jogo-a ${venceA ? 'venceu' : ''}">${escapeHtml(p.timeA.nome)}</span>
                <span class="jogo-meio"><span class="jogo-placar">${p.golsA}<i>×</i>${p.golsB}</span>${pen}</span>
                <span class="jogo-b ${venceB ? 'venceu' : ''}">${escapeHtml(p.timeB.nome)}</span><span></span></div>`;
        };
        const el = document.getElementById('conteudo-hist-detalhe');
        if (!el) return;
        const campeao = cl[0] ? cl[0].nome : '—';
        const totalGols = jogos.reduce((a, p) => a + (Number(p.golsA) || 0) + (Number(p.golsB) || 0), 0);
        el.innerHTML = `
            <div class="card campeao-card">
                <span class="campeao-ic">${ic('trophy')}</span>
                <div class="campeao-txt"><span class="rotulo">Campeão</span><b>${escapeHtml(campeao)}</b>
                    <span class="tela-sub">${escapeHtml(h.data || '')} · ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha livre'} · ${jogos.length} jogos · ${totalGols} gols</span></div>
            </div>
            <div class="dois-botoes" style="margin-top:0;">
                <button type="button" class="btn btn-primary" id="btn-resumo-imagem">${ic('image', 'i-sm')}Enviar resumo</button>
                <button type="button" class="btn btn-secondary" id="btn-resumo-texto">${ic('copy', 'i-sm')}Copiar texto</button>
            </div>
            <p class="lista-rotulo">Classificação</p>
            <div class="card painel-jogo"><div class="table-responsive"><table class="tabela-classificacao">
                <thead><tr><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>SG</th></tr></thead>
                <tbody>${cl.map(c => `<tr><td>${escapeHtml(c.nome)}</td><td class="pts">${c.p}</td><td>${c.j}</td><td>${c.v}</td><td>${c.e}</td><td>${c.d}</td><td>${c.gp}</td><td>${c.sg}</td></tr>`).join('')}</tbody>
            </table></div></div>
            <p class="lista-rotulo">Jogos</p>
            <div class="card painel-jogo">${jogos.length ? jogos.map(linhaJogo).join('') : '<p class="dica-painel">Sem jogos registrados.</p>'}</div>
            <p class="lista-rotulo">Artilharia</p>
            <div class="card painel-jogo">${art.length ? art.map(([n, g], i) => `<div class="art-linha"><span class="art-pos">${i + 1}</span>${avatarHtml(n)}<span class="art-nome">${escapeHtml(n)}</span><strong class="art-gols">${g}</strong></div>`).join('') : '<p class="dica-painel">Nenhum gol marcado.</p>'}</div>`;
        el.onclick = (e) => {
            if (e.target.closest('#voltar-hist')) irParaAba('tab-historico');
            else if (e.target.closest('#btn-resumo-imagem')) enviarResumoImagem(h, e.target.closest('#btn-resumo-imagem'));
            else if (e.target.closest('#btn-resumo-texto')) copiarResumoTexto(h);
        };
    }

    // ---------- CORRIGIR PLACAR (modo tabela) ----------
    function recalcularClassificacao() {
        classificacao = Logica.novaClassificacao(timesSorteados);
        partidas.filter(x => x.finalizada).forEach(x => Logica.aplicarResultado(classificacao, x.timeA.id, x.timeB.id, x.golsA, x.golsB, x.penaltisA, x.penaltisB));
    }
    function abrirCorrigirPlacar(idPartida) {
        const p = partidas.find(x => x.idPartida === idPartida);
        if (!p) return;
        let a = p.golsA || 0, b = p.golsB || 0, pa = p.penaltisA || 0, pb = p.penaltisB || 0;
        const m = abrirModalHtml('');
        const box = m.querySelector('.modal-content');
        const stp = (k, v) => `<div class="corrige-stp"><button type="button" class="step-btn" data-sp="${k}:-1">−</button><strong>${v}</strong><button type="button" class="step-btn step-mais" data-sp="${k}:1">+</button></div>`;
        const desenhar = () => {
            box.innerHTML = `<h2>Corrigir placar</h2>
                <div class="corrige-linha"><div class="corrige-time"><span>${escapeHtml(p.timeA.nome)}</span>${stp('a', a)}</div><div class="corrige-time"><span>${escapeHtml(p.timeB.nome)}</span>${stp('b', b)}</div></div>
                ${a === b ? `<p class="subtext" style="text-align:center;">Empate · pênaltis</p><div class="corrige-linha"><div class="corrige-time">${stp('pa', pa)}</div><div class="corrige-time">${stp('pb', pb)}</div></div>` : ''}
                <div class="modal-actions"><button type="button" class="btn btn-primary" id="ok-corrige">Salvar placar</button><button type="button" class="btn btn-secondary" id="cancela-corrige">Cancelar</button></div>`;
        };
        desenhar();
        m.addEventListener('click', (e) => {
            const t = e.target.closest('[data-sp],#ok-corrige,#cancela-corrige');
            if (!t) return;
            if (t.dataset.sp) {
                const [k, d] = t.dataset.sp.split(':'); const n = Number(d);
                if (k === 'a') a = Math.max(0, a + n);
                if (k === 'b') b = Math.max(0, b + n);
                if (k === 'pa') pa = Math.max(0, pa + n);
                if (k === 'pb') pb = Math.max(0, pb + n);
                desenhar(); return;
            }
            if (t.id === 'cancela-corrige') { m.remove(); return; }
            if (a === b && pa === pb) { toast('Defina o vencedor nos pênaltis!', 'erro'); return; }
            p.golsA = a; p.golsB = b;
            p.penaltisA = a === b ? pa : 0; p.penaltisB = a === b ? pb : 0;
            recalcularClassificacao();
            salvarCampeonatoAtivo();
            m.remove();
            renderizarCampeonato();
            toast('Placar salvo · tabela recalculada');
        });
    }

    // Liga os botões do menu lateral
    (function ligarMenu() {
        const lr = document.getElementById('lista-rachas');
        if (lr) lr.addEventListener('click', (e) => { const b = e.target.closest('[data-racha]'); if (b) trocarRacha(b.dataset.racha); });
        const nr = document.getElementById('btn-novo-racha'); if (nr) nr.addEventListener('click', abrirNovoRacha);
        const pz = document.getElementById('btn-personalizar'); if (pz) pz.addEventListener('click', abrirPersonalizar);
        const lg = document.querySelector('.app-header .app-logo'); if (lg && lg.addEventListener) lg.addEventListener('click', abrirPersonalizar);
        const su = document.getElementById('btn-suporte'); if (su) su.addEventListener('click', abrirSuporte);
        const cx = document.getElementById('btn-caixa-suporte'); if (cx) cx.addEventListener('click', abrirCaixa);
        const mt = document.getElementById('btn-metricas'); if (mt) mt.addEventListener('click', abrirMetricas);
        const lc = document.getElementById('lista-caixa');
        if (lc) lc.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-resolver]');
            if (!b) return;
            try { await window.firebaseFns.set(window.firebaseFns.ref(window.firebaseDb, 'suporte/' + b.dataset.resolver + '/ok'), true); toast('Marcado como resolvido'); }
            catch (er) { toast('Não foi possível atualizar', 'erro'); }
            carregarCaixa();
        });
    })();

    // ---------- RANKING (soma da artilharia de todos os campeonatos finalizados) ----------
    function renderizarRanking() {
        const box = document.getElementById('lista-ranking');
        if (!box) return;
        const sub = document.getElementById('ranking-sub');
        if (sub) sub.textContent = 'Gols somados de todos os campeonatos · ' + ((visualRacha && visualRacha.nome) || nomeRachaAtivo());
        const soma = {};
        historico.forEach(h => Object.entries(h.artilharia || {}).forEach(([n, g]) => {
            const nome = String(n).replace(/\u2024/g, '.');
            soma[nome] = (soma[nome] || 0) + (Number(g) || 0);
        }));
        const lista = Object.entries(soma).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (!lista.length) {
            box.innerHTML = `<div class="vazio">${window.UI ? UI.icone('podium') : ''}<h3>Ranking vazio</h3><p>Os gols entram aqui quando você encerra um campeonato.</p></div>`;
            return;
        }
        const max = lista[0][1] || 1;
        box.innerHTML = '<div class="card painel-jogo">' + lista.map(([n, g], i) =>
            `<div class="art-linha ranking-linha"><span class="art-pos">${i + 1}</span>${avatarHtml(n)}
                <span class="art-nome">${escapeHtml(n)}<span class="barra-rank"><span style="width:${Math.round(g / max * 100)}%"></span></span></span>
                <strong class="art-gols">${g}</strong></div>`).join('') + '</div>';
    }

    // ---------- PERFIL NO MENU (foto + apelido) ----------
    function renderizarPerfil() {
        const img = document.getElementById('perfil-foto');
        const svg = document.querySelector('#perfil-avatar svg');
        const btn = document.getElementById('perfil-apelido');
        if (img && svg) {
            const tem = !!(perfil && perfil.foto);
            if (tem) img.src = perfil.foto;
            img.classList.toggle('hidden', !tem);
            svg.classList.toggle('hidden', tem);
        }
        if (btn) btn.textContent = (perfil && perfil.apelido) || 'Definir apelido';
    }
    function salvarPerfil() { gravar('perfil', perfil, true); renderizarPerfil(); }

    (function ligarPerfil() {
        const av = document.getElementById('perfil-avatar');
        const arq = document.getElementById('perfil-arq');
        const btn = document.getElementById('perfil-apelido');
        if (av && arq) {
            av.addEventListener('click', () => arq.click());
            arq.addEventListener('change', () => {
                const f = arq.files && arq.files[0];
                if (!f) return;
                const leitor = new FileReader();
                leitor.onload = () => {
                    const im = new Image();
                    im.onload = () => {
                        const c = document.createElement('canvas'); c.width = c.height = 128;
                        const lado = Math.min(im.width, im.height);
                        c.getContext('2d').drawImage(im, (im.width - lado) / 2, (im.height - lado) / 2, lado, lado, 0, 0, 128, 128);
                        perfil = Object.assign({}, perfil, { foto: c.toDataURL('image/jpeg', 0.8) });
                        salvarPerfil(); toast('Foto atualizada');
                    };
                    im.src = leitor.result;
                };
                leitor.readAsDataURL(f); arq.value = '';
            });
        }
        if (btn) btn.addEventListener('click', () => {
            const campo = document.createElement('input');
            campo.type = 'text'; campo.maxLength = 24; campo.className = 'perfil-campo';
            campo.value = (perfil && perfil.apelido) || ''; campo.placeholder = 'Seu apelido';
            btn.replaceWith(campo); campo.focus();
            let feito = false;
            const fim = (salvar) => {
                if (feito) return; feito = true;
                if (salvar) { perfil = Object.assign({}, perfil, { apelido: campo.value.trim().slice(0, 24) }); salvarPerfil(); }
                campo.replaceWith(btn); renderizarPerfil();
            };
            campo.addEventListener('keydown', e => { if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
            campo.addEventListener('blur', () => fim(true));
        });
    })();

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        if (!container) return;

        container.onclick = (e) => {
            const btn = e.target.closest('button[data-acao="excluir-hist"]');
            if (btn) { window.excluirHistorico(btn.dataset.id); return; }
            const card = e.target.closest('[data-acao="abrir-hist"]');
            if (card) abrirDetalheHistorico(card.dataset.id);
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
                <div class="card card-hist" data-acao="abrir-hist" data-id="${h.id}">
                    <div class="hist-topo">
                        <span class="hist-ic">${window.UI ? UI.icone('trophy') : ''}</span>
                        <div class="hist-txt"><small>${escapeHtml(String(h.data || ''))} · ${h.modo === 'todos-contra-todos' ? 'Tabela' : 'Racha livre'}</small><b>${escapeHtml(campeao)}</b><span>Campeão</span></div>
                        <button class="btn-icone perigo" data-acao="excluir-hist" data-id="${h.id}" aria-label="Excluir campeonato" title="Excluir">${window.UI ? UI.icone('trash', 'i-sm') : 'Excluir'}</button>
                    </div>
                    <p class="hist-abrir">Ver tabela, confrontos e artilharia ›</p>
                </div>
            `;
        }).join('') + (ocultos > 0 ? `
            <div class="card card-bloqueado" onclick="window.Monetizacao && window.Monetizacao.abrirModal('Você tem ${ocultos} campeonato(s) antigo(s) guardados. Seja Pro para ver todo o histórico!')">
                <h3>Mais ${ocultos} campeonato${ocultos > 1 ? 's' : ''} guardado${ocultos > 1 ? 's' : ''}</h3>
                <p class="subtext" style="margin:6px 0 0;">Seus dados estão salvos. Toque para liberar com o Plano Pro.</p>
            </div>` : '');
    }

    // Quando o plano do usuário carregar/mudar, redesenha o que depende dele
    window.aoMudarPlano = function() { renderizarHistorico(); if (abaAtual === 'tab-financeiro') renderizarCaixa(); };

    window.excluirHistorico = async function(id) {
        const confirmou = await mostrarConfirmacao('Deseja excluir este registro do histórico?', '🗑️ EXCLUIR HISTÓRICO');
        if (confirmou) {
            historico = historico.filter(h => h.id != id);
            salvarHistoricoFirebase();
            renderizarHistorico();
        }
    };
});
