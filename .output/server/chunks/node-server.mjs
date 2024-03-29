globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import 'node-fetch-native/polyfill';
import { Server as Server$1 } from 'http';
import { Server } from 'https';
import destr from 'destr';
import { defineEventHandler, handleCacheHeaders, createEvent, eventHandler, createError, createApp, createRouter, lazyEventHandler } from 'h3';
import { createFetch as createFetch$1, Headers } from 'ohmyfetch';
import { createRouter as createRouter$1 } from 'radix3';
import { createCall, createFetch } from 'unenv/runtime/fetch/index';
import { createHooks } from 'hookable';
import { snakeCase } from 'scule';
import { hash } from 'ohash';
import { parseURL, withQuery, withLeadingSlash, withoutTrailingSlash, joinURL } from 'ufo';
import { createStorage } from 'unstorage';
import { promises } from 'fs';
import { dirname, resolve } from 'pathe';
import { fileURLToPath } from 'url';

const _runtimeConfig = {"app":{"baseURL":"/","buildAssetsDir":"/_nuxt/","cdnURL":""},"nitro":{"routes":{},"envPrefix":"NUXT_"},"public":{}};
const ENV_PREFIX = "NITRO_";
const ENV_PREFIX_ALT = _runtimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_";
const getEnv = (key) => {
  const envKey = snakeCase(key).toUpperCase();
  return destr(process.env[ENV_PREFIX + envKey] ?? process.env[ENV_PREFIX_ALT + envKey]);
};
function isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function overrideConfig(obj, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey);
    if (isObject(obj[key])) {
      if (isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
      }
      overrideConfig(obj[key], subKey);
    } else {
      obj[key] = envValue ?? obj[key];
    }
  }
}
overrideConfig(_runtimeConfig);
const config = deepFreeze(_runtimeConfig);
const useRuntimeConfig = () => config;
function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

const globalTiming = globalThis.__timing__ || {
  start: () => 0,
  end: () => 0,
  metrics: []
};
function timingMiddleware(_req, res, next) {
  const start = globalTiming.start();
  const _end = res.end;
  res.end = (data, encoding, callback) => {
    const metrics = [["Generate", globalTiming.end(start)], ...globalTiming.metrics];
    const serverTiming = metrics.map((m) => `-;dur=${m[1]};desc="${encodeURIComponent(m[0])}"`).join(", ");
    if (!res.headersSent) {
      res.setHeader("Server-Timing", serverTiming);
    }
    _end.call(res, data, encoding, callback);
  };
  next();
}

const _assets = {

};

function normalizeKey(key) {
  if (!key) {
    return "";
  }
  return key.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "");
}

const assets$1 = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
};

const storage = createStorage({});

const useStorage = () => storage;

storage.mount('/assets', assets$1);

