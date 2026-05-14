package Pokedex.MiniJuegos;

import Pokedex.Generaciones.*;
import Pokedex.Utils.InputUtils;
import java.util.Random;
import java.util.Scanner;

public class AdivinarPokemonLetras {

    public static void jugar(Scanner sc) {
        Random random = new Random();
        String respuesta = "";

        while (!respuesta.equals("0")) {
            int numero = random.nextInt(GenFull.Pokedex.length);
            String pokemon = GenFull.Pokedex[numero];

            // Revelar la primera letra al inicio
            StringBuilder pistas = new StringBuilder();
            pistas.append(pokemon.charAt(0));
            for (int i = 1; i < pokemon.length(); i++) pistas.append("_");

            int intentos = 0;

            while (!respuesta.equalsIgnoreCase(pokemon) && intentos < 3) {
                System.out.println("\nAdivina el Pokémon: " + pistas);
                System.out.print("Respuesta (0 para salir): ");
                respuesta = sc.nextLine().trim();

                if (respuesta.equals("0")) break;

                if (respuesta.equalsIgnoreCase(pokemon)) {
                    System.out.println("¡Correcto!");
                    InputUtils.registrarResultado(true);
                } else {
                    intentos++;
                    if (intentos < 3) {
                        // Revelar una letra más
                        pistas.setCharAt(intentos, pokemon.charAt(intentos));
                        System.out.println("Incorrecto. Se revela otra letra.");
                    } else {
                        System.out.println("Incorrecto. El Pokémon correcto era: " + pokemon);
                        InputUtils.registrarResultado(false);
                    }
                }
            }
        }

        InputUtils.mostrarResumen();
    }
}