const url = new URL(process.env.VOCABULARIUM_API_URL ?? 'http://127.0.0.1:4318');
const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Use an HTTPS server origin, or HTTP localhost for development, without credentials, path, or query.');
}

export const serverOrigin = url.origin;
export const hostPermission = `${url.protocol}//${url.hostname}/*`;
