import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const exec = promisify(execFile);
const processOptions = { env: { PATH: process.env.PATH, LANG: 'C.UTF-8' }, maxBuffer: 65536 };
export const MAX_PAGES = 5;
export const MAX_BYTES = 10 * 1024 * 1024;
export const documentDir = (config, id) => join(config.dataDir, 'documents', id);

// Rebuild from rasterized pages: uploaded scripts, attachments, links, and forms
// never reach a user's browser or the printer. Poppler runs without a shell.
export async function prepareDocument(config, id, buffer) {
  if (!buffer?.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Object.assign(new Error('Upload a valid PDF document.'), { status: 400 });
  const dir = documentDir(config, id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const input = join(dir, 'upload.pdf');
  await writeFile(input, buffer, { mode: 0o600 });
  try {
    const { stdout } = await exec('pdfinfo', [input], { ...processOptions, timeout: 10000 });
    const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (/^Encrypted:\s+yes/m.test(stdout)) throw new Error('Password-protected PDFs are not supported.');
    if (!pages || pages > MAX_PAGES) throw new Error(`Your PDF must contain 1–${MAX_PAGES} pages.`);
    const pdf = await PDFDocument.create();
    for (let n = 1; n <= pages; n++) {
      await exec('pdftoppm', ['-f', String(n), '-l', String(n), '-singlefile', '-scale-to', '2200', '-gray', '-png', input, join(dir, `page-${n}`)], { ...processOptions, timeout: 20000 });
      const image = await pdf.embedPng(await readFile(join(dir, `page-${n}.png`)));
      const page = pdf.addPage([612, 792]);
      // Keep a quarter-inch safe margin on all sides of US Letter paper.
      const scale = Math.min(576 / image.width, 756 / image.height);
      const width = image.width * scale, height = image.height * scale;
      page.drawImage(image, { x: (612 - width) / 2, y: (792 - height) / 2, width, height });
    }
    await writeFile(join(dir, 'print.pdf'), await pdf.save(), { mode: 0o600 });
    await rm(input);
    return pages;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (error.code === 'ENOENT') throw new Error('Poppler is missing. Install poppler-utils.');
    const safe = ['Password-protected PDFs are not supported.', `Your PDF must contain 1–${MAX_PAGES} pages.`];
    throw Object.assign(new Error(safe.includes(error.message) ? error.message : 'This PDF could not be prepared. Export a new PDF and try again.'), { status: 400 });
  }
}
