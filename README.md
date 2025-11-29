# OpenCode Voice Plugin

A plugin for [OpenCode](https://opencode.ai) that provides text-to-speech (TTS) functionality, allowing the AI assistant to speak responses aloud.

## Features

- **`speak` tool** - AI can call this tool to speak text aloud
- **Speech lock support** - Automatically checks if user is recording before speaking
- **HTTP API support** - Connects to any TTS server with a simple REST API
- **Fallback support** - Falls back to shell script if API is unavailable
- **Session events** - Optional automatic announcements on session completion
- **Configurable** - Customize via environment variables

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Olbrasoft/opencode-voice-plugin.git
cd opencode-voice-plugin
```

### 2. Install dependencies and build

```bash
npm install
npm run build
```

### 3. Link to OpenCode plugins directory

```bash
# Create plugin directory if it doesn't exist
mkdir -p ~/.config/opencode/plugin

# Create symlink
ln -s /path/to/opencode-voice-plugin/dist/index.js ~/.config/opencode/plugin/voice.js
```

### 4. Restart OpenCode

The plugin will be loaded automatically on next startup.

## Configuration

Configure the plugin using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_TTS_API_URL` | `http://localhost:5555/api/speech/speak` | TTS API endpoint |
| `OPENCODE_TTS_CAN_SPEAK_URL` | `http://localhost:5555/api/speech/can-speak` | Speech lock check endpoint |
| `OPENCODE_TTS_FALLBACK_SCRIPT` | `~/voice-assistant/voice-output/tts-api.sh` | Fallback shell script |
| `OPENCODE_TTS_ANNOUNCE_IDLE` | `false` | Announce when session becomes idle |
| `OPENCODE_TTS_IDLE_MESSAGE` | `Úkol dokončen.` | Message to speak on idle |

### Example: Using with EdgeTTS WebSocket Server

This plugin is designed to work with EdgeTTS WebSocket Server (part of VoiceAssistant project):

```bash
# Set your TTS API endpoint
export OPENCODE_TTS_API_URL="http://localhost:5555/api/speech/speak"
export OPENCODE_TTS_CAN_SPEAK_URL="http://localhost:5555/api/speech/can-speak"
```

### Example: Using with a shell script

If you prefer using a shell script for TTS:

```bash
# Point to your TTS script
export OPENCODE_TTS_FALLBACK_SCRIPT="/path/to/your/tts-script.sh"
```

## Usage

Once installed, the AI can use the `speak` tool to speak text aloud:

```
AI: I'll confirm this with voice output.
[Calls speak tool with: "Úkol byl úspěšně dokončen."]
```

### TTS API Contract

The plugin expects the TTS API to accept POST requests with JSON body:

```json
{
  "text": "Text to speak"
}
```

The API should return:
- `200 OK` on success
- Any other status code on failure (plugin will use fallback)

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

### Clean

```bash
npm run clean
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Related Projects

- [OpenCode](https://opencode.ai) - The AI coding assistant
- [EdgeTTS](https://github.com/rany2/edge-tts) - Microsoft Edge TTS Python library
