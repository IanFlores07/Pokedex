// =========================================================================
// CURIOSIDADES POKÉMON
// Nada está inventado: cada curiosidad sale de datos reales de los juegos que
// ofrece la PokéAPI (textos de la Pokédex en español, nombres en otros idiomas,
// debut, medidas, estadísticas base, captura, huevo, género, habilidades...).
// Cada tarjeta indica de dónde sale. Hay siempre 4 o más por Pokémon.
// =========================================================================

const REGIONES = { 1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Teselia", 6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea" };
const ROMANOS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

const RANGOS_GEN = [
    { start: 1, gen: 1 }, { start: 152, gen: 2 }, { start: 252, gen: 3 }, { start: 387, gen: 4 }, { start: 494, gen: 5 },
    { start: 650, gen: 6 }, { start: 722, gen: 7 }, { start: 810, gen: 8 }, { start: 906, gen: 9 }
];

const JUEGOS = {
    red: "Rojo", blue: "Azul", yellow: "Amarillo", gold: "Oro", silver: "Plata", crystal: "Cristal",
    ruby: "Rubí", sapphire: "Zafiro", emerald: "Esmeralda", firered: "Rojo Fuego", leafgreen: "Verde Hoja",
    diamond: "Diamante", pearl: "Perla", platinum: "Platino", heartgold: "HeartGold", soulsilver: "SoulSilver",
    black: "Negro", white: "Blanco", "black-2": "Negro 2", "white-2": "Blanco 2", x: "X", y: "Y",
    "omega-ruby": "Rubí Omega", "alpha-sapphire": "Zafiro Alfa", sun: "Sol", moon: "Luna",
    "ultra-sun": "Ultrasol", "ultra-moon": "Ultraluna", "lets-go-pikachu": "Let's Go, Pikachu!", "lets-go-eevee": "Let's Go, Eevee!",
    sword: "Espada", shield: "Escudo", "brilliant-diamond": "Diamante Brillante", "shining-pearl": "Perla Reluciente",
    "legends-arceus": "Leyendas Pokémon: Arceus", scarlet: "Escarlata", violet: "Púrpura"
};

const HABITATS = { cave: "cueva", forest: "bosque", grassland: "pradera", mountain: "montaña", rare: "raro", "rough-terrain": "terreno accidentado", sea: "mar", urban: "urbano", "waters-edge": "orilla del agua" };
const COLORES = { black: "negro", blue: "azul", brown: "marrón", gray: "gris", green: "verde", pink: "rosa", purple: "morado", red: "rojo", white: "blanco", yellow: "amarillo" };
const FORMAS = { ball: "bola", squiggle: "serpenteante", fish: "pez", arms: "con brazos", blob: "amorfa", upright: "erguida", legs: "con patas", quadruped: "cuadrúpedo", wings: "con alas", tentacles: "con tentáculos", heads: "con varias cabezas", humanoid: "humanoide", "bug-wings": "insecto con alas", armor: "con armadura" };
const GRUPOS_HUEVO = { monster: "Monstruo", water1: "Agua 1", bug: "Bicho", flying: "Volador", ground: "Campo", fairy: "Hada", plant: "Planta", humanshape: "Humanoide", water3: "Agua 3", mineral: "Mineral", indeterminate: "Amorfo", water2: "Agua 2", ditto: "Ditto", dragon: "Dragón", "no-eggs": "Desconocido" };
const CRECIMIENTO = { slow: "lento", medium: "medio", fast: "rápido", "medium-slow": "medio-lento (parabólico)", "slow-then-very-fast": "errático", "fast-then-very-slow": "fluctuante" };
const STATS_ES = { hp: "PS", attack: "Ataque", defense: "Defensa", "special-attack": "Ataque Especial", "special-defense": "Defensa Especial", speed: "Velocidad" };
const TIPOS_ES = { normal: "Normal", fire: "Fuego", water: "Agua", electric: "Eléctrico", grass: "Planta", ice: "Hielo", fighting: "Lucha", poison: "Veneno", ground: "Tierra", flying: "Volador", psychic: "Psíquico", bug: "Bicho", rock: "Roca", ghost: "Fantasma", dragon: "Dragón", dark: "Siniestro", steel: "Acero", fairy: "Hada" };

// ---------- utilidades ----------
const $ = (id) => document.getElementById(id);
const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const bonito = (s) => String(s).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const pad3 = (n) => String(n).padStart(3, "0");
const artwork = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const lista = (arr) => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];
const generacionDe = (id) => { let g = 1; RANGOS_GEN.forEach(r => { if (id >= r.start) g = r.gen; }); return g; };

