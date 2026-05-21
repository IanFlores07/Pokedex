let currentPokemonId = 1;
let currentVariante = "regular"; 
let vistaActual = "detalle"; 
let filtroGenActual = "todas";
let listaCacheCompleta = []; 
let modo3DActivo = false;

const typeColors = {
    normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030", grass: "#78C850",
    ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0", ground: "#E0C068", flying: "#A890F0",
    psychic: "#F85888", bug: "#A8B820", rock: "#B8A038", ghost: "#705898", dragon: "#7038F8",
    dark: "#705848", steel: "#B8B8D0", fairy: "#EE99AC"
};

const typeTranslations = {
    NORMAL: "NORMAL", FIRE: "FUEGO", WATER: "AGUA", ELECTRIC: "ELÉCTRICO", GRASS: "PLANTA",
    ICE: "HIELO", FIGHTING: "LUCHA", POISON: "VENENO", GROUND: "TIERRA", FLYING: "VOLADOR",
    PSYCHIC: "PSÍQUICO", BUG: "BICHO", ROCK: "ROCA", GHOST: "FANTASMA", DRAGON: "DRAGÓN",
    DARK: "SINIESTRO", STEEL: "ACERO", FAIRY: "HADA"
};

const genRanges = {
    1: { start: 1, end: 151, games: [{ text: "ROJO", color: "#ff1111" }, { text: "AZUL", color: "#1155ff" }, { text: "AMARILLO", color: "#ffd400" }] },
    2: { start: 152, end: 251, games: [{ text: "ORO", color: "#d4b35e" }, { text: "PLATA", color: "#cccccc" }, { text: "CRISTAL", color: "#a1e5ff" }] },
    3: { start: 252, end: 386, games: [{ text: "RUBÍ", color: "#ff2244" }, { text: "ZAFIRO", color: "#2266ff" }, { text: "ESMERALDA", color: "#11cc66" }] },
    4: { start: 387, end: 493, games: [{ text: "DIAMANTE", color: "#aaaaff" }, { text: "PERLA", color: "#ffaaaa" }, { text: "PLATINO", color: "#999999" }] },
    5: { start: 494, end: 649, games: [{ text: "BLANCO", color: "#ffffff" }, { text: "NEGRO", color: "#444444" }] },
    6: { start: 650, end: 721, games: [{ text: "X", color: "#0055ff" }, { text: "Y", color: "#ff2233" }] },
    7: { start: 722, end: 809, games: [{ text: "SOL", color: "#ff8811" }, { text: "LUNA", color: "#5555ff" }] },
    8: { start: 810, end: 905, games: [{ text: "ESPADA", color: "#00ccee" }, { text: "ESCUDO", color: "#ff0066" }] },
    9: { start: 906, end: 1010, games: [{ text: "ESCARLATA", color: "#ff3311" }, { text: "PÚRPURA", color: "#aa22ff" }] }
};

function formatPaddedId(id) {
    return String(id).padStart(3, '0');
}

function getGenFromId(id) {
    for (let gen in genRanges) {
        if (id >= genRanges[gen].start && id <= genRanges[gen].end) {
            return parseInt(gen);
        }
    }
    return 1;
}

function buildGamesSpanString(genNumber) {
    let arr = genRanges[genNumber].games;
    let html = `<span class="games-bracket">`;
    arr.forEach((g, i) => {
        html += `<span class="game-word-span" style="color:${g.color}">${g.text}</span>`;
        if (i < arr.length - 1) html += ` <span style="color:#fff;">/</span> `;
    });
    html += `</span>`;
    return html;
}

