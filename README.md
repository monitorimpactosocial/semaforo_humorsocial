# Paracel · Humor Social (Offline-first PWA + Google Apps Script backend)

Este repositorio contiene:

- `app/` PWA estática para celular (funciona offline).
- `gas/` Backend Google Apps Script (API JSON) que lee/escribe en Google Sheets.

## 1) Requisitos en Google Sheets

En el Spreadsheet configurado en `gas/Code.gs` (CFG.SPREADSHEET_ID), crear hojas:

### `usuarios` (encabezados)
`usuario | hash_password | nombre | rol | activo | tipo_informante_default | observacion | (opcional) permiso_tablero`

- `hash_password` puede ser:
  - contraseña en claro (modo simple), o
  - hash SHA-256 en hex (64 caracteres). Recomendado.
- `rol` habilita tablero si es `editor` o `admin` (configurable en CFG.DASHBOARD_ROLES).
- `permiso_tablero` opcional para habilitar tablero aun sin rol.

### `preguntas`
`id_pregunta | dimension | pregunta | tipo_respuesta | opciones | puntajes | requerido | orden | activo | nota`

Opciones separadas por `|`. Puntajes separados por `|`.

### `respuestas`
Encabezados recomendados:
`ts | usuario | nombre | rol | tipo_informante | area | comunidad | id_encuesta | id_pregunta | respuesta | puntaje | comentario`

## 2) Desplegar Backend (Apps Script)

1. Crear un proyecto Apps Script.
2. Copiar `gas/Code.gs` y guardar.
3. Deploy -> New deployment -> Web app
   - Execute as: Me
   - Who has access: Anyone (para llamadas desde GitHub Pages)
4. Copiar la URL del deployment (termina en `/exec`).

## 3) Configurar Frontend

Editar `app/app.js` y reemplazar:

`API_URL: 'PASTE_YOUR_GAS_WEBAPP_URL_HERE'`

por la URL real del WebApp.

## 4) Publicar Frontend en GitHub Pages

1. Subir el contenido del repo a GitHub.
2. Settings -> Pages -> Deploy from branch -> seleccionar `main` y carpeta `/app`.
3. Abrir la URL de Pages en el celular y "Agregar a pantalla de inicio".

## 5) Offline + Sync

- La encuesta se puede guardar offline (IndexedDB).
- Al volver la conexión, se sincroniza automáticamente (evento `online`) o con el botón "Sincronizar pendientes".

## Observación sobre CORS

El backend responde JSON vía `ContentService`. GitHub Pages puede llamar por `fetch` sin requerir iframes.

## GitHub Pages (configuración recomendada)

Opción A (recomendada):
- Settings → Pages → Deploy from branch
- Branch: main
- Folder: /app

Opción B (fallback):
- Folder: /(root)
- El `index.html` del root redirige automáticamente a `./app/`
