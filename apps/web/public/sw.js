const CACHE='vocabularium-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/')).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vocabularium-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.includes('signin')||url.pathname.includes('signout')||event.request.headers.get('RSC'))return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'&&new URL(response.url).pathname==='/'){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put('/',copy));}return response;}).catch(()=>caches.match('/').then(response=>response??Response.error())));
 }else if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/_next/')){
  event.respondWith(caches.match(event.request).then(cached=>cached??fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
 }
});