const defaultCacheOptions = {
  name: "_",
  base: "/cache",
  swr: true,
  maxAge: 1
};
function defineCachedFunction(fn, opts) {
  opts = { ...defaultCacheOptions, ...opts };
  const pending = {};
  const group = opts.group || "nitro";
  const name = opts.name || fn.name || "_";
  const integrity = hash([opts.integrity, fn, opts]);
  async function get(key, resolver) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    const entry = await useStorage().getItem(cacheKey) || {};
    const ttl = (opts.maxAge ?? opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl;
    const _resolve = async () => {
      if (!pending[key]) {
        entry.value = void 0;
        entry.integrity = void 0;
        entry.mtime = void 0;
        entry.expires = void 0;
        pending[key] = Promise.resolve(resolver());
      }
      entry.value = await pending[key];
      entry.mtime = Date.now();
      entry.integrity = integrity;
      delete pending[key];
      useStorage().setItem(cacheKey, entry).catch((error) => console.error("[nitro] [cache]", error));
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (opts.swr && entry.value) {
      _resolvePromise.catch(console.error);
      return Promise.resolve(entry);
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const key = (opts.getKey || getKey)(...args);
    const entry = await get(key, () => fn(...args));
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
const cachedFunction = defineCachedFunction;
function getKey(...args) {
  return args.length ? hash(args, {}) : "";
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions) {
  const _opts = {
    ...opts,
    getKey: (event) => {
      const url = event.req.originalUrl || event.req.url;
      const friendlyName = decodeURI(parseURL(url).pathname).replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
      const urlHash = hash(url);
      return `${friendlyName}.${urlHash}`;
    },
    group: opts.group || "nitro/handlers",
    integrity: [
      opts.integrity,
      handler
    ]
  };
  const _cachedHandler = cachedFunction(async (incomingEvent) => {
    const reqProxy = cloneWithProxy(incomingEvent.req, { headers: {} });
    const resHeaders = {};
    const resProxy = cloneWithProxy(incomingEvent.res, {
      statusCode: 200,
      getHeader(name) {
        return resHeaders[name];
      },
      setHeader(name, value) {
        resHeaders[name] = value;
        return this;
      },
      getHeaderNames() {
        return Object.keys(resHeaders);
      },
      hasHeader(name) {
        return name in resHeaders;
      },
      removeHeader(name) {
        delete resHeaders[name];
      },
      getHeaders() {
        return resHeaders;
      }
    });
    const event = createEvent(reqProxy, resProxy);
    event.context = incomingEvent.context;
    const body = await handler(event);
    const headers = event.res.getHeaders();
    headers.Etag = `W/"${hash(body)}"`;
    headers["Last-Modified"] = new Date().toUTCString();
    const cacheControl = [];
    if (opts.swr) {
      if (opts.maxAge) {
        cacheControl.push(`s-maxage=${opts.maxAge}`);
      }
      if (opts.staleMaxAge) {
        cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
      } else {
        cacheControl.push("stale-while-revalidate");
      }
    } else if (opts.maxAge) {
      cacheControl.push(`max-age=${opts.maxAge}`);
    }
    if (cacheControl.length) {
      headers["Cache-Control"] = cacheControl.join(", ");
    }
    const cacheEntry = {
      code: event.res.statusCode,
      headers,
      body
    };
    return cacheEntry;
  }, _opts);
  return defineEventHandler(async (event) => {
    const response = await _cachedHandler(event);
    if (event.res.headersSent || event.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["Last-Modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.res.statusCode = response.code;
    for (const name in response.headers) {
      event.res.setHeader(name, response.headers[name]);
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const plugins = [
  
];

function hasReqHeader(req, header, includes) {
  const value = req.headers[header];
  return value && typeof value === "string" && value.toLowerCase().includes(includes);
}
function isJsonRequest(event) {
  return hasReqHeader(event.req, "accept", "application/json") || hasReqHeader(event.req, "user-agent", "curl/") || hasReqHeader(event.req, "user-agent", "httpie/") || event.req.url?.endsWith(".json") || event.req.url?.includes("/api/");
}
function normalizeError(error) {
  const cwd = process.cwd();
  const stack = (error.stack || "").split("\n").splice(1).filter((line) => line.includes("at ")).map((line) => {
    const text = line.replace(cwd + "/", "./").replace("webpack:/", "").replace("file://", "").trim();
    return {
      text,
      internal: line.includes("node_modules") && !line.includes(".cache") || line.includes("internal") || line.includes("new Promise")
    };
  });
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage ?? (statusCode === 404 ? "Route Not Found" : "Internal Server Error");
  const message = error.message || error.toString();
  return {
    stack,
    statusCode,
    statusMessage,
    message
  };
}

const errorHandler = (async function errorhandler(error, event) {
  const { stack, statusCode, statusMessage, message } = normalizeError(error);
  const errorObject = {
    url: event.req.url,
    statusCode,
    statusMessage,
    message,
    stack: "",
    data: error.data
  };
  event.res.statusCode = errorObject.statusCode;
  event.res.statusMessage = errorObject.statusMessage;
  if (error.unhandled || error.fatal) {
    const tags = [
      "[nuxt]",
      "[request error]",
      error.unhandled && "[unhandled]",
      error.fatal && "[fatal]",
      Number(errorObject.statusCode) !== 200 && `[${errorObject.statusCode}]`
    ].filter(Boolean).join(" ");
    console.error(tags, errorObject.message + "\n" + stack.map((l) => "  " + l.text).join("  \n"));
  }
  if (isJsonRequest(event)) {
    event.res.setHeader("Content-Type", "application/json");
    event.res.end(JSON.stringify(errorObject));
    return;
  }
  const isErrorPage = event.req.url?.startsWith("/__nuxt_error");
  let html = !isErrorPage ? await $fetch(withQuery("/__nuxt_error", errorObject)).catch(() => null) : null;
  if (!html) {
    const { template } = await import('./error-500.mjs');
    html = template(errorObject);
  }
  event.res.setHeader("Content-Type", "text/html;charset=UTF-8");
  event.res.end(html);
});

const assets = {
  "/_nuxt/albums_index.32c75e13.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"5b4-gPyKr39UK7zqo6q76nWR5vV6J0Q\"",
    "mtime": "2023-10-22T22:20:55.905Z",
    "size": 1460,
    "path": "../public/_nuxt/albums_index.32c75e13.css"
  },
  "/_nuxt/albums_index.38279740.js": {
    "type": "application/javascript",
    "etag": "\"4de-HmaL+f0W7zVbiQw5ZKkeo5vuw3w\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1246,
    "path": "../public/_nuxt/albums_index.38279740.js"
  },
  "/_nuxt/compositors_index.af5f2e89.js": {
    "type": "application/javascript",
    "etag": "\"4c9-GKejzEFd3P5iV4M2+TG2qLfJwP4\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1225,
    "path": "../public/_nuxt/compositors_index.af5f2e89.js"
  },
  "/_nuxt/compositors_index.c4348479.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"5b3-ug1VwigrFkrjbyfaLAUXbLLpLGw\"",
    "mtime": "2023-10-22T22:20:55.906Z",
    "size": 1459,
    "path": "../public/_nuxt/compositors_index.c4348479.css"
  },
  "/_nuxt/entry.8ccc0e64.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"a6e-t3YevrVC+4xyhqEd7z2Nmqk8E3g\"",
    "mtime": "2023-10-22T22:20:55.906Z",
    "size": 2670,
    "path": "../public/_nuxt/entry.8ccc0e64.css"
  },
  "/_nuxt/entry.c3a144a6.js": {
    "type": "application/javascript",
    "etag": "\"1ef31-UCFjDLDjvF+e5gMBAucHpanJI3c\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 126769,
    "path": "../public/_nuxt/entry.c3a144a6.js"
  },
  "/_nuxt/error-404.0b2d6423.js": {
    "type": "application/javascript",
    "etag": "\"8a3-QIUx69DsExxJTUE3YYVCTUulPGA\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 2211,
    "path": "../public/_nuxt/error-404.0b2d6423.js"
  },
  "/_nuxt/error-404.7729cee9.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"e34-qomFKLEnDzFbIPwCfuxqIb18mQU\"",
    "mtime": "2023-10-22T22:20:55.905Z",
    "size": 3636,
    "path": "../public/_nuxt/error-404.7729cee9.css"
  },
  "/_nuxt/error-500.08851880.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"7a4-PsPGHWWrltFH34P9Q5DnkUTUhRE\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1956,
    "path": "../public/_nuxt/error-500.08851880.css"
  },
  "/_nuxt/error-500.2c3a221e.js": {
    "type": "application/javascript",
    "etag": "\"756-WZGmyJ0MTzNWvAWNcKj2OmMgJ2U\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1878,
    "path": "../public/_nuxt/error-500.2c3a221e.js"
  },
  "/_nuxt/error-component.82df771c.js": {
    "type": "application/javascript",
    "etag": "\"439-9mrDBS/EVzwyBwaXU7qP0j55sF0\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1081,
    "path": "../public/_nuxt/error-component.82df771c.js"
  },
  "/_nuxt/fetch.e89e6b99.js": {
    "type": "application/javascript",
    "etag": "\"b27-+djDO8QjFnMpifYjrIWyCyAMjok\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 2855,
    "path": "../public/_nuxt/fetch.e89e6b99.js"
  },
  "/_nuxt/FooterView.08ef6d3d.js": {
    "type": "application/javascript",
    "etag": "\"507-xt1E/McyoP0n0qUQqMQC0fcmozk\"",
    "mtime": "2023-10-22T22:20:55.903Z",
    "size": 1287,
    "path": "../public/_nuxt/FooterView.08ef6d3d.js"
  },
  "/_nuxt/index.5cf06b0d.js": {
    "type": "application/javascript",
    "etag": "\"da4-alaH5VIOzNMA9SKzopoTt8ugFVA\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 3492,
    "path": "../public/_nuxt/index.5cf06b0d.js"
  },
  "/_nuxt/index.aaa4f8bb.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"e10-jV25x1kZoUxzYTZFiFBkSH8p2nM\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 3600,
    "path": "../public/_nuxt/index.aaa4f8bb.css"
  },
  "/_nuxt/movies_index.5c8207ca.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"5b3-rI0zVpv0G58r3FCnFBpEiSHAff0\"",
    "mtime": "2023-10-22T22:20:55.905Z",
    "size": 1459,
    "path": "../public/_nuxt/movies_index.5c8207ca.css"
  },
  "/_nuxt/movies_index.7f678b0f.js": {
    "type": "application/javascript",
    "etag": "\"4bd-ff0G043vfDsVUefkXxvBD524WRo\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1213,
    "path": "../public/_nuxt/movies_index.7f678b0f.js"
  },
  "/_nuxt/_...slug_.65430319.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"4f1-TMSEvAXBAxpG2pEvCfWNOZxt/EE\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1265,
    "path": "../public/_nuxt/_...slug_.65430319.css"
  },
  "/_nuxt/_...slug_.7432f78d.js": {
    "type": "application/javascript",
    "etag": "\"742-ZhrcHzOsPgQJpPZ3YB180kl7di8\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1858,
    "path": "../public/_nuxt/_...slug_.7432f78d.js"
  },
  "/_nuxt/_...slug_.870ae1be.js": {
    "type": "application/javascript",
    "etag": "\"679-jsN8heGUZghRIgERHX/cXSfxRvY\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1657,
    "path": "../public/_nuxt/_...slug_.870ae1be.js"
  },
  "/_nuxt/_...slug_.88b8900d.js": {
    "type": "application/javascript",
    "etag": "\"727-bqTCWznk6QZM482fUnmqgYVUu+g\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1831,
    "path": "../public/_nuxt/_...slug_.88b8900d.js"
  },
  "/_nuxt/_...slug_.f18e6b0b.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"583-Ke82hOo5DHANUfwE8ZymGEPLDGM\"",
    "mtime": "2023-10-22T22:20:55.904Z",
    "size": 1411,
    "path": "../public/_nuxt/_...slug_.f18e6b0b.css"
  },
  "/_nuxt/_...slug_.fe20f9fd.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"4f1-FCGrABof293tFbmxcDWjejoD65A\"",
    "mtime": "2023-10-22T22:20:55.906Z",
    "size": 1265,
    "path": "../public/_nuxt/_...slug_.fe20f9fd.css"
  }
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = [];

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base of publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = ["HEAD", "GET"];
const EncodingMap = { gzip: ".gz", br: ".br" };
const _f4b49z = eventHandler(async (event) => {
  if (event.req.method && !METHODS.includes(event.req.method)) {
    return;
  }
  let id = decodeURIComponent(withLeadingSlash(withoutTrailingSlash(parseURL(event.req.url).pathname)));
  let asset;
  const encodingHeader = String(event.req.headers["accept-encoding"] || "");
  const encodings = encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort().concat([""]);
  if (encodings.length > 1) {
    event.res.setHeader("Vary", "Accept-Encoding");
  }
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      throw createError({
        statusMessage: "Cannot find static asset " + id,
        statusCode: 404
      });
    }
    return;
  }
  const ifNotMatch = event.req.headers["if-none-match"] === asset.etag;
  if (ifNotMatch) {
    event.res.statusCode = 304;
    event.res.end("Not Modified (etag)");
    return;
  }
  const ifModifiedSinceH = event.req.headers["if-modified-since"];
  if (ifModifiedSinceH && asset.mtime) {
    if (new Date(ifModifiedSinceH) >= new Date(asset.mtime)) {
      event.res.statusCode = 304;
      event.res.end("Not Modified (mtime)");
      return;
    }
  }
  if (asset.type) {
    event.res.setHeader("Content-Type", asset.type);
  }
  if (asset.etag) {
    event.res.setHeader("ETag", asset.etag);
  }
  if (asset.mtime) {
    event.res.setHeader("Last-Modified", asset.mtime);
  }
  if (asset.encoding) {
    event.res.setHeader("Content-Encoding", asset.encoding);
  }
  if (asset.size) {
    event.res.setHeader("Content-Length", asset.size);
  }
  const contents = await readAsset(id);
  event.res.end(contents);
});

