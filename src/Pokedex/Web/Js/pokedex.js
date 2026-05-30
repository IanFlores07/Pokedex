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

const rangosGeneracionesPokedex = {
    1: { start: 1, end: 151, nombre: "Gen 1", region: "Kanto", games: [{ text: "ROJO", color: "#ff1111" }, { text: "AZUL", color: "#1155ff" }, { text: "AMARILLO", color: "#ffd400" }] },
    2: { start: 152, end: 251, nombre: "Gen 2", region: "Johto", games: [{ text: "ORO", color: "#d4b35e" }, { text: "PLATA", color: "#cccccc" }, { text: "CRISTAL", color: "#a1e5ff" }] },
    3: { start: 252, end: 386, nombre: "Gen 3", region: "Hoenn", games: [{ text: "RUBÍ", color: "#ff2244" }, { text: "ZAFIRO", color: "#2266ff" }, { text: "ESMERALDA", color: "#11cc66" }] },
    4: { start: 387, end: 493, nombre: "Gen 4", region: "Sinnoh", games: [{ text: "DIAMANTE", color: "#aaaaff" }, { text: "PERLA", color: "#ffaaaa" }, { text: "PLATINO", color: "#999999" }] },
    5: { start: 494, end: 649, nombre: "Gen 5", region: "Teselia", games: [{ text: "BLANCO", color: "#ffffff", border: "#000" }, { text: "NEGRO", color: "#444444" }] },
    6: { start: 650, end: 721, nombre: "Gen 6", region: "Kalos", games: [{ text: "X", color: "#0055ff" }, { text: "Y", color: "#ff2233" }] },
    7: { start: 722, end: 809, nombre: "Gen 7", region: "Alola", games: [{ text: "SOL", color: "#ff8811" }, { text: "LUNA", color: "#5555ff" }] },
    8: { start: 810, end: 905, nombre: "Gen 8", region: "Galar", games: [{ text: "ESPADA", color: "#00ccee" }, { text: "ESCUDO", color: "#ff0066" }] },
    9: { start: 906, end: 1025, nombre: "Gen 9", region: "Paldea", games: [{ text: "ESCARLATA", color: "#ff3311" }, { text: "PÚRPURA", color: "#aa22ff" }] }
};

function formatPaddedId(id) {
    return String(id).padStart(3, '0');
}

async function precargarCatalogoBuscar() {
    try {
        let res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
        if (res.ok) {
            let data = await res.json();
            pokedexNombresGlobales = data.results.map((p, index) => ({
                id: index + 1,
                name: p.name.toUpperCase()
            }));
        }
    } catch (e) { console.log("Error precargando buscador global."); }
}

window.mostrarPantallaInicialOcupandoTodo = function() {
    vistaActual = "lista"; 
    currentPokemonId = null;
    const leftColumn = document.getElementById("left-column");
    if(leftColumn) leftColumn.style.display = "none";
    
    const dynamicZone = document.getElementById("dynamic-zone");
    if(dynamicZone) {
        dynamicZone.classList.add("full-screen-zone");
        dynamicZone.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100%; width:100%;">
                <h2 style="font-family:'Press Start 2P', monospace; font-size:11px; color:#000; text-align:center; line-height:2;">
                    &lt;&lt; SELECCIONA UNA GENERACIÓN &gt;&gt;
                </h2>
            </div>
        `;
    }
    const pokeIdDisplay = document.getElementById("poke-id");
    if(pokeIdDisplay) pokeIdDisplay.innerText = "#---";
};

window.seleccionarGenFiltro = function(numGen) {
    const gensBox = document.getElementById("gens-box");
    if (gensBox) gensBox.classList.add("collapsed"); 
    const searchInput = document.getElementById("poke-search");
    if (searchInput) searchInput.value = "";
    bloqueadoPorBuscador = false;
    window.mostrarCajaGeneracionDetalle(numGen);
};

let bloqueadoPorBuscador = false;

window.aplicarFiltroBuscador = function() {
    const searchInput = document.getElementById("poke-search");
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    const dynamicZone = document.getElementById("dynamic-zone");
    const leftColumn = document.getElementById("left-column");

    if (query === "") {
        if (bloqueadoPorBuscador) {
            bloqueadoPorBuscador = false;
            window.mostrarCajaGeneracionDetalle(idGenActiva);
        }
        return;
    }

    bloqueadoPorBuscador = true;
    vistaActual = "lista";

    if (leftColumn) leftColumn.style.display = "none";
    if (dynamicZone) {
        dynamicZone.classList.add("full-screen-zone");
        dynamicZone.innerHTML = `
            <div class="retro-gen-layout">
                <div class="black-info-box">
                    <h2>RESULTADOS DE BÚSQUEDA</h2>
                </div>
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
            if (leftColumn) leftColumn.style.display = "flex";
            if (dynamicZone) dynamicZone.classList.remove("full-screen-zone");
            vistaActual = "detalle";
            window.cargarPokemonData(poke.id);
        };
        tarjetaPoke.innerHTML = `<span class="poke-num">#${numPadded}</span><span class="poke-name">${poke.name}</span>`;
        contenedorDestino.appendChild(tarjetaPoke);
    });
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

