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

// =========================================================================
// ENERGÍAS REALES de la pantalla de carga.
// Pon las imágenes en la carpeta  Img/energias/  con estos nombres (png, webp o svg):
//   acero, agua, bicho, dragon, electrico, fantasma, fuego, hada, hielo,
//   lucha, normal, planta, psiquico, roca, siniestro, tierra, veneno, volador
// Las que no estén se sustituyen por un icono de reserva, así nunca queda un hueco.
// =========================================================================
// Energías que giran en la pantalla de carga: las 18 imágenes de Img/energias/ (una por tipo).
// El orden es el de tu imagen original, que alterna colores para que se vean bien repartidas.
const ENERGIAS_ORBITA = [
    "bicho", "planta", "hada", "normal", "dragon", "psiquico",
    "fantasma", "tierra", "acero", "fuego", "volador", "hielo",
    "electrico", "roca", "siniestro", "agua", "lucha", "veneno"
];

function configurarOrbita() {
    const anillo = document.querySelector(".orbita-anillo");
    if (!anillo) return;
    const todos = Array.from(anillo.querySelectorAll(".energia-orbita"));
    // Solo se quedan las de la lista, en ese orden
    const visibles = ENERGIAS_ORBITA.map(t => todos.find(el => el.dataset.tipo === t)).filter(Boolean);
    todos.forEach(el => { if (!visibles.includes(el)) el.remove(); });
    visibles.forEach(el => anillo.appendChild(el));
    anillo.style.setProperty("--n", visibles.length);   // se reparten a partes iguales por el círculo
    // Con pocas caben más grandes y más cerca; con muchas, algo más pequeñas y el anillo más amplio
    const pocas = visibles.length <= 12;
    anillo.style.setProperty("--tam", pocas ? "66px" : "52px");
    anillo.style.setProperty("--radio", pocas ? "150px" : "165px");
    visibles.forEach((el, i) => el.style.setProperty("--i", i));
}

