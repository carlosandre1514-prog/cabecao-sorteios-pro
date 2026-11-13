// =====================================================================
// logica.js — LÓGICA PURA do app (sem tela, sem Firebase).
// Tudo aqui pode ser testado no Node: `node tests/logica.test.js`
// Se um cálculo de sorteio/tabela/versão estiver errado, o erro está AQUI.
// =====================================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Logica = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // ---------- Utilitários ----------
    function embaralhar(array, rnd) {
        rnd = rnd || Math.random;
        const c = [...array];
        for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
        }
        return c;
    }

    // ID inteiro (o antigo Date.now()+Math.random() gerava números com casas decimais)
    function idUnico() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    // O Firebase Realtime Database NÃO aceita  . # $ [ ] /  em chaves.
    // Um jogador chamado "Zé Jr." quebrava o salvamento da artilharia inteira.
    function chaveSegura(nome) {
        return String(nome == null ? '' : nome)
            .replace(/\./g, '\u2024')
            .replace(/#/g, '\uFF03')
            .replace(/\$/g, '\uFF04')
            .replace(/\[/g, '(')
            .replace(/\]/g, ')')
            .replace(/\//g, '-')
            .trim() || '?';
    }

    // O Firebase devolve objetos com chaves 1,2,3 como ARRAY [null, {...}, {...}, {...}].
    // Isso quebrava a tabela e o histórico depois de reabrir o app.
    // Aqui sempre voltamos para um objeto simples, sem nulos.
    function limparMapa(valor) {
        const saida = {};
        if (!valor || typeof valor !== 'object') return saida;
        Object.keys(valor).forEach(k => {
            if (valor[k] !== null && valor[k] !== undefined) saida[k] = valor[k];
        });
        return saida;
    }

    // Time vindo do Firebase pode perder `jogadores` (array vazio é apagado lá).
    function normalizarTime(t) {
        if (!t) return t;
        const jogadores = Array.isArray(t.jogadores) ? t.jogadores.filter(Boolean)
            : Object.values(t.jogadores || {}).filter(Boolean);
        return Object.assign({}, t, { jogadores });
    }

    function compararVersoes(v1, v2) {
        const p1 = String(v1).split('.').map(Number);
        const p2 = String(v2).split('.').map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    // ---------- Importação em lote (lista do WhatsApp) ----------
    // Antes: o filtro era "contém pix|chaves|arena|valor..." e descartava
    // jogadores chamados "Pixote", "Chaves", "Valor"... Agora só vale a PALAVRA inteira.
    const PALAVRAS_LIXO = ['pix', 'pagamento', 'racha', 'chegada', 'complexo', 'arena', 'valor'];
    const RE_LIXO = new RegExp('(^|[^a-zà-ÿ])(' + PALAVRAS_LIXO.join('|') + ')([^a-zà-ÿ]|$)', 'i');

    function linhaEhLixo(nome) {
        return RE_LIXO.test(nome) || /http|@|\(r\$/i.test(nome);
    }

    function filtrarLinhasLote(texto) {
        const nomes = [];
        const ignoradas = [];
        String(texto || '').split('\n').forEach(linha => {
            const nome = linha.replace(/^\s*[0-9]+[\.\-\)\s]*/, '').trim();
            if (!nome) return;
            if (linhaEhLixo(nome)) ignoradas.push(linha.trim());
            else nomes.push(nome);
        });
        return { nomes, ignoradas };
    }

    // ---------- SORTEIO EQUILIBRADO ----------
    // Antes: as estrelas eram ignoradas, "jogadores por time" nunca era lido
    // (fixo em 4) e todo o excesso caía no último time.
    //
    // Agora:
    //  1) 1 goleiro por time (sorteado); goleiros extras viram jogadores de linha
    //  2) se há mais gente que vagas (qtdTimes x porTime), quem fica de RESERVA é sorteado
    //  3) quem joga é distribuído do mais forte ao mais fraco, sempre para o time com
    //     MENOS jogadores e, no empate, com MENOR soma de estrelas.
    // Ninguém fica de fora (não há reservas).
    //  - GOLEIROS: 1 por time, começando pelo Time 1; quem vai para qual time é sorteado.
    //    Se faltar goleiro, os últimos times ficam sem. Goleiro que sobrar joga na linha.
    //  - LINHA: "porTime" jogadores de linha por time (o goleiro vem à parte). Os times são
    //    enchidos em ordem e o ÚLTIMO fica "quebrado" com o que sobrar.
    //    14 de linha, 4 times de 4 -> 4, 4, 4 e 2.   Sobrou gente além dos times -> nasce time extra.
    //  - A distribuição da linha usa as estrelas para deixar os times parecidos.
    function sortearTimes(jogadores, qtdTimes, porTime, rnd) {
        rnd = rnd || Math.random;
        const estrelas = j => Number(j.estrelas) || 3;
        const limitado = porTime > 0;

        function calcularVagas(n) {
            if (!limitado) return Array.from({ length: qtdTimes }, () => Infinity);
            const total = Math.max(qtdTimes, Math.ceil(n / porTime));
            const caps = [];
            let resta = n;
            for (let i = 0; i < total && resta > 0; i++) { caps.push(Math.min(porTime, resta)); resta -= caps[i]; }
            // poucos jogadores: um time só não faz campeonato, então divide em dois
            if (caps.length < 2 && n >= 2) return [Math.ceil(n / 2), Math.floor(n / 2)];
            return caps;
        }

        const goleiros = embaralhar(jogadores.filter(j => j.isGoleiro), rnd);
        let linha = jogadores.filter(j => !j.isGoleiro).concat(goleiros.slice(qtdTimes)); // goleiro extra joga na linha
        let caps = calcularVagas(linha.length);

        let paraTimes = goleiros.slice(0, qtdTimes);
        if (paraTimes.length > caps.length) {            // sem vaga de time para tantos goleiros
            linha = linha.concat(paraTimes.slice(caps.length));
            paraTimes = paraTimes.slice(0, caps.length);
            caps = calcularVagas(linha.length);
        }

        const times = caps.map((_, i) => ({
            id: i + 1, nome: `Time ${i + 1}`, jogadores: [], temGoleiro: false, somaEstrelas: 0
        }));
        paraTimes.forEach((g, i) => times[i].jogadores.push(g));

        const pool = embaralhar(linha, rnd);
        // sort estável: quem tem a mesma estrela mantém a ordem aleatória do embaralhar
        pool.sort((a, b) => estrelas(b) - estrelas(a));

        const soma = t => t.jogadores.reduce((s, j) => s + estrelas(j), 0);
        const qtdLinha = new Array(times.length).fill(0);
        const ocupacao = i => Number.isFinite(caps[i]) ? qtdLinha[i] / caps[i] : qtdLinha[i];
        pool.forEach(j => {
            const candidatos = times.map((t, i) => i).filter(i => qtdLinha[i] < caps[i]);
            const menor = Math.min(...candidatos.map(ocupacao));
            const alvo = candidatos
                .filter(i => ocupacao(i) === menor)
                .sort((x, y) => soma(times[x]) - soma(times[y]))[0];
            times[alvo].jogadores.push(j);
            qtdLinha[alvo]++;
        });

        times.forEach(t => {
            // goleiro sempre no topo da lista do time
            t.jogadores.sort((a, b) => (b.isGoleiro ? 1 : 0) - (a.isGoleiro ? 1 : 0));
            t.somaEstrelas = soma(t);
            t.temGoleiro = t.jogadores.some(j => j.isGoleiro);
        });

        return { times, reservas: [] };
    }

    // ---------- TABELA (todos contra todos) ----------
    // Ordem dos confrontos: o time 1 enfrenta o 2, depois o 3, depois o 4...
    // Com 4 times: 1x2, 3x4 | 1x3, 2x4 | 1x4, 2x3  (cada "|" é uma rodada).
    function gerarPartidas(times) {
        const lista = [...times];
        if (lista.length % 2 !== 0) lista.push(null); // folga
        const n = lista.length;
        const rodadas = [];
        for (let r = 0; r < n - 1; r++) {
            const jogos = [];
            for (let i = 0; i < n / 2; i++) {
                const a = lista[i], b = lista[n - 1 - i];
                if (a && b) jogos.push(a.id < b.id ? [a, b] : [b, a]);
            }
            jogos.sort((x, y) => x[0].id - y[0].id);
            rodadas.push(jogos);
            lista.splice(1, 0, lista.pop());
        }
        // rodadas em ordem crescente do adversário do menor time (1x2 primeiro, depois 1x3...)
        const chave = jogos => jogos[0][0].id * 100000 + jogos[0][1].id;
        rodadas.sort((x, y) => chave(x) - chave(y));
        const partidas = [];
        rodadas.forEach((jogos, r) => jogos.forEach(([a, b]) => {
            partidas.push({
                idPartida: partidas.length + 1, rodada: r + 1,
                timeA: a, timeB: b,
                golsA: 0, golsB: 0, penaltisA: 0, penaltisB: 0, finalizada: false
            });
        }));
        return partidas;
    }

    // Tabela sem fim: quando o turno acaba, gera o próximo (mesmos confrontos, mandos invertidos
    // nos turnos pares). Rodadas e ids continuam a contagem; só para quando o racha for encerrado.
    function proximoTurno(times, partidasExistentes) {
        const existentes = partidasExistentes || [];
        const base = gerarPartidas(times);
        if (!base.length) return [];
        const rodadasPorTurno = Math.max(...base.map(p => p.rodada));
        const ultimaRodada = existentes.reduce((m, p) => Math.max(m, Number(p.rodada) || 0), 0);
        const ultimoId = existentes.reduce((m, p) => Math.max(m, Number(p.idPartida) || 0), 0);
        const turno = Math.floor(ultimaRodada / rodadasPorTurno) + 1;
        const inverter = turno % 2 === 0;
        return base.map((p, i) => Object.assign({}, p, {
            idPartida: ultimoId + i + 1,
            rodada: ultimaRodada + p.rodada,
            turno,
            timeA: inverter ? p.timeB : p.timeA,
            timeB: inverter ? p.timeA : p.timeB
        }));
    }

    function novaClassificacao(times) {
        const c = {};
        times.forEach(t => { c[t.id] = { nome: t.nome, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, sg: 0 }; });
        return c;
    }

    // Aplica UM resultado na classificação. Retorna 'A', 'B' ou null (empate).
    // Antes, o código do "todos contra todos" somava os gols do Time B duas vezes.
    function aplicarResultado(cl, idA, idB, gA, gB, penA, penB) {
        penA = penA || 0; penB = penB || 0;
        const a = cl[idA], b = cl[idB];
        a.j++; b.j++;
        a.gp += gA; b.gp += gB;
        a.sg += gA - gB; b.sg += gB - gA;
        let venc = null;
        if (gA > gB || (gA === gB && penA > penB)) venc = 'A';
        else if (gB > gA || (gA === gB && penB > penA)) venc = 'B';
        if (venc === 'A') { a.p += 3; a.v++; b.d++; }
        else if (venc === 'B') { b.p += 3; b.v++; a.d++; }
        else { a.p++; b.p++; a.e++; b.e++; }
        return venc;
    }

    function ordenarClassificacao(lista) {
        // Critérios: 1) pontos  2) MENOS gols sofridos  3) saldo de gols  4) gols pró  5) nome
        const gc = c => (c.gp || 0) - (c.sg || 0);
        return lista.filter(Boolean).sort((x, y) =>
            ((y.p || 0) - (x.p || 0)) || (gc(x) - gc(y)) || ((y.sg || 0) - (x.sg || 0)) ||
            ((y.gp || 0) - (x.gp || 0)) || String(x.nome).localeCompare(String(y.nome)));
    }

    // Retrato PÚBLICO do campeonato para a página ao-vivo.html (só nomes, placares e pontos;
    // nada de e-mail ou dados da conta). `e` é o estado do campeonato do app.
    function montarAoVivo(e, dono, agora, encerrado) {
        const nome = t => (t ? String(t.nome) : '');
        const cl = ordenarClassificacao(Object.values(e.classificacao || {}).filter(Boolean).map(c => ({
            nome: String(c.nome), p: c.p || 0, j: c.j || 0, v: c.v || 0, e: c.e || 0, d: c.d || 0, gp: c.gp || 0, sg: c.sg || 0, gc: (c.gp || 0) - (c.sg || 0)
        })));
        let jogos, proxima = null;
        if (e.modo === 'racha-livre') {
            jogos = (e.partidasRacha || []).map(p => ({ a: nome(p.timeA), b: nome(p.timeB), ga: p.golsA || 0, gb: p.golsB || 0, v: p.vencedor || '' }));
            if (e.timeA && e.timeB) proxima = { a: nome(e.timeA), b: nome(e.timeB), r: 0, ga: (e.placarRacha && e.placarRacha.a) || 0, gb: (e.placarRacha && e.placarRacha.b) || 0 };
        } else {
            const lista = e.partidas || [];
            jogos = lista.filter(p => p.finalizada).map(p => ({
                r: p.rodada || 0, a: nome(p.timeA), b: nome(p.timeB),
                ga: p.golsA || 0, gb: p.golsB || 0, pa: p.penaltisA || 0, pb: p.penaltisB || 0
            }));
            const prox = (lista[e.partidaAtualIndex] && !lista[e.partidaAtualIndex].finalizada)
                ? lista[e.partidaAtualIndex] : lista.find(p => !p.finalizada);
            if (prox) proxima = { a: nome(prox.timeA), b: nome(prox.timeB), r: prox.rodada || 0, ga: prox.golsA || 0, gb: prox.golsB || 0 };
        }
        return {
            dono, atualizadoEm: agora, encerrado: !!encerrado, modo: e.modo || 'todos-contra-todos',
            times: (e.times || []).map(t => ({ nome: String(t.nome), jogadores: (t.jogadores || []).map(j => String(j.nome)) })),
            classificacao: cl, jogos, proxima, fila: (e.fila || []).map(nome), cron: e.cron || null,
            artilharia: Object.entries(e.artilharia || {}).sort((x, y) => y[1] - x[1]).map(([n, g]) => ({ nome: n, gols: g }))
        };
    }

    // ---------- Estrelas ----------
    // Aceita "1,7", "1.7", 2 ... e devolve um número de 0.1 a 5 com 1 casa decimal.
    function normalizarEstrelas(v, padrao) {
        if (typeof v === 'string') v = v.trim().replace(',', '.');
        const n = (v === '' || v == null) ? NaN : Number(v);
        if (!isFinite(n)) return padrao == null ? 3 : padrao;
        return Math.round(Math.min(5, Math.max(0.1, n)) * 10) / 10;
    }

    // Filtro por faixa de estrelas. f = { min, max, opMin: '>=' | '>', opMax: '<=' | '<' }.
    // Campo vazio = sem limite. Ex.: maior que 1.5 e menor que 2 -> { min: 1.5, opMin: '>', max: 2, opMax: '<' }
    function filtrarPorEstrelas(lista, f) {
        f = f || {};
        const lim = x => {
            if (x === '' || x == null) return null;
            const n = parseFloat(String(x).replace(',', '.'));
            return isFinite(n) ? n : null;
        };
        const min = lim(f.min), max = lim(f.max);
        return lista.filter(j => {
            const e = Math.round((Number(j.estrelas) || 3) * 100) / 100;
            if (min !== null && !(f.opMin === '>' ? e > min : e >= min)) return false;
            if (max !== null && !(f.opMax === '<' ? e < max : e <= max)) return false;
            return true;
        });
    }

    // ---------- Modo offline: cópia local dos dados do usuário ----------
    // Grava `valor` dentro de `obj` seguindo "a/b/c" (cria os níveis que faltam). null apaga.
    // Devolve o próprio obj (ou um objeto novo, se obj não era objeto).
    function gravarNoCaminho(obj, caminho, valor) {
        const base = (obj && typeof obj === 'object') ? obj : {};
        const partes = String(caminho || '').split('/').filter(Boolean);
        if (!partes.length) return base;
        let atual = base;
        for (let i = 0; i < partes.length - 1; i++) {
            const k = partes[i];
            if (!atual[k] || typeof atual[k] !== 'object') atual[k] = {};
            atual = atual[k];
        }
        const ultima = partes[partes.length - 1];
        if (valor === null || valor === undefined) delete atual[ultima];
        else atual[ultima] = valor;
        return base;
    }
    function lerDoCaminho(obj, caminho) {
        return String(caminho || '').split('/').filter(Boolean)
            .reduce((a, k) => (a && typeof a === 'object' && k in a) ? a[k] : undefined, obj);
    }

    // ---------- Métricas ----------
    // "2026-11-13" no fuso do aparelho (o dia que o dono do app enxerga)
    function diaISO(ts) {
        const d = new Date(ts == null ? Date.now() : ts);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function ultimosDias(n, ts) {
        const base = new Date(ts == null ? Date.now() : ts);
        const out = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
            out.push(diaISO(d.getTime()));
        }
        return out;
    }
    // dias: { "2026-11-13": { sorteio: 3, ... } }, ativos: { "2026-11-13": { uid: true } }
    // -> { hoje: {evento: n}, semana: {evento: n}, ativosHoje, ativosSemana }
    function resumirMetricas(dias, ativos, listaDias) {
        dias = dias || {}; ativos = ativos || {};
        const hoje = {}, semana = {};
        listaDias.forEach((d, i) => {
            Object.entries(dias[d] || {}).forEach(([ev, n]) => {
                n = Number(n) || 0;
                semana[ev] = (semana[ev] || 0) + n;
                if (i === 0) hoje[ev] = (hoje[ev] || 0) + n;
            });
        });
        const unicos = new Set();
        listaDias.forEach(d => Object.keys(ativos[d] || {}).forEach(u => unicos.add(u)));
        return { hoje, semana, ativosHoje: Object.keys(ativos[listaDias[0]] || {}).length, ativosSemana: unicos.size };
    }

    // ---------- Resumo do racha (para mandar no grupo depois do fim) ----------
    // h = item do histórico (ou o campeonato que acabou de terminar). Só nomes e números.
    function nomeDaChave(k) {
        return String(k).replace(/\u2024/g, '.').replace(/\uFF03/g, '#').replace(/\uFF04/g, '$');
    }
    function resumoCampeonato(h) {
        h = h || {};
        const lista = v => Object.values(v || {}).filter(Boolean);
        const nome = t => (t && t.nome != null ? String(t.nome) : '?');
        const racha = h.modo === 'racha-livre';
        const classificacao = ordenarClassificacao(lista(h.classificacao).map(c => ({
            nome: String(c.nome), p: c.p || 0, j: c.j || 0, v: c.v || 0, e: c.e || 0, d: c.d || 0, gp: c.gp || 0, sg: c.sg || 0
        })));
        const jogos = lista(h.partidas).map((p, i) => {
            const ga = Number(p.golsA) || 0, gb = Number(p.golsB) || 0;
            let extra = '';
            if (racha) { if (p.vencedor && ga === gb) extra = 'avançou ' + p.vencedor; }
            else if (ga === gb && (p.penaltisA || p.penaltisB)) extra = 'pên. ' + (p.penaltisA || 0) + ' x ' + (p.penaltisB || 0);
            return { rotulo: racha ? 'Jogo ' + (p.idPartida || i + 1) : 'Rodada ' + (p.rodada || i + 1), a: nome(p.timeA), b: nome(p.timeB), ga, gb, extra };
        });
        const artilharia = Object.entries(h.artilharia || {})
            .map(([n, g]) => ({ nome: nomeDaChave(n), gols: Number(g) || 0 }))
            .filter(a => a.gols > 0)
            .sort((x, y) => (y.gols - x.gols) || x.nome.localeCompare(y.nome));
        const totalGols = jogos.reduce((a, j) => a + j.ga + j.gb, 0);
        return {
            data: String(h.data || ''), modo: racha ? 'Racha Livre' : 'Tabela',
            campeao: classificacao[0] ? classificacao[0].nome : null,
            classificacao, jogos, artilharia,
            times: lista(h.times).map(t => ({ nome: nome(t), jogadores: lista(t.jogadores).map(j => String(j.nome)) })),
            totalGols, totalJogos: jogos.length,
            mediaGols: jogos.length ? Math.round((totalGols / jogos.length) * 10) / 10 : 0
        };
    }
    // Texto pronto para colar no WhatsApp (*negrito* do WhatsApp)
    function textoResumo(r, titulo) {
        const L = [];
        L.push('🏁 *' + (titulo || 'RESULTADO DO RACHA').toUpperCase() + '*');
        if (r.data) L.push('📅 ' + r.data + ' · ' + r.modo);
        if (r.campeao) L.push('', '🏆 *Campeão: ' + r.campeao + '*');
        if (r.classificacao.length) {
            L.push('', '📊 *Classificação*');
            r.classificacao.forEach((c, i) => L.push((i + 1) + '. ' + c.nome + ' — ' + c.p + ' pts (' + c.v + 'V ' + c.e + 'E ' + c.d + 'D, SG ' + c.sg + ')'));
        }
        if (r.artilharia.length) {
            L.push('', '⚽ *Artilharia*');
            const med = ['🥇', '🥈', '🥉'];
            r.artilharia.slice(0, 10).forEach((a, i) => L.push((med[i] || (i + 1) + '.') + ' ' + a.nome + ' — ' + a.gols + (a.gols === 1 ? ' gol' : ' gols')));
        }
        if (r.jogos.length) {
            L.push('', '⚔️ *Confrontos*');
            r.jogos.forEach(j => L.push(j.rotulo + ': ' + j.a + ' ' + j.ga + ' x ' + j.gb + ' ' + j.b + (j.extra ? ' (' + j.extra + ')' : '')));
        }
        L.push('', '🔢 ' + r.totalJogos + ' jogos · ' + r.totalGols + ' gols · média ' + String(r.mediaGols).replace('.', ',') + ' por jogo');
        L.push('', '_Feito com Cabeção Sorteios Pro ⚽_');
        return L.join('\n');
    }

    // ---------- Lista de presença por link ----------
    // jogadores: [{id, nome, g (goleiro)}] publicados pelo organizador
    // respostas: { id: { status: 'vou'|'nao', em, nome?, convidado?, goleiro? } } vindas da página
    // limite: máx. de jogadores de LINHA (goleiros não contam); 0 = sem limite.
    // Quem confirmou primeiro fica com a vaga; o resto vai para a lista de espera, em ordem.
    function resumirPresenca(jogadores, respostas, limite) {
        jogadores = Object.values(jogadores || {}).filter(Boolean);
        respostas = respostas || {};
        limite = Math.max(0, parseInt(limite, 10) || 0);
        const porId = {};
        jogadores.forEach(j => { porId[String(j.id)] = j; });
        const vou = [], naoVao = [], convidados = [];
        Object.keys(respostas).forEach(id => {
            const r = respostas[id];
            if (!r || (r.status !== 'vou' && r.status !== 'nao')) return;
            const j = porId[id];
            if (!j && !r.convidado) return;           // jogador apagado do elenco
            const item = {
                id, nome: j ? String(j.nome) : String(r.nome || '?'),
                goleiro: j ? !!(j.g || j.isGoleiro) : !!r.goleiro,
                convidado: !j, em: Number(r.em) || 0
            };
            if (item.convidado) convidados.push(item);
            (r.status === 'vou' ? vou : naoVao).push(item);
        });
        const ordem = (a, b) => (a.em - b.em) || a.nome.localeCompare(b.nome);
        vou.sort(ordem); naoVao.sort((a, b) => a.nome.localeCompare(b.nome));
        const confirmados = [], espera = [];
        let linha = 0;
        vou.forEach(v => {
            if (v.goleiro || !limite || linha < limite) { confirmados.push(v); if (!v.goleiro) linha++; }
            else espera.push(v);
        });
        const semResposta = jogadores.filter(j => !respostas[String(j.id)])
            .map(j => ({ id: String(j.id), nome: String(j.nome), goleiro: !!(j.g || j.isGoleiro) }))
            .sort((a, b) => a.nome.localeCompare(b.nome));
        return {
            confirmados, espera, naoVao, semResposta, convidados: convidados.sort(ordem),
            linhaConfirmados: linha, goleirosConfirmados: confirmados.filter(c => c.goleiro).length, limite
        };
    }

    // Nome digitado na lista -> jogador. Ignora maiúsculas, acentos e espaços a mais
    // ("ze  pereira" acha "Zé Pereira"). pessoas: [{id, nome}]. Devolve a pessoa ou null.
    function normalizarNome(n) {
        return String(n == null ? '' : n).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function acharPorNome(pessoas, nome) {
        const alvo = normalizarNome(nome);
        if (!alvo) return null;
        return (pessoas || []).find(p => p && normalizarNome(p.nome) === alvo) || null;
    }

    return {
        embaralhar, idUnico, chaveSegura, limparMapa, normalizarTime, compararVersoes,
        filtrarLinhasLote, sortearTimes, gerarPartidas, novaClassificacao,
        aplicarResultado, ordenarClassificacao, montarAoVivo,
        normalizarEstrelas, filtrarPorEstrelas,
        gravarNoCaminho, lerDoCaminho, diaISO, ultimosDias, resumirMetricas,
        nomeDaChave, resumoCampeonato, textoResumo, proximoTurno, resumirPresenca,
        normalizarNome, acharPorNome
    };
});