async function cargarPokemonData(idOrName) {
    try {
        let res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName.toString().toLowerCase()}`);
        if (!res.ok) return; 
        let data = await res.json();
        
        currentPokemonId = data.id;
        
        let speciesRes = await fetch(data.species.url);
        let speciesData = await speciesRes.json();

        document.getElementById("poke-id").innerText = "#" + formatPaddedId(currentPokemonId);
        
        if (modo3DActivo) {
            establecerContenedor3D();
        } else {
            establecerContenedorImagen(data);
        }

        const leftColumn = document.getElementById("left-column");
        const dynamicZone = document.getElementById("dynamic-zone");

        if (vistaActual === "detalle") {
            leftColumn.style.display = "flex";
            dynamicZone.classList.remove("full-screen-zone");
            renderizarVistaDetalle(data, speciesData);
        } else {
            leftColumn.style.display = "none";
            dynamicZone.classList.add("full-screen-zone");
            renderizarVistaListaIntegrada();
        }
    } catch (e) {
        console.log("Error al procesar la petición.");
    }
}

function establecerContenedorImagen(data) {
    let box = document.getElementById("media-display-box");
    // El botón se inyecta con la clase icon-fullscreen-inside e icono blanco ⛶
    box.innerHTML = `
        <img id="poke-img" src="" alt="Pokemon">
        <button id="btn-fullscreen-3d" class="icon-fullscreen-inside hidden" onclick="abrirModalGigante3D()">⛶</button>
    `;
    let imgTag = document.getElementById("poke-img");
    
    if (currentVariante === "shiny") {
        imgTag.src = data.sprites.other["official-artwork"].front_shiny || data.sprites.front_shiny;
    } else {
        imgTag.src = data.sprites.other["official-artwork"].front_default || data.sprites.front_default;
    }
}

function establecerContenedor3D() {
    let box = document.getElementById("media-display-box");
    let folder = (currentVariante === "shiny") ? "shiny" : "regular";
    
    // Inyectamos el model-viewer con la ruta de tu proyecto local y el botón arriba a la derecha
    box.innerHTML = `
        <model-viewer 
            id="pokedex-render-model"
            src="/assets-main/models/opt/${folder}/${currentPokemonId}.glb" 
            camera-controls auto-rotate autoplay>
        </model-viewer>
        <button id="btn-fullscreen-3d" class="icon-fullscreen-inside" onclick="abrirModalGigante3D()">⛶</button>
    `;

    let viewer = document.getElementById("pokedex-render-model");
    viewer.addEventListener('error', () => {
        // Respaldo online por si no existe localmente el archivo .glb solicitado
        viewer.src = `https://raw.githubusercontent.com/theartificialguy/pokemon-3d-models/main/models/${currentPokemonId}.glb`;
    });
}

function toggleModo3D() {
    let btn3d = document.getElementById("btn-toggle-3d");
    if (!modo3DActivo) {
        modo3DActivo = true;
        btn3d.innerText = "VER FOTO";
        establecerContenedor3D();
    } else {
        modo3DActivo = false;
        btn3d.innerText = "VER 3D";
        cargarPokemonData(currentPokemonId);
    }
}

function abrirModalGigante3D() {
    document.getElementById("modal-3d-giant").style.display = "flex";
    let folder = (currentVariante === "shiny") ? "shiny" : "regular";
    
    document.getElementById("contenedor-render-giant").innerHTML = `
        <model-viewer 
            id="giant-render-model"
            src="/assets-main/models/opt/${folder}/${currentPokemonId}.glb" 
            camera-controls auto-rotate autoplay>
        </model-viewer>
    `;
    
    let giantViewer = document.getElementById("giant-render-model");
    giantViewer.addEventListener('error', () => {
        giantViewer.src = `https://raw.githubusercontent.com/theartificialguy/pokemon-3d-models/main/models/${currentPokemonId}.glb`;
    });
}

function cerrarModalGigante3D() {
    document.getElementById("modal-3d-giant").style.display = "none";
    document.getElementById("contenedor-render-giant").innerHTML = "";
}

