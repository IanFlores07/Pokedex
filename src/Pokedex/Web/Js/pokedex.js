// =========================================================================
// POKÉDEX NACIONAL - INTERACTIVA CON ESTADÍSTICAS RETRO DEL SISTEMA
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

// Base de datos oficial con Rangos, Nombres, Ediciones e Islas/Regiones de las 10 Generaciones
const rangosGeneracionesPokedex = {
    1: { start: 1, end: 151, nombre: "Gen 1", region: "Kanto", games: [{ text: "ROJO", color: "#ff1111" }, { text: "AZUL", color: "#1155ff" }, { text: "AMARILLO", color: "#ffd400" }] },
    2: { start: 152, end: 251, nombre: "Gen 2", region: "Johto", games: [{ text: "ORO", color: "#d4b35e" }, { text: "PLATA", color: "#cccccc" }, { text: "CRISTAL", color: "#a1e5ff" }] },
    3: { start: 252, end: 386, nombre: "Gen 3", region: "Hoenn", games: [{ text: "RUBÍ", color: "#ff2244" }, { text: "ZAFIRO", color: "#2266ff" }, { text: "ESMERALDA", color: "#11cc66" }] },
    4: { start: 387, end: 493, nombre: "Gen 4", region: "Sinnoh", games: [{ text: "DIAMANTE", color: "#aaaaff" }, { text: "PERLA", color: "#ffaaaa" }, { text: "PLATINO", color: "#999999" }] },
    5: { start: 494, end: 649, nombre: "Gen 5", region: "Teselia", games: [{ text: "BLANCO", color: "#ffffff", border: "#000" }, { text: "NEGRO", color: "#444444" }] },
    6: { start: 650, end: 721, nombre: "Gen 6", region: "Kalos", games: [{ text: "X", color: "#0055ff" }, { text: "Y", color: "#ff2233" }] },
    7: { start: 722, end: 809, nombre: "Gen 7", region: "Alola (Islas)", games: [{ text: "SOL", color: "#ff8811" }, { text: "LUNA", color: "#5555ff" }] },
    8: { start: 810, end: 905, nombre: "Gen 8", region: "Galar", games: [{ text: "ESPADA", color: "#00ccee" }, { text: "ESCUDO", color: "#ff0066" }] },
    9: { start: 906, end: 1025, nombre: "Gen 9", region: "Paldea", games: [{ text: "ESCARLATA", color: "#ff3311" }, { text: "PÚRPURA", color: "#aa22ff" }] },
    10: { start: 1026, end: 1050, nombre: "Gen 10", region: "Uva/Naranja", games: [{ text: "X-0", color: "#00ffcc" }, { text: "Y-0", color: "#ff00aa" }] }
};

function formatPaddedId(id) {
    return String(id).padStart(3, '0');
}

// 1. PANTALLA INICIAL RETRO (AL ENTRAR A LA WEB)
window.mostrarPantallaInicialOcupandoTodo = function() {
    vistaActual = "lista"; 
    currentPokemonId = null;
    
    const leftColumn = document.getElementById("left-column");
    if(leftColumn) leftColumn.style.display = "none";
    
    const dynamicZone = document.getElementById("dynamic-zone");
    if(dynamicZone) {
        dynamicZone.classList.add("full-screen-zone");
        dynamicZone.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:100%; width:100%; min-height:350px;">
                <h2 id="txt-blink-inicio" style="font-family:'Press Start 2P', monospace; font-size:12px; color:#000; text-align:center; line-height:2; animation: retroBlink 1.2s infinite;">
                    &lt;&lt; SELECCIONA UNA GENERACIÓN &gt;&gt;
                </h2>
            </div>
            <style>
                @keyframes retroBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.15; }
                }
            </style>
        `;
    }
    
    const pokeIdDisplay = document.getElementById("poke-id");
    if(pokeIdDisplay) pokeIdDisplay.innerText = "#---";
    
    let box = document.getElementById("media-display-box");
    if(box) {
        const img = box.querySelector("img");
        if(img) img.src = "";
    }
};

// 2. DISPARADOR AL FILTRAR GENERACIONES EN EL INTERRUPTOR SUPERIOR DEL HTML
window.seleccionarGenFiltro = function(numGen) {
    const gensBox = document.getElementById("gens-box");
    if (gensBox) gensBox.classList.add("collapsed"); 
    window.mostrarCajaGeneracionDetalle(numGen);
};

// 3. ARRANQUE SEGURO INTERACTIVO
document.addEventListener("DOMContentLoaded", () => {
    window.mostrarPantallaInicialOcupandoTodo();

    const btnGenToggle = document.getElementById("btn-toggle-gens");
    const gensBox = document.getElementById("gens-box");

    if (btnGenToggle && gensBox) {
        btnGenToggle.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            gensBox.classList.toggle("collapsed");
        });

        document.addEventListener("click", (e) => {
            if (!btnGenToggle.contains(e.target) && !gensBox.contains(e.target)) {
                gensBox.classList.add("collapsed");
            }
        });
    }
});

// 4. MOSTRAR REJILLA 3X3 A PANTALLA COMPLETA SIN PANEL IZQUIERDO
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
    
    let juegosHtml = "";
    rango.games.forEach(g => {
        let borderStyle = g.border ? `border: 1px solid ${g.border};` : 'border: 1px solid #000;';
        let textColor = g.color === "#ffffff" ? "#000000" : "#ffffff";
        juegosHtml += `<span style="background:${g.color}; color:${textColor}; padding:2px 5px; font-size:7px; margin-left:5px; display:inline-block; ${borderStyle}">${g.text}</span>`;
    });
    
    dynamicZone.innerHTML = `
        <div class="retro-gen-layout">
            <div class="black-info-box">
                <h2>GEN ${numGen} - ${rango.nombre.toUpperCase()}</h2>
                <p>REGIÓN / ISLA: <span style="color: #ffcc00;">${rango.region.toUpperCase()}</span></p>
                <p style="display: flex; align-items: center; flex-wrap: wrap;">JUEGOS: ${juegosHtml}</p>
            </div>
            
            <div id="grid-pokes-3x3" class="grid-gens-3x3">
                <p style="font-size: 8px; color: #000; animation: retroBlink 1s infinite;">CARGANDO REJILLA CRIO-DATOS...</p>
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
                if (leftColumn) leftColumn.style.display = "flex";
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
        const gridContenedor = document.getElementById("grid-pokes-3x3");
        if (gridContenedor) {
            gridContenedor.innerHTML = `<p style="color: red; font-size: 8px;">ERROR EN LA RED DE DATOS.</p>`;
        }
    }
};

