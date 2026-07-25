export interface CdseConfig {
  configured: boolean
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
}

/** Server-only CDSE S3 settings from process.env (never expose secrets to UI). */
export function getCdseConfig(): CdseConfig {
  const accessKey = (process.env.CDSE_S3_ACCESS_KEY ?? '').trim()
  const secretKey = (process.env.CDSE_S3_SECRET_KEY ?? '').trim()
  const endpoint = (
    process.env.CDSE_S3_ENDPOINT ?? 'https://eodata.dataspace.copernicus.eu'
  ).replace(/\/$/, '')
  const bucket = (process.env.CDSE_S3_BUCKET ?? 'eodata').trim() || 'eodata'

  return {
    configured: Boolean(accessKey && secretKey),
    endpoint,
    bucket,
    accessKey,
    secretKey,
  }
}
