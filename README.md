# Presupuesto de Viaje

App web mobile-first para llevar el presupuesto **diario dinámico** de un viaje.
Sin backend, sin frameworks: HTML + CSS + JavaScript vanilla, datos en `localStorage`.
Funciona **sin conexión** (PWA instalable).

El número principal se recalcula como:

```
presupuesto de hoy = (presupuesto total − gastos de días anteriores) / días restantes
```

así el superávit o déficit de días previos se reparte automáticamente entre los días que quedan.

## Estructura

```
index.html        Shell, secciones y tab bar
style.css         Estilos + sistema de diseño
manifest.json     Metadatos PWA (instalable)
sw.js             Service worker (uso offline)
icon-192.png      Iconos de la app
icon-512.png
js/
  storage.js      CRUD en localStorage (trip, expenses)
  budget.js       Cálculo puro (sin DOM)
  ui.js           Render del DOM y overlays
  app.js          Init, routing de tabs y eventos
```

## Publicar en GitHub Pages

1. Crea un repositorio y sube **todos** estos archivos a la raíz (incluido `.nojekyll`):
   ```bash
   git init
   git add .
   git commit -m "App de presupuesto de viaje"
   git branch -M main
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)`. Guarda.
3. A los ~1-2 min estará en `https://<usuario>.github.io/<repo>/`.

Como todas las rutas son **relativas**, funciona tanto en la raíz como en un subpath
(`/<repo>/`). GitHub Pages usa HTTPS, así que el service worker y la instalación PWA funcionan.

## Desarrollo local

Cualquier servidor estático sirve. Con Python:

```bash
python -m http.server 8000
# abrir http://127.0.0.1:8000
```

> El service worker requiere `https` o `localhost` (127.0.0.1 cuenta como seguro).

## Actualizar la app (caché del service worker)

El service worker cachea los archivos para uso offline. Al cambiar cualquier archivo,
sube el número de versión en [`sw.js`](sw.js):

```js
var CACHE_VERSION = 'viaje-v2'; // antes 'viaje-v1'
```

Así los usuarios reciben la versión nueva en la siguiente carga. (En desarrollo también
puedes hacer *Unregister* en DevTools → Application → Service Workers.)
