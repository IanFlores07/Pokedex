package Pokedex.MiniJuegos;

import java.util.Random;
import java.util.Scanner;
import Pokedex.Generaciones.*;

public class AdivinarTipoPokemon {
    public static void jugar(Scanner sc) {
        Random random = new Random();
        int aciertos = 0;
        int total = 0;
        String respuesta;

        do {
            // Elegir un Pokémon al azar
            int indice = random.nextInt(GenFull.Pokedex.length);
            String pokemon = GenFull.Pokedex[indice];
            String tipoCorrecto = GenFull.PokedexTipos[indice]; // p.ej. "Planta/Volador"

            // Separar los tipos en un array
            String[] tipos = tipoCorrecto.split("/");
            System.out.println("\n¿Qué tipo tiene " + pokemon + "?");
            System.out.print("Escribe tu respuesta (0 para salir): ");

            respuesta = sc.nextLine().trim();

            if (!respuesta.equals("0")) {
                total++;
                boolean acierto = false;

                // Comprobar si coincide con alguno de los tipos
                for (String tipo : tipos) {
                    if (respuesta.equalsIgnoreCase(tipo)) {
                        acierto = true;
                        break;
                    }
                }

                if (acierto) {
                    System.out.println("¡Correcto!");
                    aciertos++;
                } else {
                    System.out.print("Incorrecto. Los tipos correctos son: ");
                    for (int i = 0; i < tipos.length; i++) {
                        System.out.print(tipos[i]);
                        if (i < tipos.length - 1) System.out.print(", ");
                    }
                    System.out.println();
                }
            }

        } while (!respuesta.equals("0"));

        System.out.println("\nHas acertado " + aciertos + " de " + total + " Pokémon jugados.");
    }
}