// =========================================================================
// POKÉDEX NACIONAL - REGISTRO DE DATOS Y RENDERIZADO DINÁMICO COMPLETO
// =========================================================================

let currentPokemonId = null; 
let currentVariante = "regular"; 
let modoImagen = "poster"; // "poster" = artwork oficial | "sprite" = pixel art estático | "animado" = pixel art animado
let vistaActual = "lista"; 
let idGenActiva = 1; 
let modo3DActivo = false;

let mainAnimationId = null;
let scene, camera, renderer = null, currentModel = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let mainMixer = null;
let mainClock = null;


// -------------------------------------------------------------------------
// PREPARACIÓN DEL MODELO 3D (compartida por el visor pequeño y el del modal)
//
// IMPORTANTE: NO se llama a skeleton.pose(). En modelos con esqueleto, three.js
// lo aplica mal si el hueso raíz cuelga de un nodo con escala/rotación (muy típico
// en modelos sacados de juegos) y duplica esa transformación: el modelo sale
// colgando, de lado o gigante. Sin pose() se respeta la pose con la que se exportó.
// -------------------------------------------------------------------------

// Caja del modelo YA deformado por su esqueleto. La caja de la geometría "cruda"
// no sirve con huesos: puede salir muchísimo más grande o pequeña que lo que se ve.
function calcularCajaReal(modelo) {
    modelo.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    const v = new THREE.Vector3();
    let hayDatos = false;
    modelo.traverse((hijo) => {
        if (!hijo.isMesh || !hijo.geometry || !hijo.geometry.attributes || !hijo.geometry.attributes.position) return;
        const pos = hijo.geometry.attributes.position;
        const paso = Math.max(1, Math.floor(pos.count / 20000)); // con 20.000 puntos por malla sobra
        const conHuesos = hijo.isSkinnedMesh && hijo.skeleton && typeof hijo.boneTransform === "function"
                          && hijo.geometry.attributes.skinIndex && hijo.geometry.attributes.skinWeight;
        for (let i = 0; i < pos.count; i += paso) {
            v.fromBufferAttribute(pos, i);              // (algunas versiones de three exigen partir de la posición original)
            if (conHuesos) hijo.boneTransform(i, v);
            v.applyMatrix4(hijo.matrixWorld);
            if (isFinite(v.x) && isFinite(v.y) && isFinite(v.z)) { caja.expandByPoint(v); hayDatos = true; }
        }
    });
    return hayDatos && !caja.isEmpty() ? caja : null;
}

// Deja el modelo listo: materiales, animación, centrado en el origen (para que gire
// sobre sí mismo sin irse de plano) y distancia de cámara que lo encuadra entero.
function prepararModelo3D(gltf, camara, margen) {
    const modelo = gltf.scene;

    modelo.traverse((hijo) => {
        if (hijo.isSkinnedMesh) hijo.frustumCulled = false; // evita que desaparezca por un cálculo de cámara erróneo
        if (hijo.isMesh && hijo.material) {
            const m = hijo.material;
            if (m.opacity === 0) m.opacity = 1;
            m.transparent = m.opacity < 1;
            m.depthWrite = true;
            m.side = THREE.DoubleSide;
            m.roughness = 1.0;
            m.metalness = 0.0;
            if (m.clearcoat !== undefined) m.clearcoat = 0.0;
            if (m.emissive) m.emissive.setHex(0x000000);
            if (m.metalnessMap) m.metalnessMap = null;
            if (m.roughnessMap) m.roughnessMap = null;
            if (m.map) m.map.anisotropy = 4;
        }
    });

    let mixer = null;
    const clip = elegirClipAnimacion(gltf.animations);
    if (clip) {
        mixer = new THREE.AnimationMixer(modelo);
        mixer.clipAction(clip).play();
        mixer.update(0); // aplica ya el primer fotograma para medir el modelo en su pose real
    }

    modelo.updateMatrixWorld(true);
    let caja = calcularCajaReal(modelo);
    if (!caja) caja = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, 1.2, 1.2));

    const centro = caja.getCenter(new THREE.Vector3());
    const tam = caja.getSize(new THREE.Vector3());

    // Centramos el modelo en el origen dentro de un "pivote": al girar el pivote,
    // el Pokémon gira sobre su propio centro y siempre se queda en el encuadre.
    modelo.position.sub(centro);
    const pivote = new THREE.Group();
    pivote.add(modelo);

    // Normalizamos el tamaño: la dimensión más grande pasa a medir 1 unidad. Así da igual en qué
    // unidades se exportó el modelo (gigante, diminuto...): todos se encuadran igual y sin recortes de cámara.
    const mayor = Math.max(tam.x, tam.y, tam.z);
    const k = (isFinite(mayor) && mayor > 1e-9) ? 1 / mayor : 1;
    pivote.scale.set(k, k, k);

    const radioH = 0.5 * Math.sqrt(tam.x * tam.x + tam.z * tam.z) * k || 0.6;
    const alturaMedia = (tam.y * k / 2) || 0.6;
    const fovV = camara.fov * Math.PI / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camara.aspect);

    let distancia = Math.max(alturaMedia / Math.tan(fovV / 2), radioH / Math.tan(fovH / 2)) * margen + radioH * 0.5;
    if (!isFinite(distancia) || distancia <= 0) distancia = 2.5;

    return { pivote, mixer, distancia };
}

// Elige qué animación reproducir: prioriza "idle"/"pose"/"stand", si no hay, usa la primera.
function elegirClipAnimacion(animaciones) {
    if (!animaciones || animaciones.length === 0) return null;
    const preferida = animaciones.find(c => /idle|pose|stand|rest|wait/i.test(c.name));
    return preferida || animaciones[0];
}

// Intento de detectar y ocultar piezas de "cuerda/colgante/llavero" que traen
// algunos modelos de este pack comunitario (no podemos ver el .glb por dentro,
// así que vamos por nombre de la pieza).
function ocultarPiezasColgante(modelo) {
    const patron = /string|rope|cord|cordon|hang|loop|handle|keychain|strap|hilo|cuerda/i;
    modelo.traverse((child) => {
        if (child.name && patron.test(child.name)) {
            child.visible = false;
        }
    });
}

// --- Variables del visor 3D del modal (AMPLIAR) ---
let modalScene, modalCamera, modalRenderer = null, modalModel = null;
let modalAnimationId = null;
let modalIsDragging = false;
let modalPrevMouse = { x: 0, y: 0 };
let modalDistanciaBase = 2.5;
let modalCentroModelo = null;
let modalMixer = null;
let modalClock = null;

// Devuelve las posibles URLs (en orden de preferencia) donde buscar el modelo .glb.
// 1º intenta la CDN pública del proyecto Pokémon 3D API, 2º cae a tu carpeta local.
function obtenerUrlsModelo(pokemonId, carpeta) {
    return [
        // Ruta real y activa del repo (confirmada): models/glb, no models/opt
        `https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/glb/${carpeta}/${pokemonId}.glb`,
        // Respaldo: repo antiguo archivado (estructura vieja, por si algún modelo solo sigue ahí)
        `https://raw.githubusercontent.com/Sudhanshu-Ambastha/Pokemon-3D/main/models/opt/${carpeta}/${pokemonId}.glb`,
        // Último respaldo: tu propia carpeta local, si algún día subes tus modelos ahí
        `/assets-main/models/opt/${carpeta}/${pokemonId}.glb`
    ];
}

// Intenta cargar un modelo probando varias URLs en orden hasta que una funcione.
function cargarModeloConFallback(loader, urls, onSuccess, onFinalError, index = 0) {
    if (index >= urls.length) { onFinalError(); return; }
    loader.load(
        urls[index],
        onSuccess,
        undefined,
        () => cargarModeloConFallback(loader, urls, onSuccess, onFinalError, index + 1)
    );
}

let pokedexNombresGlobales = [];

const typeColors = {
    normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030", grass: "#78C850",
    ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0", ground: "#E0C068", flying: "#A890F0",
    psychic: "#F85888", bug: "#A8B820", rock: "#B8A038", ghost: "#705898", dragon: "#7038F8",
    dark: "#705848", steel: "#B8B8D0", fairy: "#EE99AC"
};

const traduccionTipos = {
    normal: "NORMAL", fire: "FUEGO", water: "AGUA", electric: "ELÉCTRICO", grass: "PLANTA",
    ice: "HIELO", fighting: "LUCHA", poison: "VENENO", ground: "TIERRA", flying: "VOLADOR",
    psychic: "PSÍQUICO", bug: "BICHO", rock: "ROCA", ghost: "FANTASMA", dragon: "DRAGÓN",
    dark: "SINIESTRO", steel: "ACERO", fairy: "HADA"
};

const traduccionStats = {
    hp: "PS", 
    attack: "ATAQUE", 
    defense: "DEFENSA",
    "special-attack": "AT. ESP", 
    "special-defense": "DEF. ESP", 
    speed: "VELOCID"
};

const rangosGeneracionesPokedex = {
    1: { start: 1, end: 151, nombre: "Gen 1", region: "Kanto", games: [{ text: "ROJO", color: "#ff1111" }, { text: "AZUL", color: "#1155ff" }, { text: "AMARILLO", color: "#ffd400" }] },
    2: { start: 152, end: 251, nombre: "Gen 2", region: "Johto", games: [{ text: "ORO", color: "#d4b35e" }, { text: "PLATA", color: "#cccccc" }, { text: "CRISTAL", color: "#a1e5ff" }] },
    3: { start: 252, end: 386, nombre: "Gen 3", region: "Hoenn", games: [{ text: "RUBÍ", color: "#ff2244" }, { text: "ZAFIRO", color: "#2266ff" }, { text: "ESMERALDA", color: "#11cc66" }] },
    4: { start: 387, end: 493, nombre: "Gen 4", region: "Sinnoh", games: [{ text: "DIAMANTE", color: "#aaaaff" }, { text: "PERLA", color: "#ffaaaa" }, { text: "PLATINO", color: "#999999" }] },
    5: { start: 494, end: 649, nombre: "Gen 5", region: "Teselia", games: [{ text: "BLANCO", color: "#ffffff", border: "#000" }, { text: "NEGRO", color: "#444444" }] },
    6: { start: 650, end: 721, nombre: "Gen 6", region: "Kalos", games: [{ text: "X", color: "#0055ff" }, { text: "Y", color: "#ff2233" }] },
    7: { start: 722, end: 809, nombre: "Gen 7", region: "Alola", games: [{ text: "SOL", color: "#ff8811" }, { text: "LUNA", color: "#5555ff" }] },
    8: { start: 810, end: 905, nombre: "Gen 8", region: "Galar", games: [{ text: "ESPADA", color: "#00ccee" }, { text: "ESCUDO", color: "#ff0066" }] },
    9: { start: 906, end: 1025, nombre: "Gen 9", region: "Paldea", games: [{ text: "ESCARLATA", color: "#ff3311" }, { text: "PÚRPURA", color: "#aa22ff" }] },
    10: { start: 1026, end: 1028, nombre: "Gen 10", region: "SIN REGIÓN", games: [{ text: "WINDS", color: "#00ccee" }, { text: "WAVES", color: "#1155ff" }] }
};

