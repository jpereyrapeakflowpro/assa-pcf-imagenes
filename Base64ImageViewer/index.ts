import DOMPurify from "dompurify";
import * as UTIF from "utif";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
    decodeImageInput,
    friendlyFormatName,
    ImageFormat,
} from "./image-utils";

const ICONS = {
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg>',
    fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>',
    newTab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
};

const TIFF_FORMATS: ImageFormat[] = ["tiff"];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export class Base64ImageViewer implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    private _mainContainer: HTMLDivElement;
    private _toolbar: HTMLDivElement;
    private _viewerWrapper: HTMLDivElement;
    private _stage: HTMLDivElement;
    private _fileNameSpan: HTMLSpanElement;
    private _metadataSpan: HTMLSpanElement;
    private _pageControls: HTMLDivElement;
    private _pageLabel: HTMLSpanElement;
    private _previousButton: HTMLButtonElement;
    private _nextButton: HTMLButtonElement;
    private _actionButtons: HTMLButtonElement[] = [];

    private _lastContent = "";
    private _lastFileName = "";
    private _lastMimeType = "";
    private _sourceBlob: Blob | null = null;
    private _sourceUrl = "";
    private _displayUrl = "";
    private _format: ImageFormat = "unknown";
    private _tiffBuffer: ArrayBuffer | null = null;
    private _tiffFrames: UTIF.IFD[] = [];
    private _pageIndex = 0;
    private _mediaElement: HTMLImageElement | HTMLCanvasElement | null = null;
    private _mediaWidth = 0;
    private _mediaHeight = 0;
    private _zoom = 1;
    private _rotation = 0;
    private _fitToViewer = true;

    public init(
        context: ComponentFramework.Context<IInputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._context = context;
        this._container = container;
        context.mode.trackContainerResize(true);
        this._buildUI();
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this._context = context;
        const content = context.parameters.base64Content?.raw || "";
        const fileName = context.parameters.fileName?.raw || "imagen";
        const mimeType = context.parameters.mimeType?.raw || "";
        const fileNameChanged = fileName !== this._lastFileName;

        if (fileNameChanged) {
            this._lastFileName = fileName;
            this._fileNameSpan.textContent = fileName;
            this._fileNameSpan.title = fileName;
        }

        if (content !== this._lastContent || mimeType !== this._lastMimeType || (fileNameChanged && Boolean(content))) {
            this._lastContent = content;
            this._lastMimeType = mimeType;
            if (content) {
                this._loadImage(content, fileName, mimeType);
            } else {
                this._showEmptyState();
            }
        } else if (this._fitToViewer && this._mediaElement) {
            window.requestAnimationFrame(() => this._applyFit());
        }
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        this._revokeUrls();
    }

    private _buildUI(): void {
        this._mainContainer = document.createElement("div");
        this._mainContainer.className = "image-viewer-container";

        this._toolbar = document.createElement("div");
        this._toolbar.className = "image-toolbar";
        this._mainContainer.appendChild(this._toolbar);

        const identity = document.createElement("div");
        identity.className = "image-toolbar-group image-identity";
        const imageIcon = document.createElement("span");
        imageIcon.className = "image-file-icon";
        imageIcon.innerHTML = ICONS.image;
        identity.appendChild(imageIcon);

        const titleStack = document.createElement("div");
        titleStack.className = "image-title-stack";
        this._fileNameSpan = document.createElement("span");
        this._fileNameSpan.className = "image-file-name";
        this._fileNameSpan.textContent = "imagen";
        this._metadataSpan = document.createElement("span");
        this._metadataSpan.className = "image-metadata";
        this._metadataSpan.textContent = "Sin archivo";
        titleStack.append(this._fileNameSpan, this._metadataSpan);
        identity.appendChild(titleStack);
        this._toolbar.appendChild(identity);

        const actions = document.createElement("div");
        actions.className = "image-toolbar-actions";

        this._pageControls = document.createElement("div");
        this._pageControls.className = "image-page-controls";
        this._previousButton = this._createButton(ICONS.previous, "Página anterior", () => this._changePage(-1), true);
        this._pageLabel = document.createElement("span");
        this._pageLabel.className = "image-page-label";
        this._nextButton = this._createButton(ICONS.next, "Página siguiente", () => this._changePage(1), true);
        this._pageControls.append(this._previousButton, this._pageLabel, this._nextButton);
        actions.appendChild(this._pageControls);

        const viewControls = document.createElement("div");
        viewControls.className = "image-toolbar-group";
        viewControls.append(
            this._createButton(ICONS.zoomOut, "Alejar", () => this._changeZoom(0.8)),
            this._createButton(ICONS.zoomIn, "Acercar", () => this._changeZoom(1.25)),
            this._createButton(ICONS.fit, "Ajustar al área", () => this._fitImage()),
            this._createButton(ICONS.rotate, "Girar 90°", () => this._rotateImage())
        );
        actions.appendChild(viewControls);

        const fileControls = document.createElement("div");
        fileControls.className = "image-toolbar-group";
        fileControls.append(
            this._createButton(ICONS.newTab, "Abrir imagen", () => this._openInNewTab()),
            this._createButton(ICONS.download, "Descargar archivo original", () => this._download()),
            this._createButton(ICONS.print, "Imprimir imagen", () => this._print()),
            this._createButton(ICONS.fullscreen, "Pantalla completa", () => this._toggleFullscreen())
        );
        actions.appendChild(fileControls);
        this._toolbar.appendChild(actions);

        this._viewerWrapper = document.createElement("div");
        this._viewerWrapper.className = "image-viewer-wrapper";
        this._stage = document.createElement("div");
        this._stage.className = "image-stage";
        this._viewerWrapper.appendChild(this._stage);
        this._mainContainer.appendChild(this._viewerWrapper);
        this._container.appendChild(this._mainContainer);
        this._showEmptyState();
    }

    private _createButton(
        icon: string,
        label: string,
        onClick: () => void,
        pageButton = false
    ): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = pageButton ? "image-page-button" : "image-toolbar-button";
        button.innerHTML = icon;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!button.disabled) onClick();
        });
        if (!pageButton) this._actionButtons.push(button);
        return button;
    }

    private _loadImage(content: string, fileName: string, mimeType: string): void {
        this._resetDocumentState();
        this._setActionsEnabled(false);
        try {
            const decoded = decodeImageInput(content, fileName, mimeType);
            if (decoded.format === "unknown" && !decoded.mimeType.startsWith("image/")) {
                throw new Error("Formato no reconocido. Usa TIFF, PNG, JPEG, GIF, WebP, BMP, SVG, AVIF, HEIC o ICO.");
            }

            this._format = decoded.format;
            this._sourceBlob = new Blob([decoded.bytes], { type: decoded.mimeType });
            this._sourceUrl = URL.createObjectURL(this._sourceBlob);
            this._setActionsEnabled(true);

            if (TIFF_FORMATS.includes(decoded.format)) {
                this._loadTiff(decoded.bytes);
            } else {
                this._loadNativeImage(decoded.bytes, decoded.mimeType, decoded.format);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Formato de imagen inválido.";
            this._showError(`No se pudo cargar la imagen. ${message}`);
        }
    }

    private _loadTiff(bytes: Uint8Array): void {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const frames = UTIF.decode(buffer);
        if (!frames.length) throw new Error("El TIFF no contiene páginas que se puedan leer.");

        this._tiffBuffer = buffer;
        this._tiffFrames = frames;
        this._pageIndex = 0;
        this._pageControls.style.display = frames.length > 1 ? "flex" : "none";
        this._renderTiffPage(0);
    }

    private _renderTiffPage(pageIndex: number): void {
        if (!this._tiffBuffer || !this._tiffFrames[pageIndex]) return;

        const frame = this._tiffFrames[pageIndex];
        UTIF.decodeImage(this._tiffBuffer, frame);
        const rgba = UTIF.toRGBA8(frame);
        if (!frame.width || !frame.height || rgba.length !== frame.width * frame.height * 4) {
            throw new Error("La página TIFF tiene dimensiones o píxeles inválidos.");
        }

        const canvas = document.createElement("canvas");
        canvas.className = "image-media";
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("El navegador no pudo crear el lienzo de imagen.");
        const pixels = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
        context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);

        this._pageIndex = pageIndex;
        this._setMedia(canvas, frame.width, frame.height);
        this._updatePageControls();
        this._updateMetadata();
        delete (frame as Partial<UTIF.IFD>).data;
    }

    private _loadNativeImage(bytes: Uint8Array, mimeType: string, format: ImageFormat): void {
        let displayBlob = this._sourceBlob;
        if (format === "svg") {
            const svgText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
            const sanitized = DOMPurify.sanitize(svgText, {
                USE_PROFILES: { svg: true, svgFilters: true },
                FORBID_TAGS: ["foreignObject"],
            });
            displayBlob = new Blob([sanitized], { type: "image/svg+xml" });
        }
        if (!displayBlob) throw new Error("No se pudo preparar la imagen.");

        this._displayUrl = displayBlob === this._sourceBlob
            ? this._sourceUrl
            : URL.createObjectURL(displayBlob);

        const image = document.createElement("img");
        image.className = "image-media";
        image.alt = this._lastFileName || "Imagen";
        image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height) {
                this._showError("La imagen no informa dimensiones válidas.");
                return;
            }
            this._setMedia(image, width, height);
            this._updateMetadata();
        };
        image.onerror = () => {
            const browserHint = format === "heic"
                ? " Este navegador no admite HEIC/HEIF; conviértelo a TIFF, PNG o JPEG."
                : "";
            this._showError(`El navegador no pudo renderizar ${friendlyFormatName(format)}.${browserHint}`);
        };
        image.src = this._displayUrl;
    }

    private _setMedia(element: HTMLImageElement | HTMLCanvasElement, width: number, height: number): void {
        this._clearStage();
        this._mediaElement = element;
        this._mediaWidth = width;
        this._mediaHeight = height;
        this._zoom = 1;
        this._rotation = 0;
        this._fitToViewer = true;
        this._stage.appendChild(element);
        window.requestAnimationFrame(() => this._applyFit());
    }

    private _changePage(offset: number): void {
        const target = this._pageIndex + offset;
        if (target < 0 || target >= this._tiffFrames.length) return;
        try {
            this._renderTiffPage(target);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Página TIFF inválida.";
            this._showError(`No se pudo renderizar la página ${target + 1}. ${message}`);
        }
    }

    private _updatePageControls(): void {
        const total = this._tiffFrames.length;
        this._pageLabel.textContent = `${this._pageIndex + 1} / ${total}`;
        this._previousButton.disabled = this._pageIndex === 0;
        this._nextButton.disabled = this._pageIndex >= total - 1;
    }

    private _changeZoom(factor: number): void {
        this._fitToViewer = false;
        this._zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._zoom * factor));
        this._applyTransform();
    }

    private _fitImage(): void {
        this._fitToViewer = true;
        this._applyFit();
    }

    private _applyFit(): void {
        if (!this._mediaElement || !this._mediaWidth || !this._mediaHeight) return;
        const availableWidth = Math.max(1, this._viewerWrapper.clientWidth - 32);
        const availableHeight = Math.max(1, this._viewerWrapper.clientHeight - 32);
        const rotated = this._rotation % 180 !== 0;
        const width = rotated ? this._mediaHeight : this._mediaWidth;
        const height = rotated ? this._mediaWidth : this._mediaHeight;
        this._zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availableWidth / width, availableHeight / height, 1)));
        this._applyTransform();
    }

    private _rotateImage(): void {
        if (!this._mediaElement) return;
        this._rotation = (this._rotation + 90) % 360;
        if (this._fitToViewer) this._applyFit();
        else this._applyTransform();
    }

    private _applyTransform(): void {
        if (!this._mediaElement) return;
        const rotated = this._rotation % 180 !== 0;
        const scaledWidth = (rotated ? this._mediaHeight : this._mediaWidth) * this._zoom;
        const scaledHeight = (rotated ? this._mediaWidth : this._mediaHeight) * this._zoom;
        this._stage.style.width = `${scaledWidth}px`;
        this._stage.style.height = `${scaledHeight}px`;
        this._mediaElement.style.width = `${this._mediaWidth}px`;
        this._mediaElement.style.height = `${this._mediaHeight}px`;
        this._mediaElement.style.transform = `translate(-50%, -50%) rotate(${this._rotation}deg) scale(${this._zoom})`;
        this._mediaElement.style.left = "50%";
        this._mediaElement.style.top = "50%";
    }

    private _updateMetadata(): void {
        const dimensions = `${this._mediaWidth} × ${this._mediaHeight}px`;
        const pages = this._tiffFrames.length > 1 ? ` · ${this._tiffFrames.length} páginas` : "";
        this._metadataSpan.textContent = `${friendlyFormatName(this._format)} · ${dimensions}${pages}`;
    }

    private _download(): void {
        if (!this._sourceUrl) return;
        const anchor = document.createElement("a");
        anchor.href = this._sourceUrl;
        anchor.download = this._lastFileName || `imagen.${this._format === "jpeg" ? "jpg" : this._format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    private _openInNewTab(): void {
        const previewUrl = this._getPreviewUrl();
        if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
    }

    private _print(): void {
        const previewUrl = this._getPreviewUrl();
        if (!previewUrl) return;
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const doc = printWindow.document;
        doc.title = this._lastFileName || "Imagen";
        const style = doc.createElement("style");
        style.textContent = "html,body{margin:0;min-height:100%;display:grid;place-items:center;background:#fff}img{max-width:100%;max-height:100vh;object-fit:contain}";
        const image = doc.createElement("img");
        image.alt = this._lastFileName || "Imagen";
        image.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
        image.src = previewUrl;
        doc.head.appendChild(style);
        doc.body.appendChild(image);
    }

    private _getPreviewUrl(): string {
        if (this._mediaElement instanceof HTMLCanvasElement) {
            return this._mediaElement.toDataURL("image/png");
        }
        return this._displayUrl || this._sourceUrl;
    }

    private _toggleFullscreen(): void {
        if (!document.fullscreenElement) {
            this._mainContainer.requestFullscreen?.().catch(() => undefined);
        } else {
            document.exitFullscreen?.().catch(() => undefined);
        }
    }

    private _showEmptyState(): void {
        this._resetDocumentState();
        this._metadataSpan.textContent = "Sin archivo";
        this._setActionsEnabled(false);
        this._pageControls.style.display = "none";
        this._showState(ICONS.image, "No hay imagen para mostrar", "Asigna contenido Base64 para visualizarla.", "empty");
    }

    private _showError(message: string): void {
        this._clearStage();
        this._setActionsEnabled(Boolean(this._sourceUrl));
        this._pageControls.style.display = "none";
        this._metadataSpan.textContent = "Error de lectura";
        this._showState("!", "No se pudo mostrar el archivo", message, "error");
    }

    private _showState(icon: string, title: string, message: string, kind: "empty" | "error"): void {
        const state = document.createElement("div");
        state.className = `image-state image-state-${kind}`;
        const iconElement = document.createElement("div");
        iconElement.className = "image-state-icon";
        iconElement.innerHTML = icon;
        const titleElement = document.createElement("strong");
        titleElement.textContent = title;
        const messageElement = document.createElement("span");
        messageElement.textContent = message;
        state.append(iconElement, titleElement, messageElement);
        this._stage.appendChild(state);
    }

    private _setActionsEnabled(enabled: boolean): void {
        this._actionButtons.forEach((button) => {
            button.disabled = !enabled;
        });
    }

    private _clearStage(): void {
        this._stage.replaceChildren();
        this._stage.removeAttribute("style");
        this._mediaElement = null;
    }

    private _resetDocumentState(): void {
        this._clearStage();
        this._revokeUrls();
        this._sourceBlob = null;
        this._format = "unknown";
        this._tiffBuffer = null;
        this._tiffFrames = [];
        this._pageIndex = 0;
        this._mediaWidth = 0;
        this._mediaHeight = 0;
        this._zoom = 1;
        this._rotation = 0;
        this._fitToViewer = true;
    }

    private _revokeUrls(): void {
        const urls = new Set([this._sourceUrl, this._displayUrl]);
        urls.forEach((url) => {
            if (url) URL.revokeObjectURL(url);
        });
        this._sourceUrl = "";
        this._displayUrl = "";
    }
}