// ---------- datos (PokéAPI) ----------
const cache = {};
function pedir(url) {
    if (!cache[url]) {
        cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.json(); });
        cache[url].catch(() => { delete cache[url]; });
    }
    return cache[url];
}

// =========================================================================
// GENERADOR DE CURIOSIDADES
// poke / esp: respuestas de /pokemon/{id} y /pokemon-species/{id}
// extra: { habilidades: {slug: nombreEs}, evolucionaDe: nombreEs }
// =========================================================================
function textoLimpio(t) {
    return String(t).replace(/[\n\f\r\u00ad]+/g, " ").replace(/\s+/g, " ").trim();
}

function entradasPokedex(esp) {
    // Entradas oficiales de la Pokédex. Se agrupan las repetidas (mismo texto en varios juegos).
    let entradas = esp.flavor_text_entries.filter(e => e.language.name === "es");
    let enIngles = false;
    if (!entradas.length) { entradas = esp.flavor_text_entries.filter(e => e.language.name === "en"); enIngles = true; }
    const grupos = [];
    entradas.forEach(e => {
        const t = textoLimpio(e.flavor_text);
        if (!t) return;
        const g = grupos.find(x => norm(x.texto) === norm(t));
        const juego = JUEGOS[e.version.name] || bonito(e.version.name);
        if (g) { if (!g.juegos.includes(juego)) g.juegos.push(juego); }
        else grupos.push({ texto: t, juegos: [juego], enIngles });
    });
    return grupos;
}

// Elige hasta n entradas repartidas (la primera, la última y las de en medio)
function repartidas(arr, n) {
    if (arr.length <= n) return arr.slice();
    const res = [];
    for (let i = 0; i < n; i++) res.push(arr[Math.round(i * (arr.length - 1) / (n - 1))]);
    return res;
}

