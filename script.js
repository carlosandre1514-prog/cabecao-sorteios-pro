// Estado da Aplicação
let estado = {
    jogadores: [],
    presenca: {},
    times: [],
    campeonatoAtual: null,
    historico: []
};

// Cronômetro Global
let timerInterval = null;
let tempoRestanteSegundos = 600; // 10 min padrão
let timerRodando = false;

// Elementos da Interface
document.addEventListener('DOMContentLoaded', () => {
    carregarDadosLocal();
    inicializarNavegacao();
    inicializarEstrelasCadastro();
    inicializarEventos();
    renderizarJogadoresCadastrados();
    renderizarListaPresenca();
    renderizarHistorico();
});

// Salvamento Local
function salvarDadosLocal() {
    localStorage.setItem('cabecao_sorteios_dados', JSON.stringify(estado));
}

function carregarDadosLocal() {
    const dadosSalvos = localStorage.getItem('cabecao_sorteios_dados');
    if (dadosSalvos) {
        try {
            estado = JSON.parse(dadosSalvos);
            if (!estado.jogadores) estado.jogadores = [];
            if (!estado.presenca) estado.presenca = {};
            if (!estado.times) estado.times = [];
            if (!estado.historico) estado.historico = [];
        } catch (e) {
            console.error("Erro ao carregar dados salvos:", e);
        }
    }
}

// Navegação por Abas
function inicializarNavegacao() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Seletor de Estrelas no Cadastro
let nivelCadastroSelecionado = 3;
function inicializarEstrelasCadastro() {
    const btns = document.querySelectorAll('#stars-cadastro .star-cad');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            nivelCadastroSelecionado = parseInt(btn.getAttribute('data-star'));
            btns.forEach(b => {
                const val = parseInt(b.getAttribute('data-star'));
                if (val <= nivelCadastroSelecionado) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        });
    });
}

// Inicializar Eventos dos Botões
function inicializarEventos() {
    document.getElementById('btn-importar-lote').addEventListener('click', importarListaEmLote);
    document.getElementById('btn-add-jogador').addEventListener('click', adicionarJogadorUnico);
    document.getElementById('btn-sortear').addEventListener('click', realizarSorteioMelhorado);
    document.getElementById('btn-iniciar-campeonato').addEventListener('click', iniciarCampeonato);
    
    // Timer
    document.getElementById('btn-timer-start').addEventListener('click', iniciarTimer);
    document.getElementById('btn-timer-pause').addEventListener('click', pausarTimer);
    document.getElementById('btn-timer-reset').addEventListener('click', resetarTimer);
    document.getElementById('select-tempo-predefinido').addEventListener('change', (e) => {
        const min = parseInt(e.target.value);
        configurarTempoEmMinutos(min);
    });
    document.getElementById('input-tempo-custom').addEventListener('input', (e) => {
        const min = parseInt(e.target.value);
        if (min > 0) configurarTempoEmMinutos(min);
    });

    // Finalizar
    document.getElementById('btn-finalizar-campeonato').addEventListener('click', finalizarEEnviarHistorico);

    // Modal
    document.getElementById('btn-fechar-modal').addEventListener('click', () => {
        document.getElementById('modal-edicao').classList.add('hidden');
    });
    document.getElementById('btn-salvar-edicao').addEventListener('click', salvarEdicaoJogador);
}

// --- CADASTRO E GERENCIAMENTO DE JOGADORES ---
function adicionarJogadorUnico() {
    const inputNome = document.getElementById('novo-nome');
    const nome = inputNome.value.trim();
    if (!nome) {
        alert("Por favor, digite o nome do jogador.");
        return;
    }

    const radiosTipo = document.getElementsByName('tipo-jogador');
    let tipo = 'linha';
    for (let r of radiosTipo) {
        if (r.checked) {
            tipo = r.value;
            break;
        }
    }

    const novoJogador = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        nome: nome,
        tipo: tipo, // 'linha' ou 'goleiro'
        estrelas: nivelCadastroSelecionado
    };

    estado.jogadores.push(novoJogador);
    estado.presenca[novoJogador.id] = true; // Presente por padrão ao cadastrar
    salvarDadosLocal();

    inputNome.value = '';
    renderizarJogadoresCadastrados();
    renderizarListaPresenca();
}