function formatPaddedId(id) {
    return String(id).padStart(3, '0');
}

function conmutarLayoutEntorno(modo) {
    const leftColumn = document.getElementById("left-column");
    const dynamicZone = document.getElementById("dynamic-zone");
    
    if (modo === "lista") {
        if (leftColumn) leftColumn.style.setProperty("display", "none", "important");
        if (dynamicZone) {
            dynamicZone.classList.add("full-screen-zone");
            dynamicZone.style.width = "100%";
            dynamicZone.style.minWidth = "100%";
        }
    } else if (modo === "detalle") {
        if (leftColumn) leftColumn.style.setProperty("display", "flex", "important"); 
        if (dynamicZone) {
            dynamicZone.classList.remove("full-screen-zone");
            dynamicZone.style.width = "";
            dynamicZone.style.minWidth = "";
        }
    }
}

const traduccionNombresEspeciales = {
    "RAGING-BOLT": "ELECTROFURIA", "WALKING-WAKE": "ONDULAGUA", "GOUGING-FIRE": "FLAMARIETE",
    "IRON-LEAVES": "FERROVERDOR", "IRON-CROWN": "FERROTESTA", "IRON-BOULDER": "FERROTESTA",
    "GREAT-TUSK": "COLMILLOLARGO", "SCREAM-TAIL": "COLAGRITO", "BRUTE-BONNET": "FURIOSETA",
    "FLUTTER-MANE": "MELENALALTEO", "SLITHER-WING": "REPTALADA", "SANDY-SHOCKS": "PELARENA",
    "IRON-TREADS": "FERROADA", "IRON-BUNDLE": "FERROSACO", "IRON-HANDS": "FERROMANO",
    "IRON-JUGULIS": "FERROJUGULIS", "IRON-MOTH": "FERROPOLILLA", "IRON-THORNS": "FERROPÚA",
    "ROARING-MOON": "BRAMALUNA", "IRON-VALIANT": "FERROPALADÍN"
};

async function precargarCatalogoBuscar() {
    try {
        let res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
        if (res.ok) {
            let data = await res.json();
            pokedexNombresGlobales = data.results.map((p, index) => {
                let id = index + 1;
                let nombreOriginal = p.name.toUpperCase();
                if (traduccionNombresEspeciales[nombreOriginal]) {
                    nombreOriginal = traduccionNombresEspeciales[nombreOriginal];
                }
                return { id: id, name: nombreOriginal };
            });
            pokedexNombresGlobales.push(
                { id: 1026, name: "BROWT" }, { id: 1027, name: "POMBON" }, { id: 1028, name: "GECQUA" }
            );
        }
    } catch (e) { console.log("Error precargando buscador global."); }
}

let bloqueadoPorBuscador = false;

window.aplicarFiltroBuscador = function() {
    const searchInput = document.getElementById("poke-search");
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    const dynamicZone = document.getElementById("dynamic-zone");

    if (query === "") {
        if (bloqueadoPorBuscador) {
            bloqueadoPorBuscador = false;
            window.mostrarCajaGeneracionDetalle(idGenActiva);
        }
        return;
    }

    bloqueadoPorBuscador = true;
    vistaActual = "lista";
    conmutarLayoutEntorno("lista");

    if (dynamicZone) {
        dynamicZone.innerHTML = `
            <div class="retro-gen-layout">
                <div class="black-info-box"><h2>RESULTADOS DE BÚSQUEDA</h2></div>
                <div id="grid-pokes-3x3" class="grid-gens-3x3"></div>
            </div>
        `;
    }

    const contenedorDestino = document.getElementById("grid-pokes-3x3");
    if (!contenedorDestino) return;

    const filtrados = pokedexNombresGlobales.filter(poke => {
        return poke.name.toLowerCase().includes(query) || poke.id.toString().includes(query);
    });

    if (filtrados.length === 0) {
        contenedorDestino.innerHTML = `<p style="font-size: 8px; color: #000; padding: 10px; grid-column: span 3;">NO SE ENCONTRARON POKÉMON.</p>`;
        return;
    }

    filtrados.forEach(poke => {
        let numPadded = formatPaddedId(poke.id);
        let tarjetaPoke = document.createElement("div");
        tarjetaPoke.className = "item-poke-minimal";
        tarjetaPoke.onclick = () => {
            if (searchInput) searchInput.value = "";
            bloqueadoPorBuscador = false;
            window.cargarPokemonData(poke.id);
        };
        tarjetaPoke.innerHTML = `<span class="poke-num">#${numPadded}</span><span class="poke-name">${poke.name}</span>`;
        contenedorDestino.appendChild(tarjetaPoke);
    });
};

window.seleccionarGenFiltro = function(numGen) {
    if (numGen === 'all') { idGenActiva = 'all'; } else { idGenActiva = parseInt(numGen); }
    const gensBox = document.getElementById("gens-box");
    if (gensBox) gensBox.classList.add("collapsed"); 
    const searchInput = document.getElementById("poke-search");
    if (searchInput) searchInput.value = "";
    bloqueadoPorBuscador = false;
    window.mostrarCajaGeneracionDetalle(numGen);
};

// =========================================================================
// BUSCADOR POR TIPO
// =========================================================================

window.filtrarPorTipo = async function(tipoIngles) {
    const tiposBox = document.getElementById("tipos-box");
    if (tiposBox) tiposBox.classList.add("collapsed");
    const searchInput = document.getElementById("poke-search");
    if (searchInput) searchInput.value = "";
    bloqueadoPorBuscador = true;
    vistaActual = "lista";
    conmutarLayoutEntorno("lista");

    const dynamicZone = document.getElementById("dynamic-zone");
    const nombreTipoEs = traduccionTipos[tipoIngles] || tipoIngles.toUpperCase();
    if (dynamicZone) {
        dynamicZone.innerHTML = `
            <div class="retro-gen-layout">
                <div class="black-info-box"><h2>TIPO: ${nombreTipoEs}</h2></div>
                <div id="grid-pokes-3x3" class="grid-gens-3x3"><p style="font-size:8px;padding:10px;grid-column:1/-1;">CARGANDO...</p></div>
            </div>
        `;
    }

    try {
        const res = await fetch(`https://pokeapi.co/api/v2/type/${tipoIngles}`);
        const data = await res.json();
        const contenedorDestino = document.getElementById("grid-pokes-3x3");
        if (!contenedorDestino) return;
        contenedorDestino.innerHTML = "";

        const lista = data.pokemon
            .map(p => {
                const partes = p.pokemon.url.split("/").filter(Boolean);
                const id = parseInt(partes[partes.length - 1]);
                return { id, urlName: p.pokemon.name };
            })
            .filter(p => !isNaN(p.id) && p.id <= 1025) // fuera formas especiales con ids altísimos
            .sort((a, b) => a.id - b.id);

        if (lista.length === 0) {
            contenedorDestino.innerHTML = `<p style="font-size: 8px; color: #000; padding: 10px; grid-column: 1/-1;">SIN RESULTADOS.</p>`;
            return;
        }

        lista.forEach(p => {
            const entradaGlobal = pokedexNombresGlobales.find(g => g.id === p.id);
            const nombreMostrado = entradaGlobal ? entradaGlobal.name : p.urlName.toUpperCase();
            let tarjetaPoke = document.createElement("div");
            tarjetaPoke.className = "item-poke-minimal";
            tarjetaPoke.onclick = () => { bloqueadoPorBuscador = false; window.cargarPokemonData(p.id); };
            tarjetaPoke.innerHTML = `<span class="poke-num">#${formatPaddedId(p.id)}</span><span class="poke-name">${nombreMostrado}</span>`;
            contenedorDestino.appendChild(tarjetaPoke);
        });
    } catch (e) {
        const contenedorDestino = document.getElementById("grid-pokes-3x3");
        if (contenedorDestino) contenedorDestino.innerHTML = `<p style="font-size:8px;color:red;padding:10px;grid-column:1/-1;">ERROR CARGANDO EL TIPO.</p>`;
    }
};

function construirCajaTipos() {
    const tiposBox = document.getElementById("tipos-box");
    if (!tiposBox) return;
    tiposBox.innerHTML = "";
    Object.keys(traduccionTipos).forEach(tipoIngles => {
        const btn = document.createElement("button");
        btn.textContent = traduccionTipos[tipoIngles];
        const colorTipo = typeColors[tipoIngles] || "#666";
        btn.style.backgroundColor = colorTipo + " !important";
        btn.style.setProperty("background-color", colorTipo, "important");
        btn.style.setProperty("border-color", "#000", "important");
        btn.style.setProperty("color", "#fff", "important");
        btn.style.setProperty("text-shadow", "1px 1px 0 rgba(0,0,0,0.6)", "important");
        btn.onclick = () => window.filtrarPorTipo(tipoIngles);
        tiposBox.appendChild(btn);
    });
}

// =========================================================================
// LISTA DE ATAQUES — clic en uno muestra qué Pokémon lo pueden aprender
// =========================================================================

let listaAtaquesGlobal = [];
let ataquesCargados = false;

// =========================================================================
// CATÁLOGO DE ATAQUES: nombre en español, tipo, poder y precisión de TODOS los ataques.
// Se descarga UNA vez (3 CSV oficiales de la PokéAPI) y lo comparten la lista de ataques y la
// tabla de ataques de cada Pokémon. Así abrir una ficha ya no tiene que pedir sus 22 ataques
// uno detrás de otro a la red (que era lo que hacía lenta cada ficha).
// =========================================================================
window.catalogoAtaques = null;
let promesaCatalogoAtaques = null;

function idDesdeUrl(url) {
    const partes = String(url).split("/").filter(Boolean);
    return parseInt(partes[partes.length - 1], 10);
}

function filasCsv(texto) {
    const lineas = texto.split(/\r?\n/).filter(l => l.trim());
    return { cabecera: lineas[0].split(",").map(c => c.trim()), filas: lineas.slice(1).map(l => l.split(",")) };
}

