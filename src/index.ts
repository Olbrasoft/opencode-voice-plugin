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
    // Network error or timeout - allow speaking
    console.warn("Could not check speech lock, allowing speech:", error)
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
 * 
 * @example
 * // The AI can use the speak tool like this:
 * // speak({ text: "Úkol byl dokončen." })
 */
export const VoicePlugin: Plugin = async ({ $ }) => {
  const config = loadConfig()

  /**
   * Speak text using the TTS API or fallback script
   */
  async function speak(text: string): Promise<boolean> {
    // Check if we can speak (user not recording)
    const allowed = await canSpeak(config)
    if (!allowed) {
      console.log("🔒 Speech locked (user recording), skipping TTS")
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

      // API failed, try fallback
      console.warn(`TTS API returned ${response.status}, using fallback script`)
    } catch (error) {
      // Network error, use fallback
      console.warn("TTS API unavailable, using fallback script:", error)
    }

    // Fallback to shell script
    try {
      await $`${config.fallbackScript} ${text}`
      return true
    } catch (error) {
      console.error("TTS fallback script failed:", error)
      return false
    }
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
