// =====================================================================
// futebol3d.js — as animações 3D de futebol do app (Three.js, em js/vendor/)
//
//   abertura(el)        a bola cai e quica no gramado enquanto o app carrega
//   estadio(el)         fundo do login: estádio à noite, refletores e a bola rolando
//   gol(texto)          ao criar a conta: chute no ângulo, a rede balança e "GOL!"
//   sorteio(times)      as fichas dos jogadores voam para os times
//   campeao(nome)       troféu girando e papel picado no fim do campeonato
//   bolaNoGramado(el)   a bola rolando da página de apresentação (conheca.html)
//
// Tudo é opcional: sem WebGL, com "reduzir movimento" ligado ou se o Three.js não
// carregar, as funções não fazem nada (as de tela cheia resolvem na hora) e o app
// segue igual. As cenas só desenham enquanto estão na tela.
// O app (scripts comuns) usa window.Futebol3D, que fica pronto no evento "futebol3d-pronto".
// =====================================================================
const URL_THREE = new URL('./vendor/three.module.min.js', import.meta.url).href;
const parado = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let THREE = null, carregando = null;

function temWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
export function carregar() {
    if (!carregando) {
        carregando = (temWebGL() ? import(URL_THREE) : Promise.reject(new Error('sem webgl')))
            .then(m => (THREE = m))
            .catch(() => null);
    }
    return carregando;
}

// ---------------------------------------------------------------- base
function novoRenderer(el, maxDpr = 2) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    r.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(r.domElement);
    return r;
}

// laço de desenho: só roda com a cena na tela e a aba aberta
function laco(el, passo) {
    let visivel = true, ultimo = 0, t = 0, pedido = 0, vivo = true;
    const rodar = (agora) => {
        pedido = 0;
        if (!vivo || !visivel || document.hidden) return;
        const dt = Math.min(0.1, ultimo ? (agora - ultimo) / 1000 : 0.016);
        ultimo = agora; t += dt;
        passo(dt, t);
        pedido = requestAnimationFrame(rodar);
    };
    const ligar = () => { if (vivo && !pedido && visivel && !document.hidden) { ultimo = 0; pedido = requestAnimationFrame(rodar); } };
    let io = null;
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; ligar(); }, { rootMargin: '80px' }); io.observe(el); }
    document.addEventListener('visibilitychange', ligar);
    if (parado) passo(0, 2.4); else ligar();
    return {
        parar() { vivo = false; if (pedido) cancelAnimationFrame(pedido); if (io) io.disconnect(); document.removeEventListener('visibilitychange', ligar); },
        tempo: () => t
    };
}

function ajustarTamanho(el, renderer, camera, aoMudar) {
    const ajustar = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        if (aoMudar) aoMudar(w, h); else camera.updateProjectionMatrix();
    };
    ajustar();
    let ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(ajustar); ro.observe(el); } else addEventListener('resize', ajustar);
    return () => { if (ro) ro.disconnect(); else removeEventListener('resize', ajustar); };
}

function descartar(cena, renderer) {
    cena.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    renderer.domElement.remove();
}

const suave = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const saida = x => 1 - Math.pow(1 - x, 3);
const entre = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));

