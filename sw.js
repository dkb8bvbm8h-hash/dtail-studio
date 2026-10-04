/* D-Tail intentionally disables the old cache layer until the multi-device cloud build is fully stabilized. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.toLowerCase().startsWith('dtail')).map(k=>caches.delete(k)));
      await self.registration.unregister();
    }catch(e){}
    await self.clients.claim();
  })());
});
