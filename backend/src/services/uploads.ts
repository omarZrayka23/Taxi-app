import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

export const uploadRoot = path.resolve(config.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function makeUploader(allowed: string[]) {
  return multer({
    storage: multer.diskStorage({
      destination: uploadRoot,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXT_BY_MIME[file.mimetype]}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 6 },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(badRequest('UNSUPPORTED_FILE', `File type ${file.mimetype} is not allowed`));
    },
  });
}

/** Images and PDFs (identity documents). */
export const documentUpload = makeUploader(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
/** Images only (car photos). */
export const photoUpload = makeUploader(['image/jpeg', 'image/png', 'image/webp']);

export const publicUrl = (file: Express.Multer.File) => `/uploads/${file.filename}`;

export function removeUpload(url: string) {
  if (!url.startsWith('/uploads/')) return;
  const file = path.join(uploadRoot, path.basename(url));
  fs.promises.unlink(file).catch(() => undefined);
}