// 5. CARGAR DETALLE INDIVIDUAL DEL POKÉMON SELECCIONADO
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

        const idDisplay = document.getElementById("poke-id");
        if(idDisplay) idDisplay.innerText = "#" + formatPaddedId(currentPokemonId);

        window.renderizarVistaDetail(data, speciesData);
        window.manejarVisualizacionMedia(data);

    } catch (e) {
        console.log("Error cargando Pokémon.");
    }
};

// 6. ACCIÓN DEL BOTÓN 'LISTA'
window.toggleVistaLista = function() {
    window.mostrarCajaGeneracionDetalle(idGenActiva);
};

// 7. ACCIÓN DE LAS FLECHAS DE NAVEGACIÓN (< y >)
window.cambiarPokemon = function(direccion) {
    if (!currentPokemonId) return;

    let rangoActual = rangosGeneracionesPokedex[idGenActiva];
    let objetivoId = currentPokemonId + direccion;

    if (objetivoId >= rangoActual.start && objetivoId <= rangoActual.end) {
        window.cargarPokemonData(objetivoId);
    } else {
        console.log("Límite de la generación alcanzado.");
    }
};

// 8. NUEVO RENDERIZADO CON REJILLA DE ESTADÍSTICAS (COMO LA SEGUNDA FOTO)
window.renderizarVistaDetail = function(data, speciesData) {
    const dynamicZone = document.getElementById("dynamic-zone");
    if(!dynamicZone) return;

    // Buscar la descripción oficial en español
    let descEntry = speciesData.flavor_text_entries.find(e => e.language.name === 'es') || { flavor_text: "Sin descripción en el registro." };

    // Extraer las estadísticas base de la API de manera segura
    let statPS  = data.stats.find(s => s.stat.name === "hp")?.base_stat || 0;
    let statAT  = data.stats.find(s => s.stat.name === "attack")?.base_stat || 0;
    let statDF  = data.stats.find(s => s.stat.name === "defense")?.base_stat || 0;
    let statSA  = data.stats.find(s => s.stat.name === "special-attack")?.base_stat || 0;
    let statSD  = data.stats.find(s => s.stat.name === "special-defense")?.base_stat || 0;
    let statVEL = data.stats.find(s => s.stat.name === "speed")?.base_stat || 0;

    // Formatear altura y peso
    let altura = (data.height / 10) + "m";
    let peso = (data.weight / 10) + "kg";

    dynamicZone.innerHTML = `
        <div class="details-layout">
            <div class="view-center">
                <div class="header-line">
                    <h2 class="poke-name">${data.name.toUpperCase()}</h2>
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
                
                <div class="desc-box">
                    DESC: ${descEntry.flavor_text.replace(/\n|\f/g, ' ')}
                </div>
            </div>
        </div>
    `;
};

// 9. CONTROL MULTIMEDIA INDEPENDIENTE (IMAGENES 2D / ELEMENTOS 3D)
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
        cargandoTxt.style = "font-size:8px;color:black;text-align:center;padding-top:50px;font-family:'Press Start 2P';position:absolute;width:100%;z-index:10;";
        cargandoTxt.innerText = `CARGANDO 3D...`;
        box.appendChild(cargandoTxt);

        setTimeout(() => { window.inicializarVisorBlender3D(box, data.id); }, 50);
    } else {
        let url = data.sprites.other["official-artwork"].front_default;
        if (currentVariante === "shiny") {
            url = data.sprites.other["official-artwork"].front_shiny;
        }
        
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

    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    }
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
        msgErr.style = "position:absolute;top:50px;width:100%;text-align:center;font-size:8px;color:black;font-family:'Press Start 2P';";
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