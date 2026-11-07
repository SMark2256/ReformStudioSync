// SPA fallback a Cloudflare Worker előtt.
//
// Élesben az `assets.not_found_handling: "single-page-application"` kiszolgálja
// az index.html-t, és ez a kód le sem fut. A Workers Previews (open beta) viszont
// ezt a beállítást nem veszi figyelembe, ezért a `demo` preview-n a közvetlen
// linkek (pl. /monitor) 404-et adnának. Ilyenkor ide jut a kérés, és mi adjuk
// vissza az index.html-t, hogy a react-router kezelje az útvonalat.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') {
      return response;
    }

    // Hiányzó fájl (pl. /assets/x.js) maradjon 404, csak az útvonalak esnek vissza.
    const url = new URL(request.url);
    if (url.pathname.split('/').pop()?.includes('.')) {
      return response;
    }

    return env.ASSETS.fetch(new Request(new URL('/', url), request));
  },
};
