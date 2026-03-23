# AI Chatbot Setup Guide

The AI tactical advisor has been successfully integrated into NUMORA! Follow these steps to enable it:

## Step 1: Get a Claude API Key

1. Go to [Anthropic Console](https://console.anthropic.com/account/keys)
2. Sign in with your Anthropic account (create one if needed)
3. Click "Create Key" to generate a new API key
4. Copy the key (starts with `sk-ant-`)

## Step 2: Configure the API Key

1. In the `frontend` directory, create a file named `.env.local`
2. Add this line to the file:
   ```
   VITE_CLAUDE_API_KEY=sk-ant-your-api-key-here
   ```
   (Replace `sk-ant-your-api-key-here` with your actual API key)

3. Save the file

**Security Note**: The `.env.local` file is gitignored and will never be committed to the repository.

## Step 3: Restart the Dev Server

1. Stop the current development server (Ctrl+C)
2. Start it again with `npm run dev`
3. The chatbot panel should now appear below the mission log in the center screen

## How to Use the AI Chatbot

### Basic Commands

The AI can understand natural language commands. Examples:

1. **Check mission status**: "What's the current mission status?"
2. **Command a drone**: "Have HUNTER-01 follow the mothership"
3. **Move mothership**: "Send the mothership to waypoint (100, 50)"
4. **Ask for recommendations**: "What should I do next?"

### Suggested Commands

When you ask the AI to perform an action, it will:
1. Summarize what it understood
2. Show a "SUGGESTED COMMAND" box with ✓ APPROVE or ✗ REJECT buttons
3. Click APPROVE to execute the command
4. Click REJECT to discard and try again with different wording

### Mission Summaries

The AI always includes:
- Current mothership state and position
- All drone statuses and positions
- Recent missions
- Pending commands
- Battery levels and timestamps

This ensures the AI understands your complete operational picture.

## Troubleshooting

**"API KEY NOT CONFIGURED" message**:
- Check that .env.local exists in the `frontend` directory
- Verify the key starts with `sk-ant-`
- Make sure you restarted the dev server after creating .env.local

**Commands not being recognized**:
- Be more specific about what you want (e.g., "Queue HUNTER-01 for surveillance at position (30, 40)")
- Ask clarifying questions if the AI responds with "Could you clarify..."
- Provide drone IDs and waypoint coordinates when applicable

**API timeout errors**:
- Check your internet connection
- Verify the API key is still valid
- Wait a moment and try again

## Features

✅ Natural language command understanding
✅ Automatic mission state summarization
✅ Command approval workflow (no accidental actions)
✅ Clarifying questions for ambiguous requests
✅ Real-time drone and mothership status context
✅ Chat history preserved during session

---

**Note**: Chat history is stored in your browser session and will reset when you reload the page. The AI has no memory of previous sessions.
