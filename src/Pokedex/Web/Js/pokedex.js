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

const typeColors = {
    normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030", grass: "#78C850",
    ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0", ground: "#E0C068", flying: "#A890F0",
    psychic: "#F85888", bug: "#A8B820", rock: "#B8A038", ghost: "#705898", dragon: "#7038F8",
    dark: "#705848", steel: "#B8B8D0", fairy: "#EE99AC"
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
    10: { start: 1026, end: 1050, nombre: "Gen 10", region: "Sin Región", games: [{ text: "VIENTO", color: "#00ffcc" }, { text: "OLEAJE", color: "#ff00aa" }] }
};

function formatPaddedId(id) {
    return String(id).padStart(3, '0');
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
    window.mostrarCajaGeneracionDetalle(numGen);
};

document.addEventListener("DOMContentLoaded", () => {
    window.mostrarPantallaInicialOcupandoTodo();
    const btnGenToggle = document.getElementById("btn-toggle-gens");
    const gensBox = document.getElementById("gens-box");

    if (btnGenToggle && gensBox) {
        btnGenToggle.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            gensBox.classList.toggle("collapsed");
        });
        document.addEventListener("click", (e) => {
            if (!btnGenToggle.contains(e.target) && !gensBox.contains(e.target)) {
                gensBox.classList.add("collapsed");
            }
        });
    }
});

// 4. MOSTRAR REJILLA 3X3 CON FILAS CENTRADAS Y METADATOS RETRO COLOREADOS
window.mostrarCajaGeneracionDetalle = async function(numGen) {
    idGenActiva = numGen; 
    vistaActual = "lista";

    const leftColumn = document.getElementById("left-column");
    if (leftColumn) leftColumn.style.display = "none";

    const dynamicZone = document.getElementById("dynamic-zone");
    if (!dynamicZone) return;
    dynamicZone.classList.add("full-screen-zone");

    const rango = rangosGeneracionesPokedex[numGen];
    if (!rango) return;
    
    // Generar píldoras de juegos de color dinámico
    let juegosHtml = "";
    rango.games.forEach(g => {
        let borderStyle = g.border ? `border: 1px solid ${g.border};` : 'border: 1px solid #000;';
        let textColor = g.color === "#ffffff" ? "#000000" : "#ffffff";
        juegosHtml += `<span style="background:${g.color}; color:${textColor}; padding:2px 5px; font-size:7px; font-weight:bold; ${borderStyle}">${g.text}</span>`;
    });
    
    // Formato exacto: GEN 1 - KANTO y debajo los juegos con colores
    dynamicZone.innerHTML = `
        <div class="retro-gen-layout">
            <div class="black-info-box">
                <h2>GEN ${numGen} - ${rango.region.toUpperCase()}</h2>
                <p>${juegosHtml}</p>
            </div>
            <div id="grid-pokes-3x3" class="grid-gens-3x3">
                <p style="font-size: 8px; color: #000;">CARGANDO REJILLA...</p>
            </div>
        </div>
    `;

    try {
        let respuesta = await fetch(`https://pokeapi.co/api/v2/generation/${numGen}/`);
        let datosGen = await respuesta.json();
        
        let pokemonListData = datosGen.pokemon_species.map(specie => {
            let id = parseInt(specie.url.split("/").slice(-2, -1)[0]);
            return { id: id, name: specie.name.toUpperCase() };
        }).filter(p => p.id >= rango.start && p.id <= rango.end)
          .sort((a, b) => a.id - b.id);

        const gridContenedor = document.getElementById("grid-pokes-3x3");
        if (!gridContenedor) return;
        gridContenedor.innerHTML = ""; 

        pokemonListData.forEach(poke => {
            let numPadded = String(poke.id).padStart(3, '0');
            let tarjetaPoke = document.createElement("div");
            tarjetaPoke.className = "item-poke-minimal";
            
            tarjetaPoke.onclick = () => {
                // Aseguramos que la columna izquierda aparezca y ocupe su 33.33% real
                if (leftColumn) {
                    leftColumn.style.display = "flex";
                }
                // Quitamos la clase de pantalla completa de la lista para que el wrapper ocupe su 66.66% ideal
                dynamicZone.classList.remove("full-screen-zone");
                vistaActual = "detalle";
                window.cargarPokemonData(poke.id);
            };

            tarjetaPoke.innerHTML = `
                <span class="poke-num">#${numPadded}</span>
                <span class="poke-name">${poke.name}</span>
            `;
            gridContenedor.appendChild(tarjetaPoke);
        });
    } catch (error) {
        if (document.getElementById("grid-pokes-3x3")) {
            document.getElementById("grid-pokes-3x3").innerHTML = `<p style="color: red; font-size: 8px;">ERROR DE CONEXIÓN.</p>`;
        }
    }
};

