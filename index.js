import { escapeHtml } from "https://deno.land/x/escape_html/mod.ts";

export function getHighlightedJson(database) {
  /* The worst syntax highlighting filter ever written */
  return escapeHtml(JSON.stringify(database, null, 2)).replaceAll(
    /^(?<space>\s*)(?<key>&quot;.*&quot;?):\s*(?<value>&quot;?[^\[{]*?&quot;|[^\[{]*?)(?<tail>[,\[{]?)$/gm,
    '$<space><span class="key">$<key></span>: <span class="value">$<value></span>$<tail>',
  );
}

export function getIndexer(router, database) {
  /* The index function that shows the API routes */
  return function (req, params) {
    const routeFormats = router.routes
      .map((route) => {
        const path = route.re
          .toString()
          .replace(/^\/\^/, "")
          .replace("\\/?$/", "")
          .replaceAll("\\/", "/")
          .replaceAll("(\\d+)", "{id}")
          .replaceAll("(\\w+)", "{user}");

        return {
          ...route,
          path: path,
          example_url: path
            .replaceAll("{id}", "1")
            .replaceAll("{user}", database.users[0].username),
        };
      })
      .filter((route) => route.path.startsWith("/api"))
      .map((route) => {
        let paramtext = "";
        if (route.requiredFields) {
          paramtext = Object.entries(route.requiredFields)
            .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
            .join("\n");
          paramtext = `<dl>${paramtext}</dl>`;
        }

        return { route, paramtext };
      })
      .map(
        ({ route, paramtext }) =>
          `<tr>
              <td class="method method-${route.method}">${route.method}</td>
              <td class="endpoint">${
            route.path.replaceAll(
              /{(.*)}/g,
              "<em>$1</em>",
            )
          }</td>
              <td class="example"><a href="${route.example_url}">${route.example_url}</a></td>
              <td class="params">${paramtext}</td>
          </tr>`,
      )
      .join("\n");

    const tpl = `<!DOCTYPE html>
      <html>
          <!--
          Hi there! Good for you for exploring this code and seeing what it
          does! You'll notice that there's some WebSocket stuff going on in
          this code. Don't worry - you don't need to use WebSockets in your
          assignment, but they're pretty neat!
          We use them here so that your developer tools stay nice and clean,
          and also so that the server can immediately update your database
          contents view. You can simulate this effect by polling a REST
          endpoint, but this approach is a little cleaner (as long as the
          WebSocket stays connected!) 
          -->
          <head><title>ITECH3108 Assignment</title>
          <link rel="stylesheet" href="style.css">
          <script src="/update.js" defer></script>
          </head>
          <body>
              <h1>ITECH3108 Assignment 1</h1>
              <div class="content">
              <div id="endpoints">
              <h3>API endpoints:</h1>
              <p>URL components listed in bold and blue below are configurable
              - replace them with your values (as in the example column)</p>
              <table>
              <tr>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Example</th>
                  <th>Required JSON parameters</th>
              </tr>
              ${routeFormats}
              </table>
              </div>
  
              <div id="contents">
              <h3>Current contents of database</h3>
              <pre id="database_contents">${getHighlightedJson(database)}</pre>
              </div>
              </div>
  
          </body>
      </html>`;

    return {
      body: tpl,
      "content-type": "text/html",
    };
  };
}