function canvas(w, h, desenhar) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    desenhar(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
}
function brilho(cor = 'rgba(255,255,255,1)') {
    return canvas(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, cor); gr.addColorStop(0.25, cor.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
}
function sombraTex() {
    return canvas(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
}

// ---------------------------------------------------------------- bola
// Os gomos são calculados no shader: os 12 pentágonos ficam nos vértices de um icosaedro e
// os 20 hexágonos no centro das faces; cada ponto pega a cor do centro mais próximo, e onde
// dois centros "empatam" vira costura. Fica redonda e nítida em qualquer tamanho.
let centrosBola = null;
function materialBola(borda = 0x2da762) {
    if (!centrosBola) {
        const ico = new THREE.IcosahedronGeometry(1, 0), pos = ico.attributes.position;
        const pent = [], hex = [];
        for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
            if (!pent.some(w => w.distanceTo(v) < 1e-4)) pent.push(v);
        }
        for (let i = 0; i < pos.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
            hex.push(a.add(b).add(c).normalize());
        }
        ico.dispose();
        centrosBola = { pent, hex };
    }
    return new THREE.ShaderMaterial({
        uniforms: {
            uPent: { value: centrosBola.pent }, uHex: { value: centrosBola.hex },
            uLuz: { value: new THREE.Vector3(0.45, 0.8, 0.55).normalize() },
            uBranco: { value: new THREE.Color(0xeef1f3) }, uEscuro: { value: new THREE.Color(0x1a1f22) },
            uBorda: { value: new THREE.Color(borda) }
        },
        vertexShader: `
            varying vec3 vObj; varying vec3 vN; varying vec3 vVista;
            void main() {
                vObj = normalize(position);
                vN = normalize(normalMatrix * normal);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vVista = -mv.xyz;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform vec3 uPent[12]; uniform vec3 uHex[20];
            uniform vec3 uLuz; uniform vec3 uBranco; uniform vec3 uEscuro; uniform vec3 uBorda;
            varying vec3 vObj; varying vec3 vN; varying vec3 vVista;
            void main() {
                vec3 p = normalize(vObj);
                float m1 = -2.0, m2 = -2.0; float ehPent = 0.0;
                for (int i = 0; i < 12; i++) {
                    float d = dot(p, uPent[i]) + 0.035;
                    if (d > m1) { m2 = m1; m1 = d; ehPent = 1.0; } else if (d > m2) { m2 = d; }
                }
                for (int i = 0; i < 20; i++) {
                    float d = dot(p, uHex[i]);
                    if (d > m1) { m2 = m1; m1 = d; ehPent = 0.0; } else if (d > m2) { m2 = d; }
                }
                vec3 base = mix(uBranco, uEscuro, ehPent);
                float costura = 1.0 - smoothstep(0.004, 0.012, m1 - m2);
                base = mix(base, vec3(0.13, 0.15, 0.16), costura * (1.0 - ehPent) * 0.85);
                vec3 N = normalize(vN); vec3 V = normalize(vVista); vec3 L = normalize(uLuz);
                float dif = max(dot(N, L), 0.0);
                vec3 H = normalize(L + V);
                float br = pow(max(dot(N, H), 0.0), 40.0) * (1.0 - ehPent * 0.5);
                float bo = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                vec3 cor = base * (0.28 + 0.82 * dif) + vec3(br * 0.35) + uBorda * bo * 0.35;
                gl_FragColor = vec4(cor, 1.0);
                #include <colorspace_fragment>
            }`
    });
}
function novaBola(r, borda) { return new THREE.Mesh(new THREE.SphereGeometry(r, 72, 48), materialBola(borda)); }

// gramado listrado (faixas na direção do comprimento)
function gramadoTex(faixas = 8, a = '#205538', b = '#1c4a31') {
    const t = canvas(64, 512, (g, w, h) => { for (let i = 0; i < faixas; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * h / faixas, w, h / faixas); } });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

// campo inteiro com as linhas (comprimento x = 40, largura z = 26)
function campoTex() {
    return canvas(1024, 666, (g, W, H) => {
        const f = 12;
        for (let i = 0; i < f; i++) { g.fillStyle = i % 2 ? '#1b4a30' : '#1f5536'; g.fillRect(i * W / f, 0, W / f + 1, H); }
        const m = 26, sx = (W - 2 * m) / 40, sz = (H - 2 * m) / 26, X = x => m + x * sx, Z = z => m + z * sz;
        g.strokeStyle = 'rgba(255,255,255,0.78)'; g.lineWidth = 4; g.fillStyle = 'rgba(255,255,255,0.85)';
        g.strokeRect(X(0), Z(0), 40 * sx, 26 * sz);
        g.beginPath(); g.moveTo(X(20), Z(0)); g.lineTo(X(20), Z(26)); g.stroke();
        g.beginPath(); g.ellipse(X(20), Z(13), 3.6 * sx, 3.6 * sz, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.ellipse(X(20), Z(13), 5, 5, 0, 0, Math.PI * 2); g.fill();
        for (const lado of [0, 1]) {
            const x0 = lado ? 40 - 6.5 : 0, x1 = lado ? 40 - 2.5 : 0;
            g.strokeRect(X(x0), Z(6), 6.5 * sx, 14 * sz);
            g.strokeRect(X(x1), Z(9.5), 2.5 * sx, 7 * sz);
            g.beginPath(); g.ellipse(X(lado ? 40 - 4.5 : 4.5), Z(13), 4, 4, 0, 0, Math.PI * 2); g.fill();
        }
    });
}

// trave com rede (boca virada para +x ou -x)
function trave(lado = 1) {
    const g = new THREE.Group();
    const ferro = new THREE.MeshLambertMaterial({ color: 0xf3f5f6, emissive: 0x333333 });
    const L = 5.2, A = 1.9, P = 1.5, r = 0.07;
    const poste = new THREE.CylinderGeometry(r, r, A, 12);
    for (const z of [-L / 2, L / 2]) { const m = new THREE.Mesh(poste, ferro); m.position.set(0, A / 2, z); g.add(m); }
    const trav = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 12), ferro); trav.rotation.x = Math.PI / 2; trav.position.y = A; g.add(trav);
    // rede: grade de linhas que pode "estufar" (gol)
    const nx = 14, ny = 6, pts = [];
    const ponto = (u, v) => new THREE.Vector3(lado * P * Math.min(1, 0.35 + v), A * (1 - v * 0.15) * (1 - Math.max(0, v - 0.6)), (u - 0.5) * L);
    for (let i = 0; i <= nx; i++) for (let j = 0; j < ny; j++) { pts.push(ponto(i / nx, j / ny), ponto(i / nx, (j + 1) / ny)); }
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) { pts.push(ponto(i / nx, j / ny), ponto((i + 1) / nx, j / ny)); }
    // fundo da rede até o chão
    for (let i = 0; i <= nx; i++) { const u = i / nx; pts.push(new THREE.Vector3(lado * P, A * 0.85 * 0.6, (u - 0.5) * L), new THREE.Vector3(lado * P, 0, (u - 0.5) * L)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const rede = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }));
    g.add(rede);
    g.userData = { rede, base: Float32Array.from(geo.attributes.position.array), L, A, P, lado };
    return g;
}
// estufa a rede no ponto (z, y) com força 0..1
function estufar(tr, z, y, forca) {
    const { rede, base, lado } = tr.userData;
    const arr = rede.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
        const d = Math.hypot(base[i + 2] - z, base[i + 1] - y);
        const k = Math.max(0, 1 - d / 2.2) * forca;
        arr[i] = base[i] + lado * k * 0.9;
        arr[i + 1] = base[i + 1]; arr[i + 2] = base[i + 2];
    }
    rede.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- 1) abertura
