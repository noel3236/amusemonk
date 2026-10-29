import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

// Raw uploads and exports. S3 in production (credentials from the EC2 instance role), a local folder in
// development and tests. S3 is our own AWS storage, reached directly — not a gateway call, so not via the VPN.
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const schema = z.discriminatedUnion('STORAGE_DRIVER', [
  z.object({ STORAGE_DRIVER: z.literal('s3'), S3_BUCKET: z.string().min(3), AWS_REGION: z.string().min(1) }),
  z.object({ STORAGE_DRIVER: z.literal('local'), LOCAL_STORAGE_DIR: z.string().default('.storage') }),
]);

function s3Storage(bucket: string, region: string): Storage {
  const client = new S3Client({ region });
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' })
      );
    },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
}

function localStorage(dir: string): Storage {
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);
  const resolve = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error(`storage key escapes the storage dir: ${key}`);
    return p;
  };
  return {
    async put(key, body) {
      const p = resolve(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body, { flag: 'wx' });
    },
    async get(key) {
      return readFile(resolve(key));
    },
  };
}

let cached: Storage | undefined;

export function storage(): Storage {
  if (!cached) {
    const c = schema.parse(process.env);
    cached = c.STORAGE_DRIVER === 's3' ? s3Storage(c.S3_BUCKET, c.AWS_REGION) : localStorage(c.LOCAL_STORAGE_DIR);
  }
  return cached;
}

export function uploadKey(userId: string, attemptId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'upload';
  return `uploads/${userId}/${attemptId}/${safe}`;
}
