import {
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3'
import { getCdseConfig } from './cdseConfig'

let client: S3Client | null = null

function getClient(): S3Client {
  const cfg = getCdseConfig()
  if (!cfg.configured) {
    throw new Error('CDSE S3 credentials not configured')
  }
  if (!client) {
    client = new S3Client({
      region: 'default',
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    })
  }
  return client
}

/** Reset cached client after env reload (tests / hot reload). */
export function resetCdseClient(): void {
  client = null
}

export async function listCdsePrefix(
  prefix: string,
  maxKeys = 40,
): Promise<{
  prefix: string
  bucket: string
  commonPrefixes: string[]
  objects: Array<{ key: string; size: number; lastModified: string | null }>
}> {
  const cfg = getCdseConfig()
  const s3 = getClient()
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: Math.min(100, Math.max(1, maxKeys)),
    }),
  )

  const objects = (result.Contents ?? [])
    .filter((o): o is _Object & { Key: string } => Boolean(o.Key))
    .map((o) => ({
      key: o.Key,
      size: o.Size ?? 0,
      lastModified: o.LastModified?.toISOString() ?? null,
    }))

  const commonPrefixes = (result.CommonPrefixes ?? [])
    .map((p) => p.Prefix)
    .filter((p): p is string => Boolean(p))

  return {
    prefix,
    bucket: cfg.bucket,
    commonPrefixes,
    objects,
  }
}

/** Singapore AO–relevant Sentinel-2 prefixes for ops reconnaissance. */
export const CDSE_DEFAULT_PREFIXES = [
  'Sentinel-2/',
  'Sentinel-1/',
  'Global-Mosaics/',
] as const