// a bola cai, quica duas vezes e para; resolve quando terminou (~1,4 s)
export async function abertura(el) {
    if (parado || !el || !(await carregar())) return;
    const renderer = novoRenderer(el);
    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const desliga = ajustarTamanho(el, renderer, camera);
    cena.add(new THREE.HemisphereLight(0xcfe9d8, 0x0f1214, 1));
    const sol = new THREE.DirectionalLight(0xffffff, 1.3); sol.position.set(2, 5, 4); cena.add(sol);
    const chao = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshBasicMaterial({ map: brilho('rgba(45,167,98,0.5)'), transparent: true, depthWrite: false }));
    chao.rotation.x = -Math.PI / 2; cena.add(chao);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: sombraTex(), transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.01; cena.add(sombra);
    const R = 0.5, bola = novaBola(R); cena.add(bola);
    camera.position.set(0, 1.1, 4.4); camera.lookAt(0, 0.55, 0);
    // queda com quiques (alturas 1, 0,35, 0,1)
    const altura = (t) => {
        const fases = [[0, 0.42, 2.6, 0], [0.42, 0.78, 0, 0.9], [0.78, 1.0, 0, 0.32], [1.0, 1.12, 0, 0.1]];
        for (const [a, b, h0, pico] of fases) if (t < b) {
            const p = (t - a) / (b - a);
            return a === 0 ? h0 * (1 - p * p) : 4 * pico * p * (1 - p);
        }
        return 0;
    };
    return new Promise((ok) => {
        const fim = 1.45;
        const l = laco(el, (dt, t) => {
            const y = altura(t);
            bola.position.y = R + y;
            const amassa = y < 0.02 && t < 1.12 ? 0.9 : 1;   // achata no quique
            bola.scale.set(1 / Math.sqrt(amassa), amassa, 1 / Math.sqrt(amassa));
            bola.rotation.z -= dt * 2.4; bola.rotation.x += dt * 1.2;
            sombra.scale.setScalar(Math.max(0.35, 1 - y * 0.3));
            sombra.material.opacity = Math.max(0.25, 1 - y * 0.35);
            chao.material.opacity = Math.min(1, t * 2);
            renderer.render(cena, camera);
            if (t > fim) { l.parar(); ok(); }
        });
        el.__parar3d = () => { l.parar(); desliga(); descartar(cena, renderer); };
    });
}

