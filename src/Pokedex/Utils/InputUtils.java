package Pokedex.Utils;

import java.util.Scanner;

public class InputUtils {

    // Contador de partidas y aciertos
    private static int partidasJugadas = 0;
    private static int aciertos = 0;

    public static void registrarResultado(boolean correcto) {
        partidasJugadas++;
        if (correcto) aciertos++;
    }

    public static void mostrarResumen() {
        System.out.println("\nHas acertado " + aciertos + " de " + partidasJugadas + " partidas jugadas.");
    }

    public static int leerNumeroMenu(Scanner sc, String mensaje, int maxOpcion) {
        int numero = -1;
        boolean valido = false;

        do {
            System.out.print(mensaje);
            if (sc.hasNextInt()) {
                numero = sc.nextInt();
                sc.nextLine(); // limpiar buffer
                if (numero >= 0 && numero <= maxOpcion) {
                    valido = true;
                } else {
                    System.out.println("Número fuera de rango. Intenta de nuevo.");
                }
            } else {
                System.out.println("Entrada inválida. Debe ser un número.");
                sc.nextLine(); // limpiar buffer
            }
        } while (!valido);

        return numero;
    }

    public static String leerString(Scanner sc, String mensaje) {
        System.out.print(mensaje);
        return sc.nextLine().trim();
    }
}