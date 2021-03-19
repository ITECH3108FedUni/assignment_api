/*
Hook up a WebSocket to keep the database refreshed without timeouts,
and without polluting the developer tools with lots of REST API calls.

You don't need to understand what this is doing to do the assignment.
*/
const defaultTimeout = 5000;
const maxTimeout = 20000;
let timeout = 5000;

function connect() {
  const socket = new WebSocket(`ws://${window.location.host}/ws`);

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
    console.log(`Error encountered:`, event);
    socket.close();
    setTimeout(connect, timeout);
    timeout = Math.min(timeout * 1.5, maxTimeout);
  });
}

connect();
