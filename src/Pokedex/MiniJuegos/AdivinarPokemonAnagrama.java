package Pokedex.MiniJuegos;

import Pokedex.Generaciones.*;
import Pokedex.Utils.InputUtils;
import java.util.Random;
import java.util.Scanner;

public class AdivinarPokemonAnagrama {

    public static void jugar(Scanner sc) {
        Random random = new Random();
        String respuesta = "";

        while (!respuesta.equals("0")) {
            int numero = random.nextInt(GenFull.Pokedex.length);
            String pokemon = GenFull.Pokedex[numero];

            // Crear anagrama
            char[] letras = pokemon.toCharArray();
            for (int i = 0; i < letras.length; i++) {
                int j = random.nextInt(letras.length);
                char temp = letras[i];
                letras[i] = letras[j];
                letras[j] = temp;
            }
            String anagrama = new String(letras);

            // Mostrar al usuario y leer respuesta
            System.out.println("\nAdivina el Pokémon: " + anagrama);
            System.out.print("Respuesta (0 para salir): ");
            respuesta = sc.nextLine().trim();

            if (respuesta.equals("0")) break;

            if (respuesta.equalsIgnoreCase(pokemon)) {
                System.out.println("¡Correcto!");
                InputUtils.registrarResultado(true);
            } else {
                System.out.println("Incorrecto. El Pokémon correcto era: " + pokemon);
                InputUtils.registrarResultado(false);
            }
        }

        InputUtils.mostrarResumen();
    }
}