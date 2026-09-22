export function appOrigin(req: Request) {
  const value = process.env.APP_ORIGIN;
  if (value) return new URL(value).origin;
  if (process.env.NODE_ENV === 'production') throw new Error('Configura APP_ORIGIN para el servidor.');
  return new URL(req.url).origin;
}
export function secureCookie(req: Request) { return appOrigin(req).startsWith('https://'); }
