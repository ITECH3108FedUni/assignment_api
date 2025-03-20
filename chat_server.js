import { serveFile } from "https://deno.land/std@0.90.0/http/file_server.ts";
import { posix } from "https://deno.land/std@0.90.0/path/mod.ts";
import { Status } from "https://deno.land/std@0.90.0/http/http_status.ts";


import { getHighlightedJson, getIndexer } from "./index.js";

import { apiError, TinyRouter } from "./router.js";

const version = "25/05";

/* Load a "database". */
const databaseJSON = `{
  "users": [
    { "username": "alfred", "name": "Dr Alfredo" },
    { "username": "barnie", "name": "Barnibarno" },
    { "username": "cynthia", "name": "Cynthesis" }
  ],
  "topics": [
    {
      "title": "What do you want to do with your life?",
      "user": "alfred",
      "id": 1,
      "posts": [
        {
          "text": "Where do you see yourself in 5 years?",
          "user": "alfred"
        },
        {
          "text": "Not hanging around in this forum.",
          "user": "barnie"
        },
        {
          "text": "Come on @barnie, no need to be like that!",
          "user": "cynthia"
        }
      ]
    },
    {
      "title": "Have you ever found money on the road?",
      "user": "cynthia",
      "id": 2,
      "posts": [
        {
          "text": "I was walking down the street and found $5 - I was so excited!",
          "user": "cynthia"
        },
        {
          "text": "It was probably mine. Give it back",
          "user": "barnie"
        },
        {
          "text": "Why are we even friends with you @barnie",
          "user": "alfred"
        },
        {
          "text": "Because of my optimistic outlook.",
          "user": "barnie"
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
  "^/api/topics/?$",
  () => database.topics.map(({ posts, ...rest }) => rest),
);

/* Return a topic with a given id */
router.get("^/api/topics/(\\d+)/?$", (_, params) => {
  const topic = database.topics.find((t) => t.id == params[0]);
  if (!topic) {
    return apiError(
      {
        error: `No matching topic ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  return topic;
});

/* Return the posts for a topic with a given id */
router.get("^/api/topics/(\\d+)/posts/?$", (_, params) => {
  const topic = database.topics.find((t) => t.id == params[0]);
  if (!topic) {
    return apiError(
      {
        error: `No matching topic ${params[0]}`,
      },
      Status.NotFound,
    );
  }
  return topic.posts.map((post) => ({
    ...post,
    name: database.users.find((u) => u.username === post.user).name,
  }));
});

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

/* Return the topics started by a particular user */
router.get("^/api/users/(\\w+)/topics/?$", (req, params) => {
  const user = database.users.find((u) => u.username == params[0]);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  const userTopics = database.topics
    .filter((t) => t.posts[0].user === user.username) // the first post
    .map(({ posts, ...rest }) => rest); // strip the posts

  return userTopics;
});

/* Create a topic */
router.post("^/api/topics/?$", (req, params) => {
  const user = database.users.find((u) => u.username == req.jsonContent.user);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${req.jsonContent.user}`,
      },
      Status.OK,
    );
  }

  const newTopic = {
    title: req.jsonContent.title,
    id: database.topics.map((t) => t.id).reduce((a, b) => Math.max(a, b)) + 1,
    posts: [{
      text: req.jsonContent.text,
      user: req.jsonContent.user,
    }],
    user: req.jsonContent.user,
  };
  database.topics.push(newTopic);

  return {
    body: newTopic,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "title": "The title of the topic. A string.",
  "text": "The content of the first post. A string.",
});

/* Create a post within a topic */
router.post("^/api/topics/(\\d+)/posts/?$", (req, params) => {
  const topic = database.topics.find((t) => t.id == params[0]);
  if (!topic) {
    return apiError(
      {
        error: `No matching topic ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  const user = database.users.find((u) => u.username == req.jsonContent.user);
  if (!user) {
    return apiError(
      {
        error: `No matching user ${req.jsonContent.user}`,
      },
      Status.OK,
    );
  }

  const newPost = {
    text: req.jsonContent.text,
    user: req.jsonContent.user,
  };
  topic.posts.push(newPost);

  return {
    body: newPost,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "text": "The content of the post. A string.",
});

/* Delete a topic */
router.delete("^/api/topics/(\\d+)/?$", (req, params) => {
  const topic = database.topics.find((t) => t.id == params[0]);
  if (!topic) {
    return apiError(
      {
        error: `No matching topic ${params[0]}`,
      },
      Status.NotFound,
    );
  }

  if (topic.user === req.jsonContent.user) {
    database.topics = database.topics.filter(
      (t) => (t.id !== topic.id),
    );
  }

  return {
    body: "",
    status: Status.NoContent,
  };
}, {
  "user": "The username of the logged-in user. " +
    "Must match the username of the topic creator",
});

router.add("OPTIONS", "^", () => "");

/* module globals for managing websockets */
const wsClients = {};
let count = 0;

/* WebSocket handler */
function handleWs(req) {

  if(req.headers.get("upgrade") !== "websocket") {
    return apiError(`Cannot connect to /ws without trying to be a websocket upgrade`, Status.NotImplemented);
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = count++;

  socket.addEventListener("open", () => {    
    wsClients[id] = socket;
  });

  socket.addEventListener("close", () => {
    delete wsClients[id];
  });

  socket.addEventListener("error", () => {
    console.log(`Error in websocket with id ${id}`)
    delete wsClients[id];
  });

  return response;
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

  console.log("Connect to http://localhost:7777/");
  Deno.serve({
      port:7777
    },

    async (req) => {
      console.log(`${new Date().toISOString()}\t${req.method}\t${req.url}`);

      if ((new URL(req.url)).pathname === "/ws") {
        return handleWs(req);
      } else {
        try {
          return router.handle(req);
        } catch (err) {
          console.error(`Error: ${err.message}`);
        }
      }
    }
  );
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