function generarCuriosidades(poke, esp, extra) {
    extra = extra || {};
    const nombreEs = (esp.names.find(n => n.language.name === "es") || {}).name || bonito(poke.name);
    const C = [];
    const add = (tipo, icono, titulo, texto, fuente) => { if (texto) C.push({ tipo, icono, titulo, texto, fuente }); };
    const FUENTE_TEXTO = "Texto oficial de los juegos (vía PokéAPI)";
    const FUENTE_DATOS = "Datos de los juegos (vía PokéAPI)";

    const pokedex = repartidas(entradasPokedex(esp), 3);
    const pokedexItem = (g) => ({ tipo: "pokedex", icono: "📖", titulo: "Lo que dice la Pokédex" + (g.enIngles ? " (en inglés)" : ""),
        texto: `«${g.texto}»`, fuente: `${FUENTE_TEXTO} · ${lista(g.juegos.slice(0, 4))}${g.juegos.length > 4 ? " y otros" : ""}` });

    // 1) nombres en otros idiomas
    const nom = (l) => (esp.names.find(n => n.language.name === l) || {}).name;
    const kana = nom("ja-Hrkt") || nom("ja"), romaji = nom("roomaji");
    const otros = [["inglés", nom("en")], ["francés", nom("fr")], ["alemán", nom("de")], ["italiano", nom("it")], ["coreano", nom("ko")]].filter(p => p[1]);
    if (kana || otros.length) {
        const partes = [];
        if (kana) partes.push(`En japonés se llama «${kana}»${romaji ? ` (${romaji})` : ""}.`);
        if (otros.length) partes.push(`En otros idiomas: ${lista(otros.map(p => `${p[0]} «${p[1]}»`))}.`);
        add("nombres", "🌍", `Un nombre, muchos nombres`, partes.join(" "), FUENTE_DATOS);
    }

    // 2) debut
    const gen = ROMANOS[(esp.generation && esp.generation.name || "").split("-")[1]] || generacionDe(esp.id);
    add("debut", "🗓️", "Su debut", `Es el Pokémon n.º ${esp.id} de la Pokédex Nacional. Apareció por primera vez en la generación ${gen}, en la región de ${REGIONES[gen] || "desconocida"}.`, FUENTE_DATOS);

    // 3) medidas
    add("medidas", "📏", "Sus medidas", `Mide ${poke.height / 10} m y pesa ${poke.weight / 10} kg.` +
        (poke.base_experience ? ` Al derrotarlo en combate da ${poke.base_experience} puntos de experiencia base.` : ""), FUENTE_DATOS);

    // 4) estadísticas
    if (poke.stats && poke.stats.length) {
        const orden = poke.stats.slice().sort((a, b) => b.base_stat - a.base_stat);
        const alta = orden[0], baja = orden[orden.length - 1];
        const total = poke.stats.reduce((a, s) => a + s.base_stat, 0);
        add("stats", "📊", "Sus puntos fuertes", `Su estadística base más alta es ${STATS_ES[alta.stat.name] || alta.stat.name} (${alta.base_stat}) y la más baja es ${STATS_ES[baja.stat.name] || baja.stat.name} (${baja.base_stat}). Suma un total base de ${total}.`, FUENTE_DATOS);
    }

    // 5) captura
    if (typeof esp.capture_rate === "number") {
        const c = esp.capture_rate;
        const nivel = c >= 200 ? "muy fácil" : c >= 120 ? "fácil" : c >= 60 ? "de dificultad media" : c >= 30 ? "difícil" : "muy difícil";
        add("captura", "🎯", "¿Es fácil de capturar?", `Su ratio de captura es ${c} sobre 255 (cuanto más bajo, más difícil): capturarlo resulta ${nivel}.`, FUENTE_DATOS);
    }

    // 6) huevo
    if (esp.egg_groups && esp.egg_groups.length) {
        const grupos = esp.egg_groups.map(g => GRUPOS_HUEVO[g.name] || bonito(g.name));
        if (esp.egg_groups.some(g => g.name === "no-eggs")) add("huevo", "🥚", "Sobre los huevos", "No puede criar: no pertenece a ningún grupo huevo.", FUENTE_DATOS);
        else add("huevo", "🥚", "Sobre los huevos", `Pertenece al grupo huevo ${lista(grupos)}.` + (esp.hatch_counter ? ` Su huevo necesita ${esp.hatch_counter} ciclos de eclosión.` : ""), FUENTE_DATOS);
    }

    // 7) género
    if (typeof esp.gender_rate === "number") {
        const g = esp.gender_rate;
        const t = g === -1 ? "No tiene género: es un Pokémon sin sexo." : g === 0 ? "Siempre es macho." : g === 8 ? "Siempre es hembra."
            : `Entre los ejemplares que aparecen, un ${(8 - g) / 8 * 100}% son machos y un ${g / 8 * 100}% hembras.`;
        add("genero", "⚧", "Machos y hembras", t, FUENTE_DATOS);
    }

    // 8) habilidades
    if (poke.abilities && poke.abilities.length) {
        const nombreHab = (a) => (extra.habilidades && extra.habilidades[a.ability.name]) || bonito(a.ability.name);
        const normales = poke.abilities.filter(a => !a.is_hidden).map(nombreHab);
        const oculta = poke.abilities.filter(a => a.is_hidden).map(nombreHab);
        add("habilidades", "⚡", "Sus habilidades", `Puede tener ${lista(normales)}.` + (oculta.length ? ` Su habilidad oculta es ${lista(oculta)}.` : ""), FUENTE_DATOS);
    }

    // 9) hábitat / color / forma
    const hab = esp.habitat && (HABITATS[esp.habitat.name] || bonito(esp.habitat.name));
    const col = esp.color && (COLORES[esp.color.name] || esp.color.name);
    const forma = esp.shape && (FORMAS[esp.shape.name] || esp.shape.name);
    const partesH = [];
    if (hab) partesH.push(`vive en el hábitat «${hab}»`);
    if (col) partesH.push(`su color principal es el ${col}`);
    if (forma) partesH.push(`su silueta se clasifica como «${forma}»`);
    if (partesH.length) add("habitat", "🏞️", "Según la Pokédex", `${partesH[0].charAt(0).toUpperCase()}${partesH[0].slice(1)}${partesH.length > 1 ? "; " + partesH.slice(1).join("; ") : ""}.`, FUENTE_DATOS);

    // 10) condición especial
    const cond = esp.is_legendary ? "legendario" : esp.is_mythical ? "mítico" : esp.is_baby ? "bebé" : null;
    if (cond) add("estado", "⭐", "Un Pokémon especial", `Está clasificado como Pokémon ${cond}.`, FUENTE_DATOS);

    // 11) evolución
    if (esp.evolves_from_species) add("evolucion", "🔁", "Su evolución", `Evoluciona a partir de ${extra.evolucionaDe || bonito(esp.evolves_from_species.name)}.`, FUENTE_DATOS);

    // 12) variantes
    if (esp.varieties && esp.varieties.length > 1) add("formas", "🎭", "Más de una forma", `Además de su forma normal tiene ${esp.varieties.length - 1} variante${esp.varieties.length - 1 > 1 ? "s" : ""} registrada${esp.varieties.length - 1 > 1 ? "s" : ""} (formas regionales, megaevoluciones, etc.).`, FUENTE_DATOS);

    // Se mezclan las entradas de la Pokédex con los datos para que no salgan todas juntas:
    // una entrada de la Pokédex, dos datos, otra entrada, dos datos...
    const resultado = [];
    const datos = C.slice();
    const pokes = pokedex.map(pokedexItem);
    let ip = 0;
    while (datos.length || ip < pokes.length) {
        if (ip < pokes.length) resultado.push(pokes[ip++]);
        for (let j = 0; j < 2 && datos.length; j++) resultado.push(datos.shift());
    }
    return { nombreEs, gen, curiosidades: resultado };
}