// ---------------------------------------------------------------- 2) estádio (login)
// devolve { parar } ; a câmera dá a volta devagar e o campo fica na parte de cima no celular
export async function estadio(el) {
    if (!el || !(await carregar())) return null;
    const renderer = novoRenderer(el, 1.5);
    const cena = new THREE.Scene();
    cena.fog = new THREE.Fog(0x0b0f12, 26, 70);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
    let alto = true;
    const desliga = ajustarTamanho(el, renderer, camera, (w, h) => {
        alto = h > w * 1.05;
        // celular em pé: o campo aparece no alto (o cartão do login fica embaixo); a lente abre
        // na mesma proporção para o recorte não "dar zoom"
        camera.fov = alto ? 64 : 40;
        if (alto) camera.setViewOffset(w, h * 1.8, 0, h * 0.66, w, h); else camera.clearViewOffset();
        camera.updateProjectionMatrix();
    });

    cena.add(new THREE.HemisphereLight(0xbfd8ff, 0x0b120d, 0.55));
    const luzA = new THREE.DirectionalLight(0xffffff, 1.0); luzA.position.set(-18, 22, 14); cena.add(luzA);
    const luzB = new THREE.DirectionalLight(0xdfefff, 0.7); luzB.position.set(18, 22, -14); cena.add(luzB);

    // gramado em volta + campo com linhas
    const fora = gramadoTex(10, '#163d27', '#143723'); fora.repeat.set(6, 4);
    const chaoFora = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshLambertMaterial({ map: fora }));
    chaoFora.rotation.x = -Math.PI / 2; chaoFora.position.y = -0.02; cena.add(chaoFora);
    const campo = new THREE.Mesh(new THREE.PlaneGeometry(42.2, 28.2), new THREE.MeshLambertMaterial({ map: campoTex() }));
    campo.rotation.x = -Math.PI / 2; cena.add(campo);

    // traves nas duas pontas (boca para dentro do campo)
    const tEsq = trave(-1); tEsq.position.x = -20; cena.add(tEsq);
    const tDir = trave(1); tDir.position.x = 20; cena.add(tDir);

    // refletores: torre + luzes que brilham + cone de luz bem fraco
    const glow = brilho('rgba(255,255,240,1)');
    const torreMat = new THREE.MeshLambertMaterial({ color: 0x2a3136 });
    for (const [x, z] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) {
        const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 22, 8), torreMat);
        torre.position.set(x, 11, z); cena.add(torre);
        const painel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
        painel.position.set(x * 0.98, 22.4, z * 0.98); painel.lookAt(0, 0, 0); cena.add(painel);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff6d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.set(16, 16, 1); s.position.copy(painel.position); cena.add(s);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 24, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        cone.position.set(x * 0.6, 11, z * 0.6); cone.lookAt(x, 30, z); cone.rotateX(Math.PI / 2); cena.add(cone);
    }

    // bola rolando pelo campo (um oito) com sombra
    const R = 0.42, bola = novaBola(R); cena.add(bola);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: sombraTex(), transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.02; cena.add(sombra);
    const antes = new THREE.Vector3(), eixo = new THREE.Vector3(), cima = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();

    const l = laco(el, (dt, t) => {
        const s = t * 0.22;
        const x = Math.sin(s) * 13, z = Math.sin(s * 2) * 6;
        antes.copy(bola.position);
        bola.position.set(x, R, z);
        const mov = bola.position.clone().sub(antes); mov.y = 0;
        const d = mov.length();
        if (d > 1e-5) { eixo.crossVectors(cima, mov).normalize(); q.setFromAxisAngle(eixo, d / R); bola.quaternion.premultiply(q); }
        sombra.position.set(x, 0.02, z);
        const a = t * 0.05 + 0.6, raio = alto ? 36 : 36;
        camera.position.set(Math.sin(a) * raio, alto ? 21 : 14, Math.cos(a) * raio);
        camera.lookAt(0, 0, 0);
        renderer.render(cena, camera);
    });
    return { parar() { l.parar(); desliga(); descartar(cena, renderer); } };
}

