# ASSA PCF Image Viewer

Control PCF para Power Apps que recibe una imagen en Base64 y la muestra dentro de una app Canvas o model-driven. Se creó a partir del contrato del visor PDF de referencia, por lo que conserva las propiedades `fileName` y `base64Content` y agrega `mimeType` como ayuda opcional.

## Formatos

| Formato | Soporte |
| --- | --- |
| TIFF / TIF | Decodificación interna, incluida navegación entre páginas |
| PNG / APNG | Render nativo del navegador |
| JPEG / JPG / JFIF | Render nativo del navegador |
| GIF | Render nativo, incluida animación |
| WebP | Render nativo del navegador |
| BMP / DIB | Render nativo del navegador |
| SVG | Sanitizado antes de mostrarlo y renderizado como imagen |
| AVIF | Render nativo cuando el navegador de Power Apps lo admite |
| ICO / CUR | Render nativo del navegador |
| HEIC / HEIF | Se intenta el render nativo; si el navegador no lo admite, el control muestra un mensaje para convertirlo a TIFF, PNG o JPEG |

El control detecta el tipo por la firma binaria. Si no alcanza, usa el tipo MIME y luego la extensión del nombre de archivo.

## Funciones

- TIFF de una o varias páginas.
- Base64 puro, Base64 URL-safe o una URL `data:image/...`.
- Zoom, ajuste al área, rotación y pantalla completa.
- Descarga del archivo original.
- Apertura e impresión de la imagen visible; una página TIFF se exporta temporalmente a PNG sólo para esas dos acciones.
- Interfaz responsive y accesible por teclado.
- Sin llamadas a servicios externos.
- SVG sanitizado antes del render para evitar contenido ejecutable embebido.

## Propiedades del control

| Propiedad | Tipo | Requerida | Uso |
| --- | --- | --- | --- |
| `fileName` | Texto | No | Nombre con extensión, por ejemplo `poliza.tiff` |
| `base64Content` | Texto multilínea | No | Base64 puro o URL `data:image/...` |
| `mimeType` | Texto | No | Ayuda opcional, por ejemplo `image/tiff` |

Ejemplo conceptual en una Canvas App:

```powerfx
fileName = _gblNombreArchivo
base64Content = _gblBase64
mimeType = ""
```

`mimeType` puede quedar vacío cuando `fileName` tiene una extensión correcta o el contenido tiene una firma reconocible.

## Desarrollo local

Requisitos: Node.js, npm, .NET SDK y Power Platform CLI.

```bash
git clone https://github.com/jpereyrapeakflowpro/assa-pcf-imagenes.git
cd assa-pcf-imagenes
npm ci
npm run verify
```

`npm run verify` ejecuta lint, 15 pruebas automatizadas y la compilación del control.

Para iniciar el test harness de PCF:

```bash
npm start
```

## Empaquetar la solución

```bash
dotnet build PAVisorImagenesPCF/PAVisorImagenesPCF.cdsproj --configuration Release
```

Los ZIP importables, administrado y no administrado, se generan dentro de `PAVisorImagenesPCF/bin/Release/`. La solución se llama `PAVisorImagenesPCF`, el publisher conserva el prefijo `assa` y el control se registra como `ASSAImageViewer.Base64ImageViewer`, por lo que puede convivir con el visor PDF original.

Después de importar la solución en el entorno correcto:

1. Abre la Canvas App.
2. Ve a **Insertar > Obtener más componentes > Código**.
3. Agrega **Visor Base64 de Imágenes**.
4. Asigna las propiedades indicadas arriba.
5. Guarda, publica y valida con bytes reales devueltos por el flujo.

## Alcance de la validación

El PCF puede validar que un Base64 correcto se decodifica y se renderiza. No confirma que el flujo, conector o servicio documental haya recuperado el archivo real. Un flujo con HTTP 200 pero `base64` vacío seguirá mostrando el estado sin imagen; esa recuperación debe verificarse por separado.

## Dependencias de ejecución

- [UTIF.js](https://github.com/photopea/UTIF.js) para TIFF.
- [DOMPurify](https://github.com/cure53/DOMPurify) para sanitizar SVG.

Consulta [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) para las licencias.
