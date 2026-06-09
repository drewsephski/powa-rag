/**
 * Local PDF text extraction fallback using pdfjs-dist.
 *
 * Used when Powabase's extraction doesn't produce text content
 * (e.g., Google-Docs-generated PDFs without a direct text layer
 * that fitz/pdfplumber can parse, or when derivatives point to
 * the wrong storage path).
 *
 * Requires @napi-rs/canvas to polyfill browser APIs (DOMMatrix,
 * Path2D, ImageData) that pdfjs-dist expects at module init.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

/**
 * Extract text from a PDF buffer using pdfjs-dist.
 *
 * Uses the legacy build (Node.js compatible) with:
 * - @napi-rs/canvas polyfilling browser APIs
 * - useSystemFonts + disableFontFace for server-side extraction
 * - No worker needed for text-only extraction
 *
 * @returns The extracted text, or null if extraction failed entirely.
 */
export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      // @napi-rs/canvas automatically polyfills DOMMatrix, Path2D, ImageData
      // needed by pdfjs-dist's module init. No manual setup required.
    }).promise

    const parts: string[] = []

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")

      if (pageText.trim()) {
        parts.push(pageText.trim())
      }

      page.cleanup()
    }

    doc.destroy()

    if (parts.length === 0) return null
    return parts.join("\n\n")
  } catch (err) {
    console.error("PDF.js fallback extraction failed:", err)
    return null
  }
}
