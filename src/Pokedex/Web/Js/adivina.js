// =========================================================================
// MINIJUEGO: ¿QUIÉN ES ESE POKÉMON?
// Usa los mismos nombres/tipos que ya tienes en datos.js (pokedexData).
// =========================================================================

const RANGOS_GEN_ADIVINA = [
    { start: 1,    gen: 1,  region: "Kanto" },
    { start: 152,  gen: 2,  region: "Johto" },
    { start: 252,  gen: 3,  region: "Hoenn" },
    { start: 387,  gen: 4,  region: "Sinnoh" },
    { start: 494,  gen: 5,  region: "Teselia" },
    { start: 650,  gen: 6,  region: "Kalos" },
    { start: 722,  gen: 7,  region: "Alola" },
    { start: 810,  gen: 8,  region: "Galar" },
    { start: 906,  gen: 9,  region: "Paldea" },
    { start: 1026, gen: 10, region: "sin región" }
];

let pokedexPlano = [];
let pokemonActual = null;
let racha = 0;
let mejorRacha = parseInt(localStorage.getItem("adivina_mejor_racha") || "0", 10);
let yaRespondido = false;
let modoFacil = false; // false = difícil (por defecto)

function construirListaPlana() {
    pokedexPlano = [];
    RANGOS_GEN_ADIVINA.forEach((rango) => {
        const datosGen = typeof pokedexData !== "undefined" ? pokedexData[rango.gen] : null;
        if (!datosGen || !datosGen.nombres) return;
        datosGen.nombres.forEach((nombre, i) => {
            pokedexPlano.push({
                id: rango.start + i,
                nombre,
                gen: rango.gen,
                region: rango.region,
                tipo: (datosGen.tipos && datosGen.tipos[i]) ? datosGen.tipos[i] : "Desconocido"
            });
        });
    });
}

// Quita acentos, símbolos y espacios para comparar de forma flexible.
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function urlSprite(id) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

// --- Dificultad -----------------------------------------------------------

function cambiarDificultad(modo) {
    modoFacil = (modo === "facil");
    document.getElementById("btn-facil").classList.toggle("active", modoFacil);
    document.getElementById("btn-dificil").classList.toggle("active", !modoFacil);
    actualizarSugerencias(); // refresca/oculta el panel según toque
}

// Mientras se escribe en modo fácil: lista de pokémon reales cuyo nombre
// empieza por lo mismo que llevas escrito, en el mismo orden de letras.
function actualizarSugerencias() {
    const panel = document.getElementById("sugerencias");
    if (!modoFacil || yaRespondido) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }

    const texto = normalizar(document.getElementById("guess-input").value);
    if (texto.length === 0) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }

    const coincidencias = pokedexPlano
        .filter(p => normalizar(p.nombre).startsWith(texto))
        .slice(0, 12);

    if (coincidencias.length === 0) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }

    panel.innerHTML = "";
    coincidencias.forEach(p => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sugerencia-item";
        item.textContent = p.nombre;
        item.onclick = () => {
            document.getElementById("guess-input").value = p.nombre;
            document.getElementById("guess-input").focus();
            actualizarSugerencias();
        };
        panel.appendChild(item);
    });
    panel.classList.remove("hidden");
}

// --- Flujo de la partida ----------------------------------------------------

function nuevoPokemon() {
    if (pokedexPlano.length === 0) return;

    yaRespondido = false;

    const feedback = document.getElementById("feedback");
    feedback.textContent = "";
    feedback.className = "feedback";

    document.getElementById("pistas-reveladas").innerHTML = "";
    ["hint-generacion", "hint-tipo", "hint-inicial"].forEach(id => {
        document.getElementById(id).disabled = false;
    });

    const input = document.getElementById("guess-input");
    input.value = "";
    input.disabled = false;

    document.getElementById("btn-siguiente").classList.add("hidden");
    document.getElementById("btn-rendirse").disabled = false;
    actualizarSugerencias();

    pokemonActual = pokedexPlano[Math.floor(Math.random() * pokedexPlano.length)];

    const img = document.getElementById("poke-img");
    // Aplicamos la silueta SIN transición para que no se vea el sprite a color
    // ni un instante mientras carga la nueva imagen.
    img.classList.add("sin-transicion");
    img.classList.add("silhouette");
    img.onerror = () => nuevoPokemon(); // si ese sprite no carga, probamos con otro pokémon
    img.onload = () => {
        // Forzamos un repintado y luego reactivamos la transición,
        // así que SOLO se anima cuando se revele la respuesta.
        void img.offsetWidth;
        img.classList.remove("sin-transicion");
    };
    img.src = urlSprite(pokemonActual.id);

    input.focus();
}

function mostrarPistaTipo(tipoPista) {
    if (!pokemonActual || yaRespondido) return;

    const lista = document.getElementById("pistas-reveladas");
    const linea = document.createElement("div");

    if (tipoPista === "generacion") {
        linea.textContent = `🌍 GENERACIÓN ${pokemonActual.gen} (región ${pokemonActual.region})`;
    } else if (tipoPista === "tipo") {
        linea.textContent = `🔶 TIPO: ${pokemonActual.tipo}`;
    } else if (tipoPista === "inicial") {
        linea.textContent = `🔤 EMPIEZA POR: "${pokemonActual.nombre.charAt(0).toUpperCase()}"`;
    }

    lista.appendChild(linea);
    document.getElementById(`hint-${tipoPista}`).disabled = true;
}

function revelarRespuesta(acierto) {
    yaRespondido = true;

    const img = document.getElementById("poke-img");
    img.classList.remove("silhouette"); // aquí SÍ queremos la transición suave

    document.getElementById("guess-input").disabled = true;
    document.getElementById("btn-rendirse").disabled = true;
    document.getElementById("btn-siguiente").classList.remove("hidden");
    ["hint-generacion", "hint-tipo", "hint-inicial"].forEach(id => {
        document.getElementById(id).disabled = true;
    });
    actualizarSugerencias();

    const feedback = document.getElementById("feedback");
    const idFormateado = String(pokemonActual.id).padStart(3, "0");

    if (acierto) {
        racha++;
        if (racha > mejorRacha) {
            mejorRacha = racha;
            localStorage.setItem("adivina_mejor_racha", String(mejorRacha));
        }
        feedback.textContent = `¡CORRECTO! Es ${pokemonActual.nombre} #${idFormateado}`;
        feedback.className = "feedback correcto";
    } else {
        racha = 0;
        feedback.textContent = `Era ${pokemonActual.nombre} #${idFormateado}`;
        feedback.className = "feedback incorrecto";
    }

    document.getElementById("racha").textContent = racha;
    document.getElementById("mejor-racha").textContent = mejorRacha;
}

function rendirse() {
    if (yaRespondido) return;
    revelarRespuesta(false);
}

document.addEventListener("DOMContentLoaded", () => {
    construirListaPlana();
    document.getElementById("mejor-racha").textContent = mejorRacha;

    document.getElementById("guess-input").addEventListener("input", actualizarSugerencias);

    document.getElementById("guess-form").addEventListener("submit", (e) => {
        e.preventDefault();
        if (yaRespondido || !pokemonActual) return;
        const intento = normalizar(document.getElementById("guess-input").value);
        const correcto = normalizar(pokemonActual.nombre);
        revelarRespuesta(intento.length > 0 && intento === correcto);
    });

    nuevoPokemon();
});