document.addEventListener('DOMContentLoaded', () => {
    // Memória Local Permanente (localStorage)
    let jogadores = JSON.parse(localStorage.getItem('racha_jogadores')) || [];
    let historico = JSON.parse(localStorage.getItem('racha_historico')) || [];
    
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

    // Função de segurança para evitar que caracteres especiais quebrem o HTML
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
            if (timerInterval) return; // Já rodando

            timerInterval = setInterval(() => {
                if (tempoRestante > 0) {
                    tempoRestante--;
                    atualizarDisplayTimer();
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    tocarApitoJuiz();
                    alert('⏰ Fim de jogo! Tempo esgotado.');
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

    // Gerador de Som Sintético de Apito de Juiz (Web Audio API)
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
        btnImportarLote.addEventListener('click', () => {
            const inputLote = document.getElementById('lista-lote');
            if (!inputLote) return;
            const textoLote = inputLote.value;
            if (!textoLote.trim()) return alert('Cole uma lista de nomes!');

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
            alert(`${adicionados} jogadores válidos adicionados com sucesso!`);
        });
    }

    // Cadastro Individual
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
        btnAddJogador.addEventListener('click', () => {
            const nomeInput = document.getElementById('novo-nome');
            if (!nomeInput) return;
            const nome = nomeInput.value.trim();
            const tipoEl = document.querySelector('input[name="tipo-jogador"]:checked');
            const tipo = tipoEl ? tipoEl.value : 'linha';

            if (!nome) return alert('Digite o nome!');

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

    function salvarJogadores() {
        localStorage.setItem('racha_jogadores', JSON.stringify(jogadores));
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

    window.excluirJogador = function(id) {
        if (confirm("Tem certeza que deseja excluir este item?")) {
            jogadores = jogadores.filter(j => j.id != id);
            salvarJogadores();
            renderizarElenco();
        }
    };

    // --- MODAL DE EDIÇÃO DE JOGADOR ---
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

    // Função auxiliar para embaralhar arrays (Algoritmo Fisher-Yates)
    function embaralharArray(array) {
        let copia = [...array];
        for (let i = copia.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    }

    // Algoritmo de Sorteio Aleatório Balanceado (Monte Carlo)
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

            // Distribuição dos goleiros
            goleirosParaTimes.forEach((g, index) => {
                timesTemp[index].jogadores.push(g);
                timesTemp[index].somaEstrelas += g.estrelas;
                timesTemp[index].temGoleiro = true;
            });

            // Distribuição sequencial dos jogadores de linha
            linhaCompleta.forEach((j, index) => {
                const timeIndex = index % qtdTimes;
                timesTemp[timeIndex].jogadores.push(j);
                timesTemp[timeIndex].somaEstrelas += j.estrelas;
            });

            // Cálculo da diferença de nível entre o time mais forte e o mais fraco
            const somas = timesTemp.map(t => t.somaEstrelas);
            const diferenca = Math.max(...somas) - Math.min(...somas);

            if (diferenca < menorDiferencaEncontrada) {
                menorDiferencaEncontrada = diferenca;
                melhorSorteio = timesTemp;
            }

            // Filtro de aceitação baseado na tolerância
            if (diferenca <= limiteDiferencaEstrelas) {
                return timesTemp;
            }
        }

        return melhorSorteio;
    }

    const btnSortear = document.getElementById('btn-sortear');
    if (btnSortear) {
        btnSortear.addEventListener('click', () => {
            const presentes = jogadores.filter(j => j.presente);
            const qtdTimesEl = document.getElementById('qtd-times');
            const qtdTimes = qtdTimesEl ? parseInt(qtdTimesEl.value) : 2;

            if (presentes.length < qtdTimes * 2) {
                return alert('Poucos jogadores presentes para a quantidade de times!');
            }

            // Tolerância máxima de diferença de estrelas entre o time mais forte e o mais fraco
            const limiteDiferencaEstrelas = 2;

            timesSorteados = sortearTimesAleatorioBalanceado(presentes, qtdTimes, limiteDiferencaEstrelas);
            exibirTimesSorteados();
        });
    }

    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        if (!container) return;
        container.innerHTML = '';

        timesSorteados.forEach(t => {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            const avisoGoleiro = t.temGoleiro ? '' : ' <small style="color:#ef4444;">(Sem goleiro fixo)</small>';
            div.innerHTML = `<strong>🟢 ${t.nome}</strong>${avisoGoleiro}: ${t.jogadores.map(j => `${escapeHtml(j.nome)}${j.isGoleiro ? ' 🧤' : ''}`).join(', ')}`;
            container.appendChild(div);
        });

        const resDiv = document.getElementById('resultado-sorteio');
        if (resDiv) resDiv.classList.remove('hidden');
    }

    // --- 5. ABA CAMPEONATO ---
    const btnIniciarCamp = document.getElementById('btn-iniciar-campeonato');
    if (btnIniciarCamp) {
        btnIniciarCamp.addEventListener('click', () => {
            if (timesSorteados.length < 2) {
                return alert('Realize o sorteio dos times primeiro!');
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

    // ALGORITMO ROUND-ROBIN PERFEITO (TODOS CONTRA TODOS)
    function gerarTabelaTodosContraTodos() {
        partidas = [];
        let list = [...timesSorteados];
        let n = list.length;
        
        let tempTimes = [...list];
        if (n % 2 !== 0) {
            tempTimes.push(null); // time nulo representa Folga
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
            // Rotação Round-Robin
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
            container.innerHTML = '<h3 style="color:#22c55e; text-align:center;">✅ Todos os jogos da tabela foram realizados!</h3><p class="subtext" style="text-align:center; margin-top:4px;">Clique em "Finalizar Campeonato" abaixo para salvar no histórico.</p>';
            return;
        }

        const p = partidas[partidaAtualIndex];

        // Monta a lista com TODOS os times sorteados para o usuário selecionar livremente
        const opcoesTimesA = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeA.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');
        const opcoesTimesB = timesSorteados.map(t => `<option value="${t.id}" ${t.id === p.timeB.id ? 'selected' : ''}>${escapeHtml(t.nome)}</option>`).join('');

        container.innerHTML = `
            <p class="subtext" style="text-align:center; margin-bottom: 6px; font-size: 0.8rem; color:#a5b4fc;">
               <strong>Rodada ${p.rodada}</strong> - Escolha os times que vão jogar abaixo:
            </p>
            <div class="placar-box" style="gap:10px;">
                <div class="time-placar" style="flex:1;">
                    <select id="select-mudar-time-a" style="width:100%; padding:6px; background:#0f172a; color:#38bdf8; font-weight:bold; border-radius:4px; border:1px solid #38bdf8; text-align:center; margin-bottom:6px;">
                        ${opcoesTimesA}
                    </select>
                    <input type="number" id="gols-a" value="0" min="0">
                </div>
                
                <span style="font-size:1.2rem; font-weight:bold; align-self:center;">X</span>
                
                <div class="time-placar" style="flex:1;">
                    <select id="select-mudar-time-b" style="width:100%; padding:6px; background:#0f172a; color:#38bdf8; font-weight:bold; border-radius:4px; border:1px solid #38bdf8; text-align:center; margin-bottom:6px;">
                        ${opcoesTimesB}
                    </select>
                    <input type="number" id="gols-b" value="0" min="0">
                </div>
            </div>

            <div id="box-penaltis" class="penaltis-box hidden">
                <p class="subtext" style="color:#a5b4fc; text-align:center;">Empate! Decisão nos Pênaltis:</p>
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
                    <select id="select-artilheiro" style="width:70%; padding:6px; background:#0f172a; color:#fff; border-radius:4px;"></select>
                    <button id="btn-add-gol" class="btn btn-secondary" style="width:25%;">+ Gol</button>
                </div>
            </div>

            <button id="btn-finalizar-partida" class="btn btn-primary">Finalizar Partida</button>
        `;

        // Função para recarregar a lista de jogadores da artilharia quando mudar os times
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

        // Eventos para mudar o Time A ou o Time B em tempo real
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
            btnFinPartida.addEventListener('click', () => {
                if (p.timeA.id === p.timeB.id) {
                    return alert('Um time não pode jogar contra ele mesmo! Escolha times diferentes.');
                }

                const gA = parseInt(inputA.value) || 0;
                const gB = parseInt(inputB.value) || 0;

                let pA = 0, pB = 0;
                if (gA === gB) {
                    const elPenA = document.getElementById('pen-a');
                    const elPenB = document.getElementById('pen-b');
                    pA = elPenA ? (parseInt(elPenA.value) || 0) : 0;
                    pB = elPenB ? (parseInt(elPenB.value) || 0) : 0;
                    if (pA === pB) return alert('Defina o vencedor nos pênaltis!');
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

            let txtPen = (p.golsA === p.golsB) ? `<small style="color:#a5b4fc;">(Pen: ${p.penaltisA}x${p.penaltisB})</small>` : '';

            div.innerHTML = `
                <span><strong>${escapeHtml(p.timeA.nome)}</strong> ${p.golsA} x ${p.golsB} <strong>${escapeHtml(p.timeB.nome)}</strong> ${txtPen}</span>
                <span style="color:#22c55e; font-weight:bold;">✓ Finalizado</span>
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
        btnFinalizarCamp.addEventListener('click', () => {
            if (partidas.length === 0) {
                return alert('Nenhum campeonato ativo no momento!');
            }

            const confirmacao = confirm('Deseja realmente finalizar o campeonato atual e salvar os dados no Histórico?');
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
            localStorage.setItem('racha_historico', JSON.stringify(historico));

            partidas = [];
            timesSorteados = [];
            classificacao = {};
            artilharia = {};
            partidaAtualIndex = 0;

            alert('🏆 Campeonato finalizado e salvo com sucesso no Histórico!');
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
                    <strong style="color:#22c55e;">📅 ${h.data}</strong>
                    <button class="btn btn-danger" onclick="excluirHistorico(${h.id})">Excluir</button>
                </div>
                <p style="font-size:0.85rem; margin-bottom:4px;">🏆 <strong>Campeão:</strong> ${escapeHtml(h.campeao)}</p>
                <p style="font-size:0.85rem; margin-bottom:8px;">🎯 <strong>Artilheiro:</strong> ${txtArtilheiro}</p>
                
                <details style="font-size:0.8rem; color:#94a3b8; background:#0f172a; padding:6px; border-radius:4px;">
                    <summary style="cursor:pointer; color:#38bdf8;"><strong>Ver Confrontos Realizados</strong></summary>
                    <div style="margin-top:6px; line-height:1.4;">
                        • ${txtConfrontos}
                    </div>
                </details>
            `;
            container.appendChild(div);
        });
    }

    window.excluirHistorico = function(id) {
        if (confirm("Deseja realmente excluir este histórico?")) {
            historico = historico.filter(h => h.id != id);
            localStorage.setItem('racha_historico', JSON.stringify(historico));
            renderizarHistorico();
        }
    };

    renderizarElenco();
});