// ---------------------------------------------------------------- telas cheias
function camadaCheia(classe, html) {
    const el = document.createElement('div');
    el.className = 'f3d-camada ' + classe;
    el.innerHTML = `<div class="f3d-palco"></div>${html || ''}`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('f3d-entrou'));
    return el;
}
function fecharCamada(el) {
    el.classList.remove('f3d-entrou'); el.classList.add('f3d-saindo');
    setTimeout(() => { if (el.__parar3d) el.__parar3d(); el.remove(); }, 320);
}

// ---------------------------------------------------------------- 3) gol (conta criada)
export async function gol(texto = 'Bem-vindo ao time!') {
    if (parado || !(await carregar())) return;
    const tela = camadaCheia('f3d-gol', `<div class="f3d-texto"><b>GOL!</b><span></span></div><button type="button" class="f3d-pular">Pular</button>`);
    tela.querySelector('.f3d-texto span').textContent = texto;
    const el = tela.querySelector('.f3d-palco');
    const renderer = novoRenderer(el, 1.75);
    const cena = new THREE.Scene();
    cena.fog = new THREE.Fog(0x0b0f12, 18, 50);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    const desliga = ajustarTamanho(el, renderer, camera);
    cena.add(new THREE.HemisphereLight(0xcfe3ff, 0x0b120d, 0.8));
    const sol = new THREE.DirectionalLight(0xffffff, 1.2); sol.position.set(4, 12, 8); cena.add(sol);
    const grama = gramadoTex(10); grama.repeat.set(3, 3);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ map: grama }));
    chao.rotation.x = -Math.PI / 2; cena.add(chao);
    // trave de frente para a câmera
    const tr = trave(-1); tr.rotation.y = Math.PI / 2; tr.position.set(0, 0, -9); cena.add(tr);
    const R = 0.22, bola = novaBola(R); cena.add(bola);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: sombraTex(), transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.01; cena.add(sombra);
    // papel picado verde e ouro
    const N = 160, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    const cores = [0x2da762, 0xe3b341, 0xeef1f3], m4 = new THREE.Matrix4(), dados = [];
    for (let i = 0; i < N; i++) {
        conf.setColorAt(i, new THREE.Color(cores[i % 3]));
        dados.push({ p: new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 3, -8 + Math.random() * 3), v: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 4, 2 + Math.random() * 3), r: Math.random() * 6 });
    }
    conf.visible = false; cena.add(conf);
    const de = new THREE.Vector3(0.6, R, 2.2), angulo = new THREE.Vector3(1.9, 1.6, -9.4);   // no ângulo
    const pular = () => { l.parar(); fecharCamada(tela); };
    tela.querySelector('.f3d-pular').addEventListener('click', pular);
    tela.addEventListener('click', (e) => { if (e.target === tela || e.target.closest('.f3d-palco')) pular(); });
    let acabou = null;
    const pronto = new Promise(ok => (acabou = ok));
    const l = laco(el, (dt, t) => {
        // 0–0,5 s: câmera chega; 0,5–1,15 s: chute; depois rede estufa, texto e papel picado
        const chute = entre(0.5, 1.15, t);
        const p = saida(chute);
        bola.position.lerpVectors(de, angulo, p);
        bola.position.y = R + (angulo.y - R) * p + Math.sin(Math.PI * p) * 0.9;
        bola.rotation.x -= dt * 14 * (chute > 0 && chute < 1 ? 1 : 0.1);
        sombra.position.set(bola.position.x, 0.01, bola.position.z);
        sombra.material.opacity = Math.max(0, 1 - (bola.position.y - R) * 0.5);
        if (chute >= 1) {
            const k = entre(1.15, 1.5, t), volta = entre(1.5, 2.6, t);
            estufar(tr, angulo.x, angulo.y, Math.sin(Math.PI * Math.min(1, k + volta * 0.5)) * (1 - volta * 0.6));
            bola.position.z = angulo.z - Math.sin(Math.PI * k) * 0.6;
            if (!tela.classList.contains('f3d-marcou')) { tela.classList.add('f3d-marcou'); conf.visible = true; if (navigator.vibrate) try { navigator.vibrate([40, 30, 80]); } catch (e) { /* ok */ } }
        }
        if (conf.visible) {
            dados.forEach((d, i) => {
                d.v.y -= 6 * dt; d.v.multiplyScalar(0.985); d.p.addScaledVector(d.v, dt); d.r += dt * 6;
                m4.makeRotationFromEuler(new THREE.Euler(d.r, d.r * 0.7, 0)).setPosition(d.p);
                conf.setMatrixAt(i, m4);
            });
            conf.instanceMatrix.needsUpdate = true;
        }
        const c = saida(entre(0, 0.6, t));
        camera.position.set(1.4 - c * 0.8, 1.1 + c * 0.3, 5.6 - c * 0.9);
        camera.lookAt(0.6, 1.0, -6);
        renderer.render(cena, camera);
        if (t > 3.4) { pular(); acabou(); }
    });
    tela.__parar3d = () => { l.parar(); desliga(); descartar(cena, renderer); acabou(); };
    return pronto;
}

