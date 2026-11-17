// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// A p5.js sketch with tools that are drawing functions.
// The model sees the canvas after every step (requires a vision model like gemma4 or qwen3-vl).
// Run node server.js then open http://localhost:3001

let canvas;
let promptInput;
let logDiv;

// This one needs a model that can look at images
const model = 'gemma4';
// const model = 'qwen3-vl';
// const model = 'qwen3.8:27b';

// The most times the model gets to look at the canvas and draw some more
const maxSteps = 20;

const systemPrompt =
  'You draw pictures on a 400 by 400 canvas by calling tools, several shapes in every step. ' +
  'x goes from 0 (left) to 400 (right). y goes from 0 (top) to 400 (bottom). ' +
  'After each step you will see the canvas. Fix what looks wrong and add what is missing. ' +
  'When the picture is finished, reply with one sentence describing it.';

// The tools are p5.js drawing functions
function drawCircle(args) {
  noStroke();
  fill(args.color);
  circle(args.x, args.y, args.size);
  return 'Drew a ' + args.color + ' circle';
}

function drawRectangle(args) {
  noStroke();
  fill(args.color);
  rect(args.x, args.y, args.width, args.height);
  return 'Drew a ' + args.color + ' rectangle';
}

function drawLine(args) {
  stroke(args.color);
  strokeWeight(4);
  line(args.x1, args.y1, args.x2, args.y2);
  return 'Drew a ' + args.color + ' line';
}

const functions = {
  draw_circle: drawCircle,
  draw_rectangle: drawRectangle,
  draw_line: drawLine,
};

// The tools go into an array, reference the function name and include metadata like description, properties, etc.
const tools = [
  {
    type: 'function',
    function: {
      name: 'draw_circle',
      description: 'Draw a filled circle',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'The center x' },
          y: { type: 'number', description: 'The center y' },
          size: { type: 'number', description: 'The diameter in pixels' },
          color: { type: 'string', description: 'A color name like red or skyblue' },
        },
        required: ['x', 'y', 'size', 'color'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draw_rectangle',
      description: 'Draw a filled rectangle',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'The x of the top left corner' },
          y: { type: 'number', description: 'The y of the top left corner' },
          width: { type: 'number', description: 'The width in pixels' },
          height: { type: 'number', description: 'The height in pixels' },
          color: { type: 'string', description: 'A color name like brown or gold' },
        },
        required: ['x', 'y', 'width', 'height', 'color'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draw_line',
      description: 'Draw a line between two points',
      parameters: {
        type: 'object',
        properties: {
          x1: { type: 'number', description: 'The x of the first point' },
          y1: { type: 'number', description: 'The y of the first point' },
          x2: { type: 'number', description: 'The x of the second point' },
          y2: { type: 'number', description: 'The y of the second point' },
          color: { type: 'string', description: 'A color name like black or green' },
        },
        required: ['x1', 'y1', 'x2', 'y2', 'color'],
      },
    },
  },
];

function setup() {
  canvas = createCanvas(400, 400);
  background(240);

  promptInput = createInput('Draw a snowman at night.');
  promptInput.size(300);
  let goButton = createButton('Go');
  goButton.mousePressed(runAgent);
  logDiv = createDiv('');
}

async function runAgent() {
  background(240);
  logDiv.html('');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptInput.value() },
  ];

  // The agent loop, with a limit on the number of steps
  let finished = false;
  for (let step = 0; step < maxSteps; step++) {
    const data = await chat(messages, tools);
    messages.push(data.message);

    // If there are no more tool calls, show what the model said and exit the loop!
    if (!data.message.tool_calls) {
      createP(data.message.content).parent(logDiv);
      finished = true;
      break;
    }

    // Run all of the tools
    for (let call of data.message.tool_calls) {
      let result;
      try {
        const tool = functions[call.function.name];
        result = tool(call.function.arguments);
      } catch (error) {
        result = 'Error: ' + error.message;
      }
      createP(call.function.name + ' ' + JSON.stringify(call.function.arguments)).parent(logDiv);
      messages.push({ role: 'tool', tool_name: call.function.name, content: result });
    }

    // Show the model its own drawing: the canvas as a base64 image
    const image = canvas.elt.toDataURL('image/png').split(',')[1];
    messages.push({
      role: 'user',
      content: 'This is the canvas now. Keep going, or describe the picture if it is finished.',
      images: [image],
    });
  }

  // Out of steps? Ask one last time, with no tools, so all it can do is describe
  if (!finished) {
    createP('Stopped at the limit of ' + maxSteps + ' steps.').parent(logDiv);
    messages.push({ role: 'user', content: 'You are out of steps. Describe the picture in one sentence.' });
    const data = await chat(messages, []);
    createP(data.message.content).parent(logDiv);
  }
}

// Send the conversation to Ollama (by way of server.js) and get the reply
async function chat(messages, tools) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: messages,
      tools: tools,
      stream: false,
      // Room for a few images in the conversation (the default can be as small as 4096 tokens)
      options: { num_ctx: 16384 },
    }),
  });
  return await response.json();
}
