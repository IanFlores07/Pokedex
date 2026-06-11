// =========================================================================
// POKÉDEX NACIONAL - REGISTRO DE DATOS Y RENDERIZADO DINÁMICO COMPLETO
// =========================================================================

let currentPokemonId = null; 
let currentVariante = "regular"; 
let vistaActual = "lista"; 
let idGenActiva = 1; 
let modo3DActivo = false;

let mainAnimationId = null;
let scene, camera, renderer = null, currentModel = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

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

document.addEventListener("DOMContentLoaded", () => {
    window.mostrarPantallaInicialOcupandoTodo();
    precargarCatalogoBuscar();
    
    const btnGenToggle = document.getElementById("btn-toggle-gens");
    const gensBox = document.getElementById("gens-box");
    const searchInput = document.getElementById("poke-search");

    if (btnGenToggle && gensBox) {
        btnGenToggle.addEventListener("click", (e) => {
            e.preventDefault(); 
            gensBox.classList.toggle("collapsed");
        });
    }
    if (searchInput) {
        searchInput.addEventListener("input", window.aplicarFiltroBuscador);
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
            // Carga normal desde PokéAPI
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
            data = await res.json();
            const resEspecie = await fetch(data.species.url);
            speciesData = await resEspecie.json();

            if (speciesData.evolution_chain?.url) {
                try {
                    const resEvo = await fetch(speciesData.evolution_chain.url);
                    evoChainData = await resEvo.json();
                } catch(ee) { evoChainData = null; }
            }
        }

        // Guardamos el objeto en caché global para variantes visuales
        window.currentPokemonDataStorage = data;
        
        // 1. Renderizamos la preciosa vista detallada con tablas que tienes abajo
        await window.renderizarVistaDetail(data, speciesData, evoChainData);
        
        // 2. Actualizamos el número digital (#015, #001) en el LED de arriba a la izquierda
        const pokeIdDisplay = document.getElementById("poke-id");
        if (pokeIdDisplay) {
            pokeIdDisplay.innerText = "#" + String(id).padStart(3, '0');
        }

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

    for (let m of movesToFetch) {
        let moveName = m.move.name.replace("-", " ").toUpperCase(); 
        let typeName = "normal", power = "-", accuracy = "-";
        try {
            let moveRes = await fetch(m.move.url);
            if (moveRes.ok) {
                let moveData = await moveRes.json();
                let esp = moveData.names.find(n => n.language.name === "es");
                if (esp) moveName = esp.name.toUpperCase();
                typeName = moveData.type.name;
                power = moveData.power !== null ? moveData.power : "-";
                accuracy = moveData.accuracy !== null ? moveData.accuracy + "%" : "-";
            }
        } catch(err) {}

        let badgeColor = typeColors[typeName.toLowerCase()] || "#666";
        movesRowsHtml += `
            <tr>
                <td style="text-align:left; font-weight:bold; padding-left:6px;">${moveName}</td>
                <td><span class="move-type-pill" style="background-color:${badgeColor};">${traduccionTipos[typeName.toLowerCase()] || typeName.toUpperCase()}</span></td>
                <td>${power}</td>
                <td style="padding-right:6px;">${accuracy}</td>
            </tr>
        `;
    }

    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${nombreCastellano}</h2>
                    <div class="poke-header-meta">${juegosHtml}</div>
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
        let url = data.sprites?.other?.["official-artwork"]?.front_default;
        if (currentVariante === "shiny") url = data.sprites?.other?.["official-artwork"]?.front_shiny;
        
        let img2D = document.createElement("img");
        img2D.id = "poke-img";
        img2D.src = url || `/assets-main/sprites/${data.id}.png`;
        img2D.onerror = function() {
            this.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='10'/><path d='M2 12h20'/></svg>";
        };
        img2D.style = "max-height:85%; max-width:85%; object-fit:contain; display:block; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);";
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
        
        loader.load(`/assets-main/models/opt/${carpeta}/${pokemonId}.glb`, (gltf) => {
            if(cargando) cargando.remove();
            if (currentPokemonId !== pokemonId || !modo3DActivo) return;
            
            currentModel = gltf.scene;

            // ========================================================
            // TRATAMIENTO DE COLOR OSCURO Y MATE PROFUNDO
            // ========================================================
            currentModel.traverse((child) => {
                if (child.isSkinnedMesh) {
                    try { child.pose(); } catch(e) { console.warn("Hueso corrupto ignorado"); }
                }
                if (child.isMesh && child.material) {
                    if (child.material.opacity === 0) child.material.opacity = 1;
                    child.material.transparent = child.material.opacity < 1;
                    child.material.depthWrite = true;
                    child.material.side = THREE.DoubleSide; 

                    // Forzamos al material a absorber el color y no reflejar nada de blanco
                    child.material.roughness = 1.0; 
                    child.material.metalness = 0.0;  
                    
                    if (child.material.clearcoat !== undefined) child.material.clearcoat = 0.0;  
                    
                    // Apagamos cualquier auto-iluminación
                    if (child.material.emissive) {
                        child.material.emissive.setHex(0x000000); 
                    }
                    
                    // Eliminamos mapas de reflejo extra que causen neblina blanca
                    if (child.material.metalnessMap) child.material.metalnessMap = null;
                    if (child.material.roughnessMap) child.material.roughnessMap = null;

                    // Ajuste extra: Si el renderizador soporta codificación de color,
                    // nos aseguramos de que el mapa de texturas se lea con contraste correcto
                    if (child.material.map) {
                        child.material.map.anisotropy = 4;
                    }
                }
            });
            // ========================================================

            scene.add(currentModel);

            let box = new THREE.Box3();
            let tieneGeometriaReal = false;

            try {
                currentModel.updateMatrixWorld(true);
                currentModel.traverse((child) => {
                    if (child.isMesh && child.geometry) {
                        try {
                            if (!child.geometry.boundingBox) {
                                child.geometry.computeBoundingBox();
                            }
                            let mBox = child.geometry.boundingBox.clone();
                            mBox.applyMatrix4(child.matrixWorld);
                            if (!isNaN(mBox.min.x) && isFinite(mBox.min.x) && (mBox.max.x - mBox.min.x > 0.0001)) {
                                box.union(mBox);
                                tieneGeometriaReal = true;
                            }
                        } catch(errGeom) {}
                    }
                });
            } catch(e) { tieneGeometriaReal = false; }

            if (!tieneGeometriaReal || box.isEmpty() || isNaN(box.min.x) || !isFinite(box.min.x)) {
                box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, 1.2, 1.2));
            }

            let size = box.getSize(new THREE.Vector3());
            let center = box.getCenter(new THREE.Vector3());
            camera.lookAt(center);

            let ladoMaximo = Math.max(size.x, size.y, size.z);
            let fovEnRadianes = camera.fov * (Math.PI / 180);
            let distanciaCamara = (ladoMaximo / (2 * Math.tan(fovEnRadianes / 2))) * (1 / 0.85);

            if (distanciaCamara < 0.1 || isNaN(distanciaCamara) || !isFinite(distanciaCamara)) {
                distanciaCamara = 2.5;
            }

            camera.position.set(center.x, center.y, center.z + distanciaCamara);
            camera.lookAt(center);

        }, undefined, (error) => {
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

    function animate() {
        if (typeof modo3DActivo !== 'undefined' && !modo3DActivo) return;
        mainAnimationId = requestAnimationFrame(animate);
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
    if(currentPokemonId) window.cargarPokemonData(currentPokemonId);
};

window.cambiarVarianteVisual = window.cambiarVariante = function(tipo) {
    currentVariante = tipo;
    (document.getElementById("btn-var-regular") || document.getElementById("btn-var-reg"))?.classList.toggle("active", tipo === 'regular');
    document.getElementById("btn-var-shiny")?.classList.toggle("active", tipo === 'shiny');
    
    if (vistaActual === "detalle" && currentPokemonId) {
        window.cargarPokemonData(currentPokemonId);
    }
};