function cargarCatalogoAtaques() {
    if (window.catalogoAtaques) return Promise.resolve(window.catalogoAtaques);
    if (!promesaCatalogoAtaques) {
        const base = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
        promesaCatalogoAtaques = Promise.all(['moves.csv', 'move_names.csv', 'types.csv'].map(f =>
            fetch(base + f).then(r => { if (!r.ok) throw new Error("csv " + f); return r.text(); })
        )).then(([txtMoves, txtNombres, txtTypes]) => {
            const tipos = filasCsv(txtTypes);
            const iIdent = tipos.cabecera.indexOf("identifier");
            const tipoPorId = {};
            tipos.filas.forEach(f => { tipoPorId[f[0].trim()] = (f[iIdent] || "").trim(); });

            // Nombres en español (idioma 7)
            const nombres = filasCsv(txtNombres);
            const iMove = nombres.cabecera.indexOf("move_id"), iLang = nombres.cabecera.indexOf("local_language_id"), iName = nombres.cabecera.indexOf("name");
            const nombreEs = {};
            nombres.filas.forEach(f => { if ((f[iLang] || "").trim() === "7") nombreEs[f[iMove].trim()] = f.slice(iName).join(",").trim(); });

            const mv = filasCsv(txtMoves);
            const ix = (n) => mv.cabecera.indexOf(n);
            const num = (v) => { v = (v || "").trim(); return v === "" ? null : parseInt(v, 10); };
            const porId = {}, lista = [];
            mv.filas.forEach(f => {
                const idTxt = (f[ix("id")] || "").trim();
                const slug = (f[ix("identifier")] || "").trim();
                if (!idTxt || !slug) return;
                const info = {
                    id: parseInt(idTxt, 10), slug,
                    nombre: nombreEs[idTxt] || slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                    tipoIngles: tipoPorId[(f[ix("type_id")] || "").trim()] || null,
                    poder: num(f[ix("power")]), precision: num(f[ix("accuracy")])
                };
                porId[info.id] = info;
                lista.push(info);
            });
            lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
            window.catalogoAtaques = { porId, lista };
            return window.catalogoAtaques;
        }).catch(e => { promesaCatalogoAtaques = null; throw e; });
    }
    return promesaCatalogoAtaques;
}

const cacheAtaqueRed = {};

window.abrirModalAtaques = async function() {
    const overlay = document.getElementById("modal-ataques");
    if (overlay) overlay.classList.add("active");
    document.getElementById("detalle-ataque")?.classList.add("hidden");
    document.getElementById("lista-ataques")?.classList.remove("hidden");

    if (!ataquesCargados) {
        const cont = document.getElementById("lista-ataques");
        if (cont) cont.innerHTML = `<p style="font-size:8px;padding:10px;grid-column:1/-1;">CARGANDO LISTA DE ATAQUES...</p>`;
        try {
            const cat = await cargarCatalogoAtaques();
            listaAtaquesGlobal = cat.lista
                .filter(m => m.id < 10000) // fuera los ataques "Oscuros" de Colosseum/XD, que no se aprenden
                .map(m => ({ slug: m.slug, nombreMostrado: m.nombre, tipoIngles: m.tipoIngles }));
            ataquesCargados = true;
        } catch (e) {
            if (cont) cont.innerHTML = `<p style="font-size:8px;color:red;padding:10px;grid-column:1/-1;">ERROR CARGANDO LOS ATAQUES.</p>`;
            return;
        }
    }
    renderizarListaAtaques(listaAtaquesGlobal);
};

function renderizarListaAtaques(lista) {
    const cont = document.getElementById("lista-ataques");
    if (!cont) return;
    cont.innerHTML = "";
    if (lista.length === 0) {
        cont.innerHTML = `<p style="font-size:8px;padding:10px;grid-column:1/-1;">SIN RESULTADOS.</p>`;
        return;
    }
    // Limitamos el renderizado a 200 a la vez (son ~900 ataques) para no reventar el DOM;
    // el buscador de arriba sirve para encontrar cualquiera al instante.
    lista.slice(0, 200).forEach(m => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "item-ataque";
        item.textContent = m.nombreMostrado;
        if (m.tipoIngles && typeColors[m.tipoIngles]) {
            item.style.borderLeft = `5px solid ${typeColors[m.tipoIngles]}`;
        }
        item.onclick = () => window.mostrarDetalleAtaque(m.slug, m.nombreMostrado);
        cont.appendChild(item);
    });
    if (lista.length > 200) {
        const aviso = document.createElement("p");
        aviso.style = "font-size:7px;color:#666;padding:6px;grid-column:1/-1;";
        aviso.textContent = `Mostrando 200 de ${lista.length} — usa el buscador para encontrar el tuyo.`;
        cont.appendChild(aviso);
    }
}

window.mostrarDetalleAtaque = async function(slug, nombreMostrado) {
    document.getElementById("lista-ataques")?.classList.add("hidden");
    const detalle = document.getElementById("detalle-ataque");
    if (!detalle) return;
    detalle.classList.remove("hidden");
    detalle.innerHTML = `<button class="btn-volver-ataques" onclick="window.volverListaAtaques()">◄ VOLVER</button><p style="font-size:8px;padding:10px;">Cargando "${nombreMostrado}"...</p>`;

    try {
        const res = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
        const data = await res.json();
        const nombreEs = data.names?.find(n => n.language.name === "es")?.name || nombreMostrado;
        const tipoEs = traduccionTipos[data.type?.name] || (data.type?.name || "?").toUpperCase();
        const colorTipo = typeColors[data.type?.name] || "#888";
        const poder = data.power !== null && data.power !== undefined ? data.power : "—";
        const precision = data.accuracy !== null && data.accuracy !== undefined ? data.accuracy : "—";
        const pp = data.pp !== null && data.pp !== undefined ? data.pp : "—";

        detalle.innerHTML = `
            <button class="btn-volver-ataques" onclick="window.volverListaAtaques()">◄ VOLVER</button>
            <h3 class="ataque-nombre-detalle">${nombreEs}</h3>
            <div class="ataque-chips-row">
                <span class="chip-tipo-ataque" style="background:${colorTipo}">${tipoEs}</span>
                <span class="chip-stat-ataque">PODER: ${poder}</span>
                <span class="chip-stat-ataque">PRECISIÓN: ${precision}</span>
                <span class="chip-stat-ataque">PP: ${pp}</span>
            </div>
            <button type="button" class="btn-filtrar-ataque" id="btn-filtrar-ataque">🔎 FILTRAR LA POKÉDEX POR ESTE ATAQUE</button>
            <p class="ataque-aprendices-titulo">POKÉMON QUE LO PUEDEN APRENDER (${data.learned_by_pokemon.length}):</p>
            <div id="grid-aprendices" class="lista-ataques-grid grid-gens-3x3"></div>
        `;

        const btnFiltrarAtaque = document.getElementById("btn-filtrar-ataque");
        if (btnFiltrarAtaque) btnFiltrarAtaque.onclick = () => window.filtrarPorAtaque(slug, nombreEs);

        const gridAprendices = document.getElementById("grid-aprendices");
        if (data.learned_by_pokemon.length === 0) {
            gridAprendices.innerHTML = `<p style="font-size:8px;padding:6px;grid-column:1/-1;">Ningún Pokémon lo aprende actualmente.</p>`;
        } else {
            data.learned_by_pokemon.forEach(p => {
                const partes = p.url.split("/").filter(Boolean);
                const id = parseInt(partes[partes.length - 1]);
                if (isNaN(id) || id > 1025) return;
                const entradaGlobal = pokedexNombresGlobales.find(g => g.id === id);
                const nombreMostradoPoke = entradaGlobal ? entradaGlobal.name : p.name.toUpperCase();
                const tarjeta = document.createElement("div");
                tarjeta.className = "item-poke-minimal";
                tarjeta.onclick = () => { window.cerrarModalAtaques(); window.cargarPokemonData(id); };
                tarjeta.innerHTML = `<span class="poke-num">#${formatPaddedId(id)}</span><span class="poke-name">${nombreMostradoPoke}</span>`;
                gridAprendices.appendChild(tarjeta);
            });
        }
    } catch (e) {
        detalle.innerHTML = `<button class="btn-volver-ataques" onclick="window.volverListaAtaques()">◄ VOLVER</button><p style="font-size:8px;color:red;padding:10px;">ERROR CARGANDO EL ATAQUE.</p>`;
    }
};

window.volverListaAtaques = function() {
    document.getElementById("detalle-ataque")?.classList.add("hidden");
    document.getElementById("lista-ataques")?.classList.remove("hidden");
};

window.cerrarModalAtaques = function() {
    document.getElementById("modal-ataques")?.classList.remove("active");
};

document.addEventListener("DOMContentLoaded", () => {
    window.mostrarPantallaInicialOcupandoTodo();
    precargarCatalogoBuscar();
    construirCajaTipos();
    precargarPokedexCompleta(); // pantalla de carga con Wooper/Goomy hasta tener todo cacheado

    const btnGenToggle = document.getElementById("btn-toggle-gens");
    const gensBox = document.getElementById("gens-box");
    const btnTiposToggle = document.getElementById("btn-toggle-tipos");
    const tiposBox = document.getElementById("tipos-box");
    const searchInput = document.getElementById("poke-search");
    const buscarAtaqueInput = document.getElementById("buscar-ataque");

    if (btnGenToggle && gensBox) {
        btnGenToggle.addEventListener("click", (e) => {
            e.preventDefault(); 
            if (tiposBox) tiposBox.classList.add("collapsed");
            gensBox.classList.toggle("collapsed");
        });
    }
    if (btnTiposToggle && tiposBox) {
        btnTiposToggle.addEventListener("click", (e) => {
            e.preventDefault();
            if (gensBox) gensBox.classList.add("collapsed");
            tiposBox.classList.toggle("collapsed");
        });
    }
    if (searchInput) {
        searchInput.addEventListener("input", window.aplicarFiltroBuscador);
    }
    if (buscarAtaqueInput) {
        buscarAtaqueInput.addEventListener("input", () => {
            const q = buscarAtaqueInput.value.toLowerCase().trim();
            const filtrados = q === "" ? listaAtaquesGlobal : listaAtaquesGlobal.filter(m => m.nombreMostrado.toLowerCase().includes(q) || m.slug.includes(q));
            renderizarListaAtaques(filtrados);
        });
    }
});


