package Pokedex.MiniJuegos;

import Pokedex.Pesos.*;
import Pokedex.Generaciones.*;
import Pokedex.Utils.InputUtils;
import java.util.Random;
import java.util.Scanner;

public class AdivinarPesoPokemon {

    public static void jugar(Scanner sc) {
        Random random = new Random();
        String entrada = "";

        // 1. CREA LAS LISTAS COMBINADAS (Normales + Megas)
        String[] todosLosNombres = concatenarNombres(GenFull.Pokedex, EspecialesPesos.nombresMegas);
        double[] todosLosPesos = concatenarPesos(GenFullPesos.Pesos.todosLosPesos, EspecialesPesos.pesosMegas);

        System.out.println("\n--- EL PESO JUSTO ---");
        System.out.println("Adivina el peso.");

        while (true) {
            // Selecciona un índice de la lista combinada
            int indice = random.nextInt(todosLosNombres.length);
            String nombrePkm = todosLosNombres[indice];
            double pesoReal = todosLosPesos[indice];

            System.out.println("\n¿Cuánto pesa " + nombrePkm + "?");
            System.out.print("Tu respuesta en kg (0 para salir): ");
            entrada = sc.nextLine().trim();

            if (entrada.equals("0")) break;

            try {
                double pesoUsuario = Double.parseDouble(entrada);
                
                // Margen de error del 10%
                double margen = pesoReal * 0.10;
                boolean acierto = Math.abs(pesoUsuario - pesoReal) <= margen;

                if (acierto) {
                    System.out.println("¡Correcto! El peso real es " + pesoReal + " kg.");
                } else {
                    System.out.println("Incorrecto. " + nombrePkm + " pesa " + pesoReal + " kg.");
                }
                
                InputUtils.registrarResultado(acierto);

            } catch (NumberFormatException e) {
                System.out.println("Error: Introduce un número válido (usa el punto para decimales).");
            }
        }

        InputUtils.mostrarResumen();
    }

    // --- MÉTODOS AUXILIARES PARA JUNTAR LAS LISTAS ---
    
    private static String[] concatenarNombres(String[] a, String[] b) {
        String[] resultado = new String[a.length + b.length];
        System.arraycopy(a, 0, resultado, 0, a.length);
        System.arraycopy(b, 0, resultado, a.length, b.length);
        return resultado;
    }

    private static double[] concatenarPesos(double[] a, double[] b) {
        double[] resultado = new double[a.length + b.length];
        System.arraycopy(a, 0, resultado, 0, a.length);
        System.arraycopy(b, 0, resultado, a.length, b.length);
        return resultado;
    }
}