import JSZip from 'jszip';
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';

// Server-side only. Manipulates the raw OOXML inside a .docx so the AI can
// change paragraph TEXT while every Word style, font, margin, and spacing
// stays byte-for-byte identical to the uploaded base resume.

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface DocxParagraph {
  index: number;
  style: string;
  text: string;
  editable: boolean;
}

async function loadDocumentXml(docxBuffer: Buffer): Promise<{ zip: JSZip; doc: Document }> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const file = zip.file('word/document.xml');
  if (!file) {
    throw new Error('Invalid .docx file — missing word/document.xml');
  }
  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return { zip, doc };
}

function getParagraphElements(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
}

function getParagraphStyle(p: Element): string {
  const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (!pPr) return 'Normal';
  const pStyle = pPr.getElementsByTagNameNS(W_NS, 'pStyle')[0];
  if (!pStyle) return 'Normal';
  return pStyle.getAttribute('w:val') || 'Normal';
}

function getTextRuns(p: Element): Element[] {
  const runs = Array.from(p.getElementsByTagNameNS(W_NS, 'r'));
  return runs.filter((r) => r.getElementsByTagNameNS(W_NS, 't').length > 0);
}

function getParagraphText(p: Element): string {
  return getTextRuns(p)
    .flatMap((r) => Array.from(r.getElementsByTagNameNS(W_NS, 't')))
    .map((t) => t.textContent || '')
    .join('');
}

/** Reads the base resume's paragraph structure — what the AI is allowed to edit. */
export async function extractParagraphs(docxBuffer: Buffer): Promise<DocxParagraph[]> {
  const { doc } = await loadDocumentXml(docxBuffer);
  return getParagraphElements(doc).map((p, index) => {
    const text = getParagraphText(p);
    return {
      index,
      style: getParagraphStyle(p),
      text,
      editable: getTextRuns(p).length > 0 && text.trim().length > 0,
    };
  });
}

/**
 * Rebuilds a .docx from the ORIGINAL template, replacing only the text inside
 * existing paragraphs. `newTexts[i]` becomes paragraph i's full text; entries
 * equal to the original (or paragraphs with no editable run) are left
 * untouched. No paragraph is ever added, removed, or reordered.
 */
export async function buildTailoredDocx(originalDocxBuffer: Buffer, newTexts: string[]): Promise<Buffer> {
  const { zip, doc } = await loadDocumentXml(originalDocxBuffer);
  const paragraphs = getParagraphElements(doc);

  paragraphs.forEach((p, index) => {
    const newText = newTexts[index];
    if (newText === undefined) return;

    const originalText = getParagraphText(p);
    if (newText === originalText) return;

    const runs = getTextRuns(p);
    if (runs.length === 0) return; // empty/spacer paragraph — never inject text here

    const [firstRun, ...restRuns] = runs;
    const firstT = firstRun.getElementsByTagNameNS(W_NS, 't')[0];
    firstT.setAttribute('xml:space', 'preserve');
    while (firstT.firstChild) firstT.removeChild(firstT.firstChild);
    firstT.appendChild(doc.createTextNode(newText));

    // Clear (don't remove) any other text runs in the same paragraph so old
    // content doesn't linger alongside the new text.
    restRuns.forEach((run) => {
      Array.from(run.getElementsByTagNameNS(W_NS, 't')).forEach((t) => {
        while (t.firstChild) t.removeChild(t.firstChild);
      });
    });
  });

  const newXml = new XMLSerializer().serializeToString(doc);
  zip.file('word/document.xml', newXml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}