window.mostrarPantallaInicialOcupandoTodo = function() {
    vistaActual = "lista"; 
    currentPokemonId = null;
    conmutarLayoutEntorno("lista");
    
    const dynamicZone = document.getElementById("dynamic-zone");
    if (dynamicZone) {
        dynamicZone.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100%; width:100%;">
                <h2 class="texto-parpadeante" style="font-family:'Press Start 2P', monospace; font-size:11px; color:#000; text-align:center; line-height:2;">
                    &lt;&lt; SELECCIONA UNA GENERACIÓN &gt;&gt;
                </h2>
            </div>
        `;
    }
    
    const pokeIdDisplay = document.getElementById("poke-id");
    if (pokeIdDisplay) {
        pokeIdDisplay.innerText = "#---";
    }
};

window.mostrarCajaGeneracionDetalle = async function(numGen) {
    if (numGen === 'all') { idGenActiva = 'all'; } else { idGenActiva = parseInt(numGen); }
    vistaActual = "lista";
    conmutarLayoutEntorno("lista");

    const dynamicZone = document.getElementById("dynamic-zone");
    if (!dynamicZone) return;

    if (numGen === 'all') {
        dynamicZone.innerHTML = `
            <div class="retro-gen-layout" style="height: 100%; display: flex; flex-direction: column;">
                <div class="moves-table-scroll-wrapper" style="flex: 1; width: 100%; overflow-y: auto; padding-right: 4px;">
                    <div id="contenedor-todas-gens" style="display: flex; flex-direction: column; gap: 15px; width: 100%;">
                        <p style="font-size: 8px; color: #000; padding: 10px;">GENERANDO CATÁLOGO NACIONAL COMPLETO...</p>
                    </div>
                </div>
            </div>
        `;

        let contenedorGlobal = document.getElementById("contenedor-todas-gens");
        let htmlCompleto = "";

        for (let g = 1; g <= 10; g++) {
            let rango = rangosGeneracionesPokedex[g];
            if (!rango) continue;

            let juegosHtml = "";
            rango.games.forEach(game => {
                let borderStyle = game.border ? `border:1px solid ${game.border};` : 'border:1px solid #000;';
                let textColor = game.color === "#ffffff" ? "#000" : "#fff";
                juegosHtml += `<span style="background:${game.color}; color:${textColor}; padding:2px 4px; font-size:0.5rem; margin-left:4px; font-weight:bold; ${borderStyle}">${game.text}</span>`;
            });

            htmlCompleto += `
                <div class="black-info-box" style="margin-top: ${g === 1 ? '0' : '25px'}; width: 100%; flex-shrink: 0;">
                    <h2 style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; font-size: 10px;">
                        GEN ${g} - ${rango.region.toUpperCase()} ${juegosHtml}
                    </h2>
                </div>
                <div class="grid-gens-3x3" id="grid-gen-all-${g}" style="overflow: visible; width: 100%;">
            `;

            for (let id = rango.start; id <= rango.end; id++) {
                let cachedObj = pokedexNombresGlobales.find(p => p.id === id);
                let nombrePoke = cachedObj ? cachedObj.name : `POKEMON #${id}`;
                let numPadded = formatPaddedId(id);

                htmlCompleto += `
                    <div class="item-poke-minimal" onclick="window.cargarPokemonData(${id});">
                        <span class="poke-num">#${numPadded}</span><span class="poke-name">${nombrePoke}</span>
                    </div>
                `;
            }
            htmlCompleto += `</div>`; 
        }

        if (contenedorGlobal) contenedorGlobal.innerHTML = htmlCompleto;
        return;
    }

    const rango = rangosGeneracionesPokedex[numGen];
    let juegosHtml = "";
    if (rango && rango.games) {
        rango.games.forEach(g => {
            let borderStyle = g.border ? `border:1px solid ${g.border};` : 'border:1px solid #000;';
            let textColor = g.color === "#ffffff" ? "#000" : "#fff";
            juegosHtml += `<span style="background:${g.color}; color:${textColor}; padding:2px 4px; font-size:0.5rem; margin-left:4px; font-weight:bold; ${borderStyle}">${g.text}</span>`;
        });
    }

    dynamicZone.innerHTML = `
        <div class="retro-gen-layout">
            <div class="black-info-box">
                <h2 style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0;">
                    GEN ${numGen} - ${rango?.region?.toUpperCase() || "DESCONOCIDA"} ${juegosHtml}
                </h2>
            </div>
            <div id="grid-pokes-3x3" class="grid-gens-3x3">
                <p style="font-size: 8px; color: #000; grid-column: span 3;">CARGANDO REJILLA...</p>
            </div>
        </div>
    `;

    if (parseInt(numGen) === 10) {
        const gridContenedor = document.getElementById("grid-pokes-3x3");
        if (!gridContenedor) return;
        gridContenedor.innerHTML = "";

        let gen10Local = pokedexNombresGlobales.filter(p => p.id >= rango.start && p.id <= rango.end);
        gen10Local.forEach(poke => {
            let numPadded = formatPaddedId(poke.id);
            let tarjetaPoke = document.createElement("div");
            tarjetaPoke.className = "item-poke-minimal";
            tarjetaPoke.onclick = () => { window.cargarPokemonData(poke.id); };
            tarjetaPoke.innerHTML = `<span class="poke-num">#${numPadded}</span><span class="poke-name">${poke.name}</span>`;
            gridContenedor.appendChild(tarjetaPoke);
        });
        return;
    }

    try {
        let respuesta = await fetch(`https://pokeapi.co/api/v2/generation/${numGen}/`);
        let datosGen = await respuesta.json();
        
        let pokemonListData = datosGen.pokemon_species.map(specie => {
            let id = parseInt(specie.url.split("/").slice(-2, -1)[0]);
            let cachedObj = pokedexNombresGlobales.find(p => p.id === id);
            let nombreFinal = cachedObj ? cachedObj.name : specie.name.toUpperCase();
            return { id: id, name: nombreFinal };
        }).filter(p => p.id >= rango.start && p.id <= rango.end).sort((a, b) => a.id - b.id);

        const gridContenedor = document.getElementById("grid-pokes-3x3");
        if (!gridContenedor) return;
        gridContenedor.innerHTML = ""; 

        pokemonListData.forEach(poke => {
            let numPadded = formatPaddedId(poke.id);
            let tarjetaPoke = document.createElement("div");
            tarjetaPoke.className = "item-poke-minimal";
            tarjetaPoke.onclick = () => { window.cargarPokemonData(poke.id); };
            tarjetaPoke.innerHTML = `<span class="poke-num">#${numPadded}</span><span class="poke-name">${poke.name}</span>`;
            gridContenedor.appendChild(tarjetaPoke);
        });
    } catch (error) {}
};

// Caché de Pokémon ya consultados a la PokéAPI: {id -> {data, speciesData, evoChainData}}.
// Así, volver a un Pokémon que ya visitaste (o uno que se precargó en segundo plano)
// no vuelve a pedir nada a la red, se muestra al instante.
window.cachePokemonCompleto = window.cachePokemonCompleto || {};

// Ya no hace falta precargar "sobre la marcha": toda la Pokédex se carga de golpe
// al entrar (ver precargarPokedexCompleta), así que esto queda vacío por compatibilidad.
function precargarVecinos(idActual) {}

// Evita pedir la misma cadena evolutiva más de una vez (muchos Pokémon comparten familia)
window.cacheEvoChainPorUrl = window.cacheEvoChainPorUrl || {};

async function cargarDatosCompletosPokemon(id) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    const data = await res.json();
    const resEspecie = await fetch(data.species.url);
    const speciesData = await resEspecie.json();

    let evoChainData = null;
    if (speciesData.evolution_chain?.url) {
        const urlEvo = speciesData.evolution_chain.url;
        if (window.cacheEvoChainPorUrl[urlEvo]) {
            evoChainData = window.cacheEvoChainPorUrl[urlEvo];
        } else {
            try {
                const resEvo = await fetch(urlEvo);
                evoChainData = await resEvo.json();
                window.cacheEvoChainPorUrl[urlEvo] = evoChainData;
            } catch (ee) { evoChainData = null; }
        }
    }
    return { data, speciesData, evoChainData };
}

// Carga TODA la Pokédex (1 a 1025) nada más entrar, mostrando una pantalla de carga
// visible con progreso real, para que luego cambiar entre Pokémon sea instantáneo.
async function precargarPokedexCompleta() {
    const overlay = document.getElementById("loading-overlay-pokedex");
    const contador = document.getElementById("loading-progreso");
    const TOTAL = 1025;
    const CONCURRENCIA = 20; // nº de peticiones en paralelo por lote
    let completados = 0;

    const ids = Array.from({ length: TOTAL }, (_, i) => i + 1);

    // El catálogo de ataques se baja a la vez que los Pokémon (así las fichas salen al instante)
    const promesaCat = cargarCatalogoAtaques().catch(() => {});

    for (let i = 0; i < ids.length; i += CONCURRENCIA) {
        const lote = ids.slice(i, i + CONCURRENCIA);
        await Promise.all(lote.map(async (id) => {
            if (!window.cachePokemonCompleto[id]) {
                try {
                    window.cachePokemonCompleto[id] = await cargarDatosCompletosPokemon(id);
                } catch (e) {
                    // si uno en concreto falla, seguimos con el resto sin bloquear la carga
                }
            }
            completados++;
            if (contador) contador.textContent = `${completados} / ${TOTAL}`;
        }));
    }

    await promesaCat;
    if (overlay) overlay.classList.add("hidden");
}

