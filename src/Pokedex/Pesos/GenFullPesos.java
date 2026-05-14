package Pokedex.Pesos;

public class GenFullPesos {
    
    public class Pesos {
    
        // 1. ARRAY MAESTRO: Aquí se guardarán los 1025+ pesos juntos
        public static double[] todosLosPesos;
    
        // 2. BLOQUE ESTÁTICO: Se ejecuta una sola vez al cargar la clase
        static {
            todosLosPesos = concatenar(
                Gen1Pesos.PesosGen1, 
                Gen2Pesos.PesosGen2,
                Gen3Pesos.PesosGen3,
                Gen4Pesos.PesosGen4,
                Gen5Pesos.PesosGen5,
                Gen6Pesos.PesosGen6,
                Gen7Pesos.PesosGen7,
                Gen8Pesos.PesosGen8,
                Gen9Pesos.PesosGen9,
                Gen10Pesos.PesosGen10,
                EspecialesPesos.pesosMegas
            );
        }
    
        // 3. MÉTODO LÓGICO: El "pegamento" para unir los arrays
        private static double[] concatenar(double[]... arrays) {
            int longitudTotal = 0;
            // Calcula cuánto va a medir el array gigante
            for (double[] a : arrays) {
                longitudTotal += a.length;
            }
    
            double[] resultado = new double[longitudTotal];
            int posicionDestino = 0;
    
            // Copia cada array de generación en el array resultado
            for (double[] a : arrays) {
                System.arraycopy(a, 0, resultado, posicionDestino, a.length);
                posicionDestino += a.length;
            }
    
            return resultado;
        }
    
        // 4. MÉTODOS DE UTILIDAD PARA MINIJUEGO
        public static double obtenerPesoPorId(int idOficial) {
            // Resta 1 porque el ID 1 (Bulbasaur) es la posición 0 del array
            if (idOficial > 0 && idOficial <= todosLosPesos.length) {
                return todosLosPesos[idOficial - 1];
            }
            return 0.0;
        }
    }
}