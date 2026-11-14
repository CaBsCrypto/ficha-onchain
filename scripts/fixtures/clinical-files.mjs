/** Valid synthetic file fixtures; never real clinical content. */
export function syntheticPdf(text = 'SYNTHETIC TEST ONLY', byteLength) {
  const safe = String(text).replace(/[\\()\r\n]/g, ' ');
  const stream = `BT /F1 10 Tf 10 40 Td (${safe}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  const build = padding => {
    let body = '%PDF-1.7\n' + (padding ? '%' + ' '.repeat(padding - 2) + '\n' : '');
    const offsets = objects.map((value, i) => { const offset = Buffer.byteLength(body); body += `${i + 1} 0 obj\n${value}\nendobj\n`; return offset; });
    const xref = Buffer.byteLength(body);
    body += `xref\n0 6\n0000000000 65535 f \n` + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
    return Buffer.from(body + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  };
  if (byteLength === undefined) return build(0);
  let padding = byteLength - build(0).length;
  if (padding < 2) throw Error('synthetic_pdf_target_too_small');
  for (let attempt = 0; attempt < 8; attempt++) { const bytes = build(padding); if (bytes.length === byteLength) return bytes; padding += byteLength - bytes.length; }
  throw Error('synthetic_pdf_size_mismatch');
}
