package Pokedex.Menus;

import Pokedex.Generaciones.*;
import java.util.Scanner;
import Pokedex.Utils.*;

public class Pokedex {

    public static String length;

    public static void pkdx(Scanner sc) {
        String opcion;

        do {
            System.out.println("\n=== POKEDEX ===");
            System.out.println("Elige la generación para visualizar:");
            System.out.println("0 - Todas las generaciones");
            System.out.println("1 - Generación 1");
            System.out.println("2 - Generación 2");
            System.out.println("3 - Generación 3");
            System.out.println("4 - Generación 4");
            System.out.println("5 - Generación 5");
            System.out.println("6 - Generación 6");
            System.out.println("7 - Generación 7");
            System.out.println("8 - Generación 8");
            System.out.println("9 - Generación 9");
            System.out.println("10 - Generación 10");
            System.out.println("* - Salir");

            opcion = InputUtils.leerString(sc, "Selecciona una generación: ");

            switch (opcion) {
                case "0":
                    mostrarTodas();
                    break;
                case "1":
                    mostrarPokedex(Gen1.PokedexGen1, 1);
                    break;
                case "2":
                    mostrarPokedex(Gen2.PokedexGen2, Gen1.PokedexGen1.length + 1);
                    break;
                case "3":
                    mostrarPokedex(Gen3.PokedexGen3, Gen1.PokedexGen1.length + Gen2.PokedexGen2.length + 1);
                    break;
                case "4":
                    mostrarPokedex(Gen4.PokedexGen4, sumaLongitudesHastaGen(4) + 1);
                    break;
                case "5":
                    mostrarPokedex(Gen5.PokedexGen5, sumaLongitudesHastaGen(5) + 1);
                    break;
                case "6":
                    mostrarPokedex(Gen6.PokedexGen6, sumaLongitudesHastaGen(6) + 1);
                    break;
                case "7":
                    mostrarPokedex(Gen7.PokedexGen7, sumaLongitudesHastaGen(7) + 1);
                    break;
                case "8":
                    mostrarPokedex(Gen8.PokedexGen8, sumaLongitudesHastaGen(8) + 1);
                    break;
                case "9":
                    mostrarPokedex(Gen9.PokedexGen9, sumaLongitudesHastaGen(9) + 1);
                    break;
                case "10":
                    mostrarPokedex(Gen10.PokedexGen10, sumaLongitudesHastaGen(10) + 1);
                    break;
                case "*":
                    System.out.println("Saliendo de la Pokedex...");
                    break;
                default:
                    System.out.println("Generación no válida");
            }

        } while (!opcion.equals("*"));
    }

    // Función auxiliar para calcular la suma de las longitudes de todas las generaciones anteriores
    private static int sumaLongitudesHastaGen(int gen) {
        int suma = 0;
        String[][] todas = {
            Gen1.PokedexGen1,
            Gen2.PokedexGen2,
            Gen3.PokedexGen3,
            Gen4.PokedexGen4,
            Gen5.PokedexGen5,
            Gen6.PokedexGen6,
            Gen7.PokedexGen7,
            Gen8.PokedexGen8,
            Gen9.PokedexGen9,
            Gen10.PokedexGen10
        };
        for (int i = 0; i < gen - 1; i++) { // hasta gen-1
            if (todas[i] != null) suma += todas[i].length;
        }
        return suma;
    }

    // Mostrar Pokédex de una generación con contador inicial
    private static int mostrarPokedex(String[] pokedexGen, int contadorInicial) {
        if (pokedexGen == null || pokedexGen.length == 0) {
            System.out.println("No hay Pokémon en esta generación.");
            return contadorInicial;
        }

        int contador = contadorInicial;
        int fila = 0; // contador local para filas de 3

        // Calcular ancho máximo de columna
        int maxLength = 0;
        for (int i = 0; i < pokedexGen.length; i++) {
            String entry = "#" + (contador + i) + " " + pokedexGen[i];
            if (entry.length() > maxLength) maxLength = entry.length();
        }
        maxLength += 2; // margen extra

        for (String p : pokedexGen) {
            System.out.printf("%-" + maxLength + "s", "#" + contador + " " + p);
            fila++;
            contador++;
            if (fila == 3) {
                System.out.println();
                fila = 0;
            }
        }
        if (fila != 0) System.out.println(); // saltar línea si quedan menos de 3 al final

        return contador;
    }

    // Mostrar todas las generaciones
    private static void mostrarTodas() {
        String[][] todas = {
            Gen1.PokedexGen1,
            Gen2.PokedexGen2,
            Gen3.PokedexGen3,
            Gen4.PokedexGen4,
            Gen5.PokedexGen5,
            Gen6.PokedexGen6,
            Gen7.PokedexGen7,
            Gen8.PokedexGen8,
            Gen9.PokedexGen9,
            Gen10.PokedexGen10
        };

        int contador = 1;

        // Calcular ancho máximo total
        int maxLength = 0;
        for (String[] gen : todas) {
            if (gen == null) continue;
            for (String p : gen) {
                String entry = "#" + contador + " " + p;
                if (entry.length() > maxLength) maxLength = entry.length();
                contador++;
            }
        }
        maxLength += 2; // margen extra

        // Imprimir todos los Pokémon
        contador = 1;
        System.out.println("\n--- TODAS LAS GENERACIONES ---");
        for (String[] gen : todas) {
            if (gen == null) continue;
            for (String p : gen) {
                System.out.printf("%-" + maxLength + "s", "#" + contador + " " + p);
                if (contador % 3 == 0) System.out.println();
                contador++;
            }
        }
        System.out.println();
    }
}