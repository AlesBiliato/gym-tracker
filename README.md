# Gym Tracker

PWA móvil (mobile-first, offline) para **registrar y planificar entrenamientos de musculación**, pensada para un jugador de voleibol que entrena full body A/B/C y necesita que el gimnasio no perjudique su rendimiento en los partidos.

> Interfaz en español de España · pesos en kg con coma decimal (`62,5`) · fechas `dd/mm/aa`.

## Qué hace (estado por fases)

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Catálogo, plantillas A/B/C, registro en el gimnasio, importación del historial | ✅ |
| 2 | Historial, gráficas (Recharts), volumen semanal, peso corporal | ⏳ |
| 3 | Progresión doble automática | ⏳ |
| 4 | Calendario de partidos, ajuste semanal y readaptación tras un parón | ⏳ |
| 5 | Exportar JSON/CSV y "Copiar resumen para Claude" | ⏳ |

### Detalles de diseño que importan

- **Registro de una serie en 2–3 toques:** todo llega precargado desde la plantilla; un toque en ✓ marca la serie "hecha tal cual"; tocar la fila abre un editor con botones grandes.
- **Unilaterales con carga distinta por lado** (izquierda siempre primero, p. ej. `30/20`). Nunca se fuerza la simetría.
- **Variantes = ejercicios distintos.** Si sustituyes una máquina por otra variante, se registra como otro ejercicio y no se compara con el original.
- **Accesorios anidados** bajo su ejercicio principal ("durante los descansos"), y el resumen final destaca los que se quedan sin hacer.
- **Offline y guardado inmediato:** cada toque se escribe en IndexedDB (Dexie); service worker con precaché.
- **Temporizador de descanso robusto:** guarda la hora de fin, no un contador, así que sigue siendo correcto si iOS pausa la app en segundo plano.
- **No acumula sesiones perdidas:** si te saltas la B, toca la C, no "B + C".

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Dexie (IndexedDB) · Recharts · vite-plugin-pwa · Vitest.

## Arquitectura

```
src/
  db/          Esquema Dexie, tipos, seed del catálogo y las plantillas, repositorio
  domain/      Lógica PURA y testeada: formato es-ES, importador, qué sesión toca, resumen
  components/  UI reutilizable (hoja inferior, campos numéricos, temporizador, tarjeta de ejercicio)
  pages/       Pantallas (Hoy, Sesión, Resumen, Progreso, Plantillas, Catálogo, Más…)
```

El modelo es **sync-ready**: todas las entidades tienen `id` UUID generado en cliente, `createdAt`/`updatedAt`, borrado lógico (`deletedAt`) y `deviceId`. Añadir sincronización con Supabase sería escribir una capa sobre `db/repo.ts`, sin tocar el esquema ni la UI.

Entidades: `Exercise`, `Template` → `TemplateItem`, `Session` → `SessionExercise` → `SetLog`, `Match`, `BodyWeight`, `Settings`. Cada `SessionExercise` guarda una **copia del plan** vigente, de modo que editar una plantilla no altera el historial.

## Desarrollo

```powershell
npm install
npm run dev        # http://localhost:5173 y por Wi-Fi (--host)
npm test           # Vitest
npm run build      # typecheck + build de producción con PWA
npm run icons      # regenera los iconos de la PWA
```

### Probarlo en el móvil durante el desarrollo

1. Móvil y PC en la misma red Wi-Fi.
2. `npm run dev` y abre en el móvil la URL `Network` que muestra Vite (`http://192.168.x.x:5173`).
3. Por ser `http`, el service worker y la instalación no funcionan en este modo; sí el resto (IndexedDB incluido).

### Instalarla como PWA en iPhone

Despliega en Vercel (HTTPS) → Safari → Compartir → **Añadir a pantalla de inicio**. Una vez instalada, Safari no purga IndexedDB. Aun así, descarga una copia desde *Más* de vez en cuando.

## Despliegue

Conecta el repositorio de GitHub a Vercel (framework: Vite, `npm run build`, salida `dist`). El router usa `HashRouter`, por lo que no hace falta configurar reescrituras.

## Privacidad

Los datos viven **solo en el dispositivo**. El archivo `historial-gimnasio-*.json` está en `.gitignore` y no debe subirse al repositorio.

## Licencia

MIT
