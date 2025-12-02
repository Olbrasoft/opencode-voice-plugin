import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

/**
 * Configuration for the TTS service
 */
interface TTSConfig {
  /** TTS API endpoint URL */
  apiUrl: string
  /** Can-speak check endpoint URL */
  canSpeakUrl: string
  /** Fallback shell script path */
  fallbackScript: string
  /** Whether to announce when session becomes idle */
  announceOnIdle: boolean
  /** Default idle announcement message */
  idleMessage: string
  /** SQLite database path for storing AI responses */
  dbPath: string
  /** Whether to store AI responses to database */
  storeAiResponses: boolean
}

/**
 * Default configuration
 */
const defaultConfig: TTSConfig = {
  apiUrl: "http://localhost:5555/api/speech/speak",
  canSpeakUrl: "http://localhost:5555/api/speech/can-speak",
  fallbackScript: "~/voice-assistant/voice-output/tts-api.sh",
  announceOnIdle: false,
  idleMessage: "Úkol dokončen.",
  dbPath: "/home/jirka/voice-assistant/voice-assistant.db",
  storeAiResponses: false, // DISABLED by default - must be explicitly enabled via OPENCODE_STORE_AI_RESPONSES=true
}

/**
 * Load configuration from environment or use defaults
 */
function loadConfig(): TTSConfig {
  return {
    apiUrl: process.env.OPENCODE_TTS_API_URL ?? defaultConfig.apiUrl,
    canSpeakUrl: process.env.OPENCODE_TTS_CAN_SPEAK_URL ?? defaultConfig.canSpeakUrl,
    fallbackScript: process.env.OPENCODE_TTS_FALLBACK_SCRIPT ?? defaultConfig.fallbackScript,
    announceOnIdle: process.env.OPENCODE_TTS_ANNOUNCE_IDLE === "true",
    idleMessage: process.env.OPENCODE_TTS_IDLE_MESSAGE ?? defaultConfig.idleMessage,
    dbPath: process.env.OPENCODE_DB_PATH ?? defaultConfig.dbPath,
    storeAiResponses: process.env.OPENCODE_STORE_AI_RESPONSES === "true", // Must be explicitly enabled
  }
}

/**
 * Check if we can speak (no active speech lock)
 */
async function canSpeak(config: TTSConfig): Promise<boolean> {
  try {
    const response = await fetch(config.canSpeakUrl, {
      method: "GET",
      signal: AbortSignal.timeout(1000), // 1 second timeout
    })
    
    if (response.ok) {
      const data = await response.json() as { canSpeak: boolean }
      return data.canSpeak
    }
    
    // On error, allow speaking (fail open)
    return true
  } catch (error) {
    // Network error or timeout - allow speaking (silent)
    return true
  }
}

/**
 * OpenCode Voice Plugin
 * 
 * Provides text-to-speech functionality for OpenCode through:
 * - A `speak` tool that the AI can call to speak text aloud
 * - Optional automatic announcements on session events
 * - Speech lock checking to prevent speaking while user is recording
 * - Automatic storage of AI responses to discussion database
 * 
 * @example
 * // The AI can use the speak tool like this:
 * // speak({ text: "Úkol byl dokončen." })
 */
export const VoicePlugin: Plugin = async ({ $, client }) => {
  const config = loadConfig()
  
  // Track which sessions we've already processed to avoid duplicates
  let lastProcessedMessageId: string | null = null

  /**
   * Speak text using the TTS API or fallback script
   */
  async function speak(text: string): Promise<boolean> {
    // Check if we can speak (user not recording)
    const allowed = await canSpeak(config)
    if (!allowed) {
      // Silent skip - no log output
      return true // Return success but don't speak
    }

    try {
      // Try HTTP API first
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })

      if (response.ok) {
        return true
      }

      // API failed, try fallback (silent)
    } catch (error) {
      // Network error, use fallback (silent)
    }

    // Fallback to shell script
    try {
      await $`${config.fallbackScript} ${text}`
      return true
    } catch (error) {
      // Fallback failed (silent)
      return false
    }
  }

  /**
   * Store AI response directly to SQLite database
   * Completely silent - no output to terminal ever
   */
  async function storeAiResponse(content: string): Promise<void> {
    if (!config.storeAiResponses || !content.trim()) {
      return
    }

    try {
      // Escape single quotes for SQL
      const escapedContent = content.replace(/'/g, "''")
      // Redirect stderr to /dev/null to prevent any terminal output
      await $`sqlite3 ${config.dbPath} "INSERT INTO AiResponses (Content) VALUES ('${escapedContent}');" 2>/dev/null`
    } catch {
      // Silent fail - no output to terminal
    }
  }

  /**
   * Extract text content from message parts
   */
  function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
    return parts
      .filter((part) => part.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n")
  }

  return {
    /**
     * Event handler for OpenCode events
     */
    event: async ({ event }) => {
      // Announce when session becomes idle (if enabled)
      if (event.type === "session.idle" && config.announceOnIdle) {
        await speak(config.idleMessage)
      }

      // Store AI response when session becomes idle (only if explicitly enabled)
      if (event.type === "session.idle" && config.storeAiResponses) {
        if (!client) {
          return
        }
        try {
          const sessionId = (event.properties as { sessionID: string }).sessionID
          const messagesResponse = await client.session.messages({
            path: { id: sessionId },
          })

          // Find the last assistant message
          const messages = messagesResponse.data ?? []
          const lastAssistantMessage = [...messages]
            .reverse()
            .find((m) => m.info.role === "assistant")

          if (lastAssistantMessage && lastAssistantMessage.info.id !== lastProcessedMessageId) {
            lastProcessedMessageId = lastAssistantMessage.info.id
            const textContent = extractTextFromParts(lastAssistantMessage.parts as Array<{ type: string; text?: string }>)
            if (textContent) {
              await storeAiResponse(textContent)
            }
          }
        } catch {
          // Silent fail - no output to terminal
        }
      }
    },

    /**
     * Custom tools provided by this plugin
     */
    tool: {
      /**
       * Speak text aloud using text-to-speech
       */
      speak: tool({
        description:
          "Speak text aloud using text-to-speech. Use this for voice confirmations, " +
          "task acknowledgments, and summaries. Text should be in Czech language, " +
          "natural and conversational. Keep it brief (1-3 sentences).",
        args: {
          text: tool.schema.string().describe("The text to speak aloud (Czech language preferred)"),
        },
        async execute(args) {
          const success = await speak(args.text)
          if (success) {
            return `„${args.text}"`
          } else {
            return `[TTS error] „${args.text}"`
          }
        },
      }),
    },
  }
}

// Default export for convenience
export default VoicePlugin
