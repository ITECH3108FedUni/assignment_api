/*
Hook up a WebSocket to keep the database refreshed without timeouts,
and without polluting the developer tools with lots of REST API calls.

You don't need to understand what this is doing to do the assignment.
*/
function connect() {
  const socket = new WebSocket(`ws://${window.location.host}/ws`);

  socket.addEventListener("message", (event) => {
    document.getElementById("database_contents").innerHTML = event.data;
  });

  socket.addEventListener("close", () => {
    // reconnect
    setTimeout(connect, 500);
  });

  socket.addEventListener("error", (event) => {
    console.log(`Error encountered: ${event.message}`);
    socket.close();
    setTimeout(connect, 500);
  });
}

connect();