function renderizarVistaDetalle(data, speciesData) {
    let genNumber = getGenFromId(data.id);
    let juegosHtml = buildGamesSpanString(genNumber);

    let t1Raw = data.types[0].type.name.toUpperCase();
    let t2Raw = data.types[1] ? data.types[1].type.name.toUpperCase() : null;
    
    let t1 = typeTranslations[t1Raw] || t1Raw;
    let t2 = t2Raw ? (typeTranslations[t2Raw] || t2Raw) : null;

    let descEntry = speciesData.flavor_text_entries.find(e => e.language.name === 'es') || speciesData.flavor_text_entries.find(e => e.language.name === 'en');
    let textoDesc = descEntry ? descEntry.flavor_text.replace(/\n|\f/g, ' ') : "No description recorded.";

    const dynamicZone = document.getElementById("dynamic-zone");
    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${data.name}</h2>
                    <div class="gen-and-games-container">
                        <span class="gen-pill-label">GEN ${genNumber}:</span>
                        ${juegosHtml}
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-item"><span>PS</span><span>${data.stats.find(s=>s.stat.name==='hp').base_stat}</span></div>
                    <div class="stat-item"><span>AT</span><span>${data.stats.find(s=>s.stat.name==='attack').base_stat}</span></div>
                    <div class="stat-item"><span>DF</span><span>${data.stats.find(s=>s.stat.name==='defense').base_stat}</span></div>
                    <div class="stat-item"><span>SA</span><span>${data.stats.find(s=>s.stat.name==='special-attack').base_stat}</span></div>
                    <div class="stat-item"><span>SD</span><span>${data.stats.find(s=>s.stat.name==='special-defense').base_stat}</span></div>
                    <div class="stat-item"><span>VEL</span><span>${data.stats.find(s=>s.stat.name==='speed').base_stat}</span></div>
                    <div class="stat-item"><span>ALT</span><span>${data.height / 10}m</span></div>
                    <div class="stat-item"><span>PES</span><span>${data.weight / 10}kg</span></div>
                </div>

                <div class="types-horizontal-row">
                    <div class="type-box-row">
                        <span class="type-label">TIPO 1</span>
                        <span class="type-value" style="background-color: ${typeColors[data.types[0].type.name]}">${t1}</span>
                    </div>
                    <div class="type-box-row">
                        <span class="type-label">TIPO 2</span>
                        <span class="type-value" style="background-color: ${t2Raw ? typeColors[data.types[1].type.name] : '#ccc'}">${t2 ? t2 : '-'}</span>
                    </div>
                </div>

                <div class="desc-box">DESC: ${textoDesc}</div>
            </div>

            <div class="view-right-evo">
                <h3 class="evo-title-label">CADENA EVOLUTIVA</h3>
                <div class="evo-container-scroll" id="evo-master-container"></div>
                <button class="btn-moves" onclick="abrirModalMoves(${data.id})">MOVIMIENTOS</button>
            </div>
        </div>
    `;
    
    if (data.id === 808 || data.id === 809) {
        renderizarEvolucionManualMeltan();
    } else {
        cargarCadenaEvolutivaArbol(speciesData.evolution_chain.url);
    }
}

function renderizarEvolucionManualMeltan() {
    let container = document.getElementById("evo-master-container");
    if (!container) return;
    container.innerHTML = "";

    let masterTreeWrapper = document.createElement("div");
    masterTreeWrapper.className = "evo-complex-tree";
    masterTreeWrapper.appendChild(crearIconoEvoNode(808));

    let flecha = document.createElement("span");
    flecha.className = "evo-arrow-side";
    flecha.innerText = ">";
    masterTreeWrapper.appendChild(flecha);

    masterTreeWrapper.appendChild(crearIconoEvoNode(809));
    container.appendChild(masterTreeWrapper);
}

async function cargarCadenaEvolutivaArbol(url) {
    try {
        let res = await fetch(url);
        let chainData = await res.json();
        let container = document.getElementById("evo-master-container");
        if (!container) return;
        container.innerHTML = "";

        let masterTreeWrapper = document.createElement("div");
        masterTreeWrapper.className = "evo-complex-tree";

        let f1 = chainData.chain;
        if (f1) {
            masterTreeWrapper.appendChild(crearIconoEvoNode(f1.species.url.split("/").slice(-2, -1)[0]));
            
            if (f1.evolves_to.length > 0) {
                let flecha1 = document.createElement("span");
                flecha1.className = "evo-arrow-side";
                flecha1.innerText = ">";
                masterTreeWrapper.appendChild(flecha1);

                let columnaF2 = document.createElement("div");
                columnaF2.className = "evo-column-stack";

                f1.evolves_to.forEach(f2 => {
                    let nodeWrapperF2 = document.createElement("div");
                    nodeWrapperF2.className = "evo-node-wrapper";
                    nodeWrapperF2.appendChild(crearIconoEvoNode(f2.species.url.split("/").slice(-2, -1)[0]));

                    if (f2.evolves_to.length > 0) {
                        let flecha2 = document.createElement("span");
                        flecha2.className = "evo-arrow-side";
                        flecha2.innerText = ">";
                        nodeWrapperF2.appendChild(flecha2);

                        let columnaF3 = document.createElement("div");
                        columnaF3.className = "evo-column-stack";
                        f2.evolves_to.forEach(f3 => {
                            columnaF3.appendChild(crearIconoEvoNode(f3.species.url.split("/").slice(-2, -1)[0]));
                        });
                        nodeWrapperF2.appendChild(columnaF3);
                    }
                    columnaF2.appendChild(nodeWrapperF2);
                });
                masterTreeWrapper.appendChild(columnaF2);
            }
        }
        container.appendChild(masterTreeWrapper);
    } catch (e) {
        container.innerText = "Error cargando evoluciones.";
    }
}

function crearIconoEvoNode(id) {
    let img = document.createElement("img");
    img.className = "evo-poke";
    if (currentVariante === "shiny") {
        img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
    } else {
        img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    }
    img.onclick = () => { vistaActual = "detalle"; cargarPokemonData(id); };
    return img;
}

function renderizarVistaListaIntegrada() {
    const dynamicZone = document.getElementById("dynamic-zone");
    dynamicZone.innerHTML = `
        <div class="integrated-list-zone">
            <div class="list-scroll-container" id="list-scroll-container"></div>
        </div>
    `;

    let mainScrollBox = document.getElementById("list-scroll-container");
    let busqueda = document.getElementById("poke-search").value.toLowerCase().trim();

    if (filtroGenActual !== "todas") {
        let rango = genRanges[filtroGenActual];
        let pokesFiltrados = listaCacheCompleta.filter(p => p.id >= rango.start && p.id <= rango.end && (p.name.toLowerCase().includes(busqueda) || p.id.toString() === busqueda));
        
        let header = document.createElement("div");
        header.className = "gen-section-header";
        header.innerHTML = `<span>GENERACIÓN ${filtroGenActual}</span> <span class="gen-section-games-subtitle">${buildGamesSpanString(filtroGenActual)}</span>`;
        mainScrollBox.appendChild(header);

        let grid = document.createElement("div");
        grid.className = "grid-pokes-scroll";
        pokesFiltrados.forEach(p => grid.appendChild(crearItemListaRejilla(p)));
        mainScrollBox.appendChild(grid);
    } else {
        for (let genId = 1; genId <= 9; genId++) {
            let rango = genRanges[genId];
            let pokesFiltrados = listaCacheCompleta.filter(p => p.id >= rango.start && p.id <= rango.end && (p.name.toLowerCase().includes(busqueda) || p.id.toString() === busqueda));
            
            if (pokesFiltrados.length > 0) {
                let header = document.createElement("div");
                header.className = "gen-section-header";
                header.innerHTML = `<span>GENERACIÓN ${genId}</span> <span class="gen-section-games-subtitle">${buildGamesSpanString(genId)}</span>`;
                mainScrollBox.appendChild(header);

                let grid = document.createElement("div");
                grid.className = "grid-pokes-scroll";
                pokesFiltrados.forEach(p => grid.appendChild(crearItemListaRejilla(p)));
                mainScrollBox.appendChild(grid);
            }
        }
    }
}

function crearItemListaRejilla(p) {
    let item = document.createElement("div");
    item.className = "grid-item-poke";
    item.onclick = () => {
        vistaActual = "detalle";
        cargarPokemonData(p.id);
    };
    item.innerHTML = `<span>#${formatPaddedId(p.id)}<br>${p.name}</span>`;
    return item;
}

