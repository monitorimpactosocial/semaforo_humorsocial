# SEMAFORO_HUMOR_SOCIAL_PARACEL

## Estado actualizado (2026-04-21)

Se aplicaron correcciones al libro base:
- `usuarios.hash_password` ya no usa valores en texto plano.
- `README!D14:D20` ahora cuenta registros reales con `MAX(COUNTA(...)-3,0)`.
- Backup generado: `libro_base_paracel_sondeo_semaforo.backup.xlsx`.

## App móvil offline instalable

Se creó una PWA en [app/index.html](g:/Mi unidad/SEMAFORO_HUMOR_SOCIAL_PARACEL/app/index.html) con:
- operación offline en el dispositivo (IndexedDB + Service Worker),
- instalación como app (icono y acceso directo),
- captura de sondeos con GPS y cuestionario,
- exportación CSV/JSON para consolidación,
- gestión de usuarios restringida a rol `admin`.

### Credenciales iniciales

- `admin_demo` / `Admin@2026!`
- `editor_demo` / `Editor@2026!`
- `campo_demo` / `Campo@2026!`

### Restricción de usuarios

Solo el rol `admin` puede:
- abrir pestaña **Usuarios**,
- crear, editar, activar/desactivar y eliminar usuarios.

## Cómo usar en celular

1. Publicar la carpeta `app/` en HTTPS (GitHub Pages, Netlify o servidor propio).
2. Abrir la URL desde el celular.
3. Instalar:
   - Android/Chrome: botón **Instalar App**.
   - iPhone/Safari: compartir > **Añadir a pantalla de inicio**.
4. Ingresar con usuario y contraseña.
5. Capturar sondeos sin conexión y exportar cuando corresponda.

## Archivo de corrección del libro

- Script: [scripts/fix_workbook.ps1](g:/Mi unidad/SEMAFORO_HUMOR_SOCIAL_PARACEL/scripts/fix_workbook.ps1)
