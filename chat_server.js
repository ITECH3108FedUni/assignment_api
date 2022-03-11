import { serve } from "https://deno.land/std@0.90.0/http/server.ts";
import { serveFile } from "https://deno.land/std@0.90.0/http/file_server.ts";
import { posix } from "https://deno.land/std@0.90.0/path/mod.ts";
import { Status } from "https://deno.land/std@0.90.0/http/http_status.ts";
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
} from "https://deno.land/std@0.90.0/ws/mod.ts";

import { getHighlightedJson, getIndexer } from "./index.js";

import { apiError, TinyRouter } from "./router.js";

const version = "22/05";

/* Load a "database". */
const databaseJSON = `{
  "users": [
    { "username": "norman", "name": "Norman C. Lowery" },
    { "username": "josa",   "name": "Jósa Marcsa" },
    { "username": "amanda", "name": "Amanda Costa Rodrigues" },
    { "username": "tiina",  "name": "Tiina Takko" },
    { "username": "owen",   "name": "Owen Dow"}
  ],
  "threads": [
    {
      "thread_title": "Does anybody play an instrument?",
      "icon": "🎸",
      "user": "norman",
      "id": 1,
      "posts": [
        {
          "text": "I love to play guitar, anybody else?",
          "user": "norman"
        },
        {
          "text": "Not me.",
          "user": "amanda"
        },
        {
          "text": "Ok. Thanks for your contribution @amanda",
          "user": "norman"
        },
        {
          "text": "I play the air drums!",
          "user": "owen"
        }
      ]
    },
    {
      "thread_title": "Hey everybody!",
      "user": "josa",
      "icon": "👋",
      "id": 2,
      "posts": [
        {
          "text": "I love making new friends!",
          "user": "josa"
        },
        {
          "text": "Welcome @josa",
          "user": "owen"
        },
        {
          "text": "Thanks Owen",
          "user": "josa"
        },
        {
          "text": "Who invited Josa?.",
          "user": "amanda"
        },
        {
          "text": "@amanda be nice. Last warning.",
          "user": "norman"
        }
      ]
    }
  ]
}`;
const database = JSON.parse(databaseJSON);

/* Set up some routes to handle */
const router = new TinyRouter(postUpdate);

/* Give an index page when accessing the front */
router.get("^/?$", getIndexer(router, database));

/* Routes for the API */
router.get(
  "^/api/threads/?$",
  () => database.threads.map(({ posts, ...rest }) => rest),
);

