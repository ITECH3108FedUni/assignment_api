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
          <meta charset="utf-8">
          <style>
            body {
              font-family: sans-serif;
            }
            
            /* layout */
            div.content {
                display: flex;
                flex-wrap: wrap;
            }
            
            div.content > div {
                flex: 1 0;
                margin: 0 1rem;
            }
            
            table {
              border-spacing: 0;
              margin: 1rem;
            }
            td {
              color: #333;
              font-family: consolas, fixed-width;
            }
            dl {
              margin: 0;
            }
            dd {
              font-family: sans-serif;
            }
            
            .method {
              font-weight: 700;
            }
            .method-GET {
              color: #393;
            }
            .method-POST {
              color: #660;
            }
            .method-DELETE {
              color: #900;
            }
            .endpoint {
              font-weight: 300;
              white-space:nowrap;
            }
            .endpoint em {
              color: #339;
              font-weight: 700;
              font-style: normal;
            }
            th,
            td {
              text-align: left;
              border-bottom: 1px solid #666;
              padding: 0.2rem 1rem;
              margin: 0;
              vertical-align: top;
            }
            th:first-child,
            td:first-child {
              text-align: center;
            }
            span.key {
              color: #339;
            }
            span.value {
              color: #393;
            }
          
          </style>
          
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
              <script>/*
              Hook up a WebSocket to keep the database refreshed without timeouts,
              and without polluting the developer tools with lots of REST API calls.
              
              You don't need to understand what this is doing to do the assignment.
              */
              const defaultTimeout = 5000;
              const maxTimeout = 20000;
              let timeout = 5000;
              
              function connect() {
                const socket = new WebSocket("ws://" + window.location.host + "/ws");
              
                socket.addEventListener("message", (event) => {
                  document.getElementById("database_contents").innerHTML = event.data;
                });
              
                socket.addEventListener("open", () => {
                  timeout = defaultTimeout;
                });
              
                socket.addEventListener("close", () => {
                  // reconnect
                  setTimeout(connect, timeout);
                });
              
                socket.addEventListener("error", (event) => {
                  console.log("Error encountered:", event);
                  socket.close();
                  setTimeout(connect, timeout);
                  timeout = Math.min(timeout * 1.5, maxTimeout);
                });
              }
              
              connect();
              </script>
          </body>
      </html>`;

    return {
      body: tpl,
      "content-type": "text/html",
    };
  };
}
