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

    // --- 1. NAVEGAÇÃO DE ABAS ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');

            if (target === 'tab-sorteio') renderizarPresenca();
            if (target === 'tab-historico') renderizarHistorico();
        });
    });

    // --- 2. CRONÔMETRO COM APITO AUTOMÁTICO ---
    const timerDisplay = document.getElementById('timer-display');
    const selectTempo = document.getElementById('select-tempo-predefinido');
    const inputTempoCustom = document.getElementById('input-tempo-custom');

    function atualizarDisplayTimer() {
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

    selectTempo.addEventListener('change', (e) => {
        inputTempoCustom.value = '';
        definirNovoTempo(parseInt(e.target.value));
    });

    inputTempoCustom.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (val && val > 0) {
            definirNovoTempo(val);
        }
    });

    document.getElementById('btn-timer-start').addEventListener('click', () => {
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

    document.getElementById('btn-timer-pause').addEventListener('click', () => {
        clearInterval(timerInterval);
        timerInterval = null;
    });

    document.getElementById('btn-timer-reset').addEventListener('click', () => {
        clearInterval(timerInterval);
        timerInterval = null;
        tempoRestante = tempoTotalSegundos;
        atualizarDisplayTimer();
    });

    // Gerador de Som Sintético de Apito de Juiz (Web Audio API)
    function tocarApitoJuiz() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            // Frequências duplas para efeito de apito estridente real
            osc1.frequency.setValueAtTime(2800, audioCtx.currentTime);
            osc2.frequency.setValueAtTime(3200, audioCtx.currentTime);

            // Modulação (Trinado do apito)
            const lfo = audioCtx.createOscillator();
            lfo.frequency.setValueAtTime(25, audioCtx.currentTime);
            const lfoGain = audioCtx.createGain();
            lfoGain.gain.setValueAtTime(300, audioCtx.currentTime);
            lfo.connect(osc1.frequency);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            // Três apitadas curtas e fortes (Som clássico de fim de jogo)
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
    document.getElementById('btn-importar-lote').addEventListener('click', () => {
        const textoLote = document.getElementById('lista-lote').value;
        if (!textoLote.trim()) return alert('Cole uma lista de nomes!');

        const linhas = textoLote.split('\n');
        let adicionados = 0;

        linhas.forEach(linha => {
            let nomeLimpo = linha.replace(/^[0-9]+[\.\-\)\s]*/, '').trim();
            if (nomeLimpo.length > 0) {
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
        document.getElementById('lista-lote').value = '';
        alert(`${adicionados} jogadores adicionados com sucesso! Editáveis na lista abaixo.`);
    });

    // Cadastro Individual
    const starsCadastro = document.querySelectorAll('#stars-cadastro .star-cad');
    starsCadastro.forEach(star => {
        star.addEventListener('click', (e) => {
            nivelCadastroTemp = parseInt(e.target.getAttribute('data-star'));
            starsCadastro.forEach((s, idx) => {
                if (idx < nivelCadastroTemp) s.classList.add('active');
                else s.classList.remove('active');
            });
        });
    });

    document.getElementById('btn-add-jogador').addEventListener('click', () => {
        const nomeInput = document.getElementById('novo-nome');
        const nome = nomeInput.value.trim();
        const tipo = document.querySelector('input[name="tipo-jogador"]:checked').value;

        if (!nome) return alert('Digite o nome!');

        jogadores.push({
            id: Date.now(),
            nome: nome,
            isGoleiro: tipo === 'goleiro',
            estrelas: nivelCadastroTemp,
            presente: true
        });

        salvarJogadores();
        nomeInput.value = '';
        renderizarElenco();
    });

    function salvarJogadores() {
        localStorage.setItem('racha_jogadores', JSON.stringify(jogadores));
    }

    function renderizarElenco() {
        const container = document.getElementById('lista-jogadores-cadastrados');
        container.innerHTML = '';

        if (jogadores.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum jogador cadastrado.</p>';
            return;
        }

        jogadores.forEach(j => {
            const div = document.createElement('div');
            div.className = 'item-jogador';
            div.innerHTML = `
                <div>
                    <strong>${j.nome}</strong> ${j.isGoleiro ? '🧤' : ''}
                    <small style="color:#94a3b8">(${'⭐'.repeat(j.estrelas)})</small>
                </div>
                <div class="acoes-item">
                    <button class="btn-edit" onclick="abrirEdicao(${j.id})">✏️ Editar</button>
                    <button class="btn btn-danger" style="padding: 2px 6px;" onclick="excluirJogador(${j.id})">X</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    window.excluirJogador = function(id) {
        jogadores = jogadores.filter(j => j.id !== id);
        salvarJogadores();
        renderizarElenco();
    };

    // --- MODAL DE EDIÇÃO DE JOGADOR ---
    window.abrirEdicao = function(id) {
        const j = jogadores.find(item => item.id === id);
        if (!j) return;

        document.getElementById('edit-id').value = j.id;
        document.getElementById('edit-nome').value = j.nome;
        document.getElementById('edit-estrelas').value = j.estrelas;
        if (j.isGoleiro) document.getElementById('edit-goleiro').checked = true;
        else document.getElementById('edit-linha').checked = true;

        document.getElementById('modal-edicao').classList.remove('hidden');
    };

    document.getElementById('btn-fechar-modal').addEventListener('click', () => {
        document.getElementById('modal-edicao').classList.add('hidden');
    });

    document.getElementById('btn-salvar-edicao').addEventListener('click', () => {
        const id = parseFloat(document.getElementById('edit-id').value);
        const j = jogadores.find(item => item.id === id);

        if (j) {
            j.nome = document.getElementById('edit-nome').value.trim() || j.nome;
            j.estrelas = parseInt(document.getElementById('edit-estrelas').value) || 3;
            j.isGoleiro = document.getElementById('edit-goleiro').checked;

            salvarJogadores();
            renderizarElenco();
            document.getElementById('modal-edicao').classList.add('hidden');
        }
    });

    // --- 4. ABA SORTEIO (COM REGRA DE NO MÁXIMO 1 GOLEIRO POR TIME) ---
    function renderizarPresenca() {
        const container = document.getElementById('lista-presenca');
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
                <label for="p-${j.id}">${j.nome} ${j.isGoleiro ? '🧤' : ''} (${'⭐'.repeat(j.estrelas)})</label>
            `;
            container.appendChild(div);

            div.querySelector('input').addEventListener('change', (e) => {
                j.presente = e.target.checked;
                salvarJogadores();
            });
        });
    }

    document.getElementById('btn-sortear').addEventListener('click', () => {
        const presentes = jogadores.filter(j => j.presente);
        const qtdTimes = parseInt(document.getElementById('qtd-times').value);

        if (presentes.length < qtdTimes * 2) {
            return alert('Poucos jogadores presentes para a quantidade de times!');
        }

        // Separa goleiros e linha
        let goleiros = presentes.filter(j => j.isGoleiro);
        let linha = presentes.filter(j => !j.isGoleiro);

        // Embaralha goleiros para distribuição aleatória
        goleiros.sort(() => Math.random() - 0.5);

        // Ordena linha por estrelas (maior para menor)
        linha.sort((a, b) => b.estrelas - a.estrelas);

        timesSorteados = Array.from({ length: qtdTimes }, (_, i) => ({
            id: i + 1,
            nome: `Time ${i + 1}`,
            jogadores: [],
            temGoleiro: false,
            somaEstrelas: 0
        }));

        // REGRA: Distribui NO MÁXIMO 1 goleiro por time
        goleiros.forEach((g, idx) => {
            if (idx < qtdTimes) {
                timesSorteados[idx].jogadores.push(g);
                timesSorteados[idx].somaEstrelas += g.estrelas;
                timesSorteados[idx].temGoleiro = true;
            } else {
                // Se houver mais goleiros que times, os excedentes vão para a linha normal
                linha.push(g);
            }
        });

        // Distribui jogadores de linha equilibrando as estrelas
        linha.forEach(j => {
            timesSorteados.sort((a, b) => a.somaEstrelas - b.somaEstrelas);
            timesSorteados[0].jogadores.push(j);
            timesSorteados[0].somaEstrelas += j.estrelas;
        });

        timesSorteados.sort((a, b) => a.id - b.id);
        exibirTimesSorteados();
    });

    function exibirTimesSorteados() {
        const container = document.getElementById('times-sorteados-container');
        container.innerHTML = '';

        timesSorteados.forEach(t => {
            const div = document.createElement('div');
            div.style.marginBottom = '8px';
            const avisoGoleiro = t.temGoleiro ? '' : ' <small style="color:#ef4444;">(Sem goleiro fixo - revezamento)</small>';
            div.innerHTML = `<strong>🟢 ${t.nome}</strong>${avisoGoleiro}: ${t.jogadores.map(j => `${j.nome}${j.isGoleiro ? ' 🧤' : ''}`).join(', ')}`;
            container.appendChild(div);
        });

        document.getElementById('resultado-sorteio').classList.remove('hidden');
    }

    // --- 5. ABA CAMPEONATO ---
    document.getElementById('btn-iniciar-campeonato').addEventListener('click', () => {
        gerarTabelaTodosContraTodos();
        inicializarClassificacao();
        artilharia = {};
        partidaAtualIndex = 0;

        document.querySelector('[data-tab="tab-campeonato"]').click();
        renderizarCampeonato();
    });

    function gerarTabelaTodosContraTodos() {
        partidas = [];
        const n = timesSorteados.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                partidas.push({
                    idPartida: partidas.length + 1,
                    timeA: timesSorteados[i],
                    timeB: timesSorteados[j],
                    golsA: 0,
                    golsB: 0,
                    penaltisA: 0,
                    penaltisB: 0,
                    finalizada: false
                });
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
        renderizarTabela();
        renderizarPartidaAtual();
        renderizarConfrontosEncerrados();
        renderizarArtilharia();
    }

    function renderizarTabela() {
        const body = document.getElementById('body-classificacao');
        body.innerHTML = '';

        let listaClass = Object.values(classificacao);
        listaClass.sort((a, b) => b.p - a.p || b.sg - a.sg || b.gp - a.gp);

        listaClass.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:left;"><strong>${c.nome}</strong></td>
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

        if (partidas.length === 0) {
            container.innerHTML = '<p class="subtext">Inicie um campeonato no menu Sorteio!</p>';
            return;
        }

        if (partidaAtualIndex >= partidas.length) {
            container.innerHTML = '<h3 style="color:#22c55e; text-align:center;">✅ Todos os jogos da tabela foram realizados!</h3><p class="subtext" style="text-align:center; margin-top:4px;">Clique em "Finalizar Campeonato" abaixo para salvar no histórico.</p>';
            return;
        }

        const p = partidas[partidaAtualIndex];

        container.innerHTML = `
            <div class="placar-box">
                <div class="time-placar">
                    <strong>${p.timeA.nome}</strong>
                    <input type="number" id="gols-a" value="0" min="0">
                </div>
                <span style="font-size:1.2rem; font-weight:bold;">X</span>
                <div class="time-placar">
                    <strong>${p.timeB.nome}</strong>
                    <input type="number" id="gols-b" value="0" min="0">
                </div>
            </div>

            <div id="box-penaltis" class="penaltis-box hidden">
                <p class="subtext" style="color:#a5b4fc; text-align:center;">Empate! Decisão nos Pênaltis:</p>
                <div class="form-group-row">
                    <label>${p.timeA.nome}:</label>
                    <input type="number" id="pen-a" value="0" min="0">
                </div>
                <div class="form-group-row">
                    <label>${p.timeB.nome}:</label>
                    <input type="number" id="pen-b" value="0" min="0">
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <label class="subtext">Registrar Gol Individual:</label>
                <div class="form-group-row">
                    <select id="select-artilheiro" style="width:70%; padding:6px; background:#0f172a; color:#fff; border-radius:4px;">
                        ${p.timeA.jogadores.concat(p.timeB.jogadores).map(j => `<option value="${j.nome}">${j.nome}</option>`).join('')}
                    </select>
                    <button id="btn-add-gol" class="btn btn-secondary" style="width:25%;">+ Gol</button>
                </div>
            </div>

            <button id="btn-finalizar-partida" class="btn btn-primary">Finalizar Partida</button>
        `;

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

        inputA.addEventListener('input', checarEmpate);
        inputB.addEventListener('input', checarEmpate);

        document.getElementById('btn-add-gol').addEventListener('click', () => {
            const nomeArtilheiro = document.getElementById('select-artilheiro').value;
            artilharia[nomeArtilheiro] = (artilharia[nomeArtilheiro] || 0) + 1;
            renderizarArtilharia();
        });

        document.getElementById('btn-finalizar-partida').addEventListener('click', () => {
            const gA = parseInt(inputA.value) || 0;
            const gB = parseInt(inputB.value) || 0;

            let pA = 0, pB = 0;
            if (gA === gB) {
                pA = parseInt(document.getElementById('pen-a').value) || 0;
                pB = parseInt(document.getElementById('pen-b').value) || 0;
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

    function renderizarConfrontosEncerrados() {
        const container = document.getElementById('lista-confrontos-encerrados');
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
                <span><strong>${p.timeA.nome}</strong> ${p.golsA} x ${p.golsB} <strong>${p.timeB.nome}</strong> ${txtPen}</span>
                <span style="color:#22c55e; font-weight:bold;">✓ Finalizado</span>
            `;
            container.appendChild(div);
        });
    }

    function renderizarArtilharia() {
        const container = document.getElementById('lista-artilharia');
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
            div.innerHTML = `<span><strong>${nome}</strong></span><span>⚽ ${gols} gol(s)</span>`;
            container.appendChild(div);
        });
    }

    // --- 6. ENVIAR PARA O HISTÓRICO ---
    document.getElementById('btn-finalizar-campeonato').addEventListener('click', () => {
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
            return `${p.timeA.nome} ${p.golsA} x ${p.golsB} ${p.timeB.nome}${pen}`;
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

        // Reseta dados do campeonato atual
        partidas = [];
        timesSorteados = [];
        classificacao = {};
        artilharia = {};
        partidaAtualIndex = 0;

        alert('🏆 Campeonato finalizado e salvo com sucesso no Histórico!');
        document.querySelector('[data-tab="tab-historico"]').click();
    });

    function renderizarHistorico() {
        const container = document.getElementById('container-historico');
        container.innerHTML = '';

        if (historico.length === 0) {
            container.innerHTML = '<p class="subtext">Nenhum histórico salvo ainda.</p>';
            return;
        }

        historico.forEach(h => {
            const div = document.createElement('div');
            div.className = 'card-historico';

            let artilheiroTop = Object.entries(h.artilharia).sort((a,b)=>b[1]-a[1])[0];
            let txtArtilheiro = artilheiroTop ? `${artilheiroTop[0]} (${artilheiroTop[1]} gols)` : 'Nenhum';
            let txtConfrontos = h.confrontos && h.confrontos.length > 0 ? h.confrontos.join('<br>• ') : 'Nenhum';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <strong style="color:#22c55e;">📅 ${h.data}</strong>
                    <button class="btn btn-danger" onclick="excluirHistorico(${h.id})">Excluir</button>
                </div>
                <p style="font-size:0.85rem; margin-bottom:4px;">🏆 <strong>Campeão:</strong> ${h.campeao}</p>
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
        historico = historico.filter(h => h.id !== id);
        localStorage.setItem('racha_historico', JSON.stringify(historico));
        renderizarHistorico();
    };

    renderizarElenco();
});
