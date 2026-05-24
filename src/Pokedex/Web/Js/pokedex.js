let currentPokemonId = 1;
let currentVariante = "regular"; 
let vistaActual = "lista"; 
let filtroGenActual = "todas";
let listaCacheCompleta = []; 
let modo3DActivo = false;

let mainAnimationId = null;
let popAnimationId = null;

let scene, camera, renderer = null, currentModel = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

let popScene, popCamera, popRenderer = null, popModel = null;
let popIsDragging = false;
let popPreviousMousePosition = { x: 0, y: 0 };

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

function mostrarPantallaInicialOcupandoTodo() {
    vistaActual = "lista"; 
    filtroGenActual = "todas";
    
    const leftColumn = document.getElementById("left-column");
    if(leftColumn) leftColumn.style.display = "none";
    
    const dynamicZone = document.getElementById("dynamic-zone");
    if(dynamicZone) dynamicZone.classList.add("full-screen-zone");
    
    const pokeIdDisplay = document.getElementById("poke-id");
    if(pokeIdDisplay) pokeIdDisplay.innerText = "#---";
    
    document.getElementById("poke-search").value = "";
    renderizarVistaListaIntegrada();
}

function getGenFromId(id) {
    for (let gen in genRanges) {
        if (id >= genRanges[gen].start && id <= genRanges[gen].end) {
            return parseInt(gen);
        }
    }
    return 1;
}

// CORRECCIÓN DIRECTA: Definir funciones accesibles globalmente para coincidir con tu HTML
window.abrirModalMoves = function() {
    let modal = document.getElementById("modal-moves");
    if(modal) {
        modal.style.display = "flex";
    }
    ejecutarCargaMovimientosServidor(currentPokemonId);
};

window.cerrarModalMoves = function() {
    let modal = document.getElementById("modal-moves");
    if(modal) {
        modal.style.display = "none";
    }
};

// Vinculación estándar por compatibilidad de ámbito con navegadores antiguos
function abrirModalMoves() { window.abrirModalMoves(); }
function cerrarModalMoves() { window.cerrarModalMoves(); }

function buildGamesSpanString(genNumber) {
    if (!genRanges[genNumber]) return '';
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

        const idDisplay = document.getElementById("poke-id");
        if(idDisplay) idDisplay.innerText = "#" + formatPaddedId(currentPokemonId);
        
        const leftColumn = document.getElementById("left-column");
        const dynamicZone = document.getElementById("dynamic-zone");

        if (vistaActual === "detalle") {
            if(leftColumn) leftColumn.style.display = "flex";
            if(dynamicZone) dynamicZone.classList.remove("full-screen-zone");
            renderizarVistaDetail(data, speciesData);
        } else {
            if(leftColumn) leftColumn.style.display = "none";
            if(dynamicZone) dynamicZone.classList.add("full-screen-zone");
            renderizarVistaListaIntegrada();
        }

        manejarVisualizacionMedia(data);

    } catch (e) {
        console.log("Error general de carga.");
    }
}

function purgarObjeto3D(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => { if(m.dispose) m.dispose(); });
                } else {
                    if (child.material.dispose) child.material.dispose();
                }
            }
        }
    });
}

