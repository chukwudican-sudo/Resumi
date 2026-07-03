import JSZip from 'jszip';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';

// Server-side only. Reads the raw OOXML inside a .docx to pull out paragraph
// text, so a .docx Source Resume can be handed to Claude as plain content for
// resume-structure extraction.

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
