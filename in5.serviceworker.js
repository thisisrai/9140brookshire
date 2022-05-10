let cacheName;
let assets = [];
let cached = false;

function getHash(text) {
  var hash = 0,
    i,
    chr;
  for (i = 0; i < text.length; i++) {
    chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; /*Convert to 32bit int*/
  }
  return "c" + hash.toString();
}

function parseManifest(rawManifest) {
  const cache = ["/"];
  const trimmedLines = rawManifest.split(/\r|\n/).map(function (line) {
    return line.trim();
  });
  for (const line of trimmedLines) {
    if (line.startsWith("CACHE MANIFEST") || line.startsWith("#") || line === "") {
      continue;
    }
    if (line.endsWith(":")) {
      break;
    }
    cache.push("assets/" + line);
  }
  return cache;
}

async function getManifest() {
  const manifestUrl = new URL("assets/manifest.appcache", location.href).href;
  const init = {
    cache: "reload", // always get uncached version of manifest
    credentials: "include",
    headers: [["X-Use-Fetch", "true"]],
  };
  const manifestRequest = new Request(manifestUrl, init);
  const manifestResponse = await fetch(manifestRequest);
  const manifestContents = await manifestResponse.text();
  return { manifestUrl, manifestContents };
}

async function cacheAssets() {
  const { manifestUrl, manifestContents } = await getManifest();
  const newCacheName = getHash(manifestUrl + manifestContents);
  if (newCacheName === cacheName) return; /*manifest did not change*/
  cacheName = newCacheName;
  assets = parseManifest(manifestContents);
  return addCache(assets);
}

function addCache(cacheAssets) {
  return caches.open(cacheName).then(function (cache) {
    return Promise.all(
      cacheAssets.map(function (url) {
        return cache.add(url).catch(function (reason) {
            console.warn([url + "failed: " + String(reason)]);
        });
      })
    );
});
}

function removeCache() {
  return caches.keys().then(function (cacheNames) {
    return Promise.all(
      cacheNames.map(function (cache) {
        if (cache !== cacheName) {
          return caches.delete(cache);
        }
      })
    );
  });
}

self.addEventListener("install", function (e) {
  e.waitUntil(
    cacheAssets().then(function () {
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(removeCache());
});

self.addEventListener("fetch", function (e) {
  e.respondWith(
    caches.match(e.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(e.request);
    })
  );

  /*check for update only once per page load*/
  if (!cached || e.request.url.includes(assets[1])) {
    cached = true;
    e.waitUntil(
      cacheAssets().then(function () {
        removeCache();
      })
    );
  }
});
