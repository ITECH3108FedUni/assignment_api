import { Status } from "https://deno.land/std@0.90.0/http/http_status.ts";

// Used to decode the body of POST & PUT requests
const decoder = new TextDecoder();

export function apiError(body, status) {
  return {
    body: JSON.stringify(body),
    status: status,
    "content-type": "application/json",
  };
}

/* A tiny router class.

Does some nice things for you automatically.
For example, if the body of the response is not a string, it will call
JSON.stringify and set the content-type header automatically.

Handlers can return a string, a response object (with a body and optionally a
status and/or content-type key) or any other object which will be encoded as
JSON */

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
    /* If the client claims to be sending json, then parse it */
    if (req.headers.get("content-type") == "application/json") {
      let body = await Deno.readAll(req.body);
      try {
        if (body.length) {
          body = JSON.parse(decoder.decode(body));
          req.json = body;
        }
      } catch (e) {
        return apiError({
          error: `Malformed JSON in your request. ${e.message}`,
        }, Status.BadRequest);
      }
    }

    for (const route of this.routes) {
      if (route.method !== req.method) continue;

      const match = route.re.exec(req.url);

      if (match) {
        // Check the requiredFields
        if (route.requiredFields) {
          // If the handler requires certain fields, make sure we have json
          if (!req.json) {
            return apiError({
              error: `This endpoint requires a JSON-encoded body. ` +
                `Did you remember to set the content type to application/json?`,
            }, Status.BadRequest);
          }

          for (const k in route.requiredFields) {
            if (!(k in req.json)) {
              return apiError(
                {
                  error: `Missing information required in request: ${k}`,
                },
                Status.BadRequest,
              );
            }
          }
        }

        let res;
        try {
          res = await route.action(req, match.slice(1));
        } catch (e) {
          return apiError(`An error occurred: ${e.message}`, 500);
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
          res.body = res;
        }
        return res;
      }
    }
    // No routes matched
    return apiError(
      `Couldn't find route for path ${req.url} with method ${req.method}`,
      500,
    );
  }
}