/* Return a thread with a given id */
router.get("^/api/threads/(\\d+)/?$", (_, params) => {
  const thread = database.threads.find((t) => t.id == params[0]);
  if (!thread) {
    return apiError(
      {
        error: `No matching thread ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  return thread;
});

/* Return the posts for a thread with a given id */
router.get("^/api/threads/(\\d+)/posts/?$", (_, params) => {
  const thread = database.threads.find((t) => t.id == params[0]);
  if (!thread) {
    return apiError(
      {
        error: `No matching thread ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  return thread.posts.map((post) => ({
    ...post,
    name: database.users.find((u) => u.username === post.user).name,
  }));
});

const get_thread_posts = (_, params) => {
  const thread = database.threads.find((t) => t.id == params[0]);
  if (!thread) {
    return apiError(
      {
        error: `No matching thread ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  const post = thread.posts[params[1]-1];

  if(!post) {
    return apiError( {
        error: `No matching post ${params[1]} in thread ${params[0]}`,
      }, 
      Status.NotFound,
    );
  }
  
  return {
    ...post,
    name: database.users.find((u) => u.username === post.user).name,
  };
  
};
get_thread_posts.description = `The first post in each thread has id=1.`;

/* Return the indexed posts for a thread with a given id */
router.get("^/api/threads/(\\d+)/posts/(\\d+)/?$", get_thread_posts);

/* Return all the users */
router.get("^/api/users/?$", () => database.users);

/* Return the user with a given username */
router.get("^/api/users/(\\w+)/?$", (_, params) => {
  const user = database.users.find((u) => u.username == params[0]);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  return user;
});

/* Return the threads started by a particular user */
router.get("^/api/users/(\\w+)/threads/?$", (req, params) => {
  const user = database.users.find((u) => u.username == params[0]);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  const userthreads = database.threads
    .filter((t) => t.posts[0].user === user.username) // the first post
    .map(({ posts, ...rest }) => rest); // strip the posts

  return userthreads;
});

/* Create a thread */
router.post("^/api/threads/?$", (req, params) => {
  const user = database.users.find((u) => u.username == req.json.user);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${req.json.user}`,
      },
      Status.OK,
    );
  }

  const newthread = {
    thread_title: req.json.thread_title,
    // Only use the first character
    icon: String.fromCodePoint(("" + (req.json.icon ?? "❓")).codePointAt(0)),
    id: database.threads.map((t) => t.id).reduce((a, b) => Math.max(a, b)) + 1,
    posts: [{
      text: req.json.text,
      user: req.json.user,
    }],
    user: req.json.user,
  };
  database.threads.push(newthread);

  return {
    body: newthread,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "thread_title": "The title of the thread. A string.",
  "icon": "A string character",
  "text": "The content of the first post. A string.",
});

/* Create a post within a thread */
router.post("^/api/threads/(\\d+)/posts/?$", (req, params) => {
  const thread = database.threads.find((t) => t.id == params[0]);
  if (!thread) {
    return apiError(
      {
        error: `No matching thread ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  const user = database.users.find((u) => u.username == req.json.user);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${req.json.user}`,
      },
      Status.OK,
    );
  }

  const newPost = {
    text: req.json.text,
    user: req.json.user,
  };
  thread.posts.push(newPost);

  return {
    body: newPost,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "text": "The content of the post. A string.",
});

/* Delete a thread */
router.delete("^/api/threads/(\\d+)/?$", (req, params) => {
  const thread = database.threads.find((t) => t.id == params[0]);
  if (!thread) {
    return apiError(
      {
        error: `No matching thread ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  if (thread.user === req.json.user) {
    database.threads = database.threads.filter(
      (t) => (t.id !== thread.id),
    );
  }

  return {
    body: "",
    status: Status.NoContent,
  };
}, {
  "user": "The username of the logged-in user. " +
    "Must match the username of the thread creator",
});

router.add("OPTIONS", "^", () => "");

const wsClients = {};
let count = 0;

/* WebSocket handler */
function handleWs(req) {
  const { conn, r: bufReader, w: bufWriter, headers } = req;
  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  }).then(async (socket) => {
    const id = count++;
    wsClients[id] = socket;
    try {
      for await (const ev of socket) {
        if (isWebSocketCloseEvent(ev)) delete wsClients[id];
      }
    } catch (err) {
      console.error(`WebSocket failed: ${err}`);
      delete wsClients[id];

      if (!socket.isClosed) {
        try {
          await socket.close(1000).catch(console.error);
        } catch (_) {
          // do nothing
        }
      }
    }
  });
}

async function postUpdate() {
  const json = getHighlightedJson(database);
  for (const id in wsClients) {
    try {
      await wsClients[id].send(json);
    } catch (err) {
      console.error(err);
    }
  }
}

/* catch all for static files */
const target = posix.resolve("static");
router.get("^", async (req, params) => {
  const normalizedUrl = normalizeURL(req.url);
  let fsPath = posix.join(target, normalizedUrl);
  if (fsPath.indexOf(target) !== 0) {
    fsPath = target;
  }

  try {
    return await serveFile(req, fsPath);
  } catch (e) {
    console.error(e.message);
    return {
      body: "No matching route or file",
      status: Status.NotFound,
    };
  }
});

async function main() {
  /* Create the server! */
  const server = serve({
    port: 7777,
  });
  console.log("Connect to http://localhost:7777/");

  /* Handle incoming requests */
  for await (const req of server) {
    console.log(`${new Date().toISOString()}\t${req.method}\t${req.url}`);
    if (req.url === "/ws") {
      handleWs(req);
    } else {
      try {
        await req.respond(await router.handle(req));
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }
    }
  }
}

/* Adapted from https://deno.land/std@0.90.0/http/file_server.ts */
function normalizeURL(url) {
  let normalizedUrl = url;
  try {
    normalizedUrl = decodeURI(normalizedUrl);
  } catch (e) {
    if (!(e instanceof URIError)) {
      throw e;
    }
  }

  try {
    const absoluteURI = new URL(normalizedUrl);
    normalizedUrl = absoluteURI.pathname;
  } catch (e) {
    //wasn't an absoluteURI
    if (!(e instanceof TypeError)) {
      throw e;
    }
  }

  if (normalizedUrl[0] !== "/") {
    throw new URIError("The request URI is malformed.");
  }

  normalizedUrl = posix.normalize(normalizedUrl);
  const startOfParams = normalizedUrl.indexOf("?");
  return startOfParams > -1
    ? normalizedUrl.slice(0, startOfParams)
    : normalizedUrl;
}

if (import.meta.main) {
  main();
}
