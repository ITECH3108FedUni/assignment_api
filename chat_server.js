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

const version = "22/10";

/* Load a "database". */
const databaseJSON = `{
  "users": [
    { "username": "justin", "name": "Justin O. Pelais" },
    { "username": "franc",   "name": "Francine Rogers" },
    { "username": "del", "name": "Della Alexopoulos" },
    { "username": "joakim",  "name": "Joakim Brodén" },
    { "username": "marle",   "name": "Marle Downe"}
  ],
  "questions": [
    {
      "question": "What music does everyone listen to?",
      "icon": "🎸",
      "user": "justin",
      "id": 1,
      "replies": [
        {
          "text": "I love classical and spanish guitar! So much talent!",
          "user": "justin"
        },
        {
          "text": "I don't listen to music.",
          "user": "del"
        },
        {
          "text": "Ok. Thanks for your contribution @del",
          "user": "justin"
        },
        {
          "text": "I sing in a metal band!",
          "user": "joakim"
        }
      ]
    },
    {
      "question": "What's on for the weekend?",
      "user": "franc",
      "icon": "👋",
      "id": 2,
      "replies": [
        {
          "text": "I'm going to a concert!",
          "user": "franc"
        },
        {
          "text": "Sounds great, @franc! I have to study.",
          "user": "marle"
        },
        {
          "text": "Thanks @marle! Good luck!",
          "user": "franc"
        },
        {
          "text": "My band has a gig. Maybe it's the same one you're going to, @franc!",
          "user": "joakim"
        },
        {
          "text": "I'll be having chicken tacos and watching a movie with mom.",
          "user": "justin"
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
  "^/api/questions/?$",
  () => database.questions.map(({ replies, ...rest }) => rest),
);

/* Return a question with a given id */
router.get("^/api/questions/(\\d+)/?$", (_, params) => {
  const question = database.questions.find((t) => t.id == params[0]);
  if (!question) {
    return apiError(`No matching question ${params[0]}`,
      Status.NotFound,
    );
  }
  return question;
});

/* Return the replies for a question with a given id */
router.get("^/api/questions/(\\d+)/replies/?$", (_, params) => {
  const question = database.questions.find((t) => t.id == params[0]);
  if (!question) {
    return apiError(`No matching question ${params[0]}`,
      Status.NotFound,
    );
  }
  return question.replies.map((reply) => ({
    ...reply,
    name: database.users.find((u) => u.username === reply.user).name,
  }));
});

const get_question_replies = (_, params) => {
  const question = database.questions.find((t) => t.id == params[0]);
  if (!question) {
    return apiError(`No matching question ${params[0]}`,
      Status.NotFound,
    );
  }
  const reply = question.replies[params[1]-1];

  if(!reply) {
    return apiError( `No matching reply ${params[1]} in question ${params[0]}`, 
      Status.NotFound,
    );
  }
  
  return {
    ...reply,
    name: database.users.find((u) => u.username === reply.user).name,
  };
  
};
get_question_replies.description = `The first reply in each question has id=1.`;

/* Return the indexed replies for a question with a given id */
router.get("^/api/questions/(\\d+)/replies/(\\d+)/?$", get_question_replies);

/* Return all the users */
router.get("^/api/users/?$", () => database.users);

/* Return the user with a given username */
router.get("^/api/users/(\\w+)/?$", (_, params) => {
  const user = database.users.find((u) => u.username == params[0]);
  if (!user) {
    return apiError(`No matching user ${params[0]}`,
      Status.NotFound,
    );
  }
  return user;
});

/* Return the questions started by a particular user */
router.get("^/api/users/(\\w+)/questions/?$", (req, params) => {
  const user = database.users.find((u) => u.username == params[0]);
  if (!user) {
    return apiError(`No matching user ${params[0]}`,
      Status.NotFound,
    );
  }

  const userquestions = database.questions
    .filter((t) => t.replies[0].user === user.username) // the first reply
    .map(({ replies, ...rest }) => rest); // strip the replies

  return userquestions;
});

/* Create a question */
router.post("^/api/questions/?$", (req, params) => {
  const user = database.users.find((u) => u.username == req.json.user);
  if (!user) {
    return apiError(`No matching user ${req.json.user}`,
      Status.OK,
    );
  }

  const newquestion = {
    question: req.json.question,
    // Only use the first character
    icon: String.fromCodePoint(("" + (req.json.icon ?? "❓")).codePointAt(0)),
    id: database.questions.map((t) => t.id).reduce((a, b) => Math.max(a, b)) + 1,
    replies: [{
      text: req.json.text,
      user: req.json.user,
    }],
    user: req.json.user,
  };
  database.questions.push(newquestion);

  return {
    body: newquestion,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "question": "The initial question. A string.",
  "icon": "A string character",
  "text": "The content of the first reply. A string.",
});

/* Create a reply within a question */
router.post("^/api/questions/(\\d+)/replies/?$", (req, params) => {
  const question = database.questions.find((t) => t.id == params[0]);
  if (!question) {
    return apiError(`No matching question ${params[0]}`,
      Status.NotFound,
    );
  }

  const user = database.users.find((u) => u.username == req.json.user);
  if (!user) {
    return apiError(`No matching user ${req.json.user}`,
      Status.OK,
    );
  }

  const newPost = {
    text: req.json.text,
    user: req.json.user,
  };
  question.replies.push(newPost);

  return {
    body: newPost,
    status: Status.Created,
  };
}, {
  "user": "The username of the user posting.",
  "text": "The content of the reply. A string.",
});

/* Delete a question */
router.delete("^/api/questions/(\\d+)/?$", (req, params) => {
  const question = database.questions.find((t) => t.id == params[0]);
  if (!question) {
    return apiError(`No matching question ${params[0]}`,
      Status.NotFound,
    );
  }

  if (question.user === req.json.user) {
    database.questions = database.questions.filter(
      (t) => (t.id !== question.id),
    );
  }

  return {
    body: "",
    status: Status.NoContent,
  };
}, {
  "user": "The username of the logged-in user. " +
    "Must match the username of the question creator",
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