window.cargarPokemonData = async function(id) {
    currentPokemonId = id;
    vistaActual = "detalle";
    
    const zone = document.getElementById("dynamic-zone");
    if(!zone) return;
    
    if (mainAnimationId) {
        cancelAnimationFrame(mainAnimationId);
        mainAnimationId = null;
    }
    renderer = null; scene = null; camera = null; currentModel = null;
    
    try {
        let data = null;
        let speciesData = null;
        let evoChainData = null;

        // Si ya tenemos este Pokémon en caché (visitado antes o precargado en segundo
        // plano), nos lo ahorramos todo y vamos directos a pintar la ficha.
        if (id < 1026 && window.cachePokemonCompleto[id]) {
            const cacheado = window.cachePokemonCompleto[id];
            data = cacheado.data;
            speciesData = cacheado.speciesData;
            evoChainData = cacheado.evoChainData;

            window.currentPokemonDataStorage = data;
            await window.renderizarVistaDetail(data, speciesData, evoChainData);
            const pokeIdDisplayCache = document.getElementById("poke-id");
            if (pokeIdDisplayCache) pokeIdDisplayCache.innerText = "#" + String(id).padStart(3, '0');
            precargarVecinos(id);
            conmutarLayoutEntorno("detalle");
            window.manejarVisualizacionMedia(data);
            return;
        }

        // Soporte especial para la Generación 10 personalizada o peticiones estándar
        if (id >= 1026) {
            const objetoNombreGlobal = pokedexNombresGlobales.find(p => p.id === id);
            const nombreMapeado = objetoNombreGlobal ? objetoNombreGlobal.name : "DESCONOCIDO";
            
            data = {
                id: id, name: nombreMapeado.toLowerCase(), height: 10, weight: 300,
                sprites: {
                    other: {
                        "official-artwork": {
                            front_default: `/assets-main/sprites/${id}.png`, front_shiny: `/assets-main/sprites/${id}.png`
                        }
                    }
                },
                types: [{ type: { name: id === 1026 ? "grass" : id === 1027 ? "fire" : "water" } }],
                stats: [
                    { base_stat: 70, stat: { name: "hp" } }, { base_stat: 85, stat: { name: "attack" } },
                    { base_stat: 65, stat: { name: "defense" } }, { base_stat: 105, stat: { name: "special-attack" } },
                    { base_stat: 75, stat: { name: "special-defense" } }, { base_stat: 90, stat: { name: "speed" } }
                ],
                moves: []
            };

            speciesData = {
                flavor_text_entries: [{ flavor_text: "Pokémon inicial descubierto en la región de la Gen 10. Datos biológicos actualmente en investigación.", language: { name: "es" } }],
                names: [{ name: nombreMapeado, language: { name: "es" } }]
            };
            evoChainData = { chain: null };
        } else {
            // Carga normal desde PokéAPI (lo normal es que esto ya esté en caché
            // porque precargarPokedexCompleta() lo trajo todo al entrar)
            const resultado = await cargarDatosCompletosPokemon(id);
            data = resultado.data;
            speciesData = resultado.speciesData;
            evoChainData = resultado.evoChainData;
        }

        // Guardamos el objeto en caché global para variantes visuales
        window.currentPokemonDataStorage = data;

        // Y también en la caché por ID, para que no haya que volver a pedirlo nunca más
        if (id < 1026) {
            window.cachePokemonCompleto[id] = { data, speciesData, evoChainData };
        }
        
        // 1. Renderizamos la preciosa vista detallada con tablas que tienes abajo
        await window.renderizarVistaDetail(data, speciesData, evoChainData);
        
        // 2. Actualizamos el número digital (#015, #001) en el LED de arriba a la izquierda
        const pokeIdDisplay = document.getElementById("poke-id");
        if (pokeIdDisplay) {
            pokeIdDisplay.innerText = "#" + String(id).padStart(3, '0');
        }

        // Precargamos el anterior/siguiente en segundo plano para que las flechas ◄ ► vayan fluidas
        precargarVecinos(id);

        // 3. Conmutamos los layouts para mostrar las columnas y cargamos el canvas 3D o 2D
        conmutarLayoutEntorno("detalle");
        window.manejarVisualizacionMedia(data);
        
    } catch (err) {
        console.error("Error al cargar detalle del Pokémon:", err);
        zone.innerHTML = `<p style="padding:20px; color:red; font-family:'Press Start 2P', monospace; font-size:8px;">Error al conectar con el Laboratorio del Prof. Oak.</p>`;
    }
};

window.cambiarPokemon = function(direccion) {
    if (!currentPokemonId) return;
    const rejillaBotonesExiste = document.getElementById("grid-pokes-3x3") || document.getElementById("contenedor-todas-gens");
    let modoListaActivo = (vistaActual === "lista" || rejillaBotonesExiste);
    let genAntesDeCambiar = idGenActiva;

    let objetivoId = currentPokemonId + direccion;
    if (objetivoId < 1) objetivoId = 1028;
    if (objetivoId > 1028) objetivoId = 1;

    window.cargarPokemonData(objetivoId).then(() => {
        if (modoListaActivo) {
            vistaActual = "lista";
            conmutarLayoutEntorno("lista");

            let nuevaGenCalculada = idGenActiva;
            for (const genKey in rangosGeneracionesPokedex) {
                if (objetivoId >= rangosGeneracionesPokedex[genKey].start && objetivoId <= rangosGeneracionesPokedex[genKey].end) {
                    nuevaGenCalculada = (idGenActiva === 'all') ? 'all' : parseInt(genKey);
                    break;
                }
            }

            if (nuevaGenCalculada !== genAntesDeCambiar && genAntesDeCambiar !== 'all') {
                idGenActiva = nuevaGenCalculada;
                window.mostrarCajaGeneracionDetalle(nuevaGenCalculada);
            } else {
                const items = document.querySelectorAll(".item-poke-minimal");
                items.forEach(item => item.classList.remove("active"));
            }
        }
    });
};

window.toggleVistaLista = function() { window.mostrarCajaGeneracionDetalle(idGenActiva); };
window.mostrarTodasLasGeneraciones = function() {
    idGenActiva = 'all';
    const gensBox = document.getElementById("gens-box");
    if (gensBox) gensBox.classList.add("collapsed"); 
    const searchInput = document.getElementById("poke-search");
    if (searchInput) searchInput.value = "";
    bloqueadoPorBuscador = false;
    window.mostrarCajaGeneracionDetalle('all');
};