function manejarVisualizacionMedia(data) {
    let box = document.getElementById("media-display-box");
    if(!box) return;
    
    if (mainAnimationId) {
        cancelAnimationFrame(mainAnimationId);
        mainAnimationId = null;
    }
    if (currentModel) {
        purgarObjeto3D(currentModel);
        currentModel = null;
    }

    box.onmousedown = null;
    box.onmousemove = null;
    window.onmouseup = null;

    let btnFullscreen = document.getElementById("btn-fullscreen-3d");
    let img2D = document.getElementById("poke-img");

    box.style.position = "relative";

    if (modo3DActivo) {
        if (img2D) img2D.style.display = "none";
        
        box.querySelectorAll("canvas, #cargando-retro-text, .error-3d-msg").forEach(el => el.remove());
        
        if(btnFullscreen) {
            btnFullscreen.classList.remove("hidden");
            btnFullscreen.style.display = "block";
            btnFullscreen.style.position = "absolute";
            btnFullscreen.style.top = "10px";
            btnFullscreen.style.right = "10px";
            btnFullscreen.style.zIndex = "10";
            
            btnFullscreen.style.backgroundColor = "#ffd400";
            btnFullscreen.style.color = "#000000";
            btnFullscreen.style.fontFamily = "'Press Start 2P', monospace";
            btnFullscreen.style.fontSize = "10px";
            btnFullscreen.style.padding = "6px 10px";
            btnFullscreen.style.border = "2px solid #000000";
            btnFullscreen.style.cursor = "pointer";
            btnFullscreen.style.boxShadow = "inset 2px 2px 0px #fff, inset -2px -2px 0px #aa8800";
        }

        let cargandoTxt = document.createElement("div");
        cargandoTxt.id = "cargando-retro-text";
        cargandoTxt.style = "font-size:10px;color:black;text-align:center;padding-top:80px;font-family:'Press Start 2P';position:absolute;width:100%;z-index:1;";
        cargandoTxt.innerText = `CARGANDO 3D...`;
        box.appendChild(cargandoTxt);

        setTimeout(() => {
            inicializarVisorBlender3D(box, data.id);
        }, 50);
    } else {
        if(btnFullscreen) {
            btnFullscreen.classList.add("hidden");
            btnFullscreen.style.display = "none"; 
        }
        
        box.querySelectorAll("canvas, #cargando-retro-text, .error-3d-msg").forEach(el => el.remove());
        
        let url = currentVariante === "shiny" ? data.sprites.other["official-artwork"].front_shiny : data.sprites.other["official-artwork"].front_default;
        
        if(!img2D) {
            img2D = document.createElement("img");
            img2D.id = "poke-img";
            box.insertBefore(img2D, btnFullscreen);
        }
        img2D.src = url || data.sprites.front_default;
        img2D.style = "width:100%; height:100%; object-fit:contain; display:block;";
    }
}

