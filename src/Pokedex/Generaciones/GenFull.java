package Pokedex.Generaciones;

public class GenFull {

    // Referencias a los arrays reales de cada generación
    public static String[] PokedexGen1 = Gen1.PokedexGen1;
    public static String[] PokedexGen1Tipos = Gen1.PokedexGen1Tipos;

    public static String[] PokedexGen2 = Gen2.PokedexGen2;
    public static String[] PokedexGen2Tipos = Gen2.PokedexGen2Tipos;

    public static String[] PokedexGen3 = Gen3.PokedexGen3;
    public static String[] PokedexGen3Tipos = Gen3.PokedexGen3Tipos;

    public static String[] PokedexGen4 = Gen4.PokedexGen4;
    public static String[] PokedexGen4Tipos = Gen4.PokedexGen4Tipos;

    public static String[] PokedexGen5 = Gen5.PokedexGen5;
    public static String[] PokedexGen5Tipos = Gen5.PokedexGen5Tipos;

    public static String[] PokedexGen6 = Gen6.PokedexGen6;
    public static String[] PokedexGen6Tipos = Gen6.PokedexGen6Tipos;

    public static String[] PokedexGen7 = Gen7.PokedexGen7;
    public static String[] PokedexGen7Tipos = Gen7.PokedexGen7Tipos;

    public static String[] PokedexGen8 = Gen8.PokedexGen8;
    public static String[] PokedexGen8Tipos = Gen8.PokedexGen8Tipos;

    public static String[] PokedexGen9 = Gen9.PokedexGen9;
    public static String[] PokedexGen9Tipos = Gen9.PokedexGen9Tipos;

    public static String[] PokedexGen10 = Gen10.PokedexGen10;
    public static String[] PokedexGen10Tipos = Gen10.PokedexGen10Tipos;

    // Arrays FULL generados automáticamente
    public static String[] Pokedex;
    public static String[] PokedexTipos;

    static {
        // Primero construir arrays completos
        Pokedex = concatArrays(
            PokedexGen1, PokedexGen2, PokedexGen3, PokedexGen4,
            PokedexGen5, PokedexGen6, PokedexGen7, PokedexGen8,
            PokedexGen9, PokedexGen10
        );

        PokedexTipos = concatArrays(
            PokedexGen1Tipos, PokedexGen2Tipos, PokedexGen3Tipos, PokedexGen4Tipos,
            PokedexGen5Tipos, PokedexGen6Tipos, PokedexGen7Tipos, PokedexGen8Tipos,
            PokedexGen9Tipos, PokedexGen10Tipos
        );
    }

    public static String[] concatArrays(String[]... arrays) {
        int totalLength = 0;

        // Calcular tamaño total (evitando null)
        for (String[] arr : arrays) {
            if (arr != null) {
                totalLength += arr.length;
            }
        }

        String[] result = new String[totalLength];
        int pos = 0;

        // Copiar datos (evitando null)
        for (String[] arr : arrays) {
            if (arr != null) {
                for (String s : arr) {
                    result[pos++] = s;
                }
            }
        }

        return result;
    }
}