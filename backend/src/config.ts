import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  routingProvider: (process.env.ROUTING_PROVIDER ?? 'haversine') as 'haversine' | 'osrm' | 'google',
  osrmUrl: process.env.OSRM_URL ?? 'https://router.project-osrm.org',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
};
