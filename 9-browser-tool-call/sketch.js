// A2Z F26
// Daniel Shiffman
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// This is an agent that runs in the browser with transformers.js, no node.js and no Ollama.
// It's the same as 6-drawing but doesn't work particularly well since the very small model
// gets confused and fails to call the tools. What it does show is every part of a tool call:
// 1. The descriptions of the tools are pasted into the prompt (look in the console)
// 2. The model replies with text: <tool_call>{"name": "draw_circle", "arguments": {...}}</tool_call>
// 3. The sketch finds that text, runs the function, and adds the result to the conversation
// 4. Repeat until the model replies without a tool call

let generator;
let promptInput;
let logDiv;

const systemPrompt =
  'You draw pictures on a 400 by 400 canvas by calling tools, one shape at a time. ' +
  'x goes from 0 (left) to 400 (right). y goes from 0 (top) to 400 (bottom). ' +
  'The background is black, so use bright colors. ' +
  'When the picture is finished, reply with one sentence describing it.';

// The tools are p5.js drawing functions
function drawCircle(args) {
  noStroke();
  fill(args.color);
  circle(args.x, args.y, args.size);
  return 'Drew a ' + args.color + ' circle at ' + args.x + ', ' + args.y;
}

function drawLine(args) {
  stroke(args.color);
  strokeWeight(4);
  line(args.x1, args.y1, args.x2, args.y2);
  return 'Drew a ' + args.color + ' line';
}

const functions = {
  draw_circle: drawCircle,
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
      name: 'draw_line',
      description: 'Draw a line between two points',
      parameters: {
        type: 'object',
        properties: {
          x1: { type: 'number', description: 'The x of the first point' },
          y1: { type: 'number', description: 'The y of the first point' },
          x2: { type: 'number', description: 'The x of the second point' },
          y2: { type: 'number', description: 'The y of the second point' },
          color: { type: 'string', description: 'A color name like white or yellow' },
        },
        required: ['x1', 'y1', 'x2', 'y2', 'color'],
      },
    },
  },
];

async function setup() {
  createCanvas(400, 400);
  background(0);

  promptInput = createInput('Draw a snowman.');
  let goButton = createButton('Go');
  goButton.mousePressed(runAgent);
  logDiv = createDiv('Loading the model...');

  // Load Transformers.js and Qwen3, a model that was trained to call tools.
  // This is the smallest one. The 1.7B is better at it but needs a lot more memory.
  let { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2');
  let options = { device: 'webgpu', dtype: 'q4f16' };
  generator = await pipeline('text-generation', 'onnx-community/Qwen3-0.6B-ONNX', options);
  // generator = await pipeline('text-generation', 'onnx-community/Qwen3-1.7B-ONNX', options);
  logDiv.html('Ready!');
}

async function runAgent() {
  background(0);
  logDiv.html('');

  let messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptInput.value() },
  ];

  // What the model really receives: the messages AND the tools as one long string.
  // Open the console to read it.
  let prompt = generator.tokenizer.apply_chat_template(messages, {
    tools: tools,
    tokenize: false,
    add_generation_prompt: true,
    enable_thinking: false,
  });
  console.log(prompt);

  // The agent loop, with a limit of 8 steps
  for (let i = 0; i < 8; i++) {
    let output = await generator(messages, {
      tools: tools,
      max_new_tokens: 1000,
      do_sample: true,
      // No "thinking"!
      tokenizer_encode_kwargs: { enable_thinking: false },
    });

    // The reply is just text
    let reply = output[0].generated_text.at(-1).content;
    messages.push({ role: 'assistant', content: reply });
    addToLog('model', reply);

    // Use a regular expression to find every <tool_call>...</tool_call> in the reply
    let calls = reply.match(/<tool_call>[\s\S]*?<\/tool_call>/g);

    // If there are no more tool calls, exit the loop!
    if (!calls) {
      break;
    }

    for (let txt of calls) {
      // Remove the tags, turn the JSON text into an object, and run the function.
      // If the model made a typo, the error message is the result and it can try again.
      let result;
      try {
        let call = JSON.parse(txt.replace('<tool_call>', '').replace('</tool_call>', ''));
        let tool = functions[call.name];
        result = tool(call.arguments);
      } catch (error) {
        result = 'Error: ' + error.message;
      }
      addToLog('tool', result);

      // Add all tool results back into the conversation
      messages.push({ role: 'tool', content: result });
    }
  }
}

// Add one piece of the conversation to the page
function addToLog(who, content) {
  let p = createP('');
  p.class(who);
  p.parent(logDiv);
  // textContent shows tags like <tool_call> as text
  p.elt.textContent = who + ': ' + content;
}
