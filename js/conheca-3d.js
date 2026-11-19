// =====================================================================
// conheca-3d.js — cenas 3D da página de apresentação (Three.js)
//
//   1) Abertura: bola rolando no gramado (futebol3d.js → bolaNoGramado).
//   2) Sorteio: 12 fichas de jogador que se juntam e se separam em 3 times.
//
// Cuidados: só desenha quando a cena está na tela e a aba está aberta (bateria);
// "reduzir movimento" no aparelho = imagem parada; sem WebGL ou sem internet para
// baixar o Three.js, a página segue com a imagem do ícone (classe sem-3d).
// =====================================================================
import { carregar, bolaNoGramado } from './futebol3d.js';   // a bola e o Three.js (js/vendor) ficam no módulo do app
const raiz = document.documentElement;
const parado = matchMedia('(prefers-reduced-motion: reduce)').matches;

function temWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

// desenha só quando visível; chama passo(dt, t) a cada quadro
function laco(el, renderer, passo) {
    let visivel = false, ultimo = 0, t = 0, pedido = 0;
    const rodar = (agora) => {
        pedido = 0;
        if (!visivel || document.hidden) return;
        const dt = Math.min(0.05, ultimo ? (agora - ultimo) / 1000 : 0.016);
        ultimo = agora; t += dt;
        passo(dt, t);
        pedido = requestAnimationFrame(rodar);
    };
    const ligar = () => { if (!pedido && visivel && !document.hidden && !parado) { ultimo = 0; pedido = requestAnimationFrame(rodar); } };
    new IntersectionObserver(([e]) => { visivel = e.isIntersecting; ligar(); }, { rootMargin: '80px' }).observe(el);
    document.addEventListener('visibilitychange', ligar);
    return { primeiro: () => passo(0, parado ? 2.4 : 0) };
}

function ajustarTamanho(el, renderer, camera, aoMudar) {
    const ajustar = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (aoMudar) aoMudar(w, h);
    };
    ajustar();
    if ('ResizeObserver' in window) new ResizeObserver(ajustar).observe(el);
    else addEventListener('resize', ajustar);
}

function novoRenderer(THREE, el) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    el.appendChild(r.domElement);
    return r;
}

// ---------------------------------------------------------------
// Sorteio: fichas de jogador (disco com a inicial). Se juntam, embaralham e vão para
// os 3 times, mudando para a cor do time. Repete.
// ---------------------------------------------------------------
const JOGADORES = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fábio', 'Gui', 'Hugo', 'Ivan', 'João', 'Kaio', 'Léo'];
const ESTRELAS = [4.5, 3, 3.5, 4, 2.5, 3, 4, 3.5, 3, 4.5, 2.5, 3.5];
const CORES = ['#2da762', '#e3b341', '#5b9be6'];
const GIRO_LETRA = Math.PI / 2;

function texturaFicha(THREE, letra, fundo, tinta) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = fundo; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.fillStyle = tinta; g.font = '700 118px Inter, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letra, 128, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.center.set(0.5, 0.5); t.rotation = GIRO_LETRA;
    return t;
}

// times equilibrados de verdade (o mesmo jeito do app: mais forte vai para o time mais fraco)
function sortear() {
    const ordem = JOGADORES.map((n, i) => ({ i, e: ESTRELAS[i] + Math.random() * 0.6 })).sort((a, b) => b.e - a.e);
    const times = [[], [], []], soma = [0, 0, 0];
    for (const j of ordem) {
        let k = 0;
        for (let x = 1; x < 3; x++) if (times[x].length < 4 && (times[k].length >= 4 || soma[x] < soma[k])) k = x;
        times[k].push(j.i); soma[k] += ESTRELAS[j.i];
    }
    return times;
}

