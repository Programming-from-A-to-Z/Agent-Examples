# Agent Examples

An agent is a language model with access to tools, that runs in a loop. The model makes its own decision as to whether to call a tool and which one to use. The tool's output is fed back into the conversation, and the model repeats the process, until it decides to stop (usually because it needs no more tools) or asks a human.

The examples in this repo include node.js code for the agentic loop and tool calls, connecting to LLMs with [Ollama](https://ollama.com/) via the [`ollama` JavaScript library](https://github.com/ollama/ollama-js).

1. Install dependencies.

```
npm install
```

2. Grab these two LLMs from Ollama (or pick your own, as long as they support [tool calls](https://ollama.com/search?c=tools)).

```
ollama pull qwen3
ollama pull gemma4
```

If your laptop has only 8 GB of memory, you could try `ollama pull gemma4:e2b-it-qat` instead. The model name is hard-coded at the top of every JS file with other options commented out.

```js
const model = 'qwen3';
// const model = 'gemma4';
// const model = 'qwen3.8:27b';
```

3. Run any of the examples:

```
node 1-agent.js
```

## How to build an agent

### Set up

```bash
mkdir my-agent
cd my-agent
npm init -y
npm install ollama
```

Make sure `package.json` has `"type": "module"`.

### Add an LLM

Create a JS file: `agent.js`

```js
import { Ollama } from 'ollama';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const model = 'qwen3';

const messages = [{ role: 'user', content: 'Roll a 20 sided dice for me.' }];

const response = await ollama.chat({ model: model, messages: messages });
console.log(response.message.content);
```

Now run the code.

```bash
node agent.js
```

The language model on its own can only generate text. It can't actually roll a die! Whatever it replies with is made up and not really random.

### Create a tool

A tool is a function that the model can ask to be executed. Before you create the `messages` array, add this code:

```js
// The tool's function itself
function rollDice(args) {
  return Math.floor(Math.random() * args.sides) + 1;
}

// The tools go into an array, reference the function name and include metadata like description, properties, etc.
const tools = [
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: 'Roll a dice and get a random number',
      parameters: {
        type: 'object',
        properties: {
          sides: { type: 'number', description: 'How many sides the dice has' },
        },
        required: ['sides'],
      },
    },
  },
];
```

Ollama's `chat()` function can accept the tools along with the messages and model.

```js
const response = await ollama.chat({ model: model, messages: messages, tools: tools });
console.log(response.message.tool_calls[0].function);
```

You should then see:

```text
{ index: 0, name: 'roll_dice', arguments: { sides: 20 } }
```

The model did not actually call the function yet. It just replied with the "tool call" itself: the name of a function and the arguments. It's up to us to write the code to call the function!

### Run the tool

The model asks for a tool by its name, which is a string: `'roll_dice'`. The code will then need to look up the corresponding function from that name. This can be done via a JavaScript object with key-value pairs.

```js
// Look up a function by its name
const functions = {
  roll_dice: rollDice,
};
```

```js
const response = await ollama.chat({ model: model, messages: messages, tools: tools });
messages.push(response.message);

// Find the function the model asked for
const call = response.message.tool_calls[0];
const tool = functions[call.function.name];
// Call that function with the arguments!
const result = tool(call.function.arguments);
console.log('Rolled:', result);

// Add that result to the conversation. Note there is a new role we haven't seen before: tool!
messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });

// Query the model again with the tool message included
const finalResponse = await ollama.chat({ model: model, messages: messages, tools: tools });
console.log(finalResponse.message.content);
```

That is a language model + a tool + a loop (the output of the tool feeds back into the model).

### Loops

While technically that one tool call is a loop, it's a very short one. Many tasks will require multiple steps each with queries and tool calls. This is an agentic loop: query the model, run the tools, add the results, query again, and so on and so forth. Loops of course need an exit condition (though it's interesting to think about an agent that never stops!). A typical way to stop a loop is when the model no longer requests a tool. Another option is human intervention.

Here's how it works with a second tool, a function called `add()`.

```js
function add(args) {
  return args.a + args.b;
}

// Look up a function by its name
const functions = {
  roll_dice: rollDice,
  add: add,
};
```

Add its description in the `tools` array (after `roll_dice`):

```js
  {
    type: 'function',
    function: {
      name: 'add',
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'The first number' },
          b: { type: 'number', description: 'The second number' },
        },
        required: ['a', 'b'],
      },
    },
  },
```

Finally replace the rest of the code with a new initial prompt and a `while (true)` loop. (You may want to also include a system prompt to help steer the model to call the right tools.)

```js
const messages = [
  { role: 'system', content: 'Use tools as many times as you need, one after another.' },
  { role: 'user', content: 'Roll a 6 sided dice and a 20 sided dice. Then add the two rolls together.' },
];

while (true) {
  // Query the model
  const response = await ollama.chat({ model: model, messages: messages, tools: tools });
  messages.push(response.message);

  // If there are no more tool calls, exit the loop!
  if (!response.message.tool_calls) {
    console.log(response.message.content);
    break;
  }

  // Run all of the tools
  for (let call of response.message.tool_calls) {
    const tool = functions[call.function.name];
    const result = tool(call.function.arguments);
    console.log(call.function.name, call.function.arguments, '->', result);

    // Add all tool results back into the conversation
    messages.push({ role: 'tool', tool_name: call.function.name, content: String(result) });
  }
}
```

### Starting the agent

The agent was initiated with a hard-coded prompt in the code above. But you could create a web interface (using an express server, there are examples in this repo that do that) or simply take a task from the command line when you run the node script.

```js
const task = process.argv[2] || 'Roll a 6 sided dice and a 20 sided dice. Then add the two rolls together.';

const messages = [
  { role: 'system', content: 'Use tools as many times as you need, one after another.' },
  { role: 'user', content: task },
];
```

```bash
node agent.js "Keep rolling a 6 sided die until you roll a three. How many rolls did it take?"
```

You can see the finished code in `1-agent.js`.

## Examples

There are 9 examples in this repo that build on top of `1-agent.js`.

- **1-agent.js** - Hello world agent: language model + tools + loop: `node 1-agent.js "your task"`
- **2-mcp-agent.js** - Same as `1-agent` but now the tools are hosted by an MCP server. The server code is here: [MCP-Server-Example](https://github.com/Programming-from-A-to-Z/MCP-Server-Example).
- **3-ask-a-human.js** - The agent asks questions when it needs information from you and saves its results to a file.
- **4-heartbeat.js** - An agent that runs autonomously and never stops. The agent runs once every minute, queries the weather, and writes in its diary (`workspace/diary.txt`). (It also reads what it wrote before each time).
- **5-paperclips** - a paperclip maximizer. The loop runs autonomously on a server and its results can be viewed on a webpage. Run `node server.js` then open `http://localhost:3002`.
- **6-drawing** - a p5.js sketch with tools that are drawing functions. The model sees the canvas after every step (requires a vision model like `gemma4` or `qwen3-vl`). Run `node server.js` then open `http://localhost:3001`.
- **7-discord** - an agent that lives in a Discord channel. Mention the bot and it calls tools to roll a die and react with an emoji. For debugging, it posts each tool call in the channel and its replies. Follow the [Discord Bot Examples](https://github.com/Programming-from-A-to-Z/Discord-Bot-Examples) setup: `npm install`, copy `env-sample` to `.env` and add your bot token and the id of the channel. Finally, run `node bot.js`.
- **8-email** - an agent that reads and replies to emails. It uses a dummy account. It can only reply to emails (not autonomously decide to send one), and as a safety-measure stops after 20 messages. Run `npm install`, copy `env-sample` to `.env`, add the account info, then run `node agent.js`. The password is a Google [app password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification), not the account's regular password. You can run `node check-login.js` to test if your `.env` is configured correctly. Ask me for the credentials for the shared class email if you want to try it without creating a new account.
- **9-browser-tool-call** - This is an agent that runs in the browser with transformers.js, no node.js and no Ollama. It's the same as `6-drawing` but doesn't work particularly well since the very small model gets confused and fails to call the tools.

## Ollama Server

The examples are set up to query Ollama on your local machine. However, you can use a separate Ollama server, by creating a `.env` file (duplicate `env-sample`) and including the server address. Then you can get the code to use that server with:

```
node --env-file=.env 1-agent.js
```

Note that `5-paperclips` or `6-drawing` are running in separate folders so you can either create a `.env` file there locally or run `node --env-file=../.env server.js`. The Discord and email examples already have their own `.env`, so you would just add `OLLAMA_HOST` there. To find out what models are available you can run `curl [OLLAMA HOST]/api/tags`.

## Some tips

- **Context length.** Check the context length in Ollama's settings. It may be set to something as little as 4,096 tokens. An agent's conversation that has many steps builds up a large context so you may need to raise the context length in the Ollama app's settings or by adding `options: { num_ctx: 16384 }` to `ollama.chat()`. For more: [Ollama Context length](https://docs.ollama.com/context-length).
- **Models.** Make sure your model [can call tools](https://ollama.com/search?c=tools).
- **Thinking.** `gemma4` and `qwen3` have "reasoning" capabilities. You can read their "thinking" with `response.message.thinking`. You can also add `think: false` to `ollama.chat()` which will speed them up (the paperclips example does this).
- **Ports.** Note the MCP server uses port 3000, the drawing agent 3001 and the paperclips 3002. These are arbitrary but you can only run one app on one port at a time.
- **Your agent can do whatever its tools can do!** Be specific and put limits on its access! Like it should only be able to read and write to a single folder, not your whole computer! For more, read [The lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) by Simon Willison.

## Resources

- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) by Anthropic
- [How to Build an Agent](https://ampcode.com/how-to-build-an-agent) by Thorsten Ball
- [Model Context Protocol](https://modelcontextprotocol.io)