window.mostrarCajaGeneracionDetalle = async function(numGen) {
    idGenActiva = numGen; 
    vistaActual = "lista";
    const leftColumn = document.getElementById("left-column");
    if (leftColumn) leftColumn.style.display = "none";

    const dynamicZone = document.getElementById("dynamic-zone");
    if (!dynamicZone) return;
    dynamicZone.classList.add("full-screen-zone");

    const rango = rangosGeneracionesPokedex[numGen];

    // Generamos las etiquetas de los juegos aquí
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
                    GEN ${numGen} - ${rango.region.toUpperCase()} ${juegosHtml}
                </h2>
            </div>
            <div id="grid-pokes-3x3" class="grid-gens-3x3">
                <p style="font-size: 8px; color: #000; grid-column: span 3;">CARGANDO REJILLA...</p>
            </div>
        </div>
    `;

    try {
        let respuesta = await fetch(`https://pokeapi.co/api/v2/generation/${numGen}/`);
        let datosGen = await respuesta.json();
        
        let pokemonListData = datosGen.pokemon_species.map(specie => {
            let id = parseInt(specie.url.split("/").slice(-2, -1)[0]);
            return { id: id, name: specie.name.toUpperCase() };
        }).filter(p => p.id >= rango.start && p.id <= rango.end).sort((a, b) => a.id - b.id);

        const gridContenedor = document.getElementById("grid-pokes-3x3");
        if (!gridContenedor) return;
        gridContenedor.innerHTML = ""; 

        pokemonListData.forEach(poke => {
            let numPadded = formatPaddedId(poke.id);
            let tarjetaPoke = document.createElement("div");
            tarjetaPoke.className = "item-poke-minimal";
            tarjetaPoke.onclick = () => {
                if (leftColumn) leftColumn.style.display = "flex";
                dynamicZone.classList.remove("full-screen-zone");
                vistaActual = "detalle";
                window.cargarPokemonData(poke.id);
            };
            tarjetaPoke.innerHTML = `<span class="poke-num">#${numPadded}</span><span class="poke-name">${poke.name}</span>`;
            gridContenedor.appendChild(tarjetaPoke);
        });
    } catch (error) {}
};