document.getElementById("poke-search").addEventListener("input", function() {
    vistaActual = "lista"; 
    const leftColumn = document.getElementById("left-column");
    const dynamicZone = document.getElementById("dynamic-zone");
    leftColumn.style.display = "none";
    dynamicZone.classList.add("full-screen-zone");

    renderizarVistaListaIntegrada();
    
    let valor = this.value.trim();
    if (valor !== "" && !isNaN(valor)) {
        let idInt = parseInt(valor);
        if (idInt >= 1 && idInt <= 1010) {
            currentPokemonId = idInt;
        }
    }
});

function seleccionarGenFiltro(num) {
    document.getElementById("gens-box").classList.add("collapsed");
    filtroGenActual = num;
    vistaActual = "lista";
    
    const leftColumn = document.getElementById("left-column");
    const dynamicZone = document.getElementById("dynamic-zone");
    leftColumn.style.display = "none";
    dynamicZone.classList.add("full-screen-zone");

    renderizarVistaListaIntegrada();
}

function toggleVistaLista() {
    vistaActual = (vistaActual === "detalle") ? "lista" : "detalle";
    cargarPokemonData(currentPokemonId);
}

function cambiarVariante(tipo) {
    currentVariante = tipo;
    document.getElementById("btn-var-regular").classList.toggle("active", tipo === "regular");
    document.getElementById("btn-var-shiny").classList.toggle("active", tipo === "shiny");
    cargarPokemonData(currentPokemonId);
}