// ---------------------------------------------------------------- 4) sorteio
// times: [{ nome, jogadores: ['Ana', ...] }]; resolve quando as fichas chegaram (~1,5 s)
export const CORES_TIMES = ['#2da762', '#e3b341', '#4f8fe0', '#ef6b6b', '#a66be0', '#e08a3c', '#3cc4c4', '#c9cfd3'];
function fichaTex(letra, fundo, tinta) {
    const t = canvas(128, 128, (g) => {
        g.fillStyle = fundo; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
        g.fillStyle = tinta; g.font = '700 60px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letra, 64, 68);
    });
    t.center.set(0.5, 0.5); t.rotation = Math.PI / 2;
    return t;
}
export async function sorteio(times) {
    if (parado || !times || !times.length || !(await carregar())) return;
    const tela = camadaCheia('f3d-sorteio', `<div class="f3d-texto f3d-texto-alto"><span>Sorteando os times…</span></div>`);
    const el = tela.querySelector('.f3d-palco');
    const renderer = novoRenderer(el, 1.75);
    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const n = times.length, maxPorTime = Math.max(...times.map(t => t.jogadores.length), 1);
    const esp = 0.78, largura = n * 1.15 + 1, profundidade = maxPorTime * esp + 1;
    const desliga = ajustarTamanho(el, renderer, camera, (w, h) => {
        const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const dist = Math.max(largura / 2 / (tv * (w / h)), profundidade / 2 / tv) * 1.12 + 1;
        camera.position.set(0, dist * 0.82, dist * 0.58); camera.lookAt(0, 0, 0.2);
        camera.updateProjectionMatrix();
    });
    cena.add(new THREE.HemisphereLight(0xffffff, 0x223322, 1.1));
    const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(2, 8, 5); cena.add(sol);
    const geo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 40);
    const lado = new THREE.MeshLambertMaterial({ color: 0xc9d0d5 });
    const fichas = [];
    times.forEach((t, k) => t.jogadores.forEach((nome, j) => {
        const letra = (String(nome || '?').trim()[0] || '?').toUpperCase();
        const neutra = fichaTex(letra, '#e8ecef', '#1a1f22'), cor = fichaTex(letra, CORES_TIMES[k % CORES_TIMES.length], '#0f1214');
        const topo = new THREE.MeshLambertMaterial({ map: neutra });
        const m = new THREE.Mesh(geo, [lado, topo, lado]); cena.add(m);
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.min(1.6, 0.25 * Math.sqrt(fichas.length + 1) + 0.3);
        const de = new THREE.Vector3(Math.cos(a) * r, 0.05 + Math.random() * 0.3, Math.sin(a) * r * 0.7);
        const para = new THREE.Vector3((k - (n - 1) / 2) * 1.15, 0.05, -((maxPorTime - 1) * esp) / 2 + j * esp);
        m.position.copy(de);
        fichas.push({ m, topo, neutra, cor, de, para, atraso: 0.25 + (j * n + k) * Math.min(0.05, 0.9 / (times.reduce((s, x) => s + x.jogadores.length, 0) || 1)) });
    }));
    let acabou = null;
    const pronto = new Promise(ok => (acabou = ok));
    const fechar = () => { l.parar(); fecharCamada(tela); acabou(); };
    tela.addEventListener('click', fechar);
    const l = laco(el, (dt, t) => {
        let ultimoP = 1;
        fichas.forEach((f, i) => {
            const p = entre(f.atraso, f.atraso + 0.6, t), e = suave(p);
            f.m.position.lerpVectors(f.de, f.para, e);
            f.m.position.y = 0.05 + Math.sin(Math.PI * p) * 0.9 + (p === 0 ? Math.abs(Math.sin(t * 9 + i)) * 0.12 : 0);
            f.m.rotation.x = Math.sin(Math.PI * p) * Math.PI;
            const mapa = p > 0.5 ? f.cor : f.neutra;
            if (f.topo.map !== mapa) { f.topo.map = mapa; f.topo.needsUpdate = true; }
            ultimoP = Math.min(ultimoP, p);
        });
        renderer.render(cena, camera);
        if (ultimoP >= 1 && !tela.__fim) tela.__fim = t;
        if (tela.__fim && t - tela.__fim > 0.35) fechar();
    });
    tela.__parar3d = () => { l.parar(); desliga(); descartar(cena, renderer); };
    return pronto;
}