function inicializarVisorBlender3D(container, pokemonId) {
    let cargando = document.getElementById("cargando-retro-text");
    let width = container.clientWidth || 170;
    let height = container.clientHeight || 170;

    // 1. FRENAR EN SECO EL PROCESADOR Y LA ANIMACIÓN ANTERIOR
    if (mainAnimationId) {
        cancelAnimationFrame(mainAnimationId);
        mainAnimationId = null;
    }

    // 2. REUTILIZAR EL RENDERIZADOR (EVITA CREAR INFINITOS CANVAS OCULTOS)
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    }
    
    if (renderer.domElement.parentNode && renderer.domElement.parentNode !== container) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limita la resolución para no saturar la GPU
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.zIndex = "0";
    
    if (!container.contains(renderer.domElement)) {
        container.insertBefore(renderer.domElement, container.firstChild);
    }

    // 3. LIMPIEZA ABSOLUTA DE LA GPU (Evita que el navegador colapse al pasar rápido)
    if (scene) {
        while (scene.children.length > 0) {
            let obj = scene.children[0];
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
    } else {
        scene = new THREE.Scene();
    }

    // 4. RESETEAR CÁMARA E ILUMINACIÓN
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.5);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(2, 5, 3);
    scene.add(dirLight);

    // 5. INSTANCIAR CARGADORES LOCALES DE USAR Y TIRAR DE FORMA CONTROLADA
    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    
    // Usamos el decodificador oficial estable para evitar desbordamientos asíncronos
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    let carpetaVariante = (currentVariante === "shiny") ? "shiny" : "regular";
    let rutaModelo = `/assets-main/models/opt/${carpetaVariante}/${pokemonId}.glb`; 
    
    loader.load(rutaModelo, (gltf) => {
        if(cargando) cargando.remove();
        
        // Si el usuario ya cambió de Pokémon mientras este se cargaba, lo descartamos inmediatamente
        if (currentPokemonId !== pokemonId || !modo3DActivo) {
            gltf.scene.traverse(child => {
                if(child.geometry) child.geometry.dispose();
                if(child.material) child.material.dispose();
            });
            dracoLoader.dispose();
            return;
        }

        let modelGeometry = gltf.scene;
        
        try {
            modelGeometry.updateMatrixWorld(true);
            const box3 = new THREE.Box3().setFromObject(modelGeometry);
            const center = box3.getCenter(new THREE.Vector3());
            const size = box3.getSize(new THREE.Vector3());
            
            if (isFinite(center.x) && isFinite(center.y) && isFinite(center.z)) {
                modelGeometry.position.set(-center.x, -center.y, -center.z);
            } else {
                modelGeometry.position.set(0, 0, 0);
            }

            currentModel = new THREE.Group();
            currentModel.add(modelGeometry);
            scene.add(currentModel);

            const maxDim = Math.max(size.x, size.y, size.z);
            if(isFinite(maxDim) && maxDim > 0.01) {
                let scaleFactor = 2.2 / maxDim; 
                currentModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
            } else {
                currentModel.scale.set(1, 1, 1);
            }
        } catch (err) {
            currentModel = new THREE.Group();
            currentModel.add(modelGeometry);
            scene.add(currentModel);
            currentModel.scale.set(1, 1, 1);
        }
        
        // Liberar el motor Draco inmediatamente tras pintar el modelo
        dracoLoader.dispose();
    }, undefined, (error) => {
        if(cargando) cargando.remove();
        console.error("Error al cargar:", error);
        
        let msgErr = document.createElement("div");
        msgErr.className = "error-3d-msg";
        msgErr.style = "position:absolute;top:70px;width:100%;text-align:center;font-size:8px;color:black;font-weight:bold;font-family:'Press Start 2P';z-index:1;";
        msgErr.innerHTML = `SIN MODELO 3D<br>#${pokemonId}`;
        container.appendChild(msgErr);
        
        // Liberar recursos incluso si da error para no arrastrar el bloqueo al siguiente
        dracoLoader.dispose();
    });

    // 6. CONTROLES DEL RATÓN
    container.onmousedown = (e) => {
        if(e.target.id === "btn-fullscreen-3d") return;
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    container.onmousemove = (e) => {
        if (!isDragging || !currentModel) return;
        let deltaMove = { x: e.clientX - previousMousePosition.x, y: e.clientY - previousMousePosition.y };
        currentModel.rotation.y += deltaMove.x * 0.003; 
        currentModel.rotation.x += deltaMove.y * 0.003; 
        previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    window.onmouseup = () => { isDragging = false; };

    // 7. BUCLE ÚNICO CONTROLADO
    function animate() {
        if (!modo3DActivo) return;
        mainAnimationId = requestAnimationFrame(animate);
        if (currentModel && !isDragging) {
            currentModel.rotation.y += 0.003; 
        }
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
    animate();
}

function abrirModalGigante3D() {
    let modal = document.getElementById("modal-3d-giant");
    let container = document.getElementById("contenedor-render-giant");
    if (!modal || !container) return;

    if (popAnimationId) cancelAnimationFrame(popAnimationId);
    if (popModel) purgarObjeto3D(popModel);

    container.innerHTML = "";
    modal.style.display = "flex";

    let width = container.clientWidth || 500;
    let height = container.clientHeight || 400;

    popScene = new THREE.Scene();
    popCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    popCamera.position.set(0, 0, 4.5);

    if (!popRenderer) {
        popRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    }
    if (popRenderer.domElement.parentNode) {
        popRenderer.domElement.parentNode.removeChild(popRenderer.domElement);
    }
    popRenderer.setSize(width, height);
    container.appendChild(popRenderer.domElement);

    popScene.add(new THREE.AmbientLight(0xffffff, 1.5));
    let dLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dLight.position.set(3, 6, 4);
    popScene.add(dLight);

    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    let carpeta = (currentVariante === "shiny") ? "shiny" : "regular";
    let ruta = `/assets-main/models/opt/${carpeta}/${currentPokemonId}.glb`;

    loader.load(ruta, (gltf) => {
        let modelGeometry = gltf.scene;
        try {
            modelGeometry.updateMatrixWorld(true);
            const box3 = new THREE.Box3().setFromObject(modelGeometry);
            const center = box3.getCenter(new THREE.Vector3());
            const size = box3.getSize(new THREE.Vector3());

            if (isFinite(center.x) && isFinite(center.y) && isFinite(center.z)) {
                modelGeometry.position.set(-center.x, -center.y, -center.z);
            } else {
                modelGeometry.position.set(0, 0, 0);
            }

            popModel = new THREE.Group();
            popModel.add(modelGeometry);
            popScene.add(popModel);

            const maxDim = Math.max(size.x, size.y, size.z);
            if(isFinite(maxDim) && maxDim > 0.01) {
                let scaleFactor = 2.2 / maxDim; 
                popModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
            } else {
                popModel.scale.set(1, 1, 1);
            }
        } catch (err) {
            popModel = new THREE.Group();
            popModel.add(modelGeometry);
            popScene.add(popModel);
            popModel.scale.set(1, 1, 1);
        }
        dracoLoader.dispose();
    }, undefined, (err) => {
        dracoLoader.dispose();
    });

    container.onmousedown = (e) => {
        popIsDragging = true;
        popPreviousMousePosition = { x: e.clientX, y: e.clientY };
    };
    container.onmousemove = (e) => {
        if (!popIsDragging || !popModel) return;
        let delta = { x: e.clientX - popPreviousMousePosition.x, y: e.clientY - popPreviousMousePosition.y };
        popModel.rotation.y += delta.x * 0.003;
        popModel.rotation.x += delta.y * 0.003;
        popPreviousMousePosition = { x: e.clientX, y: e.clientY };
    };
    window.onmouseup = () => { popIsDragging = false; };

    function animarPop() {
        if (modal.style.display === "none") return;
        popAnimationId = requestAnimationFrame(animarPop);
        if (popModel && !popIsDragging) {
            popModel.rotation.y += 0.003; 
        }
        if (popRenderer && popScene && popCamera) {
            popRenderer.render(popScene, popCamera);
        }
    }
    animarPop();
}

function cerrarModalGigante3D() {
    if (popAnimationId) {
        cancelAnimationFrame(popAnimationId);
        popAnimationId = null;
    }
    if (popModel) {
        purgarObjeto3D(popModel);
        popModel = null;
    }
    let modal = document.getElementById("modal-3d-giant");
    if(modal) modal.style.display = "none";
}

function toggleModo3D() {
    modo3DActivo = !modo3DActivo;
    const btn3D = document.querySelector(".btn-3d");
    if(btn3D) {
        btn3D.innerText = modo3DActivo ? "VER 2D" : "VER 3D";
    }
    cargarPokemonData(currentPokemonId);
}

async function ejecutarCargaMovimientosServidor(id) {
    try {
        let tbody = document.getElementById("moves-list-tbody");
        if(!tbody) return;

        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;font-size:8px;color:#000;'>CARGANDO...</td></tr>";

        let res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        if (!res.ok) throw new Error("API Error");
        let data = await res.json();

        let listaMovs = data.moves.slice(0, 15);
        let promesas = listaMovs.map(m => fetch(m.move.url).then(r => r.json()).catch(() => null));
        let infoCompletaMovs = await Promise.all(promesas);

        let tableHtml = "";
        infoCompletaMovs.forEach(m => {
            if(!m) return;
            let nombre = m.name.toUpperCase().replace("-", " ");
            let tipoRaw = m.type.name.toUpperCase();
            let tipoTraducido = typeTranslations[tipoRaw] || tipoRaw;
            
            let dmgClass = "EST";
            if (m.damage_class && m.damage_class.name === "physical") dmgClass = "FIS";
            if (m.damage_class && m.damage_class.name === "special") dmgClass = "ESP";
            
            let potencia = m.power ? m.power : "-";
            let precision = m.accuracy ? m.accuracy + "%" : "-";
            let colorFondo = typeColors[m.type.name] || "#ccc";

            tableHtml += `
                <tr>
                    <td style="font-weight:bold; text-align:left; color:#000;">${nombre}</td>
                    <td><span class="move-type-badge" style="background-color:${colorFondo}; color:#fff; padding:2px 4px; border-radius:3px;">${tipoTraducido}</span></td>
                    <td style="font-weight:bold; color:#000;">${dmgClass}</td>
                    <td style="color:#000;">${potencia}</td>
                    <td style="color:#000;">${precision}</td>
                </tr>
            `;
        });
        tbody.innerHTML = tableHtml || "<tr><td colspan='5' style='text-align:center;font-size:8px;color:#000;'>SIN MOVIMIENTOS</td></tr>";
    } catch(e) {
        console.error("Error en movimientos:", e);
        let tbody = document.getElementById("moves-list-tbody");
        if(tbody) tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;font-size:8px;color:red;'>ERROR AL CARGAR</td></tr>";
    }
}

function renderizarVistaDetail(data, speciesData) {
    let genNumber = getGenFromId(data.id);
    let juegosHtml = buildGamesSpanString(genNumber);

    let t1Raw = data.types[0].type.name.toUpperCase();
    let t2Raw = data.types[1] ? data.types[1].type.name.toUpperCase() : null;
    
    let t1 = typeTranslations[t1Raw] || t1Raw;
    let t2 = t2Raw ? (typeTranslations[t2Raw] || t2Raw) : null;

    let descEntry = speciesData.flavor_text_entries.find(e => e.language.name === 'es') || speciesData.flavor_text_entries.find(e => e.language.name === 'en');
    let textoDesc = descEntry ? descEntry.flavor_text.replace(/\n|\f/g, ' ') : "Sin registro.";

    const dynamicZone = document.getElementById("dynamic-zone");
    if(!dynamicZone) return;
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
                <button class="btn-moves" id="btn-open-moves-retro" onclick="window.abrirModalMoves()">MOVIMIENTOS</button>
            </div>
        </div>
    `;
    
    const btnReg = document.getElementById("btn-var-regular");
    const btnShiny = document.getElementById("btn-var-shiny");
    if(btnReg) btnReg.classList.toggle("active", currentVariante === "regular");
    if(btnShiny) btnShiny.classList.toggle("active", currentVariante === "shiny");

    cargarCadenaEvolutivaArbol(speciesData.evolution_chain.url);
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
        if (!f1) return;

        if (f1.species.name === "eevee" || f1.species.url.includes("/133/")) {
            let eeveeAltar = document.createElement("div");
            eeveeAltar.style = "position: relative; width: 100%; height: 390px; display: flex; align-items: center; justify-content: center; overflow: visible;";

            let eeveeNode = crearIconoEvoNode(133);
            eeveeNode.style = "position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2; cursor: pointer;";
            eeveeAltar.appendChild(eeveeNode);

            const pixelArrowSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='38' viewBox='0 0 16 38'><polygon points='8,1 15,12 11,12 11,37 5,37 5,12 1,12' fill='%23FFD400' stroke='%23000000' stroke-width='2' stroke-linecap='square' stroke-linejoin='miter'/></svg>";

            f1.evolves_to.forEach((evo, i) => {
                let id = evo.species.url.split("/").slice(-2, -1)[0];
                let angle = i * 45; 
                let rad = angle * (Math.PI / 180);

                const R_evos = 125; 
                let x_evo = R_evos * Math.sin(rad);
                let y_evo = R_evos * Math.cos(rad);

                let arrowImg = document.createElement("img");
                arrowImg.src = pixelArrowSvg;
                arrowImg.style = `position: absolute; left: 50%; top: 50%; width: 16px; height: 38px; transform-origin: bottom center; transform: translate(-50%, -100%) rotate(${angle}deg) translateY(-42px); z-index: 1; pointer-events: none;`;
                eeveeAltar.appendChild(arrowImg);

                let evoNode = crearIconoEvoNode(id);
                evoNode.style = `position: absolute; left: calc(50% + ${x_evo}px); top: calc(50% - ${y_evo}px); transform: translate(-50%, -50%); z-index: 2; cursor: pointer;`;
                eeveeAltar.appendChild(evoNode);
            });

            masterTreeWrapper.appendChild(eeveeAltar);
            container.appendChild(masterTreeWrapper);
            return; 
        }

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
        
        container.appendChild(masterTreeWrapper);
    } catch (e) {
        if(container) container.innerText = "Error.";
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
    img.style.width = "68px";
    img.style.height = "68px";
    img.style.imageRendering = "pixelated";
    img.style.objectFit = "contain";
    img.onclick = () => { vistaActual = "detalle"; cargarPokemonData(id); };
    return img;
}

function renderizarVistaListaIntegrada() {
    const dynamicZone = document.getElementById("dynamic-zone");
    if(!dynamicZone) return;
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
            if (!rango) continue;
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
    if(leftColumn) leftColumn.style.display = "none";
    if(dynamicZone) dynamicZone.classList.add("full-screen-zone");
    renderizarVistaListaIntegrada();
});

function seleccionarGenFiltro(num) {
    document.getElementById("gens-box").classList.add("collapsed");
    filtroGenActual = num;
    vistaActual = "lista";
    
    const leftColumn = document.getElementById("left-column");
    const dynamicZone = document.getElementById("dynamic-zone");
    if(leftColumn) leftColumn.style.display = "none";
    if(dynamicZone) dynamicZone.classList.add("full-screen-zone");

    renderizarVistaListaIntegrada();
}

function cambiarVariante(tipo) {
    currentVariante = tipo;
    cargarPokemonData(currentPokemonId);
}

function toggleVistaLista() {
    vistaActual = (vistaActual === "detalle") ? "lista" : "detalle";
    cargarPokemonData(currentPokemonId);
}

function cambiarPokemon(dir) {
    currentPokemonId += dir;
    if (currentPokemonId < 1) currentPokemonId = 905;
    if (currentPokemonId > 905) currentPokemonId = 1;
    cargarPokemonData(currentPokemonId);
}

document.getElementById("btn-all-pokes").onclick = () => {
    document.getElementById("poke-search").value = "";
    filtroGenActual = "todas";
    vistaActual = "lista";
    const leftColumn = document.getElementById("left-column");
    const dynamicZone = document.getElementById("dynamic-zone");
    if(leftColumn) leftColumn.style.display = "none";
    if(dynamicZone) dynamicZone.classList.add("full-screen-zone");
    renderizarVistaListaIntegrada();
};

document.getElementById("btn-toggle-gens").onclick = () => {
    document.getElementById("gens-box").classList.toggle("collapsed");
};

document.addEventListener("click", function(e) {
    if (e.target && (e.target.id === "btn-back-menu" || e.target.classList.contains("btn-menu-back") || e.target.innerText === "VOLVER AL MENÚ")) {
        window.location.href = "index.html";
    }
});

async function precargarIndiceNacional() {
    let res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=905");
    let data = await res.json();
    listaCacheCompleta = data.results.map((p, index) => ({
        id: index + 1,
        name: p.name.toUpperCase()
    }));
}

function limpiarTextosHuerfanosOcultos() {
    document.querySelectorAll('body > *').forEach(el => {
        if (!el.classList.contains('pokedex-frame') && el.id !== 'modal-3d-giant' && el.id !== 'modal-moves') {
            if (el.textContent.includes('MOVES LIST') || el.textContent.includes('MOVETYPECAT')) {
                el.remove();
            }
        }
    });
}

function inyectarEstilosRetro() {
    let style = document.createElement('style');
    style.innerHTML = `
        ::-webkit-scrollbar { width: 14px; height: 14px; }
        ::-webkit-scrollbar-track { background: #222; border-left: 2px solid #000; border-top: 2px solid #000; }
        ::-webkit-scrollbar-thumb { background: #ffd400; border: 2px solid #000; box-shadow: inset 2px 2px 0px #fff, inset -2px -2px 0px #aa8800; cursor: pointer; }
        ::-webkit-scrollbar-corner { background: #222; }
    `;
    document.head.appendChild(style);
}

window.onload = async () => {
    limpiarTextosHuerfanosOcultos();
    inyectarEstilosRetro(); 
    await precargarIndiceNacional();
    mostrarPantallaInicialOcupandoTodo(); 
};