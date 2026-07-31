/**
 * Respuestas de error compartidas para los route handlers de /api.
 * ---------------------------------------------------------------------------
 * Antes, cada ruta repetía a mano el mismo bloque:
 *
 *   if (err instanceof DbNotConfiguredError) {
 *     return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
 *   }
 *
 * (28 copias en 20 rutas). Este módulo es la única fuente de esa respuesta,
 * para que el contrato `503 { error: "db_not_configured" }` no derive.
 */
import { NextResponse } from "next/server";
import { DbNotConfiguredError } from "@/lib/db";

/**
 * Traduce un `DbNotConfiguredError` a la respuesta canónica
 * `503 { error: "db_not_configured" }`. Devuelve `null` para cualquier otro
 * error, de modo que el caller continúe con su propio manejo.
 */
export function dbNotConfiguredResponse(err: unknown): NextResponse | null {
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  return null;
}