window.renderizarVistaDetail = async function(data, speciesData, evoChainData) {
    let activeGenIndex = (idGenActiva === 'all') ? 1 : idGenActiva;
    for (const genKey in rangosGeneracionesPokedex) {
        if (data.id >= rangosGeneracionesPokedex[genKey].start && data.id <= rangosGeneracionesPokedex[genKey].end) {
            activeGenIndex = parseInt(genKey);
            break;
        }
    }
    
    let rango = rangosGeneracionesPokedex[activeGenIndex];
    let juegosHtml = "";
    if (rango) {
        rango.games.forEach(g => {
            let borderStyle = g.border ? `border:1px solid ${g.border};` : 'border:1px solid #000;';
            let textColor = g.color === "#ffffff" ? "#000" : "#fff";
            juegosHtml += `<span style="background:${g.color}; color:${textColor}; padding:2px 4px; font-size:0.5rem; margin-left:4px; font-weight:bold; ${borderStyle}">${g.text}</span>`;
        });
    }
    
    const dynamicZone = document.getElementById("dynamic-zone");
    if(!dynamicZone) return;

    let descEntry = speciesData.flavor_text_entries ? speciesData.flavor_text_entries.find(e => e.language.name === 'es') : null;
    let textoDescripcion = "";

    if (descEntry) {
        textoDescripcion = descEntry.flavor_text;
    } else if (speciesData.flavor_text_entries) {
        let engEntry = speciesData.flavor_text_entries.find(e => e.language.name === 'en');
        if (engEntry) {
            let textoIngles = engEntry.flavor_text.replace(/\n|\f/g, ' ');
            textoDescripcion = textoIngles; 
            fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textoIngles)}&langpair=en|es`)
                .then(res => res.json())
                .then(translateData => {
                    if (translateData && translateData.responseData && translateData.responseData.translatedText) {
                        let traduccionLimpia = translateData.responseData.translatedText;
                        const descBoxElement = document.querySelector(".desc-box");
                        if (descBoxElement) descBoxElement.innerText = "DESC: " + traduccionLimpia;
                    }
                }).catch(err => console.log("Error al traducir la descripción:", err));
        } else { textoDescripcion = "No hay descripción oficial disponible."; }
    } else { textoDescripcion = "No hay descripción oficial disponible."; }

    let nombreCastellano = data.name.toUpperCase(); 
    if (speciesData && speciesData.names) {
        let nameEntry = speciesData.names.find(n => n.language.name === 'es');
        if (nameEntry) nombreCastellano = nameEntry.name.toUpperCase();
    }

    let statPS  = data.stats.find(s => s.stat.name === "hp")?.base_stat || 0;
    let statAT  = data.stats.find(s => s.stat.name === "attack")?.base_stat || 0;
    let statDF  = data.stats.find(s => s.stat.name === "defense")?.base_stat || 0;
    let statSA  = data.stats.find(s => s.stat.name === "special-attack")?.base_stat || 0;
    let statSD  = data.stats.find(s => s.stat.name === "special-defense")?.base_stat || 0;
    let statVEL = data.stats.find(s => s.stat.name === "speed")?.base_stat || 0;
    let altura  = data.height === 0 ? "DESCONOCIDO" : (data.height / 10) + "m";
    let peso    = data.weight === 0 ? "DESCONOCIDO" : (data.weight / 10) + "kg";

    let tipo1Raw = data.types[0]?.type.name || "-";
    let tipo2Raw = data.types[1]?.type.name || "-";
    let tipo1Traducido = traduccionTipos[tipo1Raw.toLowerCase()] || tipo1Raw.toUpperCase();
    let tipo2Traducido = tipo2Raw !== "-" ? (traduccionTipos[tipo2Raw.toLowerCase()] || tipo2Raw.toUpperCase()) : "-";
    let tipo1BgColor = typeColors[tipo1Raw.toLowerCase()] || "#cef5ff";
    let tipo2BgColor = typeColors[tipo2Raw.toLowerCase()] || "#cef5ff";

    let htmlBloqueTipos = `
        <div class="tipos-container-grid">
            <div class="stat-item-tipo"><span class="stat-label-tipo">TIPO 1</span><span class="stat-value-tipo" style="background: ${tipo1BgColor}; color:#fff; text-shadow:1px 1px #000;">${tipo1Traducido}</span></div>
            <div class="stat-item-tipo"><span class="stat-label-tipo">TIPO 2</span><span class="stat-value-tipo" style="background:${tipo2Raw !== '-' ? tipo2BgColor : '#cef5ff'}; color:${tipo2Raw !== '-' ? '#fff' : '#000'}; text-shadow:${tipo2Raw !== '-' ? '1px 1px #000' : 'none'};">${tipo2Traducido}</span></div>
        </div>
    `;

    let todosLosNodos = [];
    const procesarNodoEvoMúltiple = (nodo) => {
        if (!nodo || !nodo.species || !nodo.species.url) return;
        let id = parseInt(nodo.species.url.split("/").slice(-2, -1)[0]);
        let rutaImagenEvo = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
        if (currentVariante === "shiny") rutaImagenEvo = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;

        todosLosNodos.push({ id: isNaN(id) ? currentPokemonId : id, name: nodo.species.name.toUpperCase(), img: isNaN(id) ? "" : rutaImagenEvo });
        if (nodo.evolves_to && nodo.evolves_to.length > 0) {
            nodo.evolves_to.forEach(subNodo => procesarNodoEvoMúltiple(subNodo));
        }
    };

    if (evoChainData && evoChainData.chain) procesarNodoEvoMúltiple(evoChainData.chain);

    let tieneRamificaciones = evoChainData?.chain?.evolves_to ? (evoChainData.chain.evolves_to.length > 1 || evoChainData.chain.evolves_to.some(e => e.evolves_to && e.evolves_to.length > 1)) : false;
    let evoHtml = "";

    if (tieneRamificaciones && todosLosNodos.length > 0) {
        let baseNode = todosLosNodos[0];
        let ramasEvoluciones = todosLosNodos.slice(1);
        let bordeEevee = (baseNode.id === currentPokemonId) ? "border: 2px solid #ffcc00 !important;" : "border: 2px solid #000 !important;";

        evoHtml = `
            <div class="evo-tree-container" style="display:flex; flex-direction:column; align-items:center; width:100%; height:100%; justify-content:center; box-sizing:border-box;">
                <div class="evo-top-row" style="display:flex; flex-direction:column; align-items:center; width:100%;">
                    <div class="evo-poke-node" onclick="window.cargarPokemonData(${baseNode.id})" style="cursor:pointer; padding:4px; ${bordeEevee}">
                        <img src="${baseNode.img}" style="width:34px; height:34px; object-fit:contain;"><span>${baseNode.name}</span>
                    </div>
                    <div style="font-family:'Press Start 2P'; font-size:11px; color:#000; margin:4px 0;">↓</div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(45px, 1fr)); gap:6px 5px; width:100%; justify-content:center;">
        `;
        ramasEvoluciones.forEach((nodo) => {
            let bordeEspecial = (nodo.id === currentPokemonId) ? "border:2px solid #ffcc00 !important;" : "border:2px solid #000 !important;";
            evoHtml += `
                <div class="evo-poke-node" onclick="window.cargarPokemonData(${nodo.id})" style="cursor:pointer; padding:3px; ${bordeEspecial}">
                    <img src="${nodo.img}" style="width:32px; height:32px; object-fit:contain;"><span>${nodo.name}</span>
                </div>
            `;
        });
        evoHtml += `</div></div>`;
    } else if (todosLosNodos.length > 0) {
        evoHtml = `<div style="display:flex; flex-direction:row; align-items:center; justify-content:center; gap:6px; width:100%; height:100%;">`;
        todosLosNodos.forEach((nodo, index) => {
            let bordeEspecial = (nodo.id === currentPokemonId) ? "border:2px solid #ffcc00 !important;" : "border:2px solid #000 !important;";
            evoHtml += `
                <div class="evo-poke-node" onclick="window.cargarPokemonData(${nodo.id})" style="cursor:pointer; ${bordeEspecial}">
                    ${nodo.img ? `<img src="${nodo.img}" style="width:44px; height:44px; object-fit:contain;">` : `<div style="width:44px; height:44px; background:#e0f7fa; border:1px dashed #000;"></div>`}
                    <span>${nodo.name}</span>
                </div>
            `;
            if (index < todosLosNodos.length - 1) evoHtml += `<div style="font-family:'Press Start 2P'; font-size:12px; color:#000;">►</div>`;
        });
        evoHtml += `</div>`;
    } else { evoHtml = `<div style="font-size:7px; color:#555; text-align:center; padding:10px;">NO TIENE CADENA EVOLUTIVA</div>`; }

    let movesToFetch = data.moves ? data.moves.slice(0, 22) : [];
    let movesRowsHtml = "";

    let catalogo = null;
    try { catalogo = await cargarCatalogoAtaques(); } catch (e) { catalogo = null; }

    // Con el catálogo es instantáneo (sin red). Si no se pudo descargar, se piden en PARALELO
    // (no uno a uno) y se recuerdan para la próxima vez.
    const infoAtaques = await Promise.all(movesToFetch.map(async (m) => {
        const base = { nombre: m.move.name.replace(/-/g, " ").toUpperCase(), tipo: "normal", poder: "-", precision: "-" };
        const info = catalogo && catalogo.porId[idDesdeUrl(m.move.url)];
        if (info) {
            return { nombre: info.nombre.toUpperCase(), tipo: info.tipoIngles || "normal",
                     poder: info.poder !== null ? info.poder : "-", precision: info.precision !== null ? info.precision + "%" : "-" };
        }
        try {
            if (!cacheAtaqueRed[m.move.url]) cacheAtaqueRed[m.move.url] = fetch(m.move.url).then(r => r.ok ? r.json() : null);
            const d = await cacheAtaqueRed[m.move.url];
            if (d) {
                const esp = d.names.find(n => n.language.name === "es");
                return { nombre: (esp ? esp.name : base.nombre).toUpperCase(), tipo: d.type.name,
                         poder: d.power !== null ? d.power : "-", precision: d.accuracy !== null ? d.accuracy + "%" : "-" };
            }
        } catch (err) {}
        return base;
    }));

    for (const a of infoAtaques) {
        let badgeColor = typeColors[a.tipo.toLowerCase()] || "#666";
        movesRowsHtml += `
            <tr>
                <td style="text-align:left; font-weight:bold; padding-left:6px;">${a.nombre}</td>
                <td><span class="move-type-pill" style="background-color:${badgeColor};">${traduccionTipos[a.tipo.toLowerCase()] || a.tipo.toUpperCase()}</span></td>
                <td>${a.poder}</td>
                <td style="padding-right:6px;">${a.precision}</td>
            </tr>
        `;
    }

    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${nombreCastellano}</h2>
                    <div class="poke-header-meta">
                        <span class="poke-gen-region">GEN ${activeGenIndex} · ${rango ? rango.region.toUpperCase() : "DESCONOCIDA"}</span>
                        ${juegosHtml}
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-item"><span class="stat-label">PS</span><span class="stat-value">${statPS}</span></div>
                    <div class="stat-item"><span class="stat-label">AT</span><span class="stat-value">${statAT}</span></div>
                    <div class="stat-item"><span class="stat-label">DF</span><span class="stat-value">${statDF}</span></div>
                    <div class="stat-item"><span class="stat-label">SA</span><span class="stat-value">${statSA}</span></div>
                    <div class="stat-item"><span class="stat-label">SD</span><span class="stat-value">${statSD}</span></div>
                    <div class="stat-item"><span class="stat-label">VEL</span><span class="stat-value">${statVEL}</span></div>
                    <div class="stat-item"><span class="stat-label">ALT</span><span class="stat-value">${altura}</span></div>
                    <div class="stat-item"><span class="stat-label">PES</span><span class="stat-value">${peso}</span></div>
                </div>
                ${htmlBloqueTipos}
                <div class="desc-box">DESC: ${textoDescripcion.replace(/\n|\f/g, ' ')}</div>
            </div>
            <div class="view-right-panel" style="flex:1;">
                <div class="evo-section-box">
                    <div class="evo-title-label" style="background:#000; color:#fff; padding:4px 0;">CADENA EVOLUTIVA</div>
                    <div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;">${evoHtml}</div>
                </div>
                <div class="moves-section-box">
                    <div class="moves-title-label" style="background:#000; color:#fff; padding:4px 0;">MOVIMIENTOS APRENDIDOS</div>
                    <div class="moves-table-scroll-wrapper">
                        <table class="moves-retro-table">
                            <thead><tr><th style="text-align:left; padding-left:6px;">MOV</th><th>TIPO</th><th>POT</th><th style="padding-right:6px;">PRE</th></tr></thead>
                            <tbody>${movesRowsHtml ? movesRowsHtml : '<tr><td colspan="4" style="padding:15px; font-size:7px; color:#555; text-align:center;">SIN REGISTROS OFICIALES</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    conmutarLayoutEntorno("detalle");
};

window.manejarVisualizacionMedia = function(data) {
    let box = document.getElementById("caja-render-imagen");
    if(!box) return;
    
    if (mainAnimationId) cancelAnimationFrame(mainAnimationId);
    box.innerHTML="";

    if (modo3DActivo) {
        let cargandoTxt = document.createElement("div");
        cargandoTxt.id = "cargando-retro-text";
        cargandoTxt.style = "font-size:7px;color:black;text-align:center;padding-top:45px;font-family:'Press Start 2P';position:absolute;width:100%;";
        cargandoTxt.innerText = `CARGANDO 3D...`;
        box.appendChild(cargandoTxt);
        setTimeout(() => { window.inicializarVisorBlender3D(box, data.id); }, 50);
    } else {
        const shiny = (currentVariante === "shiny");
        const arte = data.sprites?.other?.["official-artwork"] || {};
        const home = data.sprites?.other?.home || {};
        const urlPoster = shiny ? (arte.front_shiny || arte.front_default) : arte.front_default;
        const urlPixel  = shiny ? (data.sprites?.front_shiny || data.sprites?.front_default) : data.sprites?.front_default;
        const urlHome   = shiny ? (home.front_shiny || home.front_default) : home.front_default;
        // Sprites animados (GIF) de Pokémon Showdown
        const urlAnimado = `https://play.pokemonshowdown.com/sprites/ani${shiny ? "-shiny" : ""}/${data.name}.gif`;

        // Cadena de planes B. Los Pokémon de juegos en 3D (sobre todo las últimas generaciones)
        // no tienen sprite pixelado, así que se prueba la siguiente opción hasta que una cargue.
        const AVISO = "SIN PIXEL ART · JUEGO EN 3D";
        let candidatos = [];
        if (modoImagen === "animado") {
            candidatos = [{ url: urlAnimado, pixel: true }, { url: urlPixel, pixel: true }, { url: urlHome, pixel: false, aviso: AVISO }, { url: urlPoster, pixel: false, aviso: AVISO }];
        } else if (modoImagen === "sprite") {
            candidatos = [{ url: urlPixel, pixel: true }, { url: urlHome, pixel: false, aviso: AVISO }, { url: urlPoster, pixel: false, aviso: AVISO }];
        } else {
            candidatos = [{ url: urlPoster, pixel: false }, { url: urlHome, pixel: false }];
        }
        candidatos = candidatos.filter(c => !!c.url);
        candidatos.push({ url: `/assets-main/sprites/${data.id}.png`, pixel: false });

        let img2D = document.createElement("img");
        img2D.id = "poke-img";
        let idxCandidato = 0;
        const mostrarCandidato = () => {
            const c = candidatos[idxCandidato];
            // OJO: usamos width/height (no solo max-*), porque max-width/max-height solo ponen un TOPE
            // y no agrandan una imagen pequeña (sprites de 96x96px) aunque sobre espacio en el recuadro.
            const tamano = c.pixel ? "92%" : "85%";
            img2D.style = `width:${tamano}; height:${tamano}; object-fit:contain; display:block; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); image-rendering:${c.pixel ? "pixelated" : "auto"};`;
            const avisoViejo = box.querySelector("#aviso-sprite");
            if (avisoViejo) avisoViejo.remove();
            if (c.aviso) {
                const av = document.createElement("div");
                av.id = "aviso-sprite";
                av.textContent = c.aviso;
                av.style = "position:absolute; bottom:4px; left:0; right:0; text-align:center; font-size:6px; color:#000; font-family:'Press Start 2P'; opacity:0.7; pointer-events:none;";
                box.appendChild(av);
            }
            img2D.src = c.url;
        };
        img2D.onerror = function() {
            if (idxCandidato < candidatos.length - 1) { idxCandidato++; mostrarCandidato(); }
            else {
                this.onerror = null;
                this.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='10'/><path d='M2 12h20'/></svg>";
            }
        };
        mostrarCandidato();
        box.appendChild(img2D);
    }
};

