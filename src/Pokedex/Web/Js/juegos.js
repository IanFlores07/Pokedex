// =========================================================================
// MOTOR DE MINIJUEGOS POKÉMON
// Una sola página (juego.html?modo=...) para todos los modos.
// Usa los nombres/tipos de datos.js y la PokéAPI para el resto de datos.
// Las rachas se guardan por modo Y por dificultad: al cambiar de dificultad
// se ve la racha de esa dificultad, y al volver a la anterior continúa donde estaba.
// =========================================================================

const RANGOS = [
    { start: 1,   gen: 1, region: "Kanto" },
    { start: 152, gen: 2, region: "Johto" },
    { start: 252, gen: 3, region: "Hoenn" },
    { start: 387, gen: 4, region: "Sinnoh" },
    { start: 494, gen: 5, region: "Teselia" },
    { start: 650, gen: 6, region: "Kalos" },
    { start: 722, gen: 7, region: "Alola" },
    { start: 810, gen: 8, region: "Galar" },
    { start: 906, gen: 9, region: "Paldea" }
];

const TIPOS_ES = ["Normal", "Fuego", "Agua", "Eléctrico", "Planta", "Hielo", "Lucha", "Veneno", "Tierra",
                  "Volador", "Psíquico", "Bicho", "Roca", "Fantasma", "Dragón", "Siniestro", "Acero", "Hada"];

const COLORES_TIPO = {
    normal: "#a8a77a", fuego: "#ee8130", agua: "#6390f0", electrico: "#d4a900", planta: "#7ac74c",
    hielo: "#74c4c0", lucha: "#c22e28", veneno: "#a33ea1", tierra: "#c9a23f", volador: "#a98ff3",
    psiquico: "#f95587", bicho: "#a6b91a", roca: "#b6a136", fantasma: "#735797", dragon: "#6f35fc",
    siniestro: "#705746", acero: "#8e8ea8", hada: "#d685ad"
};

// ---------- utilidades ----------
const $ = (id) => document.getElementById(id);
const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const pad3 = (n) => String(n).padStart(3, "0");
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nombreTipo = (t) => TIPOS_ES.find(x => norm(x) === norm(t)) || t;
const colorTipo = (t) => COLORES_TIPO[norm(t)] || "#888";
const artwork = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