// =========================================================================
// CURIOSIDAD DEL DÍA: el mismo Pokémon y la misma curiosidad para todos durante todo el día
// =========================================================================
const diasDesdeEpoca = (f) => Math.floor(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()) / 86400000);

function semillaDelDia(fecha) {
    let h = diasDesdeEpoca(fecha || new Date());
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
}
// 744 y 1025 no comparten divisores, así que este salto recorre los 1025 Pokémon
// sin repetir ninguno hasta que se han visto todos (casi 3 años seguidos).
const pokemonDelDia = (fecha) => ((((diasDesdeEpoca(fecha || new Date()) * 744 + 337) % 1025) + 1025) % 1025) + 1;
const indiceDelDia = (fecha, total) => semillaDelDia(fecha) % Math.max(total, 1);

// =========================================================================
// INTERFAZ
// =========================================================================
let pokedexPlano = [];
function construirLista() {
    pokedexPlano = [];
    RANGOS_GEN.forEach((r) => {
        const d = typeof pokedexData !== "undefined" ? pokedexData[r.gen] : null;
        if (!d || !d.nombres) return;
        d.nombres.forEach((nombre, i) => { if (r.start + i <= 1025) pokedexPlano.push({ id: r.start + i, nombre }); });
    });
}

async function cargarPokemon(id) {
    const [poke, esp] = await Promise.all([pedir(`https://pokeapi.co/api/v2/pokemon/${id}`), pedir(`https://pokeapi.co/api/v2/pokemon-species/${id}`)]);
    // Nombres en español de habilidades y de la preevolución (si fallan, se usa el nombre en inglés)
    const extra = { habilidades: {} };
    await Promise.all([
        ...poke.abilities.slice(0, 3).map(a => pedir(a.ability.url).then(d => {
            const n = d.names.find(x => x.language.name === "es"); if (n) extra.habilidades[a.ability.name] = n.name;
        }).catch(() => {})),
        esp.evolves_from_species ? pedir(esp.evolves_from_species.url).then(d => {
            const n = d.names.find(x => x.language.name === "es"); if (n) extra.evolucionaDe = n.name;
        }).catch(() => {}) : Promise.resolve()
    ]);
    return { poke, esp, resultado: generarCuriosidades(poke, esp, extra) };
}

function tarjetaHtml(c, i, grande) {
    return `<article class="cur-card cur-${c.tipo}${grande ? " cur-grande" : ""}" style="--n:${i}">
        <div class="cur-cabecera"><span class="cur-icono">${c.icono}</span><h3>${c.titulo}</h3></div>
        <p class="cur-texto">${c.texto}</p>
        <div class="cur-fuente">${c.fuente}</div>
    </article>`;
}

let vistaActual = { id: null, datos: null };