window.inicializarVisorBlender3D = function(container, pokemonId) {
    let cargando = document.getElementById("cargando-retro-text");
    let width = container.clientWidth || 140;
    let height = container.clientHeight || 140;

    if (!renderer) renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    container.appendChild(renderer.domElement);

    if (!scene) scene = new THREE.Scene();
    else { while(scene.children.length > 0){ scene.remove(scene.children[0]); } }

    camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 5000);

    // ========================================================
    // AJUSTE DE ILUMINACIÓN CONTINUA (Más tenue y suave)
    // ========================================================
    // Bajamos la luz ambiental para que los colores no se quemen
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    
    // Suavizamos los focos direccionales para dar volumen sin blanquear
    let dirLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);
    
    let dirLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight2.position.set(-5, 4, 5);
    scene.add(dirLight2);

    const ejecutarCargaGLTF = () => {
        const loader = new THREE.GLTFLoader();
        
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
        loader.setDRACOLoader(dracoLoader);

        if (window.MeshoptDecoder) {
            loader.setMeshoptDecoder(window.MeshoptDecoder);
        }

        let carpeta = (currentVariante === "shiny") ? "shiny" : "regular";
        
        cargarModeloConFallback(loader, obtenerUrlsModelo(pokemonId, carpeta), (gltf) => {
            if(cargando) cargando.remove();
            if (currentPokemonId !== pokemonId || !modo3DActivo) return;
            
            // Modelo preparado SIN pose(), centrado y con la cámara ya calculada (ver prepararModelo3D)
            const preparado = prepararModelo3D(gltf, camera, 1.15);
            currentModel = preparado.pivote; // gira sobre su propio centro
            if (mainMixer) mainMixer.stopAllAction();
            mainMixer = preparado.mixer;
            mainClock = new THREE.Clock();
            scene.add(currentModel);
            camera.position.set(0, 0, preparado.distancia);
            camera.lookAt(0, 0, 0);

        }, () => {
            if(cargando) cargando.remove();
            let msgErr = document.createElement("div");
            msgErr.style = "position:absolute;top:45px;width:100%;text-align:center;font-size:7px;color:black;font-family:'Press Start 2P';";
            msgErr.innerHTML = `NO 3D`;
            container.appendChild(msgErr);
        });
    };

    if (!window.MeshoptDecoder) {
        const scriptMeshopt = document.createElement('script');
        scriptMeshopt.src = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.18.1/meshopt_decoder.js';
        scriptMeshopt.onload = () => { ejecutarCargaGLTF(); };
        scriptMeshopt.onerror = () => { ejecutarCargaGLTF(); };
        document.head.appendChild(scriptMeshopt);
    } else {
        ejecutarCargaGLTF();
    }

    // --- Arrastrar con el ratón/dedo para girar el modelo manualmente ---
    const iniciarArrastreMini = (e) => {
        isDragging = true;
        renderer.domElement.style.cursor = "grabbing";
        let p = e.touches ? e.touches[0] : e;
        previousMousePosition = { x: p.clientX, y: p.clientY };
    };
    const moverArrastreMini = (e) => {
        if (!isDragging || !currentModel) return;
        let p = e.touches ? e.touches[0] : e;
        let deltaX = p.clientX - previousMousePosition.x;
        let deltaY = p.clientY - previousMousePosition.y;
        currentModel.rotation.y += deltaX * 0.01;
        currentModel.rotation.x += deltaY * 0.01;
        previousMousePosition = { x: p.clientX, y: p.clientY };
    };
    const terminarArrastreMini = () => {
        isDragging = false;
        if (renderer) renderer.domElement.style.cursor = "grab";
    };

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.removeEventListener("mousedown", iniciarArrastreMini);
    renderer.domElement.addEventListener("mousedown", iniciarArrastreMini);
    window.removeEventListener("mousemove", moverArrastreMini);
    window.addEventListener("mousemove", moverArrastreMini);
    window.removeEventListener("mouseup", terminarArrastreMini);
    window.addEventListener("mouseup", terminarArrastreMini);
    renderer.domElement.addEventListener("touchstart", iniciarArrastreMini, { passive: true });
    renderer.domElement.addEventListener("touchmove", moverArrastreMini, { passive: true });
    renderer.domElement.addEventListener("touchend", terminarArrastreMini);

    function animate() {
        if (typeof modo3DActivo !== 'undefined' && !modo3DActivo) return;
        mainAnimationId = requestAnimationFrame(animate);
        if (mainMixer && mainClock) {
            mainMixer.update(mainClock.getDelta());
        }
        if (currentModel && !isDragging) {
            currentModel.rotation.y += 0.01;
        }
        if (renderer && scene && camera) renderer.render(scene, camera);
    }
    animate();
};

window.toggleModo3D = function() {
    modo3DActivo = !modo3DActivo;
    const btn3D = document.getElementById("btn-toggle-3d");
    if(btn3D) btn3D.innerText = modo3DActivo ? "VER 2D" : "VER 3D";
    const btnAmpliar = document.getElementById("btn-ampliar-3d");
    if(btnAmpliar) btnAmpliar.style.display = modo3DActivo ? "inline-block" : "none";
    if(currentPokemonId) window.cargarPokemonData(currentPokemonId);
};

// =========================================================================
// MODAL 3D AMPLIADO — girar arrastrando, zoom con rueda/pellizco
// =========================================================================

window.abrirModal3D = function() {
    if (!currentPokemonId || !modo3DActivo) return;
    const overlay = document.getElementById("modal-3d-fullscreen");
    const container = document.getElementById("modal-canvas-container");
    if (!overlay || !container) return;

    overlay.classList.add("active");
    // Pequeño delay para que el contenedor ya tenga su tamaño final (el modal acaba de mostrarse)
    setTimeout(() => window.inicializarVisorModal3D(container, currentPokemonId), 50);
};

window.cerrarModal3D = function() {
    const overlay = document.getElementById("modal-3d-fullscreen");
    if (overlay) overlay.classList.remove("active");

    if (modalAnimationId) cancelAnimationFrame(modalAnimationId);
    modalAnimationId = null;

    if (modalRenderer) {
        modalRenderer.dispose();
        if (modalRenderer.domElement && modalRenderer.domElement.parentNode) {
            modalRenderer.domElement.parentNode.removeChild(modalRenderer.domElement);
        }
    }
    if (modalMixer) { modalMixer.stopAllAction(); }
    modalMixer = null;
    modalClock = null;
    modalScene = null;
    modalCamera = null;
    modalRenderer = null;
    modalModel = null;
};

window.inicializarVisorModal3D = function(container, pokemonId) {
    container.innerHTML = "";

    let width = container.clientWidth || 500;
    let height = container.clientHeight || 500;

    modalRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    modalRenderer.setSize(width, height);
    modalRenderer.domElement.style.cursor = "grab";
    modalRenderer.domElement.style.touchAction = "none";
    container.appendChild(modalRenderer.domElement);

    modalScene = new THREE.Scene();
    modalCamera = new THREE.PerspectiveCamera(40, width / height, 0.01, 5000);

    modalScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    let dirLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight1.position.set(5, 8, 5);
    modalScene.add(dirLight1);
    let dirLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight2.position.set(-5, 4, 5);
    modalScene.add(dirLight2);

    let cargandoTxt = document.createElement("div");
    cargandoTxt.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:9px; color:#000; font-family:'Press Start 2P'; text-align:center;";
    cargandoTxt.innerText = "CARGANDO 3D...";
    container.appendChild(cargandoTxt);

    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);

    let carpeta = (currentVariante === "shiny") ? "shiny" : "regular";
    modalCentroModelo = new THREE.Vector3(0, 0, 0);
    modalDistanciaBase = 2.5;

    cargarModeloConFallback(loader, obtenerUrlsModelo(pokemonId, carpeta), (gltf) => {
        if (currentPokemonId !== pokemonId) return; // el usuario ya cambió de pokémon
        cargandoTxt.remove();

        const preparadoM = prepararModelo3D(gltf, modalCamera, 1.3);
        modalModel = preparadoM.pivote;
        if (modalMixer) modalMixer.stopAllAction();
        modalMixer = preparadoM.mixer;
        modalClock = new THREE.Clock();
        modalScene.add(modalModel);

        modalCentroModelo = new THREE.Vector3(0, 0, 0);
        modalDistanciaBase = preparadoM.distancia;
        modalCamera.position.set(0, 0, modalDistanciaBase);
        modalCamera.lookAt(0, 0, 0);

    }, () => {
        cargandoTxt.innerHTML = "NO HAY MODELO 3D<br>DISPONIBLE";
    });

    // --- Controles: arrastrar (ratón/dedo) para girar, rueda/pellizco para zoom ---
    const iniciarArrastre = (e) => {
        modalIsDragging = true;
        modalRenderer.domElement.style.cursor = "grabbing";
        let p = e.touches ? e.touches[0] : e;
        modalPrevMouse = { x: p.clientX, y: p.clientY };
    };
    const moverArrastre = (e) => {
        if (!modalIsDragging || !modalModel) return;
        let p = e.touches ? e.touches[0] : e;
        let deltaX = p.clientX - modalPrevMouse.x;
        let deltaY = p.clientY - modalPrevMouse.y;
        modalModel.rotation.y += deltaX * 0.01;
        modalModel.rotation.x += deltaY * 0.01;
        modalPrevMouse = { x: p.clientX, y: p.clientY };
    };
    const terminarArrastre = () => {
        modalIsDragging = false;
        if (modalRenderer) modalRenderer.domElement.style.cursor = "grab";
    };
    const hacerZoom = (e) => {
        e.preventDefault();
        if (!modalCamera || !modalCentroModelo) return;
        let dir = new THREE.Vector3().subVectors(modalCamera.position, modalCentroModelo);
        let dist = dir.length();
        if (dist < 0.0001) return;
        dir.normalize();
        let nuevaDist = dist * (1 + e.deltaY * 0.001);
        nuevaDist = Math.max(modalDistanciaBase * 0.3, Math.min(modalDistanciaBase * 3, nuevaDist));
        modalCamera.position.copy(modalCentroModelo).addScaledVector(dir, nuevaDist);
    };

    modalRenderer.domElement.addEventListener("mousedown", iniciarArrastre);
    window.addEventListener("mousemove", moverArrastre);
    window.addEventListener("mouseup", terminarArrastre);
    modalRenderer.domElement.addEventListener("touchstart", iniciarArrastre, { passive: true });
    modalRenderer.domElement.addEventListener("touchmove", moverArrastre, { passive: true });
    modalRenderer.domElement.addEventListener("touchend", terminarArrastre);
    modalRenderer.domElement.addEventListener("wheel", hacerZoom, { passive: false });

    function animateModal() {
        modalAnimationId = requestAnimationFrame(animateModal);
        if (modalMixer && modalClock) {
            modalMixer.update(modalClock.getDelta());
        }
        if (modalRenderer && modalScene && modalCamera) modalRenderer.render(modalScene, modalCamera);
    }
    animateModal();
};