// Las 18 imágenes de las energías van INCRUSTADAS aquí (no hace falta ninguna carpeta Img/):
// así funcionan siempre, estés donde estés el proyecto. Son tus círculos, recortados uno a uno.
const ENERGIAS_EMBEBIDAS = {
    bicho: "data:image/png;base64,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",
    planta: "data:image/png;base64,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",
    hada: "data:image/png;base64,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",
    normal: "data:image/png;base64,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",
    dragon: "data:image/png;base64,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",
    psiquico: "data:image/png;base64,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",
    fantasma: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAABwCAMAAADxPgR5AAAB/lBMVEUAAABWZ6n5+/lXZZhha6podatRXJPP1+xVVarl6vdrdpV/f3+tttFbca5ja5aMlrPa4/IAAP94ha5YZJZQXaaDi7G6w9gA//9VZpSkq8pYZZb///9XZJhXZJXDy+aPmsRPV3uapcfDy9l6friYo7e8x+ZQWo96g5ZPWXpXZZFZZ6VYaqRZZJc/P39OW4ljaazN1dpKSnFSVpFQXJJZYnllZZJRW5JQXJB/f/+vuORLV3xRXI9YZ6RYaaVbcZartbs/f79VVVVbZ6VXaKVVqqpjbJlobKNgaqajqbwAf39FTXNjaqNha6OCipw7SWtTXaBbf7ZacK5iaZljbZtha6VkdJptdKhtkbaGjc+LlJoAf/8/P781Q14/WXIzZplVRIhQXXxVXaNaX6ZZZ6BZcplec8BiYnVrb5xgbp5nb6tqdHpjcZtncJ9kcqdmcqVmdLJjdMB8kLGRkbaor+sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAByBOCeAAAAgHRSTlMA/v/9/v79/wP//wL//v7//wH+0/7//wEX/7EBUnn//xD//wf//yv//yqz0o4EfdD/ChOs/wpUzAL/IIl2k///BAMYWgNcHbX/Av8wcv//Lg7MMH5XEFgH//8CBP8UBQ9SfZk2FP8NtdeM/zaIJrbb//8H/wAAAAAAAAAAAAAAACFNyKgAAAlbSURBVHja7VpXd9tGFh5oZgCiEAABgb2IFCVSpKxebSeOnbjEjpNN79ne++7/P2fvDEhqZgCSACRv8pD7IokU8fH2itDP9JOgSqVWq1T+L0h2aXvbnv9lb2+X7DeHa98rzX893gI6nv9Vume/AbQSf2h97+mn+81myKnZ3P/06V8/F96+M+KPe9Z+cIldQgnGZEaUEoLD/XadY96VcGtMkp988FwjWkwYayIRquFmZ5d9r7uAtK8Q2nr6R1cAIERTCF7CpxcnCF29f1urBO62Di5dSvRNbRWxLxF2Tm7LJcDd38fUFYW4KSNvii/pD+7zDxWkVguddzDYCVa0toL0g2NUqxVm77NDZpPZ4ZhFhe2CTJbQs+dJ88hApFkvgFhpofY/qVaIaHiBWjnFCo5+gAviMZPt8EfkEef3TVouhrapa5TS0+M8Yr2H7l+Wg0IM/ov5CACScA8ek5m/vRDjjAwus2B6uJuVR8DDReV5Ew0IxRkRGd46uGyemQ3R5vLUtPJyUKrp+grITa0M6tfBdsLd9bZaaW2F8cNWAWI8iz9LwlA5BqTheauyNjucrhQXZRQEAZ2RZS3A0/65uS57lFBnubDKNPB6/YbjOFVOjtPoe15kxaBqConVeLBajSXUTocqaxj46jk7hmGa5sacTMPoOi88z4IEtsRt26sQW3Z9mo7HmOsDnL+hEMAbA2c4YpCpopnW7dYKBiflNDimNoDzzY108geOx7N0WnZpLmdxmUC5MI0kdyJktR+4rJpL+fRSoYJAwzQfL3PdmRsryTQagVSJLNyK/mlriVDBQstJOPx20LteB8fIcCJrgbg5ixyY+UYnnUW7VscpeJiCODPgMURQpMsLZDkE4nrLTo1p+ylw2PIcYyMb+TtckRC3iZhLMP1bWoSzUV21awwh8+0gMx5TZJ/q8CHFdqhbT0F8D3XU3MYU+O8ceEDdyIWvCU0B//Jzk4CK471EEEUnYVKDjD8zD6DpRBQDi3ICw+E5qqz3QabA4c5GPvKdyFWiOSE6/iJhqFd2MwloeVU/JyDYagAsqmXIP1hPJJvM31kGUwVa3chP/hCPMVVDzp5iNiX0AUkAWkOjAKDpWAk71cqq89toIvyLPgN0zCKAA89VZaqVmzKHFVSXWqAY0CvCILMbS08ganVUkyrftlho6hyPFmKQ2Y2Hk4DvoncEwMfogcxhWdNxrxiDTItUsQeQ6VuKEsHricAkAFJHfIZvrglq4vtGpOuqmU5ltzgXCh+e5DEORAarj45WIhqNgahFT8cUykRFiaKNvloA4hmgJkrUH379aKWAnZFoYWbDxUTV4keCnZbQZ2QGOA9KmPaFIFMd/eXr6goW/d4YD8X/py5JWs2NErfB7W8CaPwzuL4B8B9ZZ9ZwYC5VoBO8fCmqwIgSoUZ7KJjpOcu9RAQEFQphe+CNLGsUI5oqrOnv9CBDjK2u6BjUnbmzYKbngt+fzgDxglFRJwMPqmtrBLnfMAaCPZpHR0dQCUfgBXhsCd/Qb9BErJnceH4FtZ5LbRjU2brnS0ZwxiCjRmPoOb4gas8bAnvg5/glrorFRpAoiye1RU6soP8cKn0fHiuAYxdqa2sEom2IgCOM3biL0kWRmt2I532RPv5yAVhD24eSxSQAHSgAWcvi4jMR0KyOxh+OCW/fXPEDUGpgNdZ8vL2QaSsFEEuAXWhXXHc8PjtzXwsi3Tjyzr77EPNhVVTdWA04/UUaoJYKyAoHUOEZyPX1C0N6fcTrCde1+lJtsBPoKwAFkc4LLTAaQymrPW80eu05R0pBMQQLDqLIYwwu7NfkgLIOp08WgBX05SGRhyBqMgTfhvbTcQZqEecbVYf1qF2JQfMaQqmS9ad1wUprExXQVbIvtIEGa0ZT4owPjZXyBktQaqSZoJtSsQYFhhKK3GS6N5cG08QbZiMBKDo+xJzfiINsFsbB6grm+5tIs6mEth8WgN+iX6uTcxw4twA0eiQBKAbvErqQVAy/64qd5yPmhkQGlNKTjXY3FQ51HBmF8ZjNJErT30qF4i91tu+QEavFJTp0Yzyxoz6Rm6dQk0uQso6dwoCDKDlfmCqV/p8Tc53iZaLxQt50cJLLxG30RXKQVNhOB5F7AzifSralQriFniVqEGjWCpf6Qn84D851uSW1UTOJWLDWh4IEVEhlBpuJdq2TBHS9bhEN9gNQ4QJw9rBku/aKKHZasEGEktGCakSd736kzjGu7OcpUy+rb+T2eS5QdaLctL/JMtjTIaLmC3CsGJlZjDQ0v0gMFdLGJgCYd6xgQJpIGZxeniTGJnwwlNghQWXoDXK120HqBDxlMAQ6fZJYB1AoqcFwMjuHefTC1Qnvmyh8/PeLduVJ+rBtny5kHysAPovdwMs8jWLzBKz2TdC776euL+xanVA+6BQ0ziChws9qq0dDN7FCAQbTx5fM+ZMrJwJ9AyBmNZ2qpWNxSssBlwxoUcveCqmmVAZ8hmkFYKzZhrQepUyHhO+++ZNIuGXXlg3ZL5gsN5NTWjamrWbRpN+97gVE/nx71Vj/lKpSjQGxa3mNTJDGdY+SmDmoaqDSWLFGYEKdUqqlIjJzbXRZzbtmfvLfr6DdZogsfus4XLUoiQMcFSdgbAk0R3Rp1GvwbdBSiRrXfcCblRfwA+sX65ZPB5ikbpHAXHUdICO27hoApxKrpg/E2oyIsnHCvKDB65ZdfJ23bFfOdoLshIYGQeQNHafa7XZZw2F0uztVh6/aLEsqqLG7dp2HKq209cz8qIWbAoHe1KIA2ut5M4qiiO0ULcXpcfg5qqxfye6Ga5e7TKGMVw7OzjVcmna0kWUly9S4m2WlvMgKJB7hMwPRRfXDC3vZ19x5jgaIuEwXs2meRX5Ic920pO3dw93sxxH3Zqv12+BNc5xGMB63msUQ2SyBVRnN36HHOc9bOrkAy4syCDN7ynveAm1/C7WntIAsmcuE7dwHPFys9UkenFk5AW1MoROl+AirndF25v/FJnLhr1A+9QliraHjAz2POzLt/QHVit/SsUO6B3q2OzMyP6R7jG5B8algmNyWpR4l3P5UEOj9K4Tq7SZeh6iftrfBF257DDnnEu0+nKSdXcbnnkRrPryzc88Yknnxk/b+JebPn1cQ8Te43G8/u9ODVulk95OnncXJ7mTy1sN3X9XfxMnuj3CU/GOcXUuH5Yx+PrD/adD/ABUwx8F+K1XmAAAAAElFTkSuQmCC",
    tierra: "data:image/png;base64,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",
    acero: "data:image/png;base64,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",
    fuego: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAABwCAMAAADxPgR5AAAB/lBMVEUAAAD5nFX7+/LrpWz1oVjunGXtt4v8587517Twyaj+89nzxJbxs3rbpHTmq4P/f3//qqrYm2z////02sXYqYXruY3//wDquZLrt4v94rnZs4/tuZDrtof/qlX//3/VyLP/v3/qtoiqqqr/AADntoz506/77OPpqXTqqXjvypnKu6frxJftyqt/f3/mq4T81J3rtH33vKiqqlXdsonkrYflrITpvqX/5q6/f3/nqnrorHrww5r//6q/v3/enFvMmWbQs5bcuI3uqnvusX3qsnndq33ep3Xcq4fZrYLbtIff18f/AP//fwDpq4fjsHzmsHnqwZPyx6T70aMA/wB/fwDMmZnao2jepoDdqYXdsn3fsH7dtITdsILesInXxJPZxJ/dwZbfyarhrXnirInpv6T2wJjnxaL/5cwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABtz73UAAAAgHRSTlMA/v/+/v79//////7+/vwCA/4B//5JAS2t//0X1wMC/wSQAwF4C//XshL/MREC1P+wDgOycLP/CgR0kUEDBP8FC0YofIhF3FesM/8BAh0v1Kw0LAECBa2F3zXoe4nPGjDbGEVQMHpCCgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANjDhv4AAAqoSURBVHja7Zp3d9tGEsBX3AKAKCwgxCpKtCRKsrol27n47Etip1/q9d7vvv83uJkFCGwDQcly8k/2+T1bFMwfZnbq7hDy0/rx13a/35Gr399+56x5d29H/WBnr9t5V9Tt7gp1eDKdDofT6clh8UG3++DQ/pM5/vX8++zN1dU3RzSmsGaz0WiRnUrsfKf/gLjOS4Rlr6+EiKKIViuSPx6/zp7DA3udB8I92ifkJFscUURt2Qu49GiRnRCyv/MQONie4WImnKzV4gCdLYa40W+Jm4OaXoyEoJxzA8J0JKdCjDJQ//ytDJOQDwscCMHXALfkE8noBdjsvU0WcKejCY17KB5fq1PYSS7fSoxO5X+8n3gfHIB0cSEaYxZE+Yjl/0bFHpzdS0hwq+FRYf229vJXoNY7MBA0mg3lf7/bAgM/iHI1WSZZLJZLZUkOUh7cWa2PyMkoojVGkvPoikeNd8Kd/PbkbsQ9MpzpPKYJggimAG0iqHXvDqGMvBCmfLrmCo2y1Q/GPlKwnReks7k7ZMDjdQaZRxZKa4FMhjuRbarVl+TTRLNN/AYNuDLeiugIsDTKNtPqHvkX6oSydUABeYNS5vBNRbObEUGfCdXDivW1NAphReuB8Jj4b7NW52Qoqu3jrrCJ2rr0/UubWNlRAQz/RuZN9jmdVVG6DCmmwQh/PB5fivjVemA8+fs/yPk63v5O/ziqTIBThzmghCIYtz0/hDi7DsjiOPy2vzau7pCfORkGMBa+10aioFaa0lYvhii3pgx4Qj6iTbgK2PbGIeVNhkP/AHGytsKdHtGtDYCDwGu3Wq22Fwg7lxgqpkeHtfVyFxTaRAN5IIj4yGu1PL8RCBZ9UOcb4BGUNvMgMvteK19pmDQC6eS0xjc6ZBQ18cBlejSogKjT+k2UKo3jz9xh/AkZRo0CAi+uBGw1bCKTrxgPTp1288v+ceMOQiBIFF6xiU02Hd/0f+2qYTJwCdYEpCrPCWRWmOhNMkeNc04+o1usCYi8dslDv4ipFW30HwFIb+wA1yHDmG7dledL4JrSoDCbwdCymy75M0SNJpfXeC0PglsS8zVAlmf/WCxMX+yTDz5pBGKS0HlgpD2u7ZwlYJ7OZofGLu7sf+w2b2nZLLdv4KkGkwYQvGXsZbLiMHF8VSxgesn2u8YWvl/rTwx/w2RO0hQaiKSoEFEGkLWn+WSZdeAjHi30aLO9D2F7XcDAABr4Fo9WGTIUgmpVjgaks7P9XynAn4MTrvFfhmWTzmulYrByQVkDBL5UsErU4m8GkGq9B3nCISGrWr8o1HleMEEVlvEg9H0kxpRZCRI+4BwS8XvaJh7TunYM3z+mBm+ZBoO4Kn56+HsfvTJ2lHLYDdCRVsqQaW3Q5xgMDQfMgT0FiBE9dxPH1khgcki+VGz0a1obexEoAjWC5ipFIC3MOC6qHJmu3ECqBpv6VC/1GU8MhRbA1R7CM4M8pstgzre4TcSesfLEX4AX1p2GRJDPUF8GsJVOVKAIvGWZIB0nHvDEgvxGyb1FKmRmjR1hkz8ILAHhq5+VViMrY6/IV+gc1AW8qbLwNunXAUUYirgo0kydouNLYTiU2Ks9zjMkd3Q2N32yXUbuwyNn1wm8IJgMnMBWHkqlUSWgUTRdCXRaKoj4lyp+98m0BOqNNYRrAE58FxCzIcSzBDo3xYbhU0yR1Laa31+XQOhgihwj40QJxfgBEWWym3qtlouYgq+HIeA85cNx6AYOpqVfAJA6gcL30+AxANst5/LQ2VWc/MwBRJUmKvAjXnU/VSMNBWjq7z5+vOvVAKVExi+hzomtuIwSJsMGIERkePl09/GuvwZov0EbgVt2KTUYOlSaw/KHKU8kcLdmC2uJwYBaXZyp0q/K8zsFKCO2l6KEdwMmJlD2GMl1CUS3oOVxRe6OMvwBqZ3iHt4DaDU1F2eKH15XwC0VCHuHm+jZluItl3cFVo4vQxuzgSEWhR5somfQ0hTsN03d0GIPzWqYPq1CG+SNY9k4MeVsoAR+sfuFCoScFwTPhHgGf6XechMJ81LxqdJCQXqKKNOq2RIIBNVK2ykG18EgSQaDSZA6DLgdUCfwd4CpJLzVfDUHQt3UzmPHUuUJyLx4Ct6DugKFtNOIq8yg9FZJwNDJqBlFeiMCi8J+qSclecCfn/MLu/Zo+6ETmHynlBhfYhGlE7cqCbUNfIbVdpXpMdXrD7l7VMh0h1CraWWiBcRcofOW8G2JUkEAOjHeSraMPSsB00grE6FGvY040+tRqje7hYXKkqW2I4ZIChrt9ewdNAphLPW5ckBalCEW0Mcd5HrPH3h6Vi47OL040kt92cxQDeiUENRlACnVgVhEWUUbdAqzk/1t/VBoYV7WcYdBYH2vfB0e6GsStj1D5yXQaNfwHNgCwncZXuYFA+0hPLZRge2amk02T12j5T78xgJSEZjAif4Q14HY85dGrNYqdssN/DeRBUyepUvTaDQBONfOpbBELE+RKyDHBrhrHZt8bSqD84HQdQrfqDZp8Aj0VeU+w28nMVcFLK816Kl93HZOfmsBe1ACa5kCdFqVZLCDMa00CvYyyK8aLSC9cpx898nHpn0B0Ox7fQwjfOVB0HpAoMEle8M4VpSkFH9oMn3X4d7TxOh7YIeCsWd4IuYKSXz1CloBfzzOq9Oi7mfWZQfwRv1z5w3e0PJZGU89U8ReEb5RwMvxeCzb+0jhGdc44an7TLhDLBGxfTIOL2RslrkJT2fC8PLyEjqsRKqzOBzSgVyMau7Z5mSY6M0ktspGxoP4nSR8RYT2EdYgjjEbi1xKxR+YPKIR39ddzzwit4l2CcuKA0RdqZCD8fZtJWWMuB60bKF1NrQ6MOnWXiNcX1jXvrKFUrTqYRUlRFKwUDYocSYCr7+EER4x9NHZ8/qxG2k3eChAtT4/1FtubNOwMxQJkuAPdK1BAIYTmuFYnpB/V39RgldBB6IqIUqiaTnodtAaBpIErNTLLdXsmgC4/iqI7Hc7I2He3NOcaPRInr6AF5k8Ll1w/RDBOZnOIvNmoJBxaTVm7SLKeCChmzc7a7p6npPPJ9bcDPycCEiO7j5RxjV50WbweCL+TebNV7IfWpcfclsHEum12/bhgr86GjbupZONLrr3kOiYhwAhBVoIMktV4ublxyeaL9EV73qza+5MUAdQfgfW2j7EaxlB0VKFKGKadjogn/2UvNx4cCCyZCzDGThgmC8Z1xI7ZKO4Pbr54ACG8UxEjiNizmkhqbaMAwT8SPLuMAWWD3/QuvtgTu3bCR14x+EPDHJ/HeVEJ5PZ9y+awYjR2bqAVjPA86di+EqtfLUe2THKUJjLwT3moqAI+fxCDknofdW621BWqpPcY3AQh7BuRVFJM+ZUpj3eBkb8n7P7TprBLgzlVJs2guCYv1i9kBwzG953zKwYpMtGUUS1LXPMX+C5PbYscnbvrWY/O+BL2VUUsbyAZmXlwctAkL/Nw4wKyrCDA25vjqSLlCN1Kg+J0lQeZBhSnvnLcc/3P6Erx8xBCjKKZovs7IHGPaViMWic/PP1VRTpA62wa1H0x5uD7H8POdAqvXJHftvhabYYPb24QOdOkgs5sju8fviR3dxkd8qh5On0KxxKPnv+7oaSV9DODzh2/aMMlv+0Nlj/B/mDxXzFF0oBAAAAAElFTkSuQmCC",
    volador: "data:image/png;base64,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",
    hielo: "data:image/png;base64,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",
    electrico: "data:image/png;base64,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",
    roca: "data:image/png;base64,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",
    siniestro: "data:image/png;base64,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",
    agua: "data:image/png;base64,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",
    lucha: "data:image/png;base64,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",
    veneno: "data:image/png;base64,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"
};

