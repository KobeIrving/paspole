/* กองเสา 3D — service worker
 * The app opens from the copy kept on the phone; a new index.html on GitHub is fetched in the background,
 * offered as a reload while the app is open, and used on the next open anyway. Versioned libraries and icons
 * are kept on the phone too.
 * Data from Google Sheet is never cached here: it always comes live from the script. */
var CACHE = "pole-pile-v1";
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
var LIBS = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                                  // writes to the sheet go straight out
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // own files: the copy on the phone first, so the app opens at once even on a weak signal; the newest file is
    // fetched behind it and kept for next time. If the page itself changed, the open app is told (it offers a reload).
    var page = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
    var net = fetch(req).then(function (res) {
      if (!res.ok) return res;
      var copy = res.clone(), body = res.clone();
      return caches.open(CACHE).then(function (c) {
        return c.match(req, { ignoreSearch: page }).then(function (old) {
          var check = old && page ? Promise.all([old.text(), body.text()]).then(function (t) { return t[0] !== t[1]; }) : Promise.resolve(false);
          return check.then(function (changed) {
            return c.put(page ? "./index.html" : req, copy).then(function () { if (changed) tell(); });
          });
        });
      }).catch(function () {}).then(function () { return res; });
    });
    e.waitUntil(net.catch(function () {}));
    e.respondWith(caches.match(page ? "./index.html" : req).then(function (hit) {
      return hit || net.catch(function () { return caches.match("./index.html"); });
    }));
    return;
  }
  if (LIBS.test(req.url)) {
    // pinned library versions and fonts never change: phone copy first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok || res.type === "opaque") { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
  }
  // anything else (Google Apps Script, Gemini) is left alone
});

function tell() {
  self.clients.matchAll({ type: "window" }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: "updated" }); }); });
}