// ---------------------------------------------------------------- 5) campeão
export async function campeao(nome, sub) {
    if (parado || !(await carregar())) return;
    const tela = camadaCheia('f3d-campeao', `<div class="f3d-texto"><small>CAMPEÃO</small><b></b><span></span></div><button type="button" class="f3d-pular">Fechar</button>`);
    tela.querySelector('.f3d-texto b').textContent = nome || 'Campeão';
    tela.querySelector('.f3d-texto span').textContent = sub || '';
    const el = tela.querySelector('.f3d-palco');
    const renderer = novoRenderer(el, 1.75);
    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const desliga = ajustarTamanho(el, renderer, camera);
    cena.add(new THREE.HemisphereLight(0xfff4d6, 0x101418, 0.7));
    const k1 = new THREE.DirectionalLight(0xffffff, 2.2); k1.position.set(3, 5, 4); cena.add(k1);
    const k2 = new THREE.DirectionalLight(0xfff0c0, 1.2); k2.position.set(-4, 2, -3); cena.add(k2);
    const k3 = new THREE.PointLight(0x2da762, 6, 10); k3.position.set(0, 1, 2.5); cena.add(k3);
    // taça: perfil girado (LatheGeometry) + alças + base escura
    const ouro = new THREE.MeshStandardMaterial({ color: 0xe3b341, metalness: 0.85, roughness: 0.28 });
    const perfil = [[0, 0], [0.62, 0], [0.62, 0.12], [0.42, 0.18], [0.18, 0.3], [0.12, 0.62], [0.14, 0.8], [0.32, 0.92], [0.55, 1.15], [0.68, 1.5], [0.72, 1.86], [0.66, 1.88], [0.6, 1.55], [0.48, 1.2], [0, 1.05]]
        .map(([x, y]) => new THREE.Vector2(x, y));
    const taca = new THREE.Group();
    taca.add(new THREE.Mesh(new THREE.LatheGeometry(perfil, 64), ouro));
    for (const s of [-1, 1]) {
        const alca = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 12, 32, Math.PI * 1.25), ouro);
        alca.position.set(s * 0.72, 1.42, 0); alca.rotation.z = s > 0 ? -Math.PI * 0.62 : Math.PI * 0.38 + Math.PI; taca.add(alca);
    }
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.32, 48), new THREE.MeshStandardMaterial({ color: 0x1e2326, metalness: 0.3, roughness: 0.6 }));
    pedestal.position.y = -0.16; taca.add(pedestal);
    taca.position.y = -0.95; cena.add(taca);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: brilho('rgba(227,179,65,1)'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.set(5, 5, 1); aura.position.set(0, 0.2, -1); cena.add(aura);
    // papel picado caindo sem parar
    const N = 220, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    const cores = [0x2da762, 0xe3b341, 0xeef1f3], m4 = new THREE.Matrix4(), e3 = new THREE.Euler(), d = [];
    for (let i = 0; i < N; i++) { conf.setColorAt(i, new THREE.Color(cores[i % 3])); d.push({ x: (Math.random() - 0.5) * 6, y: Math.random() * 6, z: (Math.random() - 0.5) * 3, v: 0.6 + Math.random() * 0.8, r: Math.random() * 6, w: (Math.random() - 0.5) * 2 }); }
    cena.add(conf);
    camera.position.set(0, 0.2, 6.8); camera.lookAt(0, -0.55, 0);
    let acabou = null;
    const pronto = new Promise(ok => (acabou = ok));
    const fechar = () => { l.parar(); fecharCamada(tela); acabou(); };
    tela.querySelector('.f3d-pular').addEventListener('click', fechar);
    tela.addEventListener('click', (e) => { if (!e.target.closest('.f3d-pular')) fechar(); });
    if (navigator.vibrate) try { navigator.vibrate([60, 40, 60, 40, 120]); } catch (e) { /* ok */ }
    const l = laco(el, (dt, t) => {
        const entra = saida(entre(0, 0.9, t));
        taca.rotation.y = t * 0.9;
        taca.scale.setScalar(0.4 + entra * 0.6);
        taca.position.y = -0.95 - (1 - entra) * 0.8 + Math.sin(t * 1.6) * 0.04;
        aura.material.opacity = 0.35 + Math.sin(t * 2) * 0.12;
        d.forEach((p, i) => {
            p.y -= p.v * dt; p.r += dt * 4; p.x += Math.sin(t + i) * dt * 0.2 * p.w;
            if (p.y < -2.5) { p.y = 3.5; p.x = (Math.random() - 0.5) * 6; }
            e3.set(p.r, p.r * 0.6, p.w); m4.makeRotationFromEuler(e3).setPosition(p.x, p.y, p.z);
            conf.setMatrixAt(i, m4);
        });
        conf.instanceMatrix.needsUpdate = true;
        renderer.render(cena, camera);
        if (t > 6) fechar();
    });
    tela.__parar3d = () => { l.parar(); desliga(); descartar(cena, renderer); };
    return pronto;
}

