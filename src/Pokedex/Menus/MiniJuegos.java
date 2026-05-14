package Pokedex.Menus;

import java.util.Scanner;
import Pokedex.MiniJuegos.*;
import Pokedex.Utils.InputUtils;

public class MiniJuegos {

    public static void menuMinijuegos(Scanner sc) {
        String opcion;

        do {
            System.out.println("\n=== MINIJUEGOS ===");
            System.out.println("1 - Adivina Pokémon");
            System.out.println("2 - Anagrama de Pokémons");
            System.out.println("3 - Adivinar el Pokémon por su letra inicial");
            System.out.println("4 - Adivina el tipo del Pokémon");
            System.out.println("5 - Adivina el peso del Pokémon");
            System.out.println("* - Salir");

            opcion = InputUtils.leerString(sc, "Selecciona un minijuego: ");

            switch (opcion) {
                case "1":
                    AdivinarPokemon.jugar(sc);
                    break;
                case "2":
                    AdivinarPokemonAnagrama.jugar(sc);
                    break;
                case "3":
                    AdivinarPokemonLetras.jugar(sc);
                    break;
                case "4":
                    AdivinarTipoPokemon.jugar(sc);
                    break;
                case "5":
                    AdivinarPesoPokemon.jugar(sc);
                    break;
                case "*":
                    System.out.println("Volviendo al menú principal...");
                    break;
                default:
                    System.out.println("Opción no válida.");
            }

        } while (!opcion.equals("*"));
    }
}