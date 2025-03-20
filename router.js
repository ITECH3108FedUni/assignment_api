import { Status } from "https://deno.land/std@0.90.0/http/http_status.ts";

// Used to decode the body of POST & PUT requests
const decoder = new TextDecoder();

export function apiError(body, status) {
  const headers = new Headers();
  addCORS(headers);
  
  headers.set('Content-Type', "application/json");

  console.error(body);

  return {
    body: JSON.stringify({error: body}),
    status: status,
    headers: headers
  };
}

function responsify(res) {
  if(res.status === Status.NoContent) {
    return new Response(null, {headers: res.headers, status: res.status }); 
  } else {
    return new Response(res.body, {headers: res.headers, status: res.status || 200});
  }
}

function addCORS(headers) {  
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set(
      "Access-Control-Allow-Methods",
      "GET, PUT, POST, DELETE",
    );
  headers.set(
      "Access-Control-Allow-Headers",
      "Accept, Authorization, Content-Type, Origin",
    );
}

/* A tiny router class.

Does some nice things for you automatically.
For example, if the body of the response is not a string, it will call
JSON.stringify and set the content-type header automatically.

Handlers can return a string, a response object (with a body and optionally a
status and/or content-type key) or any other object which will be encoded as
JSON.

It will also allow access from literally any origin.
*/

export class TinyRouter {
  constructor(postUpdate) {
    this.routes = [];
    this.postUpdate = postUpdate;
  }

  /* Add a "route" - that is, a mapping from a URL pattern to a function.

  The re field is either a regular expression or a string (containing a
    regular expression). If a URL matches the regular expression, the function
    will be called in response.

  If requiredFields is set, then the router will check that the body of the
  request contains the keys.
    */
  add(method, re, action, requiredFields) {
    if (typeof re === "string") {
      re = new RegExp(re);
    }
    const route = {
      method,
      re,
      action,
      requiredFields,
    };

    this.routes.push(route);
    return route;
  }

  /* Short-hand methods to respond to GET, POST, PUT, DELETE */
  get(re, action) {
    return this.add("GET", re, action);
  }
  post(re, action, requiredFields) {
    return this.add("POST", re, action, requiredFields);
  }
  put(re, action, requiredFields) {
    return this.add("PUT", re, action, requiredFields);
  }
  delete(re, action, requiredFields) {
    return this.add("DELETE", re, action, requiredFields);
  }

  /* This is the main interface to the router.
  Fundamentally, this function checks all the routes, and if both the 
  method and the URL/path match, then it will call the corresponding handler
  */
  async handle(req) {
    const pathname = (new URL(req.url)).pathname;

    let res;

    /* If the client claims to be sending json, then parse it */
    if (req.method !== "GET" && req.headers.get("content-type") && req.headers.get('content-type').startsWith("application/json")) {
      try {
          req.jsonContent = await req.json();
      } catch (e) {
        return responsify(apiError({
          error: `Malformed JSON in your request. ${e.message}`,
        }, Status.BadRequest));
      }
    }

    for (const route of this.routes) {
      if (route.method !== req.method) continue;

      const match = route.re.exec(pathname);

      if (match) {
        // Check the requiredFields
        if (route.requiredFields) {
          // If the handler requires certain fields, make sure we have json
          if (!req.jsonContent) {
            return responsify(apiError({
              error: `This endpoint requires a JSON-encoded body. ` +
                `Did you remember to set the content type to application/json?`,
            }, Status.BadRequest));
          }

          for (const k in route.requiredFields) {
            if (!(k in req.jsonContent)) {
              return responsify(apiError(
                {
                  error: `Missing information required in request: ${k}`,
                },
                Status.BadRequest,
              ));
            }
          }
        }

        try {
          res = await route.action(req, match.slice(1));
        } catch (e) {
          return responsify(apiError(`An error occurred: ${e.message}`, 500));
        }

        if (
          this.postUpdate && (["POST", "PUT", "DELETE"].includes(req.method))
        ) {
          console.log("Updating");
          this.postUpdate();
        }

        if (typeof res !== "string") {
          if ("body" in res) {
            if (!("headers" in res)) {
              res.headers = new Headers();
            }
            if (typeof res.body !== "string" && !("rid" in res.body)) {
              res.body = JSON.stringify(res.body);
              res.headers.set("content-type", "application/json");
            }
          } else {
            const headers = res.headers || new Headers();
            const status = res.status || 200;

            delete res.headers;
            delete res.status;

            res = {
              body: JSON.stringify(res),
              headers,
              status,
            };

            res.headers.set("content-type", "application/json");
          }

          if ("content-type" in res) {
            res.headers.set("content-type", res["content-type"]);
            delete res["content-type"];
          }
        } else {
          const headers = new Headers();
          const status = 200;
          res = { body: res, status: status, headers: headers };
        }

        /* Add CORS headers */
        addCORS(res.headers);

        return responsify(res);
        
      }
    }
    // No routes matched
    return responsify(apiError(`Couldn't find route for path ${pathname} with method ${req.method}`, Status.NotFound));
  }
}
