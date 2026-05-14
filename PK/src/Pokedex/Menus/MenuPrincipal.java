package Pokedex.Menus;

import java.util.Scanner;

//import Pokedex.Generaciones.*;
import Pokedex.Utils.InputUtils;

public class MenuPrincipal {

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int opcion;

        do {
            System.out.println("1 - Ver Pokedex");
            System.out.println("2 - Minijuegos");
            System.out.println("3 - Salir");
            

            /*for (int i = 0; i < Gen3.PokedexGen3Tipos.length; i++) {
                System.out.println(i + " -> " + Gen3.PokedexGen3[i] + " | " + Gen3.PokedexGen3Tipos[i]);
            }
            //COMPROBAR CANTIDAD DE TIPOS Y POKEMONS
            System.out.println(" POKEMONS / TIPOS");
            System.out.println("Gen1: " + Gen1.PokedexGen1.length + " / " + Gen1.PokedexGen1Tipos.length);
            System.out.println("Gen2: " + Gen2.PokedexGen2.length + " / " + Gen2.PokedexGen2Tipos.length);
            System.out.println("Gen3: " + Gen3.PokedexGen3.length + " / " + Gen3.PokedexGen3Tipos.length);
            System.out.println("Gen4: " + Gen4.PokedexGen4.length + " / " + Gen4.PokedexGen4Tipos.length);
            System.out.println("Gen5: " + Gen5.PokedexGen5.length + " / " + Gen5.PokedexGen5Tipos.length);
            System.out.println("Gen6: " + Gen6.PokedexGen6.length + " / " + Gen6.PokedexGen6Tipos.length);
            System.out.println("Gen7: " + Gen7.PokedexGen7.length + " / " + Gen7.PokedexGen7Tipos.length);
            System.out.println("Gen8: " + Gen8.PokedexGen8.length + " / " + Gen8.PokedexGen8Tipos.length);
            System.out.println("Gen9: " + Gen9.PokedexGen9.length + " / " + Gen9.PokedexGen9Tipos.length);
            System.out.println("Gen10: " + Gen10.PokedexGen10.length + " / " + Gen10.PokedexGen10Tipos.length);
            System.out.println("FULL: " + GenFull.Pokedex.length + " / " + GenFull.PokedexTipos.length);*/

            opcion = InputUtils.leerNumeroMenu(sc, "Selecciona una opción: ", 3);

            switch (opcion) {
                case 1: 
                    Pokedex.pkdx(sc); 
                        break;
                case 2: 
                    MiniJuegos.menuMinijuegos(sc); 
                        break;
                case 3: 
                    System.out.println("Cerrando..."); 
                        break;
                default: 
                    System.out.println("Opción no válida.");
            }

        } while (opcion != 3);

        sc.close();
    }
}