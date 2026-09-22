import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const exec = promisify(execFile);
const processOptions = { env: { PATH: process.env.PATH, LANG: 'C.UTF-8' }, maxBuffer: 65536 };

export const MAX_PAGES = 10;
export const MAX_BYTES = 10 * 1024 * 1024;
export const documentDir = (config, id) => join(config.dataDir, 'documents', id);

// Rebuild from rasterized pages: uploaded scripts, attachments, links, and
// forms never reach a reviewer's browser or the fax provider. Fax is
// black-and-white, so pages render in grayscale. Poppler runs without a shell.
// When coverPage is set, a cover sheet is rendered as page 1 (it counts as a
// transmitted page) so "what you review is what transmits" holds for every page.
export async function prepareDocument(config, id, buffer, { coverPage = false, faxNumber = '', businessName = 'FaxSend' } = {}) {
  if (!buffer?.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw Object.assign(new Error('Upload a valid PDF document.'), { status: 400 });
  const dir = documentDir(config, id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const input = join(dir, 'upload.pdf');
  await writeFile(input, buffer, { mode: 0o600 });
  try {
    const { stdout } = await exec('pdfinfo', [input], { ...processOptions, timeout: 10000 });
    const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (/^Encrypted:\s+yes/m.test(stdout)) throw new Error('Password-protected PDFs are not supported.');
    if (!pages || pages > MAX_PAGES) throw new Error(`Your PDF must contain 1–${MAX_PAGES} pages.`);
    // Rasterize document pages to temporary names; final 1-based numbering
    // happens below so an optional cover sheet becomes page 1.
    for (let n = 1; n <= pages; n++) {
      await exec('pdftoppm', ['-f', String(n), '-l', String(n), '-singlefile',
        '-r', '200', '-gray', '-png', input, join(dir, `doc-${n}`)],
        { ...processOptions, timeout: 20000 });
    }
    const print = await PDFDocument.create();
    let n = 1;
    const addPngPage = async pngPath => {
      const target = join(dir, `page-${n}.png`);
      await rename(pngPath, target);
      const image = await print.embedPng(await readFile(target));
      const page = print.addPage([612, 792]);
      const scale = Math.min(612 / image.width, 792 / image.height);
      const width = image.width * scale, height = image.height * scale;
      page.drawImage(image, { x: (612 - width) / 2, y: (792 - height) / 2, width, height });
      n++;
    };
    if (coverPage) {
      const cover = await PDFDocument.create();
      const page = cover.addPage([612, 792]);
      const font = await cover.embedFont(StandardFonts.Helvetica);
      [`${businessName} — fax cover sheet`, `To: ${faxNumber}`,
       `Date: ${new Date().toISOString().slice(0, 10)}`]
        .forEach((line, i) => page.drawText(line, { x: 72, y: 700 - i * 28, size: 16, font }));
      const coverPath = join(dir, 'cover.pdf');
      await writeFile(coverPath, await cover.save(), { mode: 0o600 });
      await exec('pdftoppm', ['-singlefile', '-r', '200', '-gray', '-png', coverPath, join(dir, 'cover')],
        { ...processOptions, timeout: 20000 });
      await rm(coverPath);
      await addPngPage(join(dir, 'cover.png'));
    }
    for (let d = 1; d <= pages; d++) await addPngPage(join(dir, `doc-${d}.png`));
    await writeFile(join(dir, 'print.pdf'), await print.save(), { mode: 0o600 });
    await rm(input);
    return n - 1; // total transmitted pages, cover sheet included
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (error.code === 'ENOENT') throw new Error('Poppler is missing. Install poppler-utils.');
    const safe = ['Password-protected PDFs are not supported.', `Your PDF must contain 1–${MAX_PAGES} pages.`];
    throw Object.assign(
      new Error(safe.includes(error.message) ? error.message : 'This PDF could not be prepared. Export a new PDF and try again.'),
      { status: 400 });
  }
}