function importarListaEmLote() {
    const textarea = document.getElementById('lista-lote');
    const texto = textarea.value.trim();
    if (!texto) {
        alert("Cole a lista do WhatsApp na caixa de texto.");
        return;
    }

    const linhas = texto.split('\n');
    let adicionados = 0;

    linhas.forEach(linha => {
        let nomeLimpo = linha.replace(/^[0-9]+[\.\-\)\s]+/, '').trim();
        if (nomeLimpo.length > 0) {
            let tipo = 'linha';
            if (nomeLimpo.toLowerCase().includes('goleiro') || nomeLimpo.toLowerCase().includes('(g)')) {
                tipo = 'goleiro';
            }

            const novoJogador = {
                id: Date.now() + Math.random().toString(36).substr(2, 9) + adicionados,
                nome: nomeLimpo,
                tipo: tipo,
                estrelas: 3 // Padrão 3 estrelas na importação rápida
            };
            estado.jogadores.push(novoJogador);
            estado.presenca[novoJogador.id] = true;
            adicionados++;
        }
    });

    salvarDadosLocal();
    textarea.value = '';
    renderizarJogadoresCadastrados();
    renderizarListaPresenca();
    alert(`${adicionados} jogadores adicionados com sucesso!`);
}

function renderizarJogadoresCadastrados() {
    const container = document.getElementById('lista-jogadores-cadastrados');
    container.innerHTML = '';

    if (estado.jogadores.length === 0) {
        container.innerHTML = '<p class="subtext">Nenhum jogador cadastrado ainda.</p>';
        return;
    }

    estado.jogadores.forEach(j => {
        const item = document.createElement('div');
        item.className = 'jogador-item';
        
        const badgeGol = j.tipo === 'goleiro' ? ' 🧤 (Goleiro)' : '';
        const estrelasTxt = '⭐'.repeat(j.estrelas);

        item.innerHTML = `
            <div class="jogador-info">
                <strong>${j.nome}${badgeGol}</strong>
                <span class="estrelas-display">${estrelasTxt}</span>
            </div>
            <div class="jogador-acoes">
                <button class="btn-icon" onclick="abrirModalEdicao('${j.id}')">✏️</button>
                <button class="btn-icon" onclick="removerJogador('${j.id}')">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });
}

function removerJogador(id) {
    if (confirm("Tem certeza que deseja remover este jogador?")) {
        estado.jogadores = estado.jogadores.filter(j => j.id !== id);
        delete estado.presenca[id];
        salvarDadosLocal();
        renderizarJogadoresCadastrados();
        renderizarListaPresenca();
    }
}

function abrirModalEdicao(id) {
    const j = estado.jogadores.find(item => item.id === id);
    if (!j) return;

    document.getElementById('edit-id').value = j.id;
    document.getElementById('edit-nome').value = j.nome;
    document.getElementById('edit-estrelas').value = j.estrelas;
    
    if (j.tipo === 'goleiro') {
        document.getElementById('edit-goleiro').checked = true;
    } else {
        document.getElementById('edit-linha').checked = true;
    }

    document.getElementById('modal-edicao').classList.remove('hidden');
}

function salvarEdicaoJogador() {
    const id = document.getElementById('edit-id').value;
    const j = estado.jogadores.find(item => item.id === id);
    if (!j) return;

    j.nome = document.getElementById('edit-nome').value.trim() || j.nome;
    j.estrelas = parseInt(document.getElementById('edit-estrelas').value) || 3;
    j.tipo = document.getElementById('edit-goleiro').checked ? 'goleiro' : 'linha';

    salvarDadosLocal();
    renderizarJogadoresCadastrados();
    renderizarListaPresenca();
    document.getElementById('modal-edicao').classList.add('hidden');
}

// --- LISTA DE PRESENÇA ---
function renderizarListaPresenca() {
    const container = document.getElementById('lista-presenca');
    container.innerHTML = '';

    if (estado.jogadores.length === 0) {
        container.innerHTML = '<p class="subtext">Cadastre jogadores primeiro para marcar presença.</p>';
        return;
    }

    estado.jogadores.forEach(j => {
        const item = document.createElement('div');
        item.className = 'presenca-item';
        const checked = estado.presenca[j.id] !== false ? 'checked' : '';
        const badgeGol = j.tipo === 'goleiro' ? ' 🧤' : '';

        item.innerHTML = `
            <label style="display:flex; align-items:center; gap:10px; width:100%; cursor:pointer;">
                <input type="checkbox" ${checked} onchange="alternarPresenca('${j.id}', this.checked)">
                <span>${j.nome}${badgeGol} (${'⭐'.repeat(j.estrelas)})</span>
            </label>
        `;
        container.appendChild(item);
    });
}

function alternarPresenca(id, estaPresente) {
    estado.presenca[id] = estaPresente;
    salvarDadosLocal();
}

// --- LÓGICA DE SORTEIO ATUALIZADA ---
function realizarSorteioMelhorado() {
    const qtdTimes = parseInt(document.getElementById('qtd-times').value) || 3;
    const linPorTime = parseInt(document.getElementById('qtd-por-time').value) || 4; // Agora representa especificamente os de LINHA

    // Filtrar presentes
    const presentes = estado.jogadores.filter(j => estado.presenca[j.id] !== false);

    if (presentes.length === 0) {
        alert("Nenhum jogador marcado como presente!");
        return;
    }

    // Separação em Goleiros e Jogadores de Linha
    let goleiros = presentes.filter(j => j.tipo === 'goleiro');
    let linhas = presentes.filter(j => j.tipo === 'linha');

    // Embaralha de forma aleatória mantendo equilíbrio de nível
    goleiros = embaralhar(goleiros);
    
    // Ordena linhas com um toque de aleatoriedade preservando nivelamento
    linhas.sort((a, b) => b.estrelas - a.estrelas);
    // Agrupa por estrelas e embaralha internamente cada nível
    let linhasEmbaralhadas = [];
    for (let e = 5; e >= 1; e--) {
        let doNivel = linhas.filter(l => l.estrelas === e);
        linhasEmbaralhadas.push(...embaralhar(doNivel));
    }

    // Estrutura dos times
    let times = [];
    for (let i = 0; i < qtdTimes; i++) {
        times.push({
            id: i + 1,
            nome: `Time ${i + 1}`,
            goleiro: null,
            jogadoresLinha: [],
            vitorias: 0,
            empates: 0,
            derrotas: 0,
            golsPro: 0,
            golsContra: 0,
            pontos: 0,
            jogos: 0
        });
    }

    // 1. DISTRIBUIÇÃO DOS GOLEIROS (Sequencial: Time 1 -> Time 2 -> Time 3...)
    goleiros.forEach((gol, index) => {
        if (index < qtdTimes) {
            times[index].goleiro = gol;
        }
    });

    // 2. DISTRIBUIÇÃO DOS JOGADORES DE LINHA (Sequencial Prioritária)
    // Preenche completamente o Time 1, depois o Time 2... O último time fica incompleto caso falte.
    let idxLinha = 0;
    for (let t = 0; t < qtdTimes; t++) {
        for (let p = 0; p < linPorTime; p++) {
            if (idxLinha < linhasEmbaralhadas.length) {
                times[t].jogadoresLinha.push(linhasEmbaralhadas[idxLinha]);
                idxLinha++;
            }
        }
    }

    estado.times = times;
    salvarDadosLocal();
    renderizarResultadoSorteio();
}

function embaralhar(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function renderizarResultadoSorteio() {
    const container = document.getElementById('times-sorteados-container');
    container.innerHTML = '';

    estado.times.forEach(t => {
        const timeCard = document.createElement('div');
        timeCard.className = 'card-time';

        let golHtml = t.goleiro 
            ? `<li class="goleiro-linha">🧤 <strong>Goleiro:</strong> ${t.goleiro.nome} (${'⭐'.repeat(t.goleiro.estrelas)})</li>`
            : `<li class="goleiro-linha" style="color:#d9534f;">🧤 <em>Sem goleiro fixo</em></li>`;

        let linHtml = t.jogadoresLinha.map(j => 
            `<li>🏃 ${j.nome} (${'⭐'.repeat(j.estrelas)})</li>`
        ).join('');

        timeCard.innerHTML = `
            <h3>${t.nome}</h3>
            <ul class="lista-time-sorteado">
                ${golHtml}
                ${linHtml}
            </ul>
        `;
        container.appendChild(timeCard);
    });

    document.getElementById('resultado-sorteio').classList.remove('hidden');
}

// --- GERENCIAMENTO DE CAMPEONATO ---
function iniciarCampeonato() {
    if (!estado.times || estado.times.length < 2) {
        alert("Realize o sorteio dos times primeiro!");
        return;
    }

    // Criar tabela de confrontos (Todos contra todos)
    let confrontos = [];
    const n = estado.times.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            confrontos.push({
                id: Date.now() + Math.random(),
                timeA: estado.times[i].id,
                timeB: estado.times[j].id,
                golsA: 0,
                golsB: 0,
                encerrado: false,
                autoresGols: []
            });
        }
    }

    estado.campeonatoAtual = {
        dataInicio: new Date().toLocaleDateString('pt-BR'),
        confrontos: confrontos,
        confrontoAtualIndex: 0,
        artilharia: {}
    };

    salvarDadosLocal();
    
    // Mudar para a aba de campeonato
    document.querySelector('[data-tab="tab-campeonato"]').click();
    atualizarPainelCampeonato();
}

function atualizarPainelCampeonato() {
    renderizarPartidaAtual();
    renderizarTabelaClassificacao();
    renderizarConfrontosEncerrados();
    renderizarArtilharia();
}

function renderizarPartidaAtual() {
    const container = document.getElementById('painel-partida-atual');
    container.innerHTML = '';

    if (!estado.campeonatoAtual) {
        container.innerHTML = '<p class="subtext">Inicie um campeonato na aba de Sorteio!</p>';
        return;
    }

    const confs = estado.campeonatoAtual.confrontos;
    const proxIndex = confs.findIndex(c => !c.encerrado);

    if (proxIndex === -1) {
        container.innerHTML = '<h3>🎉 Todos os confrontos do campeonato foram realizados!</h3><p>Confira a classificação final e clique em encerrar abaixo.</p>';
        return;
    }

    const jogo = confs[proxIndex];
    const timeA = estado.times.find(t => t.id === jogo.timeA);
    const timeB = estado.times.find(t => t.id === jogo.timeB);

    const div = document.createElement('div');
    div.className = 'confronto-ativo';

    // Monta opções para registrar gols
    let jogadoresTimeA = [...(timeA.goleiro ? [timeA.goleiro] : []), ...timeA.jogadoresLinha];
    let jogadoresTimeB = [...(timeB.goleiro ? [timeB.goleiro] : []), ...timeB.jogadoresLinha];

    let selectGolsAHtml = jogadoresTimeA.map(j => `<option value="${j.id}">${j.nome}</option>`).join('');
    let selectGolsBHtml = jogadoresTimeB.map(j => `<option value="${j.id}">${j.nome}</option>`).join('');

    div.innerHTML = `
        <div class="placar-box">
            <div class="time-box">
                <h3>${timeA.nome}</h3>
                <input type="number" id="gols-time-a" value="${jogo.golsA}" min="0" class="input-gol">
                <div class="add-gol-row">
                    <select id="select-gol-a">${selectGolsAHtml}</select>
                    <button class="btn btn-secondary btn-sm" onclick="registrarGolPartida('${jogo.id}', 'A')">⚽ Gol</button>
                </div>
            </div>
            <div class="vs-badge">VS</div>
            <div class="time-box">
                <h3>${timeB.nome}</h3>
                <input type="number" id="gols-time-b" value="${jogo.golsB}" min="0" class="input-gol">
                <div class="add-gol-row">
                    <select id="select-gol-b">${selectGolsBHtml}</select>
                    <button class="btn btn-secondary btn-sm" onclick="registrarGolPartida('${jogo.id}', 'B')">⚽ Gol</button>
                </div>
            </div>
        </div>
        <button class="btn btn-success" onclick="finalizarPartidaAtual('${jogo.id}')" style="margin-top:15px; width:100%;">✅ Encerrar Partida</button>
    `;

    container.appendChild(div);
}

function registrarGolPartida(jogoId, lado) {
    const jogo = estado.campeonatoAtual.confrontos.find(c => c.id == jogoId);
    if (!jogo) return;

    let idJogador = null;
    if (lado === 'A') {
        jogo.golsA++;
        idJogador = document.getElementById('select-gol-a').value;
    } else {
        jogo.golsB++;
        idJogador = document.getElementById('select-gol-b').value;
    }

    if (idJogador) {
        if (!estado.campeonatoAtual.artilharia[idJogador]) {
            estado.campeonatoAtual.artilharia[idJogador] = 0;
        }
        estado.campeonatoAtual.artilharia[idJogador]++;
    }

    salvarDadosLocal();
    atualizarPainelCampeonato();
}

function finalizarPartidaAtual(jogoId) {
    const jogo = estado.campeonatoAtual.confrontos.find(c => c.id == jogoId);
    if (!jogo) return;

    const inputA = document.getElementById('gols-time-a');
    const inputB = document.getElementById('gols-time-b');

    if (inputA) jogo.golsA = parseInt(inputA.value) || 0;
    if (inputB) jogo.golsB = parseInt(inputB.value) || 0;

    jogo.encerrado = true;

    // Atualizar tabela de estatísticas dos times
    const timeA = estado.times.find(t => t.id === jogo.timeA);
    const timeB = estado.times.find(t => t.id === jogo.timeB);

    timeA.jogos++;
    timeB.jogos++;
    timeA.golsPro += jogo.golsA;
    timeA.golsContra += jogo.golsB;
    timeB.golsPro += jogo.golsB;
    timeB.golsContra += jogo.golsA;

    if (jogo.golsA > jogo.golsB) {
        timeA.vitorias++;
        timeA.pontos += 3;
        timeB.derrotas++;
    } else if (jogo.golsB > jogo.golsA) {
        timeB.vitorias++;
        timeB.pontos += 3;
        timeA.derrotas++;
    } else {
        timeA.empates++;
        timeB.empates++;
        timeA.pontos += 1;
        timeB.pontos += 1;
    }

    salvarDadosLocal();
    resetarTimer();
    atualizarPainelCampeonato();
}

function renderizarTabelaClassificacao() {
    const tbody = document.getElementById('body-classificacao');
    tbody.innerHTML = '';

    if (!estado.times || estado.times.length === 0) return;

    // Ordenação da Tabela: Pontos > Vitórias > Saldo de Gols > Gols Pró
    let ordenados = [...estado.times].sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
        const sgA = a.golsPro - a.golsContra;
        const sgB = b.golsPro - b.golsContra;
        if (sgB !== sgA) return sgB - sgA;
        return b.golsPro - a.golsPro;
    });

    ordenados.forEach(t => {
        const sg = t.golsPro - t.golsContra;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${t.nome}</strong></td>
            <td><strong>${t.pontos}</strong></td>
            <td>${t.jogos}</td>
            <td>${t.vitorias}</td>
            <td>${t.empates}</td>
            <td>${t.derrotas}</td>
            <td>${t.golsPro}</td>
            <td>${sg > 0 ? '+' + sg : sg}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarConfrontosEncerrados() {
    const container = document.getElementById('lista-confrontos-encerrados');
    container.innerHTML = '';

    if (!estado.campeonatoAtual) return;

    const encerrados = estado.campeonatoAtual.confrontos.filter(c => c.encerrado);
    if (encerrados.length === 0) {
        container.innerHTML = '<p class="subtext">Nenhum confronto finalizado ainda.</p>';
        return;
    }

    encerrados.forEach(c => {
        const timeA = estado.times.find(t => t.id === c.timeA);
        const timeB = estado.times.find(t => t.id === c.timeB);

        const div = document.createElement('div');
        div.className = 'item-confronto-encerrado';
        div.innerHTML = `
            <span><strong>${timeA.nome}</strong> ${c.golsA} x ${c.golsB} <strong>${timeB.nome}</strong></span>
        `;
        container.appendChild(div);
    });
}

function renderizarArtilharia() {
    const container = document.getElementById('lista-artilharia');
    container.innerHTML = '';

    if (!estado.campeonatoAtual || !estado.campeonatoAtual.artilharia) {
        container.innerHTML = '<p class="subtext">Nenhum gol marcado ainda.</p>';
        return;
    }

    const art = estado.campeonatoAtual.artilharia;
    const ids = Object.keys(art);

    if (ids.length === 0) {
        container.innerHTML = '<p class="subtext">Nenhum gol marcado ainda.</p>';
        return;
    }

    // Ordenar por gols
    ids.sort((a, b) => art[b] - art[a]);

    ids.forEach(id => {
        const jogador = estado.jogadores.find(j => j.id === id);
        const nome = jogador ? jogador.nome : 'Jogador';
        const item = document.createElement('div');
        item.className = 'artilharia-item';
        item.innerHTML = `<span>🏃 ${nome}</span> <strong>⚽ ${art[id]} gol(s)</strong>`;
        container.appendChild(item);
    });
}

// --- CRONÔMETRO ---
function configurarTempoEmMinutos(minutos) {
    pausarTimer();
    tempoRestanteSegundos = minutos * 60;
    atualizarDisplayTimer();
}

function atualizarDisplayTimer() {
    const min = Math.floor(tempoRestanteSegundos / 60);
    const seg = tempoRestanteSegundos % 60;
    document.getElementById('timer-display').innerText = 
        `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
}

function iniciarTimer() {
    if (timerRodando) return;
    timerRodando = true;
    timerInterval = setInterval(() => {
        if (tempoRestanteSegundos > 0) {
            tempoRestanteSegundos--;
            atualizarDisplayTimer();
        } else {
            pausarTimer();
            alert("⏰ Tempo de jogo encerrado!");
        }
    }, 1000);
}

function pausarTimer() {
    timerRodando = false;
    if (timerInterval) clearInterval(timerInterval);
}

function resetarTimer() {
    pausarTimer();
    const selectMin = parseInt(document.getElementById('select-tempo-predefinido').value) || 10;
    tempoRestanteSegundos = selectMin * 60;
    atualizarDisplayTimer();
}

// --- HISTÓRICO E FINALIZAÇÃO ---
function finalizarEEnviarHistorico() {
    if (!estado.campeonatoAtual) {
        alert("Não há campeonato ativo para finalizar.");
        return;
    }

    if (!confirm("Deseja realmente encerrar este campeonato e salvá-lo no Histórico?")) return;

    // Achar o campeão
    let ordenados = [...estado.times].sort((a, b) => b.pontos - a.pontos);
    let campeao = ordenados.length > 0 ? ordenados[0].nome : "Nenhum";

    const registroHistorico = {
        id: Date.now(),
        data: estado.campeonatoAtual.dataInicio || new Date().toLocaleDateString('pt-BR'),
        campeao: campeao,
        tabelaFinal: ordenados,
        artilharia: { ...estado.campeonatoAtual.artilharia }
    };

    estado.historico.unshift(registroHistorico);
    estado.campeonatoAtual = null;
    estado.times = [];

    salvarDadosLocal();
    renderizarHistorico();
    atualizarPainelCampeonato();
    
    // Esconder times sorteados
    document.getElementById('resultado-sorteio').classList.add('hidden');

    alert(`🏆 Campeonato encerrado com sucesso! Campeão: ${campeao}`);
    document.querySelector('[data-tab="tab-historico"]').click();
}

function renderizarHistorico() {
    const container = document.getElementById('container-historico');
    container.innerHTML = '';

    if (!estado.historico || estado.historico.length === 0) {
        container.innerHTML = '<p class="subtext">Nenhum campeonato salvo no histórico ainda.</p>';
        return;
    }

    estado.historico.forEach(h => {
        const div = document.createElement('div');
        div.className = 'card-historico';

        let tabelaHtml = h.tabelaFinal.map((t, index) => 
            `<li>${index + 1}º ${t.nome} - ${t.pontos} pts (${t.vitorias}V / ${t.golsPro - t.golsContra} SG)</li>`
        ).join('');

        div.innerHTML = `
            <h3>📅 Edição: ${h.data}</h3>
            <p><strong>🏆 Campeão:</strong> ${h.campeao}</p>
            <h4>Classificação Final:</h4>
            <ul>${tabelaHtml}</ul>
        `;
        container.appendChild(div);
    });
}