window.cambiarVarianteVisual = window.cambiarVariante = function(tipo) {
    currentVariante = tipo;
    (document.getElementById("btn-var-regular") || document.getElementById("btn-var-reg"))?.classList.toggle("active", tipo === 'regular');
    document.getElementById("btn-var-shiny")?.classList.toggle("active", tipo === 'shiny');
    
    if (vistaActual === "detalle" && currentPokemonId) {
        // Si ya tenemos los datos de este Pokémon en caché, solo redibujamos la imagen/3D
        // en vez de volver a pedirlo todo a la PokéAPI (mucho más rápido)
        if (window.currentPokemonDataStorage && window.currentPokemonDataStorage.id === currentPokemonId) {
            window.manejarVisualizacionMedia(window.currentPokemonDataStorage);
        } else {
            window.cargarPokemonData(currentPokemonId);
        }
    }
};

window.cambiarModoImagen = function(modo) {
    modoImagen = modo;
    document.getElementById("btn-img-poster")?.classList.toggle("active", modo === "poster");
    document.getElementById("btn-img-sprite")?.classList.toggle("active", modo === "sprite");
    document.getElementById("btn-img-animado")?.classList.toggle("active", modo === "animado");

    if (modo3DActivo) return; // el toggle de imagen no afecta a la vista 3D

    if (window.currentPokemonDataStorage && window.currentPokemonDataStorage.id === currentPokemonId) {
        window.manejarVisualizacionMedia(window.currentPokemonDataStorage);
    }
};

// =========================================================================
// FILTROS COMBINABLES: TIPO + GENERACIÓN + ATAQUE
// Se SUMAN (no se pisan): por ejemplo "tipo Tierra" + "Gen 1" + "Terremoto"
// muestra solo los Pokémon que cumplen las tres cosas a la vez.
// =========================================================================

const filtros = { gen: null, tipo: null, ataque: null }; // ataque = { slug, nombre }
const cacheIdsTipo = {};
const cacheIdsAtaque = {};
let listaNavegacion = null; // ids de los resultados actuales: las flechas ◄ ► recorren SOLO esos
let tokenFiltros = 0;       // evita que una respuesta lenta pise a otra más reciente

const hayFiltros = () => !!(filtros.gen || filtros.tipo || filtros.ataque);
const soloGeneracion = () => !!filtros.gen && !filtros.tipo && !filtros.ataque;

function limpiarFiltros() { filtros.gen = null; filtros.tipo = null; filtros.ataque = null; listaNavegacion = null; }

async function idsDeTipo(tipo) {
    if (!cacheIdsTipo[tipo]) {
        const res = await fetch(`https://pokeapi.co/api/v2/type/${tipo}`);
        if (!res.ok) throw new Error("tipo " + tipo);
        const data = await res.json();
        cacheIdsTipo[tipo] = new Set(data.pokemon.map(p => idDesdeUrl(p.pokemon.url)).filter(id => !isNaN(id) && id <= 1025));
    }
    return cacheIdsTipo[tipo];
}

async function idsDeAtaque(slug) {
    if (!cacheIdsAtaque[slug]) {
        const res = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
        if (!res.ok) throw new Error("ataque " + slug);
        const data = await res.json();
        cacheIdsAtaque[slug] = new Set(data.learned_by_pokemon.map(p => idDesdeUrl(p.url)).filter(id => !isNaN(id) && id <= 1025));
    }
    return cacheIdsAtaque[slug];
}

async function calcularIdsFiltrados() {
    let ids;
    if (filtros.gen) {
        const r = rangosGeneracionesPokedex[filtros.gen];
        ids = []; for (let id = r.start; id <= r.end; id++) ids.push(id);
    } else {
        ids = []; for (let id = 1; id <= 1025; id++) ids.push(id);
    }
    const [setTipo, setAtaque] = await Promise.all([
        filtros.tipo ? idsDeTipo(filtros.tipo) : null,
        filtros.ataque ? idsDeAtaque(filtros.ataque.slug) : null
    ]);
    if (setTipo) ids = ids.filter(id => setTipo.has(id));
    if (setAtaque) ids = ids.filter(id => setAtaque.has(id));
    return ids;
}

// Quita un filtro y vuelve a dibujar lo que corresponda
function refrescarVistaFiltros() {
    if (!hayFiltros()) { window.mostrarTodasLasGeneraciones(); return; }
    if (soloGeneracion()) { listaNavegacion = null; seleccionarGenOriginal(filtros.gen); return; }
    aplicarFiltrosCombinados();
}

function pintarBarraFiltros() {
    const barra = document.getElementById("barra-filtros");
    if (!barra) return;
    barra.innerHTML = "";
    const chips = [];
    if (filtros.gen) chips.push({ txt: `GEN ${filtros.gen} · ${rangosGeneracionesPokedex[filtros.gen].region.toUpperCase()}`, quitar: () => { filtros.gen = null; } });
    if (filtros.tipo) chips.push({ txt: `TIPO: ${traduccionTipos[filtros.tipo] || filtros.tipo.toUpperCase()}`, color: typeColors[filtros.tipo], quitar: () => { filtros.tipo = null; } });
    if (filtros.ataque) chips.push({ txt: `ATAQUE: ${filtros.ataque.nombre.toUpperCase()}`, quitar: () => { filtros.ataque = null; } });

    chips.forEach(c => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip-filtro";
        if (c.color) { chip.style.background = c.color; chip.style.color = "#fff"; chip.style.textShadow = "1px 1px 0 #000"; }
        chip.textContent = c.txt + "  ✕";
        chip.title = "Quitar este filtro";
        chip.onclick = () => { c.quitar(); refrescarVistaFiltros(); };
        barra.appendChild(chip);
    });
    if (chips.length > 1) {
        const limpiar = document.createElement("button");
        limpiar.type = "button";
        limpiar.className = "chip-filtro chip-limpiar";
        limpiar.textContent = "LIMPIAR TODO";
        limpiar.onclick = () => window.mostrarTodasLasGeneraciones();
        barra.appendChild(limpiar);
    }
}

async function aplicarFiltrosCombinados() {
    const zona = document.getElementById("dynamic-zone");
    if (!zona) return;
    const searchInput = document.getElementById("poke-search");
    if (searchInput) searchInput.value = "";
    bloqueadoPorBuscador = true;
    vistaActual = "lista";
    conmutarLayoutEntorno("lista");

    zona.innerHTML = `
        <div class="retro-gen-layout">
            <div class="black-info-box"><h2 id="titulo-filtros">FILTRANDO...</h2></div>
            <div id="barra-filtros" class="barra-filtros"></div>
            <div id="grid-pokes-3x3" class="grid-gens-3x3"><p style="font-size:8px;padding:10px;grid-column:1/-1;">CARGANDO...</p></div>
        </div>`;
    pintarBarraFiltros();

    const miToken = ++tokenFiltros;
    let ids;
    try {
        ids = await calcularIdsFiltrados();
    } catch (e) {
        if (miToken !== tokenFiltros) return;
        const g = document.getElementById("grid-pokes-3x3");
        if (g) g.innerHTML = `<p style="font-size:8px;color:red;padding:10px;grid-column:1/-1;">ERROR CARGANDO LOS FILTROS. COMPRUEBA LA CONEXIÓN.</p>`;
        return;
    }
    if (miToken !== tokenFiltros) return; // ya hay una búsqueda más nueva

    listaNavegacion = ids;
    const titulo = document.getElementById("titulo-filtros");
    if (titulo) titulo.textContent = `RESULTADOS (${ids.length})`;

    const grid = document.getElementById("grid-pokes-3x3");
    if (!grid) return;
    grid.innerHTML = "";
    if (ids.length === 0) {
        grid.innerHTML = `<p style="font-size:8px;color:#000;padding:10px;grid-column:1/-1;line-height:1.8;">NINGÚN POKÉMON CUMPLE TODOS LOS FILTROS A LA VEZ.<br>QUITA ALGUNO PULSANDO SU ✕.</p>`;
        return;
    }
    const nombrePorId = new Map(pokedexNombresGlobales.map(p => [p.id, p.name]));
    const frag = document.createDocumentFragment();
    ids.forEach(id => {
        const tarjeta = document.createElement("div");
        tarjeta.className = "item-poke-minimal";
        tarjeta.onclick = () => { bloqueadoPorBuscador = false; window.cargarPokemonData(id); };
        tarjeta.innerHTML = `<span class="poke-num">#${formatPaddedId(id)}</span><span class="poke-name">${nombrePorId.get(id) || "#" + id}</span>`;
        frag.appendChild(tarjeta);
    });
    grid.appendChild(frag);
}

// ---- Los botones existentes pasan a usar los filtros combinables ----
const seleccionarGenOriginal = window.seleccionarGenFiltro;   // vista de generación "bonita" de siempre
const mostrarTodasOriginal = window.mostrarTodasLasGeneraciones;
const toggleVistaListaOriginal = window.toggleVistaLista;
const cambiarPokemonOriginal = window.cambiarPokemon;

window.seleccionarGenFiltro = function(numGen) {
    const gensBox = document.getElementById("gens-box");
    if (gensBox) gensBox.classList.add("collapsed");
    if (numGen === 'all') { window.mostrarTodasLasGeneraciones(); return; }
    filtros.gen = parseInt(numGen, 10);
    refrescarVistaFiltros();
};

window.mostrarTodasLasGeneraciones = function() {
    limpiarFiltros();
    mostrarTodasOriginal();
};

window.filtrarPorTipo = function(tipoIngles) {
    const tiposBox = document.getElementById("tipos-box");
    if (tiposBox) tiposBox.classList.add("collapsed");
    filtros.tipo = tipoIngles;
    aplicarFiltrosCombinados();
};

window.filtrarPorAtaque = function(slug, nombre) {
    filtros.ataque = { slug, nombre };
    window.cerrarModalAtaques();
    aplicarFiltrosCombinados();
};

// "VOLVER" en la ficha te devuelve a TUS resultados filtrados, no a la lista general
window.toggleVistaLista = function() {
    if (hayFiltros() && !soloGeneracion()) aplicarFiltrosCombinados();
    else toggleVistaListaOriginal();
};

// Con filtros activos, ◄ ► pasan solo por los Pokémon que cumplen los filtros
window.cambiarPokemon = function(direccion) {
    if (!hayFiltros() || soloGeneracion() || !listaNavegacion || listaNavegacion.length === 0) {
        return cambiarPokemonOriginal(direccion);
    }
    const n = listaNavegacion.length;
    const i = listaNavegacion.indexOf(currentPokemonId);
    const destino = i === -1 ? listaNavegacion[direccion > 0 ? 0 : n - 1] : listaNavegacion[(i + direccion + n) % n];
    return window.cargarPokemonData(destino);
};