export type ImageFormat =
    | "tiff"
    | "png"
    | "jpeg"
    | "gif"
    | "webp"
    | "bmp"
    | "svg"
    | "avif"
    | "heic"
    | "ico"
    | "unknown";

export interface DecodedImageInput {
    bytes: Uint8Array;
    format: ImageFormat;
    mimeType: string;
}

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
    tiff: "image/tiff",
    png: "image/png",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
    heic: "image/heic",
    ico: "image/x-icon",
    unknown: "application/octet-stream",
};

const FORMAT_BY_EXTENSION: Record<string, ImageFormat> = {
    tif: "tiff",
    tiff: "tiff",
    png: "png",
    apng: "png",
    jpg: "jpeg",
    jpeg: "jpeg",
    jpe: "jpeg",
    jfif: "jpeg",
    pjpeg: "jpeg",
    pjp: "jpeg",
    gif: "gif",
    webp: "webp",
    bmp: "bmp",
    dib: "bmp",
    svg: "svg",
    avif: "avif",
    heic: "heic",
    heif: "heic",
    ico: "ico",
    cur: "ico",
};

const FORMAT_BY_MIME: Record<string, ImageFormat> = {
    "image/tiff": "tiff",
    "image/tif": "tiff",
    "image/x-tiff": "tiff",
    "image/png": "png",
    "image/apng": "png",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/x-ms-bmp": "bmp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heic",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
};

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
    signature.every((value, index) => bytes[index] === value);

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
    String.fromCharCode(...Array.from(bytes.slice(start, start + length)));

export function formatFromExtension(fileName: string): ImageFormat {
    const extension = fileName.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase() || "";
    return FORMAT_BY_EXTENSION[extension] || "unknown";
}

export function formatFromMime(mimeType: string): ImageFormat {
    return FORMAT_BY_MIME[mimeType.trim().toLowerCase().split(";", 1)[0]] || "unknown";
}

export function detectImageFormat(bytes: Uint8Array): ImageFormat {
    if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
        startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]) ||
        startsWith(bytes, [0x49, 0x49, 0x2b, 0x00]) ||
        startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2b])) {
        return "tiff";
    }
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
    if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "gif";
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
    if (ascii(bytes, 0, 2) === "BM") return "bmp";
    if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) || startsWith(bytes, [0x00, 0x00, 0x02, 0x00])) return "ico";

    if (ascii(bytes, 4, 4) === "ftyp") {
        const brand = ascii(bytes, 8, 4).toLowerCase();
        if (brand === "avif" || brand === "avis") return "avif";
        if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
    }

    const preview = new TextDecoder("utf-8", { fatal: false })
        .decode(bytes.slice(0, Math.min(bytes.length, 2048)))
        .replace(/^\uFEFF/, "")
        .trimStart()
        .toLowerCase();
    if (preview.startsWith("<svg") ||
        (preview.startsWith("<?xml") && preview.includes("<svg"))) {
        return "svg";
    }

    return "unknown";
}

export function mimeForFormat(format: ImageFormat): string {
    return MIME_BY_FORMAT[format];
}

function base64ToBytes(value: string): Uint8Array {
    const normalized = value
        .replace(/\s/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
        throw new Error("El contenido Base64 no es válido.");
    }

    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(paddingLength);
    const decodedLength = (padded.length / 4) * 3 - (padded.endsWith("==") ? 2 : padded.endsWith("=") ? 1 : 0);
    const result = new Uint8Array(decodedLength);
    const chunkSize = 32768;
    let offset = 0;

    for (let start = 0; start < padded.length; start += chunkSize) {
        const binary = atob(padded.slice(start, start + chunkSize));
        for (let index = 0; index < binary.length; index += 1) {
            result[offset++] = binary.charCodeAt(index);
        }
    }

    return result;
}

function dataUrlToBytes(value: string): { bytes: Uint8Array; mimeType: string } {
    const commaIndex = value.indexOf(",");
    if (commaIndex < 0) throw new Error("La URL de datos no es válida.");

    const header = value.slice(5, commaIndex);
    const payload = value.slice(commaIndex + 1);
    const mimeType = header.split(";", 1)[0] || "";

    if (/;base64(?:;|$)/i.test(header)) {
        return { bytes: base64ToBytes(payload), mimeType };
    }

    try {
        return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mimeType };
    } catch {
        throw new Error("La URL de datos no se pudo decodificar.");
    }
}

export function decodeImageInput(value: string, fileName = "", declaredMimeType = ""): DecodedImageInput {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("No hay contenido de imagen para mostrar.");

    let bytes: Uint8Array;
    let dataUrlMime = "";
    if (trimmed.toLowerCase().startsWith("data:")) {
        const decoded = dataUrlToBytes(trimmed);
        bytes = decoded.bytes;
        dataUrlMime = decoded.mimeType;
    } else {
        bytes = base64ToBytes(trimmed);
    }

    if (bytes.length === 0) throw new Error("El contenido de imagen está vacío.");

    const detectedFormat = detectImageFormat(bytes);
    const declaredFormat = formatFromMime(dataUrlMime || declaredMimeType);
    const extensionFormat = formatFromExtension(fileName);
    const format = detectedFormat !== "unknown"
        ? detectedFormat
        : declaredFormat !== "unknown"
            ? declaredFormat
            : extensionFormat;

    const requestedMime = (dataUrlMime || declaredMimeType).trim().toLowerCase().split(";", 1)[0];
    const mimeType = format !== "unknown"
        ? mimeForFormat(format)
        : requestedMime.startsWith("image/")
            ? requestedMime
            : MIME_BY_FORMAT.unknown;

    return { bytes, format, mimeType };
}

export function friendlyFormatName(format: ImageFormat): string {
    const names: Record<ImageFormat, string> = {
        tiff: "TIFF",
        png: "PNG",
        jpeg: "JPEG",
        gif: "GIF",
        webp: "WebP",
        bmp: "BMP",
        svg: "SVG",
        avif: "AVIF",
        heic: "HEIC/HEIF",
        ico: "ICO",
        unknown: "Imagen",
    };
    return names[format];
}
