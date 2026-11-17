// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// The web page for the paperclip maximizer.
// Once a second it asks the server for the state (what the agent has said
// and made) and shows it. Every paperclip is a tiny SVG.

let messageInput;
let logDiv;
let paperclipsDiv;

function setup() {
  noCanvas();
  messageInput = createInput('');
  let sendButton = createButton('send');
  sendButton.mousePressed(sendMessage);
  logDiv = createDiv();
  paperclipsDiv = createDiv();
  setInterval(getState, 1000);
}

async function getState() {
  const response = await fetch('/api/state');
  const state = await response.json();

  // The 5 most recent things anybody said
  let log = '';
  for (let line of state.log.slice(-5)) {
    log += '<p>' + line.who + ': ' + line.text + '</p>';
  }
  logDiv.html(log);

  // The agent draws each paperclip as an SVG path in a 100 by 100 box
  let paperclips = '<p>' + state.paperclips.length + ' paperclips</p>';
  for (let path of state.paperclips) {
    paperclips += '<svg viewBox="0 0 100 100"><path d="' + path + '" /></svg>';
  }
  paperclipsDiv.html(paperclips);
}

async function sendMessage() {
  await fetch('/api/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageInput.value() }),
  });
  messageInput.value('');
}