function cambiarPokemon(dir) {
    currentPokemonId += dir;
    if (currentPokemonId < 1) currentPokemonId = 1010;
    if (currentPokemonId > 1010) currentPokemonId = 1;
    cargarPokemonData(currentPokemonId);
}

document.getElementById("btn-all-pokes").onclick = () => {
    document.getElementById("poke-search").value = "";
    filtroGenActual = "todas";
    vistaActual = "lista";
    cargarPokemonData(currentPokemonId);
};

document.getElementById("btn-toggle-gens").onclick = () => {
    document.getElementById("gens-box").classList.toggle("collapsed");
};

async function abrirModalMoves(pokeId) {
    document.getElementById("modal-moves").style.display = "flex";
    let tbody = document.getElementById("moves-list-tbody");
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#ffcc00;'>LOADING DATA...</td></tr>";

    try {
        let res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokeId}`);
        let data = await res.json();
        tbody.innerHTML = "";

        let selectMoves = data.moves.slice(0, 25);
        let promesas = selectMoves.map(m => fetch(m.move.url).then(r => r.json()));
        let listaMovimientosDetallados = await Promise.all(promesas);

        listaMovimientosDetallados.forEach(md => {
            let tr = document.createElement("tr");
            let nombre = md.name.toUpperCase(); 
            let tipoRaw = md.type.name.toUpperCase();
            let tipo = typeTranslations[tipoRaw] || tipoRaw;
            let cat = md.damage_class ? md.damage_class.name.substring(0, 3).toUpperCase() : "-";
            let pot = md.power ? md.power : "-";
            let prec = md.accuracy ? md.accuracy + "%" : "-";

            tr.innerHTML = `
                <td>${nombre}</td>
                <td style="color:${typeColors[md.type.name] || '#fff'}">${tipo}</td>
                <td>${cat}</td>
                <td>${pot}</td>
                <td>${prec}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = "<tr><td colspan='5'>Error loading moves.</td></tr>";
    }
}
function cerrarModalMoves() { document.getElementById("modal-moves").style.display = "none"; }

async function precargarIndiceNacional() {
    let res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1010");
    let data = await res.json();
    listaCacheCompleta = data.results.map((p, index) => ({
        id: index + 1,
        name: p.name.toUpperCase()
    }));
}

window.onload = async () => {
    await precargarIndiceNacional();
    cargarPokemonData(1);
};