const RUTA_ENERGIAS = "../Img/energias/";
function cargarEnergiasReales() {
    document.querySelectorAll(".energia-orbita").forEach((el) => {
        const cara = el.querySelector(".energia-cara");
        const tipo = el.dataset.tipo;
        if (!cara || !tipo) return;

        const poner = (img) => {
            cara.innerHTML = "";
            img.alt = el.title || tipo;
            cara.appendChild(img);
            cara.classList.add("con-imagen", "lista");
        };
        // Plan B: buscar el archivo en Img/energias/ (por si quieres usar imágenes tuyas más grandes)
        const probarCarpeta = (i) => {
            const extensiones = ["png", "webp", "svg"];
            if (i >= extensiones.length) { cara.classList.add("lista"); return; } // se queda el icono de reserva
            const img = new Image();
            img.onload = () => poner(img);
            img.onerror = () => probarCarpeta(i + 1);
            img.src = RUTA_ENERGIAS + tipo + "." + extensiones[i];
        };

        // Plan A: la imagen incrustada en este archivo (no hace ninguna petición, aparece al instante)
        if (ENERGIAS_EMBEBIDAS[tipo]) {
            const img = new Image();
            img.onload = () => poner(img);
            img.onerror = () => probarCarpeta(0);
            img.src = ENERGIAS_EMBEBIDAS[tipo];
        } else {
            probarCarpeta(0);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    window.mostrarPantallaInicialOcupandoTodo();
    precargarCatalogoBuscar();
    construirCajaTipos();
    configurarOrbita();
    cargarEnergiasReales();
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