function leerStr(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function guardarStr(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function leerNum(k) { return parseInt(leerStr(k) || "0", 10) || 0; }

// ---------- datos ----------
let pokedexPlano = [];

function construirLista() {
    pokedexPlano = [];
    RANGOS.forEach((r) => {
        const d = typeof pokedexData !== "undefined" ? pokedexData[r.gen] : null;
        if (!d || !d.nombres) return;
        d.nombres.forEach((nombre, i) => {
            const id = r.start + i;
            if (id > 1025) return;
            // OJO: los tipos de datos.js están desalineados en varias generaciones,
            // así que se piden a la PokéAPI cuando hacen falta (ver cargarTipos).
            pokedexPlano.push({ id, nombre, gen: r.gen, region: r.region, tipos: [], tiposCargados: false });
        });
    });
}

const cachePoke = {};
const cacheEsp = {};
function getPoke(id) {
    if (!cachePoke[id]) {
        cachePoke[id] = fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(r => {
            if (!r.ok) throw new Error("pokemon " + id);
            return r.json();
        });
        cachePoke[id].catch(() => { delete cachePoke[id]; });
    }
    return cachePoke[id];
}
function getEsp(id) {
    if (!cacheEsp[id]) {
        cacheEsp[id] = fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`).then(r => {
            if (!r.ok) throw new Error("especie " + id);
            return r.json();
        });
        cacheEsp[id].catch(() => { delete cacheEsp[id]; });
    }
    return cacheEsp[id];
}

const TIPOS_EN_ES = {
    normal: "Normal", fire: "Fuego", water: "Agua", electric: "Eléctrico", grass: "Planta", ice: "Hielo",
    fighting: "Lucha", poison: "Veneno", ground: "Tierra", flying: "Volador", psychic: "Psíquico", bug: "Bicho",
    rock: "Roca", ghost: "Fantasma", dragon: "Dragón", dark: "Siniestro", steel: "Acero", fairy: "Hada"
};

// Rellena obj.tipos (en español, en orden de hueco) con los datos reales de la PokéAPI
async function cargarTipos(obj) {
    if (obj.tiposCargados) return obj.tipos;
    const p = await getPoke(obj.id);
    obj.tipos = p.types.slice().sort((a, b) => a.slot - b.slot).map(t => TIPOS_EN_ES[t.type.name] || t.type.name);
    obj.tiposCargados = true;
    return obj.tipos;
}

// Precarga una imagen: así nunca se ve a medio cargar (ni un destello de color en la silueta)
function precargar(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const t = setTimeout(() => reject(new Error("timeout imagen")), 9000);
        img.onload = () => { clearTimeout(t); resolve(url); };
        img.onerror = () => { clearTimeout(t); reject(new Error("imagen")); };
        img.src = url;
    });
}

// ---------- estado ----------
const params = new URLSearchParams(location.search);
let modoId = params.get("modo") || "clasico";
let dificultad = "facil";
let infinito = { vidas: 3, score: 0, gameOver: false };
const ronda = { cargando: false, finalizada: true, intentos: 0, probados: new Set(), cfg: null, modo: null, objetivo: null, zona: null };

const vidasIniciales = () => (dificultad === "facil" ? 3 : 1);
const claveRacha = () => `racha_${modoId}_${dificultad}`;
const claveMejor = () => `mejor_${modoId}_${dificultad}`;
const rachaActual = () => (modoId === "infinito" ? infinito.score : leerNum(claveRacha()));

function setRacha(v) {
    if (modoId === "infinito") infinito.score = v;
    else guardarStr(claveRacha(), v);
    if (v > leerNum(claveMejor())) guardarStr(claveMejor(), v);
    pintarMarcador();
}
function pintarMarcador() {
    $("racha").textContent = rachaActual();
    $("mejor-racha").textContent = leerNum(claveMejor());
    $("vidas").textContent = infinito.vidas;
}

// =========================================================================
// MODOS
// Cada modo define: titulo, dificultades{facil,dificil}, iniciar(r)
// y opcionalmente: alIntentar(r, intento, acierto), revelar(r, acierto),
// sinInput (usa su propia interfaz), pistas (muestra ¿GENERACIÓN? ¿TIPO? ¿INICIAL?)
// =========================================================================

function mostrarRevelado(r, extraHtml) {
    r.zona.innerHTML = `
        <div class="revelado-box"><img src="${artwork(r.objetivo.id)}" alt="${r.objetivo.nombre}"></div>
        ${extraHtml || ""}`;
}

const modos = {};

// ---------- CLÁSICO (estilo "Pokédle": compara atributos) ----------
modos.clasico = {
    titulo: "CLÁSICO",
    dificultades: { facil: { intentos: 10, sugerencias: true }, dificil: { intentos: 6, sugerencias: false } },
    async iniciar(r) {
        const p = await getPoke(r.objetivo.id);
        await cargarTipos(r.objetivo);
        r.t = { gen: r.objetivo.gen, tipos: r.objetivo.tipos.map(norm), altura: p.height / 10, peso: p.weight / 10 };
        r.zona.innerHTML = `
            <p class="ayuda-modo">Adivina el Pokémon comparando pistas con tus intentos.<br>
            <span class="leyenda ok">IGUAL</span> <span class="leyenda parcial">EN OTRO HUECO</span> <span class="leyenda mal">NO</span> · ▲ = más alto/alto · ▼ = menos</p>
            <div class="tabla-scroll"><table class="clasico-tabla">
                <thead><tr><th>POKÉMON</th><th>GEN</th><th>TIPO 1</th><th>TIPO 2</th><th>ALTURA</th><th>PESO</th></tr></thead>
                <tbody id="clasico-body"></tbody>
            </table></div>`;
    },
    async alIntentar(r, intento) {
        let datos = null;
        try { datos = await getPoke(intento.id); await cargarTipos(intento); } catch (e) {}
        const g = { altura: datos ? datos.height / 10 : null, peso: datos ? datos.weight / 10 : null };

        const celdaNum = (guess, objetivo, fmt) => {
            if (guess === null) return `<td class="mal">?</td>`;
            if (guess === objetivo) return `<td class="ok">${fmt(guess)}</td>`;
            return `<td class="mal">${fmt(guess)} ${objetivo > guess ? "▲" : "▼"}</td>`;
        };
        const celdaTipo = (idx) => {
            const gt = intento.tipos[idx] ? norm(intento.tipos[idx]) : null;
            const ot = r.t.tipos[idx] || null;
            const etiqueta = gt ? nombreTipo(intento.tipos[idx]) : "—";
            if (gt === ot) return `<td class="ok">${etiqueta}</td>`;
            if (gt && r.t.tipos.includes(gt)) return `<td class="parcial">${etiqueta}</td>`;
            return `<td class="mal">${etiqueta}</td>`;
        };
        const genCelda = intento.gen === r.t.gen
            ? `<td class="ok">${intento.gen}</td>`
            : `<td class="mal">${intento.gen} ${r.t.gen > intento.gen ? "▲" : "▼"}</td>`;
        const icono = datos && datos.sprites && datos.sprites.front_default
            ? `<img src="${datos.sprites.front_default}" alt="" class="mini-sprite">` : "";

        const fila = document.createElement("tr");
        fila.innerHTML = `<td class="celda-nombre">${icono}<span>${intento.nombre}</span></td>${genCelda}${celdaTipo(0)}${celdaTipo(1)}
            ${celdaNum(g.altura, r.t.altura, v => v + " m")}${celdaNum(g.peso, r.t.peso, v => v + " kg")}`;
        const cuerpo = $("clasico-body");
        cuerpo.insertBefore(fila, cuerpo.firstChild);
    },
    revelar(r) {
        r.zona.insertAdjacentHTML("afterbegin",
            `<div class="revelado-box pequeno"><img src="${artwork(r.objetivo.id)}" alt="${r.objetivo.nombre}"></div>`);
    }
};

// ---------- SILUETA ----------
modos.silueta = {
    titulo: "SILUETA",
    pistas: true,
    dificultades: { facil: { intentos: 3, sugerencias: true }, dificil: { intentos: 1, sugerencias: false } },
    async iniciar(r) {
        const url = artwork(r.objetivo.id);
        await precargar(url); // la imagen ya está cargada antes de enseñarla: no hay destello de color
        r.zona.innerHTML = `<div class="silueta-box" id="silueta-box"><img src="${url}" alt="¿Quién es ese Pokémon?"></div>`;
    },
    revelar() {
        const b = $("silueta-box");
        if (b) b.classList.add("revelada");
    }
};

// ---------- DESCRIPCIÓN ----------
modos.descripcion = {
    titulo: "DESCRIPCIÓN",
    dificultades: {
        facil: { intentos: 4, sugerencias: true, pistasExtra: true },
        dificil: { intentos: 2, sugerencias: false, pistasExtra: false }
    },
    async iniciar(r) {
        const esp = await getEsp(r.objetivo.id);
        await cargarTipos(r.objetivo);
        const entradas = esp.flavor_text_entries.filter(e => e.language.name === "es");
        if (!entradas.length) throw new Error("sin descripción en español");
        let texto = azar(entradas).flavor_text.replace(/[\n\f\r]+/g, " ").replace(/\s+/g, " ").trim();

        const nombres = new Set([r.objetivo.nombre]);
        esp.names.forEach(n => { if (n.language.name === "es" || n.language.name === "en") nombres.add(n.name); });
        nombres.forEach(n => { texto = texto.replace(new RegExp(escaparRegex(n), "gi"), "▮▮▮▮"); });

        const genus = (esp.genera.find(g => g.language.name === "es") || {}).genus;
        r.extras = [];
        if (genus) r.extras.push(`Categoría: ${genus}`);
        r.extras.push(`Tipo: ${r.objetivo.tipos.map(nombreTipo).join(" / ")}`);
        r.extras.push(`Generación ${r.objetivo.gen} (${r.objetivo.region})`);
        r.extraIdx = 0;

        r.zona.innerHTML = `<div class="desc-card"><p>“${texto}”</p><div id="desc-extras" class="desc-extras"></div></div>`;
    },
    alIntentar(r, intento, acierto) {
        if (!acierto && r.cfg.pistasExtra && r.extraIdx < r.extras.length) {
            const d = document.createElement("div");
            d.textContent = "💡 " + r.extras[r.extraIdx++];
            $("desc-extras").appendChild(d);
        }
    }
};

// ---------- ZOOM ----------
modos.zoom = {
    titulo: "ZOOM",
    niveles: { facil: [6, 4, 2.6, 1.7, 1.15], dificil: [9, 5, 2.5] },
    dificultades: { facil: { intentos: 5, sugerencias: true }, dificil: { intentos: 3, sugerencias: false } },
    aplicar(r) {
        const z = modos.zoom.niveles[dificultad][Math.min(r.nivel, modos.zoom.niveles[dificultad].length - 1)];
        const b = $("zoom-box");
        if (!b) return;
        b.style.backgroundSize = `${z * 100}%`;
        b.style.backgroundPosition = `${r.px}% ${r.py}%`;
    },
    async iniciar(r) {
        const url = artwork(r.objetivo.id);
        await precargar(url);
        r.px = 35 + Math.random() * 30;
        r.py = 35 + Math.random() * 30;
        r.nivel = 0;
        r.zona.innerHTML = `<div class="zoom-box" id="zoom-box" style="background-image:url('${url}')"></div>`;
        modos.zoom.aplicar(r);
    },
    alIntentar(r, intento, acierto) {
        if (!acierto) { r.nivel++; modos.zoom.aplicar(r); }
    }
};

// ---------- CARD (carta con datos que se van desvelando) ----------
modos.card = {
    titulo: "CARD",
    dificultades: { facil: { intentos: 6, sugerencias: true }, dificil: { intentos: 3, sugerencias: false } },
    async iniciar(r) {
        const [p, esp] = await Promise.all([getPoke(r.objetivo.id), getEsp(r.objetivo.id)]);
        await cargarTipos(r.objetivo);
        const genus = (esp.genera.find(g => g.language.name === "es") || {}).genus || "Desconocida";
        const nombresStat = { hp: "PS", attack: "ATQ", defense: "DEF", "special-attack": "ATQ.ESP", "special-defense": "DEF.ESP", speed: "VEL" };
        const bonito = (s) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

        const pistas = {
            gen:   { t: "GENERACIÓN", v: `Gen ${r.objetivo.gen} · ${r.objetivo.region}` },
            tipo:  { t: "TIPO", v: r.objetivo.tipos.map(nombreTipo).join(" / "), color: colorTipo(r.objetivo.tipos[0] || "") },
            cat:   { t: "CATEGORÍA", v: genus },
            medidas: { t: "ALTURA / PESO", v: `${p.height / 10} m · ${p.weight / 10} kg` },
            habil: { t: "HABILIDADES", v: p.abilities.map(a => bonito(a.ability.name)).join(", ") },
            stats: { t: "ESTADÍSTICAS", v: p.stats.map(s => `${nombresStat[s.stat.name] || s.stat.name} ${s.base_stat}`).join(" · ") }
        };
        const orden = dificultad === "facil"
            ? ["gen", "tipo", "cat", "medidas", "habil", "stats"]
            : ["stats", "habil", "medidas"];
        r.pistasCard = orden.map(k => pistas[k]);
        r.reveladas = 1;
        r.zona.innerHTML = `<div class="tcg-card" id="tcg-card"></div>`;
        modos.card.pintar(r);
    },
    pintar(r) {
        const filas = r.pistasCard.map((c, i) => i < r.reveladas
            ? `<div class="tcg-fila"><span class="tcg-label">${c.t}</span><span class="tcg-valor">${c.v}</span></div>`
            : `<div class="tcg-fila oculta"><span class="tcg-label">${c.t}</span><span class="tcg-valor">???</span></div>`).join("");
        const conTipo = r.pistasCard.slice(0, r.reveladas).find(c => c.color);
        const card = $("tcg-card");
        card.style.setProperty("--tc", conTipo ? conTipo.color : "#c9a227");
        card.innerHTML = `
            <div class="tcg-head"><span>???</span><span>CARTA SECRETA</span></div>
            <div class="tcg-arte">❓</div>
            <div class="tcg-cuerpo">${filas}</div>`;
    },
    alIntentar(r, intento, acierto) {
        if (!acierto && r.reveladas < r.pistasCard.length) { r.reveladas++; modos.card.pintar(r); }
    }
};

// ---------- ANAGRAMA ----------
modos.anagrama = {
    titulo: "ANAGRAMA",
    pistas: true,
    dificultades: { facil: { intentos: 3, sugerencias: true }, dificil: { intentos: 2, sugerencias: false } },
    async iniciar(r) {
        const letras = r.objetivo.nombre.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase().split("");
        let mezcla = letras.slice();
        for (let intento = 0; intento < 20; intento++) {
            for (let i = mezcla.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
            }
            if (mezcla.join("") !== letras.join("")) break;
        }
        r.zona.innerHTML = `
            <p class="ayuda-modo">Ordena las letras para formar el nombre de un Pokémon</p>
            <div class="anagrama">${mezcla.map(l => `<span class="ficha-letra">${l}</span>`).join("")}</div>`;
    }
};

// ---------- ¿CUÁL ES SU TIPO? ----------
modos.tipo = {
    titulo: "¿CUÁL ES SU TIPO?",
    sinInput: true,
    dificultades: { facil: { intentos: 3, sugerencias: false }, dificil: { intentos: 2, sugerencias: false } },
    async iniciar(r) {
        const url = artwork(r.objetivo.id);
        await Promise.all([precargar(url), cargarTipos(r.objetivo)]);
        r.sel = new Set();
        r.correctos = new Set(r.objetivo.tipos.map(norm));
        const claseCaja = dificultad === "dificil" ? "silueta-box" : "silueta-box revelada";
        r.zona.innerHTML = `
            <div class="${claseCaja}" id="silueta-box"><img src="${url}" alt="?"></div>
            <p class="ayuda-modo">Este Pokémon tiene ${r.correctos.size === 2 ? "<b>2 tipos</b>" : "<b>1 tipo</b>"}. Elígelos y comprueba.</p>
            <div class="tipo-grid" id="tipo-grid"></div>
            <button type="button" class="btn-accion" id="btn-comprobar">COMPROBAR</button>`;
        const grid = $("tipo-grid");
        TIPOS_ES.forEach(t => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tipo-btn";
            b.textContent = t.toUpperCase();
            b.style.setProperty("--c", colorTipo(t));
            b.onclick = () => {
                if (ronda.finalizada) return;
                const k = norm(t);
                if (r.sel.has(k)) { r.sel.delete(k); b.classList.remove("sel"); }
                else if (r.sel.size < r.correctos.size) { r.sel.add(k); b.classList.add("sel"); }
            };
            grid.appendChild(b);
        });
        $("btn-comprobar").onclick = () => {
            if (ronda.finalizada) return;
            if (r.sel.size !== r.correctos.size) { mensaje(`Elige ${r.correctos.size} tipo(s)`, "hint"); return; }
            const aciertos = [...r.sel].filter(k => r.correctos.has(k)).length;
            const todo = aciertos === r.correctos.size;
            registrarIntento(todo, dificultad === "facil" ? `${aciertos} de ${r.correctos.size} correctos` : "Incorrecto");
        };
    },
    revelar(r) {
        mostrarRevelado(r, `<div class="chips-tipo">${r.objetivo.tipos.map(t =>
            `<span class="chip-tipo" style="background:${colorTipo(t)}">${nombreTipo(t).toUpperCase()}</span>`).join("")}</div>`);
    }
};

// ---------- EL PESO JUSTO ----------
modos.peso = {
    titulo: "EL PESO JUSTO",
    sinInput: true,
    tolerancia: { facil: 0.2, dificil: 0.08 },
    dificultades: { facil: { intentos: 4, sugerencias: false }, dificil: { intentos: 2, sugerencias: false } },
    async iniciar(r) {
        const [p] = await Promise.all([getPoke(r.objetivo.id), precargar(artwork(r.objetivo.id))]);
        r.peso = p.weight / 10;
        const tol = Math.round(modos.peso.tolerancia[dificultad] * 100);
        r.zona.innerHTML = `
            <div class="silueta-box revelada"><img src="${artwork(r.objetivo.id)}" alt="${r.objetivo.nombre}"></div>
            <p class="ayuda-modo"><b>${r.objetivo.nombre}</b>: ¿cuánto pesa? (vale ±${tol}%)</p>
            <div class="peso-row">
                <input type="number" id="peso-input" min="0" step="0.1" placeholder="kg">
                <button type="button" class="btn-accion" id="btn-peso">PROBAR</button>
            </div>`;
        const probar = () => {
            if (ronda.finalizada) return;
            const v = parseFloat($("peso-input").value);
            if (isNaN(v) || v < 0) { mensaje("Escribe un peso en kg", "hint"); return; }
            const tolKg = Math.max(r.peso * modos.peso.tolerancia[dificultad], 0.3);
            const ok = Math.abs(v - r.peso) <= tolKg;
            const pista = dificultad === "facil" ? (v < r.peso ? "Pesa MÁS ⬆" : "Pesa MENOS ⬇") : "Incorrecto";
            registrarIntento(ok, pista);
            if (!ronda.finalizada) { $("peso-input").value = ""; $("peso-input").focus(); }
        };
        $("btn-peso").onclick = probar;
        $("peso-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); probar(); } });
    },
    revelar(r) {
        mostrarRevelado(r, `<div class="chips-tipo"><span class="chip-tipo" style="background:#444">PESA ${r.peso} KG</span></div>`);
    }
};

// ---------- INFINITO (rondas aleatorias de otros modos hasta quedarte sin vidas) ----------
modos.infinito = {
    titulo: "INFINITO",
    dificultades: { facil: {}, dificil: {} },
    pool: ["silueta", "zoom", "descripcion", "card", "anagrama", "tipo", "peso"]
};

// =========================================================================
// MOTOR
// =========================================================================

function mensaje(texto, clase) {
    const f = $("feedback");
    f.textContent = texto;
    f.className = "feedback " + (clase || "");
}
function actualizarIntentosInfo() {
    if (!ronda.cfg || !ronda.cfg.intentos) { $("intentos-info").textContent = ""; return; }
    $("intentos-info").textContent = `INTENTOS: ${Math.max(ronda.cfg.intentos - ronda.intentos, 0)} / ${ronda.cfg.intentos}`;
}
function limpiarSugerencias() {
    const p = $("sugerencias");
    p.classList.add("hidden");
    p.innerHTML = "";
}

async function nuevaRonda() {
    ronda.cargando = true;
    ronda.finalizada = false;
    ronda.intentos = 0;
    ronda.probados = new Set();
    ronda.zona = $("zona-juego");

    mensaje("", "");
    $("pistas-reveladas").innerHTML = "";
    ["gen", "tipo", "inicial"].forEach(k => { $("hint-" + k).disabled = false; });
    $("btn-siguiente").classList.add("hidden");
    $("btn-rendirse").disabled = true;
    $("guess-input").value = "";
    $("guess-input").disabled = true;
    $("intentos-info").textContent = "";
    limpiarSugerencias();

    const clave = modoId === "infinito" ? azar(modos.infinito.pool) : modoId;
    ronda.modo = modos[clave];
    ronda.modoKey = clave;
    const base = ronda.modo.dificultades[dificultad];
    ronda.cfg = modoId === "infinito" ? Object.assign({}, base, { intentos: dificultad === "facil" ? 2 : 1 }) : base;
    $("subtitulo-modo").textContent = modoId === "infinito" ? ronda.modo.titulo : "";

    let ok = false;
    for (let t = 0; t < 6 && !ok; t++) {
        ronda.objetivo = azar(pokedexPlano);
        ronda.zona.innerHTML = `<div class="cargando">CARGANDO...</div>`;
        try { await ronda.modo.iniciar(ronda); ok = true; }
        catch (e) { console.warn("Reintentando con otro Pokémon:", e); }
    }
    ronda.cargando = false;

    if (!ok) {
        ronda.finalizada = true;
        ronda.zona.innerHTML = `<div class="cargando">NO SE PUDO CARGAR.<br>COMPRUEBA TU CONEXIÓN.</div>`;
        $("btn-siguiente").textContent = "REINTENTAR ▶";
        $("btn-siguiente").classList.remove("hidden");
        return;
    }

    $("btn-siguiente").textContent = "SIGUIENTE ▶";
    $("guess-form").classList.toggle("hidden", !!ronda.modo.sinInput);
    $("pistas-box").classList.toggle("hidden", !ronda.modo.pistas);
    $("btn-rendirse").disabled = false;
    if (!ronda.modo.sinInput) {
        $("guess-input").disabled = false;
        $("guess-input").focus();
    }
    actualizarIntentosInfo();
}

function buscarPokemon(texto) {
    const n = norm(texto);
    if (!n) return null;
    return pokedexPlano.find(p => norm(p.nombre) === n) || null;
}

function actualizarSugerencias() {
    const panel = $("sugerencias");
    if (ronda.finalizada || ronda.cargando || !ronda.cfg || !ronda.cfg.sugerencias || (ronda.modo && ronda.modo.sinInput)) {
        limpiarSugerencias();
        return;
    }
    const q = norm($("guess-input").value);
    if (!q) { limpiarSugerencias(); return; }
    const coincidencias = pokedexPlano.filter(p => norm(p.nombre).startsWith(q)).slice(0, 12);
    if (!coincidencias.length) { limpiarSugerencias(); return; }
    panel.innerHTML = "";
    coincidencias.forEach(p => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sugerencia-item";
        b.textContent = p.nombre;
        b.onclick = () => { $("guess-input").value = p.nombre; $("guess-input").focus(); actualizarSugerencias(); };
        panel.appendChild(b);
    });
    panel.classList.remove("hidden");
}

async function enviarIntento(texto) {
    if (ronda.finalizada || ronda.cargando || ronda.modo.sinInput) return;
    const intento = buscarPokemon(texto);
    if (!intento) { mensaje("Ese Pokémon no está en la lista", "hint"); return; }
    if (ronda.probados.has(intento.id)) { mensaje("Ya probaste ese", "hint"); return; }
    ronda.probados.add(intento.id);
    ronda.intentos++;
    $("guess-input").value = "";
    limpiarSugerencias();

    const acierto = intento.id === ronda.objetivo.id;
    if (ronda.modo.alIntentar) await ronda.modo.alIntentar(ronda, intento, acierto);

    if (acierto) { finalizar(true); return; }
    if (ronda.intentos >= ronda.cfg.intentos) { finalizar(false); return; }
    mensaje("Incorrecto, sigue intentándolo", "incorrecto");
    actualizarIntentosInfo();
}

// Para los modos con su propia interfaz (tipo, peso)
function registrarIntento(acierto, msgFallo) {
    if (ronda.finalizada) return;
    ronda.intentos++;
    if (acierto) { finalizar(true); return; }
    if (ronda.intentos >= ronda.cfg.intentos) { finalizar(false); return; }
    mensaje(msgFallo || "Incorrecto", "incorrecto");
    actualizarIntentosInfo();
}

function finalizar(acierto) {
    ronda.finalizada = true;
    limpiarSugerencias();
    $("guess-input").disabled = true;
    $("btn-rendirse").disabled = true;
    ["gen", "tipo", "inicial"].forEach(k => { $("hint-" + k).disabled = true; });

    if (ronda.modo.revelar) ronda.modo.revelar(ronda, acierto);
    else mostrarRevelado(ronda);

    const nombre = `${ronda.objetivo.nombre} #${pad3(ronda.objetivo.id)}`;
    if (acierto) {
        setRacha(rachaActual() + 1);
        mensaje(`¡CORRECTO! Es ${nombre}`, "correcto");
    } else {
        if (modoId !== "infinito") setRacha(0);
        mensaje(`Era ${nombre}`, "incorrecto");
    }

    if (modoId === "infinito" && !acierto) {
        infinito.vidas--;
        pintarMarcador();
        if (infinito.vidas <= 0) {
            infinito.gameOver = true;
            mensaje(`¡FIN DE LA PARTIDA! Era ${nombre} · Aciertos: ${infinito.score}`, "incorrecto");
        }
    }

    $("intentos-info").textContent = "";
    $("btn-siguiente").textContent = infinito.gameOver ? "NUEVA PARTIDA ▶" : "SIGUIENTE ▶";
    $("btn-siguiente").classList.remove("hidden");
}

async function mostrarPista(tipo) {
    if (ronda.finalizada || !ronda.objetivo) return;
    const o = ronda.objetivo;
    let texto = "";
    if (tipo === "gen") texto = `🌍 GENERACIÓN ${o.gen} (región ${o.region})`;
    else if (tipo === "tipo") {
        $("hint-tipo").disabled = true;
        try { await cargarTipos(o); } catch (e) { mensaje("No se pudo cargar el tipo", "hint"); $("hint-tipo").disabled = false; return; }
        if (ronda.objetivo !== o || ronda.finalizada) return;
        texto = `🔶 TIPO: ${o.tipos.map(nombreTipo).join(" / ")}`;
    } else if (tipo === "inicial") texto = `🔤 EMPIEZA POR: "${o.nombre.charAt(0).toUpperCase()}"`;
    const d = document.createElement("div");
    d.textContent = texto;
    $("pistas-reveladas").appendChild(d);
    $("hint-" + tipo).disabled = true;
}

function rendirse() {
    if (ronda.finalizada || ronda.cargando) return;
    finalizar(false);
}

function siguiente() {
    if (infinito.gameOver) {
        infinito = { vidas: vidasIniciales(), score: 0, gameOver: false };
        pintarMarcador();
    }
    nuevaRonda();
}

function cambiarDificultad(d) {
    if (d === dificultad) return;
    dificultad = d;
    guardarStr(`dif_${modoId}`, d);
    $("btn-facil").classList.toggle("active", d === "facil");
    $("btn-dificil").classList.toggle("active", d === "dificil");
    if (modoId === "infinito") infinito = { vidas: vidasIniciales(), score: 0, gameOver: false };
    pintarMarcador(); // muestra la racha de ESTA dificultad (la otra se conserva guardada)
    nuevaRonda();
}

window.cambiarDificultad = cambiarDificultad;
window.mostrarPista = mostrarPista;
window.rendirse = rendirse;
window.siguiente = siguiente;

document.addEventListener("DOMContentLoaded", () => {
    if (!modos[modoId]) modoId = "clasico";
    construirLista();

    dificultad = leerStr(`dif_${modoId}`) === "dificil" ? "dificil" : "facil";
    infinito.vidas = vidasIniciales();

    $("titulo-juego").textContent = modos[modoId].titulo;
    document.title = "Pokémon - " + modos[modoId].titulo;
    $("vidas-box").classList.toggle("hidden", modoId !== "infinito");
    $("btn-facil").classList.toggle("active", dificultad === "facil");
    $("btn-dificil").classList.toggle("active", dificultad === "dificil");
    pintarMarcador();

    $("guess-input").addEventListener("input", actualizarSugerencias);
    $("guess-form").addEventListener("submit", (e) => {
        e.preventDefault();
        enviarIntento($("guess-input").value);
    });

    nuevaRonda();
});