const _lazy_S7umvA = () => import('./renderer.mjs');

const handlers = [
  { route: '', handler: _f4b49z, lazy: false, middleware: true, method: undefined },
  { route: '/__nuxt_error', handler: _lazy_S7umvA, lazy: true, middleware: false, method: undefined },
  { route: '/**', handler: _lazy_S7umvA, lazy: true, middleware: false, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const h3App = createApp({
    debug: destr(false),
    onError: errorHandler
  });
  h3App.use(config.app.baseURL, timingMiddleware);
  const router = createRouter();
  const routerOptions = createRouter$1({ routes: config.nitro.routes });
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    const referenceRoute = h.route.replace(/:\w+|\*\*/g, "_");
    const routeOptions = routerOptions.lookup(referenceRoute) || {};
    if (routeOptions.swr) {
      handler = cachedEventHandler(handler, {
        group: "nitro/routes"
      });
    }
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(/\/+/g, "/");
      h3App.use(middlewareBase, handler);
    } else {
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router);
  const localCall = createCall(h3App.nodeHandler);
  const localFetch = createFetch(localCall, globalThis.fetch);
  const $fetch = createFetch$1({ fetch: localFetch, Headers, defaults: { baseURL: config.app.baseURL } });
  globalThis.$fetch = $fetch;
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch
  };
  for (const plugin of plugins) {
    plugin(app);
  }
  return app;
}
const nitroApp = createNitroApp();
const useNitroApp = () => nitroApp;

const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const server = cert && key ? new Server({ key, cert }, nitroApp.h3App.nodeHandler) : new Server$1(nitroApp.h3App.nodeHandler);
const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
const host = process.env.NITRO_HOST || process.env.HOST;
const s = server.listen(port, host, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const protocol = cert && key ? "https" : "http";
  const i = s.address();
  const baseURL = (useRuntimeConfig().app.baseURL || "").replace(/\/$/, "");
  const url = `${protocol}://${i.family === "IPv6" ? `[${i.address}]` : i.address}:${i.port}${baseURL}`;
  console.log(`Listening ${url}`);
});
{
  process.on("unhandledRejection", (err) => console.error("[nitro] [dev] [unhandledRejection] " + err));
  process.on("uncaughtException", (err) => console.error("[nitro] [dev] [uncaughtException] " + err));
}
const nodeServer = {};

export { useRuntimeConfig as a, nodeServer as n, useNitroApp as u };
//# sourceMappingURL=node-server.mjs.map