// 5. CARGAR DETALLE COMPLETO DESDE LA API
window.cargarPokemonData = async function(idOrName) {
    try {
        let res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName.toString().toLowerCase()}`);
        if (!res.ok) return; 
        let data = await res.json();
        
        currentPokemonId = data.id;
        
        for (const genKey in rangosGeneracionesPokedex) {
            let r = rangosGeneracionesPokedex[genKey];
            if (currentPokemonId >= r.start && currentPokemonId <= r.end) {
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

    } catch (e) {
        console.log("Error cargando el Pokémon.", e);
    }
};

window.toggleVistaLista = function() {
    window.mostrarCajaGeneracionDetalle(idGenActiva);
};

window.cambiarPokemon = function(direccion) {
    if (!currentPokemonId) return;
    let rangoActual = rangosGeneracionesPokedex[idGenActiva];
    let objetivoId = currentPokemonId + direccion;

    if (objetivoId >= rangoActual.start && objetivoId <= rangoActual.end) {
        window.cargarPokemonData(objetivoId);
    }
};

// 6. RENDERIZADO DETALLES DEL POKÉMON SELECCIONADO
window.renderizarVistaDetail = async function(data, speciesData, evoChainData) {
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

    // Mapeo básico de tipos a español
    const tiposEspanol = {
        normal: "Normal", fire: "Fuego", water: "Agua", electric: "Eléctrico", grass: "Planta",
        ice: "Hielo", fighting: "Lucha", poison: "Veneno", ground: "Tierra", flying: "Volador",
        psychic: "Psíquico", bug: "Bicho", rock: "Roca", ghost: "Fantasma", dragon: "Dragón",
        dark: "Siniestro", steel: "Acero", fairy: "Hada"
    };

    // Extraer tipos originales de la API
    let tipo1Raw = data.types[0]?.type.name || "-";
    let tipo2Raw = data.types[1]?.type.name || "-";

    // Traducir texto
    let tipo1Texto = tiposEspanol[tipo1Raw] || tipo1Raw.toUpperCase();
    let tipo2Texto = tiposEspanol[tipo2Raw] || "-";

    // Asignar colores de fondo dinámicos basados en la paleta existente
    let tipo1BgColor = typeColors[tipo1Raw.toLowerCase()] || "#cef5ff";
    let tipo2BgColor = typeColors[tipo2Raw.toLowerCase()] || "#cef5ff";

    // Estilos de texto (Blanco y con sombra si tiene tipo para que resalte, negro si está vacío)
    let tipo1TextColor = typeColors[tipo1Raw.toLowerCase()] ? "#ffffff; text-shadow: 1px 1px 0px #000;" : "#000000;";
    let tipo2TextColor = typeColors[tipo2Raw.toLowerCase()] ? "#ffffff; text-shadow: 1px 1px 0px #000;" : "#000000;";

    let rangoActual = rangosGeneracionesPokedex[idGenActiva] || rangosGeneracionesPokedex[1];
    let juegosHtml = "";
    rangoActual.games.forEach(g => {
        let borderStyle = g.border ? `border: 1px solid ${g.border};` : 'border: 1px solid #000;';
        let textColor = g.color === "#ffffff" ? "#000000" : "#ffffff";
        juegosHtml += `<span style="background:${g.color}; color:${textColor}; padding:2px 5px; font-size:7px; font-weight:bold; margin-left:3px; ${borderStyle}">${g.text}</span>`;
    });

    let evoList = [];
    let currentEvoStage = evoChainData.chain;
    while (currentEvoStage) {
        let name = currentEvoStage.species.name;
        let id = parseInt(currentEvoStage.species.url.split("/").slice(-2, -1)[0]);
        evoList.push({ name: name, id: id });
        currentEvoStage = currentEvoStage.evolves_to[0]; 
    }

    let evoHtml = "";
    evoList.forEach((evo, idx) => {
        let imgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${evo.id}.png`;
        evoHtml += `
            <div class="evo-poke-node" onclick="window.cargarPokemonData(${evo.id})">
                <img src="${imgUrl}" alt="${evo.name}">
                <span>${evo.name}</span> </div>
        `;
        if (idx < evoList.length - 1) evoHtml += `<span class="evo-arrow">&gt;</span>`;
    });

    let movesToFetch = data.moves.slice(0, 10);
    let movesRowsHtml = "";

    for (let m of movesToFetch) {
        let moveName = m.move.name.replace("-", " ").toUpperCase();
        let moveUrl = m.move.url;
        let typeName = "???", power = "-", accuracy = "-";

        try {
            let moveRes = await fetch(moveUrl);
            if (moveRes.ok) {
                let moveData = await moveRes.json();
                typeName = moveData.type.name;
                power = moveData.power !== null ? moveData.power : "-";
                accuracy = moveData.accuracy !== null ? moveData.accuracy + "%" : "-";
            }
        } catch(err) {}

        let badgeColor = typeColors[typeName.toLowerCase()] || "#666";
        movesRowsHtml += `
            <tr>
                <td style="text-align:left; font-weight:bold;">${moveName}</td>
                <td><span class="move-type-pill" style="background-color:${badgeColor};">${typeName}</span></td>
                <td style="font-weight:bold;">${power}</td>
                <td style="font-weight:bold;">${accuracy}</td>
            </tr>
        `;
    }

    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${data.name.toUpperCase()}</h2>
                    <div class="poke-header-meta">
                        <span style="font-size:7px; font-weight:bold; color:#000; margin-right:4px;">${rangoActual.region.toUpperCase()}</span>
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

                <div style="display: flex; gap: 6px; margin-top: 2px;">
                    <div class="stat-item" style="flex: 1; background-color: ${tipo1BgColor};">
                        <span class="stat-label" style="width: 65px;">TIPO 1</span>
                        <span class="stat-value" style="text-align: center; padding-right: 0; text-transform: uppercase; color: ${tipo1TextColor}">${tipo1Texto}</span>
                    </div>
                    <div class="stat-item" style="flex: 1; background-color: ${tipo2BgColor};">
                        <span class="stat-label" style="width: 65px;">TIPO 2</span>
                        <span class="stat-value" style="text-align: center; padding-right: 0; text-transform: uppercase; color: ${tipo2TextColor}">${tipo2Texto}</span>
                    </div>
                </div>
                
                <div class="desc-box" style="margin-top: 2px;">
                    DESC: ${descEntry.flavor_text.replace(/\n|\f/g, ' ')}
                </div>
            </div>

            <div class="view-right-panel">
                <div class="evo-section-box">
                    <div class="evo-title-label">LÍNEA EVOLUTIVA</div>
                    <div class="evo-flex-container">${evoHtml}</div>
                </div>

                <div class="moves-section-box">
                    <div class="moves-title-label">MOVIMIENTOS APRENDIDOS</div>
                    <div class="moves-table-scroll-wrapper">
                        <table class="moves-retro-table">
                            <thead>
                                <tr>
                                    <th style="text-align:left; padding-left:4px;">MOV</th>
                                    <th>TIPO</th>
                                    <th>POT</th>
                                    <th>PRE</th>
                                </tr>
                            </thead>
                            <tbody>${movesRowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// 7. MULTIMEDIA (VISOR DE IMÁGENES / 3D)
window.manejarVisualizacionMedia = function(data) {
    let box = document.getElementById("media-display-box");
    if(!box) return;
    
    if (mainAnimationId) cancelAnimationFrame(mainAnimationId);
    if (currentModel) {
        currentModel.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        currentModel = null;
    }

    box.querySelectorAll("canvas, #cargando-retro-text, .error-3d-msg, #poke-img").forEach(el => el.remove());

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

window.cambiarVariante = function(tipo) {
    currentVariante = tipo;
    document.getElementById("btn-var-regular").classList.toggle("active", tipo === 'regular');
    document.getElementById("btn-var-shiny").classList.toggle("active", tipo === 'shiny');
    if(currentPokemonId) window.cargarPokemonData(currentPokemonId);
};