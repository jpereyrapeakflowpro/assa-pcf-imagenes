import { describe, expect, it } from "vitest";
import * as UTIF from "utif";
import {
    decodeImageInput,
    detectImageFormat,
    formatFromExtension,
    formatFromMime,
} from "../Base64ImageViewer/image-utils";

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

describe("image format detection", () => {
    it.each([
        [new Uint8Array([0x49, 0x49, 0x2a, 0x00]), "tiff"],
        [new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]), "tiff"],
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
        [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "jpeg"],
        [new TextEncoder().encode("GIF89a"), "gif"],
        [new TextEncoder().encode("RIFF0000WEBP"), "webp"],
        [new TextEncoder().encode("BM"), "bmp"],
        [new Uint8Array([0x00, 0x00, 0x01, 0x00]), "ico"],
        [new TextEncoder().encode("<?xml version='1.0'?><svg viewBox='0 0 1 1'/>") , "svg"],
    ])("detects %s as %s", (bytes, format) => {
        expect(detectImageFormat(bytes as Uint8Array)).toBe(format);
    });

    it("detects extension and MIME aliases", () => {
        expect(formatFromExtension("scan.TIF?download=1")).toBe("tiff");
        expect(formatFromExtension("photo.jfif")).toBe("jpeg");
        expect(formatFromMime("image/x-tiff; charset=binary")).toBe("tiff");
    });
});

describe("Base64 input decoding", () => {
    it("accepts raw and data URL Base64", () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const raw = decodeImageInput(toBase64(png), "image.bin");
        const dataUrl = decodeImageInput(`data:image/png;base64,${toBase64(png)}`);

        expect(raw.format).toBe("png");
        expect(raw.mimeType).toBe("image/png");
        expect(dataUrl.bytes).toEqual(png);
    });

    it("accepts URL-safe Base64 without padding", () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
        const urlSafe = toBase64(jpeg).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        expect(decodeImageInput(urlSafe, "photo.jpg").format).toBe("jpeg");
    });

    it("rejects malformed Base64", () => {
        expect(() => decodeImageInput("%%%", "bad.png")).toThrow(/Base64/);
    });
});

describe("TIFF integration", () => {
    it("decodes pixels encoded by UTIF", () => {
        const rgba = new Uint8Array([
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 255, 255, 255,
        ]);
        const encoded = new Uint8Array(UTIF.encodeImage(rgba, 2, 2));
        const input = decodeImageInput(toBase64(encoded), "sample.tiff");
        const buffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
        const frames = UTIF.decode(buffer);

        expect(input.format).toBe("tiff");
        expect(frames).toHaveLength(1);
        UTIF.decodeImage(buffer, frames[0]);
        expect(frames[0].width).toBe(2);
        expect(frames[0].height).toBe(2);
        expect(UTIF.toRGBA8(frames[0])).toHaveLength(16);
    });

    it("discovers and decodes multiple TIFF pages", () => {
        const width = 2;
        const height = 1;
        const firstPixels = new Uint8Array([255, 0, 0, 255, 255, 255, 255, 255]);
        const secondPixels = new Uint8Array([0, 0, 255, 255, 0, 255, 0, 255]);
        const makeIfd = (offset: number) => ({
            t256: [width],
            t257: [height],
            t258: [8, 8, 8, 8],
            t259: [1],
            t262: [2],
            t273: [offset],
            t277: [4],
            t278: [height],
            t279: [width * height * 4],
            t284: [1],
            t338: [1],
        }) as unknown as UTIF.IFD;

        const firstOffset = 2000;
        const secondOffset = 3000;
        const header = new Uint8Array(UTIF.encode([makeIfd(firstOffset), makeIfd(secondOffset)]));
        const multipage = new Uint8Array(secondOffset + secondPixels.length);
        multipage.set(header);
        multipage.set(firstPixels, firstOffset);
        multipage.set(secondPixels, secondOffset);

        const frames = UTIF.decode(multipage.buffer);
        expect(frames).toHaveLength(2);
        UTIF.decodeImage(multipage.buffer, frames[0]);
        expect(Array.from(UTIF.toRGBA8(frames[0]))).toEqual(Array.from(firstPixels));
        delete (frames[0] as Partial<UTIF.IFD>).data;
        UTIF.decodeImage(multipage.buffer, frames[1]);
        expect(Array.from(UTIF.toRGBA8(frames[1]))).toEqual(Array.from(secondPixels));
    });
});
