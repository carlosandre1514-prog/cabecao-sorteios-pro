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

