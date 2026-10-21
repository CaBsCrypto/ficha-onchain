import { deflateSync } from 'node:zlib';

// Deterministic, legible synthetic documents. No real clinical or personal data.
export function syntheticClinicalPdf(version) {
  if (![1, 2].includes(version)) throw Error('clinical_fixture_invalid');
  const lines = ['TrustLeaf - Synthetic clinical fixture', 'Stellar Testnet - NOT FOR CLINICAL USE',
    `Document version: ${version}`, 'Example examination attachment',
    version === 1 ? 'Example date: 2026-10-01' : 'Corrected example date: 2026-10-02',
    'This file contains invented data for technical validation only.',
    'Earlier versions remain available. No real patient is represented.'];
  const commands = 'BT /F1 18 Tf 50 780 Td ' + lines.map((s, i) => `${i ? '0 -38 Td ' : ''}(${s}) Tj`).join('\n') + ' ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`];
  let text = '%PDF-1.4\n% SYNTHETIC TESTNET\n'; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type); const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}
const font = {
  A:['01110','10001','10001','11111','10001','10001','10001'], C:['01111','10000','10000','10000','10000','10000','01111'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  H:['10001','10001','10001','11111','10001','10001','10001'], I:['11111','00100','00100','00100','00100','00100','11111'],
  L:['10000','10000','10000','10000','10000','10000','11111'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], Y:['10001','10001','01010','00100','00100','00100','00100'],
  X:['10001','10001','01010','00100','01010','10001','10001'], M:['10001','11011','10101','10101','10001','10001','10001'],
};
export function syntheticClinicalImage() {
  const width = 1200, height = 650, stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height, 255);
  for (let y = 0; y < height; y++) pixels[y * stride] = 0;
  const rect = (x0, y0, w, h, rgb) => {
    for (let y = y0; y < Math.min(height, y0 + h); y++) for (let x = x0; x < Math.min(width, x0 + w); x++)
      rgb.forEach((v, i) => { pixels[y * stride + 1 + x * 3 + i] = v; });
  };
  rect(0, 0, width, 14, [0, 161, 235]); rect(35, 45, 1130, 560, [234, 247, 255]);
  for (const [label, top] of [['TRUSTLEAF', 90], ['SYNTHETIC EXAM', 215], ['TESTNET', 340], ['NOT CLINICAL', 465]]) {
    [...label].forEach((c, j) => (font[c] ?? []).forEach((line, row) => [...line].forEach((p, col) => {
      if (p === '1') rect(70 + j * 60 + col * 9, top + row * 9, 9, 9, [17, 53, 76]);
    })));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