// ---------------------------------------------------------------- 6) bola no gramado (conheca.html)
export async function bolaNoGramado(el) {
    if (!el || !(await carregar())) return false;
    const renderer = novoRenderer(el);
    const cena = new THREE.Scene();
    cena.fog = new THREE.Fog(0x0f1214, 5.5, 13);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    let largo = false;
    ajustarTamanho(el, renderer, camera, (w) => { largo = w > 560; camera.updateProjectionMatrix(); });
    cena.add(new THREE.HemisphereLight(0xcfe9d8, 0x0f1214, 0.9));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(3, 6, 4); cena.add(sol);
    const grama = gramadoTex(), TAM = 30, REP = 6;
    grama.repeat.set(1, REP);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(TAM, TAM), new THREE.MeshLambertMaterial({ map: grama }));
    chao.rotation.x = -Math.PI / 2; chao.position.z = -6; cena.add(chao);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: sombraTex(), transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.01; cena.add(sombra);
    const R = 0.55, giro = new THREE.Group(); giro.position.y = R; cena.add(giro);
    const bola = novaBola(R); giro.add(bola);
    let mx = 0, my = 0, ax = 0, ay = 0;
    addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        mx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        my = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    }, { passive: true });
    const VEL = 1.15, alvo = new THREE.Vector3(0, 0.55, 0);
    laco(el, (dt, t) => {
        ax += (mx - ax) * Math.min(1, dt * 3); ay += (my - ay) * Math.min(1, dt * 3);
        bola.rotation.x += (VEL / R) * dt;
        grama.offset.y -= VEL * dt * REP / TAM;
        giro.rotation.y = ax * 0.6;
        giro.position.y = R + Math.abs(Math.sin(t * 2.2)) * 0.035;
        sombra.scale.setScalar(1 - (giro.position.y - R) * 2.2);
        camera.position.set(ax * 0.5, 1.15 - ay * 0.18, largo ? 4.2 : 4.6);
        camera.lookAt(alvo);
        renderer.render(cena, camera);
    });
    return true;
}

// ---------------------------------------------------------------- para o app (scripts comuns)
window.Futebol3D = { carregar, abertura, estadio, gol, sorteio, campeao, bolaNoGramado, parado };
window.dispatchEvent(new Event('futebol3d-pronto'));

// abertura do app: a bola cai e quica enquanto o login é conferido
(() => {
    const sp = document.getElementById('splash'), palco = document.getElementById('splash-3d');
    if (!sp || !palco || parado) return;
    carregar().then((ok) => {
        if (!ok || !document.getElementById('splash') || sp.classList.contains('saindo')) return;
        sp.classList.add('com-3d');
        window.__abertura3d = abertura(palco).catch(() => {});
    });
})();