async function mostrar(id, destacada) {
    $("estado").textContent = "CARGANDO CURIOSIDADES...";
    $("estado").classList.remove("hidden");
    $("resultado").classList.add("hidden");
    let datos;
    try { datos = await cargarPokemon(id); }
    catch (e) {
        $("estado").textContent = "NO SE PUDO CARGAR. COMPRUEBA LA CONEXIÓN E INTÉNTALO DE NUEVO.";
        return;
    }
    vistaActual = { id, datos };
    const { poke, esp, resultado } = datos;
    const tipos = poke.types.slice().sort((a, b) => a.slot - b.slot).map(t => `<span class="chip-tipo tipo-${t.type.name}">${TIPOS_ES[t.type.name] || t.type.name}</span>`).join("");

    $("ficha").innerHTML = `
        <div class="ficha-arte"><img src="${artwork(id)}" alt="${resultado.nombreEs}"></div>
        <div class="ficha-datos">
            <div class="ficha-num">#${pad3(id)}</div>
            <h2 class="ficha-nombre">${resultado.nombreEs}</h2>
            <div class="ficha-chips">${tipos}<span class="chip-gen">GEN ${resultado.gen} · ${(REGIONES[resultado.gen] || "").toUpperCase()}</span></div>
        </div>`;

    const lista = $("lista-curiosidades");
    if (destacada !== null && destacada !== undefined) {
        const c = resultado.curiosidades[destacada];
        const otras = resultado.curiosidades.filter((_, i) => i !== destacada);
        lista.innerHTML = tarjetaHtml(c, 0, true) +
            `<button type="button" id="btn-ver-todas" class="btn-ver-todas">✨ VER LAS OTRAS ${otras.length} CURIOSIDADES DE ${resultado.nombreEs.toUpperCase()}</button>
             <div id="otras" class="grid-cur hidden">${otras.map((o, i) => tarjetaHtml(o, i + 1)).join("")}</div>`;
        $("btn-ver-todas").onclick = () => { $("otras").classList.remove("hidden"); $("btn-ver-todas").classList.add("hidden"); };
    } else {
        lista.innerHTML = `<div class="grid-cur">${resultado.curiosidades.map((c, i) => tarjetaHtml(c, i)).join("")}</div>`;
    }
    $("estado").classList.add("hidden");
    $("resultado").classList.remove("hidden");
}

async function mostrarDelDia() {
    const hoy = new Date();
    $("fecha-hoy").textContent = hoy.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
    const id = pokemonDelDia(hoy);
    // La curiosidad concreta depende de cuántas haya, así que primero se cargan y luego se elige
    let datos;
    try { datos = await cargarPokemon(id); } catch (e) { return mostrar(id, 0); }
    const idx = indiceDelDia(hoy, datos.resultado.curiosidades.length);
    return mostrar(id, idx);
}

function cambiarPestana(cual) {
    const dia = cual === "dia";
    $("tab-dia").classList.toggle("active", dia);
    $("tab-elegir").classList.toggle("active", !dia);
    $("panel-dia").classList.toggle("hidden", !dia);
    $("panel-elegir").classList.toggle("hidden", dia);
    if (dia) mostrarDelDia();
    else if (vistaActual.id) mostrar(vistaActual.id, null);
    else { $("resultado").classList.add("hidden"); $("estado").textContent = "ELIGE UN POKÉMON O PULSA «AL AZAR»"; $("estado").classList.remove("hidden"); }
}

function buscarPorTexto(texto) {
    const t = String(texto).trim();
    if (!t) return null;
    if (/^#?\d+$/.test(t)) { const n = parseInt(t.replace("#", ""), 10); return n >= 1 && n <= 1025 ? n : null; }
    const p = pokedexPlano.find(x => norm(x.nombre) === norm(t));
    return p ? p.id : null;
}

function actualizarSugerencias() {
    const panel = $("sugerencias");
    const q = norm($("buscar").value);
    if (!q) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
    const m = pokedexPlano.filter(p => norm(p.nombre).startsWith(q)).slice(0, 12);
    panel.innerHTML = "";
    m.forEach(p => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sugerencia-item"; b.textContent = p.nombre;
        b.onclick = () => { $("buscar").value = ""; panel.classList.add("hidden"); mostrar(p.id, null); };
        panel.appendChild(b);
    });
    panel.classList.toggle("hidden", m.length === 0);
}

document.addEventListener("DOMContentLoaded", () => {
    construirLista();
    $("tab-dia").onclick = () => cambiarPestana("dia");
    $("tab-elegir").onclick = () => cambiarPestana("elegir");
    $("buscar").addEventListener("input", actualizarSugerencias);
    $("form-buscar").addEventListener("submit", (e) => {
        e.preventDefault();
        const id = buscarPorTexto($("buscar").value);
        if (!id) { $("estado").textContent = "ESE POKÉMON NO ESTÁ EN LA LISTA (PRUEBA CON SU NOMBRE EN INGLÉS O SU NÚMERO)"; $("estado").classList.remove("hidden"); return; }
        $("buscar").value = ""; $("sugerencias").classList.add("hidden");
        mostrar(id, null);
    });
    $("btn-azar").onclick = () => mostrar(Math.floor(Math.random() * 1025) + 1, null);
    mostrarDelDia();
});