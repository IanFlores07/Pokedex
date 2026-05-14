package Pokedex.MiniJuegos;

import Pokedex.Generaciones.*;
import Pokedex.Utils.InputUtils;
import java.util.Random;
import java.util.Scanner;

public class AdivinarPokemon {

    public static void jugar(Scanner sc) {
        Random random = new Random();
        String respuesta = "";

        while (!respuesta.equals("0")) {
            int numero = random.nextInt(GenFull.Pokedex.length);
            String pokemon = GenFull.Pokedex[numero];

            System.out.println("\n¿Qué Pokémon es el número #" + (numero + 1) + " de la Pokédex?");
            System.out.print("Respuesta (0 para salir): ");
            respuesta = sc.nextLine().trim();

            if (!respuesta.equals("0")) {
                boolean acierto = respuesta.equalsIgnoreCase(pokemon);
                if (acierto) {
                    System.out.println("¡Correcto!");
                } else {
                    System.out.println("Incorrecto. El Pokémon correcto es: " + pokemon);
                }
                InputUtils.registrarResultado(acierto);
            }
        }

        // Mostrar resumen al salir
        InputUtils.mostrarResumen();
    }
}