window.cargarPokemonData = async function(idOrName) {
    try {
        let res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName.toString().toLowerCase()}`);
        if (!res.ok) return; 
        let data = await res.json();
        currentPokemonId = data.id;
        window.currentPokemonDataStorage = data;
        
        for (const genKey in rangosGeneracionesPokedex) {
            if (currentPokemonId >= rangosGeneracionesPokedex[genKey].start && currentPokemonId <= rangosGeneracionesPokedex[genKey].end) {
                idGenActiva = parseInt(genKey);
                break;
            }
        }
        
        let speciesRes = await fetch(data.species.url);
        let speciesData = await speciesRes.json();
        let evoChainRes = await fetch(speciesData.evolution_chain.url);
        let evoChainData = await evoChainRes.json();

        const idDisplay = document.getElementById("poke-id");
        if(idDisplay) idDisplay.innerText = "#" + formatPaddedId(currentPokemonId);

        await window.renderizarVistaDetail(data, speciesData, evoChainData);
        window.manejarVisualizacionMedia(data);
    } catch (e) {}
};

window.cambiarPokemon = function(direccion) {
    if (!currentPokemonId) return;
    let rangoActual = rangosGeneracionesPokedex[idGenActiva];
    let objetivoId = currentPokemonId + direccion;
    if (objetivoId >= rangoActual.start && objetivoId <= rangoActual.end) {
        window.cargarPokemonData(objetivoId);
    }
};

window.toggleVistaLista = function() {
    window.mostrarCajaGeneracionDetalle(idGenActiva);
};

window.mostrarTodasLasGeneraciones = function() {
    console.log("Filtro global activo.");
};

window.renderizarVistaDetail = async function(data, speciesData, evoChainData) {
    let rango = rangosGeneracionesPokedex[idGenActiva];
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

    let descEntry = speciesData.flavor_text_entries.find(e => e.language.name === 'es') || { flavor_text: "Sin descripción." };
    let statPS  = data.stats.find(s => s.stat.name === "hp")?.base_stat || 0;
    let statAT  = data.stats.find(s => s.stat.name === "attack")?.base_stat || 0;
    let statDF  = data.stats.find(s => s.stat.name === "defense")?.base_stat || 0;
    let statSA  = data.stats.find(s => s.stat.name === "special-attack")?.base_stat || 0;
    let statSD  = data.stats.find(s => s.stat.name === "special-defense")?.base_stat || 0;
    let statVEL = data.stats.find(s => s.stat.name === "speed")?.base_stat || 0;
    let altura  = (data.height / 10) + "m";
    let peso    = (data.weight / 10) + "kg";

    let tipo1Raw = data.types[0]?.type.name || "-";
    let tipo2Raw = data.types[1]?.type.name || "-";
    
    let tipo1Traducido = (typeof traduccionTipos !== 'undefined' ? traduccionTipos[tipo1Raw.toLowerCase()] : null) || tipo1Raw.toUpperCase();
    let tipo2Traducido = tipo2Raw !== "-" ? ((typeof traduccionTipos !== 'undefined' ? traduccionTipos[tipo2Raw.toLowerCase()] : null) || tipo2Raw.toUpperCase()) : "-";

    let tipo1BgColor = typeColors[tipo1Raw.toLowerCase()] || "#cef5ff";
    let tipo2BgColor = tipo2Raw !== "-" ? (typeColors[tipo2Raw.toLowerCase()] || "#cef5ff") : "#cef5ff";

    // Modificado para usar las clases limpias que enganchan con tu CSS
    let htmlBloqueTipos = `
        <div class="tipos-container-grid">
            <div class="stat-item-tipo">
                <span class="stat-label-tipo">TIPO 1</span>
                <span class="stat-value-tipo" style="background: ${tipo1BgColor}; color: #fff; text-shadow: 1px 1px #000;">
                    ${tipo1Traducido}
                </span>
            </div>
            <div class="stat-item-tipo">
                <span class="stat-label-tipo">TIPO 2</span>
                <span class="stat-value-tipo" style="background: ${tipo2Raw !== '-' ? tipo2BgColor : '#cef5ff'}; color: ${tipo2Raw !== '-' ? '#fff' : '#000'}; text-shadow: ${tipo2Raw !== '-' ? '1px 1px #000' : 'none'};">
                    ${tipo2Traducido}
                </span>
            </div>
        </div>
    `;

    let todosLosNodos = [];
    const procesarNodoEvoMúltiple = (nodo) => {
        let id = parseInt(nodo.species.url.split("/").slice(-2, -1)[0]);
        
        let rutaImagenEvo = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
        if (currentVariante === "shiny") {
            rutaImagenEvo = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;
        }

        todosLosNodos.push({
            id: id,
            name: nodo.species.name.toUpperCase(),
            img: rutaImagenEvo
        });
        if (nodo.evolves_to && nodo.evolves_to.length > 0) {
            nodo.evolves_to.forEach(subNodo => procesarNodoEvoMúltiple(subNodo));
        }
    };

    if (evoChainData && evoChainData.chain) {
        procesarNodoEvoMúltiple(evoChainData.chain);
    }

    let tieneRamificaciones = evoChainData.chain?.evolves_to?.length > 1 || evoChainData.chain?.evolves_to?.some(e => e.evolves_to?.length > 1);
    let evoHtml = "";

    if (tieneRamificaciones) {
        let baseNode = todosLosNodos[0];
        let ramasEvoluciones = todosLosNodos.slice(1);
        let bordeEevee = (baseNode.id === currentPokemonId) ? "border: 2px solid #ffcc00 !important;" : "border: 2px solid #000 !important;";

        evoHtml = `
            <div class="evo-tree-container" style="display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%; justify-content: center; box-sizing: border-box;">
                <div class="evo-top-row" style="display: flex; flex-direction: column; align-items: center; width: 100%; position: relative;">
                    <div class="evo-poke-node" onclick="window.cargarPokemonData(${baseNode.id})" style="cursor:pointer; padding: 4px; ${bordeEevee}">
                        <img src="${baseNode.img}" style="width: 34px; height: 34px; object-fit: contain;">
                        <span>${baseNode.name}</span>
                    </div>
                    <div class="evo-single-down-arrow" style="font-family:'Press Start 2P', monospace; font-size: 11px; color: #000; font-weight: bold; margin: 4px 0;">↓</div>
                </div>

                <div class="evo-grid-branches" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(45px, 1fr)); gap: 6px 5px; width: 100%; justify-content: center;">
        `;

        ramasEvoluciones.forEach((nodo) => {
            let bordeEspecial = (nodo.id === currentPokemonId) ? "border: 2px solid #ffcc00 !important;" : "border: 2px solid #000 !important;";
            evoHtml += `
                <div class="evo-poke-node" onclick="window.cargarPokemonData(${nodo.id})" style="cursor:pointer; padding: 3px; ${bordeEspecial}">
                    <img src="${nodo.img}" style="width: 32px; height: 32px; object-fit: contain;">
                    <span>${nodo.name}</span>
                </div>
            `;
        });

        evoHtml += `
                </div>
            </div>
        `;
    } else {
        evoHtml = `<div class="evo-flex-linear" style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 100%;">`;
        todosLosNodos.forEach((nodo, index) => {
            let bordeEspecial = (nodo.id === currentPokemonId) ? "border: 2px solid #ffcc00 !important;" : "border: 2px solid #000 !important;";
            evoHtml += `
                <div class="evo-poke-node" onclick="window.cargarPokemonData(${nodo.id})" style="cursor:pointer; ${bordeEspecial}">
                    <img src="${nodo.img}" style="width: 44px; height: 44px; object-fit: contain;">
                    <span>${nodo.name}</span>
                </div>
            `;
            if (index < todosLosNodos.length - 1) {
                evoHtml += `<div class="evo-arrow-right" style="font-family:'Press Start 2P', monospace; font-size:12px; color:#000; font-weight:bold;">►</div>`;
            }
        });
        evoHtml += `</div>`;
    }

    let movesToFetch = data.moves.slice(0, 22);
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
                <td style="text-align:left; font-weight:bold; padding-left: 6px;">${moveName}</td>
                <td><span class="move-type-pill" style="background-color:${badgeColor};">${traduccionTipos[typeName.toLowerCase()] || typeName.toUpperCase()}</span></td>
                <td>${power}</td>
                <td style="padding-right: 6px;">${accuracy}</td>
            </tr>
        `;
    }

    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${data.name.toUpperCase()}</h2>
                    <div class="poke-header-meta">
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
                
                <div class="desc-box">
                    DESC: ${descEntry.flavor_text.replace(/\n|\f/g, ' ')}
                </div>
            </div>

            <div class="view-right-panel" style="flex: 1;">
                <div class="evo-section-box">
                    <div class="evo-title-label" style="background:#000; color:#fff; padding:4px 0;">CADENA EVOLUTIVA</div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${evoHtml}
                    </div>
                </div>

                <div class="moves-section-box">
                    <div class="moves-title-label" style="background:#000; color:#fff; padding:4px 0;">MOVIMIENTOS APRENDIDOS</div>
                    <div class="moves-table-scroll-wrapper">
                        <table class="moves-retro-table">
                            <thead>
                                <tr>
                                    <th style="text-align:left; padding-left: 6px;">MOV</th>
                                    <th>TIPO</th>
                                    <th>POT</th>
                                    <th style="padding-right: 6px;">PRE</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${movesRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
};
window.manejarVisualizacionMedia = function(data) {
    let box = document.getElementById("caja-render-imagen");
    if(!box) return;
    
    if (mainAnimationId) cancelAnimationFrame(mainAnimationId);
    box.innerHTML=""

    if (modo3DActivo) {
        let cargandoTxt = document.createElement("div");
        cargandoTxt.id = "cargando-retro-text";
        cargandoTxt.style = "font-size:7px;color:black;text-align:center;padding-top:45px;font-family:'Press Start 2P';position:absolute;width:100%;";
        cargandoTxt.innerText = `CARGANDO 3D...`;
        box.appendChild(cargandoTxt);
        setTimeout(() => { window.inicializarVisorBlender3D(box, data.id); }, 50);
    } else {
        let url = data.sprites.other["official-artwork"].front_default;
        if (currentVariante === "shiny") url = data.sprites.other["official-artwork"].front_shiny;
        
        let img2D = document.createElement("img");
        img2D.id = "poke-img";
        img2D.src = url || data.sprites.front_default;
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

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.5);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    const loader = new THREE.GLTFLoader();
    let carpeta = (currentVariante === "shiny") ? "shiny" : "regular";
    loader.load(`/assets-main/models/opt/${carpeta}/${pokemonId}.glb`, (gltf) => {
        if(cargando) cargando.remove();
        if (currentPokemonId !== pokemonId || !modo3DActivo) return;
        currentModel = gltf.scene;
        scene.add(currentModel);
    }, undefined, () => {
        if(cargando) cargando.remove();
        let msgErr = document.createElement("div");
        msgErr.className = "error-3d-msg";
        msgErr.style = "position:absolute;top:45px;width:100%;text-align:center;font-size:7px;color:black;font-family:'Press Start 2P';";
        msgErr.innerHTML = `NO 3D`;
        container.appendChild(msgErr);
    });

    function animate() {
        if (!modo3DActivo) return;
        mainAnimationId = requestAnimationFrame(animate);
        if (currentModel && !isDragging) currentModel.rotation.y += 0.01;
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

// Vinculamos ambos nombres posibles para evitar que falle el HTML
window.cambiarVarianteVisual = window.cambiarVariante = function(tipo) {
    currentVariante = tipo;
    
    // Soporte para IDs antiguos y nuevos de botones
    (document.getElementById("btn-var-regular") || document.getElementById("btn-var-reg"))?.classList.toggle("active", tipo === 'regular');
    document.getElementById("btn-var-shiny")?.classList.toggle("active", tipo === 'shiny');
    
    let imgElement = document.getElementById("poke-img");
    if (imgElement && window.currentPokemonDataStorage) {
        let url = window.currentPokemonDataStorage.sprites.other["official-artwork"].front_default;
        if (tipo === "shiny") {
            url = window.currentPokemonDataStorage.sprites.other["official-artwork"].front_shiny;
        }
        imgElement.src = url || window.currentPokemonDataStorage.sprites.front_default;
    }

    if (vistaActual === "detalle" && currentPokemonId) {
        window.cargarPokemonData(currentPokemonId);
    }
};