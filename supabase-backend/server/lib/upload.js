const crypto = require('crypto');
const { db } = require('./db');
const { err } = require('./mw');
// Identify the real file type from its first bytes (never trust file extension or MIME header).
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}
async function saveImage(bucket, folder, b64) {
  const buf = Buffer.from(String(b64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw err(400, 'Image is missing or larger than 3MB.');
  const t = sniff(buf);
  if (!t) throw err(400, 'Only JPG, PNG or WebP images are allowed.');
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const path = `${folder}/${sha.slice(0, 16)}-${Date.now()}.${t.ext}`;
  const { error } = await db().storage.from(bucket).upload(path, buf, { contentType: t.mime });
  if (error) throw error;
  return { path, sha, url: db().storage.from(bucket).getPublicUrl(path).data.publicUrl };
}
// Private documents: images or PDF, up to 3MB (Vercel limits request bodies to ~4.5MB)
async function saveFile(bucket, folder, b64) {
  const buf = Buffer.from(String(b64 || '').replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw err(400, 'File is missing or larger than 3MB.');
  const t = buf.subarray(0, 5).toString() === '%PDF-' ? { ext: 'pdf', mime: 'application/pdf' } : sniff(buf);
  if (!t) throw err(400, 'Only PDF, JPG, PNG or WebP files are allowed.');
  const path = `${folder}/${crypto.randomBytes(8).toString('hex')}-${Date.now()}.${t.ext}`;
  const { error } = await db().storage.from(bucket).upload(path, buf, { contentType: t.mime });
  if (error) throw error; return { path, mime: t.mime, size: buf.length };
}
module.exports = { sniff, saveImage, saveFile };