function cenaSorteio(THREE, el) {
    const renderer = novoRenderer(THREE, el);
    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    cena.add(new THREE.HemisphereLight(0xffffff, 0x223322, 1.1));
    const sol = new THREE.DirectionalLight(0xffffff, 1.2); sol.position.set(2, 7, 5); cena.add(sol);

    // mesa de gramado escura, com a linha do meio-campo
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#16251c'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 3;
    g.strokeRect(8, 8, 496, 240); g.beginPath(); g.arc(256, 128, 46, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mesa = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshLambertMaterial({ map: tex }));
    mesa.rotation.x = -Math.PI / 2; cena.add(mesa);

    const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 48);
    const fichas = JOGADORES.map((nome, i) => {
        const letra = nome[0];
        const neutra = texturaFicha(THREE, letra, '#e8ecef', '#1a1f22');
        const doTime = CORES.map(cor => texturaFicha(THREE, letra, cor, '#0f1214'));
        const topo = new THREE.MeshLambertMaterial({ map: neutra });
        const lado = new THREE.MeshLambertMaterial({ color: 0xc9d0d5 });
        const m = new THREE.Mesh(geo, [lado, topo, lado]);
        m.position.set(0, 0.05, 0);
        cena.add(m);
        return { m, topo, lado, neutra, doTime, de: new THREE.Vector3(), para: new THREE.Vector3(), time: -1, atraso: 0 };
    });

    const vagas = (k, j) => new THREE.Vector3((k - 1) * 2.7, 0.05, -1.05 + j * 0.7);
    const LUGARES = [];
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
        const x = (q + r / 2) * 0.68, z = r * 0.68 * 0.866;
        LUGARES.push(new THREE.Vector3(x, 0.05, z));
    }
    LUGARES.sort((a, b) => a.length() - b.length());
    LUGARES.length = 12;
    let livres = [];
    const monte = () => { if (!livres.length) livres = LUGARES.map(v => v.clone()).sort(() => Math.random() - 0.5); return livres.pop(); };
    const legenda = [...document.querySelectorAll('[data-nivel]')], dif = document.getElementById('dif-nivel');
    const fmt = v => v.toFixed(1).replace('.', ',');

    let fase = 'juntar', inicio = 0, times = sortear();
    const comecar = (nova, t) => {
        fase = nova; inicio = t;
        if (nova === 'separar') {
            times = sortear();
            times.forEach((lista, k) => lista.forEach((i, j) => {
                const f = fichas[i]; f.de.copy(f.m.position); f.para.copy(vagas(k, j)); f.time = k; f.atraso = (k * 4 + j) * 0.06;
            }));
            const medias = times.map(l => l.reduce((s, i) => s + ESTRELAS[i], 0) / l.length);
            legenda.forEach((b, k) => { b.textContent = fmt(medias[k]); });
            if (dif) dif.textContent = fmt(Math.max(...medias) - Math.min(...medias));
        } else {
            fichas.forEach((f, i) => { f.de.copy(f.m.position); f.para.copy(monte()); f.atraso = i * 0.03; });
        }
    };
    fichas.forEach(f => f.m.position.copy(monte()));

    let dist = 7;
    ajustarTamanho(el, renderer, camera, (w, h) => {
        const meiaV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        dist = Math.max(6.2, 3.6 / (meiaV * (w / h)), 2.2 / meiaV);   // 3 times na largura e a altura do campo
    });
    const suave = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    const { primeiro } = laco(el, renderer, (dt, t) => {
        if (parado && fase !== 'parado') {   // sem animação: já mostra os times prontos
            comecar('separar', 0); fichas.forEach(f => { f.m.position.copy(f.para); f.topo.map = f.doTime[f.time]; f.topo.needsUpdate = true; });
            fase = 'parado';
        }
        if (fase === 'juntar' && t - inicio > (inicio === 0 ? 0.6 : 1.6)) comecar('separar', t);
        else if (fase === 'separar' && t - inicio > 4.2) comecar('voltar', t);
        else if (fase === 'voltar' && t - inicio > 1.6) { fase = 'juntar'; inicio = t; }

        if (fase === 'separar' || fase === 'voltar') {
            const dur = fase === 'separar' ? 1.0 : 0.8;
            fichas.forEach(f => {
                const p = Math.max(0, Math.min(1, (t - inicio - f.atraso) / dur));
                const e = suave(p);
                f.m.position.lerpVectors(f.de, f.para, e);
                f.m.position.y = 0.05 + Math.sin(Math.PI * p) * 0.9;
                f.m.rotation.x = Math.sin(Math.PI * p) * Math.PI * (fase === 'separar' ? 1 : -1);   // vira no ar
                const mapa = p > 0.5 ? (fase === 'separar' ? f.doTime[f.time] : f.neutra) : (fase === 'separar' ? f.neutra : f.doTime[f.time]);
                if (f.topo.map !== mapa) { f.topo.map = mapa; f.topo.needsUpdate = true; }
            });
        } else if (fase === 'juntar') {
            fichas.forEach((f, i) => { f.m.position.y = 0.05 + Math.max(0, Math.sin(t * 3 + i)) * 0.02; });
        }
        camera.position.set(Math.sin(t * 0.15) * 0.4, dist * 0.74, dist * 0.67);
        camera.lookAt(0, 0, 0.15);
        renderer.render(cena, camera);
    });
    primeiro();
}

(async () => {
    if (!temWebGL()) { raiz.classList.add('sem-3d'); return; }
    const THREE = await carregar();
    if (!THREE) { raiz.classList.add('sem-3d'); return; }
    try {
        await (document.fonts && document.fonts.ready);   // a letra das fichas usa a Inter
        const bola = document.getElementById('palco-bola');
        if (bola) await bolaNoGramado(bola);
        const sorteio = document.getElementById('palco-sorteio');
        if (sorteio) cenaSorteio(THREE, sorteio);
        raiz.classList.add('com-3d');
    } catch (e) {
        raiz.classList.add('sem-3d');
        if (window.Painel) Painel.ev('erro', { mensagem: 'conheca-3d: ' + (e && e.message), onde: 'conheca-3d.js' });
    }
})();
