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

